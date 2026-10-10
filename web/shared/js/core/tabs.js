// tabs.js
// Jeden sposób na karty wszystkich stron: nazwa karty żyje w adresie
// (?tab=<nazwa>) i tylko tam — bez sessionStorage / localStorage.
// Reguły (docs/nawigacja-mapa-plan.md, „Karty — jeden sposób…”):
//   - lista kart i domyślna (pierwsza) pochodzą z PAGES[...].tabs w nav-map.js,
//   - nieznana karta w adresie oznacza kartę domyślną (to reguła, nie zapas),
//   - karta domyślna jest bez parametru w adresie,
//   - zmiana karty to replaceState, nie pushState: przeglądarkowe „Wstecz”
//     wraca do poprzedniej strony, nie przewija kart.
// Testy: tests/unit/tabs.test.js.

import { filterToHref } from "./list-filter.js?v=v2026-10-10T15075";

export const TAB_PARAM = "tab";

/** Karta z ?tab= (search), tylko z listy allowed; inaczej def. */
export function tabFromUrl(allowed, def, search = typeof location !== "undefined" ? location.search : "") {
  const tab = new URLSearchParams(search).get(TAB_PARAM);
  return tab && allowed.includes(tab) ? tab : def;
}

/** Adres href z kartą name; karta domyślna (def) usuwa parametr. */
export function tabHref(href, name, def) {
  return filterToHref(href, TAB_PARAM, name === def ? "" : name);
}

/**
 * Zapisuje kartę name w bieżącym adresie (replaceState). def — karta
 * domyślna (bez parametru). Nic nie robi, gdy adres się nie zmienia.
 */
export function setTab(name, def) {
  const next = tabHref(location.href, name, def);
  if (next !== location.pathname + location.search + location.hash) {
    history.replaceState(history.state, "", next);
  }
}
