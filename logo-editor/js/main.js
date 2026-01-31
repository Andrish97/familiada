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

/* =========================================================
   DOM
========================================================= */
const $ = (id) => document.getElementById(id);

const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBack");

const listShell = $("listShell");
const editorShell = $("editorShell");

const logoName = $("logoName");
const btnCreate = $("btnCreate");
const editorMsg = $("mMsg");

const paneText = $("paneText");
const paneTextPix = $("paneTextPix");
const paneDraw = $("paneDraw");
const paneImage = $("paneImage");

const bigPreview = $("bigPreview");
const bigPreviewFull = $("bigPreviewFull");

const createOverlay = $("createOverlay");
const previewOverlay = $("previewOverlay");
const btnPreviewClose = $("btnPreviewClose");

/* toolbary */
const toolsText = $("toolsText");
const charsInline = $("charsInline");
const toolsTextPix = $("toolsTextPix");
const toolsDraw = $("toolsDraw");
const toolsImage = $("toolsImage");
const imgPanels = $("imgPanels");

/* create modal buttons */
const pickText = $("pickText");
const pickTextPix = $("pickTextPix");
const pickDraw = $("pickDraw");
const pickImage = $("pickImage");
const btnPickCancel = $("btnPickCancel");

/* list buttons */
const grid = $("grid");
const btnPreview = $("btnPreview");
const btnActivate = $("btnActivate");
const btnExport = $("btnExport");
const btnImport = $("btnImport");
const inpImportLogoFile = $("inpImportLogoFile");

const msg = $("msg");

/* =========================================================
   UI helpers
========================================================= */
function show(el, on){
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setMsg(t){
  if (msg) msg.textContent = t || "";
}

function setEditorMsg(t){
  if (editorMsg) editorMsg.textContent = t || "";
}

function setBodyEditor(on){
  document.body.classList.toggle("is-editor", !!on);
}

function hideAllPanes(){
  show(paneText, false);
  show(paneTextPix, false);
  show(paneDraw, false);
  show(paneImage, false);
}

/* =========================================================
   TOOLBARS (twardo przełączane)
========================================================= */
function hideAllToolbars(){
  show(toolsText, false);
  show(charsInline, false);
  show(toolsTextPix, false);
  show(toolsDraw, false);
  show(toolsImage, false);
  show(imgPanels, false);
}

function showToolbarsForMode(mode){
  hideAllToolbars();

  if (mode === "TEXT") {
    show(toolsText, true);
    // charsInline pokazuje tylko text.js toggle'uje
  }
  if (mode === "TEXT_PIX") {
    show(toolsTextPix, true);
  }
  if (mode === "DRAW") {
    show(toolsDraw, true);
  }
  if (mode === "IMAGE") {
    show(toolsImage, true);
    // imgPanels image.js sam otwiera panel -> tu tylko kontener istnieje
    show(imgPanels, true);
  }
}

/* =========================================================
   PREVIEW RENDER (stub: w Twoim pliku jest już)
   Zostawiamy Twoje istniejące renderery.
========================================================= */
function renderRows30x10ToBig(rows, canvas){
  // ta funkcja jest w Twoim main.js (zostaje)
  // placeholder tylko po to, żeby nie mieszać tu Twojej logiki
}

function renderBits150x70ToBig(bits, canvas){
  // jw.
}

/* =========================================================
   DIRTY / close confirm
========================================================= */
let dirty = false;
function markDirty(){ dirty = true; }
function clearDirty(){ dirty = false; }

function confirmCloseIfDirty(){
  if (!dirty) return true;
  return confirm("Masz niezapisane zmiany. Na pewno zamknąć edytor?");
}

/* =========================================================
   AUTH
========================================================= */
await requireAuth();

async function refreshWho(){
  const { data } = await sb.auth.getUser();
  who.textContent = data?.user?.email || "—";
}

btnLogout?.addEventListener("click", async () => {
  await signOut();
  location.href = "../index.html";
});

btnBack?.addEventListener("click", () => {
  // w edytorze: zamyka; w liście: wraca
  if (editorShell && editorShell.style.display !== "none") closeEditor(false);
  else location.href = "../builder.html";
});

/* =========================================================
   LIST DATA (Twoje istniejące funkcje — zostają)
   W Twoim pliku jest pełna obsługa Supabase CRUD.
   Tutaj zakładam, że masz:
   - listLogos(), deleteLogo(id), setActiveLogo(id) itd.
========================================================= */
let logos = [];
let selectedLogoId = null;
let editorMode = null;

let sessionSavedLogoId = null;
let sessionSavedMode = null;

function updateListButtons(){
  const on = !!selectedLogoId;
  btnPreview.disabled = !on;
  btnActivate.disabled = !on;
  btnExport.disabled = !on;
}

function renderList(){
  grid.innerHTML = "";
  updateListButtons();

  // ... u Ciebie jest pełny rendering kafelków
}

/* =========================================================
   EDYTORY (moduły)
========================================================= */
const ctx = {
  DOT_W, DOT_H,
  markDirty,
  clearDirty,
  onPreview(payload){
    // payload: { kind:"GLYPH", rows } albo { kind:"PIX", bits }
    updateBigPreviewFromPayload(payload);
  },
  packBitsRowMajorMSB(bits, w, h){
    // w Twoim main.js masz tę funkcję — zostaw swoją implementację
    return "";
  }
};

let textEditor = initTextEditor(ctx);
let textPixEditor = initTextPixEditor(ctx);
let drawEditor = initDrawEditor(ctx);
let imageEditor = initImageEditor(ctx);

let lastPreviewPayload = null;

function updateBigPreviewFromPayload(payload){
  if (!payload) return;
  lastPreviewPayload = payload;

  if (payload.kind === "GLYPH") renderRows30x10ToBig(payload.rows, bigPreview);
  else renderBits150x70ToBig(payload.bits, bigPreview);
}

function openEditor(mode){
  hideAllPanes();
  showToolbarsForMode(mode);

  editorMode = mode;
  sessionSavedLogoId = null;
  sessionSavedMode = mode;

  clearDirty();
  setEditorMsg("");

  // start preview (czyść)
  lastPreviewPayload = { kind: "GLYPH", rows: Array.from({ length: 10 }, () => " ".repeat(30)) };
  updateBigPreviewFromPayload(lastPreviewPayload);

  // pokaż editor
  show(listShell, false);
  show(editorShell, true);
  setBodyEditor(true);

  // default nazwa (możesz nadpisać później)
  logoName.value =
    mode === "TEXT" ? "Napis" :
    mode === "TEXT_PIX" ? "Tekst" :
    mode === "DRAW" ? "Rysunek" :
    "Obraz";

  if (mode === "TEXT"){
    show(paneText, true);
    textEditor.open();
  } else if (mode === "TEXT_PIX"){
    show(paneTextPix, true);
    textPixEditor.open();
  } else if (mode === "DRAW"){
    show(paneDraw, true);
    drawEditor.open();
  } else if (mode === "IMAGE"){
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

  hideAllPanes();
  hideAllToolbars();
  clearDirty();

  show(editorShell, false);
  show(listShell, true);
  setBodyEditor(false);
}

/* =========================================================
   CREATE MODAL
========================================================= */
function openCreateModal(){
  show(createOverlay, true);
}
function closeCreateModal(){
  show(createOverlay, false);
}

pickText?.addEventListener("click", () => { closeCreateModal(); openEditor("TEXT"); });
pickTextPix?.addEventListener("click", () => { closeCreateModal(); openEditor("TEXT_PIX"); });
pickDraw?.addEventListener("click", () => { closeCreateModal(); openEditor("DRAW"); });
pickImage?.addEventListener("click", () => { closeCreateModal(); openEditor("IMAGE"); });
btnPickCancel?.addEventListener("click", () => closeCreateModal());

/* =========================================================
   PREVIEW OVERLAY
========================================================= */
btnPreviewClose?.addEventListener("click", () => show(previewOverlay, false));
btnPreview?.addEventListener("click", () => {
  if (!lastPreviewPayload) return;
  show(previewOverlay, true);
  if (lastPreviewPayload.kind === "GLYPH") renderRows30x10ToBig(lastPreviewPayload.rows, bigPreviewFull);
  else renderBits150x70ToBig(lastPreviewPayload.bits, bigPreviewFull);
});

/* =========================================================
   SAVE (zostawiasz swoją logikę Supabase)
========================================================= */
btnCreate?.addEventListener("click", async () => {
  // u Ciebie jest zapis -> tu zostawiasz swój kod
  // po udanym zapisie:
  // clearDirty();
});

/* =========================================================
   INIT
========================================================= */
await refreshWho();
// await refresh();  // u Ciebie: pobranie listy
hideAllToolbars();
