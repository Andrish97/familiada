// list-search.js
// Wyszukiwanie po nazwie na stronach list (gry, bazy, logo): pole w lewej
// części dolnego paska (.games-bottom-left) filtruje kafle w siatkach strony.
// Kafel „+” (.addCard) zostaje zawsze. Filtr działa też na kafle dorysowane
// później (zmiana karty, odświeżenie) — MutationObserver na siatkach.
// Stanu nie zapamiętujemy (docs/ujednolicenie-wygladu.md, sekcja 1).

import { t } from "../../translation/translation.js?v=v2026-10-09T02514";
import { icon } from "./icons.js?v=v2026-10-09T02514";

const norm = (s) => String(s || "").toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * @param {object} o
 * @param {string} o.grids     selektor siatek (np. "#grid", "#mineGrid, #sharedGrid")
 * @param {string} o.tile      selektor kafla (np. ".card", ".logoTile")
 * @param {string} o.name      selektor nazwy w kaflu (np. ".name", ".logoName")
 */
export function initListSearch({ grids, tile, name }) {
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

  const apply = () => {
    const q = norm(input.value);
    for (const grid of document.querySelectorAll(grids)) {
      for (const el of grid.querySelectorAll(tile)) {
        if (el.classList.contains("addCard")) continue;
        const hit = !q || norm(el.querySelector(name)?.textContent).includes(q);
        el.hidden = !hit;
      }
    }
  };
  input.addEventListener("input", apply);
  clear.addEventListener("click", () => { input.value = ""; apply(); input.focus(); });
  const mo = new MutationObserver(() => { if (input.value) apply(); });
  for (const grid of document.querySelectorAll(grids)) mo.observe(grid, { childList: true });
  window.addEventListener("i18n:lang", label);
}
