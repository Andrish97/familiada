// scene.js
import { loadJson, buildGlyphMap, resolveGlyph } from "./fonts.js?v=v2026-05-02T19071";
import { createAnimator } from "./anim.js?v=v2026-05-02T19071";
import { createDisplays } from "./displays.js?v=v2026-05-02T19071";
import { GEOMETRY } from "./display-geometry.js?v=v2026-05-02T19071";
import { sb } from "../../js/core/supabase.js?v=v2026-05-02T19071";
import { t } from "../../translation/translation.js?v=v2026-05-02T19071";

export async function createScene() {
  const NS = "http://www.w3.org/2000/svg";
  const $  = (id) => document.getElementById(id);
  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const VIEW = { W: 1280, H: 720, CX: 640, CY: 360 };
  let SUMA_LABEL = t("display.sumLabel");
  let bigMode = "NONE";

  // ============================================================
  // THEME: 3 kolory bazowe -> reszta pochodne
  // ============================================================
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  const DEFAULT_THEME_BASE = {
    A:  "#c4002f",
    B:  "#2a62ff",
    BG: "#d21180",
  };

  const cssColorToRgb = (css) => {
    const s = (css ?? "").toString().trim();
    if (!s) return null;
    const tmp = document.createElement("div");
    tmp.style.color = "";
    tmp.style.color = s;
    if (!tmp.style.color) return null;
    document.body.appendChild(tmp);
    const rgb = getComputedStyle(tmp).color;
    tmp.remove();
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3] };
  };

  const rgbToHex = ({ r, g, b }) => {
    const h = (n) => (n|0).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`.toLowerCase();
  };

  const mix = (c1, c2, t) => {
    t = clamp01(t);
    return {
      r: Math.round(c1.r + (c2.r - c1.r) * t),
      g: Math.round(c1.g + (c2.g - c1.g) * t),
      b: Math.round(c1.b + (c2.b - c1.b) * t),
    };
  };

  const lighten = (c, t) => mix(c, { r:255, g:255, b:255 }, t);
  const darken  = (c, t) => mix(c, { r:0,   g:0,   b:0   }, t);

  const THEME = {
    base: {
      A:  DEFAULT_THEME_BASE.A,
      B:  DEFAULT_THEME_BASE.B,
      BG: DEFAULT_THEME_BASE.BG,
    },
    derived: {
      A_dark: "",
      B_dark: "",
      A_lamp: "",
      B_lamp: "",
      B_glow: "",
      bgGradient: "",
    },
  };

  const computeDerived = () => {
    const A = cssColorToRgb(THEME.base.A)  ?? { r:196, g:0,   b:47  };
    const B = cssColorToRgb(THEME.base.B)  ?? { r:42,  g:98,  b:255 };
    const G = cssColorToRgb(THEME.base.BG) ?? { r:11,  g:11,  b:16  };

    THEME.derived.A_dark = rgbToHex(darken(A, 0.38));
    THEME.derived.B_dark = rgbToHex(darken(B, 0.35));
    THEME.derived.A_lamp = rgbToHex(lighten(A, 0.25));
    THEME.derived.B_lamp = rgbToHex(lighten(B, 0.18));
    THEME.derived.B_glow = rgbToHex(lighten(B, 0.28));

    const bg0 = lighten(G, 0.10);
    const bg1 = mix(G, darken(G, 0.75), 0.55);
    const aAcc = mix(bg0, A, 0.18);
    const bAcc = mix(bg0, B, 0.16);

    THEME.derived.bgGradient =
      `radial-gradient(1400px 700px at 50% 25%, ` +
      `${rgbToHex(mix(aAcc, bAcc, 0.50))} 0%, ` +
      `${rgbToHex(bg0)} 30%, ` +
      `${rgbToHex(bg1)} 70%, ` +
      `${rgbToHex(darken(G, 0.85))} 100%)`;
  };

  const applyTheme = () => {
    computeDerived();
    document.documentElement.style.setProperty("--teamA", THEME.base.A);
    document.documentElement.style.setProperty("--teamB", THEME.base.B);
    document.documentElement.style.setProperty("--bg",    THEME.base.BG);
    document.documentElement.style.setProperty("--bg-gradient", THEME.derived.bgGradient);
  };

  const setBaseColor = (which, value) => {
    const w = (which ?? "").toString().toUpperCase();
    const val = (value ?? "").toString().trim();
    if (!val) throw new Error("COLOR: brak wartości koloru");
    if (!cssColorToRgb(val)) throw new Error(`COLOR: nieprawidłowy kolor: ${val}`);

    if (w === "A") THEME.base.A = val;
    else if (w === "B") THEME.base.B = val;
    else if (w === "BACKGROUND") THEME.base.BG = val;
    else throw new Error(`COLOR: nieznany cel "${which}" (użyj A | B | BACKGROUND)`);

    applyTheme();
  };

  const setThemeBase = ({ A, B, BG } = {}) => {
    if (A && cssColorToRgb(A)) THEME.base.A = A;
    if (B && cssColorToRgb(B)) THEME.base.B = B;
    if (BG && cssColorToRgb(BG)) THEME.base.BG = BG;
    applyTheme();
  };

  const resetTheme = () => {
    THEME.base.A  = DEFAULT_THEME_BASE.A;
    THEME.base.B  = DEFAULT_THEME_BASE.B;
    THEME.base.BG = DEFAULT_THEME_BASE.BG;
    applyTheme();
  };

  const COLORS = {
    big:    "#2e2e32",
    cell:   "#000000",
    dotOff: "#2e2e32",
  };

  const LIT = {
    main:  "#d7ff3d",
    top:   "#d7ff3d",
    left:  "#d7ff3d",
    right: "#d7ff3d",
    bottom: "#d7ff3d"
  };

  const isDigit = (ch) => ch >= "0" && ch <= "9";

  // ============================================================
  // Wyświetlacze
  // ============================================================
  const displaysGroup = $("displays");
  const displays = createDisplays({ svgGroup: displaysGroup, multiplier: 1.0 });
  const big = displays.big;
  const leftPanel = displays.left;
  const rightPanel = displays.right;
  const topPanel = displays.top;
  const long1 = displays.long1;
  const long2 = displays.long2;

  const leftTriple  = [leftPanel.tiles[0][0],  leftPanel.tiles[0][1],  leftPanel.tiles[0][2]];
  const rightTriple = [rightPanel.tiles[0][0], rightPanel.tiles[0][1], rightPanel.tiles[0][2]];
  const topTriple   = [topPanel.tiles[0][0],   topPanel.tiles[0][1],   topPanel.tiles[0][2]];

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

  // Animator
  const anim = createAnimator({ tileAt, snapArea, clearArea, clearTileAt, dotOff: COLORS.dotOff });

  if (typeof anim.outEdge !== "function" && typeof anim.inEdge === "function") {
    anim.outEdge = (...args) => anim.inEdge(...args);
  }
  if (typeof anim.outMatrix !== "function" && typeof anim.inMatrix === "function") {
    anim.outMatrix = (...args) => anim.inMatrix(...args);
  }

  const normMs = (ms, fallback) => {
    const base = Number.isFinite(ms) ? ms : fallback;
    return Math.max(0, base | 0);
  };

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
    const rowTop1 = 2;
    clearArea(big, 1, rowTop1, 30, rowTop1 + 6);
    if (!s.length) return;
    const gap = 1;
    const groupGapExtra = 1;
    const widths = s.split("").map(d => (WIN_DIGITS[d] ? measureWinDigit(WIN_DIGITS[d]).w : 0));
    let totalW = widths.reduce((a, b) => a + b, 0);
    if (s.length > 1) totalW += gap * (s.length - 1);
    if (s.length > 3) totalW += groupGapExtra;
    const startCol1 = 1 + Math.max(0, Math.floor((30 - totalW) / 2));
    let cx = startCol1;
    for (let i = 0; i < s.length; i++) {
      const w = drawWinDigitTight(GLYPHS, big, WIN_DIGITS, cx, rowTop1, s[i], color);
      cx += w;
      if (i < s.length - 1) {
        cx += gap;
        if (s.length > 3 && i === (s.length - 4)) cx += groupGapExtra;
      }
    }
  };

  // ============================================================
  // X 3x3
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

  const drawRoundsBigX = (GLYPHS, big, side, color) => {
    const s = (side ?? "").toString().toUpperCase();
    const put = (col1, row1, ch) => putCharAt(GLYPHS, big, col1, row1, ch, color);
    if (s === "A") {
      put(1, 4, "◣"); put(3, 4, "◢");
      put(1, 5, "◥"); put(3, 5, "◤");
      put(2, 6, "⧗");
      put(1, 7, "◢"); put(3, 7, "◣");
      put(1, 8, "◤"); put(3, 8, "◥");
      return;
    }
    if (s === "B") {
      put(28, 4, "◣"); put(30, 4, "◢");
      put(28, 5, "◥"); put(30, 5, "◤");
      put(29, 6, "⧗");
      put(28, 7, "◢"); put(30, 7, "◣");
      put(28, 8, "◤"); put(30, 8, "◥");
      return;
    }
    throw new Error(`drawRoundsBigX: nieznana strona: ${side}`);
  };

  // ============================================================
  // Fields + layout
  // ============================================================
  const field = (name, c1, r1, len) => ({ name, c1, r1, c2: c1 + len - 1, r2: r1 });

  const writeField = (GLYPHS, big, f, text, color) => {
    const s = (text ?? "").toString().toUpperCase();
    const len = f.c2 - f.c1 + 1;
    for (let i = 0; i < len; i++) {
      putCharAt(GLYPHS, big, f.c1 + i, f.r1, s[i] ?? " ", color);
    }
  };

  const alignRight = (val, width) => {
    const s = (val ?? "").toString();
    if (!s.length) return " ".repeat(width);
    return s.length >= width ? s.slice(-width) : " ".repeat(width - s.length) + s;
  };

  const clipText = (val, max) => {
    const s = (val ?? "").toString();
    return s.length > max ? s.slice(0, max) : s;
  };

  const updateField = async (GLYPHS, big, f, text, { out = null, in: inn = null, color = LIT.main } = {}) => {
    const area = { c1: f.c1, r1: f.r1, c2: f.c2, r2: f.r2 };
    const normalizeOpts = (a) => {
      if (!a) return undefined;
      const opts = {};
      if (a.pixel) opts.pixel = true;
      if (a.pxBatch != null) opts.pxBatch = a.pxBatch;
      if (a.stepPxMs != null) opts.stepPxMs = a.stepPxMs;
      if (a.tileMs != null) opts.tileMs = a.tileMs;
      return opts;
    };
    const hasOut = !!out;
    const hasIn = !!inn;
    if (hasOut) {
      const type = out.type || "edge";
      const step = normMs(out.ms, 20);
      const opts = normalizeOpts(out);
      if (type === "edge") await anim.outEdge(big, area, out.dir || "left", step, opts);
      else if (type === "matrix") await anim.outMatrix(big, area, out.axis || "down", step, opts);
      writeField(GLYPHS, big, f, text, color);
    } else {
      writeField(GLYPHS, big, f, text, color);
    }
    if (hasIn) {
      const type = inn.type || "edge";
      const step = normMs(inn.ms, 20);
      const opts = normalizeOpts(inn);
      if (type === "edge") await anim.inEdge(big, area, inn.dir || "left", step, opts);
      else if (type === "matrix") await anim.inMatrix(big, area, inn.axis || "down", step, opts);
    }
  };

  // ============================
  // Layout: ROUNDS
  // ============================
  const ROUNDS = (() => {
    const rows = [2,3,4,5,6,7];
    const roundNums = rows.map((r, i) => field(`R${i+1}_NUM`, 5, r, 1));
    const answers   = rows.map((r, i) => field(`R${i+1}_TXT`, 7, r, 17));
    const points    = rows.map((r, i) => field(`R${i+1}_PTS`, 25, r, 2));
    const xCells = {
      "1A": { c1: 1,  r1: 8,  c2: 3,  r2: 10 },
      "2A": { c1: 1,  r1: 5,  c2: 3,  r2: 7  },
      "3A": { c1: 1,  r1: 2,  c2: 3,  r2: 4  },
      "4A": { c1: 1,  r1: 4,  c2: 3,  r2: 8,  kind: "BIG" },
      "1B": { c1: 28, r1: 8,  c2: 30, r2: 10 },
      "2B": { c1: 28, r1: 5,  c2: 30, r2: 7  },
      "3B": { c1: 28, r1: 2,  c2: 30, r2: 4  },
      "4B": { c1: 28, r1: 4,  c2: 30, r2: 8,  kind: "BIG" },
    };
    return { rows, roundNums, answers, points, xCells };
  })();

  const roundsState = {
    text: Array(6).fill(""),
    pts:  Array(6).fill(""),
    suma: "",
    sumaRow: 9,
  };

  const xState = {
    "1A": false, "2A": false, "3A": false, "4A": false,
    "1B": false, "2B": false, "3B": false, "4B": false,
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
    if (lastIdx < 0) return null;
    return ROUNDS.rows[lastIdx];
  };

  const computeSumaRow = () => {
    const last = computeLastUsedRow();
    if (last == null) return 9;
    return Math.min(10, last + 2);
  };

  const roundsSumaFields = () => {
    const r = roundsState.sumaRow;
    return {
      label: field("SUMA_LABEL", 19, r, 4),
      val:   field("SUMA_VAL",   24, r, 3),
    };
  };

  const clearRow = (r) => clearArea(big, 1, r, 30, r);

  const relocateSumaIfNeeded = () => {
    const nextRow = computeSumaRow();
    if (nextRow === roundsState.sumaRow) return;
    clearRow(roundsState.sumaRow);
    roundsState.sumaRow = nextRow;
    const F = roundsSumaFields();
    writeField(GLYPHS, big, F.label, SUMA_LABEL, LIT.main);
    if (isNonEmpty(roundsState.suma)) writeField(GLYPHS, big, F.val, roundsState.suma, LIT.main);
  };

  const redrawRounds = () => {
    clearBig(big);
    for (let i = 0; i < 6; i++) {
      const tRaw = roundsState.text[i] ?? "";
      const pRaw = roundsState.pts[i]  ?? "";
      const t = clipText(tRaw, 17);
      const p = alignRight(pRaw, 2);
      writeField(GLYPHS, big, ROUNDS.answers[i], t, LIT.main);
      writeField(GLYPHS, big, ROUNDS.points[i],  p, LIT.main);
      const hasData = isNonEmpty(tRaw) || isNonEmpty(pRaw);
      setRoundNumberVisible(i + 1, hasData);
    }
    relocateSumaIfNeeded();
    const F = roundsSumaFields();
    writeField(GLYPHS, big, F.label, SUMA_LABEL, LIT.main);
    const sumaTxt = isNonEmpty(roundsState.suma) ? alignRight(roundsState.suma, 3) : "   ";
    writeField(GLYPHS, big, F.val, sumaTxt, LIT.main);
  };

  // ============================
  // Layout: FINAL
  // ============================
  const FINAL = (() => {
    const rows = [3,4,5,6,7];
    const leftTxt   = rows.map((r,i)=>field(`F${i+1}_LTXT`, 1,  r, 11));
    const ptsA      = rows.map((r,i)=>field(`F${i+1}_A`,    13, r, 2));
    const ptsB      = rows.map((r,i)=>field(`F${i+1}_B`,    17, r, 2));
    const rightTxt  = rows.map((r,i)=>field(`F${i+1}_RTXT`, 20, r, 11));
    const sumaALabel = field("FSUMA_A_LABEL", 7,  9, 4);
    const sumaAVal   = field("FSUMA_A_VAL",   12, 9, 3);
    const sumaBLabel = field("FSUMA_B_LABEL", 11, 9, 4);
    const sumaBVal   = field("FSUMA_B_VAL",   16, 9, 3);
    return { rows, leftTxt, ptsA, ptsB, rightTxt, sumaALabel, sumaAVal, sumaBLabel, sumaBVal };
  })();

  const finalState = {
    sumMode: "B",
    sumA: "",
    sumB: "",
  };

  const clearFinalSumRow = () => clearArea(big, 1, 9, 30, 9);

  const drawFinalSum = () => {
    clearFinalSumRow();
    if (finalState.sumMode === "A") {
      writeField(GLYPHS, big, FINAL.sumaALabel, SUMA_LABEL, LIT.main);
      writeField(GLYPHS, big, FINAL.sumaAVal, alignRight(finalState.sumA, 3), LIT.main);
    } else {
      writeField(GLYPHS, big, FINAL.sumaBLabel, SUMA_LABEL, LIT.main);
      writeField(GLYPHS, big, FINAL.sumaBVal, alignRight(finalState.sumB, 3), LIT.main);
    }
  };

  const refreshSumaLabel = () => {
    SUMA_LABEL = t("display.sumLabel");
    if (bigMode === "ROUNDS") {
      const F = roundsSumaFields();
      writeField(GLYPHS, big, F.label, SUMA_LABEL, LIT.main);
    } else if (bigMode === "FINAL") {
      const labelField = finalState.sumMode === "A" ? FINAL.sumaALabel : FINAL.sumaBLabel;
      writeField(GLYPHS, big, labelField, SUMA_LABEL, LIT.main);
    }
  };

  window.addEventListener("i18n:lang", refreshSumaLabel);

  const FINAL_AREA_LEFT  = { c1: 1,  r1: 3, c2: 14, r2: 7 };
  const FINAL_AREA_RIGHT = { c1: 17, r1: 3, c2: 30, r2: 7 };

  // ============================================================
  // Small displays rules
  // ============================================================
  const setTripleDigits = (GLYPHS, tripleTiles, text, onColor) => {
    let s = (text ?? "").toString().replace(/\D/g, "");
    if (s.length > 3) s = s.slice(-3);
    s = s.padStart(3, " ");
    for (let i = 0; i < 3; i++) {
      const ch = s[i];
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
  // Load fonts
  // ============================================================
  const FONT5 = await loadJson("display_new/font_5x7.json");
  const GLYPHS = buildGlyphMap(FONT5);
  const FONTWIN = await loadJson("display_new/font_win.json");
  const WIN_DIGITS = FONTWIN?.digits || {};

  // ============================================================
  // Indicator state
  // ============================================================
  let indicatorState = "OFF";

  const setIndicator = (state) => {
    const s = (state ?? "").toString().toUpperCase();
    if (s === "OFF") { indicatorState = "OFF"; return; }
    if (s === "ON_A") { indicatorState = "ON_A"; return; }
    if (s === "ON_B") { indicatorState = "ON_B"; return; }
    throw new Error(`INDICATOR: zły stan: ${state}`);
  };

  // ============================================================
  // LOGO
  // ============================================================
  let LOGO_JSON = null;
  try { LOGO_JSON = await loadJson("display_new/logo_familiada.json"); } catch {}
  const DEFAULT_LOGO = LOGO_JSON ?? { layers:[{ color:"main", rows:Array(10).fill(" ".repeat(30)) }] };
  let ACTIVE_LOGO = null;

  const loadActiveLogoFromDb = async (gameId, key) => {
    if (!gameId || !key) return null;
    try {
      const { data, error } = await sb().rpc("display_logo_get_public", {
        p_game_id: gameId, p_key: key,
      });
      if (error) return null;
      return data || null;
    } catch { return null; }
  };

  const normalizeLogoRow30 = (s) => {
    const t = (s ?? "").toString();
    if (t.length === 30) return t;
    if (t.length > 30) return t.slice(0, 30);
    return t.padEnd(30, " ");
  };

  const normalizeLogoJson30x10 = (logoJson) => {
    const layersIn = Array.isArray(logoJson?.layers) ? logoJson.layers : [];
    const layers = layersIn.map((layer) => {
      const rowsIn = Array.isArray(layer?.rows) ? layer.rows : [];
      const rows = [];
      for (let i = 0; i < 10; i++) rows.push(normalizeLogoRow30(rowsIn[i] ?? ""));
      return { color: layer?.color ?? "main", rows };
    });
    return { layers };
  };

  const litFromName = (name) => {
    const n = (name ?? "main").toString().toLowerCase();
    if (n === "top") return LIT.top;
    if (n === "left") return LIT.left;
    if (n === "right") return LIT.right;
    if (n === "bottom") return LIT.bottom;
    return LIT.main;
  };

  const drawLogoGrid30x10 = (logoJsonRaw) => {
    const logoJson = normalizeLogoJson30x10(logoJsonRaw);
    clearArea(big, 1, 1, 30, 10);
    for (const layer of logoJson.layers) {
      const color = litFromName(layer.color);
      for (let ry = 0; ry < 10; ry++) {
        const rowStr = layer.rows[ry] ?? " ".repeat(30);
        const row1 = 1 + ry;
        for (let cx = 0; cx < 30; cx++) {
          const ch = rowStr[cx] ?? " ";
          if (ch === " ") continue;
          putCharAt(GLYPHS, big, 1 + cx, row1, ch, color);
        }
      }
    }
  };

  const base64ToBytes = (b64) => {
    try {
      const bin = atob((b64 || "").replace(/\s+/g, ""));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch { return new Uint8Array(0); }
  };

  const getBitRowMajor_MSB = (bytes, x, y, w) => {
    const bytesPerRow = Math.ceil(w / 8);
    const byteIndex = y * bytesPerRow + (x >> 3);
    if (byteIndex < 0 || byteIndex >= bytes.length) return 0;
    const bit = 7 - (x & 7);
    return (bytes[byteIndex] >> bit) & 1;
  };

  const drawLogoPix150x70 = (bitsBase64, colorOn = LIT.main) => {
    const W = 150, H = 70;
    const bytes = base64ToBytes(bitsBase64);
    clearArea(big, 1, 1, 30, 10);
    for (let ty = 0; ty < 10; ty++) {
      for (let tx = 0; tx < 30; tx++) {
        const tile = tileAt(big, 1 + tx, 1 + ty);
        if (!tile) continue;
        for (let py = 0; py < 7; py++) {
          for (let px = 0; px < 5; px++) {
            const x = tx * 5 + px;
            const y = ty * 7 + py;
            const on = getBitRowMajor_MSB(bytes, x, y, W) === 1;
            tile.dots[py][px].setAttribute("fill", on ? colorOn : COLORS.dotOff);
          }
        }
      }
    }
  };

  // ============================================================
  // SNAPSHOT / RESTORE
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
    big: snapArea(big, 1, 1, 30, 10),
    small: {
      top:   snapTriple(topTriple),
      left:  snapTriple(leftTriple),
      right: snapTriple(rightTriple),
      long1: snapDotsGrid(long1),
      long2: snapDotsGrid(long2),
    },
    indicator: indicatorState,
    theme: {
      A: THEME.base.A,
      B: THEME.base.B,
      BG: THEME.base.BG,
    },
  });

  const restoreSnapshot = (S) => {
    if (!S) return;
    if (S.theme && (S.theme.A || S.theme.B || S.theme.BG)) {
      try { setThemeBase({ A: S.theme.A, B: S.theme.B, BG: S.theme.BG }); } catch (e) {
        console.warn("Nie można przywrócić THEME ze snapshotu:", e);
      }
    }
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
    restoreTriple(topTriple,   S.small?.top);
    restoreTriple(leftTriple,  S.small?.left);
    restoreTriple(rightTriple, S.small?.right);
    restoreDotsGrid(long1, S.small?.long1);
    restoreDotsGrid(long2, S.small?.long2);
    if (S.indicator) {
      try { api.indicator.set(S.indicator); } catch (e) {
        console.warn("Nie można przywrócić INDICATOR ze snapshotu:", e);
      }
    }
  };

  let appMode = "NONE";

  const hardClearAll = () => {
    clearBig(big);
    api.small.clearAll();
    api.indicator.set("OFF");
    roundsState.text = Array(6).fill("");
    roundsState.pts  = Array(6).fill("");
    roundsState.suma = "";
    roundsState.sumaRow = 9;
    for (const k of Object.keys(xState)) xState[k] = false;
    finalState.sumMode = "B";
    finalState.sumA = "";
    finalState.sumB = "";
  };

  // ============================================================
  // API
  // ============================================================
  const api = {
    mode: {
      getApp: () => appMode,
      setApp: (m) => {
        const next = (m ?? "").toString().toUpperCase();
        if (next === appMode) return;
        appMode = next;
        hardClearAll();
      },
      hardClearAll,
    },

    big: {
      areaAll:  () => ({ c1:1, r1:1, c2:30, r2:10 }),
      areaWin:  () => ({ c1:1, r1:2, c2:30, r2:8 }),
      areaLogo: () => ({ c1:1, r1:3, c2:30, r2:7 }),
      animIn: async ({ type = "edge", dir = "left", axis = "down", ms = 20, area = null, opts = null } = {}) => {
        const A = area ?? api.big.areaAll();
        const speed = normMs(ms, 20);
        if (type === "edge") return anim.inEdge(big, A, dir, speed, opts || {});
        if (type === "matrix") return anim.inMatrix(big, A, axis, speed, opts || {});
      },
      animOut: async ({ type = "edge", dir = "left", axis = "down", ms = 20, area = null, opts = null } = {}) => {
        const A = area ?? api.big.areaAll();
        const speed = normMs(ms, 20);
        if (type === "edge") return anim.outEdge(big, A, dir, speed, opts || {});
        if (type === "matrix") return anim.outMatrix(big, A, axis, speed, opts || {});
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

    indicator: {
      get: () => indicatorState,
      set: setIndicator,
    },

    snapshotAll,
    restoreSnapshot,

    logo: {
      _gameId: null,
      _key: null,
      bindGame: async (gameId) => {
        const u = new URL(location.href);
        const key = u.searchParams.get("key") || "";
        const gid = (gameId ?? "").toString();
        api.logo._gameId = gid;
        api.logo._key = key;
        const dbLogo = await loadActiveLogoFromDb(gid, key);
        if (dbLogo && dbLogo.type && dbLogo.payload) ACTIVE_LOGO = dbLogo;
        else ACTIVE_LOGO = null;
      },
      _getSource: () => {
        if (ACTIVE_LOGO?.type === "GLYPH_30x10") return { type: "GLYPH_30x10", payload: ACTIVE_LOGO.payload };
        if (ACTIVE_LOGO?.type === "PIX_150x70") return { type: "PIX_150x70", payload: ACTIVE_LOGO.payload };
        return { type: "GLYPH_30x10", payload: DEFAULT_LOGO };
      },
      draw: () => {
        const src = api.logo._getSource();
        if (src.type === "GLYPH_30x10") { drawLogoGrid30x10(src.payload); return; }
        if (src.type === "PIX_150x70") {
          const bits = src.payload?.bits_b64 || src.payload?.bits_base64 || src.payload?.bitsBase64 || "";
          drawLogoPix150x70(bits, LIT.main);
          return;
        }
        throw new Error("LOGO: nieznany typ logo: " + src.type);
      },
      show: async (animIn = { type:"edge", dir:"left", ms:14 }) => {
        api.logo.draw();
        await api.big.animIn({ ...animIn, area: api.big.areaAll() });
      },
      hide: async (animOut = { type:"edge", dir:"right", ms:14 }) => {
        await api.big.animOut({ ...animOut, area: api.big.areaAll() });
      },
    },

    win: {
      set: async (num, { animOut=null, animIn=null } = {}) => {
        const A = api.big.areaWin();
        if (animOut) await api.big.animOut({ ...animOut, area: A });
        drawWinNumber5(GLYPHS, big, WIN_DIGITS, num, LIT.main);
        if (animIn) await api.big.animIn({ ...animIn, area: A });
      },
    },

    rounds: {
      setText: async (idx1to6, text, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to6 | 0) - 1;
        if (i < 0 || i > 5) throw new Error("idx1to6 musi być 1..6");
        const raw = (text ?? "").toString();
        const t = clipText(raw, 17);
        roundsState.text[i] = t;
        await updateField(GLYPHS, big, ROUNDS.answers[i], t, { out: animOut, in: animIn, color: LIT.main });
        setRoundNumberVisible(idx1to6, hasVisibleText(roundsState.text[i]));
        relocateSumaIfNeeded();
      },
      setPts: async (idx1to6, pts, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to6 | 0) - 1;
        if (i < 0 || i > 5) throw new Error("idx1to6 musi być 1..6");
        const raw = (pts ?? "").toString();
        const p = alignRight(raw, 2);
        roundsState.pts[i] = raw;
        await updateField(GLYPHS, big, ROUNDS.points[i], p, { out: animOut, in: animIn, color: LIT.main });
        setRoundNumberVisible(idx1to6, isNonEmpty(roundsState.text[i]) || isNonEmpty(roundsState.pts[i]));
        relocateSumaIfNeeded();
      },
      setRow: async (idx1to6, { text=undefined, pts=undefined, animOut=null, animIn=null } = {}) => {
        if (text !== undefined) await api.rounds.setText(idx1to6, text, { animOut, animIn });
        if (pts  !== undefined) await api.rounds.setPts(idx1to6, pts,  { animOut, animIn });
      },
      setSuma: async (val, { animOut=null, animIn=null } = {}) => {
        roundsState.suma = (val ?? "").toString();
        relocateSumaIfNeeded();
        const F = roundsSumaFields();
        const txt = alignRight(roundsState.suma, 3);
        await updateField(GLYPHS, big, F.val, txt, { out: animOut, in: animIn, color: LIT.main });
      },
      setX: (name, on) => {
        const key = (name ?? "").toString().toUpperCase();
        const cell = ROUNDS.xCells[key];
        if (!cell) throw new Error(`Nieznane X: ${name}`);
        const clearKey = (k) => {
          const c = ROUNDS.xCells[k];
          if (!c) return;
          clearArea(big, c.c1, c.r1, c.c2, c.r2);
        };
        const side = key.endsWith("A") ? "A" : key.endsWith("B") ? "B" : null;
        const bigKey = side === "A" ? "4A" : side === "B" ? "4B" : null;
        const smallKeys = side === "A" ? ["1A", "2A", "3A"] : side === "B" ? ["1B", "2B", "3B"] : [];
        const isBig = (cell.kind === "BIG");
        if (!on) {
          if (side) {
            if (isBig) {
              const anySmallOn = smallKeys.some(k => xState[k]);
              if (anySmallOn) return;
            } else {
              if (bigKey && xState[bigKey]) return;
            }
          }
          clearArea(big, cell.c1, cell.r1, cell.c2, cell.r2);
          xState[key] = false;
          return;
        }
        if (side) {
          if (isBig) {
            for (const k of smallKeys) {
              if (xState[k]) clearKey(k);
              xState[k] = false;
            }
            xState[bigKey] = true;
            drawRoundsBigX(GLYPHS, big, side, LIT.main);
            return;
          } else {
            if (bigKey && xState[bigKey]) {
              clearKey(bigKey);
              xState[bigKey] = false;
            }
            xState[key] = true;
            drawBigX_3x3(GLYPHS, big, cell.c1, cell.r1, LIT.main);
            return;
          }
        }
        xState[key] = true;
        if (isBig) drawRoundsBigX(GLYPHS, big, side, LIT.main);
        else drawBigX_3x3(GLYPHS, big, cell.c1, cell.r1, LIT.main);
      },
      setAll: async ({ rows = [], suma = undefined, animOut = null, animIn = null } = {}) => {
        const A_ALL = api.big.areaAll();
        const hasAnyRowData = rows.some(r => isNonEmpty(r?.text) || isNonEmpty(r?.pts));
        const hasSumaArg = (suma !== undefined);
        if (animOut && !animIn && !hasAnyRowData && !hasSumaArg) {
          await api.big.animOut({ ...animOut, area: A_ALL });
          clearBig(big);
          roundsState.text = Array(6).fill("");
          roundsState.pts  = Array(6).fill("");
          roundsState.suma = "";
          roundsState.sumaRow = 9;
          return;
        }
        if (animOut) await api.big.animOut({ ...animOut, area: A_ALL });
        for (let i = 0; i < 6; i++) {
          const r = rows[i] ?? {};
          const rawT = (r.text ?? "").toString();
          const rawP = (r.pts  ?? "").toString();
          const t = clipText(rawT, 17);
          const p = alignRight(rawP, 2);
          roundsState.text[i] = t;
          roundsState.pts[i]  = rawP;
          writeField(GLYPHS, big, ROUNDS.answers[i], t, LIT.main);
          writeField(GLYPHS, big, ROUNDS.points[i],  p, LIT.main);
          setRoundNumberVisible(i + 1, isNonEmpty(t) || isNonEmpty(rawP));
        }
        if (suma !== undefined) roundsState.suma = (suma ?? "").toString();
        else roundsState.suma = (roundsState.suma ?? "").toString();
        relocateSumaIfNeeded();
        const F = roundsSumaFields();
        writeField(GLYPHS, big, F.label, SUMA_LABEL, LIT.main);
        const txt = isNonEmpty(roundsState.suma) ? alignRight(roundsState.suma, 3) : "   ";
        writeField(GLYPHS, big, F.val, txt, LIT.main);
        if (animIn) await api.big.animIn({ ...animIn, area: A_ALL });
      },
    },

    final: {
      setLeft: async (idx1to5, text, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        const raw = (text ?? "").toString();
        const t = clipText(raw, 11);
        await updateField(GLYPHS, big, FINAL.leftTxt[i], t, { out: animOut, in: animIn, color: LIT.main });
      },
      setA: async (idx1to5, pts, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        const raw = (pts ?? "").toString();
        const p = alignRight(raw, 2);
        await updateField(GLYPHS, big, FINAL.ptsA[i], p, { out: animOut, in: animIn, color: LIT.main });
      },
      setB: async (idx1to5, pts, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        const raw = (pts ?? "").toString();
        const p = alignRight(raw, 2);
        await updateField(GLYPHS, big, FINAL.ptsB[i], p, { out: animOut, in: animIn, color: LIT.main });
      },
      setRight: async (idx1to5, text, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        const raw = (text ?? "").toString();
        const t = clipText(raw, 11);
        await updateField(GLYPHS, big, FINAL.rightTxt[i], t, { out: animOut, in: animIn, color: LIT.main });
      },
      setRow: async (idx1to5, { left=undefined, a=undefined, b=undefined, right=undefined, animOut=null, animIn=null } = {}) => {
        if (left  !== undefined) await api.final.setLeft(idx1to5, left,  { animOut, animIn });
        if (a     !== undefined) await api.final.setA(idx1to5, a,        { animOut, animIn });
        if (b     !== undefined) await api.final.setB(idx1to5, b,        { animOut, animIn });
        if (right !== undefined) await api.final.setRight(idx1to5, right,{ animOut, animIn });
      },
      setSumMode: (side) => {
        const s = (side ?? "").toString().toUpperCase();
        if (s !== "A" && s !== "B") throw new Error(`FSUMMODE: nieznana strona: ${side}`);
        finalState.sumMode = s;
        drawFinalSum();
      },
      setSuma: async (val, { animOut = null, animIn = null } = {}) => {
        const v = (val ?? "").toString();
        if (finalState.sumMode === "A") finalState.sumA = v;
        else finalState.sumB = v;
        const isA = (finalState.sumMode === "A");
        const labelField = isA ? FINAL.sumaALabel : FINAL.sumaBLabel;
        const valField   = isA ? FINAL.sumaAVal   : FINAL.sumaBVal;
        const txt = alignRight(v, 3);
        clearFinalSumRow();
        writeField(GLYPHS, big, labelField, SUMA_LABEL, LIT.main);
        await updateField(GLYPHS, big, valField, txt, { out: animOut, in: animIn, color: LIT.main });
      },
      setSumaA: async (val, anims={}) => {
        const prevMode = finalState.sumMode;
        finalState.sumMode = "A";
        await api.final.setSuma(val, anims);
        finalState.sumMode = prevMode;
      },
      setSumaB: async (val, anims={}) => {
        const prevMode = finalState.sumMode;
        finalState.sumMode = "B";
        await api.final.setSuma(val, anims);
        finalState.sumMode = prevMode;
      },
      setSumaFor: async (side, val, anims = {}) => {
        const s = (side ?? "").toString().toUpperCase();
        if (s !== "A" && s !== "B") throw new Error(`setSumaFor: nieznana strona: ${side}`);
        finalState.sumMode = s;
        return api.final.setSuma(val, anims);
      },
      setAll: async ({ rows = [], suma = undefined, sumaSide = null, animOut = null, animIn = null } = {}) => {
        const A_ALL = api.big.areaAll();
        const hasAnyRowData = rows.some(r => isNonEmpty(r?.left) || isNonEmpty(r?.a) || isNonEmpty(r?.b) || isNonEmpty(r?.right));
        const hasSumaArg = (suma !== undefined);
        if (animOut && !animIn && !hasAnyRowData && !hasSumaArg) {
          await api.big.animOut({ ...animOut, area: A_ALL });
          clearBig(big);
          finalState.sumA = "";
          finalState.sumB = "";
          return;
        }
        if (animOut) await api.big.animOut({ ...animOut, area: A_ALL });
        for (let i = 0; i < 5; i++) {
          const r = rows[i] ?? {};
          const L = clipText((r.left  ?? "").toString(), 11);
          const A = alignRight((r.a    ?? "").toString(), 2);
          const B = alignRight((r.b    ?? "").toString(), 2);
          const R = clipText((r.right ?? "").toString(), 11);
          writeField(GLYPHS, big, FINAL.leftTxt[i],  L, LIT.main);
          writeField(GLYPHS, big, FINAL.ptsA[i],     A, LIT.main);
          writeField(GLYPHS, big, FINAL.ptsB[i],     B, LIT.main);
          writeField(GLYPHS, big, FINAL.rightTxt[i], R, LIT.main);
        }
        if (suma !== undefined && (sumaSide === "A" || sumaSide === "B")) {
          if (sumaSide === "A") { finalState.sumA = (suma ?? "").toString(); finalState.sumMode = "A"; }
          else { finalState.sumB = (suma ?? "").toString(); finalState.sumMode = "B"; }
        }
        drawFinalSum();
        if (animIn) await api.big.animIn({ ...animIn, area: A_ALL });
      },
      setHalf: async (side, { rows = [], animOut = null, animIn = null } = {}) => {
        const s = (side ?? "").toString().toUpperCase();
        let area;
        if (s === "A") area = FINAL_AREA_LEFT;
        else if (s === "B") area = FINAL_AREA_RIGHT;
        else throw new Error(`final.setHalf: nieznana strona: ${side}`);
        if (animOut) await api.big.animOut({ ...animOut, area });
        for (let i = 0; i < 5; i++) {
          const r = rows[i] ?? {};
          if (s === "A") {
            const L = clipText((r.left ?? "").toString(), 11);
            const A = alignRight((r.a   ?? "").toString(), 2);
            writeField(GLYPHS, big, FINAL.leftTxt[i], L, LIT.main);
            writeField(GLYPHS, big, FINAL.ptsA[i],    A, LIT.main);
          } else {
            const B = alignRight((r.b    ?? "").toString(), 2);
            const R = clipText((r.right ?? "").toString(), 11);
            writeField(GLYPHS, big, FINAL.ptsB[i],    B, LIT.main);
            writeField(GLYPHS, big, FINAL.rightTxt[i], R, LIT.main);
          }
        }
        if (animIn) await api.big.animIn({ ...animIn, area });
      },
    },

    debug: {
      showFont: (opts = {}) => {
        const kind  = (opts.kind  || "ALL").toUpperCase();
        const group = (opts.group || "");
        const text  = (opts.text  || "");
        const groups = Object.keys(FONT5).filter(k => k !== "meta").map(name => ({ name: name.toUpperCase(), map: FONT5[name] || {} }));
        const allChars = groups.flatMap(g => Object.keys(g.map));
        let chars = [];
        if (kind === "ALL") chars = allChars;
        else if (kind === "GROUP") {
          const wanted = group.toUpperCase();
          const g = groups.find(g => g.name === wanted);
          if (!g) { console.warn(`DEBUG FONT GROUP: nie ma grupy "${group}". Dostępne: ${groups.map(g => g.name.toLowerCase()).join(", ")}`); return; }
          chars = Object.keys(g.map);
        } else if (kind === "TEXT") chars = Array.from(text);
        else chars = Array.from(text || kind);
        api.big.clear();
        let i = 0;
        for (let row = 1; row <= big.tilesY; row++) {
          for (let col = 1; col <= big.tilesX; col++) {
            if (i >= chars.length) return;
            api.big.put(col, row, chars[i]);
            i++;
          }
        }
      },
    },
  };

  // ============================================================
  // Command handler
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
    const extra = (tokens[startIdx + 3] ?? "").toLowerCase();
    const base = { type: type === "matrix" ? "matrix" : "edge", ms: isFinite(ms) ? ms : (type === "matrix" ? 36 : 12) };
    if (type === "edge")  base.dir  = dirOrAxis || "left";
    if (type === "matrix") base.axis = dirOrAxis || "down";
    if (extra === "pixel") base.pixel = true;
    return base;
  };

  const parseAnimPair = (tokens) => {
    const aOutIdx = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
    const aInIdx  = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    return { animOut: aOutIdx >= 0 ? parseAnim(tokens, aOutIdx + 1) : null, animIn: aInIdx >= 0 ? parseAnim(tokens, aInIdx + 1) : null };
  };

  const handleCommand = async (line) => {
    const raw = (line ?? "").toString().trim();
    if (!raw) return;
    const tokens = tokenize(raw);
    const head = (tokens[0] ?? "").toUpperCase();

    if (head === "COLOR") {
      const target = (tokens[1] ?? "").toUpperCase();
      if (target === "RESET") { resetTheme(); return; }
      const val = unquote(tokens.slice(2).join(" "));
      try { setBaseColor(target, val); } catch (e) { console.warn(String(e?.message || e)); }
      return;
    }

    if (head === "DEBUG") {
      const op = (tokens[1] ?? "").toUpperCase();
      if (op === "FONT") {
        const sub = (tokens[2] ?? "").toUpperCase();
        if (!sub || sub === "ALL") return api.debug.showFont({ kind: "ALL" });
        if (sub === "GROUP") return api.debug.showFont({ kind: "GROUP", group: tokens[3] ?? "" });
        if (sub === "TEXT") return api.debug.showFont({ kind: "TEXT", text: unquote(tokens.slice(3).join(" ")) });
        return api.debug.showFont({ kind: "TEXT", text: unquote(tokens.slice(2).join(" ")) });
      }
    }

    if (head === "TOP")   return api.small.topDigits(tokens[1] ?? "");
    if (head === "LEFT")  return api.small.leftDigits(tokens[1] ?? "");
    if (head === "RIGHT") return api.small.rightDigits(tokens[1] ?? "");
    if (head === "LONG1") return api.small.long1(unquote(tokens.slice(1).join(" ")));
    if (head === "LONG2") return api.small.long2(unquote(tokens.slice(1).join(" ")));

    if (head === "INDICATOR") {
      const val = (tokens[1] ?? "OFF").toUpperCase();
      if (val === "OFF" || val === "ON_A" || val === "ON_B") return api.indicator.set(val);
      console.warn("INDICATOR: nieznany stan:", val);
      return;
    }

    if (head === "BLANK") { bigMode = "OTHER"; api.big.clear(); return; }

    if (head === "LOGO") {
      bigMode = "OTHER";
      const op = (tokens[1] ?? "").toUpperCase();
      if (op === "LOAD") { console.warn("LOGO LOAD jest wyłączone."); return; }
      if (op === "RELOAD") {
        const gid = api.logo._gameId, key = api.logo._key;
        if (!gid) return;
        loadActiveLogoFromDb(gid, key).then(dbLogo => {
          if (dbLogo && dbLogo.type && dbLogo.payload) ACTIVE_LOGO = dbLogo;
          else ACTIVE_LOGO = null;
          try { api.logo.draw(); } catch (e) { console.warn("[logo] draw after RELOAD failed:", e); }
        }).catch(e => console.warn("[logo] RELOAD failed:", e));
        return;
      }
      if (op === "DRAW") { api.logo.draw(); return; }
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

    if (head === "WIN") {
      bigMode = "OTHER";
      const num = tokens[1] ?? "";
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.win.set(num, { animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "RBATCH") {
      bigMode = "ROUNDS";
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
      const sIdx = tokens.findIndex(t => t.toUpperCase() === "SUMA");
      const suma = sIdx >= 0 ? (tokens[sIdx + 1] ?? "") : undefined;
      const rows = Array.from({ length: 6 }, () => ({ text:"", pts:"" }));
      for (let i = 1; i <= 6; i++) {
        const k = tokens.findIndex(t => t.toUpperCase() === `R${i}`);
        if (k >= 0) { rows[i-1].text = unquote(tokens[k + 1] ?? ""); rows[i-1].pts = (tokens[k + 2] ?? ""); }
      }
      return api.rounds.setAll({ rows, suma, animOut, animIn });
    }

    if (head === "RTXT") {
      bigMode = "ROUNDS";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.rounds.setText(idx, text, { animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "RPTS") {
      bigMode = "ROUNDS";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.rounds.setPts(idx, pts, { animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "R") {
      bigMode = "ROUNDS";
      const idx  = parseInt(tokens[1] ?? "0", 10);
      const tIdx = tokens.findIndex(t => t.toUpperCase() === "TXT");
      const pIdx = tokens.findIndex(t => t.toUpperCase() === "PTS");
      const text = tIdx >= 0 ? unquote(tokens[tIdx + 1] ?? "") : undefined;
      const pts  = pIdx >= 0 ? (tokens[pIdx + 1] ?? "") : undefined;
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.rounds.setRow(idx, { text, pts, animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "RSUMA") {
      bigMode = "ROUNDS";
      const val = tokens[1] ?? "";
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.rounds.setSuma(val, { animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "RX") {
      bigMode = "ROUNDS";
      const name = (tokens[1] ?? "").toUpperCase();
      const on = ((tokens[2] ?? "").toUpperCase() === "ON");
      return api.rounds.setX(name, on);
    }

    if (head === "FBATCH") {
      bigMode = "FINAL";
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
      let suma = undefined, sumaSide = null;
      const sIdx = tokens.findIndex(t => t.toUpperCase() === "SUMA");
      if (sIdx >= 0) {
        const sideTok = (tokens[sIdx + 1] ?? "").toUpperCase();
        if (sideTok === "A" || sideTok === "B") { sumaSide = sideTok; suma = tokens[sIdx + 2] ?? ""; }
      }
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
      return api.final.setAll({ rows, suma, sumaSide, animOut, animIn });
    }

    if (head === "FHALF") {
      bigMode = "FINAL";
      const side = (tokens[1] ?? "").toUpperCase();
      const ao = tokens.findIndex((t, idx) => idx > 1 && t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex((t, idx) => idx > 1 && t.toUpperCase() === "ANIMIN");
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
      const rows = Array.from({ length: 5 }, () => ({}));
      for (let i = 1; i <= 5; i++) {
        const k = tokens.findIndex(t => t.toUpperCase() === `F${i}`);
        if (k < 0) continue;
        if (side === "A") { rows[i-1] = { left: unquote(tokens[k + 1] ?? ""), a: tokens[k + 2] ?? "" }; }
        else if (side === "B") { rows[i-1] = { b: tokens[k + 1] ?? "", right: unquote(tokens[k + 2] ?? "") }; }
        else throw new Error(`FHALF: nieznana strona: ${side}`);
      }
      return api.final.setHalf(side, { rows, animOut, animIn });
    }

    if (head === "FL") {
      bigMode = "FINAL";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.final.setLeft(idx, text, { animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "FA") {
      bigMode = "FINAL";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.final.setA(idx, pts, { animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "FB") {
      bigMode = "FINAL";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.final.setB(idx, pts, { animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "FR") {
      bigMode = "FINAL";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.final.setRight(idx, text, { animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "F") {
      bigMode = "FINAL";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const L = tokens.findIndex(t => t.toUpperCase() === "L");
      const A = tokens.findIndex(t => t.toUpperCase() === "A");
      const B = tokens.findIndex(t => t.toUpperCase() === "B");
      const R = tokens.findIndex(t => t.toUpperCase() === "R");
      const left  = L >= 0 ? unquote(tokens[L + 1] ?? "") : undefined;
      const a     = A >= 0 ? (tokens[A + 1] ?? "") : undefined;
      const b     = B >= 0 ? (tokens[B + 1] ?? "") : undefined;
      const right = R >= 0 ? unquote(tokens[R + 1] ?? "") : undefined;
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      return api.final.setRow(idx, { left, a, b, right, animOut: ao >= 0 ? parseAnim(tokens, ao + 1) : null, animIn: ai >= 0 ? parseAnim(tokens, ai + 1) : null });
    }

    if (head === "FSUMA") {
      bigMode = "FINAL";
      let side = (tokens[1] ?? "").toUpperCase();
      let valIdx = 1;
      if (side === "A" || side === "B") valIdx = 2;
      else side = null;
      const val = tokens[valIdx] ?? "";
      const ao = tokens.findIndex((t, idx) => idx > valIdx && t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex((t, idx) => idx > valIdx && t.toUpperCase() === "ANIMIN");
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
      if (side === "A" || side === "B") return api.final.setSumaFor(side, val, { animOut, animIn });
      return api.final.setSuma(val, { animOut, animIn });
    }

    console.warn("Nieznana komenda (scene):", raw);
  };

  // ============================================================
  // Init
  // ============================================================
  clearBig(big);
  setTripleDigits(GLYPHS, topTriple,   "   ", LIT.top);
  setTripleDigits(GLYPHS, leftTriple,  "   ", LIT.left);
  setTripleDigits(GLYPHS, rightTriple, "   ", LIT.right);
  setLongTextCenteredMax15(GLYPHS, long1, "", LIT.main);
  setLongTextCenteredMax15(GLYPHS, long2, "", LIT.main);

  applyTheme();

  return { api, handleCommand };
}
