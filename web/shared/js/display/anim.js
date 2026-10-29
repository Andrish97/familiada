// anim.js - prosty silnik animacji kafelków 5x7

export const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {Object} deps
 * @param {(big: any, col1:number, row1:number) => { dots: SVGCircleElement[][] }} deps.tileAt
 * @param {(big: any, c1:number, r1:number, c2:number, r2:number) => any[][]} deps.snapArea
 * @param {(big: any, c1:number, r1:number, c2:number, r2:number) => void} deps.clearArea
 * @param {(big: any, col1:number, row1:number) => void} deps.clearTileAt
 * @param {string} deps.dotOff
 */
export function createAnimator({
  tileAt,
  snapArea,
  clearArea,
  clearTileAt,
  dotOff,
  getGeneration = () => 0,
  now = () => performance.now(),
  wait = sleep,
}) {
  const clampMs = (ms, fallback) => {
    const n = Number(ms);
    const base = Number.isFinite(n) ? n : fallback;
    return Math.max(0, base | 0);
  };

  // Karta w tle nie dostaje klatek (requestAnimationFrame stoi), więc
  // czekanie na klatkę zatrzymałoby animację do powrotu karty, a z nią
  // potwierdzenie planszy dla Control (przyciski Control zablokowane).
  // Ukryta karta kończy krok od razu: obrazu i tak nikt nie widzi.
  const pageHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
  const nextFrame = () => new Promise((resolve) => {
    if (typeof document === "undefined") { requestAnimationFrame(resolve); return; }
    let frameId = null;
    const done = () => {
      if (frameId != null) cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", done);
      resolve();
    };
    document.addEventListener("visibilitychange", done);
    frameId = requestAnimationFrame(done);
  });

  // Każdy krok ma termin w jednej osi czasu. Koszt SVG i opóźnienie
  // wcześniejszego timera nie są dodawane ponownie do kolejnych pauz.
  const stepPacer = (totalMs, steps) => {
    const token = getGeneration();
    const check = () => { if (token !== getGeneration()) throw Object.assign(new Error("Animation cancelled"), { name: "AbortError" }); };
    const start = now();
    const duration = clampMs(totalMs, 0);
    let completed = 0;
    return async () => {
      check();
      const deadline = start + duration * (++completed) / (steps || 1);
      while (now() < deadline) {
        check();
        if (pageHidden()) break;
        // Zmiany SVG grupujemy według klatek, zamiast budzić główny wątek
        // osobnym timerem dla każdego kafelka/paska pikseli.
        if (wait === sleep && typeof requestAnimationFrame === "function") {
          await nextFrame();
        } else {
          await wait(Math.max(1, deadline - now()));
        }
      }
      check();
    };
  };

  // ===== helpers do iteracji po kafelkach =====
  // Stan początkowy animacji wejścia: pusto albo poprzednia zawartość pola
  // (opts.from — zrzut sprzed zmiany). Z poprzednią zawartością czoło fali
  // nadpisuje stare znaki (np. kropki odpowiedzi) zamiast gasić całe pole
  // naraz przed odsłanianiem.
  const paintStart = (big, A, opts) => {
    const from = opts?.from;
    if (!from) { clearArea(big, A.c1, A.r1, A.c2, A.r2); return; }
    for (let r = A.r1; r <= A.r2; r++) {
      for (let c = A.c1; c <= A.c2; c++) {
        const t = tileAt(big, c, r);
        const tile = from[r - A.r1]?.[c - A.c1];
        if (!t) continue;
        if (!tile) { clearTileAt(big, c, r); continue; }
        for (let py = 0; py < 7; py++) {
          for (let px = 0; px < 5; px++) t.dots[py][px].setAttribute("fill", tile[py][px]);
        }
      }
    }
  };

  const makeTileGrid = (area) => {
    const cols = [];
    for (let c = area.c1; c <= area.c2; c++) cols.push(c);
    const rows = [];
    for (let r = area.r1; r <= area.r2; r++) rows.push(r);
    return { cols, rows, w: cols.length, h: rows.length };
  };

  // ============================================================
  // EDGE – animacja całymi KAFELKAMI 5x7 w odpowiedniej kolejności
  //
  // dir = "right":
  //   kolumny od prawej do lewej, w kolumnie: od góry do dołu
  //
  // dir = "left":
  //   kolumny od lewej do prawej, w kolumnie: od góry do dołu
  //
  // dir = "up":
  //   rzędy od góry do dołu, w rzędzie: od lewej do prawej
  //
  // dir = "down":
  //   rzędy od dołu do góry, w rzędzie: od lewej do prawej
  //
  // Całkowity czas animacji ~ totalMs.
  // ============================================================

  const buildEdgeTileOrder = (area, dir = "left") => {
    const A = area;
    const { cols, rows } = makeTileGrid(A);
    const d = (dir ?? "left").toLowerCase();
    const order = [];

    if (d === "left" || d === "right") {
      const colSeq = d === "right" ? [...cols].reverse() : cols;
      // kolumny → w każdej kafelki od góry w dół
      for (const c of colSeq) {
        for (const r of rows) {
          order.push({ c, r });
        }
      }
    } else if (d === "up" || d === "down") {
      const rowSeq = d === "down" ? [...rows].reverse() : rows;
      // rzędy → w każdym kafelki od lewej do prawej
      for (const r of rowSeq) {
        for (const c of cols) {
          order.push({ c, r });
        }
      }
    } else {
      // fallback – jak "left"
      for (const c of cols) {
        for (const r of rows) {
          order.push({ c, r });
        }
      }
    }

    return order;
  };

  async function inEdge(big, area, dir = "left", totalMs = 300, opts = {}) {
    const A = area || { c1: 1, r1: 1, c2: 30, r2: 10 };

    // snapshot docelowego stanu
    const snap = snapArea(big, A.c1, A.r1, A.c2, A.r2);

    // wyczyść obszar (albo pokaż poprzednią zawartość) zanim zaczniemy rysować
    paintStart(big, A, opts);

    const order = buildEdgeTileOrder(A, dir);
    const steps = order.length || 1;
    const pace = stepPacer(totalMs, steps);

    const rowOffset = A.r1;
    const colOffset = A.c1;

    for (const { c, r } of order) {
      const t = tileAt(big, c, r);
      const snapTile = snap[r - rowOffset]?.[c - colOffset];
      if (t && snapTile) {
        for (let py = 0; py < 7; py++) {
          for (let px = 0; px < 5; px++) {
            t.dots[py][px].setAttribute("fill", snapTile[py][px]);
          }
        }
      }
      await pace();
    }
  }

  async function outEdge(big, area, dir = "left", totalMs = 300, opts = {}) {
    const A = area || { c1: 1, r1: 1, c2: 30, r2: 10 };

    const order = buildEdgeTileOrder(A, dir);
    const steps = order.length || 1;
    const pace = stepPacer(totalMs, steps);

    for (const { c, r } of order) {
      clearTileAt(big, c, r);
      await pace();
    }
  }

  // ============================================================
  // MATRIX – animacja piksel po pikselu
  // axis: "down" | "up" | "left" | "right"
  //
  // Kolejność pikseli pozostaje taka sama; pauzy korzystają ze wspólnego
  // czasu animacji zamiast dodawać koszt każdego poprzedniego kroku.
  // ============================================================
  async function inMatrix(big, area, axis = "down", totalMs = 600, opts = {}) {
    const A = area || { c1: 1, r1: 1, c2: 30, r2: 10 };
    const snap = snapArea(big, A.c1, A.r1, A.c2, A.r2);

    // czyścimy obszar (albo zostawiamy poprzednią zawartość do nadpisania)
    paintStart(big, A, opts);

    const Wt = A.c2 - A.c1 + 1; // liczba kafelków w poziomie
    const Ht = A.r2 - A.r1 + 1; // liczba kafelków w pionie

    let steps = 0;
    let order = [];

    if (axis === "down" || axis === "up") {
      const totalPixelRows = Ht * 7;
      order = Array.from({ length: totalPixelRows }, (_, i) => i);
      if (axis === "up") order.reverse(); // fala w górę
      steps = totalPixelRows;
    } else {
      const totalPixelCols = Wt * 5;
      order = Array.from({ length: totalPixelCols }, (_, i) => i);
      if (axis === "left") {
        // fala w lewo → zaczynamy z prawej
        order.reverse();
      }
      steps = totalPixelCols;
    }

    const pace = stepPacer(totalMs, steps);

    const rowOffset = A.r1;
    const colOffset = A.c1;

    if (axis === "down" || axis === "up") {
      // każdy "krok" to jeden pasek pikseli w poziomie
      for (const gpr of order) {
        const tileRow = Math.floor(gpr / 7);
        const pixRow = gpr % 7;

        const r = rowOffset + tileRow;
        if (r < A.r1 || r > A.r2) continue;

        const snapRowIndex = tileRow;
        for (let c = A.c1; c <= A.c2; c++) {
          const t = tileAt(big, c, r);
          const snapTile = snap[snapRowIndex]?.[c - colOffset];
          if (!t || !snapTile) continue;

          for (let px = 0; px < 5; px++) {
            t.dots[pixRow][px].setAttribute("fill", snapTile[pixRow][px]);
          }
        }

        await pace();
      }
    } else {
      // LEFT/RIGHT – każdy "krok" to jedna pionowa kolumna pikseli
      for (const gpc of order) {
        const tileCol = Math.floor(gpc / 5);
        const pixCol = gpc % 5;

        const c = colOffset + tileCol;
        if (c < A.c1 || c > A.c2) continue;

        const snapColIndex = tileCol;
        for (let r = A.r1; r <= A.r2; r++) {
          const t = tileAt(big, c, r);
          const snapTile = snap[r - rowOffset]?.[snapColIndex];
          if (!t || !snapTile) continue;

          for (let py = 0; py < 7; py++) {
            t.dots[py][pixCol].setAttribute("fill", snapTile[py][pixCol]);
          }
        }

        await pace();
      }
    }
  }

  async function outMatrix(big, area, axis = "down", totalMs = 600, opts = {}) {
    const A = area || { c1: 1, r1: 1, c2: 30, r2: 10 };

    const Wt = A.c2 - A.c1 + 1;
    const Ht = A.r2 - A.r1 + 1;

    let steps = 0;
    let order = [];

    if (axis === "down" || axis === "up") {
      const totalPixelRows = Ht * 7;
      order = Array.from({ length: totalPixelRows }, (_, i) => i);
      if (axis === "up") order.reverse();
      steps = totalPixelRows;
    } else {
      const totalPixelCols = Wt * 5;
      order = Array.from({ length: totalPixelCols }, (_, i) => i);
      if (axis === "left") order.reverse();
      steps = totalPixelCols;
    }

    const pace = stepPacer(totalMs, steps);

    const rowOffset = A.r1;
    const colOffset = A.c1;

    if (axis === "down" || axis === "up") {
      for (const gpr of order) {
        const tileRow = Math.floor(gpr / 7);
        const pixRow = gpr % 7;

        const r = rowOffset + tileRow;
        if (r < A.r1 || r > A.r2) continue;

        for (let c = A.c1; c <= A.c2; c++) {
          const t = tileAt(big, c, r);
          if (!t) continue;
          for (let px = 0; px < 5; px++) {
            t.dots[pixRow][px].setAttribute("fill", dotOff);
          }
        }

        await pace();
      }
    } else {
      for (const gpc of order) {
        const tileCol = Math.floor(gpc / 5);
        const pixCol = gpc % 5;

        const c = colOffset + tileCol;
        if (c < A.c1 || c > A.c2) continue;

        for (let r = A.r1; r <= A.r2; r++) {
          const t = tileAt(big, c, r);
          if (!t) continue;
          for (let py = 0; py < 7; py++) {
            t.dots[py][pixCol].setAttribute("fill", dotOff);
          }
        }

        await pace();
      }
    }
  }

  // ============================================================
  // TRANSITION – przejście planszy (decyzja właściciela 2026-10-29):
  // stara zawartość znika losowo wyrywanymi kawałkami rzędów (1–3 kafle),
  // a pod koniec tego znikania nowa plansza już się odsłania w kolejności
  // czytania: rzędy od góry, w rzędzie kafle od lewej (każdy kafel
  // kolumnami pikseli), puste kafle pomijane. Odsłonięte piksele mają
  // pierwszeństwo: wyrwanie kawałka nie gasi tego, co nowa plansza już
  // narysowała. Nowa zawartość musi być już narysowana w obszarze;
  // opts.from to zrzut obszaru sprzed zmiany (snapArea).
  // ============================================================
  async function transition(big, area, { from, outMs = 900, inMs = 1300, overlapMs = 500, rng = Math.random } = {}) {
    const A = area || { c1: 1, r1: 1, c2: 30, r2: 10 };
    const to = snapArea(big, A.c1, A.r1, A.c2, A.r2);
    paintStart(big, A, { from });
    const lit = (tile) => !!tile && tile.some((row) => row.some((fill) => fill !== dotOff));
    const key = (r, c) => r * 1000 + c;

    // Kawałki rzędów do wyrwania: tylko te, na których coś świeci (puste
    // nie dają widocznego kroku).
    const pieces = [];
    for (let r = A.r1; r <= A.r2; r++) {
      let c = A.c1;
      while (c <= A.c2) {
        const len = Math.min(A.c2 - c + 1, 1 + Math.floor(rng() * 3));
        const cols = [];
        for (let i = 0; i < len; i++) cols.push(c + i);
        if (cols.some((col) => lit(from?.[r - A.r1]?.[col - A.c1]))) pieces.push({ r, cols });
        c += len;
      }
    }
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }

    // Odsłanianie: świecące kafle nowej planszy w kolejności czytania,
    // po 5 kroków (kolumn pikseli) na kafel.
    const reveal = [];
    for (let r = A.r1; r <= A.r2; r++) {
      for (let c = A.c1; c <= A.c2; c++) {
        if (!lit(to[r - A.r1]?.[c - A.c1])) continue;
        for (let px = 0; px < 5; px++) reveal.push({ r, c, px });
      }
    }

    const outTotal = clampMs(outMs, 0);
    const inStart = Math.max(0, outTotal - clampMs(overlapMs, 0));
    const inTotal = clampMs(inMs, 0);
    const events = [];
    pieces.forEach((piece, i) => events.push({ t: outTotal * (i + 1) / pieces.length, out: piece }));
    reveal.forEach((step, i) => events.push({ t: inStart + inTotal * (i + 1) / reveal.length, step }));
    events.sort((a, b) => a.t - b.t || (a.step ? -1 : 1));

    const painted = new Map(); // kafel -> liczba odsłoniętych kolumn pikseli
    const token = getGeneration();
    const check = () => { if (token !== getGeneration()) throw Object.assign(new Error("Animation cancelled"), { name: "AbortError" }); };
    const start = now();
    for (const ev of events) {
      while (now() < start + ev.t) {
        check();
        if (pageHidden()) break;
        if (wait === sleep && typeof requestAnimationFrame === "function") await nextFrame();
        else await wait(Math.max(1, start + ev.t - now()));
      }
      check();
      if (ev.out) {
        for (const c of ev.out.cols) {
          const t = tileAt(big, c, ev.out.r);
          if (!t) continue;
          const done = painted.get(key(ev.out.r, c)) || 0;
          for (let py = 0; py < 7; py++) {
            for (let px = done; px < 5; px++) t.dots[py][px].setAttribute("fill", dotOff);
          }
        }
      } else {
        const { r, c, px } = ev.step;
        const t = tileAt(big, c, r);
        const tile = to[r - A.r1]?.[c - A.c1];
        if (t && tile) for (let py = 0; py < 7; py++) t.dots[py][px].setAttribute("fill", tile[py][px]);
        painted.set(key(r, c), px + 1);
      }
    }
  }

  return {
    transition,
    inEdge,
    outEdge,
    inMatrix,
    outMatrix,
  };
}
