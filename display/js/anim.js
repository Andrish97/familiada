export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Animator pracuje na obszarze kafli (tile = 5x7 kropek).
 * snapArea() zwraca dla każdego tile w obszarze: [7][5] kolorów (string fill).
 *
 * Wspierane animacje:
 * - edge   (kaflami):  inEdge/outEdge
 * - matrix (wipe):     inMatrix/outMatrix
 * - rain   (pikselami): inRain/outRain (dwustronnie: do środka / od środka)
 *
 * UWAGA: przekaż dotOff z scene.js:
 *   const anim = createAnimator({ tileAt, snapArea, clearArea, clearTileAt, dotOff: COLORS.dotOff });
 */
export const createAnimator = ({ tileAt, snapArea, clearArea, clearTileAt, dotOff }) => {
  // -----------------------------
  // Helpers
  // -----------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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

  // Z snapshotu budujemy listę wszystkich kropek w area
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
              gx: tx * 5 + cc, // global w obrębie area (w jednostkach kropek)
              gy: ty * 7 + rr,
            });
          }
        }
      }
    }
    return dots;
  };

  // -----------------------------
  // RAIN (dwustronny wipe pikselami)
  // -----------------------------
  const runRain = async ({
    big,
    area,
    axis = "down",      // down/up = pion, left/right = poziom
    stepMs = 24,        // przerwa między paczkami
    density = 0.10,     // 0..1: ile kropek na paczkę (więcej = grubsze porcje)
    scatter = 1.25,     // >=0: jak mocno “rozsypać” kolejność
    mode = "in",        // "in" | "out"
  } = {}) => {
    if (!dotOff) throw new Error("Animator: dotOff is required (pass dotOff from scene COLORS.dotOff).");

    const { c1, r1, c2, r2 } = area;

    // snapshot “docelowego obrazu”
    const snap = snapArea(big, c1, r1, c2, r2);

    // IN: czyścimy zanim zaczniemy ujawniać
    if (mode === "in") clearArea(big, c1, r1, c2, r2);

    const dotsAll = buildDotsFromSnap(big, area, snap);
    if (!dotsAll.length) return;

    // Pracujemy tylko na tych, które mają sens:
    // IN: tylko docelowo świecące (żeby nie “mrugało dookoła”)
    // OUT: tylko aktualnie świecące (żeby było co gasić)
    let work = [];
    if (mode === "in") {
      work = dotsAll.filter(d => d.targetFill !== dotOff);
    } else {
      work = dotsAll.filter(d => (d.el.getAttribute("fill") || dotOff) !== dotOff);
    }
    if (!work.length) {
      // i tak final pass (dla pewności)
      if (mode === "in") for (const d of dotsAll) d.el.setAttribute("fill", d.targetFill);
      return;
    }

    // Rozmiar obszaru w “kropkach”
    const tilesW = c2 - c1 + 1;
    const tilesH = r2 - r1 + 1;
    const W = tilesW * 5;
    const H = tilesH * 7;

    // Orientacja: pion vs poziom
    const vertical = (axis === "down" || axis === "up");
    const spanMain = vertical ? H : W; // długość “wycierania”
    const spanLane = vertical ? W : H; // ilość lane (żeby nie robiło pasów)

    // ring = odległość od najbliższej krawędzi w osi głównej
    const ring = (pos) => Math.min(pos, (spanMain - 1 - pos));

    // Szumy: rozbijają idealne “pierścienie”, ale nie psują symetrii dwóch stron
    const noiseMain = spanMain * 0.55 * scatter;
    const noiseLane = spanLane * 0.25 * scatter;

    // Sort: IN = krawędzie -> środek, OUT = odwrotnie (przez reverse)
    work.sort((a, b) => {
      const posA  = vertical ? a.gy : a.gx;
      const posB  = vertical ? b.gy : b.gx;

      const laneA = vertical ? a.gx : a.gy;
      const laneB = vertical ? b.gx : b.gy;

      const keyA = ring(posA) + (Math.random() - 0.5) * noiseMain;
      const keyB = ring(posB) + (Math.random() - 0.5) * noiseMain;

      const laneKeyA = laneA + (Math.random() - 0.5) * noiseLane;
      const laneKeyB = laneB + (Math.random() - 0.5) * noiseLane;

      return (keyA + laneKeyA / spanLane) - (keyB + laneKeyB / spanLane);
    });

    if (mode === "out") work.reverse();

    // batch size
    const total = work.length;
    const batch = clamp(Math.floor(total * density), 80, 1600);

    // porcje
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
          d.el.setAttribute("fill", dotOff);
        }
      }

      if (stepMs) await sleep(stepMs);
    }

    // FINAL PASS: żadnych “niedopalonych”
    if (mode === "in") {
      for (const d of dotsAll) d.el.setAttribute("fill", d.targetFill);
    }
  };

  // -----------------------------
  // Public API
  // -----------------------------
  return {
    // -----------------------------
    // EDGE (kaflami)
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
    // MATRIX (wipe kaflami)
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
    // RAIN (dwustronny wipe pikselami)
    // axis: down/up = pion, left/right = poziom
    // -----------------------------
    async inRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.10,
        scatter: opts.scatter ?? 1.25,
        mode: "in",
      });
    },

    async outRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.10,
        scatter: opts.scatter ?? 1.25,
        mode: "out",
      });
    },

    // aliasy “matrix_rain”
    async inMatrixRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.10,
        scatter: opts.scatter ?? 1.25,
        mode: "in",
      });
    },

    async outMatrixRain(big, area, axis = "down", stepMs = 24, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        density: opts.density ?? 0.10,
        scatter: opts.scatter ?? 1.25,
        mode: "out",
      });
    },
  };
};
