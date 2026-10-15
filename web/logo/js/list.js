import { bindResourceDuplicate } from "../../shared/js/core/resource-duplicate.js?v=v2026-10-15T22295";
import { bindResourceSend } from "../../shared/js/core/resource-send.js?v=v2026-10-15T22295";
import { refreshResourceCopyInbox } from "../../shared/js/core/resource-copy-inbox.js?v=v2026-10-15T22295";
import { isGuestUser } from "../../shared/js/core/guest-mode.js?v=v2026-10-15T22295";
// familiada/logo/js/list.js
// Lista logo (/logos/): kafelki w trzech kartach, modale (nowe / nazwa /
// import / podgląd), eksport. Edycja to osobne strony /logos/editor/<tryb>/
// (editor-page.js) -- „Nowe logo” od razu zakłada wiersz w bazie i otwiera
// edytor z jego id w adresie.
//
// Moduły:
//   render.js       – format bitów i podgląd „jak na wyświetlaczu”
//   db.js           – tabela user_logos + pliki w Storage
//   transfer.js     – eksport/import .famlogo
//   preview-zoom.js – pinch-zoom pełnoekranowego podglądu
//   routes.js       – adresy listy i edytorów

import { addRenameGesture } from "../../shared/js/core/rename-gesture.js?v=v2026-10-15T22295";
import { loadFont5x7, buildLogoPreviewCanvas } from "../../shared/js/core/logo-preview.js?v=v2026-10-15T22295";
import { alertModal, confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-15T22295";
import { initI18n, t, withLangParam } from "../../shared/translation/translation.js?v=v2026-10-15T22295";
import { initPage } from "../../shared/js/core/page-init.js?v=v2026-10-15T22295";
import { PAGES } from "../../shared/js/core/nav-map.js?v=v2026-10-15T22295";
import { tabFromUrl, setTab } from "../../shared/js/core/tabs.js?v=v2026-10-15T22295";
import { isMobileDevice } from "../../shared/js/core/pwa.js?v=v2026-10-15T22295";
import { getDeviceProfile, isPhoneScreen } from "../../shared/js/core/device-guard.js?v=v2026-10-15T22295";
import { v as cacheBust } from "../../shared/js/core/cache-bust.js?v=v2026-10-15T22295";
import { isResourceBusy, acquireResourceLock } from "../../shared/js/core/resource-lock.js?v=v2026-10-15T22295";
import { enterModalSheet, exitModalSheet, isSheetViewport } from "../../shared/js/core/modal-sheet.js?v=v2026-10-15T22295";
import { icon } from "../../shared/js/core/icons.js?v=v2026-10-15T22295";
import { initListHeaderLayout } from "../../shared/js/core/list-header-layout.js?v=v2026-10-15T22295";

import { TYPE_GLYPH, TYPE_PIX, PIX_FORMAT, DOT_W, DOT_H, emptyRows, packBits, renderPreview, logoToPreview } from "./render.js?v=v2026-10-15T22295";
import { listLogos, fetchLogo, createLogo, updateLogo, deleteLogo, isUniqueViolation, uploadImportedLogoImage, removeLogoImageUrl } from "./db.js?v=v2026-10-15T22295";
import { buildExport, downloadJson, parseImport, safeFileName } from "./transfer.js?v=v2026-10-15T22295";
import { initPreviewPinchZoom, lockPageZoomForPreview, unlockPageZoomAfterPreview } from "./preview-zoom.js?v=v2026-10-15T22295";
import { cannotEditReason } from "./text.js?v=v2026-10-15T22295";
import { editModeFor, editorUrl } from "./routes.js?v=v2026-10-15T22295";
import { initListSearch } from "../../shared/js/core/list-search.js?v=v2026-10-15T22295";

const FONT_3x10_URL = "/shared/fonts/display/font_3x10.json?v=v2026-10-15T22295";
const FONT_5x7_URL = "/shared/fonts/display/font_5x7.json?v=v2026-10-15T22295";
// Edycja wymaga miejsca na pasek narzędzi i scenę -- na telefonie dostępna
// jest tylko lista (podgląd, import/eksport, nazwa, usuwanie); „Edytuj”
// i „Nowe logo” są ukryte (.le-phone). Telefon wg wspólnej reguły
// isPhoneScreen() (js/core/device-guard.js): krótszy bok ekranu, więc
// tablet edytuje w poziomie i w pionie, a telefon w żadnej orientacji.

/* =========================================================
   DOM
========================================================= */
const $ = (id) => document.getElementById(id);
const el = {
  btnBack: $("btnBack"),

  listShell: $("listShell"),
  grid: $("grid"),
  receivedCopies: $("receivedCopies"),
  hint: $("hint"),
  msg: $("msg"),
  btnEdit: $("btnEdit"),
  btnPreview: $("btnPreview"),
  btnDuplicate: $("btnDuplicate"),
  btnSendCopy: $("btnSendCopy"),
  btnExport: $("btnExport"),
  btnImport: $("btnImport"),
  tabs: { TEXT: $("tabLogoText"), DRAW: $("tabLogoDraw"), IMAGE: $("tabLogoImage") },

  renameOverlay: $("renameOverlay"),
  renameTitle: $("renameTitle"),
  renameSub: $("renameSub"),
  renameInput: $("renameInput"),
  renameMsg: $("renameMsg"),
  btnRenameOk: $("btnRenameOk"),

  importOverlay: $("logoImportOverlay"),
  importFile: $("inpImportLogoFile"),
  importChoose: $("btnImportLogoChoose"),
  importFileName: $("logoImportFileName"),
  importPreviewWrap: $("logoImportPreviewWrap"),
  importPreviewCanvas: $("logoImportPreviewCanvas"),
  importErr: $("logoImportErr"),
  importProg: $("logoImportProg"),
  importStep: $("logoImportStep"),
  importBar: $("logoImportBar"),
  btnImportConfirm: $("btnLogoImportConfirm"),
  btnImportCancel: $("btnLogoImportCancel"),
  btnImportDone: $("btnLogoImportDone"),

  exportOverlay: $("logoExportOverlay"),
  exportBar: $("logoExportBar"),
  exportMsg: $("logoExportMsg"),
  btnExportClose: $("btnLogoExportClose"),

  previewOverlay: $("previewOverlay"),
  previewCanvas: $("bigPreviewFull"),
};

/* =========================================================
   STAN
========================================================= */
let currentUser = null;
let logos = [];          // lekka lista (bez fabricData/obrazów) -- patrz db.listLogos
let selectedId = null;
let activeListMode = "TEXT";

let FONT_3x10 = null;    // znak -> [10 wierszy]
let GLYPH_5x7 = null;    // Map znak -> [7 intów]

/* =========================================================
   Drobne pomocnicze
========================================================= */
function show(node, on) {
  if (!node) return;
  node.hidden = !on;
  node.style.display = on ? "" : "none";
}

const setMsg = (text) => { if (el.msg) el.msg.textContent = text || ""; };
const isCompactViewport = () => getDeviceProfile().viewportWidth < 700;
const refreshViewportClass = () => document.documentElement.classList.toggle("le-compact", isCompactViewport());
refreshViewportClass();
window.addEventListener("resize", refreshViewportClass, { passive: true });
window.addEventListener("orientationchange", refreshViewportClass, { passive: true });
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
  if (reason === "logo") return t("resourceLock.logoMessage");
  return t("resourceLock.logoPoolBusy");
}

/** Komunikat dla odmowy zajęcia logo:L (odpowiedź acquire_edit_lock_mode). */
function lockBusyMessage(res) {
  if (res?.error === "gone") return t("resourceLock.goneMessage");
  if (res?.blocker_type === "logos") return busyMessage(res.blocker_context);
  return t("resourceLock.logoMessage");
}

function modeLabel(mode) {
  return t(`logoEditor.modes.${String(mode || "image").toLowerCase()}`);
}

// Karty z mapy stron (nazwy małymi literami w adresie, tryby wielkimi w kodzie).
const LOGO_TABS = PAGES.logoEditor.tabs;
const DEFAULT_LOGO_TAB = LOGO_TABS[0];

function listModeFromUrl() {
  return tabFromUrl(LOGO_TABS, DEFAULT_LOGO_TAB).toUpperCase();
}

function listModeForLogo(logo) {
  if (logo?.type === TYPE_GLYPH) return "TEXT";
  if (logo?.type === TYPE_PIX && logo?.payload?.source?.mode === "IMAGE") return "IMAGE";
  return "DRAW";
}

function setActiveListMode(mode, { updateUrl = true } = {}) {
  activeListMode = String(mode || "").toUpperCase();
  const hintKeys = {
    TEXT: "logoEditor.create.textSubtitle",
    DRAW: "logoEditor.create.drawSubtitle",
    IMAGE: "logoEditor.create.imageSubtitle",
  };
  if (el.hint) el.hint.textContent = t(hintKeys[activeListMode]);
  for (const [key, tab] of Object.entries(el.tabs)) {
    const active = key === activeListMode;
    tab?.classList.toggle("active", active);
    tab?.setAttribute("aria-selected", String(active));
  }
  const selected = logos.find((logo) => logo.id === selectedId);
  if (selected && listModeForLogo(selected) !== activeListMode) selectedId = null;
  if (updateUrl) {
    setTab(activeListMode.toLowerCase(), DEFAULT_LOGO_TAB);
  }
  renderList();
  void refreshResourceCopyInbox({kind:"logo",variant:activeListMode,host:el.receivedCopies,onChanged:refresh});
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

/* =========================================================
   Lista kafelków
========================================================= */
async function refresh() {
  logos = await listLogos();
  if (selectedId && !logos.some((l) => l.id === selectedId)) selectedId = null;
  renderList();
  await refreshResourceCopyInbox({kind:"logo",variant:activeListMode,host:el.receivedCopies,onChanged:refresh});
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
  el.btnDuplicate.disabled = !!el.btnDuplicate.dataset.duplicateBusy || !has || isGuestUser(currentUser);
  el.btnSendCopy.disabled = !!el.btnSendCopy.dataset.sendBusy || !has || isGuestUser(currentUser);
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
        <div class="logoMeta">${logo.received_from_label ? `${esc(t("resourceSend.from", { name: logo.received_from_label }))} · ` : ""}${esc(fmtDate(logo.updated_at))}</div>
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
  const createTitleKey = {
    TEXT: "textCreateTitle",
    DRAW: "drawCreateTitle",
    IMAGE: "imageCreateTitle",
  }[activeListMode];
  const createSubtitleKey = {
    TEXT: "textSubtitle",
    DRAW: "drawSubtitle",
    IMAGE: "imageSubtitle",
  }[activeListMode];
  add.innerHTML = `
    <div class="plus">${icon("plus")}</div>
    <div class="txt">${esc(t(`logoEditor.create.${createTitleKey}`))}</div>
    <div class="sub">${esc(t(`logoEditor.create.${createSubtitleKey}`))}</div>`;
  add.addEventListener("click", () => openNameModal({ kind: "create", mode: activeListMode }));
  el.grid.appendChild(add);

  // Najpierw same kafelki, miniatury po kolei w wolnych chwilach -- przy
  // wielu logo nie blokujemy pierwszego wyrenderowania listy.
  const queue = [];
  for (const logo of logos.filter((item) => listModeForLogo(item) === activeListMode)) {
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
  setMsg(t("logoEditor.status.deleting"));
  try {
    await deleteLogo(logo.id);
    await refresh();
    setMsg(t("logoEditor.status.deleted"));
  } catch (e) {
    console.error(e);
    setMsg("");
    void alertModal({
      text: e?.code === "RESOURCE_IN_USE" ? busyMessage(e.reason) : t("logoEditor.errors.deleteFailed", { error: e?.message || e }),
    });
  }
}

/* =========================================================
   Modal nazwy: zmiana nazwy istniejącego / nazwa nowego logo
========================================================= */
let nameModal = null; // { kind:"rename", logo, lease } | { kind:"create", mode }

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

// Okno zmiany nazwy trzyma logo:L wyłącznie do zamknięcia okna (docs/blokady-
// zasobow.md, sekcja 6) -- w tym czasie nikt nie wejdzie w edycję tego logo,
// a trzymana pula logo (Control / ustawienia gry) nie pozwoli otworzyć okna.
async function openRenameModal(logo) {
  let lease;
  try {
    lease = await acquireResourceLock({ resourceType: "logo", resourceId: logo.id, context: "logo-list" });
  } catch (e) {
    console.error(e);
    void alertModal({ text: t("logoEditor.rename.failed") });
    return;
  }
  if (!lease?.ok) {
    void alertModal({ text: lockBusyMessage(lease) });
    return;
  }
  openNameModal({ kind: "rename", logo, lease });
}

function closeNameModal() {
  nameModal?.lease?.release?.();
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
    await createAndOpen(nameModal.mode, name);
    return;
  }

  const { logo } = nameModal;
  el.btnRenameOk.disabled = true;
  el.renameMsg.textContent = "";
  try {
    // Blokada logo:L z otwarcia okna mogła zginąć (uśpiona karta) -- wtedy
    // zapis stąd nadpisałby cudzą edycję. RPC i tak odmówi, ale mówimy wprost.
    if (nameModal.lease && !nameModal.lease.ok) {
      el.renameMsg.textContent = t("resourceLock.lostMessage");
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
   Edycja: osobne strony /logos/editor/<tryb>/?id=
========================================================= */
/** Pusty payload nowego logo danego trybu -- wiersz powstaje od razu, żeby
 *  edytor miał id w adresie od pierwszej chwili. */
function emptyPayload(mode) {
  if (mode === "TEXT") {
    return { type: TYPE_GLYPH, payload: { layers: [{ color: "main", rows: emptyRows() }], source: { mode: "TEXT", text: "" } } };
  }
  return {
    type: TYPE_PIX,
    payload: { w: DOT_W, h: DOT_H, format: PIX_FORMAT, bits_b64: packBits(new Uint8Array(DOT_W * DOT_H)), source: { mode } },
  };
}

async function createAndOpen(mode, name) {
  el.btnRenameOk.disabled = true;
  el.renameMsg.textContent = "";
  try {
    // Pula logo trzymana (Control / ustawienia gry) -- edytor i tak by nic nie zapisał.
    if (await isResourceBusy("logos", currentUser.id).catch(() => false)) {
      el.renameMsg.textContent = t("resourceLock.logoPoolBusy");
      return;
    }
    let finalName = makeUniqueName(name);
    let id;
    for (let attempt = 0; ; attempt++) {
      try {
        id = await createLogo({ user_id: currentUser.id, name: finalName, ...emptyPayload(mode) });
        break;
      } catch (e) {
        // Nazwa zajęta przez logo spoza lokalnej listy (np. z innej karty).
        if (!isUniqueViolation(e) || attempt > 0) throw e;
        logos = await listLogos();
        finalName = makeUniqueName(name);
      }
    }
    location.href = editorUrl(mode, id);
  } catch (e) {
    console.error(e);
    el.renameMsg.textContent = t("logoEditor.errors.saveFailed");
  } finally {
    el.btnRenameOk.disabled = false;
  }
}

async function editSelected() {
  if (!selectedId || isCompactViewport()) return;
  let logo;
  try {
    logo = await fetchLogo(selectedId);
  } catch (e) {
    console.error(e);
    void alertModal({ text: t("logoEditor.errors.loadFailed", { error: e?.message || e }) });
    return;
  }
  const mode = editModeFor(logo);
  const reason = cannotEditReason(logo, mode, FONT_3x10);
  if (reason) {
    void alertModal({ text: reason });
    return;
  }
  location.href = editorUrl(mode, logo.id);
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
  el.btnImportConfirm.hidden = false;
  el.btnImportDone.hidden = true;
  if (el.importFileName) el.importFileName.textContent = t("logoEditor.import.noFileSelected");
}

function updateImportFileName() {
  if (!el.importFileName) return;
  el.importFileName.textContent = el.importFile?.files?.[0]?.name || t("logoEditor.import.noFileSelected");
}

function openImportModal() {
  resetImportModal();
  el.importFile.value = "";
  openOverlay(el.importOverlay, () => closeOverlay(el.importOverlay));
}

async function onImportFileChosen() {
  resetImportModal();
  const file = el.importFile.files?.[0];
  updateImportFileName();
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
  let uploadedImageUrl = null;
  try {
    let imported = { ...importParsed, payload: { ...importParsed.payload } };
    const source = imported.payload.source || {};
    if (source.mode === "IMAGE" && source.imageData) {
      el.importStep.textContent = t("logoEditor.import.steps.uploadImage");
      el.importBar.style.width = "35%";
      uploadedImageUrl = await uploadImportedLogoImage(source.imageData, currentUser.id);
      const { imageData, ...sourceWithoutData } = source;
      imported.payload.source = { ...sourceWithoutData, imageUrl: uploadedImageUrl };
    }
    el.importStep.textContent = t("logoEditor.import.steps.saveDb");
    el.importBar.style.width = "70%";
    let id;
    try {
      id = await createLogo({ user_id: currentUser.id, ...imported, name: makeUniqueName(imported.name) });
    } catch (e) {
      if (uploadedImageUrl) await removeLogoImageUrl(uploadedImageUrl, currentUser.id);
      uploadedImageUrl = null;
      throw e;
    }
    uploadedImageUrl = null;
    setActiveListMode(listModeForLogo(importParsed));
    await refresh();
    selectTile(id);
    show(el.importProg, false);
    el.importErr.style.color = "";
    el.importErr.textContent = t("logoEditor.status.imported");
    show(el.importErr, true);
    el.btnImportConfirm.hidden = true;
    el.btnImportDone.hidden = false;
  } catch (e) {
    console.error(e);
    if (uploadedImageUrl) await removeLogoImageUrl(uploadedImageUrl, currentUser.id);
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
  el.exportBar.style.background = "rgba(255,255,255,.85)";
  el.exportMsg.textContent = "";
  el.btnExportClose.hidden = true;
  show(el.exportOverlay, true);
  enterModalSheet(el.exportOverlay, {
    backBtn: el.btnBack,
    onClose: () => {
      if (!el.btnExportClose.hidden) {
        show(el.exportOverlay, false);
        exitModalSheet(el.exportOverlay);
      }
    },
  });
  try {
    const logo = await fetchLogo(selectedId);
    const fileName = `${safeFileName(logo.name, t("logoEditor.defaults.logoFileName"))}.famlogo`;
    const out = await buildExport(logo, defaultName());
    el.exportBar.style.width = "100%";
    downloadJson(out, fileName);
    el.exportMsg.textContent = t("logoEditor.export.success");
  } catch (e) {
    console.error(e);
    el.exportMsg.textContent = t("logoEditor.errors.exportFailedDetailed", { error: e?.message || e });
    el.exportBar.style.background = "#dc3545";
  } finally {
    el.btnExportClose.hidden = false;
  }
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
  el.btnImportDone.addEventListener("click", () => closeOverlay(el.importOverlay));
  el.btnExportClose.addEventListener("click", () => {
    show(el.exportOverlay, false);
    exitModalSheet(el.exportOverlay);
    el.btnExportClose.hidden = true;
  });
  bindResourceDuplicate({button:el.btnDuplicate,kind:"logo",getSource:()=>logos.find(l=>l.id===selectedId),onDone:async id=>{await refresh();const logo=logos.find(l=>l.id===id);if(logo)setActiveListMode(listModeForLogo(logo));selectTile(id);},onState:updateListButtons});
  bindResourceSend({button:el.btnSendCopy,kind:"logo",getSource:()=>logos.find(l=>l.id===selectedId),onDone:async()=>refresh(),onState:updateListButtons});
  // lista
  el.btnEdit.addEventListener("click", () => void editSelected());
  el.btnPreview.addEventListener("click", () => {
    const logo = logos.find((l) => l.id === selectedId);
    if (logo) openPreview(logoToPreview(logo));
  });
  el.btnExport.addEventListener("click", () => void exportSelected());
  el.btnImport.addEventListener("click", openImportModal);

  for (const [mode, tab] of Object.entries(el.tabs)) {
    tab?.addEventListener("click", () => setActiveListMode(mode));
  }

  // modal nazwy
  el.btnRenameOk.addEventListener("click", () => void confirmNameModal());
  $("btnRenameCancel").addEventListener("click", closeNameModal);
  $("btnRenameClose")?.addEventListener("click", closeNameModal);
  closeOnBackdrop(el.renameOverlay, closeNameModal);
  el.renameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); void confirmNameModal(); }
    if (e.key === "Escape") { e.preventDefault(); closeNameModal(); }
  });

  // import
  el.importChoose?.addEventListener("click", () => el.importFile?.click());
  el.importFile.addEventListener("change", () => void onImportFileChosen());
  el.btnImportConfirm.addEventListener("click", () => void confirmImport());
  el.btnImportCancel.addEventListener("click", () => closeOverlay(el.importOverlay));
  closeOnBackdrop(el.importOverlay, () => closeOverlay(el.importOverlay));

  // podgląd
  $("btnPreviewClose").addEventListener("click", closePreview);
  closeOnBackdrop(el.previewOverlay, closePreview);

  window.addEventListener("i18n:lang", () => {
    if (!el.importFile?.files?.length) updateImportFileName();
    setActiveListMode(activeListMode, { updateUrl: false });
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
  const i18nP = initI18n({ withSwitcher: true });
  const userP = initPage("logoEditor", { ready: i18nP }); // auth startuje równolegle z i18n
  await i18nP;
  document.documentElement.classList.remove("page-loading");
  initListHeaderLayout();
  initListSearch({ grids: "#grid", tile: ".logoTile", name: ".logoName" });

  currentUser = await userP;
  if (!currentUser) return; // initPage przekierował na logowanie

  try {
    await loadFonts();
  } catch (e) {
    console.error(e);
    void alertModal({ text: t("logoEditor.errors.fontsLoad") });
  }

  bindUi();
  setActiveListMode(listModeFromUrl(), { updateUrl: false });
  try {
    await refresh();
  } catch (e) {
    console.error("[logo] initial list load failed:", e);
    setMsg(t("logoEditor.errors.loadFailed", { error: String(e?.message || "") }));
  } finally {
    // Keep the grid hidden until its first result; errors still reveal their message.
    document.querySelector(".logoShell")?.classList.add("skel-step-ready");
  }
}

boot();
