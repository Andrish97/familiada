// js/core/modal-sheet.js
// Tryb "sheet" dla rozbudowanych modali na telefonie: zamiast wyśrodkowanego
// okna na przyciemnionym tle, treść strony jest zastępowana treścią modala
// (topbar i stopka zostają widoczne) — patrz css/base.css, sekcja
// "Modal sheet (mobile)".

import { t } from "../../translation/translation.js?v=v2026-09-19T22270";

const SHEET_MQ = "(max-width:600px)";
// .tagsHead – nagłówek modali base-explorer (tagi/eksport/pytanie), ta sama
// rola co .mHead/.uni-head gdzie indziej.
const CLOSE_BTN_SELECTOR = ".mHead button[aria-label], .uni-head button[aria-label], .tagsHead button[aria-label]";

export function isSheetViewport() {
  return window.matchMedia(SHEET_MQ).matches;
}

// overlayEl: element .overlay danego modala. Jeśli podany, dostaje klasę
// .sheet-active (żeby CSS wiedział, KTÓRY z modali na stronie ma zastąpić
// treść — reszta .modal--sheet zostaje ukryta mimo body.sheet-open) i jego
// przycisk zamknięcia dostaje tekst "← Wstecz".
export function enterModalSheet(overlayEl) {
  if (!isSheetViewport()) return;
  document.body.classList.add("sheet-open");
  overlayEl?.classList.add("sheet-active");
  relabelClose(overlayEl, true);
}

export function exitModalSheet(overlayEl) {
  document.body.classList.remove("sheet-open");
  overlayEl?.classList.remove("sheet-active");
  relabelClose(overlayEl, false);
}

function relabelClose(overlayEl, toBack) {
  const btn = overlayEl?.querySelector?.(CLOSE_BTN_SELECTOR);
  if (!btn) return;

  if (toBack) {
    if (btn.dataset.sheetOrigText === undefined) {
      btn.dataset.sheetOrigText = btn.textContent;
    }
    btn.textContent = t("common.modalBack");
  } else if (btn.dataset.sheetOrigText !== undefined) {
    btn.textContent = btn.dataset.sheetOrigText;
    delete btn.dataset.sheetOrigText;
  }
}
