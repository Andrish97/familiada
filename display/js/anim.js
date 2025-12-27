// anim.js
// Bardziej “higieniczny” animator: jeden spójny createAnimator, 4 funkcje publiczne.
// Edge/Matrix działają na poziomie kafelków (5x7), bez cudów z pikselami.

export const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms | 0)));

const range = (n) => Array.from({ length: Math.max(0, n | 0) }, (_, i) => i);

export function createAnimator({ tileAt, snapArea, clearArea, clearTileAt, dotOff }) {
  // Mały helper: czy area jest sensowna?
  const normArea = (area) => {
    if (!area) throw new Error("Animator: brak area");
    const c1 = area.c1 | 0;
    const r1 = area.r1 | 0;
    const c2 = area.c2 | 0;
    const r2 = area.r2 | 0;
    if (c2 < c1 || r2 < r1) throw new Error("Animator: area z ujemnym rozmiarem");
    return { c1, r1, c2, r2 };
  };

  // Odtej pory ms traktujemy jako *krok* (tak jak robisz w scene.js)
  const normMs = (ms, fallback = 20) => {
    const base = Number.isFinite(ms) ? ms : fallback;
    return Math.max(0, base | 0);
  };

  // Odtwarzanie jednego kafla z snapshotu (snapArea)
  const restoreTileFromSnap = (big, snap, area, col, row) => {
    const { c1, r1 } = area;
    const tx = col - c1;
    const ty = row - r1;
    const tile = tileAt(big, col, row);
    const data = snap?.[ty]?.[tx];
    if (!tile || !data) return;
    for (let rr = 0; rr < tile.dots.length; rr++) {
      for (let cc = 0; cc < tile.dots[0].length; cc++) {
        const fill = data?.[rr]?.[cc];
        if (fill != null) tile.dots[rr][cc].setAttribute("fill", fill);
      }
    }
  };

  // Grupowanie pól w “pasy” (kolumny lub wiersze)
  const buildEdgeGroups = (area, dir) => {
    const { c1, r1, c2, r2 } = normArea(area);
    const groups = [];

    switch ((dir || "").toLowerCase()) {
      case "left": {
        // Wchodzi od prawej do lewej – pasami kolumnowymi
        for (let c = c2; c >= c1; c--) {
          const g = [];
          for (let r = r1; r <= r2; r++) g.push({ c, r });
          groups.push(g);
        }
        break;
      }
      case "right": {
        for (let c = c1; c <= c2; c++) {
          const g = [];
          for (let r = r1; r <= r2; r++) g.push({ c, r });
          groups.push(g);
        }
        break;
      }
      case "up": {
        // od dołu do góry – pasy wierszy
        for (let r = r2; r >= r1; r--) {
          const g = [];
          for (let c = c1; c <= c2; c++) g.push({ c, r });
          groups.push(g);
        }
        break;
      }
      case "down":
      default: {
        for (let r = r1; r <= r2; r++) {
          const g = [];
          for (let c = c1; c <= c2; c++) g.push({ c, r });
          groups.push(g);
        }
        break;
      }
    }
    return groups;
  };

  // Matrix – na razie też “pasy”, tylko inne osie (dla odróżnienia)
  const buildMatrixGroups = (area, axis) => {
    const { c1, r1, c2, r2 } = normArea(area);
    const groups = [];

    switch ((axis || "").toLowerCase()) {
      case "left": {
        // od prawej do lewej, ale w “matrix” użyjemy wierszy
        for (let r = r1; r <= r2; r++) {
          const g = [];
          for (let c = c2; c >= c1; c--) g.push({ c, r });
          groups.push(g);
        }
        break;
      }
      case "right": {
        for (let r = r1; r <= r2; r++) {
          const g = [];
          for (let c = c1; c <= c2; c++) g.push({ c, r });
          groups.push(g);
        }
        break;
      }
      case "up": {
        for (let c = c1; c <= c2; c++) {
          const g = [];
          for (let r = r2; r >= r1; r--) g.push({ c, r });
          groups.push(g);
        }
        break;
      }
      case "down":
      default: {
        for (let c = c1; c <= c2; c++) {
          const g = [];
          for (let r = r1; r <= r2; r++) g.push({ c, r });
          groups.push(g);
        }
        break;
      }
    }
    return groups;
  };

  // ==========================
  // EDGE IN
  // ==========================
  async function inEdge(big, area, dir = "left", ms = 20, opts = {}) {
    const A = normArea(area);
    const step = normMs(ms, 20);

    const snap = snapArea(big, A.c1, A.r1, A.c2, A.r2);
    clearArea(big, A.c1, A.r1, A.c2, A.r2);

    const groups = buildEdgeGroups(A, dir);

    for (const group of groups) {
      for (const { c, r } of group) {
        restoreTileFromSnap(big, snap, A, c, r);
      }
      if (step > 0) await sleep(step);
    }
  }

  // ==========================
  // EDGE OUT
  // ==========================
  async function outEdge(big, area, dir = "left", ms = 20, opts = {}) {
    const A = normArea(area);
    const step = normMs(ms, 20);
    const groups = buildEdgeGroups(A, dir);

    for (const group of groups) {
      for (const { c, r } of group) {
        clearTileAt(big, c, r);
      }
      if (step > 0) await sleep(step);
    }
  }

  // ==========================
  // MATRIX IN
  // ==========================
  async function inMatrix(big, area, axis = "down", ms = 20, opts = {}) {
    const A = normArea(area);
    const step = normMs(ms, 20);

    const snap = snapArea(big, A.c1, A.r1, A.c2, A.r2);
    clearArea(big, A.c1, A.r1, A.c2, A.r2);

    const groups = buildMatrixGroups(A, axis);

    for (const group of groups) {
      for (const { c, r } of group) {
        restoreTileFromSnap(big, snap, A, c, r);
      }
      if (step > 0) await sleep(step);
    }
  }

  // ==========================
  // MATRIX OUT
  // ==========================
  async function outMatrix(big, area, axis = "down", ms = 20, opts = {}) {
    const A = normArea(area);
    const step = normMs(ms, 20);
    const groups = buildMatrixGroups(A, axis);

    for (const group of groups) {
      for (const { c, r } of group) {
        clearTileAt(big, c, r);
      }
      if (step > 0) await sleep(step);
    }
  }

  return {
    inEdge,
    outEdge,
    inMatrix,
    outMatrix,
  };
}
