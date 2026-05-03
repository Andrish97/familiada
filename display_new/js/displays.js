// displays.js
// Moduł renderujący 6 wyświetlaczy w SVG na podstawie geometrii

import { GEOMETRY, Wgrid, Hgrid } from "./display-geometry.js";

export function createDisplays({ svgGroup, multiplier = 1.0 }) {
  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const { displays, panels, longs, gapCells: gapCellsBase } = GEOMETRY;
  const allDisplays = [displays.big, panels.leftPanel, panels.rightPanel, panels.topPanel, longs.long1, longs.long2];

  function buildTiledDisplay(geo, mult) {
    const { cx, cy, tilesX, tilesY, dotSize, gap } = geo;
    const gapCells = 2 * dotSize;
    const wSmall = Wgrid(5, dotSize, gap);
    const hSmall = Hgrid(7, dotSize, gap);

    const m = mult;
    const w = (tilesX * wSmall + (tilesX - 1) * gapCells + 2 * gap) * m;
    const h = (tilesY * hSmall + (tilesY - 1) * gapCells + 2 * gap) * m;
    const x = cx - w / 2;
    const y = cy - h / 2;

    const g = el("g");

    // Tło
    g.appendChild(el("rect", { x, y, width: w, height: h, fill: "#2e2e32" }));

    // Kafelki i kropki
    const tiles = Array.from({ length: tilesY }, () =>
      Array.from({ length: tilesX }, () => null)
    );

    const r = (dotSize * m) / 2;
    const stepX = (wSmall + gapCells) * m;
    const stepY = (hSmall + gapCells) * m;
    const pad = gap * m;

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const tileG = el("g");
        const cellX = x + pad + tx * stepX;
        const cellY = y + pad + ty * stepY;

        // Tło komórki
        tileG.appendChild(
          el("rect", {
            x: cellX,
            y: cellY,
            width: wSmall * m,
            height: hSmall * m,
            fill: "#000000",
          })
        );

        // Kropki
        const dots = [];
        for (let row = 0; row < 7; row++) {
          const dotsRow = [];
          for (let col = 0; col < 5; col++) {
            const circle = el("circle", {
              cx: cellX + pad + r + col * (dotSize * m + pad),
              cy: cellY + pad + r + row * (dotSize * m + pad),
              r: r,
              fill: "#2e2e32",
            });
            tileG.appendChild(circle);
            dotsRow.push(circle);
          }
          dots.push(dotsRow);
        }

        g.appendChild(tileG);
        tiles[ty][tx] = { dots };
      }
    }

    svgGroup.appendChild(g);

    return {
      geo,
      tiles,
      tilesX,
      tilesY,
      setDotColor(tx, ty, row, col, color) {
        const t = tiles[ty]?.[tx];
        const c = t?.dots[row]?.[col];
        if (c) c.setAttribute("fill", color);
      },
      clear() {
        for (let ty = 0; ty < tilesY; ty++)
          for (let tx = 0; tx < tilesX; tx++)
            for (let row = 0; row < 7; row++)
              for (let col = 0; col < 5; col++)
                this.setDotColor(tx, ty, row, col, "#2e2e32");
      },
      snapshot() {
        const snap = [];
        for (let ty = 0; ty < tilesY; ty++) {
          const rowSnap = [];
          for (let tx = 0; tx < tilesX; tx++) {
            const t = tiles[ty][tx];
            if (!t) { rowSnap.push(null); continue; }
            rowSnap.push(
              t.dots.map(r => r.map(c => c.getAttribute("fill")))
            );
          }
          snap.push(rowSnap);
        }
        return snap;
      },
      restore(snap) {
        if (!snap) return;
        for (let ty = 0; ty < Math.min(snap.length, tilesY); ty++) {
          for (let tx = 0; tx < Math.min(snap[ty].length, tilesX); tx++) {
            const tileData = snap[ty][tx];
            if (!tileData) continue;
            const t = tiles[ty][tx];
            if (!t) continue;
            for (let row = 0; row < 7; row++) {
              for (let col = 0; col < 5; col++) {
                const fill = tileData[row]?.[col];
                if (fill != null) {
                  t.dots[row][col].setAttribute("fill", fill);
                }
              }
            }
          }
        }
      },
    };
  }

  function buildDotPanel(geo, mult) {
    const { cx, cy, X, Y, dotSize, gap } = geo;

    const m = mult;
    const wInner = Wgrid(X, dotSize, gap) * m;
    const hInner = Hgrid(Y, dotSize, gap) * m;
    const w = (wInner + 2 * gap * m);
    const h = (hInner + 2 * gap * m);
    const x = cx - w / 2;
    const y = cy - h / 2;

    const g = el("g");
    const dots = Array.from({ length: Y }, () => Array.from({ length: X }, () => null));

    // Tło
    g.appendChild(el("rect", { x, y, width: w, height: h, fill: "#2e2e32" }));
    // Wewnętrzne tło
    g.appendChild(
      el("rect", {
        x: x + gap * m,
        y: y + gap * m,
        width: wInner,
        height: hInner,
        fill: "#000000",
      })
    );

    const r = (dotSize * m) / 2;
    const step = dotSize * m + gap * m;
    const pad = gap * m;

    for (let row = 0; row < Y; row++) {
      for (let col = 0; col < X; col++) {
        const circle = el("circle", {
          cx: x + pad + r + col * step,
          cy: y + pad + r + row * step,
          r: r,
          fill: "#2e2e32",
        });
        g.appendChild(circle);
        dots[row][col] = circle;
      }
    }

    svgGroup.appendChild(g);

    return {
      geo,
      dots,
      X,
      Y,
      setDotColor(row, col, color) {
        const c = dots[row]?.[col];
        if (c) c.setAttribute("fill", color);
      },
      clear() {
        for (let row = 0; row < Y; row++)
          for (let col = 0; col < X; col++)
            this.setDotColor(row, col, "#2e2e32");
      },
      snapshot() {
        return dots.map(row => row.map(c => c.getAttribute("fill")));
      },
      restore(snap) {
        if (!snap) return;
        for (let row = 0; row < Math.min(snap.length, Y); row++) {
          for (let col = 0; col < Math.min(snap[row].length, X); col++) {
            const fill = snap[row][col];
            if (fill != null) dots[row][col].setAttribute("fill", fill);
          }
        }
      },
    };
  }

  const big = buildTiledDisplay(displays.big, multiplier);
  const leftPanel = buildTiledDisplay(panels.leftPanel, multiplier);
  const rightPanel = buildTiledDisplay(panels.rightPanel, multiplier);
  const topPanel = buildTiledDisplay(panels.topPanel, multiplier);
  const long1 = buildDotPanel(longs.long1, multiplier);
  const long2 = buildDotPanel(longs.long2, multiplier);

  return {
    big,
    left: leftPanel,
    right: rightPanel,
    top: topPanel,
    long1,
    long2,
  };
}
