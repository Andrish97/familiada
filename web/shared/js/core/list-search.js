// list-search.js
// Wyszukiwanie po nazwie na stronach list (gry, bazy, logo): pole w lewej
// części dolnego paska (.games-bottom-left) filtruje kafle w siatkach strony.
// Kafel „+” (.addCard) zostaje zawsze. Filtr działa też na kafle dorysowane
// później (zmiana karty, odświeżenie) — MutationObserver na siatkach.
// Szukanej frazy nie zapamiętujemy (docs/ujednolicenie-wygladu.md, sekcja 1).
// Opcjonalny filtr (opcja filter): lista rozwijana przed polem szukania, ten
// sam wygląd co sortowanie w Subskrypcjach; wartość w adresie (?param=).
// Kafel niesie wartość w atrybucie data-* (filter.attr).

import { t } from "../../translation/translation.js?v=v2026-10-09T17383";
import { icon } from "./icons.js?v=v2026-10-09T17383";
import { initUiSelect } from "./ui-select.js?v=v2026-10-09T17383";
import { filterFromSearch, filterToHref, matchesFilter, showEmptyResult } from "./list-filter.js?v=v2026-10-09T17383";

const norm = (s) => String(s || "").toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * @param {object} o
 * @param {string} o.grids     selektor siatek (np. "#grid", "#mineGrid, #sharedGrid")
 * @param {string} o.tile      selektor kafla (np. ".card", ".logoTile")
 * @param {string} o.name      selektor nazwy w kaflu (np. ".name", ".logoName")
 * @param {object} [o.filter]
 * @param {string} o.filter.param    parametr adresu (np. "status")
 * @param {string} o.filter.attr     klucz dataset kafla (np. "status" -> data-status)
 * @param {Array<{value:string,labelKey:string}>} o.filter.options  bez pozycji „wszystko”
 * @param {string} o.filter.allKey   klucz tłumaczenia „wszystkie”
 * @param {string} o.filter.ariaKey  klucz tłumaczenia etykiety listy
 */
export function initListSearch({ grids, tile, name, filter }) {
  const slot = document.querySelector(".games-bottom-left");
  if (!slot) return;
  // Ten sam komponent co w menedżerze bazy (.searchBox, base.css).
  const box = document.createElement("div");
  box.className = "searchBox list-search";
  const input = document.createElement("input");
  input.type = "search";
  input.className = "searchText";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "btn ghost";
  clear.innerHTML = icon("close");
  const label = () => {
    input.placeholder = t("common.searchByName");
    input.setAttribute("aria-label", t("common.searchByName"));
    clear.title = t("baseExplorer.search.clear");
    clear.setAttribute("aria-label", t("baseExplorer.search.clear"));
  };
  label();
  box.append(input, clear);
  slot.appendChild(box);

  let filterValue = "";
  let filterApi = null;
  if (filter) {
    filterValue = filterFromSearch(location.search, filter.param, filter.options.map((o) => o.value));
    const wrap = document.createElement("div");
    wrap.className = "ui-select list-filter";
    wrap.innerHTML = `<button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false"><span class="ui-select-label">—</span><span class="ui-select-caret" aria-hidden="true"><i class="ico" data-icon="caret-down"></i></span></button><div class="ui-select-menu" role="listbox"></div>`;
    slot.insertBefore(wrap, box);
    const opts = () => [{ value: "", label: t(filter.allKey) }, ...filter.options.map((o) => ({ value: o.value, label: t(o.labelKey) }))];
    const aria = () => wrap.querySelector(".ui-select-btn")?.setAttribute("aria-label", t(filter.ariaKey));
    aria();
    filterApi = initUiSelect(wrap, {
      options: opts(),
      value: filterValue,
      onChange: (val) => {
        filterValue = String(val || "");
        history.replaceState(history.state, "", filterToHref(location.href, filter.param, filterValue));
        apply();
      },
    });
    window.addEventListener("i18n:lang", () => { aria(); filterApi.setOptions(opts()); });
  }

  const emptyEls = new Map();
  const emptyFor = (grid) => {
    let el = emptyEls.get(grid);
    if (!el) {
      el = document.createElement("div");
      el.className = "list-empty";
      el.hidden = true;
      grid.after(el);
      emptyEls.set(grid, el);
    }
    el.textContent = t("common.noResults");
    return el;
  };

  const apply = () => {
    const q = norm(input.value);
    for (const grid of document.querySelectorAll(grids)) {
      let total = 0, visible = 0;
      for (const el of grid.querySelectorAll(tile)) {
        if (el.classList.contains("addCard")) continue;
        total++;
        const hit = (!q || norm(el.querySelector(name)?.textContent).includes(q))
          && (!filter || matchesFilter(el.dataset[filter.attr], filterValue));
        el.hidden = !hit;
        if (hit) visible++;
      }
      emptyFor(grid).hidden = !showEmptyResult({ hasQuery: !!q, filterValue, total, visible });
    }
  };
  input.addEventListener("input", apply);
  clear.addEventListener("click", () => { input.value = ""; apply(); input.focus(); });
  const mo = new MutationObserver(() => { if (input.value || filterValue) apply(); });
  for (const grid of document.querySelectorAll(grids)) mo.observe(grid, { childList: true });
  window.addEventListener("i18n:lang", () => { label(); apply(); });
  apply();
}
