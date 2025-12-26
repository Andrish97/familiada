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
 * NOWE:
 * - parametr ms / stepMs jest traktowany jako *całkowity czas animacji bloku*,
 *   niezależnie od rozmiaru obszaru.
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

  const TILE_PIXELS = 5 * 7; // 35 punktów w kafelku

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

  // całkowity czas T → opóźnienie między krokami
  const delayFromTotal = (totalMs, steps) => {
    const T = Math.max(0, totalMs | 0);
    if (T === 0 || steps <= 0) return 0;
    return Math.max(0, Math.floor(T / steps));
  };

  // dla pixel: liczba grup pikseli (przy pxBatch) w całym obszarze
  const computePixelTiming = (totalMs, tilesCount, pxBatch, overrideStepPxMs) => {
    if (overrideStepPxMs != null) {
      // jeśli ktoś jawnie podał stepPxMs – szanujemy to, totalMs jest wtedy mniej ważne
      const stepPxMs = Math.max(0, overrideStepPxMs | 0);
      return { stepPxMs, tileMs: 0 };
    }

    const batch = Math.max(1, pxBatch | 0);
    const groupsPerTile = Math.ceil(TILE_PIXELS / batch); // ile "paczek" na kafelek
    const totalGroups = tilesCount * groupsPerTile;
    const stepPxMs = delayFromTotal(totalMs, totalGroups);
    return { stepPxMs, tileMs: 0 }; // całość czasu idzie na pixele, bez dodatkowego tileMs
  };

  // kolejność pikseli w pojedynczym kafelku 5x7 zależnie od kierunku/osi
  const tilePixelOrder = (dirOrAxis) => {
    const d = (dirOrAxis ?? "").toLowerCase();

    const key = (p) => {
      // p: {rr,cc}
      // matrix axes
      if (d === "down")  return p.rr * 5 + p.cc;
      if (d === "up")    return (6 - p.rr) * 5 + p.cc;
      if (d === "right") return p.cc * 7 + p.rr;
      if (d === "left")  return (4 - p.cc) * 7 + p.rr;

      // edge synonyms
      if (d === "top")    return p.rr * 5 + p.cc;
      if (d === "bottom") return (6 - p.rr) * 5 + p.cc;

      return p.rr * 5 + p.cc;
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

  // ============================================================
  // Public API
  // ============================================================
  return {
    // -----------------------------
    // EDGE
    // ms = całkowity czas animacji bloku
    // opts.pixel = true -> piksele
    // -----------------------------
    async inEdge(big, area, dir = "left", totalMs = 0, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const snap = snapArea(big, c1, r1, c2, r2);
      clearArea(big, c1, r1, c2, r2);

      const W = c2 - c1 + 1;
      const H = r2 - r1 + 1;

      // normalizacja dir: up/down jako top/bottom
      let d = (dir ?? "").toLowerCase();
      if (d === "up") d = "top";
      if (d === "down") d = "bottom";

      const coords = [];
      if (d === "left") {
        for (let x = 0; x < W; x++)        for (let y = 0; y < H; y++) coords.push([x, y]);
      } else if (d === "right") {
        for (let x = W - 1; x >= 0; x--)   for (let y = 0; y < H; y++) coords.push([x, y]);
      } else if (d === "top") {
        for (let y = 0; y < H; y++)        for (let x = 0; x < W; x++) coords.push([x, y]);
      } else { // bottom
        for (let y = H - 1; y >= 0; y--)   for (let x = 0; x < W; x++) coords.push([x, y]);
      }

      const tilesCount = coords.length;

      // wariant pikselowy
      if (opts?.pixel) {
        const pxBatch = Math.max(1, opts.pxBatch ?? 8);
        const { stepPxMs } = computePixelTiming(totalMs, tilesCount, pxBatch, opts.stepPxMs);
        const orderKey = tilePixelOrder(d);

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

      // klasyczny edge (po tile'ach): totalMs = czas całości
      const delay = delayFromTotal(totalMs, tilesCount);
      for (const [tx, ty] of coords) {
        setTileFromSnap(big, c1, r1, tx, ty, snap?.[ty]?.[tx]);
        if (delay) await sleep(delay);
      }
    },

    async outEdge(big, area, dir = "left", totalMs = 0, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const W = c2 - c1 + 1;
      const H = r2 - r1 + 1;

      let d = (dir ?? "").toLowerCase();
      if (d === "up") d = "top";
      if (d === "down") d = "bottom";

      const coords = [];
      if (d === "left") {
        for (let x = 0; x < W; x++)        for (let y = 0; y < H; y++) coords.push([x, y]);
      } else if (d === "right") {
        for (let x = W - 1; x >= 0; x--)   for (let y = 0; y < H; y++) coords.push([x, y]);
      } else if (d === "top") {
        for (let y = 0; y < H; y++)        for (let x = 0; x < W; x++) coords.push([x, y]);
      } else { // bottom
        for (let y = H - 1; y >= 0; y--)   for (let x = 0; x < W; x++) coords.push([x, y]);
      }

      const tilesCount = coords.length;

      if (opts?.pixel) {
        const pxBatch = Math.max(1, opts.pxBatch ?? 8);
        const { stepPxMs } = computePixelTiming(totalMs, tilesCount, pxBatch, opts.stepPxMs);
        const orderKey = tilePixelOrder(d);

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

      const delay = delayFromTotal(totalMs, tilesCount);
      for (const [tx, ty] of coords) {
        clearTileAt(big, c1 + tx, r1 + ty);
        if (delay) await sleep(delay);
      }
    },

    // -----------------------------
    // MATRIX
    // ms = całkowity czas animacji bloku
    // -----------------------------
    async inMatrix(big, area, axis = "down", totalMs = 0, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const snap = snapArea(big, c1, r1, c2, r2);
      clearArea(big, c1, r1, c2, r2);

      const Wt = c2 - c1 + 1;
      const Ht = r2 - r1 + 1;

      let ax = (axis ?? "").toLowerCase();
      if (ax === "top") ax = "up";
      if (ax === "bottom") ax = "down";

      // pikselowo
      if (opts?.pixel) {
        const tileOrder = [];
        if (ax === "down" || ax === "up") {
          const ys = ax === "down" ? range(Ht) : range(Ht).reverse();
          for (const ty of ys) for (let tx = 0; tx < Wt; tx++) tileOrder.push([tx, ty]);
        } else {
          const xs = ax === "right" ? range(Wt) : range(Wt).reverse();
          for (const tx of xs) for (let ty = 0; ty < Ht; ty++) tileOrder.push([tx, ty]);
        }

        const tilesCount = tileOrder.length;
        const pxBatch = Math.max(1, opts.pxBatch ?? 10);
        const { stepPxMs } = computePixelTiming(totalMs, tilesCount, pxBatch, opts.stepPxMs);
        const orderKey = tilePixelOrder(ax);

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

      // klasyczny matrix (po pasach)
      const W = Wt;
      const H = Ht;

      if (ax === "down" || ax === "up") {
        const ys = ax === "down" ? range(H) : range(H).reverse();
        const delay = delayFromTotal(totalMs, ys.length);
        for (const y of ys) {
          for (let x = 0; x < W; x++) setTileFromSnap(big, c1, r1, x, y, snap?.[y]?.[x]);
          if (delay) await sleep(delay);
        }
      } else {
        const xs = ax === "right" ? range(W) : range(W).reverse();
        const delay = delayFromTotal(totalMs, xs.length);
        for (const x of xs) {
          for (let y = 0; y < H; y++) setTileFromSnap(big, c1, r1, x, y, snap?.[y]?.[x]);
          if (delay) await sleep(delay);
        }
      }
    },

    async outMatrix(big, area, axis = "down", totalMs = 0, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const Wt = c2 - c1 + 1;
      const Ht = r2 - r1 + 1;

      let ax = (axis ?? "").toLowerCase();
      if (ax === "top") ax = "up";
      if (ax === "bottom") ax = "down";

      // pikselowo
      if (opts?.pixel) {
        const tileOrder = [];
        if (ax === "down" || ax === "up") {
          const ys = ax === "down" ? range(Ht) : range(Ht).reverse();
          for (const ty of ys) for (let tx = 0; tx < Wt; tx++) tileOrder.push([tx, ty]);
        } else {
          const xs = ax === "right" ? range(Wt) : range(Wt).reverse();
          for (const tx of xs) for (let ty = 0; ty < Ht; ty++) tileOrder.push([tx, ty]);
        }

        const tilesCount = tileOrder.length;
        const pxBatch = Math.max(1, opts.pxBatch ?? 10);
        const { stepPxMs } = computePixelTiming(totalMs, tilesCount, pxBatch, opts.stepPxMs);
        const orderKey = tilePixelOrder(ax);

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

      // klasyczny matrix out (po pasach)
      const W = Wt;
      const H = Ht;

      if (ax === "down" || ax === "up") {
        const ys = ax === "down" ? range(H) : range(H).reverse();
        const delay = delayFromTotal(totalMs, ys.length);
        for (const y of ys) {
          for (let x = 0; x < W; x++) clearTileAt(big, c1 + x, r1 + y);
          if (delay) await sleep(delay);
        }
      } else {
        const xs = ax === "right" ? range(W) : range(W).reverse();
        const delay = delayFromTotal(totalMs, xs.length);
        for (const x of xs) {
          for (let y = 0; y < H; y++) clearTileAt(big, c1 + x, r1 + y);
          if (delay) await sleep(delay);
        }
      }
    },
  };
};
