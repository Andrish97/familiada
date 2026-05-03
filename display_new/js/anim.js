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
}) {
  const clampMs = (ms, fallback) => {
    const n = Number(ms);
    const base = Number.isFinite(n) ? n : fallback;
    return Math.max(0, base | 0);
  };

  const sleepStep = async (msPerStep) => {
    const t = clampMs(msPerStep, 0);
    if (t <= 0) return;
    await sleep(t);
  };

  // ===== helpers do iteracji po kafelkach =====
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

    // wyczyść cały obszar zanim zaczniemy rysować
    clearArea(big, A.c1, A.r1, A.c2, A.r2);

    const order = buildEdgeTileOrder(A, dir);
    const steps = order.length || 1;
    const stepMs = clampMs(totalMs, 0) / steps;

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
      await sleepStep(stepMs);
    }
  }

  async function outEdge(big, area, dir = "left", totalMs = 300, opts = {}) {
    const A = area || { c1: 1, r1: 1, c2: 30, r2: 10 };

    const order = buildEdgeTileOrder(A, dir);
    const steps = order.length || 1;
    const stepMs = clampMs(totalMs, 0) / steps;

    for (const { c, r } of order) {
      clearTileAt(big, c, r);
      await sleepStep(stepMs);
    }
  }

  // ============================================================
  // MATRIX – animacja piksel po pikselu
  // axis: "down" | "up" | "left" | "right"
  //
  // TEJ CZĘŚCI NIE DOTYKAMY – działa jak chciałeś.
  // ============================================================
  async function inMatrix(big, area, axis = "down", totalMs = 600, opts = {}) {
    const A = area || { c1: 1, r1: 1, c2: 30, r2: 10 };
    const snap = snapArea(big, A.c1, A.r1, A.c2, A.r2);

    // czyścimy obszar
    clearArea(big, A.c1, A.r1, A.c2, A.r2);

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

    const stepMs = clampMs(totalMs, 0) / (steps || 1);

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

        await sleepStep(stepMs);
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

        await sleepStep(stepMs);
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

    const stepMs = clampMs(totalMs, 0) / (steps || 1);

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

        await sleepStep(stepMs);
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

        await sleepStep(stepMs);
      }
    }
  }

  return {
    inEdge,
    outEdge,
    inMatrix,
    outMatrix,
  };
}
