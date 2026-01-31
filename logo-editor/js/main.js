// familiada/logo-editor/js/main.js
// Główna logika strony + lista kafelków + routing do edytorów.

import { sb } from "../../js/core/supabase.js";
import { requireAuth, signOut } from "../../js/core/auth.js";

import { initTextEditor } from "./text.js";
import { initTextPixEditor } from "./text-pix.js";
import { initDrawEditor } from "./draw.js";
import { initImageEditor } from "./image.js";

/* =========================================================
   CONSTS / CANVAS
========================================================= */
const TYPE_GLYPH = "GLYPH_30x10";
const TYPE_PIX = "PIX_150x70";

const TILES_X = 30;
const TILES_Y = 10;
const DOT_W = 150; // 30*5
const DOT_H = 70;  // 10*7

// 208x88 (7x9 siatka z przerwami) – zgodnie z Twoim text-pix.js
const BIG_W = 208;
const BIG_H = 88;

/* =========================================================
   DOM
========================================================= */
const $ = (id) => document.getElementById(id);

const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBack");

const listShell = $("listShell");
const editorShell = $("editorShell");
const editorToolbar = $("editorToolbar");

const grid = $("grid");
const hint = $("hint");
const msg = $("msg");

const btnPreview = $("btnPreview");
const btnActivate = $("btnActivate");

const btnExport = $("btnExport");
const btnImport = $("btnImport");
const inpImportLogoFile = $("inpImportLogoFile");

const logoName = $("logoName");
const btnCreate = $("btnCreate");
const mMsg = $("mMsg");

/* tools/panes */
const toolsText = $("toolsText");
const charsInline = $("charsInline");
const toolsTextPix = $("toolsTextPix");
const toolsDraw = $("toolsDraw");
const toolsImage = $("toolsImage");
const imgPanels = $("imgPanels");

const paneText = $("paneText");
const paneTextPix = $("paneTextPix");
const paneDraw = $("paneDraw");
const paneImage = $("paneImage");

const createOverlay = $("createOverlay");
const previewOverlay = $("previewOverlay");

const pickText = $("pickText");
const pickTextPix = $("pickTextPix");
const pickDraw = $("pickDraw");
const pickImage = $("pickImage");
const btnPickCancel = $("btnPickCancel");
const btnPreviewClose = $("btnPreviewClose");

/* =========================================================
   HELPERS
========================================================= */
function show(el, on) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setBodyEditor(on) {
  document.body.classList.toggle("is-editor", !!on);
}

function setTopBackButtonForEditor(isEditor) {
  if (!btnBack) return;
  if (isEditor) {
    btnBack.textContent = "✕";
    btnBack.title = "Zamknij edytor";
  } else {
    btnBack.textContent = "← Moje gry";
    btnBack.title = "";
  }
}

function hideAllToolsAndPanes() {
  // tool rows
  show(toolsText, false);
  show(charsInline, false);
  show(toolsTextPix, false);
  show(toolsDraw, false);
  show(toolsImage, false);
  show(imgPanels, false);

  // panes
  show(paneText, false);
  show(paneTextPix, false);
  show(paneDraw, false);
  show(paneImage, false);
}

function openOverlay(ov) { if (ov) ov.style.display = "grid"; }
function closeOverlay(ov) { if (ov) ov.style.display = "none"; }

function setMsg(text = "", kind = "") {
  if (!msg) return;
  msg.textContent = String(text || "");
  msg.className = "msg " + (kind || "");
}

function setMiniMsg(text = "") {
  if (!mMsg) return;
  mMsg.textContent = String(text || "");
}

/* =========================================================
   BITPACK (dla zapisu do bazy / exportu)
========================================================= */
function packBitsRowMajorMSB(bits, w, h) {
  const bytes = new Uint8Array(Math.ceil((w * h) / 8));
  let bi = 0;

  for (let i = 0; i < w * h; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) {
      const v = bits[i + k] ? 1 : 0;
      b |= (v << (7 - k));
    }
    bytes[bi++] = b;
  }
  return btoa(String.fromCharCode(...bytes));
}

/* =========================================================
   PREVIEW (wspólny)
========================================================= */
function clearCanvas(c) {
  if (!c) return;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
}

// bardzo prosty renderer podglądu – zakładam, że Twoje moduły już renderują na canvasach
function onPreview(_payload) {
  // tutaj nic nie musimy robić – moduły (text/draw/image) zwykle same rysują
}

/* =========================================================
   EDITORS INIT
========================================================= */
const ctx = {
  DOT_W, DOT_H, BIG_W, BIG_H,
  packBitsRowMajorMSB,
  onPreview,
  markDirty: () => dirtyMark(),
  clearDirty: () => dirtyClear(),
};

let textEditor = null;
let textPixEditor = null;
let drawEditor = null;
let imageEditor = null;

let dirty = false;
function dirtyMark() { dirty = true; }
function dirtyClear() { dirty = false; }

function ensureEditors() {
  if (!textEditor) textEditor = initTextEditor(ctx);
  if (!textPixEditor) textPixEditor = initTextPixEditor(ctx);
  if (!drawEditor) drawEditor = initDrawEditor(ctx);
  if (!imageEditor) imageEditor = initImageEditor(ctx);
}

/* =========================================================
   VIEW ROUTING (LIST <-> EDITOR)
========================================================= */
let currentMode = null; // "TEXT"|"TEXT_PIX"|"DRAW"|"IMAGE"

function showListView() {
  setBodyEditor(false);
  setTopBackButtonForEditor(false);

  closeOverlay(createOverlay);
  closeOverlay(previewOverlay);

  hideAllToolsAndPanes();
  show(editorShell, false);
  show(listShell, true);

  currentMode = null;
}

async function showEditorView(mode) {
  ensureEditors();

  setBodyEditor(true);
  setTopBackButtonForEditor(true);

  show(listShell, false);
  show(editorShell, true);

  hideAllToolsAndPanes();
  setMiniMsg("");

  currentMode = mode;

  if (mode === "TEXT") {
    show(toolsText, true);
    show(paneText, true);
    await textEditor.open?.();
  } else if (mode === "TEXT_PIX") {
    show(toolsTextPix, true);
    show(paneTextPix, true);
    await textPixEditor.open?.();
  } else if (mode === "DRAW") {
    show(toolsDraw, true);
    show(paneDraw, true);
    await drawEditor.open?.();
  } else if (mode === "IMAGE") {
    show(toolsImage, true);
    show(imgPanels, true);
    show(paneImage, true);
    await imageEditor.open?.();
  }
}

/* =========================================================
   AUTH UI
========================================================= */
async function refreshAuthUi() {
  try {
    if (!sb || !sb.auth || typeof sb.auth.getUser !== "function") {
      console.error("[logo-editor] Supabase client (sb) not ready. Check supabase-js script load order.");
      if (who) who.textContent = "—";
      setMiniMsg?.("Błąd: Supabase nie jest gotowe (sprawdź kolejność scriptów).");
      return;
    }

    const { data, error } = await sb.auth.getUser();
    if (error) {
      console.error("[logo-editor] sb.auth.getUser error:", error);
      if (who) who.textContent = "—";
      return;
    }

    const u = data?.user;
    if (who) who.textContent = u?.email || "—";
  } catch (e) {
    console.error("[logo-editor] refreshAuthUi failed:", e);
    if (who) who.textContent = "—";
  }
}

/* =========================================================
   BIND UI
========================================================= */
function bindUi() {
  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "../index.html";
  });

  btnBack?.addEventListener("click", () => {
    // w edytorze to ma działać jak ✕
    if (document.body.classList.contains("is-editor")) {
      showListView();
    } else {
      location.href = "../games.html";
    }
  });

  // modal trybów
  pickText?.addEventListener("click", async () => { closeOverlay(createOverlay); await showEditorView("TEXT"); });
  pickTextPix?.addEventListener("click", async () => { closeOverlay(createOverlay); await showEditorView("TEXT_PIX"); });
  pickDraw?.addEventListener("click", async () => { closeOverlay(createOverlay); await showEditorView("DRAW"); });
  pickImage?.addEventListener("click", async () => { closeOverlay(createOverlay); await showEditorView("IMAGE"); });
  btnPickCancel?.addEventListener("click", () => closeOverlay(createOverlay));

  btnPreviewClose?.addEventListener("click", () => closeOverlay(previewOverlay));

  // import/export (hooki – docelowo Twoja logika bazy)
  btnImport?.addEventListener("click", () => inpImportLogoFile?.click?.());
  inpImportLogoFile?.addEventListener("change", async () => {
    // tu zostawiamy Twoją logikę importu – ten plik tylko podpina UI
    // (ważne: nie wywalaj selection, tylko obsłuż to w swoim imporcie)
  });

  btnCreate?.addEventListener("click", async () => {
    // tu zostawiamy Twoją logikę zapisu – ten plik tylko podpina UI
    setMiniMsg("Zapis…");
    setTimeout(() => setMiniMsg(""), 900);
  });

  // demo: otwarcie modala trybu (to jest Twój „Nowe logo” flow – podłącz jak chcesz)
  // jeśli masz osobny kafelek „+”, to on powinien robić openOverlay(createOverlay)
}

/* =========================================================
   INIT
========================================================= */
(async function boot(){
  await requireAuth();
  bindUi();
  await refreshAuthUi();

  // start w liście
  showListView();

  // jeśli chcesz automatycznie pokazać modal „Nowe logo”:
  // openOverlay(createOverlay);
})();
