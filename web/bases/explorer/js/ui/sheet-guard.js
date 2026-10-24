// base-explorerjs/ui/sheet-guard.js
// Okna „Szukaj” i „Przenieś do” są w nav-map (dialogs), żeby systemowe
// „Wstecz” na telefonie je zamykało. Wspólny modal-sheet.js umie jednak też
// pokazać takie okno „z adresu” (?dialog=… po odświeżeniu albo „Dalej”
// w historii) — bez treści, bo treść wstawia dopiero nasz kod przy otwarciu.
// Strażnik: okno pokazane, gdy nasz kod go nie otworzył → od razu zamknij
// (exitModalSheet cofa przy tym wpis historii). Pokazanie z adresu oznacza
// modal-sheet.js (data-routed); otwarcie naszym kodem (setOverlayOpen) go zdejmuje.

import { exitModalSheet, setOverlayOpen, isOverlayOpen } from "../../../../shared/js/core/modal-sheet.js?v=v2026-10-24T15410";

export function guardRoutedSheet(overlay, isOpen = () => overlay?.dataset.routed !== "true") {
  if (!overlay) return;
  const dismiss = () => {
    if (isOpen() || !isOverlayOpen(overlay)) return;
    setOverlayOpen(overlay, false);
    exitModalSheet(overlay);
  };
  document.addEventListener("modal-sheet:enter", (e) => {
    if (e.detail?.overlay === overlay) setTimeout(dismiss, 0);
  });
  // wejście z adresu mogło nastąpić, zanim strona podpięła nasłuch
  setTimeout(dismiss, 0);
}
