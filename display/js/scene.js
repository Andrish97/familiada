// scene.js
import { loadJson, buildGlyphMap, resolveGlyph } from "./fonts.js";
import { createAnimator } from "./anim.js";
import { sb } from "../../js/core/supabase.js";
import { t } from "../../translation/translation.js";

export async function createScene() {
  const NS = "http://www.w3.org/2000/svg";
  const $  = (id) => document.getElementById(id);
  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const VIEW = { W: 1600, H: 900, CX: 800, CY: 450 };
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

  // Akceptuje: "#rgb", "#rrggbb", "dodgerblue", "red", itd.
  // Zwraca {r,g,b} albo null
  const cssColorToRgb = (css) => {
    const s = (css ?? "").toString().trim();
    if (!s) return null;
    const tmp = document.createElement("div");
    tmp.style.color = "";
    tmp.style.color = s;
    if (!tmp.style.color) return null; // przeglądarka nie rozpoznała
    document.body.appendChild(tmp);
    const rgb = getComputedStyle(tmp).color; // "rgb(r,g,b)" / "rgba"
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

  // 3 bazowe (domyślne)
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

    // pochodne “ciemniejsze” do gradientu obwódki
    THEME.derived.A_dark = rgbToHex(darken(A, 0.38));
    THEME.derived.B_dark = rgbToHex(darken(B, 0.35));

    // lampki: jaśniejsze od bazowych
    THEME.derived.A_lamp = rgbToHex(lighten(A, 0.25));
    THEME.derived.B_lamp = rgbToHex(lighten(B, 0.18));

    // neon: glow pochodny od B
    THEME.derived.B_glow = rgbToHex(lighten(B, 0.28));

    // tło: tylko BG + delikatny akcent A/B (bez fioletu)
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

  // Referencje do elementów, które chcemy “tematyzować”
  let basebarOutlineA = null;
  let basebarOutlineB = null;

  // Lampy (po utworzeniu)
  let lampA = null;
  let lampB = null;

  const applyTheme = () => {
    computeDerived();

    // CSS vars (tło i ew. użycie później)
    document.documentElement.style.setProperty("--teamA", THEME.base.A);
    document.documentElement.style.setProperty("--teamB", THEME.base.B);
    document.documentElement.style.setProperty("--bg",    THEME.base.BG);
    document.documentElement.style.setProperty("--bg-gradient", THEME.derived.bgGradient);

    // rim gradient stops
    const rimA  = $("rimStopA");
    const rimA2 = $("rimStopA2");
    const rimB2 = $("rimStopB2");
    const rimB  = $("rimStopB");
    if (rimA)  rimA.setAttribute("stop-color", THEME.base.A);
    if (rimA2) rimA2.setAttribute("stop-color", THEME.derived.A_dark);
    if (rimB2) rimB2.setAttribute("stop-color", THEME.derived.B_dark);
    if (rimB)  rimB.setAttribute("stop-color", THEME.base.B);

    // neon filter (glow)
    const ds1 = $("neonDS1");
    const ds2 = $("neonDS2");
    if (ds1) ds1.setAttribute("flood-color", THEME.derived.B_glow);
    if (ds2) ds2.setAttribute("flood-color", THEME.derived.B_glow);

    // basebar outlines
    if (basebarOutlineA) basebarOutlineA.setAttribute("stroke", THEME.base.A);
    if (basebarOutlineB) basebarOutlineB.setAttribute("stroke", THEME.base.B);

    // lamp colors (jeśli już istnieją)
    if (lampA?.setColor) lampA.setColor(THEME.derived.A_lamp);
    if (lampB?.setColor) lampB.setColor(THEME.derived.B_lamp);
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
    // ustawiamy hurtowo i robimy applyTheme tylko raz
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

  // Backward-compat: gdy animator nie ma OUT, robimy aliasy na IN,
  // żeby ANIMOUT przynajmniej nie wywalał się błędem.
  if (typeof anim.outEdge !== "function" && typeof anim.inEdge === "function") {
    anim.outEdge = (...args) => anim.inEdge(...args);
  }
  if (typeof anim.outMatrix !== "function" && typeof anim.inMatrix === "function") {
    anim.outMatrix = (...args) => anim.inMatrix(...args);
  }
  
  // Prosta normalizacja ms: albo użyj podanego, albo fallback, bez globalnego mnożnika
  const normMs = (ms, fallback) => {
    const base = Number.isFinite(ms) ? ms : fallback;
    return Math.max(0, base | 0);
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
  
    const gap = 1;              // zwykła przerwa między cyframi
    const groupGapExtra = 1;    // +1 tylko między tysiącami a setkami => razem 2
  
    const widths = s.split("").map(d => (WIN_DIGITS[d] ? measureWinDigit(WIN_DIGITS[d]).w : 0));
  
    // policz totalW z uwzględnieniem separatora 3-cyfrowego od prawej
    let totalW = widths.reduce((a, b) => a + b, 0);
    if (s.length > 1) totalW += gap * (s.length - 1);
    if (s.length > 3) totalW += groupGapExtra; // dodatkowa przerwa na granicy tys|set
  
    const startCol1 = 1 + Math.max(0, Math.floor((30 - totalW) / 2));
  
    let cx = startCol1;
    for (let i = 0; i < s.length; i++) {
      const w = drawWinDigitTight(GLYPHS, big, WIN_DIGITS, cx, rowTop1, s[i], color);
      cx += w;
  
      // przerwy po cyfrze (nie po ostatniej)
      if (i < s.length - 1) {
        cx += gap;
  
        // jeśli następna cyfra zaczyna grupę 3 od prawej, dodaj extra gap
        // granica jest przed ostatnimi 3 cyframi => po indeksie (s.length - 4)
        if (s.length > 3 && i === (s.length - 4)) {
          cx += groupGapExtra; // razem daje 2 kolumny
        }
      }
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

  const drawRoundsBigX = (GLYPHS, big, side, color) => {
    const s = (side ?? "").toString().toUpperCase(); // "A" lub "B"

    const put = (col1, row1, ch) => putCharAt(GLYPHS, big, col1, row1, ch, color);

    if (s === "A") {
      // Lewy:
      // ◣ 1:4, ◢ 3:4, ◥ 1:5, ◤ 3:5, ⧗ 2:6, ◢ 1:7, ◣ 3:7, ◤ 1:8, ◥ 3:8
      put(1, 4, "◣"); put(3, 4, "◢");
      put(1, 5, "◥"); put(3, 5, "◤");
      put(2, 6, "⧗");
      put(1, 7, "◢"); put(3, 7, "◣");
      put(1, 8, "◤"); put(3, 8, "◥");
      return;
    }

    if (s === "B") {
      // Prawy:
      // ◣ 28:4, ◢ 30:4, ◥ 28:5, ◤ 30:5, ⧗ 29:6, ◢ 28:7, ◣ 30:7, ◤ 28:8, ◥ 30:8
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
  
  const alignRight = (val, width) => {
    const s = (val ?? "").toString();
    if (!s.length) return " ".repeat(width);
    return s.length >= width
      ? s.slice(-width)
      : " ".repeat(width - s.length) + s;
  };
  
  const clipText = (val, max) => {
    const s = (val ?? "").toString();
    return s.length > max ? s.slice(0, max) : s;
  };
  
  const updateField = async (
    GLYPHS,
    big,
    f,
    text,
    { out = null, in: inn = null, color = LIT.main } = {}
  ) => {
    const area = { c1: f.c1, r1: f.r1, c2: f.c2, r2: f.r2 };

    const normalizeOpts = (a) => {
      if (!a) return undefined;
      const opts = {};
      if (a.pixel)          opts.pixel    = true;
      if (a.pxBatch != null)  opts.pxBatch  = a.pxBatch;
      if (a.stepPxMs != null) opts.stepPxMs = a.stepPxMs;
      if (a.tileMs   != null) opts.tileMs   = a.tileMs;
      return opts;
    };

    const hasOut = !!out;
    const hasIn  = !!inn;

    // ======= 1) ANIMOUT + zapis =======
    // Jeśli *jest* OUT, to go respektujemy:
    //   OUT -> writeField -> (ew. IN)
    if (hasOut) {
      const type = out.type || "edge";
      const step = normMs(out.ms, 20);
      const opts = normalizeOpts(out);

      if (type === "edge") {
        await anim.outEdge(big, area, out.dir || "left", step, opts);
      } else if (type === "matrix") {
        await anim.outMatrix(big, area, out.axis || "down", step, opts);
      }
      // po wyjściu nadpisujemy nową treścią
      writeField(GLYPHS, big, f, text, color);
    } else {
      // ======= 2) BRAK ANIMOUT =======
      // Reguła, o którą prosisz:
      // traktujemy pole jak czyste i po prostu NADPISUJEMY,
      // nie robimy żadnego dodatkowego czyszczenia przed.
      writeField(GLYPHS, big, f, text, color);
    }

    // ======= 3) ANIMIN (opcjonalny) =======
    if (hasIn) {
      const type = inn.type || "edge";
      const step = normMs(inn.ms, 20);
      const opts = normalizeOpts(inn);

      if (type === "edge") {
        await anim.inEdge(big, area, inn.dir || "left", step, opts);
      } else if (type === "matrix") {
        await anim.inMatrix(big, area, inn.axis || "down", step, opts);
      }
    }
  };

  // ============================
  // Layout: ROUNDS (6 linii)
  // ============================
  const ROUNDS = (() => {
    const rows = [2,3,4,5,6,7]; // 6 wierszy
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

  // Stan i zasada “numer tylko gdy jest tekst”
  const roundsState = {
    text: Array(6).fill(""),
    pts:  Array(6).fill(""),
    suma: "",
    sumaRow: 9, // startowo na dole
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
      label: field("SUMA_LABEL", 19, r, 4),
      val:   field("SUMA_VAL",   24, r, 3),
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
    writeField(GLYPHS, big, F.label, SUMA_LABEL, LIT.main);
    if (isNonEmpty(roundsState.suma)) writeField(GLYPHS, big, F.val, roundsState.suma, LIT.main);
  };

    // Odtwarza cały ekran ROUNDS na podstawie roundsState
  const redrawRounds = () => {
    // 1) czyścimy cały big
    clearBig(big);
  
    // 2) 6 wierszy odpowiedzi + punktów
    for (let i = 0; i < 6; i++) {
      const tRaw = roundsState.text[i] ?? "";
      const pRaw = roundsState.pts[i]  ?? "";
  
      const t = clipText(tRaw, 17);    // tekst max 17 znaków
      const p = alignRight(pRaw, 2);   // punkty na 2 znaki
  
      // odpowiedź
      writeField(GLYPHS, big, ROUNDS.answers[i], t, LIT.main);
      // punkty
      writeField(GLYPHS, big, ROUNDS.points[i],  p, LIT.main);
  
      // numer rundy tylko gdy mamy tekst lub punkty
      const hasData = isNonEmpty(tRaw) || isNonEmpty(pRaw);
      setRoundNumberVisible(i + 1, hasData);
    }
  
    // 3) SUMA pod odpowiednią ostatnią linią
    //    (używamy obecnego roundsState.suma i roundsState.sumaRow)
    relocateSumaIfNeeded();
    const F = roundsSumaFields();
  
    writeField(GLYPHS, big, F.label, SUMA_LABEL, LIT.main);
  
    const sumaTxt = isNonEmpty(roundsState.suma)
      ? alignRight(roundsState.suma, 3)
      : "   ";
  
    writeField(GLYPHS, big, F.val, sumaTxt, LIT.main);
  };
  
  // ============================
  // Layout: FINAL (o 1 wiersz niżej) + 2 sumy
  // ============================
  const FINAL = (() => {
    // było [2,3,4,5,6], teraz 1 w dół:
    const rows = [3,4,5,6,7];
  
    const leftTxt   = rows.map((r,i)=>field(`F${i+1}_LTXT`, 1,  r, 11));
    const ptsA      = rows.map((r,i)=>field(`F${i+1}_A`,    13, r, 2));
    const ptsB      = rows.map((r,i)=>field(`F${i+1}_B`,    17, r, 2));
    const rightTxt  = rows.map((r,i)=>field(`F${i+1}_RTXT`, 20, r, 11));
  
    // Suma A – label od kol. 7, value od 12, rząd 9
    const sumaALabel = field("FSUMA_A_LABEL", 7,  9, 4);
    const sumaAVal   = field("FSUMA_A_VAL",   12, 9, 3);
  
    // Suma B – jak było, tylko też w rzędzie 9
    const sumaBLabel = field("FSUMA_B_LABEL", 11, 9, 4);
    const sumaBVal   = field("FSUMA_B_VAL",   16, 9, 3);
  
    return { rows, leftTxt, ptsA, ptsB, rightTxt, sumaALabel, sumaAVal, sumaBLabel, sumaBVal };
  })();

  // Stan dwóch sum w FINAL – na ekranie widać tylko jedną naraz
  const finalState = {
    sumMode: "B", // "A" | "B" – która suma jest aktualnie wyświetlana
    sumA: "",
    sumB: "",
  };
  
  // Czyści całą linijkę z sumą (rząd 9)
  const clearFinalSumRow = () => clearArea(big, 1, 9, 30, 9);
  // Rysuje na ekranie tylko tę sumę, która jest w finalState.sumMode
  const drawFinalSum = () => {
    // ZAWSZE czyścimy całą linię 9, żeby nie było hybryd typu "SUMAS"
    clearFinalSumRow();
  
    if (finalState.sumMode === "A") {
      writeField(GLYPHS, big, FINAL.sumaALabel, SUMA_LABEL, LIT.main);
      const txt = alignRight(finalState.sumA, 3);
      writeField(GLYPHS, big, FINAL.sumaAVal, txt, LIT.main);
    } else {
      writeField(GLYPHS, big, FINAL.sumaBLabel, SUMA_LABEL, LIT.main);
      const txt = alignRight(finalState.sumB, 3);
      writeField(GLYPHS, big, FINAL.sumaBVal, txt, LIT.main);
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
  
  // Obszary połówek FINAL (bez sum)
  const FINAL_AREA_LEFT  = { c1: 1,  r1: 3, c2: 14, r2: 7 }; // left + A
  const FINAL_AREA_RIGHT = { c1: 17, r1: 3, c2: 30, r2: 7 }; // B + right

  // ============================================================
  // Small displays rules
  // ============================================================
  const setTripleDigits = (GLYPHS, tripleTiles, text, onColor) => {
    let s = (text ?? "").toString().replace(/\D/g, "");
  
    // maksymalnie 3 znaki, ale wyrównane do prawej
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
  // Build SVG scene – najpierw BIG, potem z niego stadion + panele
  // ============================================================
  const FONT5 = await loadJson("./font_5x7.json");
  const GLYPHS = buildGlyphMap(FONT5);

  const FONTWIN = await loadJson("./font_win.json");
  const WIN_DIGITS = FONTWIN?.digits || {};

  let LOGO_JSON = null;
  try { LOGO_JSON = await loadJson("./logo_familiada.json"); } catch {}
  const DEFAULT_LOGO = LOGO_JSON ?? { layers:[{ color:"main", rows:Array(10).fill(" ".repeat(30)) }] }; // fallback z pliku
  let ACTIVE_LOGO = null;          // tu będzie { type, payload, name } z bazy albo null

  const loadActiveLogoFromDb = async (gameId, key) => {
    if (!gameId || !key) return null;
    try {
      const { data, error } = await sb().rpc("display_logo_get_public", {
        p_game_id: gameId,
        p_key: key,
      });
      if (error) {
        console.warn("[logo] rpc error:", error);
        return null;
      }
      return data || null;
    } catch (e) {
      console.warn("[logo] rpc failed:", e);
      return null;
    }
  };

  const center  = $("center");
  const panels  = $("panels");
  const basebar = $("basebar");
  const bottom  = $("bottom");

  // ---------- 1. BIG (30x10) – to jest nasz "główny prostokąt" ----------
  const dCell = d;
  const wSmall = Wgrid(5, dCell, g);
  const hSmall = Hgrid(7, dCell, g);

  const width1  = 30 * wSmall + 29 * gapCells + 2 * g;  // szerokość BIG
  const height1 = 10 * hSmall +  9 * gapCells + 2 * g;  // wysokość BIG

  const bigCx = VIEW.CX;
  const bigCy = VIEW.CY;

  const bigX = bigCx - width1  / 2;
  const bigY = bigCy - height1 / 2;

  const big = drawTiledDisplay5x7(center, bigX, bigY, 30, 10, dCell, g, gapCells, COLORS);

  // ---------- 2. Stadion wokół BIG-a: mały (inner) + duży (outer) ----------

  // R2: minimalny stadion wpisany w prostokąt width1 x height1 (BIG rogami dotyka)
  const R2      = (width1 * width1 + height1 * height1) / (4 * width1);
  const width2  = 4 * R2;
  const height2 = 2 * R2;

  // Triplet: z niego bierzemy "domniemaną" grubość pierścienia
  const dP = 3 * d;
  const wSmallP = Wgrid(5, dP, g);
  const hSmallP = Hgrid(7, dP, g);

  const panelW = 3 * wSmallP + 2 * gapCells + 2 * g; // wm
  const panelH = 1 * hSmallP + 2 * g;                // hm

  const dxRing = panelW * 0.95;
  const dyRing = panelH * 0.95;
  const dRing  = Math.min(dxRing, dyRing);

  const R3      = R2 + dRing;
  const width3  = 4 * R3;
  const height3 = 2 * R3;

  // prostokąty stadionów w układzie ekranu (środek w bigCx/bigCy)
  const outer = {
    x: bigCx - width3 / 2,
    y: bigCy - height3 / 2,
    w: width3,
    h: height3,
  };
  const inner = {
    x: bigCx - width2 / 2,
    y: bigCy - height2 / 2,
    w: width2,
    h: height2,
  };

  const outerRight   = outer.x + outer.w;
  const outerBottom  = outer.y + outer.h;
  const innerRight   = inner.x + inner.w;
  const innerBottom  = inner.y + inner.h;
  const outerTop     = outer.y;
  const innerTop     = inner.y;
  const outerLeft    = outer.x;
  const innerLeft    = inner.x;

  // Podbijamy prostokąty stadionów do SVG (jeśli są w index.html)
  const outerOval = $("outerOval");
  if (outerOval) {
    outerOval.setAttribute("x", outer.x);
    outerOval.setAttribute("y", outer.y);
    outerOval.setAttribute("width",  outer.w);
    outerOval.setAttribute("height", outer.h);
    // rx/ry zostają z HTML (stadion / "rounded rect" z gradientem)
  }

  const innerOval = $("innerOval");
  if (innerOval) {
    innerOval.setAttribute("x", inner.x);
    innerOval.setAttribute("y", inner.y);
    innerOval.setAttribute("width",  inner.w);
    innerOval.setAttribute("height", inner.h);
  }

 // ============================================================
  // LINIE Z ALGORYTMU STADIONU (8 linii z 2 promieni)
  // – liczymy w układzie matematycznym (0,0 w środku stadionu, oś Y w górę),
  //   a potem transformujemy na SVG: X = bigCx + x, Y = bigCy - y
  // ============================================================
  const frameLines = $("frameLines");
  if (frameLines) {
    frameLines.innerHTML = "";

    // pomocniczo: przecinanie zewnętrznego stadionu promieniem
    function intersectCapsuleFromCenter(R2, R3, theta) {
      const cx = R2;  // środek małego PRAWEGO koła (tak jak w Twoim demie)
      const cy = 0;
      const dxDir = Math.cos(theta);
      const dyDir = Math.sin(theta);
      const eps = 1e-6;
      let bestT = Infinity;

      // 1) górna / dolna prosta dużego stadionu: y = ±R3
      if (Math.abs(dyDir) > eps) {
        const yLines = [ R3, -R3 ];
        for (const yLine of yLines) {
          const t = (yLine - cy) / dyDir;
          if (t > R2 + eps) {
            const x = cx + t * dxDir;
            if (Math.abs(x) <= R3 + 1e-6 && t < bestT) {
              bestT = t;
            }
          }
        }
      }

      // 2) łuk prawego dużego koła: środek (R3,0), promień R3
      const uX = cx - R3;
      const uY = cy;
      const A = 1.0;
      const B = 2 * (uX * dxDir + uY * dyDir);
      const C = uX*uX + uY*uY - R3*R3;
      let disc = B*B - 4*A*C;
      if (disc >= -1e-9) {
        if (disc < 0) disc = 0;
        const sqrtD = Math.sqrt(disc);
        const t1 = (-B - sqrtD) / (2*A);
        const t2 = (-B + sqrtD) / (2*A);
        [t1, t2].forEach(t => {
          if (t > R2 + eps) {
            const x = cx + t*dxDir;
            // prawe koło: x >= R3
            if (x >= R3 - 1e-6 && t < bestT) {
              bestT = t;
            }
          }
        });
      }

      return bestT;
    }

    function baseLine(theta) {
      const cxSmall = R2;
      const cySmall = 0;
      const dxDir   = Math.cos(theta);
      const dyDir   = Math.sin(theta);

      // punkt startowy na małym okręgu (prawa strona kapsuły)
      const tSmall = R2;
      const x1 = cxSmall + tSmall * dxDir;
      const y1 = cySmall + tSmall * dyDir;

      // trafienie w duży stadion
      const tHit = intersectCapsuleFromCenter(R2, R3, theta);
      const x2 = cxSmall + tHit * dxDir;
      const y2 = cySmall + tHit * dyDir;

      return { x1, y1, x2, y2 };
    }

    const lines = [];

    function addSymmetricLines(L) {
      const { x1, y1, x2, y2 } = L;
      // oryginał
      lines.push({ x1, y1, x2, y2 });
      // odbicie w osi X
      lines.push({ x1, y1: -y1, x2, y2: -y2 });
      // odbicie w osi Y
      lines.push({ x1: -x1, y1, x2: -x2, y2 });
      // odbicie w obu osiach
      lines.push({ x1: -x1, y1: -y1, x2: -x2, y2: -y2 });
    }

    // dwa promienie jak w Twoim przykładzie:
    const theta1 = Math.PI / 6;   // "godzina 2" – 30°
    const theta2 = -Math.PI / 2;  // "godzina 6" – -90°

    const L1 = baseLine(theta1);
    const L2 = baseLine(theta2);

    addSymmetricLines(L1); // 2,4,8,10
    addSymmetricLines(L2); // 6,12 po prawej i lustrzane po lewej

    // rysujemy w SVG: środek (0,0) → (bigCx, bigCy), oś Y w dół
    for (const ln of lines) {
      const sx1 = bigCx + ln.x1;
      const sy1 = bigCy - ln.y1;
      const sx2 = bigCx + ln.x2;
      const sy2 = bigCy - ln.y2;

      frameLines.appendChild(el("line", {
        x1: sx1,
        y1: sy1,
        x2: sx2,
        y2: sy2,
        stroke: "#ffffff",
        "stroke-opacity": 0.9,
        "stroke-width": 4.5,
        "stroke-linecap": "round",
      }));
    }
  }

  // ---------- 4. Triplet górny + boczne w grubości pierścienia ----------

  // górny pasek: środek między outerTop a innerTop
  const topCenterY = (outerTop + innerTop) / 2;
  const topCenterX = bigCx;

  const topX = topCenterX - panelW / 2;
  const topY = topCenterY - panelH / 2;

  // boczne paski: środki między outer/inner na bokach
  const leftCenterX  = (outerLeft  + innerLeft)   / 2;
  const rightCenterX = (outerRight + innerRight) / 2;
  const sideCenterY  = bigCy;

  const leftX  = leftCenterX  - panelW / 2;
  const rightX = rightCenterX - panelW / 2;
  const sideY  = sideCenterY  - panelH / 2;

  const leftPanel  = drawTiledDisplay5x7(panels, leftX,  sideY, 3, 1, dP, g, gapCells, COLORS);
  const rightPanel = drawTiledDisplay5x7(panels, rightX, sideY, 3, 1, dP, g, gapCells, COLORS);
  const topPanel   = drawTiledDisplay5x7(panels, topX,   topY,  3, 1, dP, g, gapCells, COLORS);

  const leftTriple  = [leftPanel.tiles[0][0],  leftPanel.tiles[0][1],  leftPanel.tiles[0][2]];
  const rightTriple = [rightPanel.tiles[0][0], rightPanel.tiles[0][1], rightPanel.tiles[0][2]];
  const topTriple   = [topPanel.tiles[0][0],   topPanel.tiles[0][1],   topPanel.tiles[0][2]];

  // ---------- 5. Dolny pasek + dwa longi "na pierścieniu" ----------
  // Bottom (95x7) + basebar
  const dBottom = 1.5 * d;
  const Xb = 95, Yb = 7;
  const gapFromOval = 40;

  // dolna krawędź wewnętrznego owalu
  const ovalBottomY = innerBottom;

  const BOTTOM_LIFT = 8; // lekko niżej, ale nie wisi zbyt daleko
  const yBottom = ovalBottomY + gapFromOval - BOTTOM_LIFT;

  const wInnerB = Wgrid(Xb, dBottom, g);
  const hInnerB = Hgrid(Yb, dBottom, g);
  const wBlock  = wInnerB + 2 * g;
  const hBlock  = hInnerB + 2 * g;

  // long1 / long2 bliżej siebie
  const gapBetweenBlocks = 40;

  const totalW = 2 * wBlock + gapBetweenBlocks;
  const xLeft  = VIEW.CX - totalW / 2;
  const xRight = xLeft + wBlock + gapBetweenBlocks;

  // Pasek – szerszy i delikatniejszy
  const barX = 30;
  const barW = VIEW.W - 60; // trochę marginesu z lewej/prawej, ale szerszy niż 1500
  const barPadY = 12;
  const barY = yBottom - barPadY;
  const barH = hBlock + barPadY * 2;

  // TŁO paska
  basebar.appendChild(el("rect", {
    x: barX,
    y: barY,
    width: barW,
    height: barH,
    fill: "url(#silverGrad)",
  }));

  const halfW = barW / 2;
  const outlineW = 6;

  // LEWA połówka – czerwony, ale spokojniejszy
  basebarOutlineA = el("rect", {
    x: barX,
    y: barY,
    width: halfW,
    height: barH,
    fill: "none",
    stroke: THEME.base.A,
    "stroke-width": outlineW,
    "stroke-opacity": 0.55,
    "stroke-linejoin": "round",
    // bez filtra neonowego – mniej „wali po oczach”
    });
  basebar.appendChild(basebarOutlineA);

  // PRAWA połówka – niebieski, też spokojniejszy
  basebarOutlineB = el("rect", {
    x: barX + halfW,
    y: barY,
    width: halfW,
    height: barH,
    fill: "none",
    stroke: THEME.base.B,
    "stroke-width": outlineW,
    "stroke-opacity": 0.55,
    "stroke-linejoin": "round",
    });
  basebar.appendChild(basebarOutlineB);

  // delikatny wewnętrzny kontur
  basebar.appendChild(el("rect", {
    x: barX + 1,
    y: barY + 1,
    width: barW - 2,
    height: barH - 2,
    fill: "none",
    stroke: "#f6f7f9",
    "stroke-width": 1.5,
    "stroke-opacity": 0.7,
  }));

  // long1 / long2 – na tle paska, bliżej siebie
  const long1 = drawFramedDotPanel(bottom, xLeft,  yBottom, Xb, Yb, dBottom, g, COLORS);
  const long2 = drawFramedDotPanel(bottom, xRight, yBottom, Xb, Yb, dBottom, g, COLORS);

  // ============================================================
  // INDICATOR lamps on basebar (A left red, B right blue)
  // ============================================================
  const makeLamp = (parent, cx, cy, r, colorOn) => {
    const svg = parent.ownerSVGElement;
  
    // unikalne ID gradientu
    const gid = `lampGrad_${Math.random().toString(16).slice(2)}`;
  
    // defs jeśli nie ma
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = el("defs");
      svg.insertBefore(defs, svg.firstChild);
    }
  
    // radial gradient: jasny hotspot u góry-lewej + ciemniej na brzegach
    const grad = el("radialGradient", {
      id: gid,
      cx: "35%",
      cy: "30%",
      r: "70%"
    });
    const stop0 = el("stop", { offset: "0%",   "stop-color": "#ffffff", "stop-opacity": "0.65" });
    const stop1 = el("stop", { offset: "25%",  "stop-color": colorOn,   "stop-opacity": "1" });
    const stop2 = el("stop", { offset: "100%", "stop-color": "#000000", "stop-opacity": "0.35" });
    grad.appendChild(stop0); grad.appendChild(stop1); grad.appendChild(stop2);
    defs.appendChild(grad);
  
    const gLamp = el("g", {});
  
    // cień pod lampką (subtelny, daje “osadzenie”)
    const shadow = el("circle", {
      cx: cx + r * 0.08,
      cy: cy + r * 0.12,
      r: r * 1.02,
      fill: "#000",
      opacity: "0.20"
    });
  
    // obwódka / ring
    const ring = el("circle", {
      cx, cy, r: r + 2,
      fill: "none",
      stroke: "rgba(255,255,255,0.42)",
      "stroke-width": 2,
      opacity: "0.95"
    });
  
    // OFF: bardzo ciemna “szkło-kulka”
    const offBody = el("circle", {
      cx, cy, r,
      fill: "#0a0a0a",
      opacity: "0.92"
    });
  
    // ON: korpus z gradientem (bardziej “3D”)
    const onBody = el("circle", {
      cx, cy, r,
      fill: `url(#${gid})`,
      opacity: "0"
    });
  
    // glow na zewnątrz
    const glow = el("circle", {
      cx, cy, r: r * 1.08,
      fill: colorOn,
      opacity: "0",
      filter: "url(#neonBlue)"
    });
  
    // specular highlight (mała biała plamka)
    const highlight = el("circle", {
      cx: cx - r * 0.28,
      cy: cy - r * 0.30,
      r: r * 0.22,
      fill: "#fff",
      opacity: "0.18"
    });
  
    gLamp.appendChild(shadow);
    gLamp.appendChild(glow);
    gLamp.appendChild(offBody);
    gLamp.appendChild(onBody);
    gLamp.appendChild(highlight);
    gLamp.appendChild(ring);
  
    parent.appendChild(gLamp);
  
    const setOn = (on) => {
      // OFF: ciemno, ale widać szkło
      offBody.setAttribute("opacity", on ? "0.20" : "0.95");
      // ON: główna kula
      onBody.setAttribute("opacity", on ? "0.98" : "0");
      // glow
      glow.setAttribute("opacity", on ? "0.85" : "0");
      // highlight trochę mocniejszy gdy świeci (efekt szkła)
      highlight.setAttribute("opacity", on ? "0.28" : "0.14");
    };
    const setColor = (newColor) => {
      const c = (newColor ?? "").toString().trim();
      if (!c) return;
      stop1.setAttribute("stop-color", c);
      glow.setAttribute("fill", c);
    };
    return { setOn, setColor, node: gLamp };
  };
  
  const lampsY = barY + barH / 2;
  const lampR  = barH * 0.32;
  const padX   = lampR * 1.6;
  
  const lampAX = barX + padX;        // A po lewej
  const lampBX = barX + barW - padX; // B po prawej
  
  // Lampy biorą kolor z THEME (pochodne)
  computeDerived();
  lampA = makeLamp(basebar, lampAX, lampsY, lampR, THEME.derived.A_lamp);
  lampB = makeLamp(basebar, lampBX, lampsY, lampR, THEME.derived.B_lamp);
  
  lampA.setOn(false);
  lampB.setOn(false);
  
  let indicatorState = "OFF";

  // Po zbudowaniu kluczowych elementów (basebar/lamps) nakładamy theme na całość
  // (ustawi rimGrad/neon/tło/obrysy/lampy)
  applyTheme();
 
  // ============================================================
  // LOGO – 2 typy:
  // - GLYPH_30x10: 10 wierszy po 30 znaków
  // - PIX_150x70: bitmapa 150x70 (pod BIG 30x10 * 5x7)
  // ============================================================
  
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
    const layers = logoJson.layers;
  
    // logo zajmuje CAŁY BIG 30x10
    clearArea(big, 1, 1, 30, 10);
  
    for (const layer of layers) {
      const color = litFromName(layer.color);
      for (let ry = 0; ry < 10; ry++) {
        const rowStr = layer.rows[ry] ?? " ".repeat(30);
        const row1 = 1 + ry; // 1..10
        for (let cx = 0; cx < 30; cx++) {
          const ch = rowStr[cx] ?? " ";
          if (ch === " ") continue;
          putCharAt(GLYPHS, big, 1 + cx, row1, ch, color);
        }
      }
    }
  };
  
  // PIX 150x70: mapowanie 1:1 na doty BIG (30*5, 10*7)
  const base64ToBytes = (b64) => {
    try {
      const bin = atob((b64 || "").replace(/\s+/g, "")); // usuń białe znaki
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return new Uint8Array(0);
    }
  };
  
  const getBitRowMajor_MSB = (bytes, x, y, w) => {
    const bytesPerRow = Math.ceil(w / 8);
    const byteIndex = y * bytesPerRow + (x >> 3);
    if (byteIndex < 0 || byteIndex >= bytes.length) return 0;
    const bit = 7 - (x & 7);              // MSB first
    return (bytes[byteIndex] >> bit) & 1;
  };
  
  const drawLogoPix150x70 = (bitsBase64, colorOn = LIT.main) => {
    const W = 150, H = 70;
    const bytes = base64ToBytes(bitsBase64);
  
    const bytesPerRow = Math.ceil(W / 8);      // 19
    const expected = bytesPerRow * H;          // 1330
  
    if (bytes.length !== expected) {
      console.warn(
        `[logo pix] bytes len=${bytes.length}, expected=${expected} (W=${W},H=${H},bytesPerRow=${bytesPerRow}). ` +
        `Jeśli masz generator bez stride, to będzie ${Math.ceil(W * H / 8)}.`
      );
    }
  
    clearArea(big, 1, 1, 30, 10);
  
    for (let ty = 0; ty < 10; ty++) {
      for (let tx = 0; tx < 30; tx++) {
        const tile = tileAt(big, 1 + tx, 1 + ty);
        if (!tile) continue;
  
        for (let py = 0; py < 7; py++) {
          for (let px = 0; px < 5; px++) {
            const x = tx * 5 + px;   // 0..149
            const y = ty * 7 + py;   // 0..69
  
            const on = getBitRowMajor_MSB(bytes, x, y, W) === 1;
            tile.dots[py][px].setAttribute("fill", on ? colorOn : COLORS.dotOff);
          }
        }
      }
    }
  };
    

  // ============================================================
  // Duży wyświetlacz nie ma już osobnych trybów LOGO/ROUNDS/FINAL/WIN.
  // Każda komenda sama rysuje potrzebny stan na BIG.
  // ============================================================

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
    // THEME (najpierw, żeby reszta elementów (lampy/gradienty) była już w dobrych kolorach)
    // Uwaga: snapshot może być stary i nie mieć theme
    if (S.theme && (S.theme.A || S.theme.B || S.theme.BG)) {
      try {
        setThemeBase({ A: S.theme.A, B: S.theme.B, BG: S.theme.BG });
      } catch (e) {
        console.warn("Nie można przywrócić THEME ze snapshotu:", e);
      }
    }
    
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
  
    // INDICATOR
    if (S.indicator) {
      try { api.indicator.set(S.indicator); } catch (e) {
        console.warn("Nie można przywrócić INDICATOR ze snapshotu:", e);
      }
    }
  };

  let appMode = "NONE";

  const hardClearAll = () => {
    clearBig(big);
    // small + indicator też czyścimy, bo appMode jest globalny
    api.small.clearAll();
    api.indicator.set("OFF");
  
    // stany logiczne
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
        hardClearAll();     // <- amnezja przy zmianie APP
      },
    
      hardClearAll,
    },
      
    big: {
      // BRAK globalnej prędkości, cały blok speed wyrzucamy
    
      areaAll:  () => ({ c1:1, r1:1, c2:30, r2:10 }),
      areaWin:  () => ({ c1:1, r1:2, c2:30, r2:8 }),
      areaLogo: () => ({ c1:1, r1:3, c2:30, r2:7 }),
    
      animIn: async ({ type = "edge", dir = "left", axis = "down", ms = 20, area = null, opts = null } = {}) => {
        const A = area ?? api.big.areaAll();
        const speed = normMs(ms, 20);
        if (type === "edge") {
          return anim.inEdge(big, A, dir, speed, opts || {});
        }
        if (type === "matrix") {
          return anim.inMatrix(big, A, axis, speed, opts || {});
        }
      },
      
      animOut: async ({ type = "edge", dir = "left", axis = "down", ms = 20, area = null, opts = null } = {}) => {
        const A = area ?? api.big.areaAll();
        const speed = normMs(ms, 20);
        if (type === "edge") {
          return anim.outEdge(big, A, dir, speed, opts || {});
        }
        if (type === "matrix") {
          return anim.outMatrix(big, A, axis, speed, opts || {});
        }
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
      set: (state) => {
        const s = (state ?? "").toString().toUpperCase();
        if (s === "OFF") {
          lampA.setOn(false);
          lampB.setOn(false);
          indicatorState = "OFF";
          return;
        }
        if (s === "ON_A") {
          lampA.setOn(true);
          lampB.setOn(false);
          indicatorState = "ON_A";
          return;
        }
        if (s === "ON_B") {
          lampA.setOn(false);
          lampB.setOn(true);
          indicatorState = "ON_B";
          return;
        }
        throw new Error(`INDICATOR: zły stan: ${state}`);
      }
    },
    
    snapshotAll,

    restoreSnapshot,
    
    logo: {
      _gameId: null,
      _key: null,
    
      // wywołaj raz po tym, jak znasz gameId (main to ustawi 1 linijką)
      bindGame: async (gameId) => {
        const u = new URL(location.href);
        const key = u.searchParams.get("key") || "";
        const gid = (gameId ?? "").toString();
    
        api.logo._gameId = gid;
        api.logo._key = key;
    
        const dbLogo = await loadActiveLogoFromDb(gid, key);
        if (dbLogo && dbLogo.type && dbLogo.payload) {
          ACTIVE_LOGO = dbLogo;
          console.log("[logo] loaded from DB:", dbLogo.name || dbLogo.type);
        } else {
          ACTIVE_LOGO = null;
          console.log("[logo] no active logo in DB -> fallback to default json");
        }
      },
    
      // aktywne logo (z bazy) albo fallback
      _getSource: () => {
        // 1) DB active
        if (ACTIVE_LOGO?.type === "GLYPH_30x10") {
          return { type: "GLYPH_30x10", payload: ACTIVE_LOGO.payload };
        }
        if (ACTIVE_LOGO?.type === "PIX_150x70") {
          return { type: "PIX_150x70", payload: ACTIVE_LOGO.payload };
        }
        // 2) fallback do pliku (traktujemy jak GLYPH_30x10)
        return { type: "GLYPH_30x10", payload: DEFAULT_LOGO };
      },
    
      draw: () => {
        const src = api.logo._getSource();
    
        if (src.type === "GLYPH_30x10") {
          // payload dla DB: {layers:[{rows:[...10]}]}
          // payload dla fallback: cały json
          drawLogoGrid30x10(src.payload);
          return;
        }
    
        if (src.type === "PIX_150x70") {
          const bits =
          src.payload?.bits_b64 ||
          src.payload?.bits_base64 ||
          src.payload?.bitsBase64 ||
          "";
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
        const t   = clipText(raw, 17);   // max 17, do lewej
        
        roundsState.text[i] = t;
        
        await updateField(GLYPHS, big, ROUNDS.answers[i], t, {
          out: animOut,
          in: animIn,
          color: LIT.main
        });
        // numer tylko gdy tekst ma treść
        setRoundNumberVisible(idx1to6, hasVisibleText(roundsState.text[i]));
        relocateSumaIfNeeded();
      },

      setPts: async (idx1to6, pts, { animOut=null, animIn=null } = {}) => {

        const i = (idx1to6 | 0) - 1;
        if (i < 0 || i > 5) throw new Error("idx1to6 musi być 1..6");

        const raw = (pts ?? "").toString();
        const p   = alignRight(raw, 2);   // 2 pola, do prawej
        
        roundsState.pts[i] = raw;
        
        await updateField(GLYPHS, big, ROUNDS.points[i], p, {
          out: animOut,
          in: animIn,
          color: LIT.main
        });
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
        
        const F   = roundsSumaFields();
        const txt = alignRight(roundsState.suma, 3);
        
        await updateField(GLYPHS, big, F.val, txt, {
          out: animOut,
          in: animIn,
          color: LIT.main
        });
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
        const smallKeys = side === "A"
          ? ["1A", "2A", "3A"]
          : side === "B"
            ? ["1B", "2B", "3B"]
            : [];
      
        const isBig = (cell.kind === "BIG");
      
        // OFF: ignorowanie wg reguł
        if (!on) {
          if (side) {
            if (isBig) {
              // 4A/4B OFF ignoruj, jeśli świeci jakiekolwiek małe 1-3 tej strony
              const anySmallOn = smallKeys.some(k => xState[k]);
              if (anySmallOn) return;
            } else {
              // 1-3 OFF ignoruj, jeśli świeci duże 4 tej strony
              if (bigKey && xState[bigKey]) return;
            }
          }
        
          // normalny OFF (gdy nie ignorujemy)
          clearArea(big, cell.c1, cell.r1, cell.c2, cell.r2);
          xState[key] = false;
          return;
        }
        
        // ON: mutual exclusion tylko jeśli faktycznie trzeba
        if (side) {
          if (isBig) {
            // Włączamy 4A/4B -> gaś wszystkie małe tej strony
            for (const k of smallKeys) {
              if (xState[k]) clearKey(k);
              xState[k] = false;
            }
            xState[bigKey] = true;
      
            // narysuj big X
            drawRoundsBigX(GLYPHS, big, side, LIT.main);
            return;
          } else {
            // Włączamy małe X -> gaś big tylko jeśli ono było ON
            if (bigKey && xState[bigKey]) {
              clearKey(bigKey);       // UWAGA: to kasuje też overlap, ale zaraz narysujemy nasze małe X
              xState[bigKey] = false;
            }
      
            // włączamy dane małe X (pozostałe małe mogą zostać ON równolegle)
            xState[key] = true;
      
            // narysuj małe 3x3
            drawBigX_3x3(GLYPHS, big, cell.c1, cell.r1, LIT.main);
            return;
          }
        }
      
        // fallback (gdyby kiedyś doszły inne)
        xState[key] = true;
        if (isBig) drawRoundsBigX(GLYPHS, big, side, LIT.main);
        else drawBigX_3x3(GLYPHS, big, cell.c1, cell.r1, LIT.main);
      },

      
      // ====== NOWE: batch (jedna animacja na całość) ======
      setAll: async ({ rows = [], suma = undefined, animOut = null, animIn = null } = {}) => {
      
        const A_ALL = api.big.areaAll();
      
        // ---- SPECIAL CASE: tylko ANIMOUT, brak nowych danych ----
        const hasAnyRowData = rows.some(r =>
          isNonEmpty(r?.text) || isNonEmpty(r?.pts)
        );
        const hasSumaArg = (suma !== undefined);
      
        if (animOut && !animIn && !hasAnyRowData && !hasSumaArg) {
          // 1) animacja wyjścia całej planszy
          await api.big.animOut({ ...animOut, area: A_ALL });
      
          // 2) czyścimy Big + stan rund
          clearBig(big);
          roundsState.text = Array(6).fill("");
          roundsState.pts  = Array(6).fill("");
          roundsState.suma = "";
          roundsState.sumaRow = 9;
      
          return; // niczego nie rysujemy z powrotem
        }
      
        // ---- NORMALNY TRYB: wymiana zawartości ----
      
        // najpierw animacja wyjścia całości (opcjonalna)
        if (animOut) await api.big.animOut({ ...animOut, area: A_ALL });
      
        // docelowy obraz (bez animacji per-pole)
        for (let i = 0; i < 6; i++) {
          const r = rows[i] ?? {};
          const rawT = (r.text ?? "").toString();
          const rawP = (r.pts  ?? "").toString();
      
          const t = clipText(rawT, 17);   // tekst do lewej, max 17
          const p = alignRight(rawP, 2);  // punkty do prawej na 2 znakach
      
          roundsState.text[i] = t;
          roundsState.pts[i]  = rawP;
      
          writeField(GLYPHS, big, ROUNDS.answers[i], t, LIT.main);
          writeField(GLYPHS, big, ROUNDS.points[i],  p, LIT.main);
          setRoundNumberVisible(i + 1, isNonEmpty(t) || isNonEmpty(rawP));
        }
      
        // ustaw sumę w stanie
        if (suma !== undefined) {
          roundsState.suma = (suma ?? "").toString();
        } else {
          roundsState.suma = (roundsState.suma ?? "").toString();
        }
      
        // przelicz rząd dla SUMA i narysuj ją
        relocateSumaIfNeeded();
        const F = roundsSumaFields();
        writeField(GLYPHS, big, F.label, SUMA_LABEL, LIT.main);
      
        const txt = isNonEmpty(roundsState.suma)
          ? alignRight(roundsState.suma, 3)
          : "   ";
      
        writeField(GLYPHS, big, F.val, txt, LIT.main);
      
        // animacja wejścia całości (opcjonalna)
        if (animIn) await api.big.animIn({ ...animIn, area: A_ALL });
      },
    },

    final: {
      setLeft: async (idx1to5, text, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        const raw = (text ?? "").toString();
        const t   = clipText(raw, 11);   // max 11, do lewej
        
        await updateField(GLYPHS, big, FINAL.leftTxt[i], t, {
          out: animOut,
          in: animIn,
          color: LIT.main
        });
      },
    
      setA: async (idx1to5, pts, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        const raw = (pts ?? "").toString();
        const p   = alignRight(raw, 2);
        
        await updateField(GLYPHS, big, FINAL.ptsA[i], p, {
          out: animOut,
          in: animIn,
          color: LIT.main
        });
      },
    
      setB: async (idx1to5, pts, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        const raw = (pts ?? "").toString();
        const p   = alignRight(raw, 2);
        
        await updateField(GLYPHS, big, FINAL.ptsB[i], p, {
          out: animOut,
          in: animIn,
          color: LIT.main
        });
      },
    
      setRight: async (idx1to5, text, { animOut=null, animIn=null } = {}) => {
        const i = (idx1to5|0) - 1;
        if (i < 0 || i > 4) throw new Error("idx1to5 musi być 1..5");
        const raw = (text ?? "").toString();
        const t   = clipText(raw, 11);
        
        await updateField(GLYPHS, big, FINAL.rightTxt[i], t, {
          out: animOut,
          in: animIn,
          color: LIT.main
        });
      },
    
      setRow: async (idx1to5, { left=undefined, a=undefined, b=undefined, right=undefined, animOut=null, animIn=null } = {}) => {
        if (left  !== undefined) await api.final.setLeft(idx1to5, left,  { animOut, animIn });
        if (a     !== undefined) await api.final.setA(idx1to5, a,        { animOut, animIn });
        if (b     !== undefined) await api.final.setB(idx1to5, b,        { animOut, animIn });
        if (right !== undefined) await api.final.setRight(idx1to5, right,{ animOut, animIn });
      },
    
      // tryb sumy: "A" albo "B" – decyduje, która geometria jest używana
      setSumMode: (side) => {
        const s = (side ?? "").toString().toUpperCase();
        if (s !== "A" && s !== "B") throw new Error(`FSUMMODE: nieznana strona: ${side}`);
        finalState.sumMode = s;
        drawFinalSum();
      },


      // Ustawia sumę aktualnie wybranego trybu (A/B),
      // bez ruszania reszty FINAL – tylko label + wartość.
      setSuma: async (val, { animOut = null, animIn = null } = {}) => {
        const v = (val ?? "").toString();

        // aktualizujemy stan
        if (finalState.sumMode === "A") {
          finalState.sumA = v;
        } else {
          finalState.sumB = v;
        }

        const isA = (finalState.sumMode === "A");
        const labelField = isA ? FINAL.sumaALabel : FINAL.sumaBLabel;
        const valField   = isA ? FINAL.sumaAVal   : FINAL.sumaBVal;

        const txt = alignRight(v, 3);

        // Najpierw czyścimy CAŁĄ linię 9, żeby nie zostały resztki drugiej SUMY
        clearFinalSumRow();

        // label rysujemy "na sztywno"
        writeField(GLYPHS, big, labelField, SUMA_LABEL, LIT.main);

        // wartość przez updateField (z ANIMOUT/ANIMIN)
        await updateField(GLYPHS, big, valField, txt, {
          out: animOut,
          in: animIn,
          color: LIT.main,
        });
      },
    
      // aliasy jeśli będziesz chciał sterować konkretną sumą z JS
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

      // Ustawia konkretną sumę (A/B) i przełącza widok na nią
      setSumaFor: async (side, val, anims = {}) => {
        const s = (side ?? "").toString().toUpperCase();
        if (s !== "A" && s !== "B") throw new Error(`setSumaFor: nieznana strona: ${side}`);
        finalState.sumMode = s;
        return api.final.setSuma(val, anims);
      },
      
      setAll: async ({ rows = [], suma = undefined, sumaSide = null, animOut = null, animIn = null } = {}) => {
      
        const A_ALL = api.big.areaAll();
      
        // ---- SPECIAL CASE: tylko ANIMOUT, bez nowych danych ----
        const hasAnyRowData = rows.some(r =>
          isNonEmpty(r?.left) ||
          isNonEmpty(r?.a)    ||
          isNonEmpty(r?.b)    ||
          isNonEmpty(r?.right)
        );
        const hasSumaArg = (suma !== undefined);
      
        if (animOut && !animIn && !hasAnyRowData && !hasSumaArg) {
          // 1) animacja wyjścia całego FINAL
          await api.big.animOut({ ...animOut, area: A_ALL });
      
          // 2) czyścimy ekran + stan finału
          clearBig(big);
          finalState.sumA = "";
          finalState.sumB = "";
          // sumMode możesz zostawić "B" albo nie ruszać – to już kwestia preferencji
      
          return;
        }
      
        // ---- NORMALNY TRYB: pełna wymiana zawartości ----
        if (animOut) await api.big.animOut({ ...animOut, area: A_ALL });

        // lewa i prawa część
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

        // SUMA – tylko jeśli podana i strona poprawna
        if (suma !== undefined && (sumaSide === "A" || sumaSide === "B")) {
          if (sumaSide === "A") {
            finalState.sumA = (suma ?? "").toString();
            finalState.sumMode = "A";
          } else {
            finalState.sumB = (suma ?? "").toString();
            finalState.sumMode = "B";
          }
        }

        // odrysuj bieżącą sumę (albo nic, jeśli puste)
        drawFinalSum();

        if (animIn) await api.big.animIn({ ...animIn, area: A_ALL });
      },
      
      setHalf: async (side, { rows = [], animOut = null, animIn = null } = {}) => {
    
        const s = (side ?? "").toString().toUpperCase();
        let area;
        if (s === "A") area = FINAL_AREA_LEFT;
        else if (s === "B") area = FINAL_AREA_RIGHT;
        else throw new Error(`final.setHalf: nieznana strona: ${side}`);
    
        // 1) animacja WYJŚCIA połówki (jeśli jest)
        if (animOut) {
          await api.big.animOut({ ...animOut, area });
        }
    
        // 2) wpisujemy nowe dane w odpowiednie pola
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
    
        // 3) animacja WEJŚCIA połówki (jeśli jest)
        if (animIn) {
          await api.big.animIn({ ...animIn, area });
        }
      },
    },
    debug: {
      /**
       * Podgląd fontu 5x7 na BIG.
       * opts:
       *  - kind: "ALL" | "GROUP" | "TEXT"
       *  - group: nazwa grupy z font_5x7.json (letters, digits, punctuation, math, special, albo nowa)
       *  - text: ciąg znaków do wyświetlenia
       */
      showFont: (opts = {}) => {
        const kind  = (opts.kind  || "ALL").toUpperCase();
        const group = (opts.group || "");
        const text  = (opts.text  || "");

        // wszystkie grupy z font_5x7.json poza "meta"
        const groups = Object.keys(FONT5)
          .filter(k => k !== "meta")
          .map(name => ({ name: name.toUpperCase(), map: FONT5[name] || {} }));

        const allChars = groups.flatMap(g => Object.keys(g.map));
        let chars = [];

        if (kind === "ALL") {
          // wszystko z JSON-a
          chars = allChars;
        } else if (kind === "GROUP") {
          const wanted = group.toUpperCase();
          const g = groups.find(g => g.name === wanted);
          if (!g) {
            console.warn(
              `DEBUG FONT GROUP: nie ma grupy "${group}". Dostępne: ${groups
                .map(g => g.name.toLowerCase())
                .join(", ")}`
            );
            return;
          }
          chars = Object.keys(g.map);
        } else if (kind === "TEXT") {
          chars = Array.from(text);
        } else {
          // awaryjnie: traktuj to jako TEXT
          chars = Array.from(text || kind);
        }

        // czyścimy BIG
        api.big.clear();

        // rysujemy znaki po kolei, wierszami 30x10
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
  // Text command handler (GAME)
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
  
    const base = {
      type: type === "matrix" ? "matrix" : "edge",
      ms: isFinite(ms) ? ms : (type === "matrix" ? 36 : 12),
    };
  
    if (type === "edge")  base.dir  = dirOrAxis || "left";
    if (type === "matrix") base.axis = dirOrAxis || "down";
  
    if (extra === "pixel") {
      base.pixel = true;
    }
  
    return base;
  };

  const parseAnimPair = (tokens) => {
    const aOutIdx = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
    const aInIdx  = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");

    let animOut = aOutIdx >= 0 ? parseAnim(tokens, aOutIdx + 1) : null;
    let animIn  = aInIdx  >= 0 ? parseAnim(tokens, aInIdx  + 1) : null;

    return { animOut, animIn };
  };

  const handleCommand = async (line) => {
    const raw = (line ?? "").toString().trim();
    if (!raw) return;

    const tokens = tokenize(raw);
    const head = (tokens[0] ?? "").toUpperCase();

    // ============================================================
    // COLOR A <hex|name>
    // COLOR B <hex|name>
    // COLOR BACKGROUND <hex|name>
    // COLOR RESET
    // (nazwa może być w cudzysłowie: "light blue")
    // ============================================================
    if (head === "COLOR") {
      const target = (tokens[1] ?? "").toUpperCase();
      if (target === "RESET") {
        resetTheme();
        console.log("[COLOR] RESET");
        return;
      }
      const val = unquote(tokens.slice(2).join(" "))
      try {
        setBaseColor(target, val);
        console.log(`[COLOR] ${target} = ${val}`);
      } catch (e) {
        console.warn(String(e?.message || e));
      }
      return;
    }


    // 🔧 DEBUG
    // DEBUG FONT
    // DEBUG FONT ALL
    // DEBUG FONT GROUP letters
    // DEBUG FONT TEXT "ĄĘŻŹ#$%^&*()"
    // DEBUG FONT "ĄĘŻŹ#$%^&*()"
    if (head === "DEBUG") {
      const op = (tokens[1] ?? "").toUpperCase();

      if (op === "FONT") {
        const sub = (tokens[2] ?? "").toUpperCase();

        // DEBUG FONT         → wszystkie znaki z JSON-a
        // DEBUG FONT ALL
        if (!sub || sub === "ALL") {
          return api.debug.showFont({ kind: "ALL" });
        }

        // DEBUG FONT GROUP nazwaGrupy
        if (sub === "GROUP") {
          const gName = tokens[3] ?? "";
          return api.debug.showFont({ kind: "GROUP", group: gName });
        }

        // DEBUG FONT TEXT "ciąg"
        if (sub === "TEXT") {
          const txt = unquote(tokens.slice(3).join(" "));
          return api.debug.showFont({ kind: "TEXT", text: txt });
        }

        // fallback: DEBUG FONT cokolwiek → potraktuj resztę jako TEXT
        const txt = unquote(tokens.slice(2).join(" "));
        return api.debug.showFont({ kind: "TEXT", text: txt });
      }
    }

    // small
    if (head === "TOP")   return api.small.topDigits(tokens[1] ?? "");
    if (head === "LEFT")  return api.small.leftDigits(tokens[1] ?? "");
    if (head === "RIGHT") return api.small.rightDigits(tokens[1] ?? "");
    if (head === "LONG1") return api.small.long1(unquote(tokens.slice(1).join(" ")));
    if (head === "LONG2") return api.small.long2(unquote(tokens.slice(1).join(" ")));

    // INDICATOR <OFF|ON_A|ON_B>
    if (head === "INDICATOR") {
      const val = (tokens[1] ?? "OFF").toUpperCase();
      if (val === "OFF" || val === "ON_A" || val === "ON_B") {
        return api.indicator.set(val);
      }
      console.warn("INDICATOR: nieznany stan:", val);
      return;
    }
    
    // BIG
    // BLANK
    if (head === "BLANK") {
      bigMode = "OTHER";
      api.big.clear();   // kasuje 30x10, panele boczne / dolne zostają
      return;
    }
    
    // LOGO
    if (head === "LOGO") {
      bigMode = "OTHER";
      const op = (tokens[1] ?? "").toUpperCase();

      if (op === "LOAD") {
        console.warn("LOGO LOAD jest wyłączone. Logo ładuje się z bazy (aktywny rekord) albo fallback.");
        return;
      }
      
      if (op === "DRAW") {
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
      bigMode = "OTHER";
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
        if (k >= 0) {
          rows[i-1].text = unquote(tokens[k + 1] ?? "");
          rows[i-1].pts  = (tokens[k + 2] ?? "");
        }
      }

      return api.rounds.setAll({ rows, suma, animOut, animIn });
    }

    // ROUNDS (krótkie)
    if (head === "RTXT") {
      bigMode = "ROUNDS";
      const idx  = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
    
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      return api.rounds.setText(idx, text, { animOut, animIn });
    }
    if (head === "RPTS") {
      bigMode = "ROUNDS";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
    
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      return api.rounds.setPts(idx, pts, { animOut, animIn });
    }

    // ROUNDS (legacy)
    if (head === "R") {
      bigMode = "ROUNDS";
      const idx  = parseInt(tokens[1] ?? "0", 10);
      const tIdx = tokens.findIndex(t => t.toUpperCase() === "TXT");
      const pIdx = tokens.findIndex(t => t.toUpperCase() === "PTS");
    
      const text = tIdx >= 0 ? unquote(tokens[tIdx + 1] ?? "") : undefined;
      const pts  = pIdx >= 0 ? (tokens[pIdx + 1] ?? "")       : undefined;
    
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      return api.rounds.setRow(idx, { text, pts, animOut, animIn });
    }

    if (head === "RSUMA") {
      bigMode = "ROUNDS";
      const val = tokens[1] ?? "";
    
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      return api.rounds.setSuma(val, { animOut, animIn });
    }

    if (head === "RX") {
      bigMode = "ROUNDS";
      const name = (tokens[1] ?? "").toUpperCase();
      const on = ((tokens[2] ?? "").toUpperCase() === "ON");
      return api.rounds.setX(name, on);
    }

    // ====== NOWE: FINAL batch ======
    // Format:
    // FBATCH SUMA A 999 F1 "L" 12 34 "R" ...  /  FBATCH SUMA B 999 ...
    if (head === "FBATCH") {
      bigMode = "FINAL";
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      // SUMA A 999 / SUMA B 999
      let suma = undefined;
      let sumaSide = null;
      const sIdx = tokens.findIndex(t => t.toUpperCase() === "SUMA");
      if (sIdx >= 0) {
        const sideTok = (tokens[sIdx + 1] ?? "").toUpperCase();
        if (sideTok === "A" || sideTok === "B") {
          sumaSide = sideTok;
          suma = tokens[sIdx + 2] ?? "";
        } else {
          // brak A/B → FBATCH NIE rusza sumy
          suma = undefined;
          sumaSide = null;
        }
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

    // ====== NOWE: FINAL half ======
    // FHALF A F1 "ODP1" 12 F2 "ODP2" 34 ... ANIMOUT ... ANIMIN ...
    // FHALF B F1 12 "ODP1" F2 34 "ODP2" ... ANIMOUT ... ANIMIN ...
    if (head === "FHALF") {
      bigMode = "FINAL";
      const side = (tokens[1] ?? "").toUpperCase(); // "A" albo "B"

      const ao = tokens.findIndex((t, idx) => idx > 1 && t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex((t, idx) => idx > 1 && t.toUpperCase() === "ANIMIN");

      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;

      const rows = Array.from({ length: 5 }, () => ({}));

      for (let i = 1; i <= 5; i++) {
        const k = tokens.findIndex(t => t.toUpperCase() === `F${i}`);
        if (k < 0) continue;

        if (side === "A") {
          // FHALF A F1 "LEWY" 12
          const txt = unquote(tokens[k + 1] ?? "");
          const a   = tokens[k + 2] ?? "";
          rows[i-1] = { left: txt, a };
        } else if (side === "B") {
          // FHALF B F1 12 "PRAWY"
          const b   = tokens[k + 1] ?? "";
          const txt = unquote(tokens[k + 2] ?? "");
          rows[i-1] = { b, right: txt };
        } else {
          throw new Error(`FHALF: nieznana strona: ${side}`);
        }
      }

      return api.final.setHalf(side, { rows, animOut, animIn });
    }
    
    // FINAL (krótkie)
    if (head === "FL") {
      bigMode = "FINAL";
      const idx  = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
    
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      return api.final.setLeft(idx, text, { animOut, animIn });
    }
    
    if (head === "FA") {
      bigMode = "FINAL";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
    
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      return api.final.setA(idx, pts, { animOut, animIn });
    }
    
    if (head === "FB") {
      bigMode = "FINAL";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const pts = tokens[2] ?? "";
    
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      return api.final.setB(idx, pts, { animOut, animIn });
    }
    
    if (head === "FR") {
      bigMode = "FINAL";
      const idx  = parseInt(tokens[1] ?? "0", 10);
      const text = unquote(tokens[2] ?? "");
    
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      return api.final.setRight(idx, text, { animOut, animIn });
    }

    // FINAL (legacy)
    if (head === "F") {
      bigMode = "FINAL";
      const idx = parseInt(tokens[1] ?? "0", 10);
      const L   = tokens.findIndex(t => t.toUpperCase() === "L");
      const A   = tokens.findIndex(t => t.toUpperCase() === "A");
      const B   = tokens.findIndex(t => t.toUpperCase() === "B");
      const R   = tokens.findIndex(t => t.toUpperCase() === "R");
    
      const left  = L >= 0 ? unquote(tokens[L + 1] ?? "") : undefined;
      const a     = A >= 0 ? (tokens[A + 1] ?? "")        : undefined;
      const b     = B >= 0 ? (tokens[B + 1] ?? "")        : undefined;
      const right = R >= 0 ? unquote(tokens[R + 1] ?? "") : undefined;
    
      const ao = tokens.findIndex(t => t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex(t => t.toUpperCase() === "ANIMIN");
    
      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;
    
      return api.final.setRow(idx, { left, a, b, right, animOut, animIn });
    }

    if (head === "FSUMA") {
      bigMode = "FINAL";
      // FSUMA 120
      // FSUMA A 120
      // FSUMA B 085
      let side = (tokens[1] ?? "").toUpperCase();
      let valIdx = 1;

      if (side === "A" || side === "B") {
        valIdx = 2;
      } else {
        side = null; // użyj aktualnego trybu sumy (finalState.sumMode)
      }

      const val = tokens[valIdx] ?? "";

      const ao = tokens.findIndex((t, idx) => idx > valIdx && t.toUpperCase() === "ANIMOUT");
      const ai = tokens.findIndex((t, idx) => idx > valIdx && t.toUpperCase() === "ANIMIN");

      const animOut = ao >= 0 ? parseAnim(tokens, ao + 1) : null;
      const animIn  = ai >= 0 ? parseAnim(tokens, ai + 1) : null;

      if (side === "A" || side === "B") {
        // ustawiamy sumę dla konkretnej strony i przełączamy widok
        return api.final.setSumaFor(side, val, { animOut, animIn });
      }
      // bez A/B – użyj aktualnego finalState.sumMode
      return api.final.setSuma(val, { animOut, animIn });
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

  return { api, handleCommand };
}
