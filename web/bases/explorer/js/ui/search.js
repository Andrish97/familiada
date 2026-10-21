// base-explorerjs/ui/search.js
// Pole wyszukiwania: tekst zapytania, tabletki tagów i podpowiedzi tagów.
// #tag rozpoznawany w zdarzeniu „input” (działa z każdą klawiaturą, także
// ekranową na telefonie, która nie podaje klawiszy w „keydown”):
// - po wpisaniu „#” pokazuje pasujące tagi (strzałki + Enter / stuknięcie),
// - „#pełna_nazwa” + spacja zamienia się w tabletkę (spacja nie zostaje),
// - tabletki to te same tagi co zaznaczenie w lewym panelu (query.tagIds).
// Telefon (decyzja użytkownika 2026-10-21): pole w pasku jest jednoliniowym
// podglądem; stuknięcie otwiera okno „Szukaj” (#searchOverlay), do którego
// na czas edycji przenosimy to samo pole, tabletki i podpowiedzi — dlatego
// nasłuch jest na dokumencie, nie na #toolbar.

import { setQuery, clearQuery } from "../state.js?v=v2026-10-21T07421";
import { renderAll } from "../render.js?v=v2026-10-21T07421";
import { normalizeText, hashTokenBeforeCaret, textWithoutHashTokens } from "../data/listing.js?v=v2026-10-21T07421";
import { enterModalSheet, exitModalSheet } from "../../../../shared/js/core/modal-sheet.js?v=v2026-10-21T07421";
import { isNarrow } from "../render.js?v=v2026-10-21T07421";

const TEXT_DELAY_MS = 200;
const MAX_SUGGESTIONS = 8;

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
  const box = () => document.getElementById("searchSuggest");

  let textTimer = null;
  let suggestions = []; // [{ id, name, color }]
  let active = 0;
  let token = null;     // { start, name } dla podpowiedzi

  const tags = () => state.store?.tags || [];

  function commitText(value) {
    clearTimeout(textTimer);
    textTimer = null;
    const text = textWithoutHashTokens(value);
    if (text === state.query.text) return;
    setQuery(state, { text });
    renderAll(state);
  }

  commitPending = () => {
    const el = inp();
    if (textTimer && el) commitText(el.value);
  };

  function applyText(value) {
    clearTimeout(textTimer);
    textTimer = setTimeout(() => commitText(value), TEXT_DELAY_MS);
  }

  function addTag(tagId, el, tok) {
    // usuń „#nazwa” (i spację za nią) z pola
    const v = el.value;
    let end = tok.start + 1 + tok.name.length;
    if (v[end] === " ") end += 1;
    const next = (v.slice(0, tok.start) + v.slice(end)).replace(/\s{2,}/g, " ");
    el.value = next.trimStart();
    const caret = Math.min(tok.start, el.value.length);
    try { el.setSelectionRange(caret, caret); } catch {}
    hideSuggestions();
    if (!state.query.tagIds.includes(tagId)) {
      setQuery(state, { tagIds: [...state.query.tagIds, tagId], text: textWithoutHashTokens(el.value) });
      renderAll(state);
    }
  }

  function renderSuggestions() {
    const el = box();
    if (!el) return;
    if (!suggestions.length) { hideSuggestions(); return; }
    el.innerHTML = suggestions.map((tg, i) => `
      <button type="button" class="search-suggest-item${i === active ? " is-active" : ""}" data-tag-id="${tg.id}" role="option">
        <span class="tag-dot" style="background:${tg.color || "rgba(255,255,255,.25)"}"></span>#${tg.name.replace(/[&<>"']/g, "")}
      </button>`).join("");
    el.hidden = false;
  }

  function hideSuggestions() {
    suggestions = [];
    token = null;
    const el = box();
    if (el) { el.hidden = true; el.innerHTML = ""; }
  }

  function updateSuggestions(el) {
    token = hashTokenBeforeCaret(el.value, el.selectionStart ?? el.value.length);
    if (!token) { hideSuggestions(); return; }
    const q = normalizeText(token.name);
    const taken = new Set(state.query.tagIds);
    const scored = tags()
      .filter((tg) => !taken.has(tg.id))
      .map((tg) => ({ tg, n: normalizeText(tg.name) }))
      .filter(({ n }) => n.includes(q))
      .sort((a, b) => (b.n.startsWith(q) - a.n.startsWith(q)) || a.n.localeCompare(b.n));
    suggestions = scored.slice(0, MAX_SUGGESTIONS).map(({ tg }) => tg);
    active = 0;
    renderSuggestions();
  }

  root.addEventListener("input", (e) => {
    const el = e.target;
    if (el?.id !== "searchText") return;

    // „#pełna_nazwa” + spacja → tabletka
    const caret = el.selectionStart ?? el.value.length;
    if (el.value[caret - 1] === " ") {
      const tok = hashTokenBeforeCaret(el.value, caret - 1);
      const tag = tok && tags().find((tg) => normalizeText(tg.name) === normalizeText(tok.name));
      if (tag) { addTag(tag.id, el, tok); return; }
    }
    updateSuggestions(el);
    applyText(el.value);
  });

  root.addEventListener("keydown", (e) => {
    const el = e.target;
    if (el?.id !== "searchText") return;

    if (suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
        renderSuggestions();
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && token) {
        e.preventDefault();
        addTag(suggestions[active].id, el, token);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        hideSuggestions();
        return;
      }
    }

    // Backspace na pustym polu zdejmuje ostatnią tabletkę
    if (e.key === "Backspace" && !el.value && state.query.tagIds.length) {
      e.preventDefault();
      setQuery(state, { tagIds: state.query.tagIds.slice(0, -1) });
      renderAll(state);
    }
  });

  // podpowiedź: mousedown, żeby pole nie straciło fokusu przed wyborem
  root.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".search-suggest-item[data-tag-id]");
    if (!item) return;
    e.preventDefault();
    const el = inp();
    if (el && token) addTag(item.dataset.tagId, el, token);
  });

  root.addEventListener("focusout", (e) => {
    if (e.target?.id === "searchText") setTimeout(hideSuggestions, 150);
  });

  root.addEventListener("click", (e) => {
    // telefon: stuknięcie w podgląd w pasku (także w tabletkę) otwiera okno
    if (isNarrow() && !sheet.isOpen() && e.target.closest("#searchBox")) { sheet.open(); return; }
    // klik w tabletkę zdejmuje tag
    const chip = e.target.closest("#searchChips .chip[data-tag-id]");
    if (chip) {
      setQuery(state, { tagIds: state.query.tagIds.filter((id) => id !== chip.dataset.tagId) });
      renderAll(state);
      inp()?.focus();
      return;
    }
    // lupa / X: z aktywnym filtrem czyści go, bez filtra ustawia fokus
    if (e.target.closest("#searchSubmitBtn")) {
      e.preventDefault();
      const el = inp();
      const any = !!el?.value.trim() || state.query.text || state.query.tagIds.length || state.query.types.length;
      if (!any) { el?.focus(); return; }
      clearTimeout(textTimer);
      if (el) el.value = "";
      hideSuggestions();
      clearQuery(state);
      renderAll(state);
      return;
    }
    if (e.target.closest("#searchBox")) inp()?.focus();
  });

  const sheet = wireSearchSheet(state, { clear: () => {
    clearTimeout(textTimer);
    const el = inp();
    if (el) el.value = "";
    hideSuggestions();
    clearQuery(state);
    renderAll(state);
  }, commit: () => commitPending() });
}

// Okno „Szukaj” na telefonie: przenosi #searchBox i #searchSuggest z paska
// do okna na czas edycji i oddaje je przy zamknięciu.
function wireSearchSheet(state, { clear, commit }) {
  const overlay = document.getElementById("searchOverlay");
  const body = document.getElementById("searchSheetBody");
  let open = false;
  let home = null;

  function onKey(e) {
    if (e.key !== "Escape" || document.getElementById("searchSuggest")?.hidden === false) return;
    e.preventDefault();
    e.stopPropagation();
    hide();
  }

  function show() {
    const box = document.getElementById("searchBox");
    const suggest = document.getElementById("searchSuggest");
    if (!overlay || !body || !box || open) return;
    open = true;
    home = { parent: box.parentElement, next: box.nextSibling };
    body.append(box);
    if (suggest) body.append(suggest);
    overlay.style.display = "grid";
    enterModalSheet(overlay, { onClose: hide });
    document.addEventListener("keydown", onKey, true);
    const inp = document.getElementById("searchText");
    inp?.focus();
  }

  function hide() {
    if (!open) return;
    open = false;
    commit();
    document.removeEventListener("keydown", onKey, true);
    exitModalSheet(overlay);
    overlay.style.display = "none";
    const box = document.getElementById("searchBox");
    const suggest = document.getElementById("searchSuggest");
    if (home?.parent && box) {
      home.parent.insertBefore(box, home.next?.parentNode === home.parent ? home.next : null);
      if (suggest) home.parent.append(suggest);
    }
    document.getElementById("searchText")?.blur();
    renderAll(state);
  }

  document.getElementById("searchSheetDone")?.addEventListener("click", hide);
  document.getElementById("searchSheetClose")?.addEventListener("click", hide);
  document.getElementById("searchSheetClear")?.addEventListener("click", () => { clear(); document.getElementById("searchText")?.focus(); });
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) hide(); });
  // Enter w polu (bez podpowiedzi) zatwierdza i zamyka okno
  document.addEventListener("keydown", (e) => {
    // podpowiedź tagu obsłużył już nasłuch pola (preventDefault)
    if (!open || e.key !== "Enter" || e.target?.id !== "searchText" || e.defaultPrevented) return;
    e.preventDefault();
    hide();
  });
  window.matchMedia?.("(max-width: 900px)").addEventListener?.("change", (e) => { if (!e.matches) hide(); });

  return { open: show, close: hide, isOpen: () => open };
}
