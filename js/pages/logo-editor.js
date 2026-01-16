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

const FONT_3x10_URL = "../../display/font_3x10.json";
const FONT_5x7_URL  = "../../display/font_5x7.json";

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
let logos = [];

let editorMode = null; // 'TEXT' | 'DRAW' | 'IMAGE'
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

function compileTextToRows30x10(raw) {
  const text = normalizeInputText(raw);
  const rows = Array.from({ length: 10 }, () => Array.from({ length: 30 }, () => " "));

  const invalid = [];
  let cursor = 0;
  const gap = 1;

  const chars = Array.from(text);
  for (let idx = 0; idx < chars.length; idx++) {
    const ch0 = chars[idx];

    if (ch0 === "\n" || ch0 === "\r" || ch0 === "\t") {
      invalid.push(ch0);
      continue;
    }

    // space: zawsze dozwolone, nawet jeśli nie ma w foncie
    if (ch0 === " ") {
      cursor += 1 + gap;
      continue;
    }

    const glyph = FONT_3x10?.[ch0] ?? FONT_3x10?.[ch0.toUpperCase()] ?? null;
    if (!glyph) {
      invalid.push(ch0);
      continue;
    }

    const gRows = Array.from({ length: 10 }, (_, i) => String(glyph[i] ?? "").padEnd(3, " ").slice(0, 3));
    const { left, w } = measureGlyphTight3x10(gRows);

    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < w; x++) {
        const outX = cursor + x;
        if (outX < 0 || outX >= 30) continue;
        const c = gRows[y][left + x] ?? " ";
        if (c === " ") continue;
        rows[y][outX] = c;
      }
    }

    cursor += w;
    if (idx < chars.length - 1) cursor += gap;
  }

  const usedW = Math.max(0, cursor - gap); // bez końcowej przerwy
  const fit = usedW <= 30;

  const outRows = rows.map(r => r.join(""));

  return { rows: outRows, usedW, fit, invalid: Array.from(new Set(invalid)) };
}

function renderAllowedCharsList() {
  if (!charsList) return;
  const keys = Object.keys(FONT_3x10 || {}).sort((a, b) => a.localeCompare(b, "pl"));
  const hasSpace = true;
  const chunks = [];
  if (hasSpace) chunks.push("␠ (spacja)");
  chunks.push(keys.join(" "));
  charsList.textContent = chunks.join("\n\n");
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

  if (payload.kind === "GLYPH") {
    renderRows30x10ToBig(payload.rows, c);
  } else {
    renderBits150x70ToBig(payload.bits, c);
  }

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
  show(paneDraw, false);
  show(paneImage, false);

  show(textWarn, false);
  if (textMeasure) textMeasure.textContent = "—";

  setEditorMsg("");
}

function openEditor(mode) {
  resetEditorState();
  editorMode = mode;

  const titleMap = {
    TEXT: "Nowe logo — Napis",
    DRAW: "Nowe logo — Rysunek",
    IMAGE: "Nowe logo — Obraz",
  };

  editorTitle.textContent = titleMap[mode] || "Nowe logo";
  editorSub.textContent = mode === "TEXT"
    ? "Piszesz tekst fontem 3×10; system liczy szerokość tight i ostrzega jeśli nie wejdzie."
    : "Pracujesz w 150×70; podgląd po prawej pokazuje wygląd jak na BIG.";

  if (!logoName.value.trim()) {
    logoName.value = mode === "TEXT" ? "Napis" : mode === "DRAW" ? "Rysunek" : "Obraz";
  }

  show(paneText, mode === "TEXT");
  show(paneDraw, mode === "DRAW");
  show(paneImage, mode === "IMAGE");

  show(editorShell, true);

  if (mode === "TEXT") {
    const compiled = compileTextToRows30x10(textValue.value);
    draftRows30x10 = compiled.rows;
    updateTextWarnings(compiled);
    updateBigPreview();
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

function closeEditor() {
  show(editorShell, false);
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
      closeEditor();
      await refresh();
      return;
    }

    if (editorMode === "DRAW" || editorMode === "IMAGE") {
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
