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
  stepMs = 24,

  // ile „porcji” na jeden krok — więcej = więcej dzieje się naraz
  bursts = 6,

  // gęstość w porcji (0..1) => ile pikseli łapiemy w jednym kroku
  density = 0.08,

  // szansa na migotnięcie zanim piksel trafi na finalny kolor (0..1)
  flicker = 0.25,

  // długość ogona (ile wcześniejszych kroków zostaje „włączonych”)
  trail = 2,

  // chaos w kolejności (0..1.5) – im więcej tym bardziej rozproszone
  jitter = 1.2,

  mode = "in", // "in" | "out"
} = {}) => {
  const { c1, r1, c2, r2 } = area;

  const snap = snapArea(big, c1, r1, c2, r2);
  if (mode === "in") clearArea(big, c1, r1, c2, r2);

  const dots = buildDotList(big, area, snap);
  if (!dots.length) return;

  // wyznacz maxGX/maxGY
  let maxGX = 0, maxGY = 0;
  for (const d of dots) { if (d.gx > maxGX) maxGX = d.gx; if (d.gy > maxGY) maxGY = d.gy; }

  const isH = (axis === "left" || axis === "right");
  const span = isH ? (maxGX + 1) : (maxGY + 1);

  const axisKeyLocal = (d, ax) => {
    switch (ax) {
      case "down":  return d.gy;
      case "up":    return maxGY - d.gy;
      case "right": return d.gx;
      case "left":  return maxGX - d.gx;
      default:      return d.gy;
    }
  };

  // robimy kilka „pasów” = strumieni równolegle
  // każdy pas losuje stronę (odwraca oś) => „pojawia się z różnych stron”
  const passes = bursts;
  const lanes = Array.from({ length: passes }, () => []);

  // przypisz piksele do pasów (round-robin po losowym shuffle)
  // UWAGA: stabilny shuffle, nie random w sort comparatorze
  for (let i = dots.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [dots[i], dots[j]] = [dots[j], dots[i]];
  }
  for (let i = 0; i < dots.length; i++) lanes[i % passes].push(dots[i]);

  // przygotuj dla każdego pasa: kierunek (czasem odwrócony) + kolejność „prawie kierunkowa”
  const laneDirs = lanes.map(() => {
    // losowo odwróć kierunek dla danego pasa
    if (axis === "down")  return (Math.random() < 0.5 ? "down"  : "up");
    if (axis === "up")    return (Math.random() < 0.5 ? "up"    : "down");
    if (axis === "left")  return (Math.random() < 0.5 ? "left"  : "right");
    if (axis === "right") return (Math.random() < 0.5 ? "right" : "left");
    return axis;
  });

  // sort w pasie: kierunek + jitter w „oknach”
  const shuffleRange = (arr, a, b) => {
    for (let i = b - 1; i > a; i--) {
      const j = a + ((Math.random() * (i - a + 1)) | 0);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  for (let p = 0; p < passes; p++) {
    const ax = laneDirs[p];
    const arr = lanes[p];

    arr.sort((a, b) => axisKeyLocal(a, ax) - axisKeyLocal(b, ax));

    const win = Math.max(40, Math.floor(span * jitter));
    for (let i = 0; i < arr.length; i += win) {
      shuffleRange(arr, i, Math.min(arr.length, i + win));
    }

    if (mode === "out") arr.reverse();
  }

  // batch w jednym kroku na każdy pas
  const total = dots.length;
  const batch = Math.max(20, Math.floor(total * density));

  // wskaźniki postępu dla pasów
  const idx = new Array(passes).fill(0);

  // ile kroków? bierzemy maksymalny postęp pasa
  const maxLen = Math.max(...lanes.map(a => a.length));

  for (let step = 0; step < maxLen; step += batch) {
    // w jednym kroku obsługujemy wszystkie pasy => „więcej naraz”
    for (let p = 0; p < passes; p++) {
      const arr = lanes[p];
      const i0 = idx[p];
      if (i0 >= arr.length) continue;

      const i1 = Math.min(arr.length, i0 + batch);

      // „ogon”: dodatkowo doświetl kilka wcześniejszych porcji
      const t0 = Math.max(0, i0 - trail * batch);
      const t1 = i1;

      if (mode === "in") {
        for (let k = t0; k < t1; k++) {
          const d = arr[k];
          // flicker: chwilowe błyski
          if (k >= i0 && Math.random() < flicker) {
            d.el.setAttribute("fill", "#ffffff"); // szybki błysk
          } else {
            d.el.setAttribute("fill", d.targetFill);
          }
        }
      } else {
        for (let k = t0; k < t1; k++) {
          arr[k].el.setAttribute("fill", "#2e2e32");
        }
      }

      idx[p] = i1;
    }

    if (stepMs) await sleep(stepMs);
  }

  // twardy commit: koniec zawsze 100% poprawny
  if (mode === "in") {
    for (const d of dots) d.el.setAttribute("fill", d.targetFill);
  } else {
    for (const d of dots) d.el.setAttribute("fill", "#2e2e32");
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
