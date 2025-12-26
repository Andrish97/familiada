// anim.js
// Prosty animator dla wyświetlacza 5x7-tiles
// API:
//
// const anim = createAnimator({ tileAt, snapArea, clearArea, clearTileAt, dotOff });
//
// anim.inEdge(big, area, dir, ms, opts)
// anim.outEdge(big, area, dir, ms, opts)
// anim.inMatrix(big, area, axis, ms, opts)
// anim.outMatrix(big, area, axis, ms, opts)

export function createAnimator({ tileAt, snapArea, clearArea, clearTileAt, dotOff }) {
  const sleep = (ms) =>
    ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

  const safeInt = (n) => {
    const x = Number.isFinite(n) ? n : 0;
    return x | 0;
  };

  const range = (n) => {
    const len = Math.max(0, safeInt(n));
    return Array.from({ length: len }, (_, i) => i);
  };

  const clampArea = (area) => {
    // minimalne sanity-checki, żeby nigdy nie zrobić length < 0
    const c1 = safeInt(area?.c1 ?? 1);
    const r1 = safeInt(area?.r1 ?? 1);
    const c2 = safeInt(area?.c2 ?? c1);
    const r2 = safeInt(area?.r2 ?? r1);
    return {
      c1: Math.min(c1, c2),
      c2: Math.max(c1, c2),
      r1: Math.min(r1, r2),
      r2: Math.max(r1, r2),
    };
  };

  const colsOrder = (area, dir) => {
    const A = clampArea(area);
    const cols = range(A.c2 - A.c1 + 1).map((i) => A.c1 + i);
    if ((dir ?? "").toLowerCase() === "right") cols.reverse();
    return cols;
  };

  const rowsOrder = (area, axis) => {
    const A = clampArea(area);
    const rows = range(A.r2 - A.r1 + 1).map((i) => A.r1 + i);
    const ax = (axis ?? "").toLowerCase();
    if (ax === "up") rows.reverse();
    // "down" oraz inne traktujemy tak samo
    return rows;
  };

  // =====================================================================
  // EDGE OUT – wycieranie kolumna po kolumnie od krawędzi
  // =====================================================================
  async function outEdge(big, area, dir = "left", ms = 12, opts = {}) {
    const A = clampArea(area);
    const cols = colsOrder(A, dir);
    const stepMs = safeInt(ms);

    for (const c of cols) {
      for (let r = A.r1; r <= A.r2; r++) {
        clearTileAt(big, c, r);
      }
      await sleep(stepMs);
    }
  }

  // =====================================================================
  // EDGE IN – najpierw czyścimy obszar, potem odsłaniamy kolumny
  // z wcześniej zrobionego snapshota
  // =====================================================================
  async function inEdge(big, area, dir = "left", ms = 12, opts = {}) {
    const A = clampArea(area);
    const cols = colsOrder(A, dir);
    const stepMs = safeInt(ms);

    // Snapshot zawartości docelowej
    const snap = snapArea(big, A.c1, A.r1, A.c2, A.r2);

    // Startujemy od pustego obszaru
    clearArea(big, A.c1, A.r1, A.c2, A.r2);

    // Odsłaniamy kolumny w kolejności od wewnątrz
    for (const c of cols) {
      const sx = c - A.c1;
      for (let r = A.r1; r <= A.r2; r++) {
        const sy = r - A.r1;
        const tileSnap = snap?.[sy]?.[sx];
        if (!tileSnap) continue;
        const t = tileAt(big, c, r);
        if (!t) continue;

        for (let yy = 0; yy < 7; yy++) {
          for (let xx = 0; xx < 5; xx++) {
            const fill = tileSnap[yy]?.[xx] ?? dotOff;
            t.dots[yy][xx].setAttribute("fill", fill);
          }
        }
      }
      await sleep(stepMs);
    }
  }

  // =====================================================================
  // MATRIX OUT – wycieranie wiersz po wierszu (góra/dół)
  // =====================================================================
  async function outMatrix(big, area, axis = "down", ms = 36, opts = {}) {
    const A = clampArea(area);
    const rows = rowsOrder(A, axis);
    const stepMs = safeInt(ms);

    for (const r of rows) {
      for (let c = A.c1; c <= A.c2; c++) {
        clearTileAt(big, c, r);
      }
      await sleep(stepMs);
    }
  }

  // =====================================================================
  // MATRIX IN – najpierw czyścimy obszar, potem odsłaniamy wiersze
  // z wcześniej zrobionego snapshota
  // =====================================================================
  async function inMatrix(big, area, axis = "down", ms = 36, opts = {}) {
    const A = clampArea(area);
    const rows = rowsOrder(A, axis);
    const stepMs = safeInt(ms);

    const snap = snapArea(big, A.c1, A.r1, A.c2, A.r2);
    clearArea(big, A.c1, A.r1, A.c2, A.r2);

    for (const r of rows) {
      const sy = r - A.r1;
      for (let c = A.c1; c <= A.c2; c++) {
        const sx = c - A.c1;
        const tileSnap = snap?.[sy]?.[sx];
        if (!tileSnap) continue;
        const t = tileAt(big, c, r);
        if (!t) continue;

        for (let yy = 0; yy < 7; yy++) {
          for (let xx = 0; xx < 5; xx++) {
            const fill = tileSnap[yy]?.[xx] ?? dotOff;
            t.dots[yy][xx].setAttribute("fill", fill);
          }
        }
      }
      await sleep(stepMs);
    }
  }

  return {
    inEdge,
    outEdge,
    inMatrix,
    outMatrix,
  };
}
