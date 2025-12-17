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
    const H = area.r2 - area.r1 + 1.Qt;
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
    density = 0.18,     // ile pikseli na “krok” (0..1)
    jitter = 0.65,      // ilość losowego szumu w kolejności (0..1)
    mode = "in",        // "in" lub "out"
  }) => {
    const { c1, r1, c2, r2 } = area;

    // snapshot docelowego obrazu (dla IN), albo aktualnego (dla OUT też nam się przydaje, bo snapshot bierze fill)
    const snap = snapArea(big, c1, r1, c2, r2);

    // IN: czyścimy obszar zanim zaczniemy ujawniać
    if (mode === "in") clearArea(big, c1, r1, c2, r2);

    const dots = buildDotList(big, area, snap);
    if (!dots.length) return;

    // maxGX/maxGY do odwrócenia osi
    let maxGX = 0, maxGY = 0;
    for (const d of dots) { if (d.gx > maxGX) maxGX = d.gx; if (d.gy > maxGY) maxGY = d.gy; }

    // kolejność: axisKey + szum
    // jitter działa tak: do axisKey dodajemy losowy offset proporcjonalny do rozmiaru.
    const span = (axis === "left" || axis === "right") ? (maxGX + 1) : (maxGY + 1);
    const jSpan = span * jitter;

    dots.sort((a, b) => {
      const ka = axisKey(a, axis, maxGX, maxGY) + (Math.random() - 0.5) * jSpan;
      const kb = axisKey(b, axis, maxGX, maxGY) + (Math.random() - 0.5) * jSpan;
      return ka - kb;
    });

    // OUT: odwróć kolejność (żeby “odlatywało” w ten sam kierunek)
    if (mode === "out") dots.reverse();

    // batch size = density * total, ale minimum sensowne
    const total = dots.length;
    const batch = clamp(Math.floor(total * density), 40, 800); // limity dla płynności

    // Każdy krok: zmieniamy fill dla paczki kropek
    for (let i = 0; i < total; i += batch) {
      const end = Math.min(total, i + batch);

      if (mode === "in") {
        for (let k = i; k < end; k++) {
          const d = dots[k];
          d.el.setAttribute("fill", d.targetFill);
        }
      } else {
        for (let k = i; k < end; k++) {
          const d = dots[k];
          // “wyłącz” piksel -> off jest w snap jako kolor wygaszenia?
          // My czyścimy do dotOff przez clearTileAt, ale tu operujemy na pojedynczych kropkach,
          // więc bierzemy fill z pierwszego snapshotu tła? Najprościej: ustawimy na to,
          // co zwykle jest "off" (kolor wygaszenia) w scenie — snapshot już to ma w data.
          // Jeśli chcesz absolutnie “ciemno” niezależnie od startu, to najpierw clearArea() i potem OUT bez sensu.
          // Dla OUT przyjmujemy: "odlatuje" -> robi się off, czyli najczęściej "#2e2e32".
          d.el.setAttribute("fill", "#2e2e32");
        }
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
