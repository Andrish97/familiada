// base-explorerjs/ui/search.js
// Pole wyszukiwania: tekst zapytania, tabletki tagów i podpowiedzi tagów.
// #tag rozpoznawany w zdarzeniu „input” (działa z każdą klawiaturą, także
// ekranową na telefonie, która nie podaje klawiszy w „keydown”):
// - po wpisaniu „#” pokazuje pasujące tagi (strzałki + Enter / stuknięcie),
// - „#pełna_nazwa” + spacja zamienia się w tabletkę (spacja nie zostaje),
// - tabletki to te same tagi co zaznaczenie w lewym panelu (query.tagIds).

import { setQuery, clearQuery } from "../state.js?v=v2026-10-20T23220";
import { renderAll } from "../render.js?v=v2026-10-20T23220";
import { normalizeText, hashTokenBeforeCaret, textWithoutHashTokens } from "../data/listing.js?v=v2026-10-20T23220";

const TEXT_DELAY_MS = 200;
const MAX_SUGGESTIONS = 8;

export function wireSearch(state) {
  const toolbarEl = document.getElementById("toolbar");
  const inp = () => document.getElementById("searchText");
  const box = () => document.getElementById("searchSuggest");

  let textTimer = null;
  let suggestions = []; // [{ id, name, color }]
  let active = 0;
  let token = null;     // { start, name } dla podpowiedzi

  const tags = () => state.store?.tags || [];

  function applyText(value) {
    clearTimeout(textTimer);
    textTimer = setTimeout(() => {
      const text = textWithoutHashTokens(value);
      if (text === state.query.text) return;
      setQuery(state, { text });
      renderAll(state);
    }, TEXT_DELAY_MS);
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

  toolbarEl?.addEventListener("input", (e) => {
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

  toolbarEl?.addEventListener("keydown", (e) => {
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
  toolbarEl?.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".search-suggest-item[data-tag-id]");
    if (!item) return;
    e.preventDefault();
    const el = inp();
    if (el && token) addTag(item.dataset.tagId, el, token);
  });

  toolbarEl?.addEventListener("focusout", (e) => {
    if (e.target?.id === "searchText") setTimeout(hideSuggestions, 150);
  });

  toolbarEl?.addEventListener("click", (e) => {
    // klik w tabletkę zdejmuje tag
    const chip = e.target.closest(".chip[data-tag-id]");
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
}
