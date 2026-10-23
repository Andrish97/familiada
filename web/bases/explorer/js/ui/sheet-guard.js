// base-explorerjs/ui/sheet-guard.js
// Okna „Szukaj” i „Przenieś do” są w nav-map (dialogs), żeby systemowe
// „Wstecz” na telefonie je zamykało. Wspólny modal-sheet.js umie jednak też
// pokazać takie okno „z adresu” (?dialog=… po odświeżeniu albo „Dalej”
// w historii) — bez treści, bo treść wstawia dopiero nasz kod przy otwarciu.
// Strażnik: okno pokazane, gdy nasz kod go nie otworzył → od razu zamknij
// (exitModalSheet cofa przy tym wpis historii). Okna menedżera otwierane
// przez nasz kod mają display:grid, wejście z adresu zostawia display:"".

import { exitModalSheet } from "../../../../shared/js/core/modal-sheet.js?v=v2026-10-23T05424";

export function guardRoutedSheet(overlay, isOpen = () => overlay?.style.display === "grid") {
  if (!overlay) return;
  const dismiss = () => {
    if (isOpen() || overlay.style.display === "none") return;
    overlay.style.display = "none";
    exitModalSheet(overlay);
  };
  document.addEventListener("modal-sheet:enter", (e) => {
    if (e.detail?.overlay === overlay) setTimeout(dismiss, 0);
  });
  // wejście z adresu mogło nastąpić, zanim strona podpięła nasłuch
  setTimeout(dismiss, 0);
}
