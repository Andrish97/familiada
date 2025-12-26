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
 * Semantyka ms:
 * - parametr ms w publicznym API oznacza zawsze
 *   ~czas trwania całej animacji dla danego area,
 *   niezależnie od jego rozmiaru.
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

  const normalizeTotalMs = (ms, fallback) => {
    const v = Number(ms);
    if (!Number.isFinite(v)) return Math.max(0, fallback | 0);
    return Math.max(0, v | 0);
  };

  // edge: dopuszczamy up/down jako aliasy top/bottom
  const normEdgeDir = (dir) => {
    const d = (dir ?? "").toString().toLowerCase();
    if (d === "left") return "left";
    if (d === "right") return "right";
    if (d === "up" || d === "top") return "top";
    if (d === "down" || d === "bottom") return "bottom";
    return "left";
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

  const revealTilePixelsFromSnap = async ({
    big, c1, r1, tx, ty, snapTile,
    orderKey,
    pxBatch,
    stepPxMs,
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
    const delay = Math.max(0, stepPxMs | 0);

    for (let i = 0; i < dots.length; i += batch) {
      const end = Math.min(dots.length, i + batch);
      for (let k = i; k < end; k++) dots[k].el.setAttribute("fill", dots[k].fill);
      if (delay) await sleep(delay);
    }
  };

  const clearTilePixels = async ({
    big, c1, r1, tx, ty,
    orderKey,
    pxBatch,
    stepPxMs,
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
    const delay = Math.max(0, stepPxMs | 0);

    for (let i = 0; i < dots.length; i += batch) {
      const end = Math.min(dots.length, i + batch);
      for (let k = i; k < end; k++) dots[k].el.setAttribute("fill", dotOff);
      if (delay) await sleep(delay);
    }
  };

  const TILE_PIXELS = 5 * 7;

  // ============================================================
  // Public API
  // ============================================================
  return {
    // -----------------------------
    // EDGE
    //
    // ms = czas trwania całej animacji w danym area
    // -----------------------------
    async inEdge(big, area, dir = "left", ms = 200, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      dir = normEdgeDir(dir);

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

      const totalMs = normalizeTotalMs(ms, 200);

      // wariant pikselowy: dopasowujemy krok tak, by całość trwała ~totalMs
      if (opts?.pixel) {
        const nTiles = Math.max(1, coords.length);
        const pxBatch = Math.max(1, opts.pxBatch ?? 8);
        const stepsPerTile = Math.ceil(TILE_PIXELS / pxBatch);
        const totalSteps = nTiles * stepsPerTile;
        const stepPxMs = totalSteps > 0 ? totalMs / totalSteps : 0;

        const orderKey = tilePixelOrder(dir);

        for (const [tx, ty] of coords) {
          await revealTilePixelsFromSnap({
            big, c1, r1, tx, ty,
            snapTile: snap?.[ty]?.[tx],
            orderKey,
            pxBatch,
            stepPxMs,
          });
        }
        return;
      }

      // klasyczny edge (po tile'ach), wyrównany do totalMs
      const nSteps = Math.max(1, coords.length);
      const delay = totalMs / nSteps;

      for (const [tx, ty] of coords) {
        setTileFromSnap(big, c1, r1, tx, ty, snap?.[ty]?.[tx]);
        if (delay > 0) await sleep(delay);
      }
    },

    async outEdge(big, area, dir = "left", ms = 200, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      dir = normEdgeDir(dir);

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

      const totalMs = normalizeTotalMs(ms, 200);

      if (opts?.pixel) {
        const nTiles = Math.max(1, coords.length);
        const pxBatch = Math.max(1, opts.pxBatch ?? 8);
        const stepsPerTile = Math.ceil(TILE_PIXELS / pxBatch);
        const totalSteps = nTiles * stepsPerTile;
        const stepPxMs = totalSteps > 0 ? totalMs / totalSteps : 0;

        const orderKey = tilePixelOrder(dir);

        for (const [tx, ty] of coords) {
          await clearTilePixels({
            big, c1, r1, tx, ty,
            orderKey,
            pxBatch,
            stepPxMs,
          });
        }
        return;
      }

      const nSteps = Math.max(1, coords.length);
      const delay = totalMs / nSteps;

      for (const [tx, ty] of coords) {
        clearTileAt(big, c1 + tx, r1 + ty);
        if (delay > 0) await sleep(delay);
      }
    },

    // -----------------------------
    // MATRIX
    //
    // ms = czas trwania całej animacji w danym area
    // -----------------------------
    async inMatrix(big, area, axis = "down", ms = 200, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const snap = snapArea(big, c1, r1, c2, r2);
      clearArea(big, c1, r1, c2, r2);

      const Wt = c2 - c1 + 1;
      const Ht = r2 - r1 + 1;
      const totalMs = normalizeTotalMs(ms, 200);

      // pikselowo: przechodzimy tile po tile, ale krok w pikselach
      if (opts?.pixel) {
        const tileOrder = [];
        if (axis === "down" || axis === "up") {
          const ys = axis === "down" ? range(Ht) : range(Ht).reverse();
          for (const ty of ys) for (let tx = 0; tx < Wt; tx++) tileOrder.push([tx, ty]);
        } else {
          const xs = axis === "right" ? range(Wt) : range(Wt).reverse();
          for (const tx of xs) for (let ty = 0; ty < Ht; ty++) tileOrder.push([tx, ty]);
        }

        const nTiles = Math.max(1, tileOrder.length);
        const pxBatch = Math.max(1, opts.pxBatch ?? 10);
        const stepsPerTile = Math.ceil(TILE_PIXELS / pxBatch);
        const totalSteps = nTiles * stepsPerTile;
        const stepPxMs = totalSteps > 0 ? totalMs / totalSteps : 0;

        const orderKey = tilePixelOrder(axis);

        for (const [tx, ty] of tileOrder) {
          await revealTilePixelsFromSnap({
            big, c1, r1, tx, ty,
            snapTile: snap?.[ty]?.[tx],
            orderKey,
            pxBatch,
            stepPxMs,
          });
        }
        return;
      }

      // klasyczny matrix (po rzędach / kolumnach), wyrównany do totalMs
      const W = Wt;
      const H = Ht;

      if (axis === "down" || axis === "up") {
        const ys = axis === "down" ? range(H) : range(H).reverse();
        const nSteps = Math.max(1, ys.length);
        const delay = totalMs / nSteps;

        for (const y of ys) {
          for (let x = 0; x < W; x++) setTileFromSnap(big, c1, r1, x, y, snap?.[y]?.[x]);
          if (delay > 0) await sleep(delay);
        }
      } else {
        const xs = axis === "right" ? range(W) : range(W).reverse();
        const nSteps = Math.max(1, xs.length);
        const delay = totalMs / nSteps;

        for (const x of xs) {
          for (let y = 0; y < H; y++) setTileFromSnap(big, c1, r1, x, y, snap?.[y]?.[x]);
          if (delay > 0) await sleep(delay);
        }
      }
    },

    async outMatrix(big, area, axis = "down", ms = 200, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const Wt = c2 - c1 + 1;
      const Ht = r2 - r1 + 1;
      const totalMs = normalizeTotalMs(ms, 200);

      if (opts?.pixel) {
        const tileOrder = [];
        if (axis === "down" || axis === "up") {
          const ys = axis === "down" ? range(Ht) : range(Ht).reverse();
          for (const ty of ys) for (let tx = 0; tx < Wt; tx++) tileOrder.push([tx, ty]);
        } else {
          const xs = axis === "right" ? range(Wt) : range(Wt).reverse();
          for (const tx of xs) for (let ty = 0; ty < Ht; ty++) tileOrder.push([tx, ty]);
        }

        const nTiles = Math.max(1, tileOrder.length);
        const pxBatch = Math.max(1, opts.pxBatch ?? 10);
        const stepsPerTile = Math.ceil(TILE_PIXELS / pxBatch);
        const totalSteps = nTiles * stepsPerTile;
        const stepPxMs = totalSteps > 0 ? totalMs / totalSteps : 0;

        const orderKey = tilePixelOrder(axis);

        for (const [tx, ty] of tileOrder) {
          await clearTilePixels({
            big, c1, r1, tx, ty,
            orderKey,
            pxBatch,
            stepPxMs,
          });
        }
        return;
      }

      const W = Wt;
      const H = Ht;

      if (axis === "down" || axis === "up") {
        const ys = axis === "down" ? range(H) : range(H).reverse();
        const nSteps = Math.max(1, ys.length);
        const delay = totalMs / nSteps;

        for (const y of ys) {
          for (let x = 0; x < W; x++) clearTileAt(big, c1 + x, r1 + y);
          if (delay > 0) await sleep(delay);
        }
      } else {
        const xs = axis === "right" ? range(W) : range(W).reverse();
        const nSteps = Math.max(1, xs.length);
        const delay = totalMs / nSteps;

        for (const x of xs) {
          for (let y = 0; y < H; y++) clearTileAt(big, c1 + x, r1 + y);
          if (delay > 0) await sleep(delay);
        }
      }
    },
  };
};
