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

  // Wygląd (nie ruszamy)
  const COLORS = {
    big:    "#2e2e32",
    cell:   "#000000",
    dotOff: "#2e2e32",
  };

  // Kolory świecenia
  const LIT = {
    main:  "#d7ff3d",
    top:   "#34ff6a",
    left:  "#ff2e3b",
    right: "#2bff65",
  };

  // Geometria (jak w oryginale)
  const d = 4;
  const g = 1;
  const gapCells = d;

  const Wgrid = (X, dDots, gap) => X * dDots + (X + 1) * gap;
  const Hgrid = (Y, dDots, gap) => Y * dDots + (Y + 1) * gap;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

  const anim = createAnimator({ tileAt, snapArea, clearArea, clearTileAt });

  // ============================================================
  // WIN (font_win.json)
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
    if (s.length > 5) s = s.slice(-5);
    s = s.padStart(5, "0");

    const rowTop1 = 2; // 2..8
    const gap = 1;
    clearArea(big, 1, rowTop1, 30, rowTop1 + 6);

    const widths = s.split("").map(d => (WIN_DIGITS[d] ? measureWinDigit(WIN_DIGITS[d]).w : 0));
    const totalW = widths.reduce((a,b)=>a+b,0) + gap * 4;
    const startCol1 = 1 + Math.max(0, Math.floor((30 - totalW) / 2));

    let cx = startCol1;
    for (let i = 0; i < 5; i++) {
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
      if (out.type === "edge")   await anim.outEdge(big, area, out.dir ?? "left", out.ms ?? 6);
      if (out.type === "matrix") await anim.outMatrix(big, area, out.axis ?? "down", out.ms ?? 18);
    }

    writeField(GLYPHS, big, f, text, color);

    if (inn) {
      if (inn.type === "edge")   await anim.inEdge(big, area, inn.dir ?? "left", inn.ms ?? 6);
      if (inn.type === "matrix") await anim.inMatrix(big, area, inn.axis ?? "down", inn.ms ?? 18);
    }
  };

  const ROUNDS = (() => {
    const rows = [2,3,4,5,6];
    const roundNums = rows.map((r, i) => field(`R${i+1}_NUM`, 5, r, 1));
    const answers   = rows.map((r, i) => field(`R${i+1}_TXT`, 7, r, 17));
    const points    = rows.map((r, i) => field(`R${i+1}_PTS`, 24, r, 2));
    const sumaLabel = field("SUMA_LABEL", 18, 8, 4);
    const sumaVal   = field("SUMA_VAL",   23, 8, 3);

    const xCells = {
      "1A": { c1: 1,  r1: 8,  c2: 3,  r2: 10 },
      "2A": { c1: 1,  r1: 5,  c2: 3,  r2: 7  },
      "3A": { c1: 1,  r1: 2,  c2: 3,  r2: 4  },
      "1B": { c1: 28, r1: 8,  c2: 30, r2: 10 },
      "2B": { c1: 28, r1: 5,  c2: 30, r2: 7  },
      "3B": { c1: 28, r1: 2,  c2: 30, r2: 4  },
    };

    return { rows, roundNums, answers, points, sumaLabel, sumaVal, xCells };
  })();

  const FINAL = (() => {
    const rows = [2,3,4,5,6];
    const leftTxt  = rows.map((r,i)=>field(`F${i+1}_LTXT`, 1,  r, 11));
    const ptsA     = rows.map((r,i)=>field(`F${i+1}_A`,    13, r, 2));
    const ptsB     = rows.map((r,i)=>field(`F${i+1}_B`,    17, r, 2));
    const rightTxt = rows.map((r,i)=>field(`F${i+1}_RTXT`, 20, r, 11));
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
  const yBottom = ovalBottomY + gapFromOval;

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
  // { layers: [{ color:"main", rows:[ "....30 znaków...." x5 ]}, ...] }
  // ============================================================
  const drawLogoGrid5 = (logoJson) => {
    const layers = Array.isArray(logoJson?.layers) ? logoJson.layers : [];
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

      const rows = Array.isArray(layer?.rows) ? layer.rows : [];
      for (let ry = 0; ry < 5; ry++) {
        const rowStr = (rows[ry] ?? "").toString();
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
  const BIG_MODES = { LOGO:"LOGO", ROUNDS:"ROUNDS", FINAL:"FINAL", WIN:"WIN" };
  let mode = BIG_MODES.LOGO;

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

        clearBig(big);

        if (mode === BIG_MODES.ROUNDS) {
          writeField(GLYPHS, big, ROUNDS.sumaLabel, "SUMA", LIT.main);
          for (let i = 0; i < 5; i++) writeField(GLYPHS, big, ROUNDS.roundNums[i], String(i+1), LIT.main);
        }

        if (mode === BIG_MODES.FINAL) {
          writeField(GLYPHS, big, FINAL.sumaLabel, "SUMA", LIT.main);
        }

        // LOGO/WIN renderowane przez dedykowane metody

        if (opts?.animIn) await api.big.animIn(opts.animIn);
      },
    },

    big: {
      areaAll:  () => ({ c1:1, r1:1, c2:30, r2:10 }),
      areaWin:  () => ({ c1:1, r1:2, c2:30, r2:8 }),
      areaLogo: () => ({ c1:1, r1:3, c2:30, r2:7 }),

      animIn: async ({ type="edge", dir="left", axis="down", ms=10, area=null } = {}) => {
        const A = area ?? api.big.areaAll();
        if (type === "edge")   return anim.inEdge(big, A, dir, ms);
        if (type === "matrix") return anim.inMatrix(big, A, axis, ms);
      },

      animOut: async ({ type="edge", dir="left", axis="down", ms=10, area=null } = {}) => {
        const A = area ?? api.big.areaAll();
        if (type === "edge")   return anim.outEdge(big, A, dir, ms);
        if (type === "matrix") return anim.outMatrix(big, A, axis, ms);
      },

      clear: () => clearBig(big),
      put: (col, row, ch, color=LIT.main) => putCharAt(GLYPHS, big, col, row, ch, color),
      clearArea: (c1,r1,c2,r2) => clearArea(big, c1,r1,c2,r2),
    },

    small: {
      topDigits:   (ddd) => setTripleDigits(GLYPHS, topTriple,   ddd, LIT.top),
      leftDigits:  (ddd) => setTripleDigits(GLYPHS, leftTriple,  ddd, LIT.left),
      rightDigits: (ddd) => setTripleDigits(GLYPHS, rightTriple, ddd, LIT.right),
      long1: (txt) => setLongTextCenteredMax15(GLYPHS, long1, txt, LIT.main),
      long2: (txt) => setLongTextCenteredMax15(GLYPHS, long2, txt, LIT.main),
    },

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

      show: async (animIn = { type:"edge", dir:"left", ms:8 }) => {
        await api.mode.set("LOGO");
        api.logo.draw();
        await api.big.animIn({ ...animIn, area: api.big.areaLogo() });
      },

      hide: async (animOut = { type:"edge", dir:"right", ms:8 }) => {
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
      // Opcja A: osobne settery
      setText: async (idx1to5, text, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.ROUNDS) await api.mode.set("ROUNDS");
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        await updateField(GLYPHS, big, ROUNDS.answers[i], text, { out: animOut, in: animIn, color: LIT.main });
      },

      setPts: async (idx1to5, pts, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.ROUNDS) await api.mode.set("ROUNDS");
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        await updateField(GLYPHS, big, ROUNDS.points[i], pts, { out: animOut, in: animIn, color: LIT.main });
      },

      // legacy wygodne
      setRow: async (idx1to5, { text=undefined, pts=undefined, animOut=null, animIn=null } = {}) => {
        if (text !== undefined) await api.rounds.setText(idx1to5, text, { animOut, animIn });
        if (pts  !== undefined) await api.rounds.setPts(idx1to5, pts,  { animOut, animIn });
      },

      setSuma: async (val, { animOut=null, animIn=null } = {}) => {
        if (mode !== BIG_MODES.ROUNDS) await api.mode.set("ROUNDS");
        await updateField(GLYPHS, big, ROUNDS.sumaVal, val, { out: animOut, in: animIn, color: LIT.main });
      },

      setX: (name, on) => {
        const key = (name ?? "").toString().toUpperCase();
        const cell = ROUNDS.xCells[key];
        if (!cell) throw new Error(`Nieznane X: ${name}`);
        if (on) drawBigX_3x3(GLYPHS, big, cell.c1, cell.r1, LIT.main);
        else clearArea(big, cell.c1, cell.r1, cell.c2, cell.r2);
      },
    },

    final: {
      // Opcja A: osobne settery
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

      // legacy
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
    },
  };

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
    const ms = parseInt(tokens[startIdx + 2] ?? "10", 10);

    if (type === "edge")   return { type:"edge", dir: dirOrAxis || "left", ms: isFinite(ms) ? ms : 10 };
    if (type === "matrix") return { type:"matrix", axis: dirOrAxis || "down", ms: isFinite(ms) ? ms : 18 };
    return null;
  };

  const handleCommand = async (line) => {
    const raw = (line ?? "").toString().trim();
    if (!raw) return;

    const tokens = tokenize(raw);
    const head = (tokens[0] ?? "").toUpperCase();

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
        return api.logo.show(animIn ?? { type:"edge", dir:"left", ms:8 });
      }
      if (op === "HIDE") {
        let animOut = null;
        const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
        if (ao >= 0) animOut = parseAnim(tokens, ao + 1);
        return api.logo.hide(animOut ?? { type:"edge", dir:"right", ms:8 });
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

    // ROUNDS: nowe komendy liniowe
    // RTXT 2 "TEKST" ANIM edge left 6
    if (head === "RTXT") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.rounds.setText(idx, text, { animOut: A, animIn: A });
    }

    // RPTS 2 25 ANIM matrix down 18
    if (head === "RPTS") {
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
      const aIdx = tokens.findIndex(t => t.toUpperCase() === "ANIM");
      const A = aIdx >= 0 ? parseAnim(tokens, aIdx + 1) : null;
      return api.rounds.setPts(idx, pts, { animOut: A, animIn: A });
    }

    // legacy: R 2 TXT "..." PTS 10 ANIM ...
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

    // FINAL: nowe komendy liniowe
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

    // legacy: F 1 L "..." A 12 B 34 R "..."
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
  // BRAK domyślnych treści / BRAK demo / BRAK auto-trybu
  // ============================================================
  // Nic nie wyświetlamy przy starcie — backend/console steruje.
  //
  // Jeśli chcesz, możesz tylko wyczyścić wszystko:
  clearBig(big);
  api.big.clearArea(1, 1, 30, 10); // opcjonalnie redundantne
  // małe panele też czyścimy na start:
  api.small.topDigits("   ");
  api.small.leftDigits("   ");
  api.small.rightDigits("   ");
  api.small.long1("");
  api.small.long2("");

  // Zostawiamy mode jako LOGO (stan logiczny), ale nic nie rysujemy.
  mode = BIG_MODES.LOGO;

  return { api, BIG_MODES, handleCommand };
}
