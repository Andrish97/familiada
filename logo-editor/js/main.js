// familiada/logo-editor/js/main.js
// Strona edytora logo: lista kafelków, modale (nowe / nazwa / import /
// podgląd), otwieranie edytorów trybów i zapis.
//
// Moduły:
//   render.js       – format bitów i podgląd „jak na wyświetlaczu”
//   db.js           – tabela user_logos + pliki w Storage
//   transfer.js     – eksport/import .famlogo
//   preview-zoom.js – pinch-zoom pełnoekranowego podglądu
//   text.js / draw.js / image.js – edytory trybów (wspólne API: open/close/getCreatePayload)

import { addRenameGesture } from "../../js/core/rename-gesture.js?v=v2026-09-26T19541";
import { loadFont5x7, buildLogoPreviewCanvas } from "../../js/core/logo-preview.js?v=v2026-09-26T19541";
import { requireAuth } from "../../js/core/auth.js?v=v2026-09-26T19541";
import { alertModal, confirmModal } from "../../js/core/modal.js?v=v2026-09-26T19541";
import { getUiLang, initI18n, t, withLangParam } from "../../translation/translation.js?v=v2026-09-26T19541";
import { initTopbarAccountDropdown } from "../../js/core/topbar-controller.js?v=v2026-09-26T19541";
import { isMobileDevice } from "../../js/core/pwa.js?v=v2026-09-26T19541";
import { isPhoneScreen } from "../../js/core/device-guard.js?v=v2026-09-26T19541";
import { v as cacheBust } from "../../js/core/cache-bust.js?v=v2026-09-26T19541";
import { guardResourceLock, acquireResourceLock, isResourceBusy, findBusyContext } from "../../js/core/resource-lock.js?v=v2026-09-26T19541";
import { enterModalSheet, exitModalSheet, isSheetViewport, handleSheetBack } from "../../js/core/modal-sheet.js?v=v2026-09-26T19541";
import { icon } from "../../js/core/icons.js?v=v2026-09-26T19541";

import { TYPE_GLYPH, emptyRows, normalizeRows, renderPreview, logoToPreview } from "./render.js?v=v2026-09-26T19541";
import { listLogos, fetchLogo, createLogo, updateLogo, deleteLogo, isUniqueViolation } from "./db.js?v=v2026-09-26T19541";
import { buildExport, downloadJson, parseImport, safeFileName } from "./transfer.js?v=v2026-09-26T19541";
import { initPreviewPinchZoom, lockPageZoomForPreview, unlockPageZoomAfterPreview } from "./preview-zoom.js?v=v2026-09-26T19541";
import { initTextEditor, decompileRows } from "./text.js?v=v2026-09-26T19541";
import { initDrawEditor } from "./draw.js?v=v2026-09-26T19541";
import { initImageEditor } from "./image.js?v=v2026-09-26T19541";

const FONT_3x10_URL = "display/font_3x10.json?v=v2026-09-26T19541";
const FONT_5x7_URL = "display/font_5x7.json?v=v2026-09-26T19541";
// Edycja wymaga miejsca na pasek narzędzi i scenę -- na telefonie dostępna
// jest tylko lista (podgląd, import/eksport, nazwa, usuwanie). Telefon wg
// wspólnej reguły isPhoneScreen() (js/core/device-guard.js): krótszy bok
// ekranu, więc tablet edytuje w poziomie i w pionie (także po obrocie
// w trakcie), a telefon w żadnej orientacji.

/* =========================================================
   DOM
========================================================= */
const $ = (id) => document.getElementById(id);
const el = {
  brandTitle: $("brandTitle"),
  btnBack: $("btnBack"),
  btnManual: $("btnManual"),
  btnCloseEditor: $("btnCloseEditor"),
  helpOverlay: $("helpOverlay"),
  helpFrame: $("helpFrame"),
  legalOverlay: $("legalOverlay"),
  legalFrame: $("legalFrame"),

  listShell: $("listShell"),
  grid: $("grid"),
  btnEdit: $("btnEdit"),
  btnPreview: $("btnPreview"),
  btnExport: $("btnExport"),
  btnImport: $("btnImport"),

  editorShell: $("editorShell"),
  logoName: $("logoName"),
  btnSave: $("btnCreate"),
  bigPreview: $("bigPreview"),
  panes: { TEXT: $("paneText"), DRAW: $("paneDraw"), IMAGE: $("paneImage") },
  tools: { TEXT: [$("toolsText"), $("charsInline")], DRAW: [$("toolsDraw")], IMAGE: [$("toolsImage"), $("imgPanels")] },

  createOverlay: $("createOverlay"),
  renameOverlay: $("renameOverlay"),
  renameTitle: $("renameTitle"),
  renameSub: $("renameSub"),
  renameInput: $("renameInput"),
  renameMsg: $("renameMsg"),
  btnRenameOk: $("btnRenameOk"),

  importOverlay: $("logoImportOverlay"),
  importFile: $("inpImportLogoFile"),
  importPreviewWrap: $("logoImportPreviewWrap"),
  importPreviewCanvas: $("logoImportPreviewCanvas"),
  importErr: $("logoImportErr"),
  importProg: $("logoImportProg"),
  importStep: $("logoImportStep"),
  importBar: $("logoImportBar"),
  btnImportConfirm: $("btnLogoImportConfirm"),
  btnImportCancel: $("btnLogoImportCancel"),

  exportOverlay: $("logoExportOverlay"),
  exportBar: $("logoExportBar"),

  previewOverlay: $("previewOverlay"),
  previewCanvas: $("bigPreviewFull"),
};

/* =========================================================
   STAN
========================================================= */
let currentUser = null;
let logos = [];          // lekka lista (bez fabricData/obrazów) -- patrz db.listLogos
let selectedId = null;

let FONT_3x10 = null;    // znak -> [10 wierszy]
let GLYPH_5x7 = null;    // Map znak -> [7 intów]

// Otwarty edytor. editingId == null => logo jeszcze nie zapisane (powstaje przy pierwszym „Zapisz”).
let editorMode = null;   // TEXT | DRAW | IMAGE
let editingId = null;
let editorDirty = false;
let saving = false;
let logoLock = null;     // blokada „logo edytowane w tej karcie” (resource-lock)
let lastPreview = null;

let editors = null;      // { TEXT, DRAW, IMAGE }

/* =========================================================
   Drobne pomocnicze
========================================================= */
function show(node, on) {
  if (!node) return;
  node.hidden = !on;
  node.style.display = on ? "" : "none";
}

// Bez stałych napisów statusu („Usunięto.”, „Zapisano.”): wynik widać na
// liście i na przycisku Zapisz (nieaktywny = wszystko zapisane), a błędy
// i komunikaty, na które trzeba zareagować, idą w okienko.
const isPhone = isPhoneScreen;
document.documentElement.classList.toggle("le-phone", isPhone());
const defaultName = () => t("logoEditor.defaults.logoName");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const lang = document.documentElement.lang || "pl";
  const locale = lang.startsWith("en") ? "en-US" : lang.startsWith("uk") ? "uk-UA" : "pl-PL";
  return d.toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Nazwa niekolidująca (bez względu na wielkość liter) z innymi logo użytkownika. */
function makeUniqueName(baseName, excludeId = null) {
  const base = String(baseName || "").trim() || defaultName();
  const used = new Set(logos.filter((l) => l.id !== excludeId).map((l) => String(l.name || "").trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; i < 10000; i++) {
    const cand = `${base} (${i})`;
    if (!used.has(cand.toLowerCase())) return cand;
  }
  return `${base} (${Date.now()})`;
}

/** Komunikat dla odmowy z RPC *_checked -- tylko POWÓD, nigdy która to strona. */
function busyMessage(reason) {
  if (reason === "control") return t("resourceLock.logoPoolBusyControl");
  if (reason === "settings") return t("resourceLock.logoPoolBusySettings");
  return t("resourceLock.logoMessage");
}

function modeLabel(mode) {
  return t(`logoEditor.modes.${String(mode || "image").toLowerCase()}`);
}

/* =========================================================
   Modale (overlay + tryb „sheet” na telefonie)
========================================================= */
function openOverlay(overlay, onClose) {
  show(overlay, true);
  enterModalSheet(overlay, { backBtn: el.btnBack, onClose });
}

function closeOverlay(overlay) {
  show(overlay, false);
  exitModalSheet(overlay);
}

// Klik w tło zamyka -- oprócz trybu sheet na telefonie (tam modal zastępuje
// stronę i jedynym wyjściem ma być widoczny przycisk).
function closeOnBackdrop(overlay, close) {
  overlay?.addEventListener("click", (ev) => {
    if (ev.target !== overlay) return;
    if (overlay.classList.contains("modal--sheet") && isSheetViewport()) return;
    close();
  });
}

/* =========================================================
   Podgląd
========================================================= */
let previewZoom = null;

function openPreview(preview) {
  renderPreview(preview, el.previewCanvas, GLYPH_5x7);
  // Tablety z Chrome przedstawiają się jak desktop -- sprawdzamy też dotyk.
  const touch = isMobileDevice() || navigator.maxTouchPoints > 0 || window.matchMedia?.("(pointer: coarse)").matches;
  el.previewOverlay.querySelector(".modal")?.classList.toggle("is-touch", !!touch);
  previewZoom ??= initPreviewPinchZoom(el.previewOverlay.querySelector(".previewModalCanvas"), el.previewCanvas);
  previewZoom.reset();
  lockPageZoomForPreview();
  openOverlay(el.previewOverlay, closePreview);
}

function closePreview() {
  closeOverlay(el.previewOverlay);
  unlockPageZoomAfterPreview();
  previewZoom?.reset();
}

function onEditorPreview(preview) {
  if (!preview) return;
  lastPreview = preview;
  renderPreview(preview, el.bigPreview, GLYPH_5x7);
}

/* =========================================================
   Lista kafelków
========================================================= */
async function refresh() {
  logos = await listLogos();
  if (selectedId && !logos.some((l) => l.id === selectedId)) selectedId = null;
  renderList();
}

function selectTile(id) {
  selectedId = id;
  for (const tile of el.grid.querySelectorAll(".logoTile")) {
    tile.classList.toggle("is-selected", tile.dataset.key === String(id || ""));
  }
  updateListButtons();
}

function updateListButtons() {
  const has = !!selectedId;
  el.btnPreview.disabled = !has;
  el.btnEdit.disabled = !has;
  el.btnExport.disabled = !has;
}

function makeTile(logo) {
  const name = logo.name || t("logoEditor.defaults.unnamed");
  const tile = document.createElement("div");
  tile.className = "logoTile";
  tile.dataset.key = logo.id;
  tile.classList.toggle("is-selected", logo.id === selectedId);
  tile.innerHTML = `
    <div class="logoTileTop">
      <div style="min-width:0">
        <div class="logoName" title="${esc(name)}">${esc(name)}</div>
        <div class="logoMeta">${esc(fmtDate(logo.updated_at))}</div>
      </div>
      <div class="logoActions">
        <div class="logoX" role="button" tabindex="0" title="${esc(t("logoEditor.list.delete"))}" aria-label="${esc(t("logoEditor.list.delete"))}">${icon("trash")}</div>
      </div>
    </div>
    <div class="logoPrev"></div>`;

  tile.addEventListener("click", () => selectTile(logo.id));
  addRenameGesture(tile, (e) => {
    if (!e.target?.closest(".logoActions")) openRenameModal(logo);
  });
  tile.querySelector(".logoX").addEventListener("click", (ev) => {
    ev.stopPropagation();
    void removeLogo(logo, name);
  });
  return tile;
}

function renderList() {
  el.grid.innerHTML = "";

  const add = document.createElement("div");
  add.className = "addCard le-edit-only";
  add.innerHTML = `
    <div class="plus">${icon("plus")}</div>
    <div class="txt">${esc(t("logoEditor.create.title"))}</div>
    <div class="sub">${esc(t("logoEditor.create.subtitle"))}</div>`;
  add.addEventListener("click", () => openOverlay(el.createOverlay, () => closeOverlay(el.createOverlay)));
  el.grid.appendChild(add);

  // Najpierw same kafelki, miniatury po kolei w wolnych chwilach -- przy
  // wielu logo nie blokujemy pierwszego wyrenderowania listy.
  const queue = [];
  for (const logo of logos) {
    const tile = makeTile(logo);
    el.grid.appendChild(tile);
    queue.push({ wrap: tile.querySelector(".logoPrev"), logo });
  }
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));
  const next = () => {
    const item = queue.shift();
    if (!item) return;
    if (item.wrap.isConnected) item.wrap.appendChild(buildLogoPreviewCanvas(item.logo, GLYPH_5x7, 520, 240));
    idle(next);
  };
  idle(next);

  updateListButtons();
}

async function removeLogo(logo, name) {
  if (!(await confirmModal({ text: t("logoEditor.confirm.deleteLogo", { name }) }))) return;
  try {
    await deleteLogo(logo.id);
    await refresh();
  } catch (e) {
    console.error(e);
    void alertModal({
      text: e?.code === "RESOURCE_IN_USE" ? busyMessage(e.reason) : t("logoEditor.errors.deleteFailed", { error: e?.message || e }),
    });
  }
}

/* =========================================================
   Modal nazwy: zmiana nazwy istniejącego / nazwa nowego logo
========================================================= */
let nameModal = null; // { kind:"rename", logo } | { kind:"create", mode }

function openNameModal(state) {
  nameModal = state;
  const creating = state.kind === "create";
  el.renameTitle.textContent = t(creating ? "logoEditor.create.nameModalTitle" : "logoEditor.rename.title");
  el.renameSub.textContent = t(creating ? "logoEditor.create.nameModalSub" : "logoEditor.rename.sub");
  el.renameInput.value = creating ? makeUniqueName(modeLabel(state.mode)) : state.logo.name || "";
  el.renameMsg.textContent = "";
  openOverlay(el.renameOverlay, closeNameModal);
  setTimeout(() => el.renameInput.select(), 0);
}

const openRenameModal = (logo) => openNameModal({ kind: "rename", logo });

function closeNameModal() {
  nameModal = null;
  closeOverlay(el.renameOverlay);
}

async function confirmNameModal() {
  if (!nameModal || el.btnRenameOk.disabled) return;
  const name = el.renameInput.value.trim();
  if (!name) {
    el.renameMsg.textContent = t("logoEditor.rename.emptyError");
    return;
  }

  if (nameModal.kind === "create") {
    const { mode } = nameModal;
    closeNameModal();
    await openEditor(mode, null, makeUniqueName(name));
    return;
  }

  const { logo } = nameModal;
  el.btnRenameOk.disabled = true;
  el.renameMsg.textContent = "";
  try {
    // To konkretne logo może być właśnie edytowane w innej karcie -- wtedy
    // zmiana nazwy stąd nadpisałaby jej zapis. (Zajętość całej puli sprawdza RPC.)
    if (await isResourceBusy("logo", logo.id)) {
      el.renameMsg.textContent = t("resourceLock.logoMessage");
      return;
    }
    if (name !== logo.name) await updateLogo(logo.id, { name: makeUniqueName(name, logo.id) });
    await refresh();
    closeNameModal();
  } catch (e) {
    console.error(e);
    el.renameMsg.textContent = e?.code === "RESOURCE_IN_USE" ? busyMessage(e.reason) : t("logoEditor.rename.failed");
  } finally {
    el.btnRenameOk.disabled = false;
  }
}

/* =========================================================
   Edytor: otwieranie / zamykanie
========================================================= */
function updateEditorHeader() {
  if (!editorMode) return;
  const prefix = t(editingId ? "logoEditor.editor.editLogoPrefix" : "logoEditor.editor.newLogoPrefix");
  el.brandTitle.innerHTML = `<span class="bMain">${esc(prefix)}</span><span class="bMode">${esc(modeLabel(editorMode))}</span>`;
}

function markDirty() { editorDirty = true; syncSaveButton(); }
function clearDirty() { editorDirty = false; syncSaveButton(); }

/**
 * Zapisz: aktywny, gdy jest co zapisać (nowe logo jeszcze nie w bazie albo
 * niezapisane zmiany); w trakcie zapisu „Zapisuję…”. Zastępuje napis
 * „Zapisano.” obok przycisku.
 */
function syncSaveButton() {
  if (!el.btnSave) return;
  el.btnSave.disabled = saving || (!!editingId && !editorDirty);
  el.btnSave.textContent = t(saving ? "logoEditor.status.saving" : "logoEditor.editor.save");
  el.btnSave.setAttribute("aria-busy", saving ? "true" : "false");
}

/**
 * Tryb edycji zapisanego logo. GLYPH to zawsze Tekst; PIX -- Obraz, jeśli ma
 * obraz źródłowy, w pozostałych przypadkach Rysunek (także stare logo i demo
 * bez source: ich kropki trafiają na scenę jako warstwa obrazu).
 */
function editModeFor(logo) {
  if (logo.type === TYPE_GLYPH) return "TEXT";
  const src = logo.payload?.source || {};
  if (src.mode === "IMAGE" || src.imageUrl || src.imageData) return "IMAGE";
  return "DRAW";
}

/** Powód odmowy edycji albo null. Jedyny przypadek: napis, którego nie da się odtworzyć. */
function cannotEditReason(logo, mode) {
  if (mode !== "TEXT" || typeof logo.payload?.source?.text === "string") return null;
  const rows = logo.payload?.layers?.[0]?.rows;
  if (!normalizeRows(rows).join("").trim()) return null;
  return decompileRows(rows, FONT_3x10) == null ? t("logoEditor.errors.noSourceText") : null;
}

async function editSelected() {
  if (!selectedId) return;
  if (isPhone()) {
    void alertModal({ text: t("logoEditor.errors.noMobileEdit") });
    return;
  }
  let logo;
  try {
    logo = await fetchLogo(selectedId);
  } catch (e) {
    console.error(e);
    void alertModal({ text: t("logoEditor.errors.loadFailed", { error: e?.message || e }) });
    return;
  }
  const mode = editModeFor(logo);
  const reason = cannotEditReason(logo, mode);
  if (reason) {
    void alertModal({ text: reason });
    return;
  }
  await openEditor(mode, logo);
}

/** logo == null => nowe logo o nazwie newName (w bazie powstanie przy pierwszym zapisie). */
async function openEditor(mode, logo, newName = "") {
  if (isPhone()) {
    void alertModal({ text: t("logoEditor.errors.noMobileEdit") });
    return;
  }

  // Cała pula logo jest zajęta, gdy Control albo ustawienia którejś gry są
  // otwarte (zapis i tak zablokuje RPC -- mówimy o tym od razu).
  const busy = await findBusyContext("game", ["settings", "control"]).catch(() => null);
  if (busy) {
    void alertModal({ text: busyMessage(busy) });
    return;
  }
  if (logo) {
    // To logo edytowane w innej karcie -> pełnoekranowy komunikat (jak w editor.js).
    const lock = await guardResourceLock({
      resourceType: "logo",
      resourceId: logo.id,
      context: "logo-editor",
      message: t("resourceLock.logoMessage"),
      backHref: location.href,
    });
    if (!lock.ok) return;
    logoLock = lock;
  }

  editorMode = mode;
  editingId = logo?.id || null;
  el.editorShell.dataset.mode = mode;
  for (const [m, pane] of Object.entries(el.panes)) show(pane, m === mode);
  for (const [m, nodes] of Object.entries(el.tools)) nodes.forEach((n) => show(n, m === mode));

  document.body.classList.add("is-editor", "topbar-no-menu");
  show(el.listShell, false);
  show(el.editorShell, true);
  show(el.btnBack, false);
  show(el.btnCloseEditor, true);
  updateEditorHeader();

  el.logoName.value = logo ? logo.name || "" : newName;
  syncSaveButton();
  onEditorPreview(logo ? logoToPreview(logo) : { kind: "GLYPH", rows: emptyRows() });

  editors[mode].open(logo?.payload || null);
  clearDirty();
  pushEditorHistory();
}

async function closeEditor({ force = false, fromHistory = false } = {}) {
  if (!editorMode) return;
  if (!force && editorDirty && !(await confirmModal({ text: t("logoEditor.confirm.closeUnsaved") }))) return false;

  editors[editorMode].close();
  logoLock?.release();
  logoLock = null;
  editorMode = null;
  editingId = null;
  clearDirty();

  el.editorShell.dataset.mode = "";
  Object.values(el.panes).forEach((p) => show(p, false));
  show(el.editorShell, false);
  show(el.listShell, true);
  document.body.classList.remove("is-editor", "topbar-no-menu");
  show(el.btnBack, true);
  show(el.btnCloseEditor, false);
  el.brandTitle.textContent = "FAMILIADA";

  if (!fromHistory) popEditorHistory();
  return true;
}

/* =========================================================
   Historia przeglądarki: „Wstecz” w edytorze = zamknij edytor
   (z pytaniem o niezapisane zmiany); na liście -- zwykłe wyjście ze strony.
========================================================= */
let ignoreNextPop = false;

function pushEditorHistory() {
  try { history.pushState({ logoEditor: "editor" }, "", location.href); } catch {}
}

function popEditorHistory() {
  if (history.state?.logoEditor !== "editor") return;
  ignoreNextPop = true;
  history.back();
}

window.addEventListener("popstate", async () => {
  if (ignoreNextPop) { ignoreNextPop = false; return; }
  if (!editorMode) return;
  const closed = await closeEditor({ fromHistory: true });
  if (closed === false) pushEditorHistory(); // anulowano -- zostajemy w edytorze
});

window.addEventListener("beforeunload", (e) => {
  if (!editorMode || !editorDirty) return;
  e.preventDefault();
  e.returnValue = "";
});

/* =========================================================
   Zapis
========================================================= */
async function saveEditor() {
  if (!editorMode || saving) return;
  saving = true;
  syncSaveButton();

  try {
    const res = await editors[editorMode].getCreatePayload();
    if (!res?.ok) {
      void alertModal({ text: res?.msg || t("logoEditor.errors.saveFailed") });
      return;
    }
    const payload = res.payload;
    payload.source = { ...(payload.source || {}), mode: editorMode };

    let name = makeUniqueName(el.logoName.value.trim() || defaultName(), editingId);
    for (let attempt = 0; ; attempt++) {
      try {
        if (editingId) {
          await updateLogo(editingId, { name, type: res.type, payload });
        } else {
          editingId = await createLogo({ user_id: currentUser.id, name, type: res.type, payload });
          const lock = await acquireResourceLock({ resourceType: "logo", resourceId: editingId, context: "logo-editor" });
          if (lock?.ok) logoLock = lock;
        }
        break;
      } catch (e) {
        // Nazwa zajęta przez logo, którego lokalna lista jeszcze nie zna
        // (np. utworzone w innej karcie) -- odśwież i spróbuj raz jeszcze.
        if (!isUniqueViolation(e) || attempt > 0) throw e;
        logos = await listLogos();
        const next = makeUniqueName(name, editingId);
        name = next !== name ? next : `${name} (${Date.now() % 100000})`;
      }
    }

    el.logoName.value = name;
    clearDirty();
    await editors[editorMode].onSaved?.();
    updateEditorHeader();
    await refresh();
    selectTile(editingId);
  } catch (e) {
    console.error(e);
    void alertModal({
      text: e?.code === "RESOURCE_IN_USE" ? busyMessage(e.reason) : t("logoEditor.errors.saveFailedDetailed", { error: e?.message || e }),
    });
  } finally {
    saving = false;
    syncSaveButton();
  }
}

/* =========================================================
   Import / eksport
========================================================= */
let importParsed = null;

function resetImportModal() {
  importParsed = null;
  show(el.importPreviewWrap, false);
  show(el.importErr, false);
  show(el.importProg, false);
  el.importErr.textContent = "";
  el.btnImportConfirm.disabled = true;
}

function openImportModal() {
  resetImportModal();
  el.importFile.value = "";
  openOverlay(el.importOverlay, () => closeOverlay(el.importOverlay));
}

async function onImportFileChosen() {
  resetImportModal();
  const file = el.importFile.files?.[0];
  if (!file) return;
  try {
    importParsed = parseImport(await file.text(), defaultName());
    const w = Math.round(Math.min(600, window.innerWidth * 0.82));
    el.importPreviewCanvas.width = w;
    el.importPreviewCanvas.height = Math.round((w * 11) / 26);
    renderPreview(logoToPreview(importParsed), el.importPreviewCanvas, GLYPH_5x7);
    show(el.importPreviewWrap, true);
    el.btnImportConfirm.disabled = false;
  } catch (e) {
    el.importErr.textContent = e?.message || t("logoEditor.errors.invalidJson");
    show(el.importErr, true);
  }
}

async function confirmImport() {
  if (!importParsed || el.btnImportConfirm.disabled) return;
  el.btnImportConfirm.disabled = true;
  el.btnImportCancel.disabled = true;
  el.importStep.textContent = t("logoEditor.import.steps.saveDb");
  el.importBar.style.width = "60%";
  show(el.importProg, true);
  try {
    const id = await createLogo({ user_id: currentUser.id, ...importParsed, name: makeUniqueName(importParsed.name) });
    await refresh();
    selectTile(id);
    closeOverlay(el.importOverlay);
  } catch (e) {
    console.error(e);
    el.importErr.textContent = t("logoEditor.errors.importFailedDetailed", { error: e?.message || e });
    show(el.importErr, true);
    show(el.importProg, false);
    el.btnImportConfirm.disabled = false;
  } finally {
    el.btnImportCancel.disabled = false;
  }
}

async function exportSelected() {
  if (!selectedId) return;
  el.exportBar.style.width = "30%";
  show(el.exportOverlay, true);
  try {
    const logo = await fetchLogo(selectedId);
    const fileName = `${safeFileName(logo.name, t("logoEditor.defaults.logoFileName"))}.famlogo`;
    const out = await buildExport(logo, defaultName());
    el.exportBar.style.width = "100%";
    downloadJson(out, fileName);
  } catch (e) {
    console.error(e);
    void alertModal({ text: t("logoEditor.errors.exportFailedDetailed", { error: e?.message || e }) });
  } finally {
    setTimeout(() => show(el.exportOverlay, false), 300);
  }
}

/* =========================================================
   Pomoc / polityka prywatności (iframe w modalu)
========================================================= */
function pageUrl(path, params, hash) {
  const url = new URL(path, location.href);
  url.searchParams.set("ret", `${location.pathname.split("/").slice(-2).join("/")}${location.search}${location.hash}`);
  url.searchParams.set("lang", getUiLang() || "pl");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.hash = hash;
  return url.toString();
}

function openHelp() {
  el.helpFrame.src = pageUrl("../manual", { modal: "logo-editor", tab: "logo" }, "logo");
  el.helpOverlay.classList.remove("hidden");
}

function openLegal() {
  el.legalFrame.src = pageUrl("../privacy", { modal: "logo-editor" }, "logo-editor");
  el.legalOverlay.classList.remove("hidden");
}

/* =========================================================
   START
========================================================= */
async function loadFonts() {
  const r = await fetch(await cacheBust(FONT_3x10_URL), { cache: "no-store" });
  if (!r.ok) throw new Error(`Font 3x10: HTTP ${r.status}`);
  FONT_3x10 = await r.json();
  GLYPH_5x7 = await loadFont5x7(await cacheBust(FONT_5x7_URL));
}

function bindUi() {
  // topbar
  el.btnBack.dataset.sheetBack = "1"; // znacznik dla contact-modal.js (patrz js/pages/bases.js)
  el.btnBack.addEventListener("click", () => {
    if (handleSheetBack()) return;
    location.href = withLangParam("../games");
  });
  el.btnCloseEditor.addEventListener("click", () => void closeEditor());
  el.btnManual.addEventListener("click", () => {
    if (editorMode) openHelp();
    else location.href = pageUrl("../manual", {}, "logo");
  });

  const closeHelp = () => el.helpOverlay.classList.add("hidden");
  const closeLegal = () => el.legalOverlay.classList.add("hidden");
  $("btnHelpClose").addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeHelp(); });
  el.helpOverlay.addEventListener("click", (ev) => { if (ev.target === el.helpOverlay) closeHelp(); });
  $("btnLegal").addEventListener("click", (ev) => { ev.stopImmediatePropagation(); openLegal(); });
  $("btnBackToManual").addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeLegal(); openHelp(); });
  $("btnLegalClose").addEventListener("click", (ev) => { ev.stopImmediatePropagation(); closeLegal(); });
  el.legalOverlay.addEventListener("click", (ev) => { if (ev.target === el.legalOverlay) closeLegal(); });

  // lista
  el.btnEdit.addEventListener("click", () => void editSelected());
  el.btnPreview.addEventListener("click", () => {
    const logo = logos.find((l) => l.id === selectedId);
    if (logo) openPreview(logoToPreview(logo));
  });
  el.btnExport.addEventListener("click", () => void exportSelected());
  el.btnImport.addEventListener("click", openImportModal);

  // nowe logo: tryb -> nazwa -> edytor
  const pick = (mode) => () => {
    closeOverlay(el.createOverlay);
    openNameModal({ kind: "create", mode });
  };
  $("pickText").addEventListener("click", pick("TEXT"));
  $("pickDraw").addEventListener("click", pick("DRAW"));
  $("pickImage").addEventListener("click", pick("IMAGE"));
  $("btnPickCancel").addEventListener("click", () => closeOverlay(el.createOverlay));
  closeOnBackdrop(el.createOverlay, () => closeOverlay(el.createOverlay));

  // modal nazwy
  el.btnRenameOk.addEventListener("click", () => void confirmNameModal());
  $("btnRenameCancel").addEventListener("click", closeNameModal);
  closeOnBackdrop(el.renameOverlay, closeNameModal);
  el.renameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); void confirmNameModal(); }
    if (e.key === "Escape") { e.preventDefault(); closeNameModal(); }
  });

  // import
  el.importFile.addEventListener("change", () => void onImportFileChosen());
  el.btnImportConfirm.addEventListener("click", () => void confirmImport());
  el.btnImportCancel.addEventListener("click", () => closeOverlay(el.importOverlay));
  closeOnBackdrop(el.importOverlay, () => closeOverlay(el.importOverlay));

  // edytor
  el.btnSave.addEventListener("click", () => void saveEditor());
  el.logoName.addEventListener("input", markDirty);
  el.bigPreview.addEventListener("click", () => {
    if (editorMode !== "TEXT" && lastPreview) openPreview(lastPreview);
  });
  window.addEventListener("logoeditor:openPreview", (ev) => { if (ev?.detail) openPreview(ev.detail); });

  // podgląd
  $("btnPreviewClose").addEventListener("click", closePreview);
  closeOnBackdrop(el.previewOverlay, closePreview);

  window.addEventListener("i18n:lang", () => {
    updateEditorHeader();
    renderList();
  });

  // Plik .famlogo otwarty z systemu (PWA file handler).
  if ("launchQueue" in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files?.length) return;
      const dt = new DataTransfer();
      dt.items.add(await params.files[0].getFile());
      openImportModal();
      el.importFile.files = dt.files;
      await onImportFileChosen();
    });
  }
}

async function boot() {
  await initI18n({ withSwitcher: true });
  document.documentElement.classList.remove("page-loading");

  currentUser = await requireAuth(withLangParam("../login"));
  initTopbarAccountDropdown(currentUser, { accountHref: "../account", loginHref: "../login" });
  document.querySelector(".topbar")?.classList.add("topbar-ready");

  try {
    await loadFonts();
  } catch (e) {
    console.error(e);
    void alertModal({ text: t("logoEditor.errors.fontsLoad") });
  }

  const ctx = {
    getMode: () => editorMode,
    markDirty,
    clearDirty,
    onPreview: onEditorPreview,
    getFont3x10: () => FONT_3x10,
  };
  editors = {
    TEXT: initTextEditor(ctx),
    DRAW: initDrawEditor(ctx),
    IMAGE: initImageEditor(ctx),
  };

  import("../../js/core/updater.js?v=v2026-09-26T19541").then((m) => m.initUpdater()).catch(() => {});

  bindUi();
  await refresh();
}

boot();
