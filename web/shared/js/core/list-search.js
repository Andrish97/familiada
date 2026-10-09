// list-search.js
// Wyszukiwanie po nazwie na stronach list (gry, bazy, logo): pole w lewej
// części dolnego paska (.games-bottom-left) filtruje kafle w siatkach strony.
// Kafel „+” (.addCard) zostaje zawsze. Filtr działa też na kafle dorysowane
// później (zmiana karty, odświeżenie) — MutationObserver na siatkach.
// Szukanej frazy nie zapamiętujemy (docs/ujednolicenie-wygladu.md, sekcja 1).
// Opcjonalny filtr (opcja filter): lista rozwijana przed polem szukania, ten
// sam wygląd co sortowanie w Subskrypcjach; wartość w adresie (?param=).
// Kafel niesie wartość w atrybucie data-* (filter.attr).

import { t } from "../../translation/translation.js?v=v2026-10-09T20233";
import { icon } from "./icons.js?v=v2026-10-09T20233";
import { initUiSelect } from "./ui-select.js?v=v2026-10-09T20233";
import { filterFromSearch, filterToHref, matchesFilter, showEmptyResult } from "./list-filter.js?v=v2026-10-09T20233";

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
 * @param {object} [o.sort]          sortowanie kafli w siatce (lista rozwijana przed filtrem)
 * @param {string} o.sort.param      parametr adresu (np. "sort")
 * @param {string} o.sort.ariaKey    klucz tłumaczenia etykiety listy
 * @param {string} o.sort.defaultKey klucz tłumaczenia pozycji domyślnej (ostatnio zmienione)
 * @param {Array<{value:"created"|"name",labelKey:string}>} o.sort.options
 *   kafel niesie data-created / data-updated (ISO) i nazwę w `name`; bez tych
 *   atrybutów (np. rynek) siatka zostaje w kolejności z serwera.
 */
export function initListSearch({ grids, tile, name, filter, sort }) {
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

  let sortValue = "";
  if (sort) {
    sortValue = filterFromSearch(location.search, sort.param, sort.options.map((o) => o.value));
    const wrapS = document.createElement("div");
    wrapS.className = "ui-select list-sort";
    wrapS.innerHTML = `<button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false"><span class="ui-select-label">—</span><span class="ui-select-caret" aria-hidden="true"><i class="ico" data-icon="caret-down"></i></span></button><div class="ui-select-menu" role="listbox"></div>`;
    slot.insertBefore(wrapS, slot.firstChild);
    const optsS = () => [{ value: "", label: t(sort.defaultKey) }, ...sort.options.map((o) => ({ value: o.value, label: t(o.labelKey) }))];
    const ariaS = () => wrapS.querySelector(".ui-select-btn")?.setAttribute("aria-label", t(sort.ariaKey));
    ariaS();
    const apiS = initUiSelect(wrapS, {
      options: optsS(),
      value: sortValue,
      onChange: (val) => {
        sortValue = String(val || "");
        history.replaceState(history.state, "", filterToHref(location.href, sort.param, sortValue));
        apply();
      },
    });
    window.addEventListener("i18n:lang", () => { ariaS(); apiS.setOptions(optsS()); apply(); });
  }

  // Układa kafle (bez .addCard, który zostaje pierwszy) wg wybranego sortowania.
  // Dotyka DOM tylko, gdy kolejność się zmienia (MutationObserver nie zapętla się).
  const sortGrid = (grid) => {
    if (!sort) return;
    const tiles = [...grid.querySelectorAll(tile)].filter((el) => !el.classList.contains("addCard") && el.parentElement === grid);
    if (tiles.length < 2 || tiles.some((el) => !el.dataset.updated && !el.dataset.created)) return;
    const stamp = (el, k) => Date.parse(el.dataset[k] || el.dataset.created || "") || 0;
    const nm = (el) => norm(el.querySelector(name)?.textContent);
    const cmp = sortValue === "name" ? (a, b) => nm(a).localeCompare(nm(b), "pl")
      : sortValue === "created" ? (a, b) => stamp(b, "created") - stamp(a, "created")
      : (a, b) => stamp(b, "updated") - stamp(a, "updated");
    const sorted = [...tiles].sort(cmp);
    if (sorted.every((el, i) => el === tiles[i])) return;
    for (const el of sorted) grid.appendChild(el);
  };

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
      sortGrid(grid);
      let total = 0, visible = 0;
      for (const el of grid.querySelectorAll(tile)) {
        if (el.classList.contains("addCard")) continue;
        total++;
        const hit = (!q || norm(el.querySelector(name)?.textContent).includes(q))
          && (!filter || matchesFilter(el.dataset[filter.attr], filterValue));
        el.hidden = !hit;
        if (hit) visible++;
      }
      // sekcje udostępniania (share-sections.js): bez widocznych wierszy znikają razem z nagłówkiem
      for (const sec of grid.querySelectorAll(".shareSection")) {
        sec.hidden = ![...sec.querySelectorAll(tile)].some((e) => !e.hidden);
      }
      emptyFor(grid).hidden = !showEmptyResult({ hasQuery: !!q, filterValue, total, visible });
    }
  };
  input.addEventListener("input", apply);
  clear.addEventListener("click", () => { input.value = ""; apply(); input.focus(); });
  const mo = new MutationObserver(() => { if (input.value || filterValue || sortValue || sort) apply(); });
  for (const grid of document.querySelectorAll(grids)) mo.observe(grid, { childList: true, subtree: true });
  window.addEventListener("i18n:lang", () => { label(); apply(); });
  apply();
}
