// base-explorerjs/ui/search.js
// Pole wyszukiwania: sam tekst zapytania (decyzja użytkownika 2026-10-21 —
// wyszukiwanie i filtry działają razem, tagi i kategorie filtruje się
// w lewym panelu, bez tabletek i „#tag” w polu). Tekst łączy się z filtrami
// z panelu (AND); „X” przy polu czyści tekst i filtry.
// Telefon: pole w pasku jest jednoliniowym podglądem; stuknięcie otwiera okno
// „Szukaj” (#searchOverlay), do którego na czas edycji przenosimy to samo
// pole — dlatego nasłuch jest na dokumencie, nie na #toolbar.

import { setQuery, clearQuery } from "../state.js?v=v2026-10-21T12512";
import { renderAll, isNarrow } from "../render.js?v=v2026-10-21T12512";
import { enterModalSheet, exitModalSheet } from "../../../../shared/js/core/modal-sheet.js?v=v2026-10-21T12512";
import { guardRoutedSheet } from "./sheet-guard.js?v=v2026-10-21T12512";

const TEXT_DELAY_MS = 200;

// Wpisany tekst czeka 200 ms; zmiana filtra z innego miejsca (lewy panel)
// najpierw go zatwierdza — inaczej klik w tag tuż po wyczyszczeniu pola
// łączyłby się jeszcze ze starym tekstem.
let commitPending = () => {};
export function commitPendingSearch() {
  commitPending();
}

export function wireSearch(state) {
  const root = document; // pole bywa w pasku albo w oknie „Szukaj”
  const inp = () => document.getElementById("searchText");

  let textTimer = null;

  function commitText(value) {
    clearTimeout(textTimer);
    textTimer = null;
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text === state.query.text) return;
    setQuery(state, { text });
    renderAll(state);
  }

  commitPending = () => {
    const el = inp();
    if (textTimer && el) commitText(el.value);
  };

  function clearAll() {
    clearTimeout(textTimer);
    textTimer = null;
    const el = inp();
    if (el) el.value = "";
    clearQuery(state);
    renderAll(state);
  }

  root.addEventListener("input", (e) => {
    const el = e.target;
    if (el?.id !== "searchText") return;
    clearTimeout(textTimer);
    textTimer = setTimeout(() => commitText(el.value), TEXT_DELAY_MS);
  });

  // Enter zatwierdza od razu (bez czekania 200 ms)
  root.addEventListener("keydown", (e) => {
    if (e.target?.id === "searchText" && e.key === "Enter") commitText(e.target.value);
  });

  root.addEventListener("click", (e) => {
    // telefon: stuknięcie w podgląd w pasku otwiera okno
    if (isNarrow() && !sheet.isOpen() && e.target.closest("#searchBox")) { sheet.open(); return; }
    // lupa / X: z aktywnym tekstem lub filtrem czyści wszystko, bez nich — pole
    if (e.target.closest("#searchSubmitBtn")) {
      e.preventDefault();
      const el = inp();
      const any = !!el?.value.trim() || state.query.text || state.query.tagIds.length || state.query.types.length;
      if (!any) { if (isNarrow() && !sheet.isOpen()) sheet.open(); else el?.focus(); return; }
      clearAll();
      return;
    }
    if (e.target.closest("#searchBox")) inp()?.focus();
  });

  const sheet = wireSearchSheet(state, { clear: clearAll, commit: () => commitPending() });
}

// Okno „Szukaj” na telefonie: przenosi #searchBox z paska do okna na czas
// edycji i oddaje go przy zamknięciu.
function wireSearchSheet(state, { clear, commit }) {
  const overlay = document.getElementById("searchOverlay");
  const body = document.getElementById("searchSheetBody");
  let open = false;
  let home = null;

  function onKey(e) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    hide();
  }

  function show() {
    const box = document.getElementById("searchBox");
    if (!overlay || !body || !box || open) return;
    open = true;
    // szuflada lewego panelu (mobile.js) — także przy 601–900 px z myszą,
    // gdzie okno nie przechodzi w tryb od dołu i nie wysyła modal-sheet:enter
    document.dispatchEvent(new CustomEvent("explorer:close-drawer"));
    home = { parent: box.parentElement, next: box.nextSibling };
    body.append(box);
    overlay.style.display = "grid";
    enterModalSheet(overlay, { onClose: hide });
    document.addEventListener("keydown", onKey, true);
    document.getElementById("searchText")?.focus();
  }

  function hide() {
    if (!open) return;
    open = false;
    commit();
    document.removeEventListener("keydown", onKey, true);
    exitModalSheet(overlay);
    overlay.style.display = "none";
    const box = document.getElementById("searchBox");
    if (home?.parent && box) home.parent.insertBefore(box, home.next?.parentNode === home.parent ? home.next : null);
    renderAll(state);
    // fokus na przycisku w pasku (pole w pasku to podgląd, bez klawiatury)
    document.getElementById("searchSubmitBtn")?.focus({ preventScroll: true });
  }

  document.getElementById("searchSheetDone")?.addEventListener("click", hide);
  document.getElementById("searchSheetClose")?.addEventListener("click", hide);
  document.getElementById("searchSheetClear")?.addEventListener("click", () => { clear(); document.getElementById("searchText")?.focus(); });
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) hide(); });
  // Enter w polu zatwierdza i zamyka okno
  document.addEventListener("keydown", (e) => {
    if (!open || e.key !== "Enter" || e.target?.id !== "searchText") return;
    e.preventDefault();
    hide();
  });
  window.matchMedia?.("(max-width: 900px)").addEventListener?.("change", (e) => { if (!e.matches) hide(); });

  guardRoutedSheet(overlay, () => open);
  return { open: show, close: hide, isOpen: () => open };
}
