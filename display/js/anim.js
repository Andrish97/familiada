// anim.js
// Prosty, stabilny animator kafelków 5x7 używany przez scene.js
// Uwaga: ms oznacza PRZYBLIŻONY CAŁKOWITY CZAS animacji dla zadanego obszaru,
// a nie opóźnienie pojedynczego piksela / kafelka.

export function createAnimator({ tileAt, snapArea, clearArea, clearTileAt, dotOff }) {
  const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, Math.max(0, ms | 0)));

  const normArea = (area) => {
    if (!area) throw new Error("Animator: area is required");
    const c1 = Math.min(area.c1, area.c2);
    const c2 = Math.max(area.c1, area.c2);
    const r1 = Math.min(area.r1, area.r2);
    const r2 = Math.max(area.r1, area.r2);
    return { c1, c2, r1, r2 };
  };

  const safeDelayFromTotal = (totalMs, steps, fallback = 0) => {
    const n = Number(totalMs);
    if (!Number.isFinite(n) || n < 0) return fallback;
    const s = Math.max(1, steps | 0);
    // Dzielimy czas na liczbę kroków; minimalnie kilka ms na krok
    const perStep = Math.floor(n / s);
    return Math.max(2, perStep);
  };

  // Ustawia wszystkie piksele w danym kafelku na zadaną wartość fill
  const fillWholeTile = (tile, fill) => {
    if (!tile) return;
    const rows = tile.dots;
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        row[x].setAttribute("fill", fill);
      }
    }
  };

  // Przywraca kafelek ze snapu
  const restoreTileFromSnap = (tile, snapTile) => {
    if (!tile || !snapTile) return;
    const rows = tile.dots;
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      const snapRow = snapTile[y];
      if (!snapRow) continue;
      for (let x = 0; x < row.length; x++) {
        const fill = snapRow[x];
        if (fill != null) row[x].setAttribute("fill", fill);
      }
    }
  };

  // ============================
  // EDGE: linia kafelków z krawędzi
  // ============================
  const inEdge = async (big, area, dir = "left", ms = 200, opts = {}) => {
    const { c1, c2, r1, r2 } = normArea(area);
    const Wt = c2 - c1 + 1;
    const Ht = r2 - r1 + 1;

    // snapshot docelowego stanu
    const snap = snapArea(big, c1, r1, c2, r2);
    // czyścimy cały obszar
    clearArea(big, c1, r1, c2, r2);

    const steps = (dir === "left" || dir === "right") ? Wt : Ht;
    const delay = safeDelayFromTotal(ms, steps, 0);

    const cols = [];
    const rows = [];
    for (let c = c1; c <= c2; c++) cols.push(c);
    for (let r = r1; r <= r2; r++) rows.push(r);

    if (dir === "left") {
      // od lewej do prawej – całe kolumny kafelków
      for (let ci = 0; ci < cols.length; ci++) {
        const c = cols[ci];
        for (let r = r1; r <= r2; r++) {
          const t = tileAt(big, c, r);
          const snapTile = snap[r - r1]?.[c - c1];
          restoreTileFromSnap(t, snapTile);
        }
        if (delay > 0) await sleep(delay);
      }
    } else if (dir === "right") {
      // od prawej do lewej – całe kolumny
      for (let ci = cols.length - 1; ci >= 0; ci--) {
        const c = cols[ci];
        for (let r = r1; r <= r2; r++) {
          const t = tileAt(big, c, r);
          const snapTile = snap[r - r1]?.[c - c1];
          restoreTileFromSnap(t, snapTile);
        }
        if (delay > 0) await sleep(delay);
      }
    } else if (dir === "up") {
      // od góry do dołu – całe wiersze
      for (let ri = 0; ri < rows.length; ri++) {
        const r = rows[ri];
        for (let c = c1; c <= c2; c++) {
          const t = tileAt(big, c, r);
          const snapTile = snap[r - r1]?.[c - c1];
          restoreTileFromSnap(t, snapTile);
        }
        if (delay > 0) await sleep(delay);
      }
    } else if (dir === "down") {
      // od dołu do góry – całe wiersze
      for (let ri = rows.length - 1; ri >= 0; ri--) {
        const r = rows[ri];
        for (let c = c1; c <= c2; c++) {
          const t = tileAt(big, c, r);
          const snapTile = snap[r - r1]?.[c - c1];
          restoreTileFromSnap(t, snapTile);
        }
        if (delay > 0) await sleep(delay);
      }
    } else {
      // nieznany kierunek – pokaż od razu
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const t = tileAt(big, c, r);
          const snapTile = snap[r - r1]?.[c - c1];
          restoreTileFromSnap(t, snapTile);
        }
      }
    }
  };

  const outEdge = async (big, area, dir = "left", ms = 200, opts = {}) => {
    const { c1, c2, r1, r2 } = normArea(area);
    const Wt = c2 - c1 + 1;
    const Ht = r2 - r1 + 1;

    const steps = (dir === "left" || dir === "right") ? Wt : Ht;
    const delay = safeDelayFromTotal(ms, steps, 0);

    const cols = [];
    const rows = [];
    for (let c = c1; c <= c2; c++) cols.push(c);
    for (let r = r1; r <= r2; r++) rows.push(r);

    if (dir === "left") {
      for (let ci = 0; ci < cols.length; ci++) {
        const c = cols[ci];
        for (let r = r1; r <= r2; r++) {
          const t = tileAt(big, c, r);
          fillWholeTile(t, dotOff);
        }
        if (delay > 0) await sleep(delay);
      }
    } else if (dir === "right") {
      for (let ci = cols.length - 1; ci >= 0; ci--) {
        const c = cols[ci];
        for (let r = r1; r <= r2; r++) {
          const t = tileAt(big, c, r);
          fillWholeTile(t, dotOff);
        }
        if (delay > 0) await sleep(delay);
      }
    } else if (dir === "up") {
      for (let ri = 0; ri < rows.length; ri++) {
        const r = rows[ri];
        for (let c = c1; c <= c2; c++) {
          const t = tileAt(big, c, r);
          fillWholeTile(t, dotOff);
        }
        if (delay > 0) await sleep(delay);
      }
    } else if (dir === "down") {
      for (let ri = rows.length - 1; ri >= 0; ri--) {
        const r = rows[ri];
        for (let c = c1; c <= c2; c++) {
          const t = tileAt(big, c, r);
          fillWholeTile(t, dotOff);
        }
        if (delay > 0) await sleep(delay);
      }
    } else {
      // nieznany kierunek – czyścimy wszystko naraz
      clearArea(big, c1, r1, c2, r2);
    }
  };

  // ============================
  // MATRIX: skanowanie wierszy / kolumn pikseli
  // ============================
  const inMatrix = async (big, area, axis = "down", ms = 400, opts = {}) => {
    const { c1, c2, r1, r2 } = normArea(area);
    const Wt = c2 - c1 + 1;
    const Ht = r2 - r1 + 1;

    // snapshot docelowego stanu
    const snap = snapArea(big, c1, r1, c2, r2);
    // czyścimy cały obszar
    clearArea(big, c1, r1, c2, r2);

    // liczba kroków: w MATRIX pracujemy per-wiersz pikseli
    let steps;
    if (axis === "down" || axis === "up") {
      steps = Ht * 7; // 7 wierszy 5x7
    } else {
      steps = Wt * 5; // 5 kolumn 5x7
    }
    const delay = safeDelayFromTotal(ms, steps, 0);

    if (axis === "down" || axis === "up") {
      const rowOrder = [];
      for (let tr = 0; tr < Ht; tr++) rowOrder.push(tr);
      if (axis === "up") rowOrder.reverse(); // "up" = od dołu do góry

      for (const tr of rowOrder) {
        for (let pr = 0; pr < 7; pr++) {
          for (let tc = 0; tc < Wt; tc++) {
            const t = tileAt(big, c1 + tc, r1 + tr);
            const snapTile = snap[tr]?.[tc];
            if (!t || !snapTile) continue;
            const dots = t.dots;
            const snapRow = snapTile[pr];
            if (!snapRow) continue;
            for (let pc = 0; pc < dots[0].length; pc++) {
              dots[pr][pc].setAttribute("fill", snapRow[pc]);
            }
          }
          if (delay > 0) await sleep(delay);
        }
      }
    } else {
      // axis: "left" lub "right"
      const colOrder = [];
      for (let tc = 0; tc < Wt; tc++) colOrder.push(tc);
      // "right" = od lewej do prawej, "left" = od prawej do lewej
      if (axis === "left") colOrder.reverse();

      for (const tc of colOrder) {
        for (let pc = 0; pc < 5; pc++) {
          for (let tr = 0; tr < Ht; tr++) {
            const t = tileAt(big, c1 + tc, r1 + tr);
            const snapTile = snap[tr]?.[tc];
            if (!t || !snapTile) continue;
            const dots = t.dots;
            for (let pr = 0; pr < dots.length; pr++) {
              const snapRow = snapTile[pr];
              if (!snapRow) continue;
              dots[pr][pc].setAttribute("fill", snapRow[pc]);
            }
          }
          if (delay > 0) await sleep(delay);
        }
      }
    }
  };

  const outMatrix = async (big, area, axis = "down", ms = 400, opts = {}) => {
    const { c1, c2, r1, r2 } = normArea(area);
    const Wt = c2 - c1 + 1;
    const Ht = r2 - r1 + 1;

    let steps;
    if (axis === "down" || axis === "up") {
      steps = Ht * 7;
    } else {
      steps = Wt * 5;
    }
    const delay = safeDelayFromTotal(ms, steps, 0);

    if (axis === "down" || axis === "up") {
      const rowOrder = [];
      for (let tr = 0; tr < Ht; tr++) rowOrder.push(tr);
      // dla OUT robimy "down" = od dołu, "up" = od góry (odbicie inMatrix)
      if (axis === "down") rowOrder.reverse();

      for (const tr of rowOrder) {
        for (let pr = 0; pr < 7; pr++) {
          for (let tc = 0; tc < Wt; tc++) {
            const t = tileAt(big, c1 + tc, r1 + tr);
            const dots = t?.dots;
            if (!dots) continue;
            for (let pc = 0; pc < dots[0].length; pc++) {
              dots[pr][pc].setAttribute("fill", dotOff);
            }
          }
          if (delay > 0) await sleep(delay);
        }
      }
    } else {
      const colOrder = [];
      for (let tc = 0; tc < Wt; tc++) colOrder.push(tc);
      if (axis === "right") colOrder.reverse();

      for (const tc of colOrder) {
        for (let pc = 0; pc < 5; pc++) {
          for (let tr = 0; tr < Ht; tr++) {
            const t = tileAt(big, c1 + tc, r1 + tr);
            const dots = t?.dots;
            if (!dots) continue;
            for (let pr = 0; pr < dots.length; pr++) {
              dots[pr][pc].setAttribute("fill", dotOff);
            }
          }
          if (delay > 0) await sleep(delay);
        }
      }
    }
  };

  return {
    inEdge,
    outEdge,
    inMatrix,
    outMatrix,
  };
}
