// base-explorerjs/ui/keyboard.js
// Skróty klawiszowe. Skróty akcji pochodzą z rejestru (registry.js:
// shortcut); tu zostają tylko klawisze nawigacji i zaznaczania.
// Jedna bramka: przy otwartym oknie albo pisaniu w polu skróty nie działają.

import { ACTIONS } from "../actions/registry.js?v=v2026-10-20T19584";
import { buildContext } from "../actions/context.js?v=v2026-10-20T19584";
import { runAction } from "../actions/run.js?v=v2026-10-20T19584";
import { matchShortcut } from "../platform.js?v=v2026-10-20T19584";
import { selectionClear } from "../state.js?v=v2026-10-20T19584";
import { renderSelection } from "../render.js?v=v2026-10-20T19584";
import { goUp } from "../commands.js?v=v2026-10-20T19584";
import { hideContextMenu } from "../context-menu.js?v=v2026-10-20T19584";

const MODAL_IDS = ["questionOverlay", "tagsOverlay", "exportOverlay", "renameModal"];

function shortcutsBlocked() {
  const el = document.activeElement;
  const tag = String(el?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return true;
  if (document.querySelector(".uni-modal")) return true;
  return MODAL_IDS.some((id) => {
    const m = document.getElementById(id);
    return !!m && !m.hidden && m.style.display !== "none";
  });
}

export function wireKeyboard(state) {
  const withShortcut = ACTIONS.filter((a) => a.shortcut);

  document.addEventListener("keydown", async (e) => {
    // otwarte menu kontekstowe zamyka Escape (zanim cokolwiek innego)
    const cm = document.getElementById("contextMenu");
    if (cm && !cm.hidden && e.key === "Escape") {
      e.preventDefault();
      hideContextMenu();
      return;
    }
    if (shortcutsBlocked()) return;

    const action = withShortcut.find((a) => matchShortcut(e, a.shortcut));
    if (action) {
      e.preventDefault();
      // przytrzymany klawisz nie powtarza akcji (np. wiele kopii z Ctrl+V)
      if (e.repeat) return;
      await runAction(action.id, buildContext(state, { source: "keys" }));
      return;
    }

    // Ctrl/⌘+A: wszystkie wiersze listy
    if (matchShortcut(e, { key: "KeyA", mod: true })) {
      e.preventDefault();
      state.selection.pane = "list";
      state.selection.keys = new Set(state.visibleListKeys || []);
      state.selection.anchorKey = null;
      renderSelection(state);
      return;
    }

    if (e.key === "Escape") {
      selectionClear(state);
      renderSelection(state);
      return;
    }

    // Backspace: w górę (z folderu do nadrzędnego)
    if (e.key === "Backspace" && state.location.kind === "folder") {
      e.preventDefault();
      await goUp(state);
    }
  });
}
