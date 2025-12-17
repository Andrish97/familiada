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

  const getAreaWH = (area) => {
    const W = area.c2 - area.c1 + 1;
    const H = area.r2 - area.r1 + 1;
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
  
  // Build list wszystkich kropek w obszarze (z docelowym fill ze snapshotu)
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
              gx: tx * 5 + cc, // global w obrębie obszaru
              gy: ty * 7 + rr,
            });
          }
        }
      }
    }
    return dots;
  };
  
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  
  const runRain = async ({
    big,
    area,
    axis = "down",      // down/up/left/right
    stepMs = 24,        // przerwa między paczkami
    density = 0.14,     // 0..1: ile kropek w paczce (większe = “grubsze porcje”)
    jitter = 0.95,      // 0..1: rozproszenie kolejności (większe = bardziej chaotycznie)
    mode = "in",        // "in" | "out"
  } = {}) => {
    const { c1, r1, c2, r2 } = area;
  
    // zawsze bierzemy snapshot docelowego obrazu dla IN
    const snap = snapArea(big, c1, r1, c2, r2);
  
    // IN: czyścimy obszar
    if (mode === "in") clearArea(big, c1, r1, c2, r2);
  
    const dots = buildDotListFromSnap(big, area, snap);
    if (!dots.length) return;
  
    // Rozmiar obszaru w “kropkach”
    const tilesW = c2 - c1 + 1;
    const tilesH = r2 - r1 + 1;
    const W = tilesW * 5;
    const H = tilesH * 7;
  
    // Lane = kolumny (gdy oś pionowa) lub wiersze (gdy oś pozioma)
    // Każda lane ma LOSOWY kierunek startu: raz z góry, raz z dołu / raz z lewej, raz z prawej.
    const vertical = (axis === "down" || axis === "up");
    const laneCount = vertical ? W : H;
  
    const laneDir = new Array(laneCount);
    for (let i = 0; i < laneCount; i++) {
      // true = start “od przodu osi”, false = od przeciwnej strony
      // czyli: przy pionie -> raz top->bottom, raz bottom->top
      // przy poziomie -> raz left->right, raz right->left
      laneDir[i] = Math.random() < 0.5;
    }
  
    // Filtr: żeby nie było efektu “tekst pojawia się od razu a wokół mruga”
    // IN: animujemy TYLKO te kropki, które docelowo mają świecić.
    // OUT: animujemy TYLKO te, które aktualnie świecą (lub docelowo świecą), żeby było “co wyłączać”.
    let work = dots;
  
    if (mode === "in") {
      work = dots.filter(d => d.targetFill !== dotOff);
    } else {
      // OUT: bierzemy te, które w tym momencie nie są dotOff (czyli świecą)
      work = dots.filter(d => d.el.getAttribute("fill") !== dotOff);
    }
  
    if (!work.length) return;
  
    // Klucz sortowania: najpierw lane, potem pozycja w lane zależnie od losowego kierunku tej lane
    const spanMain = vertical ? H : W;             // długość lane
    const spanLane = laneCount;                    // ile lane
    const noiseSpan = spanMain * jitter;
  
    work.sort((a, b) => {
      const la = vertical ? a.gx : a.gy;           // lane index
      const lb = vertical ? b.gx : b.gy;
  
      const pa = vertical ? a.gy : a.gx;           // pozycja w lane
      const pb = vertical ? b.gy : b.gx;
  
      const da = laneDir[la];
      const db = laneDir[lb];
  
      // kierunek lane: start raz z jednej, raz z drugiej strony
      const ka = (da ? pa : (spanMain - 1 - pa)) + (Math.random() - 0.5) * noiseSpan;
      const kb = (db ? pb : (spanMain - 1 - pb)) + (Math.random() - 0.5) * noiseSpan;
  
      // lane też mieszamy odrobinę, żeby “nie było pasów”
      const laneNoise = (Math.random() - 0.5) * (spanLane * 0.20);
  
      return (la + laneNoise + ka / spanMain) - (lb + laneNoise + kb / spanMain);
    });
  
    // batch size
    const total = work.length;
    const batch = clamp(Math.floor(total * density), 60, 1200);
  
    // animacja porcjami
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
  
    // FINAL PASS = brak niedopalonych pikseli
    // IN: ustaw cały obszar zgodnie ze snapshotem (ON i OFF)
    if (mode === "in") {
      for (const d of dots) d.el.setAttribute("fill", d.targetFill);
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
