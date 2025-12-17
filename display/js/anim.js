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
    axis = "down",        // down/up = pion (kolumny), left/right = poziom (wiersze)
    stepMs = 24,          // przerwa między paczkami w fazie “zbierania”
    density = 0.10,       // “zbieranie”: ile kropek w paczce
    scatter = 1.25,       // “zbieranie”: rozproszenie kolejności
  
    // --- NOWE: faza “jazdy” przed zbieraniem ---
    preludeMs = 22,       // przerwa między klatkami “jazdy”
    preludeSteps = 22,    // ile klatek “jazdy”
    lanesFrom = 0.12,     // startowa część aktywnych pasów (rzadko)
    lanesTo = 0.65,       // końcowa część aktywnych pasów (gęsto)
    trail = 8,            // długość “ogonka” w pasie (ile kropek świeci za “głową”)
    flicker = 0.18,       // losowe mrugnięcia w pobliżu (0..1) — dodaje “życia”
    mode = "in",          // "in" | "out"
  } = {}) => {
    if (!dotOff) throw new Error("Animator: dotOff is required (pass dotOff from scene COLORS.dotOff).");
  
    const { c1, r1, c2, r2 } = area;
  
    // Snapshot docelowego obrazu
    const snap = snapArea(big, c1, r1, c2, r2);
  
    // Zbuduj listę wszystkich kropek w area
    const dotsAll = buildDotListFromSnap(big, area, snap);
    if (!dotsAll.length) return;
  
    // Dla IN: czyścimy od razu, bo faza “jazdy” ma działać na pustym tle
    if (mode === "in") clearArea(big, c1, r1, c2, r2);
  
    // Pracujemy tylko na “docelowo świecących” (żeby nie mrugało wokół tekstu / w tle)
    // OUT: pracujemy tylko na aktualnie świecących
    let work = [];
    if (mode === "in") {
      work = dotsAll.filter(d => d.targetFill !== dotOff);
    } else {
      work = dotsAll.filter(d => (d.el.getAttribute("fill") || dotOff) !== dotOff);
    }
    if (!work.length) {
      if (mode === "in") for (const d of dotsAll) d.el.setAttribute("fill", d.targetFill);
      return;
    }
  
    // Rozmiar obszaru w “kropkach”
    const tilesW = c2 - c1 + 1;
    const tilesH = r2 - r1 + 1;
    const W = tilesW * 5;
    const H = tilesH * 7;
  
    const vertical = (axis === "down" || axis === "up");
    const laneCount = vertical ? W : H;        // pasy: kolumny lub wiersze
    const laneLen   = vertical ? H : W;        // długość pasa
  
    // Szybki indeks: lane -> lista kropek w tej lane (posortowana po pozycji)
    const lanes = Array.from({ length: laneCount }, () => []);
    for (const d of work) {
      const lane = vertical ? d.gx : d.gy;
      const pos  = vertical ? d.gy : d.gx;
      lanes[lane].push({ ...d, _pos: pos });
    }
    for (let i = 0; i < laneCount; i++) lanes[i].sort((a,b)=>a._pos-b._pos);
  
    // --- FAZA 1: “JAZDA” PASAMI (rzadko -> gęsto), start z losowych miejsc, chwilę “jedzie” ---
    // Idea: w każdej klatce aktywujemy część lanes (narastająco),
    // w każdej lane mamy “głowę” (losowy start) i losowy kierunek (lewo/prawo lub góra/dół),
    // świecimy “ogon” o długości trail w docelowym kolorze (targetFill),
    // a resztę z tej lane (która jeszcze nie ma być ujawniona) wygaszamy do dotOff.
    //
    // UWAGA: działamy tylko na kropkach work (docelowo ON), więc tło nie migocze.
  
    // Stan lane
    const laneState = Array.from({ length: laneCount }, () => ({
      dir: Math.random() < 0.5 ? 1 : -1,
      head: Math.floor(Math.random() * laneLen),
      speed: 1 + (Math.random() < 0.25 ? 1 : 0), // czasem “szybszy pas”
    }));
  
    // Pomocniczo: szybka funkcja “czy kropka jest w ogonie”
    const inTrail = (pos, head, dir, len, L) => {
      // liczymy odległość wzdłuż kierunku (wrap nie robimy — efekt “przelotu” kończy się na krawędzi)
      // trail ciągnie się ZA głową
      const delta = dir === 1 ? (head - pos) : (pos - head);
      return delta >= 0 && delta < len;
    };
  
    // W fazie OUT też możemy zrobić “mazanie” (od środka na zewnątrz) jako jazdę,
    // ale Ty opisujesz głównie IN. Dla OUT robimy krótszą jazdę “rozmazującą”.
    const preludeStepsEff = mode === "out" ? Math.max(8, Math.floor(preludeSteps * 0.6)) : preludeSteps;
  
    for (let s = 0; s < preludeStepsEff; s++) {
      // ile lanes aktywnych w tej klatce (narastająco)
      const t = preludeStepsEff <= 1 ? 1 : (s / (preludeStepsEff - 1));
      const frac = lanesFrom + (lanesTo - lanesFrom) * t;
      const activeCount = Math.max(1, Math.floor(laneCount * frac));
  
      // wybieramy losowy podzbiór lanes (żeby start nie był “od brzegu”)
      // trik: losujemy permutację indeksów i bierzemy pierwsze activeCount
      const idx = new Array(laneCount);
      for (let i = 0; i < laneCount; i++) idx[i] = i;
      for (let i = laneCount - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
      }
      const active = idx.slice(0, activeCount);
  
      // dla aktywnych lanes: przesuń głowę i ustaw ogon
      for (const li of active) {
        const st = laneState[li];
        st.head += st.dir * st.speed;
  
        // odbicie od krawędzi (żeby było “pojeżdżenie”)
        if (st.head < 0) { st.head = 0; st.dir = 1; }
        if (st.head > laneLen - 1) { st.head = laneLen - 1; st.dir = -1; }
  
        const laneDots = lanes[li];
        if (!laneDots.length) continue;
  
        // W tej lane: ON tylko ogon, reszta OFF (ale tylko w obrębie work!)
        for (const d of laneDots) {
          const pos = d._pos;
  
          if (mode === "in") {
            const on = inTrail(pos, st.head, st.dir, trail, laneLen);
            if (on) d.el.setAttribute("fill", d.targetFill);
            else    d.el.setAttribute("fill", dotOff);
          } else {
            // OUT: “rozmazywanie” — ogon oznacza “wycieramy” -> OFF,
            // reszta zostaje jak jest
            const off = inTrail(pos, st.head, st.dir, trail, laneLen);
            if (off) d.el.setAttribute("fill", dotOff);
          }
        }
  
        // lekkie “iskry” w pobliżu (opcjonalnie, ale daje wrażenie życia)
        if (mode === "in" && flicker > 0 && Math.random() < flicker) {
          const laneDots2 = laneDots;
          if (laneDots2.length) {
            const pick = laneDots2[(Math.random() * laneDots2.length) | 0];
            pick.el.setAttribute("fill", pick.targetFill);
          }
        }
      }
  
      if (preludeMs) await sleep(preludeMs);
    }
  
    // --- FAZA 2: “ZBIERANIE W OBRAZ” (dwustronnie: krawędzie -> środek / środek -> krawędzie) ---
    const ring = (pos) => Math.min(pos, (laneLen - 1 - pos));
    const noiseMain = laneLen * 0.55 * scatter;
    const noiseLane = laneCount * 0.25 * scatter;
  
    // sort wg odległości od najbliższej krawędzi (symetrycznie od 2 stron),
    // + szum żeby było bardziej “rozsypane”
    const sorted = work.slice().sort((a, b) => {
      const posA  = vertical ? a.gy : a.gx;
      const posB  = vertical ? b.gy : b.gx;
      const laneA = vertical ? a.gx : a.gy;
      const laneB = vertical ? b.gx : b.gy;
  
      const kA = ring(posA) + (Math.random() - 0.5) * noiseMain;
      const kB = ring(posB) + (Math.random() - 0.5) * noiseMain;
  
      const lA = laneA + (Math.random() - 0.5) * noiseLane;
      const lB = laneB + (Math.random() - 0.5) * noiseLane;
  
      return (kA + lA / laneCount) - (kB + lB / laneCount);
    });
  
    if (mode === "out") sorted.reverse();
  
    const total = sorted.length;
    const batch = clamp(Math.floor(total * density), 120, 2200);
  
    for (let i = 0; i < total; i += batch) {
      const end = Math.min(total, i + batch);
  
      if (mode === "in") {
        for (let k = i; k < end; k++) {
          const d = sorted[k];
          d.el.setAttribute("fill", d.targetFill);
        }
      } else {
        for (let k = i; k < end; k++) {
          const d = sorted[k];
          d.el.setAttribute("fill", dotOff);
        }
      }
  
      if (stepMs) await sleep(stepMs);
    }
  
    // FINAL PASS: brak “niedopalonych”
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
