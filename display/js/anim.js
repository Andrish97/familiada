export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const createAnimator = ({ tileAt, snapArea, clearArea, clearTileAt }) => ({
  async inEdge(big, area, dir="left", stepMs=6) {
    const { c1,r1,c2,r2 } = area;
    const snap = snapArea(big, c1,r1,c2,r2);
    clearArea(big, c1,r1,c2,r2);

    const W = c2 - c1 + 1, H = r2 - r1 + 1;
    const coords = [];

    if (dir === "left")       for (let x=0;x<W;x++) for (let y=0;y<H;y++) coords.push([x,y]);
    else if (dir === "right") for (let x=W-1;x>=0;x--) for (let y=0;y<H;y++) coords.push([x,y]);
    else if (dir === "top")   for (let y=0;y<H;y++) for (let x=0;x<W;x++) coords.push([x,y]);
    else                      for (let y=H-1;y>=0;y--) for (let x=0;x<W;x++) coords.push([x,y]);

    for (const [tx,ty] of coords) {
      const data = snap[ty][tx];
      if (!data) continue;
      const t = tileAt(big, c1+tx, r1+ty);
      if (!t) continue;
      for (let rr=0; rr<7; rr++) for (let cc=0; cc<5; cc++) t.dots[rr][cc].setAttribute("fill", data[rr][cc]);
      if (stepMs) await sleep(stepMs);
    }
  },

  async outEdge(big, area, dir="left", stepMs=6) {
    const { c1,r1,c2,r2 } = area;
    const W = c2 - c1 + 1, H = r2 - r1 + 1;
    const coords = [];

    if (dir === "left")       for (let x=0;x<W;x++) for (let y=0;y<H;y++) coords.push([x,y]);
    else if (dir === "right") for (let x=W-1;x>=0;x--) for (let y=0;y<H;y++) coords.push([x,y]);
    else if (dir === "top")   for (let y=0;y<H;y++) for (let x=0;x<W;x++) coords.push([x,y]);
    else                      for (let y=H-1;y>=0;y--) for (let x=0;x<W;x++) coords.push([x,y]);

    for (const [tx,ty] of coords) {
      clearTileAt(big, c1+tx, r1+ty);
      if (stepMs) await sleep(stepMs);
    }
  },

  async inMatrix(big, area, axis="down", stepMs=18) {
    const { c1,r1,c2,r2 } = area;
    const snap = snapArea(big, c1,r1,c2,r2);
    clearArea(big, c1,r1,c2,r2);

    const W = c2 - c1 + 1, H = r2 - r1 + 1;

    if (axis === "down" || axis === "up") {
      const ys = axis === "down" ? [...Array(H).keys()] : [...Array(H).keys()].reverse();
      for (const y of ys) {
        for (let x=0; x<W; x++) {
          const data = snap[y][x];
          if (!data) continue;
          const t = tileAt(big, c1+x, r1+y);
          if (!t) continue;
          for (let rr=0; rr<7; rr++) for (let cc=0; cc<5; cc++) t.dots[rr][cc].setAttribute("fill", data[rr][cc]);
        }
        if (stepMs) await sleep(stepMs);
      }
    } else {
      const xs = axis === "right" ? [...Array(W).keys()] : [...Array(W).keys()].reverse();
      for (const x of xs) {
        for (let y=0; y<H; y++) {
          const data = snap[y][x];
          if (!data) continue;
          const t = tileAt(big, c1+x, r1+y);
          if (!t) continue;
          for (let rr=0; rr<7; rr++) for (let cc=0; cc<5; cc++) t.dots[rr][cc].setAttribute("fill", data[rr][cc]);
        }
        if (stepMs) await sleep(stepMs);
      }
    }
  },

  async outMatrix(big, area, axis="down", stepMs=18) {
    const { c1,r1,c2,r2 } = area;
    const W = c2 - c1 + 1, H = r2 - r1 + 1;

    if (axis === "down" || axis === "up") {
      const ys = axis === "down" ? [...Array(H).keys()] : [...Array(H).keys()].reverse();
      for (const y of ys) {
        for (let x=0; x<W; x++) clearTileAt(big, c1+x, r1+y);
        if (stepMs) await sleep(stepMs);
      }
    } else {
      const xs = axis === "right" ? [...Array(W).keys()] : [...Array(W).keys()].reverse();
      for (const x of xs) {
        for (let y=0; y<H; y++) clearTileAt(big, c1+x, r1+y);
        if (stepMs) await sleep(stepMs);
      }
    }
  },
});
