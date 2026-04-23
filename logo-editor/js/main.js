// familiada/logo-editorjs/main.js
// Glowna logika strony + lista kafelkow + routing do edytorow.

import { addRenameGesture } from "../../js/core/rename-gesture.js?v=v2026-04-23T22332";
import { loadFont5x7, buildLogoPreviewCanvas } from "../../js/core/logo-preview.js?v=v2026-04-23T22332";

import { sb } from "../../js/core/supabase.js?v=v2026-04-23T22332";
import { requireAuth } from "../../js/core/auth.js?v=v2026-04-23T22332";
import { isGuestUser } from "../../js/core/guest-mode.js?v=v2026-04-23T22332";
import { alertModal, confirmModal } from "../../js/core/modal.js?v=v2026-04-23T22332";
import { getUiLang, initI18n, t, withLangParam } from "../../translation/translation.js?v=v2026-04-23T22332";
import { initTopbarAccountDropdown } from "../../js/core/topbar-controller.js?v=v2026-04-23T22332";
import { isMobileDevice } from "../../js/core/pwa.js?v=v2026-04-23T22332";
import { v as cacheBust } from "../../js/core/cache-bust.js?v=v2026-04-23T22332";

import { initTextEditor } from "./text.js?v=v2026-04-23T22332";
import { initDrawEditor } from "./draw.js?v=v2026-04-23T22332";
import { initImageEditor } from "./image.js?v=v2026-04-23T22332";

window.addEventListener("error", (e) => {
  console.error("window error", e.error || e.message);
});

/* =========================================================
   CONSTS
========================================================= */
const TYPE_GLYPH = "GLYPH_30x10";
const TYPE_PIX = "PIX_150x70";

const TILES_X = 30;
const TILES_Y = 10;
const DOT_W = 150; // 30*5
const DOT_H = 70;  // 10*7

// UWAGA: to sa sciezki wzgledne wobec logo-editor
// (ustalone, nie zgadujemy)
const FONT_3x10_URL = "display/font_3x10.json";
const FONT_5x7_URL  = "display/font_5x7.json";
const DEFAULT_LOGO_URL = "display/logo_familiada.json";

/* =========================================================
   DOM
========================================================= */
const who = document.getElementById("who");

const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");
const btnManual = document.getElementById("btnManual");
const btnCloseEditor = document.getElementById("btnCloseEditor");
const helpOverlay = document.getElementById("helpOverlay");
const helpFrame = document.getElementById("helpFrame");
const btnHelpClose = document.getElementById("btnHelpClose");
const btnLegal = document.getElementById("btnLegal");

const legalOverlay = document.getElementById("legalOverlay");
const legalFrame = document.getElementById("legalFrame");
const btnBackToManual = document.getElementById("btnBackToManual");
const btnLegalClose = document.getElementById("btnLegalClose");

const brandTitle = document.getElementById("brandTitle");

const hint = document.getElementById("hint");
const msg = document.getElementById("msg");
const grid = document.getElementById("grid");

const listShell = document.getElementById("listShell"); // lista kafelków
const editorShell = document.getElementById("editorShell"); // edytor (już masz pewnie)

const btnPreview = document.getElementById("btnPreview");
const btnEdit = document.getElementById("btnEdit");

const btnImport = document.getElementById("btnImport");
const btnExport = document.getElementById("btnExport");
const inpImportLogoFile = document.getElementById("inpImportLogoFile");

// Modal importu logo
const logoImportOverlay = document.getElementById("logoImportOverlay");
const logoImportPreviewWrap = document.getElementById("logoImportPreviewWrap");
const logoImportPreviewCanvas = document.getElementById("logoImportPreviewCanvas");
const logoImportErr = document.getElementById("logoImportErr");
const logoImportProg = document.getElementById("logoImportProg");
const logoImportStep = document.getElementById("logoImportStep");
const logoImportCount = document.getElementById("logoImportCount");
const logoImportBar = document.getElementById("logoImportBar");
const logoImportMsg = document.getElementById("logoImportMsg");
const btnLogoImportConfirm = document.getElementById("btnLogoImportConfirm");
const btnLogoImportCancel = document.getElementById("btnLogoImportCancel");

// Export overlay
const logoExportOverlay = document.getElementById("logoExportOverlay");
const logoExportBar = document.getElementById("logoExportBar");
const logoExportMsg = document.getElementById("logoExportMsg");
const createOverlay = document.getElementById("createOverlay");
const pickText = document.getElementById("pickText");
const pickDraw = document.getElementById("pickDraw");
const pickImage = document.getElementById("pickImage");
const btnPickCancel = document.getElementById("btnPickCancel");

const logoName = document.getElementById("logoName");

// panes
const paneText = document.getElementById("paneText");
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

// RENAME modal
const renameOverlay = document.getElementById("renameOverlay");
const renameTitle = document.getElementById("renameTitle");
const renameSub = document.getElementById("renameSub");
const renameInput = document.getElementById("renameInput");
const btnRenameOk = document.getElementById("btnRenameOk");
const btnRenameCancel = document.getElementById("btnRenameCancel");
const renameMsg = document.getElementById("renameMsg");

/* =========================================================
   STATE
========================================================= */
let currentUser = null;
let guestMode = false;
let logos = [];
let selectedKey = null; // "default" albo uuid logo
let defaultLogoRows = Array.from({ length: 10 }, () => " ".repeat(30));
let suppressDirty = false;


let editorMode = null; // TEXT | DRAW | IMAGE
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

  // 1) [hidden] ma najwyższy priorytet (CSS: [hidden]{display:none!important})
  el.hidden = !on;

  // 2) Dodatkowo czyścimy inline display, bo HTML ma miejscami style="display:none"
  //    i samo hidden=false wtedy nie pokaże elementu.
  if (on) {
    el.style.display = "";     // wraca do CSS
  } else {
    el.style.display = "none"; // defensywnie
  }
}
function setMsg(elOrText, text){
  // Jeśli pierwszy argument to element, użyj go
  // Jeśli to string, użyj globalnego msg
  const el = (typeof elOrText === "string" || !elOrText) ? msg : elOrText;
  const t = (typeof elOrText === "string" || !elOrText) ? elOrText : text;
  if (el) el.textContent = t || "";
}
function setEditorMsg(t){ if (mMsg) mMsg.textContent = t || ""; }
function markDirty(){
   if (suppressDirty) return;
   editorDirty = true;
}
function clearDirty(){ editorDirty = false; }

function getDefaultLogoName() {
  return t("logoEditor.defaults.logoName");
}

function getDefaultLogoFileName() {
  return t("logoEditor.defaults.logoFileName");
}

function getLocale() {
  const lang = document.documentElement.lang || "pl";
  if (lang.startsWith("en")) return "en-US";
  if (lang.startsWith("uk")) return "uk-UA";
  return "pl-PL";
}

function fmtDate(iso){
  try{
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(getLocale(), {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit"
    });
  } catch { return ""; }
}

function progOpen(which){
  if (which === "import") show(logoImportOverlay, true);
  if (which === "export") show(logoExportOverlay, true);
}
function progClose(which){
  if (which === "import") show(logoImportOverlay, false);
  if (which === "export") show(logoExportOverlay, false);
}

function progSet(which, { step = "—", i = 0, n = 0, msg = "", sub = "" } = {}){
  const pct = n > 0 ? Math.max(0, Math.min(100, Math.round((i / n) * 100))) : 0;

  if (which === "import"){
    if (logoImportSub && sub) logoImportSub.textContent = sub;
    if (logoImportStep) logoImportStep.textContent = step;
    if (logoImportCount) logoImportCount.textContent = `${i}/${n}`;
    if (logoImportBar) logoImportBar.style.width = `${pct}%`;
    if (logoImportMsg) logoImportMsg.textContent = msg || "";
  }

  if (which === "export"){
    if (logoExportSub && sub) logoExportSub.textContent = sub;
    if (logoExportStep) logoExportStep.textContent = step;
    if (logoExportCount) logoExportCount.textContent = `${i}/${n}`;
    if (logoExportBar) logoExportBar.style.width = `${pct}%`;
    if (logoExportMsg) logoExportMsg.textContent = msg || "";
  }
}

function progReset(which){
  progSet(which, { step: "—", i: 0, n: 0, msg: "" });
}

function esc(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function confirmCloseIfDirty(){
  if (!editorDirty) return true;
  return await confirmModal({ text: t("logoEditor.confirm.closeUnsaved") });
}

function makeUniqueName(baseName, excludeId = null){
  const base = String(baseName || "").trim() || getDefaultLogoName();
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

async function createNewLogoWithType(type, mode, name){
  try{
    let payload = null;
    
    if (type === TYPE_GLYPH){
      // Puste logo GLYPH - 10 wierszy po 30 znaków
      payload = {
        layers: [{ color: "main", rows: Array.from({ length: 10 }, () => " ".repeat(30)) }],
        source: { mode }
      };
    } else if (type === TYPE_PIX){
      // Puste logo PIX - 150x70 bitów (same zera)
      payload = {
        w: DOT_W,
        h: DOT_H,
        format: "BITPACK_MSB_FIRST_ROW_MAJOR",
        bits_b64: packBitsRowMajorMSB(new Uint8Array(DOT_W * DOT_H), DOT_W, DOT_H),
        source: { mode }
      };
    }
    
    if (!payload){
      throw new Error(t("logoEditor.errors.invalidType"));
    }
    
    const row = {
      user_id: currentUser.id,
      name,
      type,
      is_active: false,
      payload
    };
    
    const newId = await createLogo(row);
    await refresh();
    
    // Zaznacz nowo utworzone logo
    selectedKey = newId;
    updateListButtons();
    
    setMsg(t("logoEditor.status.created"));
  } catch(e){
    console.error(e);
    void alertModal({ text: t("logoEditor.errors.createFailedDetailed", { error: e?.message || e }) });
  }
}

function isUniqueViolation(e){
  // Supabase/Postgres: 23505 = unique violation
  return e?.code === "23505" || /duplicate key value/i.test(String(e?.message || ""));
}

function showToolsForMode(mode){
  const tText = document.getElementById("toolsText");
  const tDraw = document.getElementById("toolsDraw");
  const tImg  = document.getElementById("toolsImage");
  const imgPanels = document.getElementById("imgPanels");

  // schowaj wszystko
  show(tText, false);
  show(tDraw, false);
  show(tImg, false);
  show(imgPanels, false);

  // pokaż właściwe
  if (mode === "TEXT") show(tText, true);
  if (mode === "DRAW") show(tDraw, true);
  if (mode === "IMAGE") { show(tImg, true); show(imgPanels, true); }
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
    const ok = await confirmModal({ text: t("logoEditor.confirm.backUnsaved") });
    if (ok){
      // pozwól cofnąć: najprościej zrobić przejście wstecz jeszcze raz,
      // ale popstate już zaszło. Żeby nie robić pętli, ignorujemy kolejny pop.
      _navGuardIgnorePop = true;
      setTimeout(() => { _navGuardIgnorePop = false; }, 0);

      // tutaj możesz zachować się jak “zamknij edytor i wróć do listy”
      // zamiast cofać w historię:
      await closeEditor(true);

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

async function exportLogoToFile(l){
  const type = String(l?.type || "").toUpperCase();

  let out = null;

  if (type.includes("GLYPH")){
    const rows = l?.payload?.layers?.[0]?.rows || [];
    const source = l?.payload?.source || {};
    out = {
      kind: "GLYPH",
      name: l.name || getDefaultLogoName(),
      payload: {
        layers: [{ rows }],
        source: Object.keys(source).length ? source : undefined
      }
    };
  } else if (type.includes("PIX")){
    const p = l?.payload || {};
    const source = p.source || {};
    let imageData = source.imageData || null;

    // Jeśli mamy imageUrl ale nie mamy imageData → pobierz i zakoduj
    if (source.imageUrl && !imageData) {
      try {
        imageData = await fetchImageAsBase64(source.imageUrl);
      } catch (e) {
        console.warn("[export] Failed to embed image:", e);
      }
    }

    // Kopiuj CAŁY source + dodaj imageData
    const exportSource = {
      ...source,
      ...(imageData ? { imageData } : {}),
    };

    out = {
      kind: "PIX",
      name: l.name || getDefaultLogoName(),
      payload: {
        w: Number(p.w) || DOT_W,
        h: Number(p.h) || DOT_H,
        format: "BITPACK_MSB_FIRST_ROW_MAJOR",
        bits_b64: String(p.bits_b64 || ""),
        source: Object.keys(exportSource).length > 1 ? exportSource : undefined
      }
    };
  } else {
    // fallback: nie powinno się zdarzyć, ale nie psujemy eksportu
    out = { kind: "GLYPH", name: l.name || getDefaultLogoName(), payload: { rows: [] } };
  }

  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const fallbackName = getDefaultLogoFileName();
  a.download = `${(l.name || fallbackName).replace(/[^\w\d\- ]+/g,"").trim() || fallbackName}.famlogo`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/** Pobiera obraz z URL i zwraca data:image/...;base64,... */
async function fetchImageAsBase64(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function parseImportJson(text){
  let obj = null;
  try { obj = JSON.parse(text); } catch { throw new Error(t("logoEditor.errors.invalidJson")); }

  // Obsługujemy 2 formaty:
  // (A) transfer: { kind:"GLYPH|PIX", name, payload:{ rows... / bits_b64... } }
  // (B) db-export (stary): { type:"GLYPH_30x10|PIX_150x70", name, payload:{ layers... / bits_b64... } }
  const kindRaw = String(obj?.kind || "").toUpperCase();
  const typeRaw = String(obj?.type || "").toUpperCase();

  const kind =
    kindRaw ||
    (typeRaw.includes("GLYPH") ? "GLYPH" : "") ||
    (typeRaw.includes("PIX") ? "PIX" : "");

  const name = String(obj?.name || getDefaultLogoName()).trim() || getDefaultLogoName();
  const p = obj?.payload || {};

  if (kind === "GLYPH"){
    // transfer: payload.rows
    // db-export: payload.layers[0].rows
    const rowsSrc =
      p?.rows ??
      p?.layers?.[0]?.rows ??
      obj?.rows;

    const rows = cleanRows30x10(rowsSrc);
    // Zachowaj source (np. text dla trybu TEXT)
    const source = p?.source || obj?.source || null;
    return { kind: "GLYPH", name, rows, source };
  }

  if (kind === "PIX"){
    const w = Number(p.w) || DOT_W;
    const h = Number(p.h) || DOT_H;
    if (w !== DOT_W || h !== DOT_H) {
      throw new Error(t("logoEditor.errors.pixSize", { expectedW: DOT_W, expectedH: DOT_H, actualW: w, actualH: h }));
    }
    const bits_b64 = String(p.bits_b64 || "");
    if (!bits_b64) throw new Error(t("logoEditor.errors.missingBits"));
    // Zachowaj cały source (editHistory, imageData, fabricData itp.)
    const source = p.source || {};
    return { kind: "PIX", name, pixPayload: { w, h, format: "BITPACK_MSB_FIRST_ROW_MAJOR", bits_b64, source } };
  }

  throw new Error(t("logoEditor.errors.unknownImportFormat"));
}

async function importLogoFromFile(file){
  const txt = await file.text();
  const parsed = parseImportJson(txt);

  let name = makeUniqueName(parsed.name);

  let row = null;

  if (parsed.kind === "GLYPH"){
    const hasSource = parsed.source && Object.keys(parsed.source).length > 0;
    row = {
      user_id: currentUser.id,
      name,
      type: TYPE_GLYPH,
      is_active: false,
      payload: {
        layers: [
          { rows: parsed.rows }
        ],
        // Zachowaj source (text dla trybu TEXT, fabricData dla DRAW w GLYPH)
        // Jeśli brak source → ustaw domyślny mode TEXT
        source: hasSource
          ? parsed.source
          : { mode: "TEXT" }
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
  const r = await fetch(await cacheBust(url), { cache: "no-store" });
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status} (${url})`);
  return await r.json();
}

async function loadFonts(){
  FONT_3x10 = await fetchJsonRequired(FONT_3x10_URL, "Font 3x10");
  GLYPH_5x7 = await loadFont5x7(await cacheBust(FONT_5x7_URL));
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
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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
  if (!GLYPH_5x7) return [0,0,0,0,0,0,0];
  let v = GLYPH_5x7.get(ch) ?? GLYPH_5x7.get(String(ch||"").toUpperCase()) ?? null;
  if (!v) return [0,0,0,0,0,0,0];
  // obsługa aliasów "@"
  while (typeof v === "string" && v.startsWith("@")) {
    v = GLYPH_5x7.get(v.slice(1)) ?? null;
    if (!v) return [0,0,0,0,0,0,0];
  }
  return v;
}

function renderRows30x10ToBig(rows10, canvas){
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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
  
  const modal = previewOverlay.querySelector(".modal");
  if (modal) {
    modal.classList.toggle("is-touch", isMobileDevice());
  }
  
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
  // Najpierw pobierz logo, żeby uzyskać dostęp do imageUrl w payload
  const { data: logo, error: fetchError } = await sb()
    .from("user_logos")
    .select("payload")
    .eq("id", id)
    .single();

  if (fetchError) {
    console.error("[deleteLogo] Fetch error:", fetchError);
    throw fetchError;
  }

  // Jeśli logo ma imageUrl w payload.source, usuń plik ze storage
  const imageUrl = logo?.payload?.source?.imageUrl;
  if (imageUrl) {
    try {
      // Wyodrębnij ścieżkę z URL: https://.../storage/v1/object/public/user-logos/user-id/filename.ext -> user-id/filename.ext
      const urlParts = imageUrl.split("/user-logos/");
      if (urlParts.length === 2) {
        const storagePath = urlParts[1];
        const userId = storagePath.split("/")[0];

        // Usuń plik
        const { data: removeData, error: storageError } = await sb()
          .storage
          .from("user-logos")
          .remove([storagePath]);

        if (storageError) {
          console.error("[deleteLogo] Storage remove error:", storageError);
          // Nie rzucamy błędu - kontynuujemy usuwanie z DB
        } else {
          // Sprawdźmy, czy w folderze usera są jeszcze jakieś pliki
          const { data: remainingFiles } = await sb()
            .storage
            .from("user-logos")
            .list(userId, { limit: 100 });

          // Jeśli folder jest pusty, usuń go (Supabase nie pozwala usuwać pustych folderów bezpośrednio)
          // Foldery w Supabase to tylko struktura wirtualna - znikają same gdy nie ma plików
          if (!remainingFiles || remainingFiles.length === 0) {
            // Folder jest pusty
          }
        }
      } else {
        console.warn("[deleteLogo] Could not extract path from URL:", urlParts);
      }
    } catch (e) {
      console.error("[deleteLogo] Failed to remove file from storage:", e);
      // Nie rzucamy błędu - kontynuujemy usuwanie z DB
    }
  }

  // Usuń rekord z bazy
  const { error } = await sb().from("user_logos").delete().eq("id", id);
  if (error) {
    console.error("[deleteLogo] Database delete error:", error);
    throw error;
  }
}

/* =========================================================
   RENAME MODAL
========================================================= */
let renameMode = "rename";
let renameLogoId = null;
let createModeType = null;  // typ logo podczas tworzenia: TYPE_GLYPH lub TYPE_PIX
let createModeMode = null;  // tryb edytora: "TEXT", "DRAW", "IMAGE"

function openRenameModal(logo){
  renameMode = "rename";
  renameLogoId = logo?.id || null;
  setMsg(renameMsg, "");
  renameTitle.textContent = t("logoEditor.rename.title");
  renameSub.textContent = t("logoEditor.rename.sub");
  renameInput.value = logo?.name || "";
  show(renameOverlay, true);
  setTimeout(() => renameInput.select(), 0);
}

function openCreateModal(type, mode){
  createModeType = type;
  createModeMode = mode;
  renameMode = "create";
  renameLogoId = null;
  setMsg(renameMsg, "");
  renameTitle.textContent = t("logoEditor.create.nameModalTitle");
  renameSub.textContent = t("logoEditor.create.nameModalSub");
  renameInput.value = "";
  show(renameOverlay, true);
  setTimeout(() => renameInput.focus(), 0);
}

function closeRenameModal(){
  renameLogoId = null;
  createModeType = null;
  createModeMode = null;
  renameMode = "rename";
  show(renameOverlay, false);
}

async function renameOk(){
  setMsg(renameMsg, "");
  const val = String(renameInput.value || "").trim();
  if (!val){
    setMsg(renameMsg, t("logoEditor.rename.emptyError"));
    return;
  }
  try{
    if (renameMode === "create"){
      // Tworzenie nowego logo z podaną nazwą
      await createNewLogoWithType(createModeType, createModeMode, val);
    } else if (renameMode === "rename" && renameLogoId){
      // Zmiana nazwy istniejącego logo
      await updateLogo(renameLogoId, { name: val });
    }
    await refresh();
    closeRenameModal();
  }catch(e){
    console.error(e);
    setMsg(renameMsg, renameMode === "create" ? t("logoEditor.errors.createFailed") : t("logoEditor.rename.failed"));
  }
}

/* =========================================================
   MINIATURY (prosto: 150x70 b/w)
========================================================= */
function drawThumbFlat150x70(canvas, bits150){
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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

// Konwertuje rekord DB do formatu payload używanego przez openPreviewFullscreen
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

function renderList(){
  grid.innerHTML = "";

  // 0) PLUS (jak w builder)
  {
    const add = document.createElement("div");
   add.className = "addCard hide-mobile";
   add.innerHTML = `
     <div class="plus">＋</div>
     <div class="txt">${t("logoEditor.create.title")}</div>
     <div class="sub">${t("logoEditor.create.subtitle")}</div>
   `;
    add.addEventListener("click", () => show(createOverlay, true));
    grid.appendChild(add);
  }


  // helper: wybierz
  function select(key){
    selectedKey = key;
    updateListButtons();
    // zaznaczenie wizualne
    for (const el of grid.querySelectorAll(".logoTile")){
      el.classList.toggle("is-selected", el.dataset.key === String(selectedKey || ""));
    }
  }

  // helper: budowa kafla
  function makeTile({ key, name, meta, logo, canDelete }){
    const el = document.createElement("div");
    el.className = "logoTile";
    el.dataset.key = String(key);

    if (String(selectedKey || "") === String(key)) el.classList.add("is-selected");

    el.innerHTML = `
      <div class="logoTileTop">
        <div style="min-width:0">
          <div class="logoName">${esc(name)}</div>
          <div class="logoMeta">${esc(meta || "")}</div>
        </div>
        <div class="logoActions">
          <div class="logoX ${canDelete ? "" : "is-disabled"}" title="${canDelete ? t("logoEditor.list.delete") : t("logoEditor.list.deleteDisabled")}">✕</div>
        </div>
      </div>
      <div class="logoPrev"></div>
    `;

    el.addEventListener("click", () => select(key));

    // double-click / long-press -> rename (tylko dla logo usera)
    addRenameGesture(el, (e) => {
      if (e.target?.closest(".logoActions")) return;
      const l = logos.find(x => x.id === key);
      if (!l) return;
      openRenameModal(l);
    });

    // delete
    el.querySelector(".logoX").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!canDelete) return;
      const ok = await confirmModal({ text: t("logoEditor.confirm.deleteLogo", { name }) });
      if (!ok) return;

      setMsg(t("logoEditor.status.deleting"));
      try{
        await deleteLogo(key);

        // jeśli usunięto aktywne -> aktywne przechodzi na default (czyli clearActive)
        await refresh();
        setMsg(t("logoEditor.status.deleted"));
      }catch(e){
        console.error(e);
        void alertModal({ text: t("logoEditor.errors.deleteFailed", { error: e?.message || e }) });
        setMsg("");
      }
    });

    const prevWrap = el.querySelector(".logoPrev");
    const prevCanvas = buildLogoPreviewCanvas(logo, GLYPH_5x7, 520, 240);
    prevCanvas.style.cursor = "default";
    prevWrap.appendChild(prevCanvas);

    return el;
  }

  // LOGA USERA
  for (const l of logos){
    const el = makeTile({
      key: l.id,
      name: l.name || t("logoEditor.defaults.unnamed"),
      meta: fmtDate(l.updated_at) || "",
      logo: l,
      canDelete: true
    });
    grid.appendChild(el);
  }

  // jeśli zaznaczenie wskazuje na nieistniejące -> czyść
  if (selectedKey){
    const exists = logos.some(l => l.id === selectedKey);
    if (!exists) selectedKey = null;
  }

  updateListButtons();
}

function updateListButtons(){
  const hasSel = !!selectedKey;
  const isPlus = selectedKey === "__add__";

  // PODGLĄD = zaznaczone
  if (btnPreview) btnPreview.disabled = !hasSel || isPlus;
  if (btnEdit) btnEdit.disabled = !hasSel || isPlus;

  // EXPORT = tylko gdy coś zaznaczone
  if (btnExport) btnExport.disabled = !hasSel || isPlus;
}

async function refresh(){
  logos = await listLogos();
  renderList();
}

let _tinymcePromise = null;

const TINYMCE_BASE = "https://cdn.jsdelivr.net/npm/tinymce@7";

async function loadTinyMceFromSupabase(){
  if (_tinymcePromise) return _tinymcePromise;

  _tinymcePromise = (async () => {
    if (window.tinymce) return true;

    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${TINYMCE_BASE}/tinymce.min.js`;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error("Failed to load TinyMCE script."));
      document.head.appendChild(s);
    });

    if (!window.tinymce) throw new Error("TinyMCE did not initialize.");

    window.tinymce.baseURL = TINYMCE_BASE;
    window.tinymce.suffix = ".min";

    return true;
  })();

  return _tinymcePromise;
}


/* =========================================================
   EDYTORY (moduly)
========================================================= */
let textEditor = null;
let drawEditor = null;
let imageEditor = null;

function hideAllPanes(){
  show(paneText, false);
  show(paneDraw, false);
  show(paneImage, false);
}

function setEditorShellMode(mode){
  editorShell.dataset.mode = mode || "";
}

function getModeLabel(mode) {
  return mode === "TEXT" ? t("logoEditor.modes.text") :
    mode === "DRAW" ? t("logoEditor.modes.draw") :
    t("logoEditor.modes.image");
}

function updateEditorHeader() {
  if (!editorMode) return;
  const modeLabel = getModeLabel(editorMode);
  brandTitle.innerHTML =
    `<span class="bMain">${t("logoEditor.editor.newLogoPrefix")}</span><span class="bMode">${modeLabel}</span>`;
}

function buildManualPageUrl() {
  const url = new URL("../manual", location.href);
  const ret = `${location.pathname.split("/").slice(-2).join("/")}${location.search}${location.hash}`;
  url.searchParams.set("ret", ret);
  url.searchParams.set("lang", getUiLang() || "pl");
  url.hash = "logo";
  return url.toString();
}

function buildHelpUrl() {
  const url = new URL("../manual", location.href);
  const ret = `${location.pathname.split("/").slice(-2).join("/")}${location.search}${location.hash}`;
  url.searchParams.set("ret", ret);
  url.searchParams.set("modal", "logo-editor");
  url.searchParams.set("lang", getUiLang() || "pl");
  url.searchParams.set("tab", "logo");
  url.hash = "logo";
  return url.toString();
}

function buildLegalUrl() {
  const url = new URL("../privacy", location.href);
  const ret = `${location.pathname.split("/").slice(-2).join("/")}${location.search}${location.hash}`;
  url.searchParams.set("ret", ret);
  url.searchParams.set("modal", "logo-editor");
  url.searchParams.set("lang", getUiLang() || "pl");
  url.hash = "logo-editor";
  return url.toString();
}

function openHelpModal() {
  if (helpFrame) helpFrame.src = buildHelpUrl();
  helpOverlay?.classList.remove("hidden");
}

function closeHelpModal() {
  helpOverlay?.classList.add("hidden");
}

function openLegalModal() {
  if (legalFrame) legalFrame.src = buildLegalUrl();
  legalOverlay?.classList.remove("hidden");
}

function closeLegalModal() {
  legalOverlay?.classList.add("hidden");
}

function openEditor(mode, logo = null){
  const _isMobile = window.matchMedia("(max-width:980px)").matches;
  if (_isMobile) {
    void alertModal({ text: t("logoEditor.errors.noMobileEdit") || "Edycja logo nie jest dostępna na urządzeniach mobilnych." });
    return;
  }

  hideAllPanes();
  setEditorShellMode(mode);
  editorMode = mode;
   showToolsForMode(mode);

  // ===== tryb edytora UI =====
  document.body.classList.add("is-editor");
  if (listShell) show(listShell, false);
  show(editorShell, true);

  if (btnBack) btnBack.style.display = "none";
  if (btnCloseEditor) btnCloseEditor.style.display = "";
  document.getElementById("who")?.style.setProperty("display", "none");
  document.getElementById("btnLogout")?.style.setProperty("display", "none");
  document.getElementById("topbarAccountMenu")?.style.setProperty("display", "none");

  // ===== label trybu =====
  const modeLabel = getModeLabel(mode);

  // ===== tytuł w topbarze (1 linia) =====
  updateEditorHeader();

   suppressDirty = true;
  // ===== domyślna nazwa logo =====
  logoName.value = logo ? (logo.name || modeLabel) : modeLabel;

  // ===== sesja zapisu =====
  sessionSavedLogoId = logo ? logo.id : null;
  sessionSavedMode = mode;

  clearDirty();
   suppressDirty = false;
  setEditorMsg("");

  // ===== startowy preview =====
  lastPreviewPayload = logo ? logoToPreviewPayload(logo) : {
    kind: "GLYPH",
    rows: Array.from({ length: 10 }, () => " ".repeat(30))
  };
  updateBigPreviewFromPayload(lastPreviewPayload);

  if (mode === "TEXT"){
    show(paneText, true);
    textEditor.open(logo ? logo.payload : null);
  }

  if (mode === "DRAW"){
    show(paneDraw, true);
    drawEditor.open(logo ? logo.payload : null);
  }

  if (mode === "IMAGE"){
    show(paneImage, true);
    imageEditor.open(logo ? logo.payload : null);
  }
}


async function closeEditor(force = false){
  if (!force && !(await confirmCloseIfDirty())) return;

  if (editorMode === "TEXT") textEditor.close();
  if (editorMode === "DRAW") drawEditor.close();
  if (editorMode === "IMAGE") imageEditor.close();

  editorMode = null;
  setEditorShellMode("");
  hideAllPanes();

  show(editorShell, false);
  if (listShell) show(listShell, true);

  clearDirty();

  document.body.classList.remove("is-editor");
  if (btnBack) btnBack.style.display = "";
  if (btnCloseEditor) btnCloseEditor.style.display = "none";
  document.getElementById("who")?.style.removeProperty("display");
  document.getElementById("btnLogout")?.style.removeProperty("display");
  document.getElementById("topbarAccountMenu")?.style.removeProperty("display");
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
  let name = String(logoName.value || "").trim() || getDefaultLogoName();
  setEditorMsg("");

  try{
    setEditorMsg(t("logoEditor.status.saving"));

    let res = null;

    if (editorMode === "TEXT") res = await textEditor.getCreatePayload();
    if (editorMode === "DRAW") res = await drawEditor.getCreatePayload();
    if (editorMode === "IMAGE") res = await imageEditor.getCreatePayload();

    if (!res || !res.ok){
      setEditorMsg(res?.msg || t("logoEditor.errors.saveFailed"));
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

    // save current mode for future editing (don't overwrite other source fields!)
    if (!patch.payload.source) patch.payload.source = {};
    patch.payload.source.mode = editorMode;

    if (!sessionSavedLogoId) {
      sessionSavedLogoId = await createLogo(patch);
      setEditorMsg(t("logoEditor.status.saved"));
    } else {
      await updateLogo(sessionSavedLogoId, {
        name: patch.name,
        type: patch.type,
        payload: patch.payload,
      });
      setEditorMsg(t("logoEditor.status.updated"));
    }

    clearDirty();
    await refresh();

    setEditorMsg(t("logoEditor.status.saved"));
  } catch (e){
    console.error(e);

    // Jeśli ktoś/refresh jeszcze nie zdążył, a w DB jednak kolizja -> dopnij unikalną i spróbuj raz jeszcze
    if (isUniqueViolation(e)){
      try{
        const fallback = makeUniqueName(logoName.value || getDefaultLogoName(), sessionSavedLogoId);
        logoName.value = fallback;

        // powtórka (jednorazowa)
        setEditorMsg(t("logoEditor.status.fixingName"));
        await handleCreate(); // UWAGA: to wywołanie rekurencyjne jest OK, bo tylko raz wchodzi w tę gałąź
        return;
      } catch (e2){
        console.error(e2);
      }
    }

    void alertModal({ text: t("logoEditor.errors.saveFailedDetailed", { error: e?.message || e }) });
    setEditorMsg(t("logoEditor.errors.saveError"));
  }
}

/* =========================================================
   START
========================================================= */
async function boot(){
   await initI18n({ withSwitcher: true });
   // guardDesktopOnly usunięty – logo editor działa na mobile (bez tworzenia nowych logo)
   const _isMobile = window.matchMedia("(max-width:980px)").matches;
   if (_isMobile && btnCreate) btnCreate.style.display = "none";
   window.matchMedia("(max-width:980px)").addEventListener("change", (mq) => {
     if (btnCreate) btnCreate.style.display = mq.matches ? "none" : "";
   });
   window.addEventListener("i18n:lang", () => {
     if (editorMode) updateEditorHeader();
     renderList();
   });

   currentUser = await requireAuth(withLangParam("../login"));
   guestMode = isGuestUser(currentUser);
   initTopbarAccountDropdown(currentUser, { accountHref: "../account", loginHref: "../login" });

  try{
    await loadFonts();
  } catch (e){
    console.error(e);
    void alertModal({ text: t("logoEditor.errors.fontsLoad") });
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
    TYPE_GLYPH,
    TYPE_PIX,
    show,
  };

   textEditor = initTextEditor(editorCtx);
   drawEditor = initDrawEditor(editorCtx);
   imageEditor = initImageEditor(editorCtx);

  // Updater - sprawdzanie nowej wersji (TYLKO RAZ)
  import('../../js/core/updater.js?v=v2026-04-23T22332').then(m => m.initUpdater()).catch(() => {});

   armNavGuard();

  // topbar
   btnBack?.addEventListener("click", async () => {
     if (shouldBlockNav() && !(await confirmCloseIfDirty())) return;
     location.href = withLangParam("../builder");
   });

   btnCloseEditor?.addEventListener("click", async () => {
     if (!editorMode) return;
     await closeEditor(false);
   });
   
   btnManual?.addEventListener("click", () => {
     if (editorMode) {
       openHelpModal();
       return;
     }
     location.href = buildManualPageUrl();
   });

   btnHelpClose?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeHelpModal(); });
   helpOverlay?.addEventListener("click", (ev) => { if (ev.target === helpOverlay) closeHelpModal(); });

   btnLegal?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); openLegalModal(); });
   btnBackToManual?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeLegalModal(); openHelpModal(); });
   btnLegalClose?.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeLegalModal(); });
   legalOverlay?.addEventListener("click", (ev) => { if (ev.target === legalOverlay) closeLegalModal(); });

   // Guard na niezapisane zmiany przy wylogowaniu przez dropdown
   const btnLogoutMenu = document.getElementById("topbar-account-logout");
   btnLogoutMenu?.addEventListener("click", async (e) => {
     if (!shouldBlockNav()) return;
     e.preventDefault();
     e.stopImmediatePropagation();
     const ok = await confirmModal({ text: t("logoEditor.confirm.logoutUnsaved") });
     if (!ok) return;
     // kontynuuj wylogowanie
     btnLogoutMenu.click();
   }, true); // capture = true, przed handlerem dropdown

   // Import logo — modal z podglądem
   let importLogoParsed = null;

   function logoImportReset() {
     importLogoParsed = null;
     if (logoImportPreviewWrap) logoImportPreviewWrap.style.display = "none";
     if (logoImportErr) { logoImportErr.style.display = "none"; logoImportErr.textContent = ""; }
     if (logoImportProg) logoImportProg.style.display = "none";
     if (btnLogoImportConfirm) btnLogoImportConfirm.disabled = true;
   }

   function openLogoImportModal() {
     logoImportReset();
     if (inpImportLogoFile) inpImportLogoFile.value = "";
     show(logoImportOverlay, true);
   }

   function closeLogoImportModal() {
     show(logoImportOverlay, false);
   }

   inpImportLogoFile?.addEventListener("change", async () => {
     logoImportReset();
     const f = inpImportLogoFile?.files?.[0];
     if (!f) return;
     try {
       const parsed = parseImportJson(await f.text());
       importLogoParsed = { file: f, parsed };
       if (logoImportPreviewCanvas && logoImportPreviewWrap) {
         const w = Math.round(Math.min(600, window.innerWidth * 0.82));
         logoImportPreviewCanvas.width = w;
         logoImportPreviewCanvas.height = Math.round(w * 11 / 26);
         if (parsed.kind === "GLYPH") renderRows30x10ToBig(parsed.rows, logoImportPreviewCanvas);
         else {
           const bits = unpackBitsRowMajorMSB(parsed.pixPayload.bits_b64, DOT_W, DOT_H);
           renderBits150x70ToBig(bits, logoImportPreviewCanvas);
         }
         logoImportPreviewWrap.style.display = "";
       }
       if (btnLogoImportConfirm) btnLogoImportConfirm.disabled = false;
     } catch (e) {
       if (logoImportErr) { logoImportErr.textContent = e?.message || t("logoEditor.errors.invalidJson"); logoImportErr.style.display = ""; }
     }
   });

   btnLogoImportConfirm?.addEventListener("click", async () => {
     if (!importLogoParsed || btnLogoImportConfirm?.disabled) return;
     if (logoImportProg) logoImportProg.style.display = "grid";
     if (btnLogoImportConfirm) btnLogoImportConfirm.disabled = true;
     if (btnLogoImportCancel) btnLogoImportCancel.disabled = true;
     try {
       await importLogoFromFile(importLogoParsed.file);
       await refresh();
       closeLogoImportModal();
       setMsg(t("logoEditor.status.imported"));
     } catch (e) {
       console.error(e);
       if (logoImportErr) { logoImportErr.textContent = t("logoEditor.errors.importFailedDetailed", { error: e?.message || e }); logoImportErr.style.display = ""; }
       if (logoImportProg) logoImportProg.style.display = "none";
       if (btnLogoImportConfirm) btnLogoImportConfirm.disabled = false;
     } finally {
       if (btnLogoImportCancel) btnLogoImportCancel.disabled = false;
     }
   });

   btnLogoImportCancel?.addEventListener("click", () => closeLogoImportModal());
   logoImportOverlay?.addEventListener("mousedown", (e) => { if (e.target === logoImportOverlay) closeLogoImportModal(); });

   btnImport?.addEventListener("click", () => openLogoImportModal());

   // Eksport logo — instant download
   btnExport?.addEventListener("click", async () => {
     if (!selectedKey || selectedKey === "default") return;
     const l = (logos || []).find(x => x.id === selectedKey);
     if (!l) return;
     try {
       if (logoExportOverlay) { if (logoExportBar) logoExportBar.style.width = "50%"; show(logoExportOverlay, true); }
       exportLogoToFile(l);
       if (logoExportBar) logoExportBar.style.width = "100%";
       setTimeout(() => show(logoExportOverlay, false), 300);
     } catch (e) {
       console.error(e);
       show(logoExportOverlay, false);
       void alertModal({ text: t("logoEditor.errors.exportFailedDetailed", { error: e?.message || e }) });
     }
   });


   btnEdit?.addEventListener("click", async () => {
     if (!selectedKey) return;
     const l = (logos || []).find(x => x.id === selectedKey);
     if (!l) return;

     // Stare logo nie mają payload.source - nie można ich bezpiecznie edytować
     if (!l.payload?.source) {
       await alertModal({ text: t("logoEditor.errors.cannotEditOldLogo") || "To logo nie może być edytowane (zostało utworzone przed wprowadzeniem edytora). Utwórz nowe logo." });
       return;
     }

     // Ustal tryb edycji
     const mode = l.payload?.source?.mode ||
                  (l.type === TYPE_GLYPH ? "TEXT" : "DRAW");

     openEditor(mode, l);
   });

   btnPreview?.addEventListener("click", () => {
     if (!selectedKey) return;
     const l = (logos || []).find(x => x.id === selectedKey);
     if (!l) return;
     const payload = logoToPreviewPayload(l);
     openPreviewFullscreen(payload);
   });
   
  // modal wyboru trybu - otwiera modal z nazwą, nie tworzy od razu
  pickText?.addEventListener("click", () => {
    show(createOverlay, false);
    openCreateModal(TYPE_GLYPH, "TEXT");
  });
  pickDraw?.addEventListener("click", () => {
    show(createOverlay, false);
    openCreateModal(TYPE_PIX, "DRAW");
  });
  pickImage?.addEventListener("click", () => {
    show(createOverlay, false);
    openCreateModal(TYPE_PIX, "IMAGE");
  });

  btnPickCancel?.addEventListener("click", () => show(createOverlay, false));
  createOverlay?.addEventListener("click", (ev) => { if (ev.target === createOverlay) show(createOverlay, false); });

  btnCreate?.addEventListener("click", handleCreate);
   
   bigPreview?.addEventListener("click", () => {
     // TEXT: brak modala
     if (editorMode === "TEXT") return;
     const p = lastPreviewPayload || { kind: "GLYPH", rows: defaultLogoRows };
     openPreviewFullscreen(p);
   });

  window.addEventListener("logoeditor:openPreview", (ev) => {
    const payload = ev?.detail;
    if (!payload) return;
    openPreviewFullscreen(payload);
  });

  btnPreviewClose?.addEventListener("click", () => show(previewOverlay, false));
  previewOverlay?.addEventListener("click", (ev) => { if (ev.target === previewOverlay) show(previewOverlay, false); });

  // RENAME modal
  btnRenameCancel?.addEventListener("click", closeRenameModal);
  renameOverlay?.addEventListener("click", (ev) => { if (ev.target === renameOverlay) closeRenameModal(); });
  btnRenameOk?.addEventListener("click", renameOk);
  renameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnRenameOk.click();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeRenameModal();
    }
  });

  await refresh();

  if ("launchQueue" in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
      if (!launchParams.files?.length) return;
      const file = await launchParams.files[0].getFile();
      const dt = new DataTransfer();
      dt.items.add(file);
      if (inpImportLogoFile) {
        inpImportLogoFile.files = dt.files;
        inpImportLogoFile.dispatchEvent(new Event("change"));
      }
      openLogoImportModal();
    });
  }
}

// kuloodporne uruchomienie (działa też przy dynamicznym import())
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", () => boot(), { once: true });
} else if (!window._booted) {
  window._booted = true;
  boot();
}
