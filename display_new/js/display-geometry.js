// display-geometry.js
// Stała przestrzeń 1280x720, pozycje środków 6 wyświetlaczy, mnożnik rozmiaru

const BASE = { W: 1280, H: 720, CX: 640, CY: 360 };

const DOT_BIG = 3.2;
const GAP = DOT_BIG / 4; // 0.8

const Wgrid = (X, d, gap) => X * d + (X + 1) * gap;
const Hgrid = (Y, d, gap) => Y * d + (Y + 1) * gap;

// ---------- BIG (30x10) ----------
const dCell = DOT_BIG;
const wSmall = Wgrid(5, dCell, GAP);
const hSmall = Hgrid(7, dCell, GAP);
const gapCells = 2 * DOT_BIG;

const bigW = 30 * wSmall + 29 * gapCells + 2 * GAP;
const bigH = 10 * hSmall +  9 * gapCells + 2 * GAP;

const big = {
  cx: BASE.CX,
  cy: BASE.CY,
  w: bigW,
  h: bigH,
  tilesX: 30,
  tilesY: 10,
  dotSize: dCell,
  gap: GAP,
  multiplier: 1.0,
};

// ---------- Stadion (owale) ----------
const R2 = (bigW * bigW + bigH * bigH) / (4 * bigW);
const innerW = 4 * R2;
const innerH = 2 * R2;

// Triplet (3x1) – służy do wyliczenia grubości pierścienia
const dP = 3 * DOT_BIG;
const wSmallP = Wgrid(5, dP, GAP);
const hSmallP = Hgrid(7, dP, GAP);
const panelW = 3 * wSmallP + 2 * gapCells + 2 * GAP;
const panelH = 1 * hSmallP + 2 * GAP;

const dxRing = panelW * 0.95;
const dyRing = panelH * 0.95;
const dRing = Math.min(dxRing, dyRing);

const R3 = R2 + dRing;
const outerW = 4 * R3;
const outerH = 2 * R3;

// Prostokąty owali (do SVG base)
const innerOval = {
  x: BASE.CX - innerW / 2,
  y: BASE.CY - innerH / 2,
  w: innerW,
  h: innerH,
  rx: innerH / 2,
};

const outerOval = {
  x: BASE.CX - outerW / 2,
  y: BASE.CY - outerH / 2,
  w: outerW,
  h: outerH,
  rx: outerH / 2,
};

// Boki owali (do pozycjonowania triplety)
const outerLeft  = outerOval.x;
const outerRight = outerOval.x + outerOval.w;
const outerTop   = outerOval.y;
const outerBottom = outerOval.y + outerOval.h;
const innerLeft  = innerOval.x;
const innerRight = innerOval.x + innerOval.w;
const innerTop   = innerOval.y;
const innerBottom = innerOval.y + innerOval.h;

// ---------- Triplety (3x1) na pierścieniu ----------
function makePanel(cx, cy, tilesX, tilesY) {
  return {
    cx, cy,
    w: tilesX * wSmallP + (tilesX - 1) * gapCells + 2 * GAP,
    h: tilesY * hSmallP + (tilesY - 1) * gapCells + 2 * GAP,
    tilesX,
    tilesY,
    dotSize: dP,
    gap: GAP,
    multiplier: 1.0,
  };
}

// Góra: środek między outerTop a innerTop
const topPanel = makePanel(
  BASE.CX,
  (outerTop + innerTop) / 2,
  3, 1
);

// Boki: środki między outer/inner na lewo/prawo
const leftPanel = makePanel(
  (outerLeft + innerLeft) / 2,
  BASE.CY,
  3, 1
);

const rightPanel = makePanel(
  (outerRight + innerRight) / 2,
  BASE.CY,
  3, 1
);

// ---------- Longi (95x7) na dole ----------
const dBottom = 1.5 * DOT_BIG;
const Xb = 95, Yb = 7;
const gapFromOval = 40 * (BASE.W / 1600); // skalowany odstęp
const BOTTOM_LIFT = 8 * (BASE.W / 1600);

const wInnerB = Wgrid(Xb, dBottom, GAP);
const hInnerB = Hgrid(Yb, dBottom, GAP);
const wBlock  = wInnerB + 2 * GAP;
const hBlock  = hInnerB + 2 * GAP;

const gapBetweenBlocks = 40 * (BASE.W / 1600);
const totalLongW = 2 * wBlock + gapBetweenBlocks;

const long1 = {
  cx: BASE.CX - totalLongW / 2 + wBlock / 2,
  cy: innerBottom + gapFromOval - BOTTOM_LIFT + hBlock / 2,
  w: wBlock,
  h: hBlock,
  X: Xb,
  Y: Yb,
  dotSize: dBottom,
  gap: GAP,
  multiplier: 1.0,
};

const long2 = {
  cx: BASE.CX + totalLongW / 2 - wBlock / 2,
  cy: long1.cy,
  w: wBlock,
  h: hBlock,
  X: Xb,
  Y: Yb,
  dotSize: dBottom,
  gap: GAP,
  multiplier: 1.0,
};

// ---------- Basebar (pasek pod longami) ----------
const barX = 30 * (BASE.W / 1600);
const barW = BASE.W - 2 * barX;
const barPadY = 12 * (BASE.W / 1600);
const barY = (innerBottom + gapFromOval - BOTTOM_LIFT) - barPadY;
const barH = hBlock + barPadY * 2;

const basebar = {
  x: barX,
  y: barY,
  w: barW,
  h: barH,
};

// ---------- Lampki ----------
const lampsY = barY + barH / 2;
const lampR = barH * 0.32;
const padX = lampR * 1.6;

const lampA = { cx: barX + padX, cy: lampsY, r: lampR };
const lampB = { cx: barX + barW - padX, cy: lampsY, r: lampR };

// ---------- Linie stadionu (8 linii) ----------
function intersectCapsuleFromCenter(R2, R3, theta) {
  const cx = R2, cy = 0;
  const dxDir = Math.cos(theta);
  const dyDir = Math.sin(theta);
  const eps = 1e-6;
  let bestT = Infinity;

  if (Math.abs(dyDir) > eps) {
    for (const yLine of [R3, -R3]) {
      const t = (yLine - cy) / dyDir;
      if (t > R2 + eps) {
        const x = cx + t * dxDir;
        if (Math.abs(x) <= R3 + 1e-6 && t < bestT) bestT = t;
      }
    }
  }

  const uX = cx - R3, uY = cy;
  const A = 1.0;
  const B = 2 * (uX * dxDir + uY * dyDir);
  const C = uX * uX + uY * uY - R3 * R3;
  let disc = B * B - 4 * A * C;
  if (disc >= -1e-9) {
    if (disc < 0) disc = 0;
    const sqrtD = Math.sqrt(disc);
    for (const t of [(-B - sqrtD) / (2 * A), (-B + sqrtD) / (2 * A)]) {
      if (t > R2 + eps) {
        const x = cx + t * dxDir;
        if (x >= R3 - 1e-6 && t < bestT) bestT = t;
      }
    }
  }

  return bestT;
}

function baseLine(theta) {
  const cxSmall = R2, cySmall = 0;
  const dxDir = Math.cos(theta);
  const dyDir = Math.sin(theta);
  const tSmall = R2;
  const x1 = cxSmall + tSmall * dxDir;
  const y1 = cySmall + tSmall * dyDir;
  const tHit = intersectCapsuleFromCenter(R2, R3, theta);
  const x2 = cxSmall + tHit * dxDir;
  const y2 = cySmall + tHit * dyDir;
  return { x1, y1, x2, y2 };
}

const stadiumLines = [];
function addSymmetricLines(L) {
  const { x1, y1, x2, y2 } = L;
  stadiumLines.push({ x1, y1, x2, y2 });
  stadiumLines.push({ x1, y1: -y1, x2, y2: -y2 });
  stadiumLines.push({ x1: -x1, y1, x2: -x2, y2 });
  stadiumLines.push({ x1: -x1, y1: -y1, x2: -x2, y2: -y2 });
}

addSymmetricLines(baseLine(Math.PI / 6));   // 30°
addSymmetricLines(baseLine(-Math.PI / 2));  // -90°

const lines = stadiumLines.map(ln => ({
  x1: BASE.CX + ln.x1,
  y1: BASE.CY - ln.y1,
  x2: BASE.CX + ln.x2,
  y2: BASE.CY - ln.y2,
}));

// ---------- Eksport ----------
export const GEOMETRY = {
  base: BASE,
  dotBig: DOT_BIG,
  gap: GAP,
  displays: { big, leftPanel, rightPanel, topPanel, long1, long2 },
  ovals: { inner: innerOval, outer: outerOval },
  panels: { leftPanel, rightPanel, topPanel },
  longs: { long1, long2 },
  basebar,
  lamps: { A: lampA, B: lampB },
  lines,
  R2, R3,
  gapCells,
};

export { BASE, DOT_BIG, GAP, Wgrid, Hgrid };
