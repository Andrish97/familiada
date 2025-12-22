// anim.js
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Animator pracuje na obszarze kafli (tile = 5x7 kropek).
 * snapArea() zwraca dla każdego tile w obszarze: [7][5] kolorów (string fill).
 *
 * Wspierane animacje:
 * - edge   (kaflami, opcjonalnie pikselowo):  inEdge/outEdge
 * - matrix (wipe, opcjonalnie pikselowo):    inMatrix/outMatrix
 * - rain   (pikselami “zbieranie/rozmazywanie”): inRain/outRain (+ aliasy inMatrixRain/outMatrixRain)
 *
 * WAŻNE:
 * - dotOff MUSI być przekazane z scene.js (np. COLORS.dotOff),
 *   bo animacje pikselowe i rain nie mogą “zgadywać” koloru zgaszonego.
 *
 * Back-compat:
 * - Dotychczasowe wywołania (bez opts) działają identycznie jak wcześniej.
 * - Dodatkowe parametry opts są opcjonalne i nic nie psują.
 */
export const createAnimator = ({ tileAt, snapArea, clearArea, clearTileAt, dotOff }) => {
  // ============================================================
  // Helpers
  // ============================================================
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

  // lista wszystkich kropek w obszarze + docelowy fill ze snapshota
  const buildDotsFromSnap = (big, area, snap) => {
    const { c1, r1, c2, r2 } = area;
    const tilesW = c2 - c1 + 1;
    const tilesH = r2 - r1 + 1;

    const out = [];
    for (let ty = 0; ty < tilesH; ty++) {
      for (let tx = 0; tx < tilesW; tx++) {
        const t = tileAt(big, c1 + tx, r1 + ty);
        const data = snap?.[ty]?.[tx];
        if (!t || !data) continue;

        for (let rr = 0; rr < 7; rr++) {
          for (let cc = 0; cc < 5; cc++) {
            out.push({
              el: t.dots[rr][cc],
              targetFill: data[rr][cc],
              tx, ty, rr, cc,
              gx: tx * 5 + cc,
              gy: ty * 7 + rr,
            });
          }
        }
      }
    }
    return out;
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
    pxBatch = 8,
    stepPxMs = 2,
  }) => {
    const t = tileAt(big, c1 + tx, r1 + ty);
    if (!t || !snapTile) return;

    const dots = [];
    for (let rr = 0; rr < 7; rr++) for (let cc = 0; cc < 5; cc++) {
      dots.push({ rr, cc, el: t.dots[rr][cc], fill: snapTile[rr][cc] });
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
    pxBatch = 8,
    stepPxMs = 2,
  }) => {
    const t = tileAt(big, c1 + tx, r1 + ty);
    if (!t) return;

    const dots = [];
    for (let rr = 0; rr < 7; rr++) for (let cc = 0; cc < 5; cc++) {
      dots.push({ rr, cc, el: t.dots[rr][cc] });
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
  // RAIN (pikselami) — wyrównany czas (bez “szybko na start, długo na koniec”)
  //
  // Kluczowe poprawki vs nierówność:
  // - W CONVERGE/WIPE: stała liczba ticków (opts.ticks), stałe porcje perTick.
  // - Prelude: ease-in na liczbie aktywnych pasów (wolniej na starcie).
  // - Lane heads nie “zapętlają” się do 0 (brak losowych przyspieszeń).
  // - Zero obcych kolorów: tylko dotOff i targetFill.
  // - Final pass dla IN: zawsze 100% poprawny obraz.
  // ============================================================
  const runRain = async ({
    big,
    area,
    axis = "down",      // down/up/left/right (orientacja)
    stepMs = 22,
    speedMul = 1.0,     // >1 wolniej, <1 szybciej
    density = 0.10,     // zostaje jako “ogólny charakter”, ale tempo wyrównuje opts.ticks
    scatter = 1.35,
    preludeSteps = 22,
    preludeMs = 16,
    lanesFrom = 0.10,
    lanesTo = 0.70,
    trail = 8,
    ticks = 28,         // <<< NOWE: ile kroków ma mieć faza główna (im więcej, tym “więcej się dzieje”)
    mode = "in",        // "in" | "out"
  } = {}) => {
    if (!dotOff) throw new Error("anim.js: dotOff is required in createAnimator({... dotOff })");

    const { c1, r1, c2, r2 } = area;

    // Snapshot docelowego obrazu
    const snap = snapArea(big, c1, r1, c2, r2);

    // IN: czyścimy obszar na start
    if (mode === "in") clearArea(big, c1, r1, c2, r2);

    const dotsAll = buildDotsFromSnap(big, area, snap);
    if (!dotsAll.length) return;

    // Rozmiar obszaru w “kropkach”
    const tilesW = c2 - c1 + 1;
    const tilesH = r2 - r1 + 1;
    const W = tilesW * 5;
    const H = tilesH * 7;

    const vertical = (axis === "down" || axis === "up");
    const laneCount = vertical ? W : H;
    const spanMain  = vertical ? H : W;

    const sMul = Number.isFinite(speedMul) ? speedMul : 1;
    const sStep = Math.max(1, Math.round(stepMs * sMul));
    const sPreludeMs = Math.max(1, Math.round(preludeMs * sMul));

    const laneOf = (d) => (vertical ? d.gx : d.gy);
    const posOf  = (d) => (vertical ? d.gy : d.gx);

    // Kandydaci:
    // IN: tylko pixele, które docelowo świecą (bez mrugania tła)
    // OUT: tylko te, które teraz świecą
    let work = dotsAll;
    if (mode === "in") work = dotsAll.filter(d => d.targetFill !== dotOff);
    else work = dotsAll.filter(d => d.el.getAttribute("fill") !== dotOff);

    if (!work.length) {
      if (mode === "in") for (const d of dotsAll) d.el.setAttribute("fill", d.targetFill);
      return;
    }

    // Grupuj per pas
    const byLane = new Array(laneCount);
    for (let i = 0; i < laneCount; i++) byLane[i] = [];
    for (const d of work) byLane[laneOf(d)].push(d);

    // sort w pasie: start z jednej z dwóch stron LOSOWO
    for (let lane = 0; lane < laneCount; lane++) {
      const arr = byLane[lane];
      if (!arr.length) continue;

      const fromFront = Math.random() < 0.5;
      arr.sort((a, b) => (fromFront ? posOf(a) - posOf(b) : posOf(b) - posOf(a)));

      // lekki chaos w pasie
      if (scatter > 1) {
        const swaps = Math.floor(arr.length * 0.02 * (scatter - 1));
        for (let k = 0; k < swaps; k++) {
          const i = (Math.random() * arr.length) | 0;
          const j = (Math.random() * arr.length) | 0;
          const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
      }
    }

    const laneHeads = new Array(laneCount).fill(0);

    // ----------------------------
    // PRELUDE: rzadko -> gęściej, ease-in (wolniej na początku)
    // ----------------------------
    const prelude = Math.max(0, preludeSteps | 0);
    for (let step = 0; step < prelude; step++) {
      const t0 = prelude <= 1 ? 1 : step / (prelude - 1);
      const t = t0 * t0; // ease-in
      const activeFrac = lanesFrom + (lanesTo - lanesFrom) * t;
      const activeLanes = clamp(Math.floor(laneCount * activeFrac), 1, laneCount);

      // losowy zestaw pasów
      const picks = [];
      for (let i = 0; i < laneCount; i++) picks.push(i);
      for (let i = 0; i < activeLanes; i++) {
        const j = i + ((Math.random() * (laneCount - i)) | 0);
        const tmp = picks[i]; picks[i] = picks[j]; picks[j] = tmp;
      }
      const lanes = picks.slice(0, activeLanes);

      const perLaneBatch = clamp(Math.floor(spanMain * 0.06), 3, 30);

      for (const lane of lanes) {
        const arr = byLane[lane];
        if (!arr.length) continue;

        const start = laneHeads[lane];
        const end = Math.min(arr.length, start + perLaneBatch);

        if (mode === "in") {
          for (let i = start; i < end; i++) arr[i].el.setAttribute("fill", arr[i].targetFill);
        } else {
          for (let i = start; i < end; i++) arr[i].el.setAttribute("fill", dotOff);
        }

        // ogon (krótkie cofanie) = “jeżdżenie”
        if (trail > 0) {
          const tailStart = Math.max(0, start - trail * perLaneBatch);
          const tailEnd = Math.min(arr.length, tailStart + perLaneBatch);

          if (mode === "in") {
            for (let i = tailStart; i < tailEnd; i++) arr[i].el.setAttribute("fill", dotOff);
          } else {
            for (let i = tailStart; i < tailEnd; i++) arr[i].el.setAttribute("fill", arr[i].targetFill);
          }
        }

        // NIE zapętlamy do 0 (to robi losowe przyspieszenia)
        laneHeads[lane] = end >= arr.length ? arr.length : end;
      }

      if (sPreludeMs) await sleep(sPreludeMs);
    }

    // ----------------------------
    // CONVERGE / WIPE: DWIE STRONY -> środek (IN) / środek -> DWIE STRONY (OUT)
    // + wyrównane tempo: stała liczba ticków
    // ----------------------------
    const noiseSpan = spanMain * 0.35 * Math.max(1, scatter);

    const keyed = work.map((d) => {
      const pos = posOf(d);
      const dist = Math.min(pos, (spanMain - 1) - pos); // DWIE STRONY -> środek
      const lane = laneOf(d);
      const laneNoise = (Math.random() - 0.5) * (Math.max(1, laneCount) * 0.12 * scatter);
      const posNoise  = (Math.random() - 0.5) * noiseSpan;
      return { d, key: dist + posNoise + laneNoise * 0.01 };
    });

    keyed.sort((a, b) => a.key - b.key);
    if (mode === "out") keyed.reverse();

    const total = keyed.length;

    // stała liczba “uderzeń” animacji — koniec nie będzie się wlec
    const T = clamp((ticks | 0) || 28, 8, 120);

    // density zostawiamy jako dodatkową dźwignię (charakter), ale ograniczamy wpływ
    const densityBoost = clamp(Number(density) || 0.10, 0.02, 0.60);
    const effectiveTicks = clamp(Math.round(T / clamp(densityBoost / 0.10, 0.6, 2.0)), 8, 160);

    const perTick = clamp(Math.ceil(total / effectiveTicks), 60, 2400);

    for (let i = 0; i < total; i += perTick) {
      const end = Math.min(total, i + perTick);

      if (mode === "in") {
        for (let k = i; k < end; k++) keyed[k].d.el.setAttribute("fill", keyed[k].d.targetFill);
      } else {
        for (let k = i; k < end; k++) keyed[k].d.el.setAttribute("fill", dotOff);
      }

      if (sStep) await sleep(sStep);
    }

    // final pass (IN): 100% poprawny obraz
    if (mode === "in") {
      for (const d of dotsAll) d.el.setAttribute("fill", d.targetFill);
    }
  };

  // ============================================================
  // Public API
  // ============================================================
  return {
    // -----------------------------
    // EDGE
    //
    // opts.pixel = true -> piksele w kafelku “po kolei”
    // opts.pxBatch, opts.stepPxMs -> kontrola gęstości/tempa w obrębie kafelka
    // opts.tileMs -> pauza między kafelkami (opcjonalnie; domyślnie stepMs)
    // -----------------------------
    async inEdge(big, area, dir = "left", stepMs = 12, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const snap = snapArea(big, c1, r1, c2, r2);
      clearArea(big, c1, r1, c2, r2);

      const W = c2 - c1 + 1, H = r2 - r1 + 1;

      const coords = [];
      if (dir === "left")        for (let x = 0; x < W; x++)        for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "right")  for (let x = W - 1; x >= 0; x--)   for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "top")    for (let y = 0; y < H; y++)        for (let x = 0; x < W; x++) coords.push([x, y]);
      else                       for (let y = H - 1; y >= 0; y--)   for (let x = 0; x < W; x++) coords.push([x, y]);

      // pixel edge
      if (opts?.pixel) {
        const orderKey = tilePixelOrder(dir);
        const pxBatch = Math.max(1, opts.pxBatch ?? 8);
        const stepPxMs = Math.max(0, opts.stepPxMs ?? Math.max(1, Math.round(stepMs / 6)));
        const tileMs = Math.max(0, opts.tileMs ?? stepMs);

        for (const [tx, ty] of coords) {
          await revealTilePixelsFromSnap({
            big, c1, r1, tx, ty,
            snapTile: snap?.[ty]?.[tx],
            orderKey,
            pxBatch,
            stepPxMs,
          });
          if (tileMs) await sleep(tileMs);
        }
        return;
      }

      // klasyczny edge (tile)
      for (const [tx, ty] of coords) {
        setTileFromSnap(big, c1, r1, tx, ty, snap[ty][tx]);
        if (stepMs) await sleep(stepMs);
      }
    },

    async outEdge(big, area, dir = "left", stepMs = 12, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const W = c2 - c1 + 1, H = r2 - r1 + 1;

      const coords = [];
      if (dir === "left")        for (let x = 0; x < W; x++)        for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "right")  for (let x = W - 1; x >= 0; x--)   for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "top")    for (let y = 0; y < H; y++)        for (let x = 0; x < W; x++) coords.push([x, y]);
      else                       for (let y = H - 1; y >= 0; y--)   for (let x = 0; x < W; x++) coords.push([x, y]);

      // pixel edge out
      if (opts?.pixel) {
        const orderKey = tilePixelOrder(dir);
        const pxBatch = Math.max(1, opts.pxBatch ?? 8);
        const stepPxMs = Math.max(0, opts.stepPxMs ?? Math.max(1, Math.round(stepMs / 6)));
        const tileMs = Math.max(0, opts.tileMs ?? stepMs);

        for (const [tx, ty] of coords) {
          await clearTilePixels({
            big, c1, r1, tx, ty,
            orderKey,
            pxBatch,
            stepPxMs,
          });
          if (tileMs) await sleep(tileMs);
        }
        return;
      }

      // klasyczny edge out (tile)
      for (const [tx, ty] of coords) {
        clearTileAt(big, c1 + tx, r1 + ty);
        if (stepMs) await sleep(stepMs);
      }
    },

    // -----------------------------
    // MATRIX
    //
    // opts.pixel = true -> “płynnie”: rząd/kolumna pikseli w kafelku, ale kafelki w kolejności matrix
    // opts.pxBatch, opts.stepPxMs, opts.tileMs jak wyżej
    // -----------------------------
    async inMatrix(big, area, axis = "down", stepMs = 36, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const snap = snapArea(big, c1, r1, c2, r2);
      clearArea(big, c1, r1, c2, r2);

      const Wt = c2 - c1 + 1, Ht = r2 - r1 + 1;

      // pixel matrix
      if (opts?.pixel) {
        const tileOrder = [];
        if (axis === "down" || axis === "up") {
          const ys = axis === "down" ? range(Ht) : range(Ht).reverse();
          for (const ty of ys) for (let tx = 0; tx < Wt; tx++) tileOrder.push([tx, ty]);
        } else {
          const xs = axis === "right" ? range(Wt) : range(Wt).reverse();
          for (const tx of xs) for (let ty = 0; ty < Ht; ty++) tileOrder.push([tx, ty]);
        }

        const orderKey = tilePixelOrder(axis);
        const pxBatch = Math.max(1, opts.pxBatch ?? 10);
        const stepPxMs = Math.max(0, opts.stepPxMs ?? Math.max(1, Math.round(stepMs / 10)));
        const tileMs = Math.max(0, opts.tileMs ?? stepMs);

        for (const [tx, ty] of tileOrder) {
          await revealTilePixelsFromSnap({
            big, c1, r1, tx, ty,
            snapTile: snap?.[ty]?.[tx],
            orderKey,
            pxBatch,
            stepPxMs,
          });
          if (tileMs) await sleep(tileMs);
        }
        return;
      }

      // klasyczny matrix (tile)
      const W = Wt, H = Ht;
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

    async outMatrix(big, area, axis = "down", stepMs = 36, opts = {}) {
      const { c1, r1, c2, r2 } = area;
      const Wt = c2 - c1 + 1, Ht = r2 - r1 + 1;

      // pixel matrix out
      if (opts?.pixel) {
        const tileOrder = [];
        if (axis === "down" || axis === "up") {
          const ys = axis === "down" ? range(Ht) : range(Ht).reverse();
          for (const ty of ys) for (let tx = 0; tx < Wt; tx++) tileOrder.push([tx, ty]);
        } else {
          const xs = axis === "right" ? range(Wt) : range(Wt).reverse();
          for (const tx of xs) for (let ty = 0; ty < Ht; ty++) tileOrder.push([tx, ty]);
        }

        const orderKey = tilePixelOrder(axis);
        const pxBatch = Math.max(1, opts.pxBatch ?? 10);
        const stepPxMs = Math.max(0, opts.stepPxMs ?? Math.max(1, Math.round(stepMs / 10)));
        const tileMs = Math.max(0, opts.tileMs ?? stepMs);

        for (const [tx, ty] of tileOrder) {
          await clearTilePixels({
            big, c1, r1, tx, ty,
            orderKey,
            pxBatch,
            stepPxMs,
          });
          if (tileMs) await sleep(tileMs);
        }
        return;
      }

      // klasyczny matrix out (tile)
      const W = Wt, H = Ht;
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
    // RAIN (pikselami) — wyrównany
    // opts mogą nadpisać parametry runRain (ticks, preludeSteps, itp.)
    // -----------------------------
    async inRain(big, area, axis = "down", stepMs = 22, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        mode: "in",
        ...opts,
      });
    },

    async outRain(big, area, axis = "down", stepMs = 22, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        mode: "out",
        ...opts,
      });
    },

    // aliasy
    async inMatrixRain(big, area, axis = "down", stepMs = 22, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        mode: "in",
        ...opts,
      });
    },

    async outMatrixRain(big, area, axis = "down", stepMs = 22, opts = {}) {
      return runRain({
        big,
        area,
        axis,
        stepMs,
        mode: "out",
        ...opts,
      });
    },
  };
};
