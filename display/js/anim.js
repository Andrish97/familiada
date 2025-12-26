// anim.js
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Animator pracuje na obszarze kafli (tile = 5x7 kropek).
 * snapArea() zwraca dla każdego tile w obszarze: [7][5] kolorów (string fill).
 *
 * Wspierane animacje:
 * - edge   (kaflami, opcjonalnie pikselowo):  inEdge / outEdge
 * - matrix (wipe, opcjonalnie pikselowo):     inMatrix / outMatrix
 *
 * WAŻNE:
 * - dotOff MUSI być przekazane z scene.js (np. COLORS.dotOff),
 *   bo warianty pikselowe muszą wiedzieć, jakim kolorem “gasić” kropki.
 *
 * NOWE ZASADY CZASU:
 * - parametr `ms` w publicznym API oznacza **czas całkowity animacji danego obszaru**,
 *   a NIE czas na jeden kafelek / jeden krok.
 * - Animator sam dzieli ten czas na kroki (kafle / wiersze / batch-e pikseli),
 *   tak żeby całość trwała około `ms` niezależnie od rozmiaru bloku.
 */
export const createAnimator = ({ tileAt, snapArea, clearArea, clearTileAt, dotOff }) => {
  // ============================================================
  // Helpers
  // ============================================================
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

  // prosty helper – liczy opóźnienie na krok z czasu całkowitego
  const perStepDelay = (totalMs, steps) => {
    const T = Math.max(0, totalMs | 0);
    const S = Math.max(1, steps | 0);
    if (T === 0) return 0;
    const d = T / S;
    return d > 0 ? d : 0;
  };

  // kolejność pikseli w pojedynczym kafelku 5x7 zależnie od kierunku/osi
  const tilePixelOrder = (dirOrAxis) => {
    const key = (d) => {
      // d: {rr,cc}
      // “matrix”:
      if (dirOrAxis === "down")  return d.rr * 5 + d.cc;
      if (dirOrAxis === "up")    return (6 - d.rr) * 5 + d.cc;
      if (dirOrAxis === "right") return d.cc * 7 + d.rr;
      if (dirOrAxis === "left")  return (4 - d.cc) * 7 + d.rr;

      // “edge” (dir):
      if (dirOrAxis === "top")    return d.rr * 5 + d.cc;
      if (dirOrAxis === "bottom") return (6 - d.rr) * 5 + d.cc;
      if (dirOrAxis === "left")   return d.cc * 7 + d.rr;
      if (dirOrAxis === "right")  return (4 - d.cc) * 7 + d.rr;

      return d.rr * 5 + d.cc;
    };
    return key;
  };

  /**
   * Wariant pikselowy – odkrywanie kafelka po batch-ach pikseli,
   * przy założeniu, że CAŁY kafelek ma zająć około `tileMsTotal`.
   *
   * tileMsTotal = budżet czasu na jeden tile (pochodzi z msTotal / liczba_kafli)
   */
  const revealTilePixelsFromSnap = async ({
    big, c1, r1, tx, ty, snapTile,
    orderKey,
    tileMsTotal,
    pxBatch = 8,
  }) => {
    const t = tileAt(big, c1 + tx, r1 + ty);
    if (!t || !snapTile) return;

    const dots = [];
    for (let rr = 0; rr < 7; rr++) {
      for (let cc = 0; cc < 5; cc++) {
        dots.push({ rr, cc, el: t.dots[rr][cc], fill: snapTile[rr][cc] });
      }
    }
    dots.sort((a, b) => orderKey(a) - orderKey(b));

    const batch = Math.max(1, pxBatch | 0);
    const totalDots = dots.length;
    const steps = Math.max(1, Math.ceil(totalDots / batch));
    const delay = perStepDelay(tileMsTotal, steps);

    for (let i = 0; i < totalDots; i += batch) {
      const end = Math.min(totalDots, i + batch);
      for (let k = i; k < end; k++) dots[k].el.setAttribute("fill", dots[k].fill);
      if (delay) await sleep(delay);
    }
  };

  const clearTilePixels = async ({
    big, c1, r1, tx, ty,
    orderKey,
    tileMsTotal,
    pxBatch = 8,
  }) => {
    const t = tileAt(big, c1 + tx, r1 + ty);
    if (!t) return;

    const dots = [];
    for (let rr = 0; rr < 7; rr++) {
      for (let cc = 0; cc < 5; cc++) {
        dots.push({ rr, cc, el: t.dots[rr][cc] });
      }
    }
    dots.sort((a, b) => orderKey(a) - orderKey(b));

    const batch = Math.max(1, pxBatch | 0);
    const totalDots = dots.length;
    const steps = Math.max(1, Math.ceil(totalDots / batch));
    const delay = perStepDelay(tileMsTotal, steps);

    for (let i = 0; i < totalDots; i += batch) {
      const end = Math.min(totalDots, i + batch);
      for (let k = i; k < end; k++) dots[k].el.setAttribute("fill", dotOff);
      if (delay) await sleep(delay);
    }
  };

  // ============================================================
  // Public API
  // ============================================================
  return {
    // -----------------------------
    // EDGE
    //
    // ms = czas całkowity animacji dla danego area
    // opts.pixel = true -> piksele w kafelku “po kolei”
    // opts.pxBatch -> liczba pikseli na batch w kafelku
    // -----------------------------
    async inEdge(big, area, dir = "left", ms = 200, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const snap = snapArea(big, c1, r1, c2, r2);
      clearArea(big, c1, r1, c2, r2);

      const W = c2 - c1 + 1;
      const H = r2 - r1 + 1;

      const coords = [];
      if (dir === "left") {
        for (let x = 0; x < W; x++)        for (let y = 0; y < H; y++) coords.push([x, y]);
      } else if (dir === "right") {
        for (let x = W - 1; x >= 0; x--)   for (let y = 0; y < H; y++) coords.push([x, y]);
      } else if (dir === "top") {
        for (let y = 0; y < H; y++)        for (let x = 0; x < W; x++) coords.push([x, y]);
      } else { // bottom
        for (let y = H - 1; y >= 0; y--)   for (let x = 0; x < W; x++) coords.push([x, y]);
      }

      const totalMs = Math.max(0, ms | 0);

      // wariant pikselowy – pilnujemy, żeby suma po wszystkich kaflach ≈ totalMs
      if (opts?.pixel) {
        const nTiles = coords.length || 1;
        const tileBudget = totalMs / nTiles;
        const orderKey   = tilePixelOrder(dir);
        const pxBatch    = Math.max(1, opts.pxBatch ?? 8);

        for (const [tx, ty] of coords) {
          await revealTilePixelsFromSnap({
            big, c1, r1, tx, ty,
            snapTile: snap?.[ty]?.[tx],
            orderKey,
            tileMsTotal: tileBudget,
            pxBatch,
          });
        }
        return;
      }

      // klasyczny edge (po tile'ach) – czas całkowity = ms
      const steps = coords.length || 1;
      const delay = perStepDelay(totalMs, steps);

      for (const [tx, ty] of coords) {
        setTileFromSnap(big, c1, r1, tx, ty, snap?.[ty]?.[tx]);
        if (delay) await sleep(delay);
      }
    },

    async outEdge(big, area, dir = "left", ms = 200, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const W = c2 - c1 + 1;
      const H = r2 - r1 + 1;

      const coords = [];
      if (dir === "left") {
        for (let x = 0; x < W; x++)        for (let y = 0; y < H; y++) coords.push([x, y]);
      } else if (dir === "right") {
        for (let x = W - 1; x >= 0; x--)   for (let y = 0; y < H; y++) coords.push([x, y]);
      } else if (dir === "top") {
        for (let y = 0; y < H; y++)        for (let x = 0; x < W; x++) coords.push([x, y]);
      } else { // bottom
        for (let y = H - 1; y >= 0; y--)   for (let x = 0; x < W; x++) coords.push([x, y]);
      }

      const totalMs = Math.max(0, ms | 0);

      if (opts?.pixel) {
        const nTiles = coords.length || 1;
        const tileBudget = totalMs / nTiles;
        const orderKey   = tilePixelOrder(dir);
        const pxBatch    = Math.max(1, opts.pxBatch ?? 8);

        for (const [tx, ty] of coords) {
          await clearTilePixels({
            big, c1, r1, tx, ty,
            orderKey,
            tileMsTotal: tileBudget,
            pxBatch,
          });
        }
        return;
      }

      const steps = coords.length || 1;
      const delay = perStepDelay(totalMs, steps);

      for (const [tx, ty] of coords) {
        clearTileAt(big, c1 + tx, r1 + ty);
        if (delay) await sleep(delay);
      }
    },

    // -----------------------------
    // MATRIX
    //
    // ms = czas całkowity animacji dla danego area
    // opts.pixel = true -> “płynnie”: rząd/kolumna pikseli w kafelku,
    //                      ale kafelki w kolejności matrix
    // -----------------------------
    async inMatrix(big, area, axis = "down", ms = 200, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const snap = snapArea(big, c1, r1, c2, r2);
      clearArea(big, c1, r1, c2, r2);

      const Wt = c2 - c1 + 1;
      const Ht = r2 - r1 + 1;
      const totalMs = Math.max(0, ms | 0);

      // pikselowo: kolejność kafli jak matrix, ale budżet czasu = ms
      if (opts?.pixel) {
        const tileOrder = [];
        if (axis === "down" || axis === "up") {
          const ys = axis === "down" ? range(Ht) : range(Ht).reverse();
          for (const ty of ys) for (let tx = 0; tx < Wt; tx++) tileOrder.push([tx, ty]);
        } else {
          const xs = axis === "right" ? range(Wt) : range(Wt).reverse();
          for (const tx of xs) for (let ty = 0; ty < Ht; ty++) tileOrder.push([tx, ty]);
        }

        const nTiles = tileOrder.length || 1;
        const tileBudget = totalMs / nTiles;
        const orderKey   = tilePixelOrder(axis);
        const pxBatch    = Math.max(1, opts.pxBatch ?? 10);

        for (const [tx, ty] of tileOrder) {
          await revealTilePixelsFromSnap({
            big, c1, r1, tx, ty,
            snapTile: snap?.[ty]?.[tx],
            orderKey,
            tileMsTotal: tileBudget,
            pxBatch,
          });
        }
        return;
      }

      // klasyczny matrix (po wierszach / kolumnach)
      const W = Wt;
      const H = Ht;

      if (axis === "down" || axis === "up") {
        const ys = axis === "down" ? range(H) : range(H).reverse();
        const steps = ys.length || 1;
        const delay = perStepDelay(totalMs, steps);

        for (const y of ys) {
          for (let x = 0; x < W; x++) setTileFromSnap(big, c1, r1, x, y, snap?.[y]?.[x]);
          if (delay) await sleep(delay);
        }
      } else {
        const xs = axis === "right" ? range(W) : range(W).reverse();
        const steps = xs.length || 1;
        const delay = perStepDelay(totalMs, steps);

        for (const x of xs) {
          for (let y = 0; y < H; y++) setTileFromSnap(big, c1, r1, x, y, snap?.[y]?.[x]);
          if (delay) await sleep(delay);
        }
      }
    },

    async outMatrix(big, area, axis = "down", ms = 200, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const Wt = c2 - c1 + 1;
      const Ht = r2 - r1 + 1;
      const totalMs = Math.max(0, ms | 0);

      // pikselowo: jak wyżej, ale gasimy
      if (opts?.pixel) {
        const tileOrder = [];
        if (axis === "down" || axis === "up") {
          const ys = axis === "down" ? range(Ht) : range(Ht).reverse();
          for (const ty of ys) for (let tx = 0; tx < Wt; tx++) tileOrder.push([tx, ty]);
        } else {
          const xs = axis === "right" ? range(Wt) : range(Wt).reverse();
          for (const tx of xs) for (let ty = 0; ty < Ht; ty++) tileOrder.push([tx, ty]);
        }

        const nTiles = tileOrder.length || 1;
        const tileBudget = totalMs / nTiles;
        const orderKey   = tilePixelOrder(axis);
        const pxBatch    = Math.max(1, opts.pxBatch ?? 10);

        for (const [tx, ty] of tileOrder) {
          await clearTilePixels({
            big, c1, r1, tx, ty,
            orderKey,
            tileMsTotal: tileBudget,
            pxBatch,
          });
        }
        return;
      }

      const W = Wt;
      const H = Ht;

      if (axis === "down" || axis === "up") {
        const ys = axis === "down" ? range(H) : range(H).reverse();
        const steps = ys.length || 1;
        const delay = perStepDelay(totalMs, steps);

        for (const y of ys) {
          for (let x = 0; x < W; x++) clearTileAt(big, c1 + x, r1 + y);
          if (delay) await sleep(delay);
        }
      } else {
        const xs = axis === "right" ? range(W) : range(W).reverse();
        const steps = xs.length || 1;
        const delay = perStepDelay(totalMs, steps);

        for (const x of xs) {
          for (let y = 0; y < H; y++) clearTileAt(big, c1 + x, r1 + y);
          if (delay) await sleep(delay);
        }
      }
    },
  };
};
