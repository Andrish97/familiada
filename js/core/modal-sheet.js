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

import { t } from "../../translation/translation.js?v=v2026-09-25T07201";
import { icon, iconText } from "./icons.js?v=v2026-09-25T07201";

const SHEET_MQ = "(max-width:600px)";
const sheetMql = window.matchMedia(SHEET_MQ);

let activeClose = null;
let activeBackBtn = null;
let backBtnOrigText = null;
let activeOverlay = null;
let activeKeepBackBtnText = false;
let savedScrollY = 0;

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
export function enterModalSheet(overlayEl, { backBtn, onClose, keepBackBtnText = false } = {}) {
  if (!isSheetViewport()) return;

  // Wymuszone main.wrap{overflow:hidden;height:calc(100dvh - topbar-h)} w
  // trybie sheet (css/base.css) nagle kurczy przewijalny obszar strony (np.
  // marketplace.html/polls-hub.html mają scroll na całym body) — przeglądarka
  // wtedy sama przycina window.scrollY do nowego, mniejszego zakresu, więc
  // pozycja scrolla jest tracona NA ZAWSZE, jeszcze zanim modal się zamknie.
  // Zapamiętujemy ją tutaj i przywracamy w exitModalSheet(), żeby strona po
  // zamknięciu modala wróciła w to samo miejsce, a nie na sam początek.
  savedScrollY = window.scrollY;

  activeOverlay = overlayEl || null;
  activeClose = onClose || null;
  activeKeepBackBtnText = keepBackBtnText;

  if (backBtn) {
    activeBackBtn = backBtn;
    backBtnOrigText = backBtn.innerHTML;
  }

  applyPresentation(true);
}

export function exitModalSheet(overlayEl) {
  applyPresentation(false);

  activeOverlay = null;
  activeBackBtn = null;
  backBtnOrigText = null;
  activeClose = null;
  activeKeepBackBtnText = false;

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
    activeClose();
    return true;
  }
  return false;
}
