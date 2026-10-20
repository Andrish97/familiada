// base-explorerjs/context-menu.js
// Menu kontekstowe (PPM / przytrzymanie). Pozycje pochodzą z rejestru akcji
// (registry.js: menu + menuGroup), dostępność i wykonanie z tego samego
// kontekstu co pasek i skróty.
// Na komputerze menu przy kursorze; na telefonie arkusz od dołu (z safe area,
// decyzja 2026-10-20) z tłem, które zamyka go dotknięciem.

import { selectionSetSingle } from "./state.js?v=v2026-10-20T19584";
import { ACTIONS, MENU_GROUPS, actionState } from "./actions/registry.js?v=v2026-10-20T19584";
import { buildContext } from "./actions/context.js?v=v2026-10-20T19584";
import { runAction } from "./actions/run.js?v=v2026-10-20T19584";
import { formatShortcut } from "./platform.js?v=v2026-10-20T19584";
import { t } from "../../../shared/translation/translation.js?v=v2026-10-20T19584";
import { renderSelection } from "./render.js?v=v2026-10-20T19584";
import { icon } from "../../../shared/js/core/icons.js?v=v2026-10-20T19584";

const SHEET_QUERY = "(max-width: 900px)";
// Palec puszczony po przytrzymaniu daje „klik” bez wciśnięcia w menu —
// pozycja wykonuje się tylko po wciśnięciu, które zaczęło się w menu
// (albo z klawiatury: klik bez wciśnięcia, detail === 0).
let pressedInside = false;
let wired = false;
// Zdarzenie „scroll” przychodzi w następnej klatce — przewinięcie sprzed
// otwarcia (np. panel przewinięty do klikniętego wiersza) nie zamyka menu.
const SCROLL_GRACE_MS = 250;
let openedAt = 0;

const isSheet = () => window.matchMedia?.(SHEET_QUERY).matches;

function backdrop() {
  let el = document.getElementById("contextMenuBackdrop");
  if (!el) {
    el = document.createElement("div");
    el.id = "contextMenuBackdrop";
    el.className = "context-menu-backdrop";
    el.hidden = true;
    el.addEventListener("click", () => { el.hidden = true; });
    document.getElementById("contextMenu")?.before(el);
  }
  return el;
}

export function isContextMenuOpen() {
  const cm = document.getElementById("contextMenu");
  return !!cm && !cm.hidden;
}

export function hideContextMenu({ fromBackdrop = false } = {}) {
  const cm = document.getElementById("contextMenu");
  if (!cm || cm.hidden) return;
  cm.hidden = true;
  cm.innerHTML = "";
  cm.classList.remove("is-sheet");
  const bd = document.getElementById("contextMenuBackdrop");
  if (!bd) return;
  // dotknięte tło zostaje chwilę, żeby „klik” po dotknięciu nie trafił
  // w wiersz pod spodem
  if (fromBackdrop) setTimeout(() => { bd.hidden = true; }, 400);
  else bd.hidden = true;
}

// Zamykanie: dotknięcie / klik poza menu, przewinięcie, zmiana rozmiaru.
function wireClose() {
  if (wired) return;
  wired = true;
  document.addEventListener("pointerdown", (e) => {
    if (!isContextMenuOpen()) return;
    if (e.target.closest?.("#contextMenu")) return;
    hideContextMenu({ fromBackdrop: e.target.id === "contextMenuBackdrop" });
  }, true);
  window.addEventListener("resize", () => hideContextMenu());
  document.addEventListener("scroll", (e) => {
    if (e.target?.closest?.("#contextMenu")) return; // przewijanie samego arkusza
    if (performance.now() - openedAt < SCROLL_GRACE_MS) return;
    hideContextMenu();
  }, true);
  window.addEventListener("blur", () => hideContextMenu());
}

function itemHtml(item, idx) {
  if (item.sep) return `<div class="cm-sep" role="separator" aria-hidden="true"></div>`;
  const cls = ["cm-item", item.disabled ? "disabled" : "", item.danger ? "danger" : ""].filter(Boolean).join(" ");
  const kbd = item.shortcut ? `<span class="cm-kbd">${item.shortcut}</span>` : "";
  const why = item.disabled && item.reason ? ` title="${item.reason}"` : "";
  return `<button type="button" role="menuitem" class="${cls}" data-idx="${idx}"${item.disabled ? " aria-disabled=\"true\"" : ""}${why}>
    ${item.icon ? icon(item.icon) : ""}<span>${item.label}</span>${kbd}
  </button>`;
}

function place(cm, x, y) {
  cm.style.left = "-9999px";
  cm.style.top = "-9999px";
  cm.hidden = false;
  const pad = 8;
  const r = cm.getBoundingClientRect();
  const left = Math.max(pad, Math.min(x, window.innerWidth - r.width - pad));
  const top = Math.max(pad, Math.min(y, window.innerHeight - r.height - pad));
  cm.style.left = `${left}px`;
  cm.style.top = `${top}px`;
}

// Jak w Eksploratorze: menu na niezaznaczonym wierszu najpierw go zaznacza
// (w tym panelu), na wierszu z zaznaczenia zostawia zaznaczenie.
function selectTargetFirst(state, target) {
  const prefix = { cat: "c:", q: "q:", trash: "t:" }[target?.kind];
  if (!prefix || !target.id) return false;
  const key = prefix + target.id;
  const pane = target.pane || "list";
  if (state.selection.pane === pane && state.selection.keys.has(key)) return false;
  selectionSetSingle(state, key, pane);
  return true;
}

function menuItems(ctx) {
  const kind = ctx.target?.kind;
  const items = [];
  for (const group of MENU_GROUPS) {
    let added = false;
    for (const a of ACTIONS) {
      if (a.menuGroup !== group || !a.menu?.includes(kind)) continue;
      const st = actionState(a, ctx);
      if (!st.visible) continue;
      if (!added && items.length) items.push({ sep: true });
      added = true;
      items.push({
        id: a.id,
        label: t(a.label(ctx)),
        icon: a.icon,
        danger: !!a.danger,
        shortcut: a.shortcut ? formatShortcut(a.shortcut) : "",
        disabled: !st.enabled,
        reason: st.reason ? t(st.reason) : "",
      });
    }
  }
  return items;
}

export async function showContextMenu({ state, x, y, target }) {
  const cm = document.getElementById("contextMenu");
  if (!cm) return;
  wireClose();
  hideContextMenu();

  if (selectTargetFirst(state, target)) renderSelection(state);

  const ctx = buildContext(state, { source: "menu", target });
  const items = menuItems(ctx);
  if (!items.length) return;

  cm.setAttribute("role", "menu");
  cm.innerHTML = items.map(itemHtml).join("");
  cm.onclick = async (e) => {
    const btn = e.target.closest(".cm-item[data-idx]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (!pressedInside && e.detail !== 0) return;
    const it = items[Number(btn.dataset.idx)];
    if (!it || it.disabled) return;
    hideContextMenu();
    await runAction(it.id, ctx);
  };
  pressedInside = false;
  openedAt = performance.now();
  cm.onpointerdown = () => { pressedInside = true; };

  if (isSheet()) {
    cm.classList.add("is-sheet");
    cm.style.left = "";
    cm.style.top = "";
    backdrop().hidden = false;
    cm.hidden = false;
  } else {
    place(cm, x, y);
  }
}
