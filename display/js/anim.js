// anim.js
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Animator pracuje na obszarze kafli (tile = 5x7 kropek).
 * snapArea() zwraca dla każdego tile w obszarze: [7][5] kolorów (string fill).
 *
 * Wspierane animacje:
 * - edge   (kaflami):  inEdge/outEdge
 * - matrix (wipe):    inMatrix/outMatrix
 * - rain   (pikselami, “zbieranie/rozmazywanie”): inRain/outRain
 *   (alias: inMatrixRain/outMatrixRain)
 *
 * WAŻNE:
 * - dotOff MUSI być przekazane z scene.js (np. COLORS.dotOff),
 *   bo animacje pikselowe nie mogą “zgadywać” koloru zgaszonego.
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

  // Lista wszystkich kropek w obszarze + ich docelowy fill ze snapshota
  const buildDotListFromSnap = (big, area, snap) => {
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
              gx: tx * 5 + cc, // global w obrębie obszaru (w jednostkach “kropka”)
              gy: ty * 7 + rr,
            });
          }
        }
      }
    }
    return dots;
  };

  // Szybkie mieszanie tablicy (Fisher–Yates)
  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  // ============================================================
  // RAIN (pikselami) — spójny, “więcej się dzieje”, zawsze kończy poprawnym obrazem
  //
  // Efekt:
  // - Prelude: krótkie “jeżdżenie” w losowych pasach, od rzadko -> gęściej.
  // - Converge/Wipe: start z DWÓCH stron (krawędzie -> środek) dla IN,
  //   oraz od środka -> krawędzie dla OUT (“wycieranie na dwie strony”).
  //
  // Zasady:
  // - NIE używamy obcych kolorów: tylko dotOff i targetFill.
  // - IN animuje tylko piksele, które docelowo świecą (bez migania tła).
  // - OUT animuje tylko te, które aktualnie świecą.
  // - Final pass (IN) gwarantuje brak “niedopalonych” pikseli.
  // ============================================================
  const runRain = async ({
    big,
    area,
    axis = "down",      // down/up/left/right (tu “orientacja”: pion/poziom)
    stepMs = 22,
    mode = "in",        // "in" | "out"
    opts = {},
  } = {}) => {
    if (!dotOff) throw new Error("anim.js: dotOff is required in createAnimator({... dotOff })");

    const {
      // ogólne
      speedMul = 1.0,     // >1 wolniej, <1 szybciej
      density = 0.05,     // 0..1 (mniejsze = więcej kroków = więcej “akcji”)
      scatter = 1.6,      // >=1 (większe = bardziej rozproszone)

      // prelude
      preludeSteps = 28,
      preludeMs = 18,
      lanesFrom = 0.07,
      lanesTo = 0.85,
      trail = 9,

      // batch kontrola (to naprawia “zawsze szybkie”)
      minBatch = 6,
      maxBatch = 220,

      // ile “przesunąć” w jednym pasie podczas prelude
      preludeLaneChunk = 0, // 0 = auto
    } = opts;

    const { c1, r1, c2, r2 } = area;

    const snap = snapArea(big, c1, r1, c2, r2);

    // IN: czyścimy obszar na start, żeby nie mieszać stanów
    if (mode === "in") clearArea(big, c1, r1, c2, r2);

    const dotsAll = buildDotListFromSnap(big, area, snap);
    if (!dotsAll.length) return;

    // Rozmiar obszaru w “kropkach”
    const tilesW = c2 - c1 + 1;
    const tilesH = r2 - r1 + 1;
    const W = tilesW * 5; // lanes przy pionie
    const H = tilesH * 7; // lanes przy poziomie

    const vertical = (axis === "down" || axis === "up");
    const laneCount = vertical ? W : H;   // ile pasów
    const spanMain  = vertical ? H : W;   // długość pasa

    const sStep = Math.max(1, Math.round(stepMs * (Number.isFinite(speedMul) ? speedMul : 1)));
    const sPrelude = Math.max(1, Math.round(preludeMs * (Number.isFinite(speedMul) ? speedMul : 1)));

    const laneOf = (d) => (vertical ? d.gx : d.gy);
    const posOf  = (d) => (vertical ? d.gy : d.gx);

    // Wybór “kandydatów”:
    // - IN: tylko docelowo świecące (żeby nie było mrugania tła)
    // - OUT: tylko aktualnie świecące (żeby było co “wycierać”)
    let work = dotsAll;
    if (mode === "in") {
      work = dotsAll.filter(d => d.targetFill !== dotOff);
    } else {
      work = dotsAll.filter(d => d.el.getAttribute("fill") !== dotOff);
    }

    // Jeśli nie ma co animować, to przynajmniej dopnij stan końcowy
    if (!work.length) {
      if (mode === "in") for (const d of dotsAll) d.el.setAttribute("fill", d.targetFill);
      return;
    }

    // ============================================================
    // Grupowanie po pasach
    // ============================================================
    const byLane = new Array(laneCount);
    for (let i = 0; i < laneCount; i++) byLane[i] = [];
    for (const d of work) byLane[laneOf(d)].push(d);

    // W każdym pasie: losowo od jednej z dwóch stron + rozproszenie
    for (let lane = 0; lane < laneCount; lane++) {
      const arr = byLane[lane];
      if (!arr.length) continue;

      // LOSOWO od jednego z końców pasa
      const fromA = Math.random() < 0.5;
      arr.sort((a, b) => (fromA ? posOf(a) - posOf(b) : posOf(b) - posOf(a)));

      // Scatter: lekkie “poszarpanie” kolejności w pasie (bez ciężkich sortów)
      const s = Math.max(1, scatter);
      const swaps = Math.floor(arr.length * 0.015 * (s - 1));
      for (let k = 0; k < swaps; k++) {
        const i = (Math.random() * arr.length) | 0;
        const j = (Math.random() * arr.length) | 0;
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
    }

    // ============================================================
    // PRELUDE: “jeżdżenie” w losowych pasach (rzadko -> gęsto)
    // ============================================================
    const laneHeads = new Array(laneCount).fill(0);

    const preludeN = Math.max(0, preludeSteps | 0);
    if (preludeN > 0) {
      for (let step = 0; step < preludeN; step++) {
        const t = preludeN <= 1 ? 1 : step / (preludeN - 1);
        const activeFrac = lanesFrom + (lanesTo - lanesFrom) * t;
        const activeLanes = clamp(Math.floor(laneCount * activeFrac), 1, laneCount);

        // wybierz losowe pasy
        const picks = range(laneCount);
        // partial shuffle
        for (let i = 0; i < activeLanes; i++) {
          const j = i + ((Math.random() * (laneCount - i)) | 0);
          const tmp = picks[i]; picks[i] = picks[j]; picks[j] = tmp;
        }
        const lanes = picks.slice(0, activeLanes);

        // ile kropek w pasie na krok
        const autoChunk = clamp(Math.floor(spanMain * 0.06), 3, 28);
        const chunk = preludeLaneChunk > 0 ? clamp(preludeLaneChunk | 0, 1, 80) : autoChunk;

        for (const lane of lanes) {
          const arr = byLane[lane];
          if (!arr.length) continue;

          const head = laneHeads[lane];
          const end = Math.min(arr.length, head + chunk);

          // “głowa” — krótki impuls
          if (mode === "in") {
            for (let i = head; i < end; i++) arr[i].el.setAttribute("fill", arr[i].targetFill);
          } else {
            for (let i = head; i < end; i++) arr[i].el.setAttribute("fill", dotOff);
          }

          // “ogon” — cofka, żeby wyglądało jak ruch, a nie narastanie
          if (trail > 0) {
            const tailHead = Math.max(0, head - trail * chunk);
            const tailEnd  = Math.min(arr.length, tailHead + chunk);

            if (mode === "in") {
              for (let i = tailHead; i < tailEnd; i++) arr[i].el.setAttribute("fill", dotOff);
            } else {
              for (let i = tailHead; i < tailEnd; i++) arr[i].el.setAttribute("fill", arr[i].targetFill);
            }
          }

          // zapętlenie -> “jeżdżenie”
          laneHeads[lane] = (end >= arr.length) ? 0 : end;
        }

        if (sPrelude) await sleep(sPrelude);
      }
    }

    // ============================================================
    // CONVERGE / WIPE: start z DWÓCH stron względem osi
    //
    // dist = min(pos, spanMain-1-pos)
    // IN:  od krawędzi do środka  (dist rośnie)
    // OUT: od środka do krawędzi (dist maleje) -> reverse
    //
    // + scatter: szum lane/pos, żeby nie było “pasków”
    // ============================================================
    const s = Math.max(1, scatter);
    const laneNoiseAmp = laneCount * 0.10 * s;
    const posNoiseAmp  = spanMain * 0.30 * s;

    const keyed = work.map((d) => {
      const pos = posOf(d);
      const dist = Math.min(pos, (spanMain - 1) - pos);

      // małe szumy = bardziej rozproszone
      const laneN = (Math.random() - 0.5) * laneNoiseAmp;
      const posN  = (Math.random() - 0.5) * posNoiseAmp;

      return { d, key: dist + posN + laneN * 0.01 };
    });

    keyed.sort((a, b) => a.key - b.key);
    if (mode === "out") keyed.reverse();

    const total = keyed.length;

    // KRYTYCZNE: batch ma być MAŁY i sterowalny (to naprawia “zawsze szybki rain”)
    const mbMin = clamp((minBatch | 0) || 1, 1, 999999);
    const mbMax = clamp((maxBatch | 0) || mbMin, mbMin, 999999);
    const batch = clamp(Math.floor(total * clamp(density, 0.0001, 1)), mbMin, mbMax);

    for (let i = 0; i < total; i += batch) {
      const end = Math.min(total, i + batch);

      if (mode === "in") {
        for (let k = i; k < end; k++) {
          const d = keyed[k].d;
          d.el.setAttribute("fill", d.targetFill);
        }
      } else {
        for (let k = i; k < end; k++) {
          keyed[k].d.el.setAttribute("fill", dotOff);
        }
      }

      if (sStep) await sleep(sStep);
    }

    // ============================================================
    // FINAL PASS: brak “niedopalonych” pikseli po IN
    // ============================================================
    if (mode === "in") {
      for (const d of dotsAll) d.el.setAttribute("fill", d.targetFill);
    }
  };

  // ============================================================
  // Public API
  // ============================================================
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

      if (dir === "left")       for (let x = 0; x < W; x++)       for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "right") for (let x = W - 1; x >= 0; x--)  for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "top")   for (let y = 0; y < H; y++)       for (let x = 0; x < W; x++) coords.push([x, y]);
      else                      for (let y = H - 1; y >= 0; y--)  for (let x = 0; x < W; x++) coords.push([x, y]);

      for (const [tx, ty] of coords) {
        setTileFromSnap(big, c1, r1, tx, ty, snap[ty][tx]);
        if (stepMs) await sleep(stepMs);
      }
    },

    async outEdge(big, area, dir = "left", stepMs = 12) {
      const { c1, r1, c2, r2 } = area;
      const W = c2 - c1 + 1, H = r2 - r1 + 1;
      const coords = [];

      if (dir === "left")       for (let x = 0; x < W; x++)       for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "right") for (let x = W - 1; x >= 0; x--)  for (let y = 0; y < H; y++) coords.push([x, y]);
      else if (dir === "top")   for (let y = 0; y < H; y++)       for (let x = 0; x < W; x++) coords.push([x, y]);
      else                      for (let y = H - 1; y >= 0; y--)  for (let x = 0; x < W; x++) coords.push([x, y]);

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
    // RAIN (pikselami)
    // -----------------------------
    async inRain(big, area, axis = "down", stepMs = 22, opts = {}) {
      return runRain({ big, area, axis, stepMs, mode: "in", opts });
    },

    async outRain(big, area, axis = "down", stepMs = 22, opts = {}) {
      return runRain({ big, area, axis, stepMs, mode: "out", opts });
    },

    // aliasy
    async inMatrixRain(big, area, axis = "down", stepMs = 22, opts = {}) {
      return runRain({ big, area, axis, stepMs, mode: "in", opts });
    },

    async outMatrixRain(big, area, axis = "down", stepMs = 22, opts = {}) {
      return runRain({ big, area, axis, stepMs, mode: "out", opts });
    },
  };
};
