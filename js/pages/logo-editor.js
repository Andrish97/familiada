// js/pages/logo-editor.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

/* =========================================================
   CONSTS
========================================================= */
const TYPE_GLYPH = "GLYPH_30x10";
const TYPE_PIX = "PIX_150x70";

const TILES_X = 30;
const TILES_Y = 10;
const DOT_W = 150; // 30*5
const DOT_H = 70;  // 10*7

const FONT_3x10_URL = "./display/font_3x10.json";
const FONT_5x7_URL  = "./display/font_5x7.json";
const DEFAULT_LOGO_URL = "./display/logo_familiada.json";

/* =========================================================
   DOM
========================================================= */
const who = document.getElementById("who");
const msg = document.getElementById("msg");
const grid = document.getElementById("grid");

const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");
const btnClearActive = document.getElementById("btnClearActive");

// mode pick modal
const createOverlay = document.getElementById("createOverlay");
const pickText = document.getElementById("pickText");
const pickTextPix = document.getElementById("pickTextPix");
const pickDraw = document.getElementById("pickDraw");
const pickImage = document.getElementById("pickImage");
const btnPickCancel = document.getElementById("btnPickCancel");

// editor pane
const editorShell = document.getElementById("editorShell");
const editorTitle = document.getElementById("editorTitle");
const editorSub = document.getElementById("editorSub");
const btnEditorClose = document.getElementById("btnEditorClose");

const logoName = document.getElementById("logoName");

const paneText = document.getElementById("paneText");
const textValue = document.getElementById("textValue");
const textWarn = document.getElementById("textWarn");
const textMeasure = document.getElementById("textMeasure");
const btnCharsToggle = document.getElementById("btnCharsToggle");
const charsList = document.getElementById("charsList");

const paneTextPix = document.getElementById("paneTextPix");
const rtEditor = document.getElementById("rtEditor");

const btnRtBold = document.getElementById("btnRtBold");
const btnRtItalic = document.getElementById("btnRtItalic");
const btnRtUnderline = document.getElementById("btnRtUnderline");
const btnRtAlignLeft = document.getElementById("btnRtAlignLeft");
const btnRtAlignCenter = document.getElementById("btnRtAlignCenter");
const btnRtAlignRight = document.getElementById("btnRtAlignRight");
const btnRtList = document.getElementById("btnRtList");

const selRtFont = document.getElementById("selRtFont");
const btnRtSizeMinus = document.getElementById("btnRtSizeMinus");
const btnRtSizePlus = document.getElementById("btnRtSizePlus");
const inpRtSize = document.getElementById("inpRtSize");

const pixWarn = document.getElementById("pixWarn");

// Kontrast (próg cz/b) pod podglądem
const btnThreshMinus = document.getElementById("btnThreshMinus");
const btnThreshPlus = document.getElementById("btnThreshPlus");
const inpThresh = document.getElementById("inpThresh");


const paneDraw = document.getElementById("paneDraw");
const drawCanvas = document.getElementById("drawCanvas");
const btnBrush = document.getElementById("btnBrush");
const btnEraser = document.getElementById("btnEraser");
const btnClear = document.getElementById("btnClear");

const paneImage = document.getElementById("paneImage");
const imgFile = document.getElementById("imgFile");
const imgCanvas = document.getElementById("imgCanvas");
const chkImgContain = document.getElementById("chkImgContain");
const chkImgDither = document.getElementById("chkImgDither");

const bigPreview = document.getElementById("bigPreview");

const btnCreate = document.getElementById("btnCreate");
const btnCancel = document.getElementById("btnCancel");
const mMsg = document.getElementById("mMsg");

// fullscreen preview
const previewOverlay = document.getElementById("previewOverlay");
const bigPreviewFull = document.getElementById("bigPreviewFull");
const btnPreviewClose = document.getElementById("btnPreviewClose");

/* =========================================================
   STATE
========================================================= */
let currentUser = null;
let editorDirty = false;
let logos = [];
let defaultLogoRows = Array.from({ length: 10 }, () => " ".repeat(30));

let editorMode = null; // 'TEXT' | 'DRAW' | 'IMAGE' | 'TEXT_PIX'
let draftRows30x10 = Array.from({ length: 10 }, () => " ".repeat(30));
let draftBits150 = new Uint8Array(DOT_W * DOT_H); // 0/1

let drawTool = "BRUSH";

let FONT_3x10 = null; // char -> [10 strings length<=3]
let GLYPH_5x7 = null; // char -> [7 ints]

/* =========================================================
   UI helpers
========================================================= */
function setMsg(t) { if (msg) msg.textContent = t || ""; }
function setEditorMsg(t) { if (mMsg) mMsg.textContent = t || ""; }
function show(el, on) { if (!el) return; el.style.display = on ? "" : "none"; }

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markDirty() { editorDirty = true; }
function clearDirty() { editorDirty = false; }

function confirmCloseIfDirty() {
  if (!editorDirty) return true;
  return confirm("Jeśli teraz zamkniesz, zmiany nie zostaną zapisane, a logo nie zostanie dodane.");
}


/* =========================================================
   Fetch fonts
========================================================= */
async function fetchJsonRequired(url, label) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status} (${url})`);
  return await r.json();
}

function buildGlyph5x7Map(fontJson) {
  if (!fontJson || typeof fontJson !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(fontJson)) {
    if (k === "meta") continue;
    if (!v || typeof v !== "object") continue;
    for (const [ch, pat] of Object.entries(v)) {
      if (typeof ch !== "string") continue;
      if (!Array.isArray(pat) || pat.length !== 7) continue;
      if (!(ch in out)) out[ch] = pat;
    }
  }
  return out;
}

async function loadFonts() {
  try {
    FONT_3x10 = await fetchJsonRequired(FONT_3x10_URL, "Font 3x10");
  } catch (e) {
    console.error(e);
    FONT_3x10 = null;
    setEditorMsg("Nie mogę wczytać font_3x10.json — sprawdź ścieżkę w FONT_3x10_URL.");
  }

  try {
    const f57 = await fetchJsonRequired(FONT_5x7_URL, "Font 5x7");
    GLYPH_5x7 = buildGlyph5x7Map(f57);
  } catch (e) {
    console.error(e);
    GLYPH_5x7 = {};
    setEditorMsg("Nie mogę wczytać font_5x7.json — sprawdź ścieżkę w FONT_5x7_URL.");
  }
}

async function loadDefaultLogo() {
  try {
    const j = await fetchJsonRequired(DEFAULT_LOGO_URL, "Default logo");
    const rows = j?.layers?.[0]?.rows;
    if (Array.isArray(rows) && rows.length) {
      defaultLogoRows = rows.map(r => String(r || "").padEnd(30, " ").slice(0, 30)).slice(0, 10);
    }
  } catch (e) {
    console.warn("[logo-editor] default logo load failed", e);
    defaultLogoRows = Array.from({ length: 10 }, () => " ".repeat(30));
  }
}

/* =========================================================
   BITPACK: 1:1 jak w scene.js
   - row-major
   - MSB-first
   - stride per row = ceil(W/8)
========================================================= */
function base64ToBytes(b64) {
  try {
    const bin = atob((b64 || "").replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function packBitsRowMajorMSB(bits01, w, h) {
  const bytesPerRow = Math.ceil(w / 8);
  const out = new Uint8Array(bytesPerRow * h);
  for (let y = 0; y < h; y++) {
    const rowBase = y * bytesPerRow;
    for (let x = 0; x < w; x++) {
      if (!bits01[y * w + x]) continue;
      const byteIndex = rowBase + (x >> 3);
      const bit = 7 - (x & 7);
      out[byteIndex] |= (1 << bit);
    }
  }
  return bytesToBase64(out);
}

function unpackBitsRowMajorMSB(bitsB64, w, h) {
  const bytes = base64ToBytes(bitsB64);
  const bytesPerRow = Math.ceil(w / 8);
  const expected = bytesPerRow * h;

  // nie przerywamy przy złej długości — pokażemy co się da
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const rowBase = y * bytesPerRow;
    for (let x = 0; x < w; x++) {
      const byteIndex = rowBase + (x >> 3);
      if (byteIndex < 0 || byteIndex >= bytes.length) continue;
      const bit = 7 - (x & 7);
      out[y * w + x] = (bytes[byteIndex] >> bit) & 1;
    }
  }

  if (bytes.length !== expected) {
    console.warn(
      `[logo-editor] PIX bytes len=${bytes.length}, expected=${expected} (W=${w},H=${h},bytesPerRow=${bytesPerRow}). ` +
      `Jeśli generator jest bez stride, to będzie ${Math.ceil(w * h / 8)}.`
    );
  }

  return out;
}

/* =========================================================
   TEXT (font_3x10): walidacja, tight width, składanie 30x10
========================================================= */
function isLitChar(ch) {
  return ch !== " " && ch !== "\u00A0"; // spacja i nbsp
}

function measureGlyphTight3x10(rows10) {
  const W = 3;
  let left = W;
  let right = -1;

  for (let x = 0; x < W; x++) {
    let any = false;
    for (let y = 0; y < 10; y++) {
      const ch = (rows10[y] || "")[x] ?? " ";
      if (isLitChar(ch)) { any = true; break; }
    }
    if (any) {
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }

  if (right < left) return { left: 0, w: 0 };
  return { left, w: right - left + 1 };
}

function normalizeInputText(raw) {
  // najbezpieczniej: tylko string, bez trim — spacje też są częścią układu
  return String(raw ?? "");
}

function glyphEdgeCollides(prev, next) {
  // Połączenie liczymy TYLKO gdy na styku byłoby dokładnie "█" + "█"
  // w tym samym wierszu. Inne znaki (np. pół-bloki) nie wymuszają przerwy.

  if (!prev || !next) return false;
  if (prev.w <= 0 || next.w <= 0) return false;

  const px = prev.w - 1;
  const nx = 0;

  for (let y = 0; y < 10; y++) {
    const a = (prev.rows10[y] || "")[px] ?? " ";
    const b = (next.rows10[y] || "")[nx] ?? " ";
    if (a === "█" && b === "█") return true;
  }
  return false;
}

function compileTextToRows30x10(raw) {
  const text = normalizeInputText(raw);

  // docelowe 30x10 (na końcu wypełnimy)
  const rows = Array.from({ length: 10 }, () => Array.from({ length: 30 }, () => " "));

  const invalid = [];
  const chars = Array.from(text);

  // Najpierw budujemy listę "elementów składu" (glify + spacje),
  // żeby policzyć realną szerokość (z dynamicznym gap 0/1) i wycentrować.
  /** @type {Array<{space:true} | {rows10:string[], w:number}>} */
  const glyphs = [];

  for (let idx = 0; idx < chars.length; idx++) {
    const ch0 = chars[idx];

    if (ch0 === "\n" || ch0 === "\r" || ch0 === "\t") {
      invalid.push(ch0);
      continue;
    }

    // spacja: zawsze dozwolona, nawet jeśli nie ma w foncie
    if (ch0 === " ") {
      glyphs.push({ space: true });
      continue;
    }

    const glyph = FONT_3x10?.[ch0] ?? FONT_3x10?.[ch0.toUpperCase()] ?? null;
    if (!glyph) {
      invalid.push(ch0);
      continue;
    }

    // ustandaryzuj do 10 wierszy po 3 znaki (spacje jako tło)
    const gRows = Array.from({ length: 10 }, (_, i) => String(glyph[i] ?? "").padEnd(3, " ").slice(0, 3));

    // tight crop (glif bywa węższy niż 3)
    const { left, w } = measureGlyphTight3x10(gRows);

    // po cropie przechowujemy już "ucięte" rzędy o szerokości w
    const cropped = Array.from({ length: 10 }, (_, i) => gRows[i].slice(left, left + w));

    glyphs.push({ rows10: cropped, w });
  }

  // 1) policz szerokość "usedW" z gap = 0 lub 1 między sąsiadującymi glifami,
  //    zależnie czy na styku powstałoby "██" (czyli lit-lit w tej samej kolumnie).
  let usedW = 0;
  let prevGlyph = null;

  for (const g of glyphs) {
    if (g.space) {
      // spacja = 1 kolumna odstępu (możesz to podbić do 2, jeśli chcesz "luźniej")
      usedW += 1;
      prevGlyph = null; // po spacji nie sprawdzamy sklejeń
      continue;
    }

    if (prevGlyph) {
      // jeśli byłoby sklejenie (lit-lit), daj gap=1, inaczej gap=0
      const gap = glyphEdgeCollides(prevGlyph, g) ? 1 : 0;
      usedW += gap;
    }

    usedW += g.w;
    prevGlyph = g;
  }

  const fit = usedW <= 30;

  // 2) centrowanie: jeśli mieści się w 30, startX = floor((30-usedW)/2),
  //    jeśli nie — start od 0 (i tak będzie obcinane na brzegach).
  const startX = fit ? Math.floor((30 - usedW) / 2) : 0;

  // 3) render do 30x10 z tym samym dynamicznym gap 0/1
  let cursor = startX;
  prevGlyph = null;

  for (const g of glyphs) {
    if (g.space) {
      cursor += 1;
      prevGlyph = null;
      continue;
    }

    if (prevGlyph) {
      const gap = glyphEdgeCollides(prevGlyph, g) ? 1 : 0;
      cursor += gap;
    }

    for (let y = 0; y < 10; y++) {
      const line = g.rows10[y] || "";
      for (let x = 0; x < g.w; x++) {
        const outX = cursor + x;
        if (outX < 0 || outX >= 30) continue;
        const c = line[x] ?? " ";
        if (c === " ") continue;
        rows[y][outX] = c;
      }
    }

    cursor += g.w;
    prevGlyph = g;
  }

  const outRows = rows.map(r => r.join(""));

  return {
    rows: outRows,
    usedW,
    fit,
    invalid: Array.from(new Set(invalid)),
  };
}

function renderAllowedCharsList() {
  if (!charsList) return;

  const keys = Object.keys(FONT_3x10 || {});

  charsList.textContent = "␠" + keys.join("\u2009");
}


function updateTextWarnings(compiled) {
  if (!textWarn || !textMeasure) return;

  const parts = [];
  if (compiled.invalid.length) {
    parts.push(`Niedozwolone znaki: ${compiled.invalid.map(x => (x === " " ? "␠" : x)).join(" ")}`);
  }
  if (!compiled.fit) {
    parts.push(`Napis się nie mieści: szerokość ${compiled.usedW}/30 (z przerwami).`);
  }

  if (parts.length) {
    textWarn.textContent = parts.join("\n");
    show(textWarn, true);
  } else {
    show(textWarn, false);
  }

  const okStr = compiled.fit ? "mieści się" : "nie mieści się";
  textMeasure.textContent = `Szerokość: ${compiled.usedW}/30 (${okStr}).`;
}

/* =========================================================
   BIG-like render (canvas): symulacja dotów 5×7 z przerwami
========================================================= */
const BIG_COLORS = {
  bg: "#2e2e32",
  cell: "#000000",
  dotOff: "#2e2e32",
  dotOn: "#d7ff3d",
};

function calcBigLayout(canvas) {
  const cw = canvas.width;
  const ch = canvas.height;

  // dobieramy największe d, które się mieści
  for (let d = 16; d >= 2; d--) {
    const gap = Math.max(1, Math.round(d / 4));
    const tileGap = 2 * d;
    const tileW = 5 * d + 6 * gap;
    const tileH = 7 * d + 8 * gap;
    const panelW = TILES_X * tileW + (TILES_X - 1) * tileGap;
    const panelH = TILES_Y * tileH + (TILES_Y - 1) * tileGap;

    if (panelW <= cw - 20 && panelH <= ch - 20) {
      return { d, gap, tileGap, tileW, tileH, panelW, panelH };
    }
  }

  // fallback
  const d = 2;
  const gap = 1;
  const tileGap = 4;
  const tileW = 5 * d + 6 * gap;
  const tileH = 7 * d + 8 * gap;
  const panelW = TILES_X * tileW + (TILES_X - 1) * tileGap;
  const panelH = TILES_Y * tileH + (TILES_Y - 1) * tileGap;
  return { d, gap, tileGap, tileW, tileH, panelW, panelH };
}

function clearBigCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = BIG_COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawDot(ctx, cx, cy, r, on) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = on ? BIG_COLORS.dotOn : BIG_COLORS.dotOff;
  ctx.fill();
}

function resolve5x7(ch) {
  // jeśli nie ma glifu, spróbuj uppercase
  const g = GLYPH_5x7?.[ch] ?? GLYPH_5x7?.[String(ch || "").toUpperCase()] ?? null;
  if (!g) return [0, 0, 0, 0, 0, 0, 0];
  return g;
}

function renderRows30x10ToBig(rows10, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const L = calcBigLayout(canvas);
  clearBigCanvas(canvas);

  const x0 = Math.floor((canvas.width - L.panelW) / 2);
  const y0 = Math.floor((canvas.height - L.panelH) / 2);
  const r = L.d / 2;
  const step = L.d + L.gap;

  for (let ty = 0; ty < TILES_Y; ty++) {
    const rowStr = String(rows10?.[ty] ?? "").padEnd(30, " ").slice(0, 30);
    for (let tx = 0; tx < TILES_X; tx++) {
      const ch = rowStr[tx] ?? " ";
      const glyph = resolve5x7(ch);

      const tileX = x0 + tx * (L.tileW + L.tileGap);
      const tileY = y0 + ty * (L.tileH + L.tileGap);

      // tło komórki (jak na scenie)
      ctx.fillStyle = BIG_COLORS.cell;
      ctx.fillRect(tileX, tileY, L.tileW, L.tileH);

      for (let py = 0; py < 7; py++) {
        const bits = glyph[py] | 0;
        for (let px = 0; px < 5; px++) {
          const mask = 1 << (4 - px);
          const on = (bits & mask) !== 0;
          const cx = tileX + L.gap + r + px * step;
          const cy = tileY + L.gap + r + py * step;
          drawDot(ctx, cx, cy, r, on);
        }
      }
    }
  }
}

function renderBits150x70ToBig(bits150, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const L = calcBigLayout(canvas);
  clearBigCanvas(canvas);

  const x0 = Math.floor((canvas.width - L.panelW) / 2);
  const y0 = Math.floor((canvas.height - L.panelH) / 2);
  const r = L.d / 2;
  const step = L.d + L.gap;

  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      const tileX = x0 + tx * (L.tileW + L.tileGap);
      const tileY = y0 + ty * (L.tileH + L.tileGap);

      ctx.fillStyle = BIG_COLORS.cell;
      ctx.fillRect(tileX, tileY, L.tileW, L.tileH);

      for (let py = 0; py < 7; py++) {
        for (let px = 0; px < 5; px++) {
          const x = tx * 5 + px;
          const y = ty * 7 + py;
          const on = !!bits150[y * DOT_W + x];
          const cx = tileX + L.gap + r + px * step;
          const cy = tileY + L.gap + r + py * step;
          drawDot(ctx, cx, cy, r, on);
        }
      }
    }
  }
}

function updateBigPreview() {
  if (editorMode === "TEXT") {
    renderRows30x10ToBig(draftRows30x10, bigPreview);
    renderRows30x10ToBig(draftRows30x10, bigPreviewFull);
  } else {
    renderBits150x70ToBig(draftBits150, bigPreview);
    renderBits150x70ToBig(draftBits150, bigPreviewFull);
  }
}

function canvasToBits(canvas, threshold = 128) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const r = img[i * 4 + 0];
    const g = img[i * 4 + 1];
    const b = img[i * 4 + 2];
    const a = img[i * 4 + 3];
    if (a < 8) { out[i] = 0; continue; }

    // luminancja
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    out[i] = lum >= threshold ? 1 : 0;
  }
  return out;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function makeRichTextSvgDataUrl(html, opts) {
  // opts: { w, h, fontFamily, fontSizePx }
  const w = opts.w, h = opts.h;
  const ff = opts.fontFamily || "system-ui, sans-serif";
  const fs = opts.fontSizePx || 56;

  // UWAGA: foreignObject wymaga poprawnego XHTML.
  const xhtml =
    `<div xmlns="http://www.w3.org/1999/xhtml" ` +
    `style="` +
      `width:${w}px;height:${h}px;` +
      `background:#000;color:#fff;` +
      `font-family:${ff};font-size:${fs}px;` +
      `line-height:1.05;` +
      `padding:10px;` +
      `box-sizing:border-box;` +
      `white-space:pre-wrap;` +
      `overflow:hidden;` +
    `">` +
      html +
    `</div>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
        xhtml +
      `</foreignObject>` +
    `</svg>`;

  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

async function renderRichTextToCanvas(html, opts) {
  const c = document.createElement("canvas");
  c.width = opts.w;
  c.height = opts.h;

  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);

  const url = makeRichTextSvgDataUrl(html, opts);

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("Nie udało się wyrenderować tekstu (SVG/foreignObject)."));
    img.src = url;
  });

  ctx.drawImage(img, 0, 0);
  return c;
}

async function compileRichTextToLogoBits() {
  // Rozmiar “screena” zostaje wewnętrzny, UI o tym nie wie.
  // (tu używamy Twojej istniejącej ścieżki: render -> compress -> 150)
  const W = BIG_W;
  const H = BIG_H;

  const fontFamily = String(selRtFont?.value || "system-ui, sans-serif");
  const fontSizePx = clamp(Number(inpRtSize?.value || 56), 10, 120);
  const threshold = clamp(Number(inpThresh?.value || 128), 40, 220);

  // HTML z edytora:
  const html = String(rtEditor?.innerHTML || "");

  const canvas = await renderRichTextToCanvas(html, { w: W, h: H, fontFamily, fontSizePx });
  const bits208 = canvasToBits(canvas, threshold);
  const bits150 = compress208x88to150x70(bits208);

  return { bits150 };
}

let _rtRenderToken = 0;

async function updateTextPixPreviewAsync() {
  if (editorMode !== "TEXT_PIX") return;

  const token = ++_rtRenderToken;
  try {
    const { bits150 } = await compileRichTextToLogoBits();
    if (token !== _rtRenderToken) return; // anuluj stary render

    draftBits150 = bits150;

    const box = bitsBoundingBox(bits150, DOT_W, DOT_H);
    const clipped = looksClipped(box, DOT_W, DOT_H, 0);

    if (pixWarn) {
      if (clipped) {
        pixWarn.textContent = "Wygląda na ucięte. Zmniejsz rozmiar albo skróć tekst.";
        show(pixWarn, true);
      } else {
        show(pixWarn, false);
      }
    }

    updateBigPreview();
  } catch (e) {
    console.error(e);
    if (pixWarn) {
      pixWarn.textContent = "Nie mogę zrobić podglądu tekstu na tym urządzeniu/przeglądarce.";
      show(pixWarn, true);
    }
  }
}


function renderHtmlTextTo208(text, opts) {
  const c = document.createElement("canvas");
  c.width = BIG_W;
  c.height = BIG_H;
  const ctx = c.getContext("2d");

  ctx.clearRect(0, 0, BIG_W, BIG_H);

  // tło czarne (łatwiejsza binarizacja: białe litery)
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, BIG_W, BIG_H);

  const weight = opts.bold ? "700" : "400";
  const style  = opts.italic ? "italic" : "normal";
  const sizePx = Math.max(6, Math.min(200, opts.sizePx | 0));

  // UWAGA: font-family jako string z UI, np. "Inter, system-ui"
  ctx.font = `${style} ${weight} ${sizePx}px ${opts.family}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = opts.align || "center"; // 'left' | 'center' | 'right'
  ctx.fillStyle = "#fff";

  const x =
    ctx.textAlign === "left" ? 0 :
    ctx.textAlign === "right" ? BIG_W :
    Math.floor(BIG_W / 2);

  const y = Math.floor(BIG_H / 2);

  // lekki padding przy left/right
  const pad = 6;
  const x2 = (ctx.textAlign === "left") ? pad : (ctx.textAlign === "right" ? BIG_W - pad : x);

  // jedna linia na start (wielolinijkę można dopiąć później)
  ctx.fillText(String(text || ""), x2, y);

  return c;
}

function compileHtmlTextTo150(text, opts) {
  const c208 = renderHtmlTextTo208(text, opts);
  const bits208 = canvasToBits(c208, opts.threshold ?? 128);
  const bits150 = compress208x88to150x70(bits208);
  return { bits150, bits208Canvas: c208 };
}

/* =========================================================
   CANVAS helpers: mini edit canvases
========================================================= */
function drawBitsToCanvasBW(bits01, w, h, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = bits01[i] ? 255 : 0;
    img.data[i * 4 + 0] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function bitsGet150(bits150, x, y) {
  return !!bits150[y * DOT_W + x];
}

function drawThumbFlat150x70(canvas, bits150) {
  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;

  // całe logo w kadrze (contain)
  const scale = Math.min(cw / DOT_W, ch / DOT_H);
  const ox = Math.floor((cw - DOT_W * scale) / 2);
  const oy = Math.floor((ch - DOT_H * scale) / 2);

  ctx.imageSmoothingEnabled = false;

  // tło czarne
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);

  // piksele białe bez przerw
  ctx.fillStyle = "#fff";
  for (let y = 0; y < DOT_H; y++) {
    const yy = oy + y * scale;
    for (let x = 0; x < DOT_W; x++) {
      if (!bitsGet150(bits150, x, y)) continue;
      ctx.fillRect(ox + x * scale, yy, scale, scale);
    }
  }
}

function rows30x10ToBits150(rows10) {
  const out = new Uint8Array(DOT_W * DOT_H);

  for (let ty = 0; ty < TILES_Y; ty++) {
    const rowStr = String(rows10?.[ty] ?? "").padEnd(30, " ").slice(0, 30);
    for (let tx = 0; tx < TILES_X; tx++) {
      const ch = rowStr[tx] ?? " ";
      const glyph = resolve5x7(ch); // masz już tę funkcję

      for (let py = 0; py < 7; py++) {
        const bits = glyph[py] | 0;
        for (let px = 0; px < 5; px++) {
          const on = (bits & (1 << (4 - px))) !== 0;
          if (!on) continue;
          const x = tx * 5 + px;
          const y = ty * 7 + py;
          out[y * DOT_W + x] = 1;
        }
      }
    }
  }

  return out;
}

const BIG_W = 208; // 30*5 + 29*2
const BIG_H = 88;  // 10*7 + 9*2

function compress208x88to150x70(bits208) {
  // bits208: Uint8Array(BIG_W*BIG_H) 0/1
  const out = new Uint8Array(DOT_W * DOT_H);

  let oy = 0;
  for (let y = 0; y < BIG_H; y++) {
    // usuń 2 rzędy przerwy co 9: indeksy 7 i 8 w bloku 0..8
    const my = y % 9;
    if (my === 7 || my === 8) continue;

    let ox = 0;
    for (let x = 0; x < BIG_W; x++) {
      // usuń 2 kolumny przerwy co 7: indeksy 5 i 6 w bloku 0..6
      const mx = x % 7;
      if (mx === 5 || mx === 6) continue;

      out[oy * DOT_W + ox] = bits208[y * BIG_W + x] ? 1 : 0;
      ox++;
    }
    oy++;
  }

  return out;
}

function bitsBoundingBox(bits, w, h) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bits[y*w+x]) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, w: maxX-minX+1, h: maxY-minY+1 };
}

function looksClipped(box, w, h, pad = 1) {
  if (!box) return false;
  return box.minX <= pad || box.minY <= pad || box.maxX >= (w-1-pad) || box.maxY >= (h-1-pad);
}

function updateTextPixPreview() {
  if (editorMode !== "TEXT_PIX") return;

  if (pixSizeLabel && rngPixSize) pixSizeLabel.textContent = String(rngPixSize.value);
  if (pixThreshLabel && rngPixThresh) pixThreshLabel.textContent = String(rngPixThresh.value);

  const text = String(textPixValue?.value || "");
  const opts = {
    family: String(selPixFont?.value || "system-ui, sans-serif"),
    bold: !!chkPixBold?.checked,
    italic: !!chkPixItalic?.checked,
    align: String(selPixAlign?.value || "center"),
    sizePx: Number(rngPixSize?.value || 56),
    threshold: Number(rngPixThresh?.value || 128),
  };

  const { bits150 } = compileHtmlTextTo150(text, opts);
  draftBits150 = bits150;

  // ostrzeżenie, jeśli wygląda na ucięte
  const box = bitsBoundingBox(bits150, DOT_W, DOT_H);
  const clipped = looksClipped(box, DOT_W, DOT_H, 0);

  if (pixWarn) {
    if (clipped) {
      pixWarn.textContent = "Wygląda na ucięte. Zmniejsz rozmiar albo zmień wyrównanie.";
      show(pixWarn, true);
    } else {
      show(pixWarn, false);
    }
  }

  updateBigPreview();
}

/* =========================================================
   DB
========================================================= */
async function listLogos() {
  const { data, error } = await sb()
    .from("user_logos")
    .select("id,name,type,is_active,updated_at,payload")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createLogo(row) {
  const { error } = await sb().from("user_logos").insert(row);
  if (error) throw error;
}

async function deleteLogo(id) {
  const { error } = await sb().from("user_logos").delete().eq("id", id);
  if (error) throw error;
}

async function setActive(id) {
  const { error } = await sb().rpc("user_logo_set_active", { p_logo_id: id });
  if (error) throw error;
}

async function clearActive() {
  const { error } = await sb().rpc("user_logo_clear_active");
  if (error) throw error;
}

/* =========================================================
   LIST UI
========================================================= */
function logoToPreviewPayload(logo) {
  if (logo?.type === TYPE_GLYPH) {
    const rows = logo?.payload?.layers?.[0]?.rows;
    if (Array.isArray(rows) && rows.length) {
      return { kind: "GLYPH", rows: rows.map(r => String(r || "").padEnd(30, " ").slice(0, 30)).slice(0, 10) };
    }
    return { kind: "GLYPH", rows: Array.from({ length: 10 }, () => " ".repeat(30)) };
  }

  if (logo?.type === TYPE_PIX) {
    const p = logo.payload || {};
    const w = Number(p.w) || DOT_W;
    const h = Number(p.h) || DOT_H;
    const bits = unpackBitsRowMajorMSB(p.bits_b64 || p.bits_base64 || p.bitsBase64 || "", w, h);

    // tylko 150x70 obsługujemy jako preview "jak BIG"; inne pokażemy jako puste
    if (w !== DOT_W || h !== DOT_H) {
      return { kind: "PIX", bits: new Uint8Array(DOT_W * DOT_H) };
    }
    return { kind: "PIX", bits };
  }

  return { kind: "GLYPH", rows: Array.from({ length: 10 }, () => " ".repeat(30)) };
}

function buildCardPreviewCanvas(payload) {
  const c = document.createElement("canvas");
  c.width = 460;
  c.height = 200;

  let bits150;
  if (payload.kind === "GLYPH") {
    bits150 = rows30x10ToBits150(payload.rows);
  } else {
    bits150 = payload.bits;
  }

  drawThumbFlat150x70(c, bits150);
  return c;
}

function openPreviewFullscreen(payload) {
  if (payload.kind === "GLYPH") {
    renderRows30x10ToBig(payload.rows, bigPreviewFull);
  } else {
    renderBits150x70ToBig(payload.bits, bigPreviewFull);
  }
  show(previewOverlay, true);
}

function renderList() {
  if (!grid) return;
  grid.innerHTML = "";

   const hasActive = logos.some(x => !!x.is_active);
   const isDefaultActive = !hasActive;
   
   // DEFAULT tile
   {
     const el = document.createElement("div");
     el.className = "card default";
   
     el.innerHTML = `
       <div class="cardTop">
         <div>
           <div class="name">Domyślne logo</div>
           <div class="meta">Używane automatycznie, gdy nie wybierzesz innego</div>
         </div>
         ${isDefaultActive ? `<div class="badgeActive">Aktywne</div>` : ``}
       </div>
       <div class="preview"></div>
       <div class="actions"></div>
     `;
   
     const payload = { kind: "GLYPH", rows: defaultLogoRows };
   
     const prevWrap = el.querySelector(".preview");
     const prevCanvas = buildCardPreviewCanvas(payload);
     prevCanvas.style.cursor = "pointer";
     prevCanvas.addEventListener("click", (ev) => {
       ev.stopPropagation();
       openPreviewFullscreen(payload);
     });
     prevWrap.appendChild(prevCanvas);
   
     const actions = el.querySelector(".actions");
     const btnAct = document.createElement("button");
     btnAct.className = "btn sm gold";
     btnAct.type = "button";
     btnAct.textContent = isDefaultActive ? "Aktywne" : "Ustaw aktywne";
     btnAct.disabled = isDefaultActive;
   
     btnAct.addEventListener("click", async (ev) => {
       ev.stopPropagation();
       setMsg("Ustawiam domyślne…");
       try {
         // bez alertu: dokładnie jak stary "Wyłącz aktywne", tylko w kafelku
         await clearActive();
         await refresh();
         setMsg("Ustawiono domyślne logo.");
       } catch (e) {
         console.error(e);
         alert("Nie udało się ustawić domyślnego.\n\n" + (e?.message || e));
         setMsg("");
       }
     });
   
     actions.appendChild(btnAct);
     grid.appendChild(el);
   }


  // add tile
  const add = document.createElement("div");
  add.className = "card add";
  add.textContent = "＋ Nowe logo";
  add.addEventListener("click", () => show(createOverlay, true));
  grid.appendChild(add);

  for (const l of logos) {
    const el = document.createElement("div");
    el.className = "card";

    el.innerHTML = `
      <div class="x" title="Usuń">✕</div>
      <div class="cardTop">
        <div>
          <div class="name">${esc(l.name || "(bez nazwy)")}</div>
          <div class="meta">${esc(l.type)} · ${esc(fmtDate(l.updated_at) || "")}</div>
        </div>
        ${l.is_active ? `<div class="badgeActive">Aktywne</div>` : ``}
      </div>
      <div class="preview"></div>
      <div class="actions"></div>
    `;

    const payload = logoToPreviewPayload(l);

    const prevWrap = el.querySelector(".preview");
    const prevCanvas = buildCardPreviewCanvas(payload);
    prevCanvas.style.cursor = "pointer";
    prevCanvas.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openPreviewFullscreen(payload);
    });
    prevWrap.appendChild(prevCanvas);

    const actions = el.querySelector(".actions");

    const btnAct = document.createElement("button");
    btnAct.className = "btn sm gold";
    btnAct.type = "button";
    btnAct.textContent = l.is_active ? "Aktywne" : "Ustaw aktywne";
    btnAct.disabled = !!l.is_active;
    btnAct.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      setMsg("Przełączam aktywne…");
      try {
        await setActive(l.id);
        await refresh();
        setMsg("Aktywne logo ustawione.");
      } catch (e) {
        console.error(e);
        alert("Nie udało się ustawić aktywnego (sprawdź RPC i indeks).\n\n" + (e?.message || e));
        setMsg("");
      }
    });

    actions.appendChild(btnAct);

    // delete X
    el.querySelector(".x").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const ok = confirm(`Usunąć logo „${l.name || "(bez nazwy)"}”?`);
      if (!ok) return;
      setMsg("Usuwam…");
      try {
        await deleteLogo(l.id);
        await refresh();
        setMsg("Usunięto.");
      } catch (e) {
        console.error(e);
        alert("Nie udało się usunąć.\n\n" + (e?.message || e));
        setMsg("");
      }
    });

    grid.appendChild(el);
  }
}

async function refresh() {
  logos = await listLogos();
  renderList();
}

/* =========================================================
   EDITOR: open/close
========================================================= */
function resetEditorState() {
  editorMode = null;
  drawTool = "BRUSH";
  draftRows30x10 = Array.from({ length: 10 }, () => " ".repeat(30));
  draftBits150 = new Uint8Array(DOT_W * DOT_H);

  if (logoName) logoName.value = "";
  if (textValue) textValue.value = "";
  if (imgFile) imgFile.value = "";

  clearCanvas(drawCanvas);
  clearCanvas(imgCanvas);

  show(paneText, false);
  show(paneTextPix, false);
  if (pixWarn) show(pixWarn, false);
  if (textPixValue) textPixValue.value = "";

  show(paneDraw, false);
  show(paneImage, false);

  show(textWarn, false);
  if (textMeasure) textMeasure.textContent = "—";

  setEditorMsg("");
  clearDirty();
}

function openEditor(mode) {
  resetEditorState();
  editorMode = mode;

  const titleMap = {
    TEXT: "Nowe logo — Napis",
    TEXT_PIX: "Nowe logo — Tekst",
    DRAW: "Nowe logo — Rysunek",
    IMAGE: "Nowe logo — Obraz",
  };

  editorTitle.textContent = titleMap[mode] || "Nowe logo";
  editorSub.textContent =
    mode === "TEXT" ? "Klasyczny styl jak w logo Familiady."
  : mode === "TEXT_PIX" ? "Tekst użytkownika z możliwością dopasowania stylu."
  : mode === "DRAW" ? "Możesz narysować logo dowolnie."
  : "Zaimportuj obrazek i dopasuj go do logo.";

   if (!logoName.value.trim()) {
     logoName.value =
       mode === "TEXT" ? "Napis" :
       mode === "TEXT_PIX" ? "Tekst" :
       mode === "DRAW" ? "Rysunek" :
       "Obrazek";
   }

  show(paneText, mode === "TEXT");
  show(paneTextPix, mode === "TEXT_PIX");
  show(paneDraw, mode === "DRAW");
  show(paneImage, mode === "IMAGE");


  show(document.querySelector(".shell"), false); // chowamy kafelki
  clearDirty();
  
  show(editorShell, true);

  if (mode === "TEXT") {
    const compiled = compileTextToRows30x10(textValue.value);
    draftRows30x10 = compiled.rows;
    updateTextWarnings(compiled);
    updateBigPreview();
  }

   if (mode === "TEXT_PIX") {
     updateTextPixPreviewAsync();
      clearDirty();
   }

  if (mode === "DRAW") {
    drawBitsToCanvasBW(draftBits150, DOT_W, DOT_H, drawCanvas);
    updateBigPreview();
  }

  if (mode === "IMAGE") {
    drawBitsToCanvasBW(draftBits150, DOT_W, DOT_H, imgCanvas);
    updateBigPreview();
  }
}

function closeEditor(force = false) {
  if (!force && !confirmCloseIfDirty()) return;
  show(editorShell, false);
  show(document.querySelector(".shell"), true); // przywróć kafelki
  resetEditorState();
}

/* =========================================================
   DRAW TOOL
========================================================= */
function setDrawPixel(x, y, val) {
  if (x < 0 || y < 0 || x >= DOT_W || y >= DOT_H) return;
  draftBits150[y * DOT_W + x] = val ? 1 : 0;
}

function pointerToXY(ev, canvas, w, h) {
  const rect = canvas.getBoundingClientRect();
  const cx = (ev.clientX - rect.left) / rect.width;
  const cy = (ev.clientY - rect.top) / rect.height;
  return { x: Math.floor(cx * w), y: Math.floor(cy * h) };
}

function installDrawHandlers() {
  if (!drawCanvas) return;
  let down = false;

  const paint = (ev) => {
    const p = pointerToXY(ev, drawCanvas, DOT_W, DOT_H);
    const val = drawTool === "BRUSH" ? 1 : 0;

    // 2x2
    for (let dy = -1; dy <= 0; dy++) {
      for (let dx = -1; dx <= 0; dx++) {
        setDrawPixel(p.x + dx, p.y + dy, val);
      }
    }

    drawBitsToCanvasBW(draftBits150, DOT_W, DOT_H, drawCanvas);
    updateBigPreview();
  };

  drawCanvas.addEventListener("pointerdown", (ev) => {
    if (editorMode !== "DRAW") return;
    down = true;
    drawCanvas.setPointerCapture(ev.pointerId);
    paint(ev);
  });

  drawCanvas.addEventListener("pointermove", (ev) => {
    if (!down || editorMode !== "DRAW") return;
    paint(ev);
  });

  drawCanvas.addEventListener("pointerup", () => { down = false; });
  drawCanvas.addEventListener("pointercancel", () => { down = false; });
}

/* =========================================================
   IMAGE TOOL
========================================================= */
function imageDataToBits(imgData, dither) {
  const out = new Uint8Array(DOT_W * DOT_H);

  const lum = new Float32Array(DOT_W * DOT_H);
  for (let i = 0; i < DOT_W * DOT_H; i++) {
    const r = imgData.data[i * 4 + 0];
    const g = imgData.data[i * 4 + 1];
    const b = imgData.data[i * 4 + 2];
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  if (!dither) {
    for (let i = 0; i < DOT_W * DOT_H; i++) out[i] = lum[i] >= 128 ? 1 : 0;
    return out;
  }

  for (let y = 0; y < DOT_H; y++) {
    for (let x = 0; x < DOT_W; x++) {
      const i = y * DOT_W + x;
      const oldv = lum[i];
      const newv = oldv >= 128 ? 255 : 0;
      out[i] = newv ? 1 : 0;
      const err = oldv - newv;

      if (x + 1 < DOT_W) lum[i + 1] += err * (7 / 16);
      if (y + 1 < DOT_H) {
        if (x > 0) lum[i + DOT_W - 1] += err * (3 / 16);
        lum[i + DOT_W] += err * (5 / 16);
        if (x + 1 < DOT_W) lum[i + DOT_W + 1] += err * (1 / 16);
      }
    }
  }

  return out;
}

async function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Nie udało się wczytać obrazu."));
      img.src = url;
    });

    const tmp = document.createElement("canvas");
    tmp.width = DOT_W;
    tmp.height = DOT_H;
    const ctx = tmp.getContext("2d");

    const contain = !!chkImgContain?.checked;

    const sx = img.width;
    const sy = img.height;

    let dw = DOT_W;
    let dh = DOT_H;
    let dx = 0;
    let dy = 0;

    if (contain) {
      const s = Math.min(DOT_W / sx, DOT_H / sy);
      dw = Math.max(1, Math.round(sx * s));
      dh = Math.max(1, Math.round(sy * s));
      dx = Math.floor((DOT_W - dw) / 2);
      dy = Math.floor((DOT_H - dh) / 2);
    } else {
      const s = Math.max(DOT_W / sx, DOT_H / sy);
      dw = Math.max(1, Math.round(sx * s));
      dh = Math.max(1, Math.round(sy * s));
      dx = Math.floor((DOT_W - dw) / 2);
      dy = Math.floor((DOT_H - dh) / 2);
    }

    ctx.clearRect(0, 0, DOT_W, DOT_H);
    ctx.drawImage(img, dx, dy, dw, dh);

    const data = ctx.getImageData(0, 0, DOT_W, DOT_H);
    draftBits150 = imageDataToBits(data, !!chkImgDither?.checked);

    drawBitsToCanvasBW(draftBits150, DOT_W, DOT_H, imgCanvas);
    updateBigPreview();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* =========================================================
   CREATE -> INSERT
========================================================= */
async function handleCreate() {
  const name = String(logoName.value || "").trim() || "Logo";
  setEditorMsg("");

  try {
    setEditorMsg("Zapisuję…");

    if (editorMode === "TEXT") {
      const compiled = compileTextToRows30x10(textValue.value);
      draftRows30x10 = compiled.rows;
      updateTextWarnings(compiled);
      updateBigPreview();

      if (compiled.invalid.length) {
        setEditorMsg("Popraw niedozwolone znaki.");
        return;
      }
      if (!compiled.fit) {
        setEditorMsg("Napis się nie mieści — skróć tekst.");
        return;
      }

      const payload = { layers: [{ color: "main", rows: draftRows30x10 }] };
      await createLogo({
        user_id: currentUser.id,
        name,
        type: TYPE_GLYPH,
        is_active: false,
        payload,
      });

      setEditorMsg("Zapisano.");
      clearDirty();
      closeEditor();
      await refresh();
      return;
    }

    if (editorMode === "DRAW" || editorMode === "IMAGE" || editorMode === "TEXT_PIX") {
      const payload = {
        w: DOT_W,
        h: DOT_H,
        format: "BITPACK_MSB_FIRST_ROW_MAJOR",
        bits_b64: packBitsRowMajorMSB(draftBits150, DOT_W, DOT_H),
      };

      await createLogo({
        user_id: currentUser.id,
        name,
        type: TYPE_PIX,
        is_active: false,
        payload,
      });

      setEditorMsg("Zapisano.");
      closeEditor();
      await refresh();
      return;
    }

    setEditorMsg("Wybierz tryb tworzenia.");
  } catch (e) {
    console.error(e);
    setEditorMsg("Błąd: " + (e?.message || e));
    alert("Nie udało się zapisać.\n\n" + (e?.message || e));
  }
}

/* =========================================================
   EVENTS
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  if (who) who.textContent = currentUser?.email || "—";

  await loadFonts();
  await loadDefaultLogo();
  renderAllowedCharsList();

  btnBack?.addEventListener("click", () => { location.href = "builder.html"; });

  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  btnClearActive?.addEventListener("click", async () => {
    const ok = confirm("Wyłączyć aktywne logo? (użytkownik będzie mieć 0 aktywnych)");
    if (!ok) return;
    setMsg("Wyłączam…");
    try {
      await clearActive();
      await refresh();
      setMsg("Aktywne wyłączone.");
    } catch (e) {
      console.error(e);
      alert("Nie udało się.\n\n" + (e?.message || e));
      setMsg("");
    }
  });

  // pick modal
  pickText?.addEventListener("click", () => { show(createOverlay, false); openEditor("TEXT"); });
  pickTextPix?.addEventListener("click", () => { show(createOverlay, false); openEditor("TEXT_PIX"); });
  pickDraw?.addEventListener("click", () => { show(createOverlay, false); openEditor("DRAW"); });
  pickImage?.addEventListener("click", () => { show(createOverlay, false); openEditor("IMAGE"); });

  btnPickCancel?.addEventListener("click", () => show(createOverlay, false));
  createOverlay?.addEventListener("click", (ev) => { if (ev.target === createOverlay) show(createOverlay, false); });

  // editor close/cancel
  btnEditorClose?.addEventListener("click", closeEditor);
  btnCancel?.addEventListener("click", closeEditor);

  // text editor
  textValue?.addEventListener("input", () => {
    if (editorMode !== "TEXT") return;
    markDirty();
    const compiled = compileTextToRows30x10(textValue.value);
    draftRows30x10 = compiled.rows;
    updateTextWarnings(compiled);
    updateBigPreview();
  });

  btnCharsToggle?.addEventListener("click", () => {
    const on = charsList.style.display === "none";
    show(charsList, on);
    btnCharsToggle.textContent = on ? "Ukryj" : "Pokaż";
  });


   // Rich-text toolbar (execCommand – oldschool, ale działa i jest szybki)
   const cmd = (name, val = null) => {
     try { document.execCommand(name, false, val); } catch {}
     rtEditor?.focus();
     markDirty();
     updateTextPixPreviewAsync();
   };
   
   btnRtBold?.addEventListener("click", () => cmd("bold"));
   btnRtItalic?.addEventListener("click", () => cmd("italic"));
   btnRtUnderline?.addEventListener("click", () => cmd("underline"));
   
   btnRtAlignLeft?.addEventListener("click", () => cmd("justifyLeft"));
   btnRtAlignCenter?.addEventListener("click", () => cmd("justifyCenter"));
   btnRtAlignRight?.addEventListener("click", () => cmd("justifyRight"));
   btnRtList?.addEventListener("click", () => cmd("insertUnorderedList"));
   
   selRtFont?.addEventListener("change", () => {
     // Ustawiamy font bazowy całego pola (screen), a style wewnątrz zostają
     markDirty();
     updateTextPixPreviewAsync();
   });
   
   const stepSize = (delta) => {
     const v = clamp(Number(inpRtSize?.value || 56) + delta, 10, 120);
     inpRtSize.value = String(v);
     markDirty();
     updateTextPixPreviewAsync();
   };
   btnRtSizeMinus?.addEventListener("click", () => stepSize(-2));
   btnRtSizePlus?.addEventListener("click", () => stepSize(+2));
   inpRtSize?.addEventListener("change", () => {
     inpRtSize.value = String(clamp(Number(inpRtSize.value || 56), 10, 120));
     markDirty();
     updateTextPixPreviewAsync();
   });
   
   // Kontrast (próg)
   const stepThresh = (delta) => {
     const v = clamp(Number(inpThresh?.value || 128) + delta, 40, 220);
     inpThresh.value = String(v);
     markDirty();
     updateTextPixPreviewAsync();
   };
   btnThreshMinus?.addEventListener("click", () => stepThresh(-4));
   btnThreshPlus?.addEventListener("click", () => stepThresh(+4));
   inpThresh?.addEventListener("change", () => {
     inpThresh.value = String(clamp(Number(inpThresh.value || 128), 40, 220));
     markDirty();
     updateTextPixPreviewAsync();
   });
   
   // Pisanie: nie renderuj co znak natychmiast — debounce
   let rtDeb = null;
   rtEditor?.addEventListener("input", () => {
     markDirty();
     clearTimeout(rtDeb);
     rtDeb = setTimeout(() => updateTextPixPreviewAsync(), 120);
   });
   

  // draw editor
  btnBrush?.addEventListener("click", () => {
    drawTool = "BRUSH";
    btnBrush.classList.add("gold");
    btnEraser.classList.remove("gold");
  });
  btnEraser?.addEventListener("click", () => {
    drawTool = "ERASER";
    btnEraser.classList.add("gold");
    btnBrush.classList.remove("gold");
  });
  btnClear?.addEventListener("click", () => {
    if (editorMode !== "DRAW") return;
    draftBits150.fill(0);
    drawBitsToCanvasBW(draftBits150, DOT_W, DOT_H, drawCanvas);
    updateBigPreview();
  });
  installDrawHandlers();
  btnBrush?.classList.add("gold");

  // image editor
  imgFile?.addEventListener("change", async () => {
    if (editorMode !== "IMAGE") return;
    const f = imgFile.files?.[0];
    if (!f) return;
    try { await loadImageFile(f); } catch (e) { console.error(e); alert(e?.message || String(e)); }
  });
  chkImgContain?.addEventListener("change", async () => {
    if (editorMode !== "IMAGE") return;
    const f = imgFile.files?.[0];
    if (f) await loadImageFile(f);
  });
  chkImgDither?.addEventListener("change", async () => {
    if (editorMode !== "IMAGE") return;
    const f = imgFile.files?.[0];
    if (f) await loadImageFile(f);
  });

  // save
  btnCreate?.addEventListener("click", handleCreate);

  // preview fullscreen
  const openPreview = () => {
    if (editorMode === "TEXT") renderRows30x10ToBig(draftRows30x10, bigPreviewFull);
    else renderBits150x70ToBig(draftBits150, bigPreviewFull);
    show(previewOverlay, true);
  };
  bigPreview?.addEventListener("click", openPreview);
  btnPreviewClose?.addEventListener("click", () => show(previewOverlay, false));
  previewOverlay?.addEventListener("click", (ev) => { if (ev.target === previewOverlay) show(previewOverlay, false); });

  await refresh();
});
