// list-filter.js
// Czysta logika filtra list (gry, bazy): wartość filtra w adresie strony
// i dopasowanie kafla. Bez DOM — testy jednostkowe w tests/unit/listFilter.test.js.
// Wygląd i podpięcie pod dolny pasek: list-search.js (opcja filter).

export const FILTER_ALL = "";

/** Wartość z parametru adresu, tylko jeśli jest na liście dozwolonych; inaczej „wszystko”. */
export function filterFromSearch(search, param, allowed) {
  const v = new URLSearchParams(search).get(param);
  return v && allowed.includes(v) ? v : FILTER_ALL;
}

/** Nowy adres z ustawionym (lub usuniętym dla „wszystko”) parametrem filtra. */
export function filterToHref(href, param, value) {
  const url = new URL(href);
  if (value) url.searchParams.set(param, value);
  else url.searchParams.delete(param);
  return url.pathname + url.search + url.hash;
}

/** Kafel bez atrybutu filtra (np. rynek) nie podlega filtrowaniu. */
export function matchesFilter(tileValue, filterValue) {
  if (!filterValue) return true;
  if (tileValue == null) return true;
  return tileValue === filterValue;
}

/** Klucz stanu gry: draft / open / stopped / ready (jak etykieta kafla). */
export function gameStateKey(status, { isPrepared = false, playOk = false } = {}) {
  const s = status || "draft";
  if (s === "draft" && isPrepared && playOk) return "ready";
  if (s === "poll_open") return "open";
  if (s === "poll_stopped") return "stopped";
  if (s === "ready") return "ready";
  return "draft";
}

/** Czy pokazać komunikat „brak wyników”: coś jest filtrowane/szukane, kafle są, żaden nie pasuje. */
export function showEmptyResult({ hasQuery, filterValue, total, visible }) {
  return (!!hasQuery || !!filterValue) && total > 0 && visible === 0;
}

/** Wspólne sortowanie list gier i baz (list-search.js, opcja sort); ustawienie w adresie (?sort=). */
export const SORT_LIST = {
  param: "sort",
  defaultKey: "common.sort.updated",
  ariaKey: "common.sort.label",
  options: [
    { value: "created", labelKey: "common.sort.created" },
    { value: "name", labelKey: "common.sort.name" },
  ],
};
