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

import { t } from "../../translation/translation.js?v=v2026-09-19T22270";

const SHEET_MQ = "(max-width:600px)";

let activeClose = null;
let activeBackBtn = null;
let backBtnOrigText = null;

export function isSheetViewport() {
  return window.matchMedia(SHEET_MQ).matches;
}

// overlayEl: element .overlay (lub .market-preview-overlay) danego modala.
// opts.backBtn: istniejący przycisk wstecz w topbarze strony — dostaje
//   tekst "← Wstecz" na czas otwarcia modala.
// opts.onClose: funkcja zamykająca TEN modal — wywoływana przez
//   handleSheetBack() gdy użytkownik kliknie przycisk wstecz w topbarze.
export function enterModalSheet(overlayEl, { backBtn, onClose } = {}) {
  if (!isSheetViewport()) return;

  document.body.classList.add("sheet-open");
  overlayEl?.classList.add("sheet-active");

  activeClose = onClose || null;

  if (backBtn) {
    activeBackBtn = backBtn;
    backBtnOrigText = backBtn.textContent;
    backBtn.textContent = t("common.modalBack");
  }
}

export function exitModalSheet(overlayEl) {
  document.body.classList.remove("sheet-open");
  overlayEl?.classList.remove("sheet-active");

  if (activeBackBtn) {
    activeBackBtn.textContent = backBtnOrigText;
    activeBackBtn = null;
    backBtnOrigText = null;
  }
  activeClose = null;
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
