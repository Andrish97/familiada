// base-explorer/js/context-menu.js
import { VIEW, setViewFolder, selectionSetSingle } from "./state.js";
import { deleteSelected } from "./actions.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function hideContextMenu() {
  const cm = document.getElementById("contextMenu");
  if (!cm) return;
  cm.hidden = true;
  cm.innerHTML = "";
}

function isEditor(state) {
  return state?.role === "owner" || state?.role === "editor";
}

function itemHtml({ label, disabled, danger }) {
  const cls = [
    "cm-item",
    disabled ? "disabled" : "",
    danger ? "danger" : "",
  ].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" ${disabled ? "disabled" : ""}>${label}</button>`;
}

export async function showContextMenu({ state, x, y, target }) {
  const cm = document.getElementById("contextMenu");
  if (!cm) return;

  // target: { kind: 'cat'|'q'|'root', id: string|null }
  const editor = isEditor(state);

  const items = [];

  // Root (puste miejsce listy) – na razie tylko "Root" (bez akcji)
  if (target.kind === "root") {
    items.push({ label: "Root", disabled: true });
  }

  // Folder
  if (target.kind === "cat") {
    items.push({ label: "Otwórz folder", action: async () => {
      setViewFolder(state, target.id);
      state.selection?.keys?.clear?.();
      await state._api?.refreshList?.();
    }});
    // Akcje typu "Nowy folder/Nowe pytanie/Rename/Delete" dodamy w następnym etapie.
  }

  // Pytanie
  if (target.kind === "q") {
    items.push({ label: "Edytuj", disabled: true }); // modal edycji dojdzie później
    items.push({ label: "Usuń", danger: true, disabled: !editor, action: async () => {
      // jeśli element pod PPM nie jest zaznaczony – zaznacz go (Explorer-style)
      const key = `q:${target.id}`;
      if (!state.selection?.keys?.has?.(key)) {
        selectionSetSingle(state, key);
      }
    
      try {
        await deleteSelected(state);
      } catch (e) {
        console.error(e);
        alert("Nie udało się usunąć.");
      }
    }});
  }

  items.push({ label: "Anuluj", action: () => hideContextMenu() });

  cm.innerHTML = items.map(itemHtml).join("");

  // Podpinamy akcje w kolejności
  const btns = Array.from(cm.querySelectorAll(".cm-item"));
  btns.forEach((btn, i) => {
    const it = items[i];
    if (!it || it.disabled || !it.action) return;
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideContextMenu();
      await it.action();
    });
  });

  // Pozycjonowanie (żeby nie wychodziło poza ekran)
  cm.hidden = false;

  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = cm.getBoundingClientRect();

  const left = clamp(x, pad, vw - rect.width - pad);
  const top  = clamp(y, pad, vh - rect.height - pad);

  cm.style.left = `${left}px`;
  cm.style.top = `${top}px`;
}
