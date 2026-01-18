// familiada/logo-editor/js/main.js
// Glowna logika strony + lista kafelkow + routing do edytorow.

import { sb } from "../../js/core/supabase.js";
import { requireAuth, signOut } from "../../js/core/auth.js";

import { initTextEditor } from "./text.js";
import { initTextPixEditor } from "./text-pix.js";
import { initDrawEditor } from "./draw.js";
import { initImageEditor } from "./image.js";

/* =========================================================
   CONSTS
========================================================= */
const TYPE_GLYPH = "GLYPH_30x10";
const TYPE_PIX = "PIX_150x70";

const TILES_X = 30;
const TILES_Y = 10;
const DOT_W = 150; // 30*5
const DOT_H = 70;  // 10*7

// UWAGA: to sa sciezki wzgledne wobec logo-editor/logo-editor.html
// (ustalone, nie zgadujemy)
const FONT_3x10_URL = "../display/font_3x10.json";
const FONT_5x7_URL  = "../display/font_5x7.json";
const DEFAULT_LOGO_URL = "../display/logo_familiada.json";

/* =========================================================
   DOM
========================================================= */
const who = document.getElementById("who");
const msg = document.getElementById("msg");
const grid = document.getElementById("grid");

const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");
const btnClearActive = document.getElementById("btnClearActive");

// modal wyboru trybu
const createOverlay = document.getElementById("createOverlay");
const pickText = document.getElementById("pickText");
const pickTextPix = document.getElementById("pickTextPix");
const pickDraw = document.getElementById("pickDraw");
const pickImage = document.getElementById("pickImage");
const btnPickCancel = document.getElementById("btnPickCancel");

// edytor
const editorShell = document.getElementById("editorShell");
const editorTitle = document.getElementById("editorTitle");
const editorSub = document.getElementById("editorSub");
const btnEditorClose = document.getElementById("btnEditorClose");

const logoName = document.getElementById("logoName");

// panes
const paneText = document.getElementById("paneText");
const paneTextPix = document.getElementById("paneTextPix");
const paneDraw = document.getElementById("paneDraw");
const paneImage = document.getElementById("paneImage");

// actions
const btnCreate = document.getElementById("btnCreate");
const mMsg = document.getElementById("mMsg");

// preview
const bigPreview = document.getElementById("bigPreview");
const previewOverlay = document.getElementById("previewOverlay");
const bigPreviewFull = document.getElementById("bigPreviewFull");
const btnPreviewClose = document.getElementById("btnPreviewClose");

/* =========================================================
   STATE
========================================================= */
let currentUser = null;
let logos = [];
let defaultLogoRows = Array.from({ length: 10 }, () => " ".repeat(30));

let editorMode = null; // TEXT | TEXT_PIX | DRAW | IMAGE
let editorDirty = false;

let FONT_3x10 = null; // char -> [10 strings]
let GLYPH_5x7 = null; // char -> [7 ints]

let sessionSavedLogoId = null; // id logo zapisanego w tej sesji edytora (do UPDATE/DELETE)
let sessionSavedMode = null;   // żeby Anuluj wiedział co resetować


/* =========================================================
   UI helpers
========================================================= */
function $(id){ return document.getElementById(id); }
function show(el, on){ if (!el) return; el.style.display = on ? "" : "none"; }
function setMsg(t){ if (msg) msg.textContent = t || ""; }
function setEditorMsg(t){ if (mMsg) mMsg.textContent = t || ""; }
function markDirty(){ editorDirty = true; }
function clearDirty(){ editorDirty = false; }

function fmtDate(iso){
  try{
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("pl-PL", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit"
    });
  } catch { return ""; }
}

function esc(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function confirmCloseIfDirty(){
  if (!editorDirty) return true;
  return confirm("Jeśli teraz zamkniesz, zmiany nie zostaną zapisane.");
}

function makeUniqueName(baseName, excludeId = null){
  const base = String(baseName || "").trim() || "Logo";
  const used = new Set(
    (logos || [])
      .filter(l => !excludeId || l.id !== excludeId)
      .map(l => String(l?.name || "").trim().toLowerCase())
      .filter(Boolean)
  );

  if (!used.has(base.toLowerCase())) return base;

  let i = 2;
  while (i < 9999){
    const cand = `${base} (${i})`;
    if (!used.has(cand.toLowerCase())) return cand;
    i++;
  }
  return `${base} (${Date.now()})`;
}

function isUniqueViolation(e){
  // Supabase/Postgres: 23505 = unique violation
  return e?.code === "23505" || /duplicate key value/i.test(String(e?.message || ""));
}

/* =========================================================
   IMPORT / EXPORT (bez ID, bez usera)
   - eksportuje aktywne logo (kind GLYPH/PIX)
   - import tworzy NOWY rekord w DB (dopisuje nowe id)
========================================================= */

function downloadJson(filename, obj){
  const txt = JSON.stringify(obj, null, 2);
  const blob = new Blob([txt], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function cleanRows30x10(rows){
  const out = Array.from({ length: 10 }, (_, i) => {
    const r = String(rows?.[i] ?? "");
    return r.padEnd(30, " ").slice(0, 30);
  });
  return out;
}

function buildExportObjectFromLogo(logo){
  const name = String(logo?.name || "Logo").trim() || "Logo";

  // GLYPH
  if (logo?.type === TYPE_GLYPH){
    const rows = cleanRows30x10(logo?.payload?.layers?.[0]?.rows || defaultLogoRows);
    return {
      v: 1,
      kind: "GLYPH",
      name,
      payload: { rows },
    };
  }

  // PIX
  if (logo?.type === TYPE_PIX){
    const p = logo?.payload || {};
    const w = Number(p.w) || DOT_W;
    const h = Number(p.h) || DOT_H;
    const bits_b64 = String(p.bits_b64 || p.bits_base64 || p.bitsBase64 || "");
    return {
      v: 1,
      kind: "PIX",
      name,
      payload: {
        w, h,
        format: "BITPACK_MSB_FIRST_ROW_MAJOR",
        bits_b64,
      },
    };
  }

  throw new Error("Nieznany typ logo.");
}

function parseImportJson(text){
  let obj = null;
  try { obj = JSON.parse(text); } catch { throw new Error("To nie jest poprawny JSON."); }

  const kind = String(obj?.kind || "").toUpperCase();
  const name = String(obj?.name || "Logo").trim() || "Logo";

  if (kind === "GLYPH"){
    const rows = cleanRows30x10(obj?.payload?.rows);
    return { kind: "GLYPH", name, rows };
  }

  if (kind === "PIX"){
    const p = obj?.payload || {};
    const w = Number(p.w) || DOT_W;
    const h = Number(p.h) || DOT_H;
    if (w !== DOT_W || h !== DOT_H) {
      throw new Error(`Zły rozmiar PIX. Oczekuję ${DOT_W}×${DOT_H}, a jest ${w}×${h}.`);
    }
    const bits_b64 = String(p.bits_b64 || "");
    if (!bits_b64) throw new Error("Brak bits_b64 w imporcie.");
    return { kind: "PIX", name, pixPayload: { w, h, format: "BITPACK_MSB_FIRST_ROW_MAJOR", bits_b64 } };
  }

  throw new Error("Nieznany format importu. Oczekuję kind=GLYPH albo kind=PIX.");
}

async function importLogoFromFile(file){
  const txt = await file.text();
  const parsed = parseImportJson(txt);

  let name = makeUniqueName(parsed.name);

  let row = null;

  if (parsed.kind === "GLYPH"){
    row = {
      user_id: currentUser.id,
      name,
      type: TYPE_GLYPH,
      is_active: false,
      payload: {
        layers: [
          { rows: parsed.rows }
        ]
      }
    };
  } else {
    row = {
      user_id: currentUser.id,
      name,
      type: TYPE_PIX,
      is_active: false,
      payload: parsed.pixPayload
    };
  }

  await createLogo(row);
}


/* =========================================================
   Fetch helpers
========================================================= */
async function fetchJsonRequired(url, label){
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status} (${url})`);
  return await r.json();
}

function buildGlyph5x7Map(fontJson){
  if (!fontJson || typeof fontJson !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(fontJson)){
    if (k === "meta") continue;
    if (!v || typeof v !== "object") continue;
    for (const [ch, pat] of Object.entries(v)){
      if (typeof ch !== "string") continue;
      if (!Array.isArray(pat) || pat.length !== 7) continue;
      if (!(ch in out)) out[ch] = pat;
    }
  }
  return out;
}

async function loadFonts(){
  FONT_3x10 = await fetchJsonRequired(FONT_3x10_URL, "Font 3x10");
  const f57 = await fetchJsonRequired(FONT_5x7_URL, "Font 5x7");
  GLYPH_5x7 = buildGlyph5x7Map(f57);
}

async function loadDefaultLogo(){
  try{
    const j = await fetchJsonRequired(DEFAULT_LOGO_URL, "Default logo");
    const rows = j?.layers?.[0]?.rows;
    if (Array.isArray(rows) && rows.length){
      defaultLogoRows = rows.map(r => String(r||"").padEnd(30," ").slice(0,30)).slice(0,10);
    }
  } catch {
    defaultLogoRows = Array.from({ length: 10 }, () => " ".repeat(30));
  }
}

/* =========================================================
   BIG preview render (jak na wyswietlaczu)
   - wspolne dla wszystkich edytorow
========================================================= */
const BIG_COLORS = {
  bg: "#1f1f23",
  cell: "#000000",
  dotOff: "#1f1f23",
  dotOn: "#d7ff3d",
};

function calcBigLayout(canvas){
  const cw = canvas.width;
  const ch = canvas.height;

  for (let d = 16; d >= 2; d--){
    const gap = Math.max(1, Math.round(d / 4));
    const tileGap = 2 * d;
    const tileW = 5 * d + 6 * gap;
    const tileH = 7 * d + 8 * gap;
    const panelW = TILES_X * tileW + (TILES_X - 1) * tileGap;
    const panelH = TILES_Y * tileH + (TILES_Y - 1) * tileGap;

    if (panelW <= cw - 20 && panelH <= ch - 20){
      return { d, gap, tileGap, tileW, tileH, panelW, panelH };
    }
  }

  // fallback
  const d = 2, gap = 1, tileGap = 4;
  const tileW = 5 * d + 6 * gap;
  const tileH = 7 * d + 8 * gap;
  return {
    d, gap, tileGap, tileW, tileH,
    panelW: TILES_X * tileW + (TILES_X - 1) * tileGap,
    panelH: TILES_Y * tileH + (TILES_Y - 1) * tileGap,
  };
}

function clearBigCanvas(canvas){
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = BIG_COLORS.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawDot(ctx, cx, cy, r, on){
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = on ? BIG_COLORS.dotOn : BIG_COLORS.dotOff;
  ctx.fill();
}

function resolve5x7(ch){
  const g = GLYPH_5x7?.[ch] ?? GLYPH_5x7?.[String(ch||"").toUpperCase()] ?? null;
  if (!g) return [0,0,0,0,0,0,0];
  return g;
}

function renderRows30x10ToBig(rows10, canvas){
  const ctx = canvas.getContext("2d");
  const L = calcBigLayout(canvas);
  clearBigCanvas(canvas);

  const x0 = Math.floor((canvas.width - L.panelW) / 2);
  const y0 = Math.floor((canvas.height - L.panelH) / 2);
  const r = L.d / 2;
  const step = L.d + L.gap;

  for (let ty = 0; ty < TILES_Y; ty++){
    const rowStr = String(rows10?.[ty] ?? "").padEnd(30, " ").slice(0, 30);
    for (let tx = 0; tx < TILES_X; tx++){
      const ch = rowStr[tx] ?? " ";
      const glyph = resolve5x7(ch);

      const tileX = x0 + tx * (L.tileW + L.tileGap);
      const tileY = y0 + ty * (L.tileH + L.tileGap);

      ctx.fillStyle = BIG_COLORS.cell;
      ctx.fillRect(tileX, tileY, L.tileW, L.tileH);

      for (let py = 0; py < 7; py++){
        const bits = glyph[py] | 0;
        for (let px = 0; px < 5; px++){
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

function renderBits150x70ToBig(bits150, canvas){
  const ctx = canvas.getContext("2d");
  const L = calcBigLayout(canvas);
  clearBigCanvas(canvas);

  const x0 = Math.floor((canvas.width - L.panelW) / 2);
  const y0 = Math.floor((canvas.height - L.panelH) / 2);
  const r = L.d / 2;
  const step = L.d + L.gap;

  for (let ty = 0; ty < TILES_Y; ty++){
    for (let tx = 0; tx < TILES_X; tx++){
      const tileX = x0 + tx * (L.tileW + L.tileGap);
      const tileY = y0 + ty * (L.tileH + L.tileGap);

      ctx.fillStyle = BIG_COLORS.cell;
      ctx.fillRect(tileX, tileY, L.tileW, L.tileH);

      for (let py = 0; py < 7; py++){
        for (let px = 0; px < 5; px++){
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

function openPreviewFullscreen(payload){
  if (payload.kind === "GLYPH") renderRows30x10ToBig(payload.rows, bigPreviewFull);
  else renderBits150x70ToBig(payload.bits, bigPreviewFull);
  show(previewOverlay, true);
}

/* =========================================================
   BITPACK (dla PIX_150x70)
========================================================= */
function base64ToBytes(b64){
  try{
    const bin = atob((b64 || "").replace(/\s+/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  } catch { return new Uint8Array(0); }
}

function bytesToBase64(bytes){
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function packBitsRowMajorMSB(bits01, w, h){
  const bytesPerRow = Math.ceil(w / 8);
  const out = new Uint8Array(bytesPerRow * h);
  for (let y = 0; y < h; y++){
    const rowBase = y * bytesPerRow;
    for (let x = 0; x < w; x++){
      if (!bits01[y * w + x]) continue;
      const byteIndex = rowBase + (x >> 3);
      const bit = 7 - (x & 7);
      out[byteIndex] |= (1 << bit);
    }
  }
  return bytesToBase64(out);
}

function unpackBitsRowMajorMSB(bitsB64, w, h){
  const bytes = base64ToBytes(bitsB64);
  const bytesPerRow = Math.ceil(w / 8);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++){
    const rowBase = y * bytesPerRow;
    for (let x = 0; x < w; x++){
      const byteIndex = rowBase + (x >> 3);
      if (byteIndex < 0 || byteIndex >= bytes.length) continue;
      const bit = 7 - (x & 7);
      out[y * w + x] = (bytes[byteIndex] >> bit) & 1;
    }
  }
  return out;
}

/* =========================================================
   DB
========================================================= */
async function listLogos(){
  const { data, error } = await sb()
    .from("user_logos")
    .select("id,name,type,is_active,updated_at,payload")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createLogo(row){
  const { data, error } = await sb()
    .from("user_logos")
    .insert(row)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function updateLogo(id, patch){
  const { error } = await sb()
    .from("user_logos")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

async function deleteLogo(id){
  const { error } = await sb().from("user_logos").delete().eq("id", id);
  if (error) throw error;
}

async function setActive(id){
  const { error } = await sb().rpc("user_logo_set_active", { p_logo_id: id });
  if (error) throw error;
}

async function clearActive(){
  const { error } = await sb().rpc("user_logo_clear_active");
  if (error) throw error;
}

/* =========================================================
   MINIATURY (prosto: 150x70 b/w)
========================================================= */
function drawThumbFlat150x70(canvas, bits150){
  const ctx = canvas.getContext("2d");
  const cw = canvas.width, ch = canvas.height;

  const scale = Math.min(cw / DOT_W, ch / DOT_H);
  const ox = Math.floor((cw - DOT_W * scale) / 2);
  const oy = Math.floor((ch - DOT_H * scale) / 2);

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, cw, ch);

  ctx.fillStyle = "#fff";
  for (let y = 0; y < DOT_H; y++){
    for (let x = 0; x < DOT_W; x++){
      if (!bits150[y * DOT_W + x]) continue;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
}

function rows30x10ToBits150(rows10){
  const out = new Uint8Array(DOT_W * DOT_H);
  for (let ty = 0; ty < TILES_Y; ty++){
    const rowStr = String(rows10?.[ty] ?? "").padEnd(30," ").slice(0,30);
    for (let tx = 0; tx < TILES_X; tx++){
      const ch = rowStr[tx] ?? " ";
      const glyph = resolve5x7(ch);
      for (let py = 0; py < 7; py++){
        const bits = glyph[py] | 0;
        for (let px = 0; px < 5; px++){
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

/* =========================================================
   LIST UI
========================================================= */
function logoToPreviewPayload(logo){
  if (logo?.type === TYPE_GLYPH){
    const rows = logo?.payload?.layers?.[0]?.rows;
    if (Array.isArray(rows) && rows.length){
      return { kind: "GLYPH", rows: rows.map(r => String(r||"").padEnd(30," ").slice(0,30)).slice(0,10) };
    }
    return { kind: "GLYPH", rows: Array.from({ length: 10 }, () => " ".repeat(30)) };
  }

  if (logo?.type === TYPE_PIX){
    const p = logo.payload || {};
    const w = Number(p.w) || DOT_W;
    const h = Number(p.h) || DOT_H;
    const bits = unpackBitsRowMajorMSB(p.bits_b64 || p.bits_base64 || p.bitsBase64 || "", w, h);
    if (w !== DOT_W || h !== DOT_H) return { kind: "PIX", bits: new Uint8Array(DOT_W * DOT_H) };
    return { kind: "PIX", bits };
  }

  return { kind: "GLYPH", rows: Array.from({ length: 10 }, () => " ".repeat(30)) };
}

function buildCardPreviewCanvas(payload){
  const c = document.createElement("canvas");
  c.width = 520;
  c.height = 240;

  const bits150 = payload.kind === "GLYPH" ? rows30x10ToBits150(payload.rows) : payload.bits;
  drawThumbFlat150x70(c, bits150);
  return c;
}

function renderList(){
  if (!grid) return;
  grid.innerHTML = "";

  const hasActive = logos.some(x => !!x.is_active);
  const isDefaultActive = !hasActive;

  // 1) Domyslne logo
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
      try{
        await clearActive();
        await refresh();
        setMsg("Ustawiono domyślne logo.");
      } catch (e){
        console.error(e);
        alert("Nie udało się ustawić domyślnego.\n\n" + (e?.message || e));
        setMsg("");
      }
    });

    actions.appendChild(btnAct);
    grid.appendChild(el);
  }

  // 2) Dodaj nowe
  {
    const add = document.createElement("div");
    add.className = "card add";
    add.textContent = "＋ Nowe logo";
    add.addEventListener("click", () => show(createOverlay, true));
    grid.appendChild(add);
  }

  // 3) Twoje loga
  for (const l of logos){
    const el = document.createElement("div");
    el.className = "card";

    el.innerHTML = `
      <div class="x" title="Usuń">✕</div>
      <div class="cardTop">
        <div>
          <div class="name">${esc(l.name || "(bez nazwy)")}</div>
            <div class="meta">${esc(fmtDate(l.updated_at) || "")}</div>
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
      try{
        await setActive(l.id);
        await refresh();
        setMsg("Aktywne logo ustawione.");
      } catch (e){
        console.error(e);
        alert("Nie udało się ustawić aktywnego.\n\n" + (e?.message || e));
        setMsg("");
      }
    });

    actions.appendChild(btnAct);

    // usun
    el.querySelector(".x").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const ok = confirm(`Usunąć logo „${l.name || "(bez nazwy)"}“?`);
      if (!ok) return;
      setMsg("Usuwam…");
      try{
        await deleteLogo(l.id);
        await refresh();
        setMsg("Usunięto.");
      } catch (e){
        console.error(e);
        alert("Nie udało się usunąć.\n\n" + (e?.message || e));
        setMsg("");
      }
    });

    grid.appendChild(el);
  }
}

async function refresh(){
  logos = await listLogos();
  renderList();
}

/* =========================================================
   EDYTORY (moduly)
========================================================= */
let textEditor = null;
let textPixEditor = null;
let drawEditor = null;
let imageEditor = null;

function hideAllPanes(){
  show(paneText, false);
  show(paneTextPix, false);
  show(paneDraw, false);
  show(paneImage, false);
}

function setEditorShellMode(mode){
  editorShell.dataset.mode = mode || "";
}

function openEditor(mode){
   hideAllPanes();
  setEditorShellMode(mode);
  editorMode = mode;

   sessionSavedLogoId = null;
   sessionSavedMode = mode;
   
  clearDirty();
  setEditorMsg("");

   // Start edytora = start preview (żeby nie został obrazek z listy)
   lastPreviewPayload = { kind: "GLYPH", rows: Array.from({ length: 10 }, () => " ".repeat(30)) };
   updateBigPreviewFromPayload(lastPreviewPayload);


  const titleMap = {
    TEXT: "Nowe logo — Napis",
    TEXT_PIX: "Nowe logo — Tekst",
    DRAW: "Nowe logo — Rysunek",
    IMAGE: "Nowe logo — Obraz",
  };

  editorTitle.textContent = titleMap[mode] || "Nowe logo";
  editorSub.textContent =
    mode === "TEXT" ? "Klasyczny styl jak w logo Familiady." :
    mode === "TEXT_PIX" ? "Edytor tekstu (jak w Wordzie) → robimy z tego 'screena' na wyświetlacz." :
    mode === "DRAW" ? "Rysujesz w siatce 150×70." :
    "Importujesz obrazek i dopasowujesz do 150×70.";

  if (!logoName.value.trim()){
    logoName.value =
      mode === "TEXT" ? "Napis" :
      mode === "TEXT_PIX" ? "Tekst" :
      mode === "DRAW" ? "Rysunek" :
      "Obraz";
  }

  show(document.querySelector(".shell"), false);
  show(editorShell, true);

  if (mode === "TEXT"){
    show(paneText, true);
    textEditor.open();
  }

  if (mode === "TEXT_PIX"){
    show(paneTextPix, true);
    textPixEditor.open();
  }

  if (mode === "DRAW"){
    show(paneDraw, true);
    drawEditor.open();
  }

  if (mode === "IMAGE"){
    show(paneImage, true);
    imageEditor.open();
  }
}

function closeEditor(force = false){
  if (!force && !confirmCloseIfDirty()) return;

  // close active editor (sprzatanie listenerow specyficznych, jesli trzeba)
  if (editorMode === "TEXT") textEditor.close();
  if (editorMode === "TEXT_PIX") textPixEditor.close();
  if (editorMode === "DRAW") drawEditor.close();
  if (editorMode === "IMAGE") imageEditor.close();

  editorMode = null;
  setEditorShellMode("");
  show(editorShell, false);
  show(document.querySelector(".shell"), true);
  hideAllPanes();
  clearDirty();
}

let lastPreviewPayload = null;

function updateBigPreviewFromPayload(payload){
  if (!payload) return;
  lastPreviewPayload = payload;

  if (payload.kind === "GLYPH") renderRows30x10ToBig(payload.rows, bigPreview);
  else renderBits150x70ToBig(payload.bits, bigPreview);
}

/* =========================================================
   SAVE
========================================================= */
async function handleCreate(){
  let name = String(logoName.value || "").trim() || "Logo";
  setEditorMsg("");

  try{
    setEditorMsg("Zapisuję…");

    let res = null;

    if (editorMode === "TEXT") res = await textEditor.getCreatePayload();
    if (editorMode === "TEXT_PIX") res = await textPixEditor.getCreatePayload();
    if (editorMode === "DRAW") res = await drawEditor.getCreatePayload();
    if (editorMode === "IMAGE") res = await imageEditor.getCreatePayload();

    if (!res || !res.ok){
      setEditorMsg(res?.msg || "Nie mogę zapisać.");
      return;
    }

     // Jeśli to pierwszy zapis w tej sesji, a nazwa już istnieje -> automatycznie dopnij (2), (3)...
      if (!sessionSavedLogoId){
        const unique = makeUniqueName(name);
        if (unique !== name){
          name = unique;
          logoName.value = unique; // pokaż userowi realną nazwę, która się zapisze
        }
      } else {
        // Jeśli robimy UPDATE i user zmienił nazwę na istniejącą (innego logo) -> też dopnij
        const unique = makeUniqueName(name, sessionSavedLogoId);
        if (unique !== name){
          name = unique;
          logoName.value = unique;
        }
      }


    const patch = {
      user_id: currentUser.id,
      name,
      type: res.type,
      payload: res.payload,
      is_active: false,
    };

    if (!sessionSavedLogoId) {
      sessionSavedLogoId = await createLogo(patch);
      setEditorMsg("Zapisano.");
    } else {
      await updateLogo(sessionSavedLogoId, {
        name: patch.name,
        type: patch.type,
        payload: patch.payload,
      });
      setEditorMsg("Zaktualizowano zapis.");
    }

    clearDirty();
    await refresh();
  } catch (e){
    console.error(e);

    // Jeśli ktoś/refresh jeszcze nie zdążył, a w DB jednak kolizja -> dopnij unikalną i spróbuj raz jeszcze
    if (isUniqueViolation(e)){
      try{
        const fallback = makeUniqueName(logoName.value || "Logo", sessionSavedLogoId);
        logoName.value = fallback;

        // powtórka (jednorazowa)
        setEditorMsg("Poprawiam nazwę i zapisuję ponownie…");
        await handleCreate(); // UWAGA: to wywołanie rekurencyjne jest OK, bo tylko raz wchodzi w tę gałąź
        return;
      } catch (e2){
        console.error(e2);
      }
    }

    alert("Nie udało się zapisać.\n\n" + (e?.message || e));
    setEditorMsg("Błąd zapisu.");
  }
}

/* =========================================================
   START
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("../index.html");
  if (who) who.textContent = currentUser?.email || "—";

  try{
    await loadFonts();
  } catch (e){
    console.error(e);
    alert("Nie mogę wczytać fontów. Sprawdź ścieżki display/font_*.json.");
  }

  await loadDefaultLogo();

  const editorCtx = {
    // stan
    getMode: () => editorMode,

    // dirty
    markDirty,
    clearDirty,

    // komunikat w edytorze
    setEditorMsg,

    // preview -> main canvas
    onPreview: updateBigPreviewFromPayload,

    // font
    getFont3x10: () => FONT_3x10,

    // bitpack
    packBitsRowMajorMSB,

    // rozmiary
    DOT_W,
    DOT_H,

    // threshold (na razie stały, bo usuwamy UI Kontrastu)
    getThreshold: () => 128,
    getDither: () => false,

  };

  textEditor = initTextEditor(editorCtx);
  textPixEditor = initTextPixEditor({
    ...editorCtx,
    BIG_W: 208,
    BIG_H: 88,
  });
  drawEditor = initDrawEditor(editorCtx);
  imageEditor = initImageEditor(editorCtx);

  // topbar
  btnBack?.addEventListener("click", () => { location.href = "../builder.html"; });
  btnLogout?.addEventListener("click", async () => { await signOut(); location.href = "../index.html"; });

  btnClearActive?.addEventListener("click", async () => {
    const ok = confirm("Wyłączyć aktywne logo (wrócić do domyślnego)?");
    if (!ok) return;
    setMsg("Wyłączam aktywne…");
    try{
      await clearActive();
      await refresh();
      setMsg("Ustawiono domyślne.");
    } catch (e){
      console.error(e);
      alert("Nie udało się.\n\n" + (e?.message || e));
      setMsg("");
    }
  });

     // IMPORT
  btnImportLogo?.addEventListener("click", () => {
    inpImportLogoFile?.click();
  });

  inpImportLogoFile?.addEventListener("change", async () => {
    const f = inpImportLogoFile.files?.[0];
    inpImportLogoFile.value = ""; // reset, żeby drugi raz można było wybrać to samo
    if (!f) return;

    setMsg("Importuję…");
    try{
      await importLogoFromFile(f);
      await refresh();
      setMsg("Zaimportowano logo.");
    } catch (e){
      console.error(e);
      alert("Nie udało się zaimportować.\n\n" + (e?.message || e));
      setMsg("");
    }
  });

  // EXPORT (aktywnie ustawione logo)
  btnExportLogo?.addEventListener("click", () => {
    try{
      const active = (logos || []).find(l => !!l.is_active) || null;
      if (!active){
        alert("Nie masz aktywnego logo do eksportu.\n\nUstaw najpierw jakieś logo jako aktywne.");
        return;
      }
      const exp = buildExportObjectFromLogo(active);
      const safeName = String(exp.name || "logo").replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() || "logo";
      downloadJson(`logo_${safeName}.json`, exp);
      setMsg("Wyeksportowano logo.");
    } catch (e){
      console.error(e);
      alert("Nie udało się wyeksportować.\n\n" + (e?.message || e));
    }
  });


  // modal wyboru trybu
  pickText?.addEventListener("click", () => { show(createOverlay, false); openEditor("TEXT"); });
  pickTextPix?.addEventListener("click", () => { show(createOverlay, false); openEditor("TEXT_PIX"); });
  pickDraw?.addEventListener("click", () => { show(createOverlay, false); openEditor("DRAW"); });
  pickImage?.addEventListener("click", () => { show(createOverlay, false); openEditor("IMAGE"); });

  btnPickCancel?.addEventListener("click", () => show(createOverlay, false));
  createOverlay?.addEventListener("click", (ev) => { if (ev.target === createOverlay) show(createOverlay, false); });

   // X w prawym górnym rogu — pyta, jeśli są zmiany
   btnEditorClose?.addEventListener("click", () => closeEditor(false));

  // save
  btnCreate?.addEventListener("click", handleCreate);

  // fullscreen preview
   bigPreview?.addEventListener("click", () => {
     // fullscreen pokazuje DOKŁADNIE to, co ostatnio narysowaliśmy (z edytora albo z listy)
     const p = lastPreviewPayload || { kind: "GLYPH", rows: defaultLogoRows };
     openPreviewFullscreen(p);
   });

   // DRAW: 👁️ z draw.js wysyła event z payloadem (PIX bits)
   window.addEventListener("logoeditor:openPreview", (ev) => {
     const payload = ev?.detail;
     if (!payload) return;
     openPreviewFullscreen(payload);
   });

  btnPreviewClose?.addEventListener("click", () => show(previewOverlay, false));
  previewOverlay?.addEventListener("click", (ev) => { if (ev.target === previewOverlay) show(previewOverlay, false); });

  await refresh();
});
