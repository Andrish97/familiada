// anim.js
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Animator pracuje na obszarze kafli (tile = 5x7 kropek).
 * snapArea() zwraca dla każdego tile w obszarze: [7][5] kolorów (string fill).
 *
 * Wspierane animacje:
 * - edge   (kaflami):  inEdge/outEdge
 * - matrix (wipe):    inMatrix/outMatrix
 * - rain   (pikselami, “zbieranie/rozmazywanie”): inRain/outRain (alias inMatrixRain/outMatrixRain)
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

  // ============================================================
  // RAIN (pikselami) — “więcej się dzieje”, ale finalnie zawsze 100% poprawny obraz
  //
  // Założenia efektu:
  // - IN: start “z dwóch stron” do środka (góra+dół lub lewo+prawo), ale z chaosem (rozproszenie).
  // - OUT: “rozmazywanie” od środka na dwie strony.
  // - Prelude: najpierw rzadko (mało pasów), potem coraz więcej — jakby “szukało sygnału”.
  // - Zero obcych kolorów: używamy TYLKO dotOff i targetFill.
  // - Na końcu zawsze “final pass” -> żadnych niedopalonych pikseli.
  // ============================================================
  const runRain = async ({
    big,
    area,
    axis = "down",      // down/up/left/right (tu to bardziej “orientacja” niż kierunek)
    stepMs = 22,        // przerwa między porcjami
    speedMul = 1.0,     // >1 wolniej, <1 szybciej
    density = 0.10,     // 0..1: porcja kropek (większe = szybciej wypełnia, ale mniej “gry”)
    scatter = 1.35,     // >=1: jak bardzo rozproszyć kolejność (większe = bardziej chaotycznie)
    preludeSteps = 22,  // ile kroków “szumu zanim zacznie się zbierać”
    preludeMs = 16,     // tempo prelude
    lanesFrom = 0.10,   // start: % aktywnych pasów w prelude (rzadko)
    lanesTo = 0.70,     // koniec: % aktywnych pasów w prelude (gęściej)
    trail = 8,          // “ogon” w prelude: ile porcji cofamy (gasimy) żeby piksele “jeździły”
    mode = "in",        // "in" | "out"
  } = {}) => {
    if (!dotOff) throw new Error("anim.js: dotOff is required in createAnimator({... dotOff })");

    const { c1, r1, c2, r2 } = area;

    // Snapshot docelowego obrazu
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
    const laneCount = vertical ? W : H;     // ile pasów
    const spanMain  = vertical ? H : W;     // długość pasa

    // Wybór “kandydatów”:
    // - IN: animujemy tylko pixele, które docelowo mają świecić (unikamy mrugania tła)
    // - OUT: animujemy tylko te, które TERAZ świecą (czyli nie-dotOff)
    let work = dotsAll;
    if (mode === "in") {
      work = dotsAll.filter(d => d.targetFill !== dotOff);
    } else {
      work = dotsAll.filter(d => d.el.getAttribute("fill") !== dotOff);
    }
    if (!work.length) {
      // ale i tak final pass (żeby stan się nie rozjechał)
      if (mode === "in") for (const d of dotsAll) d.el.setAttribute("fill", d.targetFill);
      return;
    }

    const sStep = Math.max(1, Math.round(stepMs * (Number.isFinite(speedMul) ? speedMul : 1)));
    const sPreludeMs = Math.max(1, Math.round(preludeMs * (Number.isFinite(speedMul) ? speedMul : 1)));

    // Mapujemy dot -> laneIndex + posInLane (dla pion/poziom)
    const laneOf = (d) => vertical ? d.gx : d.gy;
    const posOf  = (d) => vertical ? d.gy : d.gx;

    // ============================================================
    // PRELUDE: “jeżdżą” porcje w losowych pasach, najpierw rzadko potem gęściej
    //
    // IN: krótkie “zapalenia” targetFill, potem gaszenie -> wrażenie ruchu
    // OUT: krótkie “gaszenia” dotOff, potem przywracanie -> wrażenie rozmazywania
    // ============================================================
    const byLane = new Array(laneCount);
    for (let i = 0; i < laneCount; i++) byLane[i] = [];
    for (const d of work) byLane[laneOf(d)].push(d);

    // sort w ramach pasa: od jednej z dwóch stron LOSOWO (żeby nie było “sztywno od krawędzi”)
    for (let lane = 0; lane < laneCount; lane++) {
      const arr = byLane[lane];
      if (!arr.length) continue;
      const fromTop = Math.random() < 0.5;
      arr.sort((a, b) => (fromTop ? posOf(a) - posOf(b) : posOf(b) - posOf(a)));
      // rozproszenie w pasie
      if (scatter > 1) {
        // lekki chaos przez “swap” losowych elementów
        const swaps = Math.floor(arr.length * 0.02 * (scatter - 1));
        for (let k = 0; k < swaps; k++) {
          const i = (Math.random() * arr.length) | 0;
          const j = (Math.random() * arr.length) | 0;
          const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
      }
    }

    // prelude “głowice” – ile elementów z każdego pasa jest “aktywnie przesuwane”
    const laneHeads = new Array(laneCount).fill(0);

    const prelude = Math.max(0, preludeSteps | 0);
    for (let step = 0; step < prelude; step++) {
      const t = prelude <= 1 ? 1 : step / (prelude - 1);
      const activeFrac = lanesFrom + (lanesTo - lanesFrom) * t;
      const activeLanes = clamp(Math.floor(laneCount * activeFrac), 1, laneCount);

      // wybierz losowy zestaw pasów dla tego kroku
      const picks = [];
      for (let i = 0; i < laneCount; i++) picks.push(i);
      // partial shuffle
      for (let i = 0; i < activeLanes; i++) {
        const j = i + ((Math.random() * (laneCount - i)) | 0);
        const tmp = picks[i]; picks[i] = picks[j]; picks[j] = tmp;
      }

      const lanes = picks.slice(0, activeLanes);

      // ile “kropek” poruszamy w każdym aktywnym pasie w tym kroku
      const perLaneBatch = clamp(Math.floor(spanMain * 0.06), 3, 30);

      for (const lane of lanes) {
        const arr = byLane[lane];
        if (!arr.length) continue;

        // przesuwamy “głowicę” w pasie
        const start = laneHeads[lane];
        const end = Math.min(arr.length, start + perLaneBatch);

        // IN: zapal porcję / OUT: zgaś porcję
        if (mode === "in") {
          for (let i = start; i < end; i++) arr[i].el.setAttribute("fill", arr[i].targetFill);
        } else {
          for (let i = start; i < end; i++) arr[i].el.setAttribute("fill", dotOff);
        }

        // ogon: gaś/zapal to co było “trail” porcji temu (żeby wyglądało jak jeżdżenie)
        const tailStart = Math.max(0, start - trail * perLaneBatch);
        const tailEnd = Math.min(arr.length, tailStart + perLaneBatch);

        if (trail > 0) {
          if (mode === "in") {
            // cofnij do off
            for (let i = tailStart; i < tailEnd; i++) arr[i].el.setAttribute("fill", dotOff);
          } else {
            // przy OUT przywróć (żeby wyglądało jak rozmazywanie, a nie natychmiastowe czernienie)
            for (let i = tailStart; i < tailEnd; i++) {
              // jeśli ktoś nie ma docelowego fill (teoretycznie), to lepiej przywrócić aktualny targetFill ze snap
              arr[i].el.setAttribute("fill", arr[i].targetFill);
            }
          }
        }

        laneHeads[lane] = end >= arr.length ? 0 : end; // zapętlenie = “jeżdżenie”
      }

      if (sPreludeMs) await sleep(sPreludeMs);
    }

    // ============================================================
    // CONVERGE / WIPE: właściwe “zbieranie do obrazu” lub “wycieranie na dwie strony”
    //
    // Klucz: odległość od NAJBLIŻSZEJ krawędzi wzdłuż osi (czyli start z DWÓCH stron)
    // distToNearestEdge = min(pos, spanMain-1-pos)
    //
    // IN: rośnie dist -> idziemy od krawędzi do środka
    // OUT: maleje dist -> idziemy od środka do krawędzi (“ścierka na dwie strony”)
    // + dodatkowy chaos (scatter) aby nie było pasów
    // ============================================================
    const noiseSpan = spanMain * 0.35 * Math.max(1, scatter);

    const keyed = work.map((d) => {
      const pos = posOf(d);
      const dist = Math.min(pos, (spanMain - 1) - pos); // DWIE STRONY -> środek
      const lane = laneOf(d);
      const laneNoise = (Math.random() - 0.5) * (Math.max(1, laneCount) * 0.12 * scatter);
      const posNoise  = (Math.random() - 0.5) * noiseSpan;
      return { d, key: dist + posNoise + laneNoise * 0.01, lane };
    });

    keyed.sort((a, b) => a.key - b.key);
    if (mode === "out") keyed.reverse(); // od środka na dwie strony

    const total = keyed.length;
    const batch = clamp(Math.floor(total * density), 80, 1600);

    for (let i = 0; i < total; i += batch) {
      const end = Math.min(total, i + batch);

      if (mode === "in") {
        for (let k = i; k < end; k++) {
          const d = keyed[k].d;
          d.el.setAttribute("fill", d.targetFill);
        }
      } else {
        for (let k = i; k < end; k++) {
          const d = keyed[k].d;
          d.el.setAttribute("fill", dotOff);
        }
      }

      if (sStep) await sleep(sStep);
    }

    // ============================================================
    // FINAL PASS: brak “niedopalonych” pikseli
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
