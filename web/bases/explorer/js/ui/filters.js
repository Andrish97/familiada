// base-explorerjs/ui/filters.js
// Okno „Filtry” na telefonie (decyzja użytkownika 2026-10-21): w wysuwanym
// panelu zostaje samo drzewo, a proponowane kategorie i tagi otwiera
// przycisk przy wyszukiwarce. Okno nie ma własnej listy — na czas otwarcia
// przenosi do siebie ten sam blok #leftFilters (render.js: renderLeft,
// ui/left.js: kliknięcia, przytrzymanie, „Dodaj tag”), więc zachowanie jest
// identyczne jak w lewym panelu na komputerze.

import { setQuery } from "../state.js?v=v2026-10-21T06490";
import { renderAll } from "../render.js?v=v2026-10-21T06490";
import { enterModalSheet, exitModalSheet } from "../../../../shared/js/core/modal-sheet.js?v=v2026-10-21T06490";

const DESKTOP_QUERY = "(min-width: 901px)";

export function wireFilters(state) {
  const overlay = document.getElementById("filtersOverlay");
  const body = document.getElementById("filtersBody");
  const filters = document.getElementById("leftFilters");
  if (!overlay || !body || !filters) return;
  const home = filters.parentElement;
  const homeNext = filters.nextSibling;
  let open = false;

  function show() {
    if (open) return;
    open = true;
    body.append(filters);
    overlay.style.display = "grid";
    enterModalSheet(overlay, { onClose: hide });
  }

  function hide() {
    if (!open) return;
    open = false;
    exitModalSheet(overlay);
    overlay.style.display = "none";
    home.insertBefore(filters, homeNext?.parentNode === home ? homeNext : null);
  }

  document.getElementById("btnFilters")?.addEventListener("click", show);
  document.getElementById("filtersClose")?.addEventListener("click", hide);
  document.getElementById("filtersDone")?.addEventListener("click", hide);
  document.getElementById("filtersClear")?.addEventListener("click", () => {
    setQuery(state, { tagIds: [], types: [] });
    renderAll(state);
  });
  // klik w tło (okno wyśrodkowane na szerszym ekranie dotykowym)
  overlay.addEventListener("click", (e) => { if (e.target === overlay) hide(); });
  // przejście na układ komputera: filtry wracają do lewego panelu
  window.matchMedia?.(DESKTOP_QUERY).addEventListener?.("change", (e) => { if (e.matches) hide(); });
}
