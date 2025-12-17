export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Animator pracuje na obszarze kafli (tile = 5x7 kropek).
 * snapArea() zwraca dla każdego tile w obszarze: [7][5] kolorów (string fill).
 *
 * Wspierane animacje:
 * - edge (kaflami): inEdge/outEdge
 * - matrix (wipe kaflami): inMatrix/outMatrix
 * - rain (pikselami, efekt Matrix): inRain/outRain (alias inMatrixRain/outMatrixRain)
 */
export const createAnimator = ({ tileAt, snapArea, clearArea, clearTileAt }) => {
  // -----------------------------
  // Helpers
  // -----------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const getAreaWH = (area) => {
    const W = area.c2 - area.c1 + 1;
    const H = area.r2 - area.r1 + 1;
    return { W, H };
  };

  // (szybciej niż tworzyć tablice [...Array(n).keys()])
  const range = (n) => {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = i;
    return out;
  };

  const setTileFromSnap = (big, c1, r1, tx, ty, snapTile) => {
    if (!snapTile) return;
    const t = tileAt(big, c1 + tx, r1 + ty);
    if (!t) return;
    for (let rr = 0; rr < 7; rr++) {
      for (let cc = 0; cc < 5; cc++) {
        t.dots[rr][cc].setAttribute("fill", snapTile[rr][cc]);
      }
    }
  };

  // Buduje listę "pikseli" w obszarze (pojedyncze kropki).
  // Każdy element: { el, targetFill, gx, gy } gdzie gx/gy to współrzędne globalne w siatce "kropelek"
  // gx,gy liczone w jednostkach "kropka" w obrębie obszaru, nie w px SVG.
  const buildDotList = (big, area, snap) => {
    const { c1, r1, c2, r2 } = area;
    const tilesW = c2 - c1 + 1;
    const tilesH = r2 - r1 + 1;

    const dots = [];
    for (let ty = 0; ty < tilesH; ty++) {
      for (let tx = 0; tx < tilesW; tx++) {
        const t = tileAt(big, c1 + tx, r1 + ty);
        const data = snap?.[ty]?.[tx];
        if (!t || !data) continue;

        for (let rr = 0; rr < 7; rr++) {
          for (let cc = 0; cc < 5; cc++) {
            dots.push({
              el: t.dots[rr][cc],
              targetFill: data[rr][cc],
              // globalna pozycja "kropki" w obrębie obszaru
              gx: tx * 5 + cc,
              gy: ty * 7 + rr,
            });
          }
        }
      }
    }
    return dots;
  };

  // Klucz sortowania dla kierunku (oś animacji) + szum
  const axisKey = (d, axis, maxGX, maxGY) => {
    switch (axis) {
      case "down":  return d.gy;                 // góra -> dół
      case "up":    return maxGY - d.gy;         // dół -> góra
      case "right": return d.gx;                 // lewo -> prawo
      case "left":  return maxGX - d.gx;         // prawo -> lewo
      default:      return d.gy;
    }
  };

  // Matrix Rain: piksele “przylatują/odlatują” w kierunku axis, z losowym jitterem.
  // reveal/hide w “pakietach” (batch), żeby wyglądało jak cyfrowy deszcz.
  const runRain = async ({
  big,
  area,
  axis = "down",
  stepMs = 40,
  density = 0.18,   // ile pikseli ujawniamy na krok (0..1)
  jitter = 0.45,    // losowy szum w kolejności wewnątrz pasa (0..1)
  mode = "in",      // "in" lub "out"
  offFill = "#2e2e32",
}) => {
  const { c1, r1, c2, r2 } = area;

  // snapshot docelowego obrazu (IN) albo bieżącego (OUT)
  const snap = snapArea(big, c1, r1, c2, r2);

  // IN: zaczynamy od czystego obszaru
  if (mode === "in") clearArea(big, c1, r1, c2, r2);

  const dots = buildDotList(big, area, snap);
  if (!dots.length) return;

  // rozmiary w siatce kropek
  let maxGX = 0, maxGY = 0;
  for (const d of dots) { if (d.gx > maxGX) maxGX = d.gx; if (d.gy > maxGY) maxGY = d.gy; }
  const W = maxGX + 1;
  const H = maxGY + 1;

  // Czy robimy pasy jako ROWS czy COLS?
  // - jeśli axis jest pionowy (down/up) => pasy to KOLUMNY (gx)
  // - jeśli axis jest poziomy (left/right) => pasy to RZĘDY (gy)
  const vertical = (axis === "down" || axis === "up");
  const stripeCount = vertical ? W : H;

  // Grupowanie kropek do pasów
  const stripes = Array.from({ length: stripeCount }, () => []);
  for (const d of dots) {
    const idx = vertical ? d.gx : d.gy;
    stripes[idx].push(d);
  }

  // Każdy pas losuje stronę startu (mix sides)
  // pionowo: każda kolumna losuje "up" albo "down"
  // poziomo: każdy rząd losuje "left" albo "right"
  const stripeDir = stripes.map(() => {
    if (vertical) return (Math.random() < 0.5 ? "up" : "down");
    return (Math.random() < 0.5 ? "left" : "right");
  });

  // Sortowanie wewnątrz pasa: od strony startu + trochę szumu
  const jX = W * jitter;
  const jY = H * jitter;

  for (let i = 0; i < stripes.length; i++) {
    const dir = stripeDir[i];
    const arr = stripes[i];

    arr.sort((a, b) => {
      let ka = 0, kb = 0;

      if (dir === "down") { ka = a.gy; kb = b.gy; }
      else if (dir === "up") { ka = (H - 1 - a.gy); kb = (H - 1 - b.gy); }
      else if (dir === "right") { ka = a.gx; kb = b.gx; }
      else if (dir === "left") { ka = (W - 1 - a.gx); kb = (W - 1 - b.gx); }

      // szum, żeby nie było „laserowego” frontu
      const noiseA = (Math.random() - 0.5) * (vertical ? jY : jX);
      const noiseB = (Math.random() - 0.5) * (vertical ? jY : jX);
      return (ka + noiseA) - (kb + noiseB);
    });

    // OUT: odwracamy, żeby „odlatywało” (ale nadal zgodnie z wylosowaną stroną pasa)
    if (mode === "out") arr.reverse();
  }

  // Zlecamy ujawnianie porcjami:
  // zamiast jednego wspólnego sortu, robimy round-robin po pasach,
  // żeby faktycznie wyglądało jak „wjeżdżają” różne pasy naraz.
  const total = dots.length;
  const batch = clamp(Math.floor(total * density), 40, 1200);

  // indeksy postępu dla każdego pasa
  const pos = stripes.map(() => 0);

  let done = 0;
  while (done < total) {
    let wrote = 0;

    // losowa kolejność pasów w tym kroku (żeby nie było „równo”)
    const order = range(stripes.length);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    for (const si of order) {
      const arr = stripes[si];
      let p = pos[si];
      if (p >= arr.length) continue;

      // ile z tego pasa bierzemy w tym kroku
      // (mniej więcej równomiernie, ale z losowym dodatkiem)
      const want = Math.max(1, Math.floor(batch / stripes.length) + Math.floor(Math.random() * 8));

      const end = Math.min(arr.length, p + want);
      for (let k = p; k < end; k++) {
        const d = arr[k];
        if (mode === "in") d.el.setAttribute("fill", d.targetFill);
        else d.el.setAttribute("fill", offFill);
        wrote++;
        done++;
        if (wrote >= batch) break;
      }
      pos[si] = end;
      if (wrote >= batch) break;
    }

    if (stepMs) await sleep(stepMs);
  }
};
  
  // -----------------------------
  // Public API
  // -----------------------------
  return {
    // -----------------------------
    // EDGE (kaflami) – domyślnie wolniej
    // -----------------------------
    async inEdge(big, area, dir = "left", stepMs = 12) {
      const { c1, r1, c2, r2 } = area;
      const snap = snapArea(big, c1, r1, c2, r2);
      clearArea(big, c1, r1, c2, r2);

      const W = c2 - c1 + 1, H = r2 - r1 + 1;
      const coords = [];

      if (dir === "left")       for (let x = 0; x < W; x++)     for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "right") for (let x = W - 1; x >= 0; x--) for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "top")   for (let y = 0; y < H; y++)     for (let x = 0; x < W; x++) coords.push([x, y]);
      else                      for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) coords.push([x, y]);

      for (const [tx, ty] of coords) {
        setTileFromSnap(big, c1, r1, tx, ty, snap[ty][tx]);
        if (stepMs) await sleep(stepMs);
      }
    },

    async outEdge(big, area, dir = "left", stepMs = 12) {
      const { c1, r1, c2, r2 } = area;
      const W = c2 - c1 + 1, H = r2 - r1 + 1;
      const coords = [];

      if (dir === "left")       for (let x = 0; x < W; x++)     for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "right") for (let x = W - 1; x >= 0; x--) for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "top")   for (let y = 0; y < H; y++)     for (let x = 0; x < W; x++) coords.push([x, y]);
      else                      for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) coords.push([x, y]);

      for (const [tx, ty] of coords) {
        clearTileAt(big, c1 + tx, r1 + ty);
        if (stepMs) await sleep(stepMs);
      }
    },

    // -----------------------------
    // MATRIX (wipe kaflami) – domyślnie wolniej
    // -----------------------------
    async inMatrix(big, area, axis = "down", stepMs = 36) {
      const { c1, r1, c2, r2 } = area;
      const snap = snapArea(big, c1, r1, c2, r2);
      clearArea(big, c1, r1, c2, r2);

      const W = c2 - c1 + 1, H = r2 - r1 + 1;

      if (axis === "down" || axis === "up") {
        const ys = axis === "down" ? range(H) : range(H).reverse();
        for (const y of ys) {
          for (let x = 0; x < W; x++) setTileFromSnap(big, c1, r1, x, y, snap[y][x]);
          if (stepMs) await sleep(stepMs);
        }
      } else {
        const xs = axis === "right" ? range(W) : range(W).reverse();
        for (const x of xs) {
          for (let y = 0; y < H; y++) setTileFromSnap(big, c1, r1, x, y, snap[y][x]);
          if (stepMs) await sleep(stepMs);
        }
      }
    },

    async outMatrix(big, area, axis = "down", stepMs = 36) {
      const { c1, r1, c2, r2 } = area;
      const W = c2 - c1 + 1, H = r2 - r1 + 1;

      if (axis === "down" || axis === "up") {
        const ys = axis === "down" ? range(H) : range(H).reverse();
        for (const y of ys) {
          for (let x = 0; x < W; x++) clearTileAt(big, c1 + x, r1 + y);
          if (stepMs) await sleep(stepMs);
        }
      } else {
        const xs = axis === "right" ? range(W) : range(W).reverse();
        for (const x of xs) {
          for (let y = 0; y < H; y++) clearTileAt(big, c1 + x, r1 + y);
          if (stepMs) await sleep(stepMs);
        }
      }
    },

    // -----------------------------
    // MATRIX RAIN (pikselami) – “jak w Matrix”
    // Komendy w API: type = "rain" albo "matrix_rain"
    // axis: up/down/left/right
    // stepMs: przerwa między paczkami pikseli
    // density: ile pikseli w paczce (0..1)
    // jitter: losowy chaos kolejności (0..1)
    // -----------------------------
    async inRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.18,
        jitter: opts.jitter ?? 0.65,
        mode: "in",
      });
    },

    async outRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.18,
        jitter: opts.jitter ?? 0.65,
        mode: "out",
      });
    },

    // aliasy pod nazwę “matrix_rain”
    async inMatrixRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.18,
        jitter: opts.jitter ?? 0.65,
        mode: "in",
      });
    },

    async outMatrixRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.18,
        jitter: opts.jitter ?? 0.65,
        mode: "out",
      });
    },
  };
};
