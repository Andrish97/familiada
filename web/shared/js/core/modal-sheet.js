// js/core/modal-sheet.js
// Tryb "sheet" dla rozbudowanych modali na telefonie: zamiast wyśrodkowanego
// okna na przyciemnionym tle, treść strony jest zastępowana treścią modala
// (topbar i stopka zostają widoczne) — patrz css/base.css, sekcja
// "Modal sheet (mobile)".
//
// Wyjściem z modala w tym trybie jest ISTNIEJĄCY przycisk wstecz w
// topbarze danej strony (przejmuje tekst/zachowanie na czas otwarcia
// modala), a nie osobny przycisk wewnątrz modala — analogicznie do tego,
// jak editor.js/editor.css robi to swoim jedynym `btnBack`.

import { t } from "../../translation/translation.js?v=v2026-10-21T10054";
import { PAGES, dialogAllowed } from "./nav-map.js?v=v2026-10-21T10054";


// Esc zamyka najwyższe widoczne okno tak samo jak jego X w nagłówku (jedna
// obsługa dla wszystkich okien .overlay); „Anuluj” z [data-modal-cancel] też
// klika ten X. Okna z własną obsługą Esc wołają preventDefault, więc tu ich
// już nie zamykamy drugi raz. Okna blokujące bez X (np. eksport w toku)
// zostają otwarte.
const ESC_CLOSE_SELECTOR = [".mHead", ".uni-head", ".tagsHead", ".bld-preview-head", ".mkt-detail-head", ".previewModalTitle"]
  .map((head) => `${head} button:has(use[href*="/close.svg?v=v2026-10-21T10054"])`).join(", ");
// Na telefonie (arkusz) X bywa ukryty — wtedy bierzemy pierwszy dostępny.
const visibleCloseButton = (root) => {
  const all = [...root.querySelectorAll(ESC_CLOSE_SELECTOR)].filter((btn) => !btn.disabled);
  return all.find((btn) => btn.getClientRects().length > 0) || all[0] || null;
};
// Nasłuch na window: działa po obsługach okien na document.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const open = [...document.querySelectorAll(".overlay")]
      .filter((el) => !el.hidden && getComputedStyle(el).display !== "none");
    const closeBtn = open.length ? visibleCloseButton(open.at(-1)) : null;
    if (!closeBtn) return;
    e.preventDefault();
    closeBtn.click();
  });
  // Okno od dołu: klik w przyciemnione tło zamyka z animacją.
  document.addEventListener("click", (e) => {
    if (activeOverlay && e.target === activeOverlay && activeOverlay.classList.contains("sheet-active")) closeSheetAnimated();
  });
  document.addEventListener("click", (e) => {
    const cancel = e.target.closest?.("[data-modal-cancel]");
    if (!cancel) return;
    for (let el = cancel.parentElement; el && !el.classList.contains("overlay"); el = el.parentElement) {
      const closeBtn = visibleCloseButton(el);
      if (closeBtn) { closeBtn.click(); return; }
    }
  });
}

// Telefon albo tablet dotykowy -- ten sam warunek co w css/base.css
// („Okno od dołu”).
const SHEET_MQ = "(max-width:600px), (hover:none) and (pointer:coarse) and (max-width:1366px)";
const sheetMql = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia(SHEET_MQ)
  : { matches: false, addEventListener() {}, addListener() {} };

let activeClose = null;
let activeBack = null;
let activeOverlay = null;
let activeDialogKey = null;
let handlingPopstate = false;
const sheetRoutes = new Map();
let currentPageId = null;
const sheetLayouts = new WeakMap();

function urlDialog() {
  const href = typeof location !== "undefined" && location.href ? location.href : "/";
  return new URL(href, "https://familiada.invalid").searchParams.get("dialog");
}

function setUrlDialog(key, push) {
  const url = new URL(location.href || "/", "https://familiada.invalid");
  if (key) url.searchParams.set("dialog", key);
  else url.searchParams.delete("dialog");
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (push) history.pushState({ ...(history.state || {}), __sheetDialog: key }, "", next);
  else history.replaceState(history.state, "", next);
}

function showRoutedOverlay(el) {
  if (!el) return false;
  el.hidden = false;
  el.classList.remove("hidden");
  el.style.display = "";
  const close = () => {
    el.style.display = "none";
    el.hidden = true;
    exitModalSheet(el);
  };
  enterModalSheet(el, { onClose: close, historyKey: el.id, restore: false });
  return true;
}

function onModalPopstate() {
  const key = urlDialog();
  if (activeClose && key !== activeDialogKey) {
    handlingPopstate = true;
    try { activeClose(); } finally { handlingPopstate = false; }
  }
  if (key && activeDialogKey !== key) {
    const route = sheetRoutes.get(key);
    if (route) {
      route.overlay.hidden = false;
      route.overlay.classList.remove("hidden");
      route.overlay.style.display = "";
      enterModalSheet(route.overlay, { ...route.options, historyKey: key, restore: true });
    } else {
      showRoutedOverlay(document.getElementById(key));
    }
  }
}

if (typeof window !== "undefined") window.addEventListener("popstate", onModalPopstate);

export function setModalSheetPage(pageId) {
  currentPageId = pageId;
  if (typeof window === "undefined" || typeof location === "undefined" || !location.href) return;
  const key = urlDialog();
  if (!key) return;
  const allowed = dialogAllowed(pageId, key);
  if (allowed && key === "contactModalOverlay") {
    setTimeout(() => {
      if (urlDialog() !== key) return;
      import("./contact-modal.js?v=v2026-10-21T10054").then((module) => module.openContactModal());

    }, 0);
    return;
  }
  const overlay = allowed ? document.getElementById(key) : null;
  if (overlay) {
    // A directly opened URL still gets an in-page parent history entry, so
    // Back closes the dialog instead of leaving the site. Refresh preserves
    // the marker and does not add another layer.
    if (history.state?.__sheetDialog !== key) {
      const dialogUrl = new URL(location.href);
      const parentUrl = new URL(dialogUrl);
      parentUrl.searchParams.delete("dialog");
      history.replaceState({ ...(history.state || {}), __sheetParent: key }, "", `${parentUrl.pathname}${parentUrl.search}${parentUrl.hash}`);
      history.pushState({ __sheetDialog: key }, "", `${dialogUrl.pathname}${dialogUrl.search}${dialogUrl.hash}`);
    }
    setTimeout(() => { if (!activeClose && urlDialog() === key) showRoutedOverlay(overlay); }, 0);
  }
  else {
    const url = new URL(location.href);
    url.searchParams.delete("dialog");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

export function isSheetViewport() {
  return sheetMql.matches;
}

// Arkusze mają wspólny szkielet tylko w prezentacji mobilnej: sam nagłówek,
// pasek akcji oraz osobno przewijaną treść z podpowiedziami. Wrappery są display:contents
// poza trybem sheet, więc układ desktopowy i istniejące selektory pozostają.
function prepareSheetLayout(overlayEl) {
  const modal = overlayEl?.querySelector(":scope > .modal, :scope > .market-preview-card");
  if (!modal || modal.dataset.sheetLayoutReady === "1") return;
  const children = [...modal.children];
  const headerSelectors = [".uni-head", ".mHead", ".tagsHead", ".bld-preview-head", ".bld-preview-switch", ".mkt-detail-head", ".previewModalTitle", ".mTitle"];
  const actionSelectors = [".uni-foot", ".modal-actions", ".tagsFoot", ".mkt-detail-actions"];
  const nestedActionSelectors = [".baseShareLookup"];
  const isHeader = el => headerSelectors.some(sel => el.matches(sel));
  const isAction = el => actionSelectors.some(sel => el.matches(sel));
  const hintNodes = [...modal.querySelectorAll(".mSub, .uni-hint, .hint, .field-hint")]
    .filter(el => el.textContent.trim() && el.getClientRects().length > 0);
  const onlyHint = hintNodes.length === 1 ? hintNodes[0] : null;
  const isGlobalHint = onlyHint?.matches(".mSub")
    || (onlyHint?.matches(".uni-hint") && onlyHint.parentElement?.matches(".uni-body"));
  const movableHint = isGlobalHint ? onlyHint : null;
  const headerChildren = children.filter(isHeader);
  const actionChildren = children.filter(isAction);
  const nestedActions = modal.hasAttribute("data-sheet-local-actions")
    ? []
    : [...modal.querySelectorAll(nestedActionSelectors.join(","))]
      .filter(el => !children.includes(el) && !el.parentElement?.closest(".sheet-modal-actions"));
  const relocated = [...nestedActions, ...(movableHint && !children.includes(movableHint) ? [movableHint] : [])];
  sheetLayouts.set(modal, {
    childNodes: [...modal.childNodes],
    nested: relocated.map(el => ({ el, parent: el.parentNode, next: el.nextSibling })),
  });
  const header = document.createElement("div");
  header.className = "sheet-modal-head";
  const actions = document.createElement("div");
  actions.className = "sheet-modal-actions";
  const body = document.createElement("div");
  body.className = "sheet-modal-body";
  for (const child of children) {
    if (headerChildren.includes(child)) header.append(child);
    else if (actionChildren.includes(child)) actions.append(child);
    else body.append(child);
  }
  if (movableHint && !header.contains(movableHint)) header.append(movableHint);
  for (const action of nestedActions) actions.append(action);
  if (!header.childElementCount) header.hidden = true;
  if (!actions.childElementCount) actions.hidden = true;
  // Nagłówek i akcje we wspólnym pasku: fitSheetTop() stawia przyciski obok
  // podpowiedzi, gdy tak zajmują mniej miejsca (uwaga użytkownika 2026-10-20).
  const top = document.createElement("div");
  top.className = "sheet-modal-top";
  top.append(header, actions);
  modal.replaceChildren(sheetHandle(overlayEl), top, body);
  modal.dataset.sheetLayoutReady = "1";
}

// Przyciski obok tytułu i podpowiedzi zamiast pod nimi -- tylko gdy pasek
// wyraźnie się obniża, a podpowiedź zostaje szeroka (inaczej układ pionowy).
function fitSheetTop(overlayEl) {
  const top = overlayEl?.querySelector(".sheet-modal-top");
  if (!top) return;
  top.classList.remove("is-inline");
  const head = top.querySelector(":scope > .sheet-modal-head");
  const actions = top.querySelector(":scope > .sheet-modal-actions");
  if (!head || !actions || head.hidden || actions.hidden || !head.offsetHeight || !actions.offsetHeight) return;
  const stacked = head.offsetHeight + actions.offsetHeight;
  top.classList.add("is-inline");
  const inline = top.offsetHeight;
  if (inline >= stacked - 8 || head.offsetWidth < top.clientWidth * 0.45) top.classList.remove("is-inline");
}

// Pasek u góry okna od dołu: przeciągnięcie w dół (albo stuknięcie) zamyka.
function sheetHandle(overlayEl) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "sheet-handle";
  handle.setAttribute("aria-label", t("common.modal.closeLabel"));
  let startY = null, lastY = 0, lastT = 0, velocity = 0, moved = false;
  const setDrag = (px) => overlayEl.style.setProperty("--sheet-drag", `${Math.max(0, px)}px`);
  handle.addEventListener("pointerdown", (e) => {
    startY = e.clientY; lastY = e.clientY; lastT = e.timeStamp; velocity = 0; moved = false;
    handle.setPointerCapture?.(e.pointerId);
    overlayEl.classList.add("sheet-dragging");
  });
  handle.addEventListener("pointermove", (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY; lastT = e.timeStamp;
    setDrag(dy);
  });
  const end = () => {
    if (startY === null) return;
    const dy = lastY - startY;
    startY = null;
    overlayEl.classList.remove("sheet-dragging");
    const panel = overlayEl.querySelector(":scope > .modal, :scope > .market-preview-card");
    const limit = Math.min(160, (panel?.offsetHeight || 600) * 0.25);
    if (!moved || dy > limit || velocity > 0.6) { closeSheetAnimated(); return; }
    overlayEl.classList.add("sheet-settling");
    setDrag(0);
    setTimeout(() => overlayEl.classList.remove("sheet-settling"), 240);
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  return handle;
}

// Zamknięcie z animacją zjazdu w dół (pasek, klik w tło); potem zwykłe
// zamknięcie okna (historia ?dialog= albo onClose strony).
let closingTimer = null;
function closeSheetAnimated() {
  const overlay = activeOverlay;
  if (!overlay || closingTimer) return;
  overlay.classList.add("sheet-closing");
  closingTimer = setTimeout(() => {
    closingTimer = null;
    overlay.classList.remove("sheet-closing");
    overlay.style.removeProperty("--sheet-drag");
    if (activeOverlay === overlay) handleSheetBack();
  }, 230);
}

function restoreSheetLayout(overlayEl) {
  const modal = overlayEl?.querySelector(":scope > .modal, :scope > .market-preview-card");
  const original = modal && sheetLayouts.get(modal);
  if (!original) return;
  for (const { el, parent, next } of original.nested) {
    if (parent) parent.insertBefore(el, next?.parentNode === parent ? next : null);
  }
  modal.replaceChildren(...original.childNodes);
  delete modal.dataset.sheetLayoutReady;
  sheetLayouts.delete(modal);
}

// Modal zostaje otwarty niezależnie od szerokości ekranu (np. tablet
// obrócony w trakcie gdy modal już jest otwarty) — sam mechanizm sheet
// (podmiana treści, przejęty przycisk) ma się włączać/wyłączać żywo wraz
// z media query, zamiast zamrażać stan z chwili otwarcia. Bez tego:
// otwarcie na wąskim ekranie i obrót do szerokiego zostawiał przycisk
// wstecz z tekstem "← Wstecz" mimo że modal wrócił do zwykłego,
// wyśrodkowanego okna z własnym "✕" — dwa niespójne sposoby zamknięcia
// naraz ("przeskakiwanie między modalem a widokiem").
function applyPresentation(matches) {
  document.body.classList.toggle("sheet-open", matches);
  activeOverlay?.classList.toggle("sheet-active", matches);
}

function onSheetMqChange(e) {
  if (!activeClose) return; // żaden sheet modal aktualnie otwarty
  if (e.matches) prepareSheetLayout(activeOverlay);
  else restoreSheetLayout(activeOverlay);
  applyPresentation(e.matches);
  if (e.matches) fitSheetTop(activeOverlay);
}
sheetMql.addEventListener?.("change", onSheetMqChange) ?? sheetMql.addListener?.(onSheetMqChange);
globalThis.addEventListener?.("resize", () => { if (activeClose) fitSheetTop(activeOverlay); });

// overlayEl: element .overlay (lub .market-preview-overlay) danego modala.
// opts.onClose: funkcja zamykająca TEN modal (pasek, klik w tło, Wstecz
//   przeglądarki). opts.backBtn / keepBackBtnText -- dawne przejęcie
//   przycisku wstecz w topbarze; okno od dołu leży nad topbarem, więc
//   przycisk nie jest już przejmowany (parametry zostają dla zgodności).
export function enterModalSheet(overlayEl, { backBtn, onClose, onBack, keepBackBtnText = false, historyKey = overlayEl?.id, restore = false } = {}) {
  if (!isSheetViewport() || overlayEl?.classList.contains("modal--keep-dialog")) return;
  prepareSheetLayout(overlayEl);
  if (!historyKey || !dialogAllowed(currentPageId, historyKey)) historyKey = null;

  // Wymuszone main.wrap{overflow:hidden;height:calc(100dvh - topbar-h)} w
  // trybie sheet (css/base.css) nagle kurczy przewijalny obszar strony (np.
  // marketplace.html mają scroll na całym body) — przeglądarka
  // wtedy sama przycina window.scrollY do nowego, mniejszego zakresu, więc
  // pozycja scrolla jest tracona NA ZAWSZE, jeszcze zanim modal się zamknie.
  // Zapamiętujemy ją tutaj i przywracamy w exitModalSheet(), żeby strona po
  // zamknięciu modala wróciła w to samo miejsce, a nie na sam początek.
  activeOverlay = overlayEl || null;
  activeClose = onClose || null;
  activeDialogKey = historyKey || null;
  const currentKey = urlDialog();
  if (activeDialogKey && currentKey !== activeDialogKey) {
    setUrlDialog(activeDialogKey, !restore);
  }
  activeBack = typeof onBack === "function" ? onBack : null;
  if (activeDialogKey) sheetRoutes.set(activeDialogKey, { overlay: overlayEl, options: { backBtn, onClose, onBack, keepBackBtnText } });

  overlayEl?.style.removeProperty("--sheet-drag");
  overlayEl?.classList.remove("sheet-closing", "sheet-dragging", "sheet-settling");
  applyPresentation(true);
  fitSheetTop(overlayEl);
  requestAnimationFrame(() => { if (activeOverlay === overlayEl) fitSheetTop(overlayEl); });
  document.dispatchEvent(new CustomEvent("modal-sheet:enter", { detail: { overlay: overlayEl } }));
}

export function exitModalSheet(overlayEl) {
  const key = activeDialogKey;
  applyPresentation(false);
  restoreSheetLayout(overlayEl || activeOverlay);

  activeOverlay = null;
  activeClose = null;
  activeBack = null;
  activeDialogKey = null;

  if (key && urlDialog() === key) {
    if (!handlingPopstate) history.back();
  }

}

// Wywoływane na początku handlera kliknięcia przycisku wstecz w
// topbarze każdej strony, np.:
//   btnBack.addEventListener("click", () => {
//     if (handleSheetBack()) return;
//     location.href = ...; // normalne zachowanie przycisku
//   });
// Zwraca true, gdy przejęło kliknięcie (był otwarty sheet modal).
export function handleSheetBack() {
  if (activeClose) {
    if (activeBack?.() === true) return true;
    if (activeDialogKey && urlDialog() === activeDialogKey) history.back();
    else activeClose();
    return true;
  }
  return false;
}
