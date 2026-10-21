// base-explorerjs/ui/tree-row.js
// Jeden wygląd drzewa folderów (decyzja użytkownika 2026-10-21): lewy panel
// i okno „Przenieś do / Kopiuj do” rysują wiersz tym samym kodem i tymi
// samymi klasami (.tree-row w base-explorer.css): linie prowadzące wcięć
// z --depth, strzałka, folder otwarty/zamknięty, nazwa, kropki i liczba pytań.

import { t } from "../../../../shared/translation/translation.js?v=v2026-10-21T07274";
import { icon } from "../../../../shared/js/core/icons.js?v=v2026-10-21T07274";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Strzałka rozwijania (albo puste miejsce tej samej szerokości). */
export function treeToggleHtml(id, { canToggle, isOpen }) {
  return canToggle
    ? `<button type="button" class="tree-toggle" data-id="${esc(id)}" aria-label="${esc(t("baseExplorer.tree.toggle"))}">${icon(isOpen ? "caret-down" : "caret-right")}</button>`
    : `<span class="tree-toggle-space"></span>`;
}

/** Ikona wiersza: dom (folder główny), kosz, folder otwarty albo zamknięty. */
export function treeIconName(kind, isOpen) {
  if (kind === "root") return "home";
  if (kind === "trash") return "trash";
  return isOpen ? "folder-open" : "folder";
}

/** Wnętrze wiersza (bez samego elementu wiersza — atrybuty zostają u wywołującego). */
export function treeRowInner({ toggle, iconName, label, path = "", extra = "", count = null }) {
  return `<span class="tree-guides" aria-hidden="true"></span>${toggle}`
    + `<span class="tree-ico">${icon(iconName, { className: "list-ico" })}</span>`
    + `<span class="tree-text"><span class="tree-name title-text">${esc(label)}</span>${path ? `<span class="tree-path movePath">${esc(path)}</span>` : ""}</span>`
    + extra
    + (count == null ? "" : `<span class="tree-count">${count}</span>`);
}
