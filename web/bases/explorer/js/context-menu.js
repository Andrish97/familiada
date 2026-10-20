// base-explorerjs/context-menu.js

import { selectionSetSingle } from "./state.js?v=v2026-10-20T19584";
import { ACTIONS, MENU_GROUPS, actionState } from "./actions/registry.js?v=v2026-10-20T19584";
import { buildContext } from "./actions/context.js?v=v2026-10-20T19584";
import { runAction } from "./actions/run.js?v=v2026-10-20T19584";
import { formatShortcut } from "./platform.js?v=v2026-10-20T19584";
import { t } from "../../../shared/translation/translation.js?v=v2026-10-20T19584";
import { renderAll } from "./render.js?v=v2026-10-20T19584";
import { icon } from "../../../shared/js/core/icons.js?v=v2026-10-20T19584";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function hideContextMenu() {
  const cm = document.getElementById("contextMenu");
  if (!cm) return;
  cm.hidden = true;
  cm.innerHTML = "";
}




function pushSep(items) {
  if (!items.length) return;
  if (items[items.length - 1]?.sep) return;
  items.push({ sep: true });
}

function itemHtml(item, idx) {
  if (item?.sep) {
    return `<div class="cm-sep" role="separator" aria-hidden="true"></div>`;
  }

  const { label, disabled, danger, shortcut, icon: iconName } = item;

  const cls = [
    "cm-item",
    disabled ? "disabled" : "",
    danger ? "danger" : "",
  ].filter(Boolean).join(" ");

  const rightHtml = shortcut ? `<span class="cm-kbd">${shortcut}</span>` : "";
  
  return `<button type="button" class="${cls}" data-idx="${idx}" ${disabled ? "disabled" : ""}>
    ${iconName ? icon(iconName) : ""}
    <span>${label}</span>
    ${rightHtml}
  </button>`;
}

function renderMenu(cm, items) {
  cm.innerHTML = items.map((it, i) => itemHtml(it, i)).join("");

  // bind po data-idx
  const btns = Array.from(cm.querySelectorAll(".cm-item[data-idx]"));
  for (const btn of btns) {
    const idx = Number(btn.dataset.idx);
    const it = items[idx];
    if (!it || it.disabled || !it.action) continue;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideContextMenu();
      await it.action();
    });
  }
}

function positionMenu(cm, x, y) {
  // Najpierw pokaż poza ekranem żeby zmierzyć wymiary
  cm.style.left = "-9999px";
  cm.style.top = "-9999px";
  cm.hidden = false;

  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = cm.getBoundingClientRect();

  const left = clamp(x, pad, vw - rect.width - pad);
  const top  = clamp(y, pad, vh - rect.height - pad);

  cm.style.left = `${left}px`;
  cm.style.top  = `${top}px`;
}

export async function showContextMenu({ state, x, y, target }) {
  const cm = document.getElementById("contextMenu");
  if (!cm) return;

  // Jak w Eksploratorze: PPM / przytrzymanie na NIEZAZNACZONYM elemencie
  // najpierw go zaznacza (przed policzeniem dostępności), a na elemencie
  // z wielo-zaznaczenia zostawia zaznaczenie bez zmian.
  if (selectTargetFirst(state, target)) renderAll(state);

  const ctx = buildContext(state, { source: "menu", target });
  const kind = target?.kind;

  const items = [];
  for (const group of MENU_GROUPS) {
    const inGroup = ACTIONS.filter((a) => a.menuGroup === group && a.menu?.includes(kind));
    let added = false;
    for (const a of inGroup) {
      const st = actionState(a, ctx);
      if (!st.visible) continue;
      if (!added) pushSep(items);
      added = true;
      items.push({
        label: t(a.label(ctx)),
        icon: a.icon,
        danger: !!a.danger,
        shortcut: a.shortcut ? formatShortcut(a.shortcut) : "",
        disabled: !st.enabled,
        action: () => runAction(a.id, ctx),
      });
    }
  }
  if (!items.length) return;

  renderMenu(cm, items);
  positionMenu(cm, x, y);
}

function selectTargetFirst(state, target) {
  const id = target?.id;
  if (!id) return false;
  if (target.kind === "cat" || target.kind === "q") {
    const key = (target.kind === "cat" ? "c:" : "q:") + id;
    if (state.selection?.keys?.has?.(key)) return false;
    selectionSetSingle(state, key);
    return true;
  }
  const sel = target.kind === "tag" ? state.tagSelection : target.kind === "meta" ? state.metaSelection : null;
  if (!sel || sel.ids.has(id)) return false;
  sel.ids.clear();
  sel.ids.add(id);
  sel.anchorId = id;
  return true;
}
