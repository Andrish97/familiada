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

import { t } from "../../translation/translation.js?v=v2026-10-13T10142";
import { icon, iconText } from "./icons.js?v=v2026-10-13T10142";
import { PAGES, dialogAllowed } from "./nav-map.js?v=v2026-10-13T10142";

const SHEET_MQ = "(max-width:600px)";
const sheetMql = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia(SHEET_MQ)
  : { matches: false, addEventListener() {}, addListener() {} };

let activeClose = null;
let activeBackBtn = null;
let backBtnOrigText = null;
let activeOverlay = null;
let activeKeepBackBtnText = false;
let savedScrollY = 0;
let activeDialogKey = null;
let handlingPopstate = false;
const sheetRoutes = new Map();
let currentPageId = null;

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
      import("./contact-modal.js?v=v2026-10-13T10142").then((module) => module.openContactModal());
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

  if (!activeBackBtn) return;
  // Niektóre przyciski (np. #btnMailBackTopbar w podglądzie maila) to sama
  // strzałka "←" — dla nich pomijamy dopisywanie "Wstecz", bo dublowałoby
  // się z ich naturalnym, już oczywistym znaczeniem w kontekście wątku.
  if (!activeKeepBackBtnText) {
    activeBackBtn.innerHTML = matches ? iconText("arrow-left", t("common.modalBack")) : backBtnOrigText;
  }
  // Znacznik "to JEST aktywny przycisk wstecz teraz" — potrzebny bo np.
  // games.html/settings.html mają dodatkowy, dedykowany #btnBackSheet
  // (klasa .topbar-sheet-back) pokazywany WYŁĄCZNIE gdy jest aktywny —
  // inaczej pokazywałby się zawsze przy body.sheet-open, nawet gdy dany
  // modal (np. podgląd maila w settings) faktycznie przejął INNY,
  // istniejący przycisk (#btnMailBackTopbar) — dwa widoczne "wstecz" naraz.
  activeBackBtn.classList.toggle("sheet-back-active", matches);
}

function onSheetMqChange(e) {
  if (!activeClose) return; // żaden sheet modal aktualnie otwarty
  applyPresentation(e.matches);
}
sheetMql.addEventListener?.("change", onSheetMqChange) ?? sheetMql.addListener?.(onSheetMqChange);

// overlayEl: element .overlay (lub .market-preview-overlay) danego modala.
// opts.backBtn: istniejący przycisk wstecz w topbarze strony — dostaje
//   tekst "← Wstecz" na czas otwarcia modala (i z powrotem, żywo, jeśli
//   ekran zmieni szerokość podczas gdy modal jest otwarty).
// opts.onClose: funkcja zamykająca TEN modal — wywoływana przez
//   handleSheetBack() gdy użytkownik kliknie przycisk wstecz w topbarze.
export function enterModalSheet(overlayEl, { backBtn, onClose, keepBackBtnText = false, historyKey = overlayEl?.id, restore = false } = {}) {
  if (!isSheetViewport()) return;
  if (!historyKey || !dialogAllowed(currentPageId, historyKey)) historyKey = null;

  // Wymuszone main.wrap{overflow:hidden;height:calc(100dvh - topbar-h)} w
  // trybie sheet (css/base.css) nagle kurczy przewijalny obszar strony (np.
  // marketplace.html mają scroll na całym body) — przeglądarka
  // wtedy sama przycina window.scrollY do nowego, mniejszego zakresu, więc
  // pozycja scrolla jest tracona NA ZAWSZE, jeszcze zanim modal się zamknie.
  // Zapamiętujemy ją tutaj i przywracamy w exitModalSheet(), żeby strona po
  // zamknięciu modala wróciła w to samo miejsce, a nie na sam początek.
  savedScrollY = window.scrollY;

  activeOverlay = overlayEl || null;
  activeClose = onClose || null;
  activeKeepBackBtnText = keepBackBtnText;
  activeDialogKey = historyKey || null;
  const currentKey = urlDialog();
  if (activeDialogKey && currentKey !== activeDialogKey) {
    setUrlDialog(activeDialogKey, !restore);
  }
  if (activeDialogKey) sheetRoutes.set(activeDialogKey, { overlay: overlayEl, options: { backBtn, onClose, keepBackBtnText } });

  if (backBtn) {
    activeBackBtn = backBtn;
    backBtnOrigText = backBtn.innerHTML;
  }

  applyPresentation(true);
}

export function exitModalSheet(overlayEl) {
  const key = activeDialogKey;
  applyPresentation(false);

  activeOverlay = null;
  activeBackBtn = null;
  backBtnOrigText = null;
  activeClose = null;
  activeKeepBackBtnText = false;
  activeDialogKey = null;

  if (key && urlDialog() === key) {
    if (!handlingPopstate) history.back();
  }

  // Poczekaj na przeliczenie layoutu (main.wrap wraca do swojej normalnej,
  // przewijalnej wysokości) zanim przywrócimy scroll — w tej samej klatce
  // co zdjęcie klasy sheet-open przeglądarka może jeszcze nie mieć
  // odtworzonego pełnego, oryginalnego zakresu przewijania.
  const y = savedScrollY;
  requestAnimationFrame(() => window.scrollTo(0, y));
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
    if (activeDialogKey && urlDialog() === activeDialogKey) history.back();
    else activeClose();
    return true;
  }
  return false;
}
