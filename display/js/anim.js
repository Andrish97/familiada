export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Animator pracuje na obszarze kafli (tile = 5x7 kropek).
 * snapArea() zwraca dla każdego tile w obszarze: [7][5] kolorów (string fill).
 *
 * Animacje:
 * - edge   (kaflami):   inEdge / outEdge
 * - matrix (wipe):      inMatrix / outMatrix
 * - rain   (pikselami): inRain / outRain (alias: inMatrixRain / outMatrixRain)
 *
 * Ważne:
 * - dotOff MUSI być przekazane (kolor wygaszonych kropek), inaczej rain nie wie co jest OFF.
 */
export const createAnimator = ({ tileAt, snapArea, clearArea, clearTileAt, dotOff }) => {
  const OFF = (dotOff ?? "#2e2e32").toString();

  // -----------------------------
  // Helpers
  // -----------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // (szybciej niż [...Array(n).keys()])
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

  // Buduje listę kropek w obszarze na podstawie snapshotu.
  // gx/gy to globalna pozycja w siatce kropek (w obrębie obszaru, nie px).
  const buildDotsFromSnap = (big, area, snap) => {
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
              gx: tx * 5 + cc,
              gy: ty * 7 + rr,
            });
          }
        }
      }
    }
    return { dots, tilesW, tilesH };
  };

  // -----------------------------
  // RAIN (pikselami) — rozsypane, lane losują strony
  // -----------------------------
  const runRain = async ({
    big,
    area,
    axis = "down",   // down/up/left/right (tylko jako “bias”)
    stepMs = 24,
    density = 0.12,  // 0..1: ile kropek w paczce (mniej = bardziej “porcjami”)
    scatter = 1.0,   // 0..2: chaos w kolejności (więcej = bardziej rozsypane)
    mode = "in",     // "in" | "out"
  } = {}) => {
    const { c1, r1, c2, r2 } = area;

    // Snapshot docelowy (dla IN), oraz baza do listy kropek
    const snap = snapArea(big, c1, r1, c2, r2);

    // IN: czyścimy przed startem
    if (mode === "in") clearArea(big, c1, r1, c2, r2);

    const { dots, tilesW, tilesH } = buildDotsFromSnap(big, area, snap);
    if (!dots.length) return;

    // Rozmiar obszaru w “kropkach”
    const W = tilesW * 5;
    const H = tilesH * 7;

    // Filtr: żeby nie było “mrugania dookoła tekstu”
    // IN: animujemy tylko te kropki, które docelowo mają świecić
    // OUT: animujemy tylko te, które aktualnie świecą
    let work = dots;
    if (mode === "in") {
      work = dots.filter(d => d.targetFill !== OFF);
    } else {
      work = dots.filter(d => (d.el.getAttribute("fill") ?? OFF) !== OFF);
    }
    if (!work.length) return;

    // Lane mix:
    // - jeśli animacja “pionowa”: lane = kolumny (gx)
    // - jeśli “pozioma”:        lane = wiersze (gy)
    const vertical = (axis === "down" || axis === "up");
    const laneCount = vertical ? W : H;
    const spanMain = vertical ? H : W; // długość lane

    // Każda lane losuje swój “start” (raz z jednej, raz z drugiej strony)
    const laneDir = new Array(laneCount);
    for (let i = 0; i < laneCount; i++) laneDir[i] = Math.random() < 0.5;

    // “Bias” stron (delikatny) — ale lane i tak losują, więc nie będzie startu z jednej krawędzi
    const axisBias = (() => {
      if (axis === "down")  return 0.10;
      if (axis === "up")    return 0.10;
      if (axis === "left")  return 0.10;
      if (axis === "right") return 0.10;
      return 0.10;
    })();

    // Sort: lane + pozycja w lane + chaos
    const noiseMain = spanMain * (0.85 * scatter);
    const noiseLane = laneCount * (0.25 * scatter);

    work.sort((a, b) => {
      const la = vertical ? a.gx : a.gy;
      const lb = vertical ? b.gx : b.gy;

      const pa = vertical ? a.gy : a.gx;
      const pb = vertical ? b.gy : b.gx;

      // kierunek lane: losowy, ale lekko “podkręcony” przez axis
      const da = laneDir[la];
      const db = laneDir[lb];

      const baseA = (da ? pa : (spanMain - 1 - pa));
      const baseB = (db ? pb : (spanMain - 1 - pb));

      // chaos
      const ka = baseA + (Math.random() - 0.5) * noiseMain;
      const kb = baseB + (Math.random() - 0.5) * noiseMain;

      // lane też trochę mieszamy, żeby nie robić pasów
      const laneA = la + (Math.random() - 0.5) * noiseLane;
      const laneB = lb + (Math.random() - 0.5) * noiseLane;

      // mikro-bias, żeby nadal “czuć” oś (ale nie psuć rozproszenia)
      const bias = (Math.random() - 0.5) * axisBias;

      return (laneA + ka / spanMain + bias) - (laneB + kb / spanMain + bias);
    });

    if (mode === "out") work.reverse();

    const total = work.length;
    const batch = clamp(Math.floor(total * density), 40, 900);

    for (let i = 0; i < total; i += batch) {
      const end = Math.min(total, i + batch);

      if (mode === "in") {
        for (let k = i; k < end; k++) {
          const d = work[k];
          d.el.setAttribute("fill", d.targetFill);
        }
      } else {
        for (let k = i; k < end; k++) {
          const d = work[k];
          d.el.setAttribute("fill", OFF);
        }
      }

      if (stepMs) await sleep(stepMs);
    }

    // FINAL PASS — zero “niedopalonych”
    if (mode === "in") {
      for (const d of dots) d.el.setAttribute("fill", d.targetFill);
    } else {
      for (const d of work) d.el.setAttribute("fill", OFF);
    }
  };

  // -----------------------------
  // Public API
  // -----------------------------
  return {
    // EDGE (kaflami)
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

    // MATRIX (wipe kaflami)
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

    // RAIN
    async inRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.12,
        scatter: opts.scatter ?? 1.2,
        mode: "in",
      });
    },

    async outRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.12,
        scatter: opts.scatter ?? 1.2,
        mode: "out",
      });
    },

    // aliasy
    async inMatrixRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.12,
        scatter: opts.scatter ?? 1.2,
        mode: "in",
      });
    },

    async outMatrixRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.12,
        scatter: opts.scatter ?? 1.2,
        mode: "out",
      });
    },
  };
};
