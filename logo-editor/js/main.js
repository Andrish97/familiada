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

const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");

const brandTitle = document.getElementById("brandTitle");

const hint = document.getElementById("hint");
const msg = document.getElementById("msg");
const grid = document.getElementById("grid");

const listShell = document.getElementById("listShell"); // lista kafelków
const editorShell = document.getElementById("editorShell"); // edytor (już masz pewnie)

const btnPreview = document.getElementById("btnPreview");
const btnActivate = document.getElementById("btnActivate");

const btnImport = document.getElementById("btnImport");
const btnExport = document.getElementById("btnExport");
const inpImportLogoFile = document.getElementById("inpImportLogoFile");


// modal wyboru trybu
const createOverlay = document.getElementById("createOverlay");
const pickText = document.getElementById("pickText");
const pickTextPix = document.getElementById("pickTextPix");
const pickDraw = document.getElementById("pickDraw");
const pickImage = document.getElementById("pickImage");
const btnPickCancel = document.getElementById("btnPickCancel");

// w nowym układzie nie ma editorTitle/editorSub – fallback na brandTitle
const editorTitle = document.getElementById("editorTitle") || brandTitle;
const editorSub = document.getElementById("editorSub"); // może być null (i to OK)
const btnEditorClose = document.getElementById("btnEditorClose"); // może być null (i to OK)

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
let selectedKey = null; // "default" albo uuid logo
let defaultLogoRows = Array.from({ length: 10 }, () => " ".repeat(30));
let suppressDirty = false;


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
function show(el, on){
  if (!el) return;
  el.style.display = on ? "" : "none"; // "" wraca do CSS
}
function setMsg(t){ if (msg) msg.textContent = t || ""; }
function setEditorMsg(t){ if (mMsg) mMsg.textContent = t || ""; }
function markDirty(){
   if (suppressDirty) return;
   editorDirty = true;
}
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

function showToolsForMode(mode){
  const tText = document.getElementById("toolsText");
  const tPix  = document.getElementById("toolsTextPix");
  const tDraw = document.getElementById("toolsDraw");
  const tImg  = document.getElementById("toolsImage");
  const imgPanels = document.getElementById("imgPanels");

  // schowaj wszystko
  for (const el of [tText, tPix, tDraw, tImg, imgPanels]){
    if (el) el.style.display = "none";
  }

  // pokaż właściwe
  if (mode === "TEXT" && tText) tText.style.display = "flex";
  if (mode === "TEXT_PIX" && tPix) tPix.style.display = "flex";
  if (mode === "DRAW" && tDraw) tDraw.style.display = "flex";
  if (mode === "IMAGE" && tImg) tImg.style.display = "flex";
}


/* =========================================================
   NAV GUARD — ochrona przed: zamknięciem/odświeżeniem/cofaniem/nawigacją
   - działa tylko gdy edytor jest otwarty i są niezapisane zmiany
========================================================= */

let _navGuardArmed = false;
let _navGuardHistoryArmed = false;
let _navGuardIgnorePop = false;

function isEditing(){
  return !!editorMode; // edytor otwarty
}

function shouldBlockNav(){
  // Blokujemy TYLKO gdy edytor jest otwarty i są niezapisane zmiany
  return isEditing() && !!editorDirty;
}


function armNavGuard(){
  if (_navGuardArmed) return;
  _navGuardArmed = true;

  // 1) Zamknięcie/odświeżenie/nawigacja poza SPA
  window.addEventListener("beforeunload", (e) => {
    if (!shouldBlockNav()) return;
    e.preventDefault();
    // Chrome wymaga ustawienia returnValue (treść ignorowana)
    e.returnValue = "";
  });

  // 2) Cofanie w historii (Back) — wymaga “kotwicy” w historii
  armHistoryTrap();
}

function armHistoryTrap(){
  if (_navGuardHistoryArmed) return;
  _navGuardHistoryArmed = true;

  // wpychamy stan, żeby "Back" nie wyrzucał od razu z podstrony
  // i żeby popstate w ogóle się odpalił u nas.
  try{
    history.replaceState({ __logoEditor: "root" }, "", location.href);
    history.pushState({ __logoEditor: "guard" }, "", location.href);
  } catch {}

  window.addEventListener("popstate", async () => {
    if (_navGuardIgnorePop) return;

    // jeśli nie blokujemy, pozwalamy normalnie i nie walczymy z historią
    if (!shouldBlockNav()){
      // nic nie robimy: użytkownik cofa jak chce
      return;
    }

    // gdy mamy zmiany — cofanie przechwytujemy
    const ok = confirm("Masz niezapisane zmiany. Cofnąć i je utracić?");
    if (ok){
      // pozwól cofnąć: najprościej zrobić przejście wstecz jeszcze raz,
      // ale popstate już zaszło. Żeby nie robić pętli, ignorujemy kolejny pop.
      _navGuardIgnorePop = true;
      setTimeout(() => { _navGuardIgnorePop = false; }, 0);

      // tutaj możesz zachować się jak “zamknij edytor i wróć do listy”
      // zamiast cofać w historię:
      closeEditor(true);

      // po zamknięciu edytora “odbuduj” kotwicę historii, żeby nie było dziwnych backów
      try{
        history.replaceState({ __logoEditor: "root" }, "", location.href);
        history.pushState({ __logoEditor: "guard" }, "", location.href);
      } catch {}
      return;
    }

    // anulowane: odbijamy cofanie (wracamy do naszego guard state)
    try{
      _navGuardIgnorePop = true;
      history.pushState({ __logoEditor: "guard" }, "", location.href);
      setTimeout(() => { _navGuardIgnorePop = false; }, 0);
    } catch {}
  });
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

function exportLogoToFile(l){
  const payload = {
    name: l.name || "Logo",
    type: l.type,
    payload: l.payload
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(l.name || "logo").replace(/[^\w\d\- ]+/g,"").trim() || "logo"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
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
  grid.innerHTML = "";

  const active = (logos || []).find(l => !!l.is_active) || null;
  const activeKey = active ? active.id : "default";

  // helper: wybierz
  function select(key){
    selectedKey = key;
    updateListButtons(activeKey);
    // zaznaczenie wizualne
    for (const el of grid.querySelectorAll(".logoTile")){
      el.classList.toggle("is-selected", el.dataset.key === String(selectedKey || ""));
    }
  }

  // helper: budowa kafla
  function makeTile({ key, name, meta, payload, isActive, canDelete }){
    const el = document.createElement("div");
    el.className = "logoTile";
    el.dataset.key = String(key);

    if (isActive) el.classList.add("is-active");
    if (String(selectedKey || "") === String(key)) el.classList.add("is-selected");

    el.innerHTML = `
      <div class="logoTileTop">
        <div style="min-width:0">
          <div class="logoName">${esc(name)}</div>
          <div class="logoMeta">${esc(meta || "")}</div>
        </div>
        <div class="logoX ${canDelete ? "" : "is-disabled"}" title="${canDelete ? "Usuń" : "Nie można usunąć"}">✕</div>
      </div>
      <div class="logoPrev"></div>
      <div class="logoLamp" aria-label="Aktywne"></div>
    `;

    el.addEventListener("click", () => select(key));

    // delete
    el.querySelector(".logoX").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!canDelete) return;
      const ok = confirm(`Usunąć logo „${name}“?`);
      if (!ok) return;

      setMsg("Usuwam…");
      try{
        await deleteLogo(key);

        // jeśli usunięto aktywne -> aktywne przechodzi na default (czyli clearActive)
        await refresh();
        setMsg("Usunięto.");
      }catch(e){
        console.error(e);
        alert("Nie udało się usunąć.\n\n" + (e?.message || e));
        setMsg("");
      }
    });

    const prevWrap = el.querySelector(".logoPrev");
    const prevCanvas = buildCardPreviewCanvas(payload);
    prevCanvas.style.cursor = "default";
    prevWrap.appendChild(prevCanvas);

    return el;
  }

  // 1) DEFAULT (zawsze)
  {
    const payload = { kind: "GLYPH", rows: defaultLogoRows };
    const el = makeTile({
      key: "default",
      name: "Domyślne logo",
      meta: "",
      payload,
      isActive: activeKey === "default",
      canDelete: false
    });
    grid.appendChild(el);
  }

  // 2) LOGA USERA
  for (const l of logos){
    const payload = logoToPreviewPayload(l);
    const el = makeTile({
      key: l.id,
      name: l.name || "(bez nazwy)",
      meta: fmtDate(l.updated_at) || "",
      payload,
      isActive: activeKey === l.id,
      canDelete: true
    });
    grid.appendChild(el);
  }

  // 3) PLUS (jak w builder)
  {
    const add = document.createElement("div");
    add.className = "logoTile logoTileAdd";
    add.innerHTML = `<span class="plus">＋</span> <span>Nowe logo</span>`;
    add.addEventListener("click", () => show(createOverlay, true));
    grid.appendChild(add);
  }

  // jeśli zaznaczenie wskazuje na nieistniejące -> czyść
  if (selectedKey && selectedKey !== "default"){
    const exists = logos.some(l => l.id === selectedKey);
    if (!exists) selectedKey = null;
  }

  updateListButtons(activeKey);
}

function updateListButtons(activeKey){
  const hasSel = !!selectedKey;
  const isPlus = selectedKey === "__add__"; // u nas nie używamy, ale zostawiamy defensywnie

  // PODGLĄD = zaznaczone
  btnPreview.disabled = !hasSel || isPlus;

  // AKTYWUJ = zaznaczone != aktywne
  btnActivate.disabled = !hasSel || isPlus || (String(selectedKey) === String(activeKey));

  // EXPORT = tylko gdy coś zaznaczone i nie default
  btnExport.disabled = !hasSel || isPlus || (selectedKey === "default");
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
   showToolsForMode(mode);

  // ===== tryb edytora UI =====
  document.body.classList.add("is-editor");
  btnBack.textContent = "✕";
  btnBack.classList.add("sm");

  // ===== label trybu =====
  const modeLabel =
    mode === "TEXT" ? "Napis" :
    mode === "TEXT_PIX" ? "Tekst" :
    mode === "DRAW" ? "Rysunek" :
    "Obraz";

  // ===== tytuł w topbarze (1 linia) =====
  brandTitle.innerHTML =
    `<span class="bMain">Nowe logo — </span><span class="bMode">${modeLabel}</span>`;

   suppressDirty = true;
  // ===== domyślna nazwa nowego logo =====
  logoName.value = modeLabel;

  // ===== reset sesji zapisu =====
  sessionSavedLogoId = null;
  sessionSavedMode = mode;

  clearDirty();
   suppressDirty = false;
  setEditorMsg("");

  // ===== startowy pusty preview =====
  lastPreviewPayload = {
    kind: "GLYPH",
    rows: Array.from({ length: 10 }, () => " ".repeat(30))
  };
  updateBigPreviewFromPayload(lastPreviewPayload);

   // Ukryj listę kafelków, pokaż edytor
   if (listShell) show(listShell, false);
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

  if (editorMode === "TEXT") textEditor.close();
  if (editorMode === "TEXT_PIX") textPixEditor.close();
  if (editorMode === "DRAW") drawEditor.close();
  if (editorMode === "IMAGE") imageEditor.close();

  editorMode = null;
  setEditorShellMode("");
  hideAllPanes();

  show(editorShell, false);
  if (listShell) show(listShell, true);

  clearDirty();

  document.body.classList.remove("is-editor");
  btnBack.textContent = "← Moje gry";
  brandTitle.textContent = "FAMILIADA";
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
async function boot(){
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
    getMode: () => editorMode,
    markDirty,
    clearDirty,
    setEditorMsg,
    onPreview: updateBigPreviewFromPayload,
    getFont3x10: () => FONT_3x10,
    packBitsRowMajorMSB,
    DOT_W,
    DOT_H,
    getThreshold: () => 128,
    getDither: () => false,
  };

   textEditor = initTextEditor(editorCtx);
   textPixEditor = initTextPixEditor({ ...editorCtx, BIG_W: 208, BIG_H: 88 });
   drawEditor = initDrawEditor(editorCtx);
   imageEditor = initImageEditor(editorCtx);

   armNavGuard();

  // topbar
   btnBack?.addEventListener("click", () => {
     const inEditor = !!editorMode; // najpewniej: źródło prawdy to stan, nie style
   
     if (inEditor){
       // zamykanie edytora: cała logika w closeEditor() (tam jest confirmCloseIfDirty)
       closeEditor(false);
       return;
     }
   
     // wyjście do buildera: pytamy tylko jeśli faktycznie mamy dirty (i edytor otwarty)
     if (shouldBlockNav() && !confirmCloseIfDirty()) return;
     location.href = "../builder.html";
   });
   
   btnLogout?.addEventListener("click", async () => {
     if (shouldBlockNav() && !confirmCloseIfDirty()) return;
     await signOut();
     location.href = "../index.html";
   });

   btnLogout?.addEventListener("click", async () => {
     if (shouldBlockNav()){
       const ok = confirm("Masz niezapisane zmiany. Wylogować i je utracić?");
       if (!ok) return;
     }
     await signOut();
     location.href = "../index.html";
   });

  inpImportLogoFile?.addEventListener("change", async () => {
    const f = inpImportLogoFile.files?.[0];
    inpImportLogoFile.value = "";
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

   btnImport?.addEventListener("click", () => inpImportLogoFile?.click());
   
   btnExport?.addEventListener("click", async () => {
     if (!selectedKey || selectedKey === "default") return;
     const l = (logos || []).find(x => x.id === selectedKey);
     if (!l) return;
     exportLogoToFile(l); // podmień funkcję exportu na "zaznaczone"
   });

   btnPreview?.addEventListener("click", () => {
     if (!selectedKey) return;
     let payload = null;
   
     if (selectedKey === "default"){
       payload = { kind: "GLYPH", rows: defaultLogoRows };
     } else {
       const l = (logos || []).find(x => x.id === selectedKey);
       if (!l) return;
       payload = logoToPreviewPayload(l);
     }
   
     openPreviewFullscreen(payload);
   });
   
   btnActivate?.addEventListener("click", async () => {
     if (!selectedKey) return;
   
     setMsg("Ustawiam aktywne…");
     try{
       if (selectedKey === "default"){
         await clearActive(); // default = aktywne gdy w DB nic nie jest aktywne
       } else {
         await setActive(selectedKey);
       }
       await refresh();
       setMsg("Aktywne ustawione.");
     }catch(e){
       console.error(e);
       alert("Nie udało się ustawić aktywnego.\n\n" + (e?.message || e));
       setMsg("");
     }
   });


  // modal wyboru trybu
  pickText?.addEventListener("click", () => { show(createOverlay, false); openEditor("TEXT"); });
  pickTextPix?.addEventListener("click", () => { show(createOverlay, false); openEditor("TEXT_PIX"); });
  pickDraw?.addEventListener("click", () => { show(createOverlay, false); openEditor("DRAW"); });
  pickImage?.addEventListener("click", () => { show(createOverlay, false); openEditor("IMAGE"); });

  btnPickCancel?.addEventListener("click", () => show(createOverlay, false));
  createOverlay?.addEventListener("click", (ev) => { if (ev.target === createOverlay) show(createOverlay, false); });

 btnEditorClose?.addEventListener("click", () => closeEditor(false));

  btnCreate?.addEventListener("click", handleCreate);
   
   bigPreview?.addEventListener("click", () => {
     // TEXT: brak modala
     if (editorMode === "TEXT") return;
     const p = lastPreviewPayload || { kind: "GLYPH", rows: defaultLogoRows };
     openPreviewFullscreen(p);
   });

   document.getElementById("btnPixPreview")?.addEventListener("click", () => {
     const p = lastPreviewPayload || null;
     if (!p) return;
     openPreviewFullscreen(p);
   });

  window.addEventListener("logoeditor:openPreview", (ev) => {
    const payload = ev?.detail;
    if (!payload) return;
    openPreviewFullscreen(payload);
  });

  btnPreviewClose?.addEventListener("click", () => show(previewOverlay, false));
  previewOverlay?.addEventListener("click", (ev) => { if (ev.target === previewOverlay) show(previewOverlay, false); });

  await refresh();
}

// kuloodporne uruchomienie (działa też przy dynamicznym import())
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
