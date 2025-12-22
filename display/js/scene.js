// scene.js
import { loadJson, buildGlyphMap, resolveGlyph } from "./fonts.js";
import { createAnimator } from "./anim.js";

export async function createScene() {
  const NS = "http://www.w3.org/2000/svg";
  const $  = (id) => document.getElementById(id);
  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const VIEW = { W: 1600, H: 900, CX: 800, CY: 450 };

  // Wygląd
  const COLORS = {
    big:    "#2e2e32",
    cell:   "#000000",
    dotOff: "#2e2e32",
  };

  // Kolory świecenia
  const LIT = {
    main:  "#d7ff3d",
    top:   "#d7ff3d",
    left:  "#d7ff3d",
    right: "#d7ff3d",
    bottom: "#d7ff3d"
  };

  // Geometria (jak w oryginale)
  const d = 4;
  const g = 1;

  // odstęp między małymi prostokątami = 2 średnice (czyli 2*d)
  const gapCells = 2 * d;

  const Wgrid = (X, dDots, gap) => X * dDots + (X + 1) * gap;
  const Hgrid = (Y, dDots, gap) => Y * dDots + (Y + 1) * gap;

  const isDigit = (ch) => ch >= "0" && ch <= "9";

  // ============================================================
  // Drawing primitives
  // ============================================================
  const drawDotsStored = (parent, x, y, X, Y, dDots, gap, color) => {
    const dots = Array.from({ length: Y }, () => Array.from({ length: X }, () => null));
    const r = dDots / 2;
    const step = dDots + gap;

    for (let j = 0; j < Y; j++) for (let i = 0; i < X; i++) {
      const c = el("circle", {
        cx: x + gap + r + i * step,
        cy: y + gap + r + j * step,
        r,
        fill: color,
      });
      parent.appendChild(c);
      dots[j][i] = c;
    }
    return dots;
  };

  const drawCell5x7 = (parent, x, y, dDots, gap, colors) => {
    const wSmall = Wgrid(5, dDots, gap);
    const hSmall = Hgrid(7, dDots, gap);

    parent.appendChild(el("rect", { x, y, width: wSmall, height: hSmall, rx: 0, fill: colors.cell }));
    const dots = drawDotsStored(parent, x, y, 5, 7, dDots, gap, colors.dotOff);
    return { x, y, dots };
  };

  const drawTiledDisplay5x7 = (parent, x, y, tilesX, tilesY, dDots, gap, tileGap, colors) => {
    const wSmall = Wgrid(5, dDots, gap);
    const hSmall = Hgrid(7, dDots, gap);

    const W = tilesX * wSmall + (tilesX - 1) * tileGap + 2 * gap;
    const H = tilesY * hSmall + (tilesY - 1) * tileGap + 2 * gap;

    parent.appendChild(el("rect", { x, y, width: W, height: H, rx: 0, fill: colors.big }));

    const tiles = Array.from({ length: tilesY }, () => Array.from({ length: tilesX }, () => null));
    for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
      const cx = x + gap + tx * (wSmall + tileGap);
      const cy = y + gap + ty * (hSmall + tileGap);
      tiles[ty][tx] = drawCell5x7(parent, cx, cy, dDots, gap, colors);
    }

    return { tiles, tilesX, tilesY };
  };

  const drawFramedDotPanel = (parent, x, y, X, Y, dDots, gap, colors) => {
    const wInner = Wgrid(X, dDots, gap);
    const hInner = Hgrid(Y, dDots, gap);
    const wOuter = wInner + 2 * gap;
    const hOuter = hInner + 2 * gap;

    parent.appendChild(el("rect", { x, y, width: wOuter, height: hOuter, rx: 0, fill: colors.big }));
    parent.appendChild(el("rect", { x: x + gap, y: y + gap, width: wInner, height: hInner, rx: 0, fill: colors.cell }));

    const dots = drawDotsStored(parent, x + gap, y + gap, X, Y, dDots, gap, colors.dotOff);
    return { X, Y, dots };
  };

  // ============================================================
  // Render 5x7 glyph into a tile
  // ============================================================
  const renderCharToTile = (GLYPHS, tile, ch, onColor, offColor) => {
    const glyph = resolveGlyph(GLYPHS, ch);
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row] | 0;
      for (let col = 0; col < 5; col++) {
        const mask = 1 << (4 - col);
        const on = (bits & mask) !== 0;
        tile.dots[row][col].setAttribute("fill", on ? onColor : offColor);
      }
    }
  };

  const clearTile = (tile) => {
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      tile.dots[row][col].setAttribute("fill", COLORS.dotOff);
    }
  };

  // ============================================================
  // Big display addressing (1-based col:row)
  // ============================================================
  const tileAt = (big, col1, row1) => {
    const x = (col1 | 0) - 1;
    const y = (row1 | 0) - 1;
    if (x < 0 || y < 0 || x >= big.tilesX || y >= big.tilesY) return null;
    return big.tiles[y][x];
  };

  const putCharAt = (GLYPHS, big, col1, row1, ch, color) => {
    const t = tileAt(big, col1, row1);
    if (!t) return;
    renderCharToTile(GLYPHS, t, ch, color, COLORS.dotOff);
  };

  const clearTileAt = (big, col1, row1) => {
    const t = tileAt(big, col1, row1);
    if (!t) return;
    clearTile(t);
  };

  const clearArea = (big, c1, r1, c2, r2) => {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) clearTileAt(big, c, r);
  };

  const clearBig = (big) => clearArea(big, 1, 1, big.tilesX, big.tilesY);

  // snapshot (dla animacji)
  const snapArea = (big, c1, r1, c2, r2) => {
    const W = c2 - c1 + 1, H = r2 - r1 + 1;
    const snap = Array.from({ length: H }, () => Array.from({ length: W }, () => null));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(big, c1 + x, r1 + y);
      if (!t) continue;
      snap[y][x] = t.dots.map(row => row.map(c => c.getAttribute("fill")));
    }
    return snap;
  };

  // Animator (dotOff przekazujemy jawnie)
  const anim = createAnimator({ tileAt, snapArea, clearArea, clearTileAt, dotOff: COLORS.dotOff });

  // ============================
  // GLOBAL ANIMATION SPEED
  // ============================
  const ANIM_SPEED = { mul: 1.0 }; // 1 = normal, 2 = wolniej, 0.5 = szybciej
  const scaleMs = (ms, fallback) => {
    const base = Number.isFinite(ms) ? ms : fallback;
    return Math.max(1, Math.round(base * ANIM_SPEED.mul));
  };

  // ============================================================
  // WIN (font_win.json) – bez dopisywania zer, centrowanie poziome
  // ============================================================
  const measureWinDigit = (pat) => {
    const rows = Array.from({ length: 7 }, (_, i) => (pat[i] ?? ""));
    const W = Math.max(...rows.map(r => r.length), 0);

    let left = W, right = -1;
    for (let x = 0; x < W; x++) {
      let any = false;
      for (let y = 0; y < 7; y++) {
        const ch = rows[y][x] ?? " ";
        if (ch !== " ") { any = true; break; }
      }
      if (any) { if (x < left) left = x; if (x > right) right = x; }
    }
    if (right < left) return { left: 0, w: 0 };
    return { left, w: right - left + 1 };
  };

  const drawWinDigitTight = (GLYPHS, big, WIN_DIGITS, col1, rowTop1, digit, color) => {
    const pat = WIN_DIGITS[digit];
    if (!pat) return 0;

    const rows = Array.from({ length: 7 }, (_, i) => (pat[i] ?? ""));
    const { left, w } = measureWinDigit(pat);

    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][left + x] ?? " ";
        if (ch === " ") clearTileAt(big, col1 + x, rowTop1 + y);
        else putCharAt(GLYPHS, big, col1 + x, rowTop1 + y, ch, color);
      }
    }
    return w;
  };

  const drawWinNumber5 = (GLYPHS, big, WIN_DIGITS, number, color) => {
    let s = (number ?? "").toString().replace(/\D/g, "");
    if (s.length > 5) s = s.slice(-5); // max 5, bez padStart

    const rowTop1 = 2; // 2..8
    clearArea(big, 1, rowTop1, 30, rowTop1 + 6);
    if (!s.length) return;

    const gap = 1;
    const widths = s.split("").map(d => (WIN_DIGITS[d] ? measureWinDigit(WIN_DIGITS[d]).w : 0));
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (s.length - 1);
    const startCol1 = 1 + Math.max(0, Math.floor((30 - totalW) / 2));

    let cx = startCol1;
    for (let i = 0; i < s.length; i++) {
      const w = drawWinDigitTight(GLYPHS, big, WIN_DIGITS, cx, rowTop1, s[i], color);
      cx += w + gap;
    }
  };

  // ============================================================
  // X 3x3 (środek ⧗)
  // ============================================================
  const drawBigX_3x3 = (GLYPHS, big, col1, row1, color) => {
    putCharAt(GLYPHS, big, col1 + 0, row1 + 0, "⇖", color);
    putCharAt(GLYPHS, big, col1 + 1, row1 + 0, "⎵", color);
    putCharAt(GLYPHS, big, col1 + 2, row1 + 0, "⇗", color);
    putCharAt(GLYPHS, big, col1 + 1, row1 + 1, "⧗", color);
    putCharAt(GLYPHS, big, col1 + 0, row1 + 2, "⇙", color);
    putCharAt(GLYPHS, big, col1 + 1, row1 + 2, "⎴", color);
    putCharAt(GLYPHS, big, col1 + 2, row1 + 2, "⇘", color);
  };

  // ============================================================
  // Fields + layout (ROUNDS + FINAL)
  // ============================================================
  const field = (name, c1, r1, len) => ({ name, c1, r1, c2: c1 + len - 1, r2: r1 });

  const writeField = (GLYPHS, big, f, text, color) => {
    const s = (text ?? "").toString().toUpperCase();
    const len = f.c2 - f.c1 + 1;
    for (let i = 0; i < len; i++) {
      putCharAt(GLYPHS, big, f.c1 + i, f.r1, s[i] ?? " ", color);
    }
  };

  const updateField = async (GLYPHS, big, f, text, { out=null, in: inn=null, color=LIT.main } = {}) => {
    const area = { c1: f.c1, r1: f.r1, c2: f.c2, r2: f.r2 };

    if (out) {
      if (out.type === "edge")   await anim.outEdge(big, area, out.dir ?? "left", scaleMs(out.ms, 12));
      if (out.type === "matrix") await anim.outMatrix(big, area, out.axis ?? "down", scaleMs(out.ms, 36));
      if (out.type === "rain")   await anim.outRain(big, area, out.axis ?? "down", scaleMs(out.ms, 24), out.opts ?? {});
    }

    writeField(GLYPHS, big, f, text, color);

    if (inn) {
      if (inn.type === "edge")   await anim.inEdge(big, area, inn.dir ?? "left", scaleMs(inn.ms, 12));
      if (inn.type === "matrix") await anim.inMatrix(big, area, inn.axis ?? "down", scaleMs(inn.ms, 36));
      if (inn.type === "rain")   await anim.inRain(big, area, inn.axis ?? "down", scaleMs(inn.ms, 24), inn.opts ?? {});
    }
  };

  // ============================
  // Layout: ROUNDS (6 linii)
  // ============================
  const ROUNDS = (() => {
    const rows = [2,3,4,5,6,7]; // 6 wierszy
    const roundNums = rows.map((r, i) => field(`R${i+1}_NUM`, 5, r, 1));
    const answers   = rows.map((r, i) => field(`R${i+1}_TXT`, 7, r, 17));
    const points    = rows.map((r, i) => field(`R${i+1}_PTS`, 24, r, 2));

    const xCells = {
      "1A": { c1: 1,  r1: 8,  c2: 3,  r2: 10 },
      "2A": { c1: 1,  r1: 5,  c2: 3,  r2: 7  },
      "3A": { c1: 1,  r1: 2,  c2: 3,  r2: 4  },
      "1B": { c1: 28, r1: 8,  c2: 30, r2: 10 },
      "2B": { c1: 28, r1: 5,  c2: 30, r2: 7  },
      "3B": { c1: 28, r1: 2,  c2: 30, r2: 4  },
    };

    return { rows, roundNums, answers, points, xCells };
  })();

  // Stan i zasada “numer tylko gdy jest tekst”
  const roundsState = {
    text: Array(6).fill(""),
    pts:  Array(6).fill(""),
    suma: "",
    sumaRow: 9, // startowo na dole
  };

  const hasVisibleText = (s) => (s ?? "").toString().trim().length > 0;
  const setRoundNumberVisible = (idx1to6, on) => {
    const i = (idx1to6|0) - 1;
    if (i < 0 || i > 5) return;
    writeField(GLYPHS, big, ROUNDS.roundNums[i], on ? String(i + 1) : " ", LIT.main);
  };

  const isNonEmpty = (s) => (s ?? "").toString().trim().length > 0;

  const computeLastUsedRow = () => {
    let lastIdx = -1;
    for (let i = 0; i < 6; i++) {
      if (isNonEmpty(roundsState.text[i]) || isNonEmpty(roundsState.pts[i])) lastIdx = i;
    }
    if (lastIdx < 0) return null; // brak odpowiedzi
    return ROUNDS.rows[lastIdx];  // np. 2..7
  };
  
  const computeSumaRow = () => {
    const last = computeLastUsedRow();
    if (last == null) return 9;           // jak nic nie ma, suma na dole
    return Math.min(10, last + 2);        // 1 przerwa + 1 suma
  };
  
  const roundsSumaFields = () => {
    const r = roundsState.sumaRow;
    return {
      label: field("SUMA_LABEL", 18, r, 4),
      val:   field("SUMA_VAL",   23, r, 3),
    };
  };
  
  const clearRow = (r) => clearArea(big, 1, r, 30, r);
  
  const relocateSumaIfNeeded = () => {
    const nextRow = computeSumaRow();
    if (nextRow === roundsState.sumaRow) return;
  
    // wyczyść stary wiersz sumy, żeby nie zostawał duch
    clearRow(roundsState.sumaRow);
  
    roundsState.sumaRow = nextRow;
  
    // narysuj SUMA w nowym miejscu
    const F = roundsSumaFields();
    writeField(GLYPHS, big, F.label, "SUMA", LIT.main);
    if (isNonEmpty(roundsState.suma)) writeField(GLYPHS, big, F.val, roundsState.suma, LIT.main);
  };

  // ============================
  // Layout: FINAL
  // ============================
  const FINAL = (() => {
    const rows = [2,3,4,5,6];
    const leftTxt   = rows.map((r,i)=>field(`F${i+1}_LTXT`, 1,  r, 11));
    const ptsA      = rows.map((r,i)=>field(`F${i+1}_A`,    13, r, 2));
    const ptsB      = rows.map((r,i)=>field(`F${i+1}_B`,    17, r, 2));
    const rightTxt  = rows.map((r,i)=>field(`F${i+1}_RTXT`, 20, r, 11));
    const sumaLabel = field("FSUMA_LABEL", 11, 8, 4);
    const sumaVal   = field("FSUMA_VAL",   16, 8, 3);
    return { rows, leftTxt, ptsA, ptsB, rightTxt, sumaLabel, sumaVal };
  })();

  // ============================================================
  // Small displays rules
  // ============================================================
  const setTripleDigits = (GLYPHS, tripleTiles, text, onColor) => {
    const s = (text ?? "").toString();
    for (let i = 0; i < 3; i++) {
      const raw = s[i] ?? " ";
      const ch = isDigit(raw) ? raw : " ";
      renderCharToTile(GLYPHS, tripleTiles[i], ch, onColor, COLORS.dotOff);
    }
  };

  const setLongTextCenteredMax15 = (GLYPHS, panel, text, onColor) => {
    let s = (text ?? "").toString().toUpperCase();
    if (s.length > 15) s = s.slice(0, 15);

    for (let y = 0; y < panel.Y; y++) for (let x = 0; x < panel.X; x++) {
      panel.dots[y][x].setAttribute("fill", COLORS.dotOff);
    }

    const glyphs = Array.from(s).map(ch => resolveGlyph(GLYPHS, ch));
    const charW = 5;
    const gapCol = 1;
    const totalW = glyphs.length === 0 ? 0 : (glyphs.length * charW + (glyphs.length - 1) * gapCol);
    const startX = Math.max(0, Math.floor((panel.X - totalW) / 2));

    let xCursor = startX;
    for (const glyph of glyphs) {
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row] | 0;
        for (let col = 0; col < 5; col++) {
          const mask = 1 << (4 - col);
          const on = (bits & mask) !== 0;
          const px = xCursor + col;
          if (px >= 0 && px < panel.X) panel.dots[row][px].setAttribute("fill", on ? onColor : COLORS.dotOff);
        }
      }
      xCursor += charW + gapCol;
    }
  };

  // ============================================================
  // Build SVG scene
  // ============================================================
  const FONT5 = await loadJson("./font_5x7.json");
  const GLYPHS = buildGlyphMap(FONT5);

  const FONTWIN = await loadJson("./font_win.json");
  const WIN_DIGITS = FONTWIN?.digits || {};

  let LOGO_JSON = null;
  try { LOGO_JSON = await loadJson("./logo_familiada.json"); } catch {}

  const center  = $("center");
  const panels  = $("panels");
  const basebar = $("basebar");
  const bottom  = $("bottom");

  // BIG (30x10)
  const wSmall = Wgrid(5, d, g);
  const hSmall = Hgrid(7, d, g);
  const centerW = 30 * wSmall + 29 * gapCells + 2 * g;
  const centerH = 10 * hSmall +  9 * gapCells + 2 * g;
  const centerX = VIEW.CX - centerW / 2;
  const centerY = VIEW.CY - centerH / 2;
  const big = drawTiledDisplay5x7(center, centerX, centerY, 30, 10, d, g, gapCells, COLORS);

  // Triples (3x1)
  const dP = 3 * d;
  const wSmallP = Wgrid(5, dP, g);
  const panelW = 3 * wSmallP + 2 * gapCells + 2 * g;
  const shift = panelW / 4;

  const sideY = 390;
  const leftX  = 10 + shift;
  const rightX = VIEW.W - panelW - 10 - shift;
  const topY = 65;
  const topX = VIEW.CX - panelW / 2;

  const leftPanel  = drawTiledDisplay5x7(panels, leftX,  sideY, 3, 1, dP, g, gapCells, COLORS);
  const rightPanel = drawTiledDisplay5x7(panels, rightX, sideY, 3, 1, dP, g, gapCells, COLORS);
  const topPanel   = drawTiledDisplay5x7(panels, topX,   topY,  3, 1, dP, g, gapCells, COLORS);

  const leftTriple  = [leftPanel.tiles[0][0],  leftPanel.tiles[0][1],  leftPanel.tiles[0][2]];
  const rightTriple = [rightPanel.tiles[0][0], rightPanel.tiles[0][1], rightPanel.tiles[0][2]];
  const topTriple   = [topPanel.tiles[0][0],   topPanel.tiles[0][1],   topPanel.tiles[0][2]];

  // Bottom (95x7) + basebar
  const dBottom = 1.5 * d;
  const Xb = 95, Yb = 7;
  const gapFromOval = 22;
  const gapBetween  = 40;

  const ovalBottomY = 110 + 680;
  const BOTTOM_LIFT = 30; // <-- ustaw sobie: 20..80
  const yBottom = ovalBottomY + gapFromOval - BOTTOM_LIFT;
  
  const wInnerB = Wgrid(Xb, dBottom, g);
  const hInnerB = Hgrid(Yb, dBottom, g);
  const wBlock  = wInnerB + 2 * g;
  const hBlock  = hInnerB + 2 * g;

  const insetFactor = 0.20;
  const insetWanted = wBlock * insetFactor;
  const minGap = 10;
  const gapEff = Math.max(minGap, gapBetween - 2 * insetWanted);

  const totalW = 2 * wBlock + gapEff;
  const xLeft  = VIEW.CX - totalW / 2;
  const xRight = xLeft + wBlock + gapEff;

  const barX = 50, barW = 1500;
  const barPadY = 12;
  const barY = yBottom - barPadY;
  const barH = hBlock + barPadY * 2;

  basebar.appendChild(el("rect", {
    x: barX, y: barY, width: barW, height: barH,
    fill: "url(#silverGrad)",
    stroke: "#4db4ff",
    "stroke-width": 10,
    "stroke-opacity": 0.65,
    filter: "url(#neonBlue)",
  }));
  basebar.appendChild(el("rect", {
    x: barX, y: barY, width: barW, height: barH,
    fill: "none",
    stroke: "#9fe0ff",
    "stroke-width": 2,
    "stroke-opacity": 0.95,
  }));

  const gapCenterX = xLeft + wBlock + gapEff / 2;
  const sideOffset = barW * 0.22;
  const cutXs = [
    Math.max(barX + 18, gapCenterX - sideOffset),
    gapCenterX,
    Math.min(barX + barW - 18, gapCenterX + sideOffset),
  ];
  for (const lx of cutXs) {
    basebar.appendChild(el("line", {
      x1: lx, y1: barY, x2: lx, y2: barY + barH,
      stroke: "#4db4ff",
      "stroke-width": 10,
      "stroke-opacity": 0.55,
      filter: "url(#neonBlue)",
    }));
    basebar.appendChild(el("line", {
      x1: lx, y1: barY, x2: lx, y2: barY + barH,
      stroke: "#9fe0ff",
      "stroke-width": 2,
      "stroke-opacity": 0.95,
    }));
  }

  const long1 = drawFramedDotPanel(bottom, xLeft,  yBottom, Xb, Yb, dBottom, g, COLORS);
  const long2 = drawFramedDotPanel(bottom, xRight, yBottom, Xb, Yb, dBottom, g, COLORS);

  // ============================================================
  // LOGO: wysokość 5, rzędy 3..7
  // Format logo_familiada.json:
  // { layers: [{ color:"main", rows:[ "...30..." x5 ]}, ...] }
  // ============================================================
  const normalizeLogoRow = (s) => {
    const t = (s ?? "").toString();
    if (t.length === 30) return t;
    if (t.length > 30) return t.slice(0, 30);
    return t.padEnd(30, " ");
  };

  const normalizeLogoJson = (logoJson) => {
    const layersIn = Array.isArray(logoJson?.layers) ? logoJson.layers : [];
    const layers = layersIn.map((layer) => {
      const rowsIn = Array.isArray(layer?.rows) ? layer.rows : [];
      const rows = [];
      for (let i = 0; i < 5; i++) rows.push(normalizeLogoRow(rowsIn[i] ?? ""));
      return { color: layer?.color ?? "main", rows };
    });
    return { layers };
  };

  const drawLogoGrid5 = (logoJsonRaw) => {
    const logoJson = normalizeLogoJson(logoJsonRaw);
    const layers = logoJson.layers;

    const rowFrom = 3;
    const rowTo = 7;

    clearArea(big, 1, rowFrom, 30, rowTo);

    for (const layer of layers) {
      const colorName = (layer?.color ?? "main").toString().toLowerCase();
      const color =
        colorName === "top" ? LIT.top :
        colorName === "left" ? LIT.left :
        colorName === "right" ? LIT.right :
        LIT.main;

      const rows = layer.rows;
      for (let ry = 0; ry < 5; ry++) {
        const rowStr = rows[ry];
        const row1 = rowFrom + ry; // 3..7
        for (let cx = 0; cx < 30; cx++) {
          const ch = rowStr[cx] ?? " ";
          if (ch === " ") continue;
          putCharAt(GLYPHS, big, 1 + cx, row1, ch, color);
        }
      }
    }
  };

  // ============================================================
  // Modes (duży ekran)
  // ============================================================
  const BIG_MODES = { BLANK: "BLANK", LOGO:"LOGO", ROUNDS:"ROUNDS", FINAL:"FINAL", WIN:"WIN" };
  let mode = BIG_MODES.LOGO;


  // ============================================================
  // SNAPSHOT / RESTORE (big + small) – zapis / odtworzenie 1:1
  // ============================================================
  const snapDotsGrid = (panel) =>
    panel.dots.map(row => row.map(el => el.getAttribute("fill")));
  
  const restoreDotsGrid = (panel, snap) => {
    if (!snap) return;
    for (let y = 0; y < panel.dots.length; y++) {
      for (let x = 0; x < panel.dots[0].length; x++) {
        const fill = snap?.[y]?.[x];
        if (fill != null) panel.dots[y][x].setAttribute("fill", fill);
      }
    }
  };
  
  const snapTriple = (tripleTiles) => [
    tripleTiles.map(t => t.dots.map(row => row.map(c => c.getAttribute("fill"))))
  ];
  
  const restoreTriple = (tripleTiles, snap) => {
    const row0 = snap?.[0];
    if (!row0) return;
    for (let tx = 0; tx < 3; tx++) {
      const t = tripleTiles[tx];
      const data = row0?.[tx];
      if (!t || !data) continue;
      for (let rr = 0; rr < 7; rr++) for (let cc = 0; cc < 5; cc++) {
        t.dots[rr][cc].setAttribute("fill", data[rr][cc]);
      }
    }
  };
  
  const snapshotAll = () => ({
    v: 1,
    sceneMode: mode,
    big: snapArea(big, 1, 1, 30, 10),
    small: {
      top:   snapTriple(topTriple),
      left:  snapTriple(leftTriple),
      right: snapTriple(rightTriple),
      long1: snapDotsGrid(long1),
      long2: snapDotsGrid(long2),
    },
  });
  
  const restoreSnapshot = (S) => {
    if (!S) return;
  
    // big
    if (S.big) {
      for (let ty = 0; ty < 10; ty++) for (let tx = 0; tx < 30; tx++) {
        const t = tileAt(big, 1 + tx, 1 + ty);
        const data = S.big?.[ty]?.[tx];
        if (!t || !data) continue;
        for (let rr = 0; rr < 7; rr++) for (let cc = 0; cc < 5; cc++) {
          t.dots[rr][cc].setAttribute("fill", data[rr][cc]);
        }
      }
    }
  
    // small
    restoreTriple(topTriple,   S.small?.top);
    restoreTriple(leftTriple,  S.small?.left);
    restoreTriple(rightTriple, S.small?.right);
    restoreDotsGrid(long1, S.small?.long1);
    restoreDotsGrid(long2, S.small?.long2);
  };


  
  // ============================================================
  // API
  // ============================================================
  const api = {
    mode: {
      get: () => mode,
      set: async (m, opts = {}) => {
        const mm = (m ?? "").toString().toUpperCase();
        if (!BIG_MODES[mm]) throw new Error(`Nieznany tryb: ${m}`);
        mode = mm;
      
        // zawsze czyścimy Big
        clearBig(big);
      
        // BLANK = absolutnie nic więcej
        if (mode === BIG_MODES.BLANK) {
          return;
        }
      
        if (mode === BIG_MODES.ROUNDS) {
          relocateSumaIfNeeded();
        }
  
        if (mode === BIG_MODES.FINAL) {
          writeField(GLYPHS, big, FINAL.sumaLabel, "SUMA", LIT.main);
        }
      
        if (opts?.animIn) await api.big.animIn(opts.animIn);
      },
    },

    big: {
      speed: (mul) => {
        const v = Number(mul);
        if (!Number.isFinite(v) || v <= 0) throw new Error("ANIM_SPEED.mul musi być > 0");
        ANIM_SPEED.mul = v;
      },

      areaAll:  () => ({ c1:1, r1:1, c2:30, r2:10 }),
      areaWin:  () => ({ c1:1, r1:2, c2:30, r2:8 }),
      areaLogo: () => ({ c1:1, r1:3, c2:30, r2:7 }),

      animIn: async ({ type="edge", dir="left", axis="down", ms=12, area=null, opts=null } = {}) => {
        const A = area ?? api.big.areaAll();
        if (type === "edge")   return anim.inEdge(big, A, dir,  scaleMs(ms, 14));
        if (type === "matrix") return anim.inMatrix(big, A, axis, scaleMs(ms, 36));
        if (type === "rain")   return anim.inRain(big, A, axis,  scaleMs(ms, 24), opts ?? {});
      },

      animOut: async ({ type="edge", dir="left", axis="down", ms=12, area=null, opts=null } = {}) => {
        const A = area ?? api.big.areaAll();
        if (type === "edge")   return anim.outEdge(big, A, dir,  scaleMs(ms, 14));
        if (type === "matrix") return anim.outMatrix(big, A, axis, scaleMs(ms, 36));
        if (type === "rain")   return anim.outRain(big, A, axis,  scaleMs(ms, 24), opts ?? {});
      },

      clear: () => clearBig(big),
      put: (col, row, ch, color=LIT.main) => putCharAt(GLYPHS, big, col, row, ch, color),
      clearArea: (c1,r1,c2,r2) => clearArea(big, c1,r1,c2,r2),
    },

    small: {
      topDigits:   (ddd) => setTripleDigits(GLYPHS, topTriple,   ddd, LIT.top),
      leftDigits:  (ddd) => setTripleDigits(GLYPHS, leftTriple,  ddd, LIT.left),
      rightDigits: (ddd) => setTripleDigits(GLYPHS, rightTriple, ddd, LIT.right),
      long1: (txt) => setLongTextCenteredMax15(GLYPHS, long1, txt, LIT.bottom),
      long2: (txt) => setLongTextCenteredMax15(GLYPHS, long2, txt, LIT.bottom),
      clearAll: () => {
        setTripleDigits(GLYPHS, topTriple,   "   ", LIT.top);
        setTripleDigits(GLYPHS, leftTriple,  "   ", LIT.left);
        setTripleDigits(GLYPHS, rightTriple, "   ", LIT.right);
        setLongTextCenteredMax15(GLYPHS, long1, "", LIT.main);
        setLongTextCenteredMax15(GLYPHS, long2, "", LIT.main);
      },
    },
    
    snapshotAll,

    restoreSnapshot,
    
    logo: {
      _json: LOGO_JSON,

      load: async (url = "./logo_familiada.json") => {
        api.logo._json = await loadJson(url);
        return api.logo._json;
      },

      set: (json) => { api.logo._json = json; },

      draw: () => {
        if (!api.logo._json) throw new Error("LOGO: brak JSON (logo.load lub logo.set).");
        drawLogoGrid5(api.logo._json);
      },

      show: async (animIn = { type:"edge", dir:"left", ms:14 }) => {
        await api.mode.set("LOGO");
        api.logo.draw();
        await api.big.animIn({ ...animIn, area: api.big.areaLogo() });
      },

      hide: async (animOut = { type:"edge", dir:"right", ms:14 }) => {
        await api.big.animOut({ ...animOut, area: api.big.areaLogo() });
      },
    },

    win: {
      set: async (num, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.WIN) await api.mode.set("WIN");
        const A = api.big.areaWin();
        if (animOut) await api.big.animOut({ ...animOut, area: A });
        drawWinNumber5(GLYPHS, big, WIN_DIGITS, num, LIT.main);
        if (animIn) await api.big.animIn({ ...animIn, area: A });
      },
    },

    rounds: {
      setText: async (idx1to6, text, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.ROUNDS) await api.mode.set("ROUNDS");

        const i = (idx1to6 | 0) - 1;
        if (i < 0 || i > 5) throw new Error("idx1to6 musi być 1..6");

        const t = (text ?? "").toString();
        roundsState.text[i] = t;

        await updateField(GLYPHS, big, ROUNDS.answers[i], t, { out: animOut, in: animIn, color: LIT.main });

        // numer tylko gdy tekst ma treść
        setRoundNumberVisible(idx1to6, hasVisibleText(roundsState.text[i]));
        relocateSumaIfNeeded();
      },

      setPts: async (idx1to6, pts, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.ROUNDS) await api.mode.set("ROUNDS");

        const i = (idx1to6 | 0) - 1;
        if (i < 0 || i > 5) throw new Error("idx1to6 musi być 1..6");

        const p = (pts ?? "").toString();
        roundsState.pts[i] = p;

        await updateField(GLYPHS, big, ROUNDS.points[i], p, { out: animOut, in: animIn, color: LIT.main });
        setRoundNumberVisible(idx1to6, isNonEmpty(roundsState.text[i]) || isNonEmpty(roundsState.pts[i]));
        relocateSumaIfNeeded();
      },

      setRow: async (idx1to6, { text=undefined, pts=undefined, animOut=null, animIn=null } = {}) => {
        if (text !== undefined) await api.rounds.setText(idx1to6, text, { animOut, animIn });
        if (pts  !== undefined) await api.rounds.setPts(idx1to6, pts,  { animOut, animIn });
      },

      setSuma: async (val, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.ROUNDS) await api.mode.set("ROUNDS");
      
        roundsState.suma = (val ?? "").toString();
        relocateSumaIfNeeded();
      
        const F = roundsSumaFields();
        await updateField(GLYPHS, big, F.val, roundsState.suma, { out: animOut, in: animIn, color: LIT.main });
      },


      setX: (name, on) => {
        const key = (name ?? "").toString().toUpperCase();
        const cell = ROUNDS.xCells[key];
        if (!cell) throw new Error(`Nieznane X: ${name}`);
        if (on) drawBigX_3x3(GLYPHS, big, cell.c1, cell.r1, LIT.main);
        else clearArea(big, cell.c1, cell.r1, cell.c2, cell.r2);
      },

      // ====== NOWE: batch (jedna animacja na całość) ======
      setAll: async ({ rows = [], suma = undefined, animOut = null, animIn = null } = {}) => {
        if (mode !== BIG_MODES.ROUNDS) await api.mode.set("ROUNDS");

        const A_ALL = api.big.areaAll();

        if (animOut) await api.big.animOut({ ...animOut, area: A_ALL });

        // docelowy obraz (bez animacji per-pole)

        for (let i = 0; i < 6; i++) {
          const r = rows[i] ?? {};
          const t = (r.text ?? "").toString();
          const p = (r.pts  ?? "").toString();

          roundsState.text[i] = t;
          roundsState.pts[i]  = p;

          writeField(GLYPHS, big, ROUNDS.answers[i], t, LIT.main);
          writeField(GLYPHS, big, ROUNDS.points[i],  p, LIT.main);
          setRoundNumberVisible(i + 1, isNonEmpty(t) || isNonEmpty(p));
        }

        // ustaw sumę i przelicz pozycję
        if (suma !== undefined) roundsState.suma = (suma ?? "").toString();
        else roundsState.suma = (roundsState.suma ?? "").toString();
        relocateSumaIfNeeded();
        
        if (animIn) await api.big.animIn({ ...animIn, area: A_ALL });
      },
    },

    final: {
      setLeft: async (idx1to5, text, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.FINAL) await api.mode.set("FINAL");
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        await updateField(GLYPHS, big, FINAL.leftTxt[i], text, { out: animOut, in: animIn, color: LIT.main });
      },
      setA: async (idx1to5, pts, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.FINAL) await api.mode.set("FINAL");
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        await updateField(GLYPHS, big, FINAL.ptsA[i], pts, { out: animOut, in: animIn, color: LIT.main });
      },
      setB: async (idx1to5, pts, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.FINAL) await api.mode.set("FINAL");
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        await updateField(GLYPHS, big, FINAL.ptsB[i], pts, { out: animOut, in: animIn, color: LIT.main });
      },
      setRight: async (idx1to5, text, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.FINAL) await api.mode.set("FINAL");
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        await updateField(GLYPHS, big, FINAL.rightTxt[i], text, { out: animOut, in: animIn, color: LIT.main });
      },

      setRow: async (idx1to5, { left=undefined, a=undefined, b=undefined, right=undefined, animOut=null, animIn=null } = {}) => {
        if (left  !== undefined) await api.final.setLeft(idx1to5, left,  { animOut, animIn });
        if (a     !== undefined) await api.final.setA(idx1to5, a,        { animOut, animIn });
        if (b     !== undefined) await api.final.setB(idx1to5, b,        { animOut, animIn });
        if (right !== undefined) await api.final.setRight(idx1to5, right,{ animOut, animIn });
      },

      setSuma: async (val, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.FINAL) await api.mode.set("FINAL");
        await updateField(GLYPHS, big, FINAL.sumaVal, val, { out: animOut, in: animIn, color: LIT.main });
      },

      // ====== NOWE: batch (jedna animacja na całość) ======
      setAll: async ({ rows = [], suma = undefined, animOut = null, animIn = null } = {}) => {
        if (mode !== BIG_MODES.FINAL) await api.mode.set("FINAL");

        const A_ALL = api.big.areaAll();

        if (animOut) await api.big.animOut({ ...animOut, area: A_ALL });

        writeField(GLYPHS, big, FINAL.sumaLabel, "SUMA", LIT.main);

        for (let i = 0; i < 5; i++) {
          const r = rows[i] ?? {};
          writeField(GLYPHS, big, FINAL.leftTxt[i],  (r.left  ?? ""), LIT.main);
          writeField(GLYPHS, big, FINAL.ptsA[i],     (r.a     ?? ""), LIT.main);
          writeField(GLYPHS, big, FINAL.ptsB[i],     (r.b     ?? ""), LIT.main);
          writeField(GLYPHS, big, FINAL.rightTxt[i], (r.right ?? ""), LIT.main);
        }

        if (suma !== undefined) writeField(GLYPHS, big, FINAL.sumaVal, suma, LIT.main);

        if (animIn) await api.big.animIn({ ...animIn, area: A_ALL });
      },
    },
  };

  api.snapshotAll=snapshotAll;

  api.restoreSnapshot=restoreSnapshot;

  // ============================================================
  // Text command handler (GRA)
  // ============================================================
  const unquote = (s) => {
    const t = (s ?? "").trim();
    if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
    return t;
  };

  const tokenize = (raw) => {
    const tokens = [];
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === " ") { i++; continue; }
      if (raw[i] === '"') {
        let j = i + 1;
        while (j < raw.length && raw[j] !== '"') j++;
        tokens.push(raw.slice(i, j + 1));
        i = j + 1;
      } else {
        let j = i;
        while (j < raw.length && raw[j] !== " ") j++;
        tokens.push(raw.slice(i, j));
        i = j;
      }
    }
    return tokens;
  };

  const parseAnim = (tokens, startIdx) => {
    const type = (tokens[startIdx] ?? "").toLowerCase();
    const dirOrAxis = (tokens[startIdx + 1] ?? "").toLowerCase();
    const ms = parseInt(tokens[startIdx + 2] ?? "12", 10);

    if (type === "edge")   return { type:"edge", dir: dirOrAxis || "left", ms: isFinite(ms) ? ms : 12 };
    if (type === "matrix") return { type:"matrix", axis: dirOrAxis || "down", ms: isFinite(ms) ? ms : 36 };
    if (type === "rain" || type === "matrix_rain") return { type:"rain", axis: dirOrAxis || "down", ms: isFinite(ms) ? ms : 24 };
    return null;
  };

  const handleCommand = async (line) => {
    const raw = (line ?? "").toString().trim();
    if (!raw) return;

    const tokens = tokenize(raw);
    const head = (tokens[0] ?? "").toUpperCase();

    // prędkość animacji globalnie
    if (head === "ANIMSPEED") {
      api.big.speed(parseFloat(tokens[1] ?? "1"));
      return;
    }

    // small
    if (head === "TOP")   return api.small.topDigits(tokens[1] ?? "");
    if (head === "LEFT")  return api.small.leftDigits(tokens[1] ?? "");
    if (head === "RIGHT") return api.small.rightDigits(tokens[1] ?? "");
    if (head === "LONG1") return api.small.long1(unquote(tokens.slice(1).join(" ")));
    if (head === "LONG2") return api.small.long2(unquote(tokens.slice(1).join(" ")));

    // mode (big)
    if (head === "MODE") {
      const m = (tokens[1] ?? "").toUpperCase();
      let animIn = null;
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      if (ai >= 0) animIn = parseAnim(tokens, ai + 1);
      return api.mode.set(m, { animIn });
    }

    // LOGO
    if (head === "LOGO") {
      const op = (tokens[1] ?? "").toUpperCase();

      if (op === "LOAD") {
        const url = tokens[2] ? unquote(tokens[2]) : "./logo_familiada.json";
        await api.logo.load(url);
        return;
      }
      if (op === "DRAW") {
        await api.mode.set("LOGO");
        api.logo.draw();
        return;
      }
      if (op === "SHOW") {
        let animIn = null;
        const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
        if (ai >= 0) animIn = parseAnim(tokens, ai + 1);
        return api.logo.show(animIn ?? { type:"edge", dir:"left", ms:14 });
      }
      if (op === "HIDE") {
        let animOut = null;
        const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
        if (ao >= 0) animOut = parseAnim(tokens, ao + 1);
        return api.logo.hide(animOut ?? { type:"edge", dir:"right", ms:14 });
      }
    }

    // WIN
    if (head === "WIN") {
      const num = tokens[1] ?? "";
      let animOut = null, animIn = null;
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      if (ao >= 0) animOut = parseAnim(tokens, ao + 1);
      if (ai >= 0) animIn  = parseAnim(tokens, ai + 1);
      return api.win.set(num, { animOut, animIn });
    }

    // ====== NOWE: ROUNDS batch ======
    // Format:
    // RBATCH SUMA 070 R1 "TXT" 30 R2 "TXT" 25 ... R6 "TXT" 00 ANIMOUT ... ANIMIN ...
    if (head === "RBATCH") {
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;

      const sIdx = tokens.findIndex(t => t.toUpperCase() === "SUMA");
      const suma = sIdx >= 0 ? (tokens[sIdx + 1] ?? "") : undefined;

      const rows = Array.from({ length: 6 }, () => ({ text:"", pts:"" }));
      for (let i = 1; i <= 6; i++) {
        const k = tokens.findIndex(t => t.toUpperCase() === `R${i}`);
        if (k >= 0) {
          rows[i-1].text = unquote(tokens[k + 1] ?? "");
          rows[i-1].pts  = (tokens[k + 2] ?? "");
        }
      }

      return api.rounds.setAll({ rows, suma, animOut, animIn });
    }

    // ROUNDS (krótkie)
    if (head === "RTXT") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.rounds.setText(idx, text, { animOut: A, animIn: A });
    }
    if (head === "RPTS") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.rounds.setPts(idx, pts, { animOut: A, animIn: A });
    }

    // ROUNDS (legacy)
    if (head === "R") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const tIdx = tokens.findIndex(t => t.toUpperCase() === "TXT");
      const pIdx = tokens.findIndex(t => t.toUpperCase() === "PTS");
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");

      const text = tIdx >= 0 ? unquote(tokens[tIdx + 1] ?? "") : undefined;
      const pts  = pIdx >= 0 ? (tokens[pIdx + 1] ?? "") : undefined;
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;

      return api.rounds.setRow(idx, { text, pts, animOut: A, animIn: A });
    }

    if (head === "RSUMA") {
      const val = tokens[1] ?? "";
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.rounds.setSuma(val, { animOut: A, animIn: A });
    }

    if (head === "RX") {
      const name = (tokens[1] ?? "").toUpperCase();
      const on = ((tokens[2] ?? "").toUpperCase() === "ON");
      return api.rounds.setX(name, on);
    }

    // ====== NOWE: FINAL batch ======
    // Format:
    // FBATCH SUMA 999 F1 "L" 12 34 "R" F2 "L" 01 99 "R" ... ANIMOUT ... ANIMIN ...
    if (head === "FBATCH") {
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;

      const sIdx = tokens.findIndex(t => t.toUpperCase() === "SUMA");
      const suma = sIdx >= 0 ? (tokens[sIdx + 1] ?? "") : undefined;

      const rows = Array.from({ length: 5 }, () => ({ left:"", a:"", b:"", right:"" }));
      for (let i = 1; i <= 5; i++) {
        const k = tokens.findIndex(t => t.toUpperCase() === `F${i}`);
        if (k >= 0) {
          rows[i-1].left  = unquote(tokens[k + 1] ?? "");
          rows[i-1].a     = (tokens[k + 2] ?? "");
          rows[i-1].b     = (tokens[k + 3] ?? "");
          rows[i-1].right = unquote(tokens[k + 4] ?? "");
        }
      }

      return api.final.setAll({ rows, suma, animOut, animIn });
    }

    // FINAL (krótkie)
    if (head === "FL") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.final.setLeft(idx, text, { animOut: A, animIn: A });
    }
    if (head === "FA") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.final.setA(idx, pts, { animOut: A, animIn: A });
    }
    if (head === "FB") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.final.setB(idx, pts, { animOut: A, animIn: A });
    }
    if (head === "FR") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.final.setRight(idx, text, { animOut: A, animIn: A });
    }

    // FINAL (legacy)
    if (head === "F") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const L = tokens.findIndex(t => t.toUpperCase() === "L");
      const A = tokens.findIndex(t => t.toUpperCase() === "A");
      const B = tokens.findIndex(t => t.toUpperCase() === "B");
      const R = tokens.findIndex(t => t.toUpperCase() === "R");
      const an = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const X = an >= 0 ? parseAnim(tokens, an + 1) : null;

      const left  = L >= 0 ? unquote(tokens[L + 1] ?? "") : undefined;
      const a     = A >= 0 ? (tokens[A + 1] ?? "") : undefined;
      const b     = B >= 0 ? (tokens[B + 1] ?? "") : undefined;
      const right = R >= 0 ? unquote(tokens[R + 1] ?? "") : undefined;

      return api.final.setRow(idx, { left, a, b, right, animOut: X, animIn: X });
    }

    if (head === "FSUMA") {
      const val = tokens[1] ?? "";
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.final.setSuma(val, { animOut: A, animIn: A });
    }

    console.warn("Nieznana komenda (scene):", raw);
  };

  // ============================================================
  // START: nic nie pokazujemy (backend/console steruje)
  // ============================================================
  clearBig(big);

  // małe panele czyścimy:
  setTripleDigits(GLYPHS, topTriple,   "   ", LIT.top);
  setTripleDigits(GLYPHS, leftTriple,  "   ", LIT.left);
  setTripleDigits(GLYPHS, rightTriple, "   ", LIT.right);
  setLongTextCenteredMax15(GLYPHS, long1, "", LIT.main);
  setLongTextCenteredMax15(GLYPHS, long2, "", LIT.main);

  mode = BIG_MODES.LOGO;

  return { api, BIG_MODES, handleCommand };
}
