// list-search.js
// Wyszukiwanie po nazwie na stronach list (gry, bazy, logo): pole w lewej
// części dolnego paska (.games-bottom-left) filtruje kafle w siatkach strony.
// Kafel „+” (.addCard) zostaje zawsze. Filtr działa też na kafle dorysowane
// później (zmiana karty, odświeżenie) — MutationObserver na siatkach.
// Stanu nie zapamiętujemy (docs/ujednolicenie-wygladu.md, sekcja 1).

import { t } from "../../translation/translation.js?v=v2026-10-08T07385";

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
  const input = document.createElement("input");
  input.type = "search";
  input.className = "inp sm list-search";
  input.placeholder = t("common.searchByName");
  input.setAttribute("aria-label", t("common.searchByName"));
  slot.appendChild(input);

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
  const mo = new MutationObserver(() => { if (input.value) apply(); });
  for (const grid of document.querySelectorAll(grids)) mo.observe(grid, { childList: true });
  window.addEventListener("i18n:lang", () => {
    input.placeholder = t("common.searchByName");
    input.setAttribute("aria-label", t("common.searchByName"));
  });
}
