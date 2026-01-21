// base-explorer/js/context-menu.js
import { VIEW, setViewFolder } from "./state.js";
import { createFolderHere, createQuestionHere, deleteSelected } from "./actions.js";

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

  // Root / puste tło listy: akcje w aktualnym miejscu (root lub aktualny folder)
  if (target.kind === "root") {
    const parentId = (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
    const categoryId = parentId;
  
    items.push({ label: "Nowy folder", disabled: !editor, action: async () => {
      await createFolderHere(state, { parentId });
    }});
  
    items.push({ label: "Nowe pytanie", disabled: !editor, action: async () => {
      await createQuestionHere(state, { categoryId });
    }});
  
    items.push({ label: "—", disabled: true }); // separator „na biedno” (na razie)
  }

  // Folder
  if (target.kind === "cat") {
    items.push({ label: "Otwórz folder", action: async () => {
      setViewFolder(state, target.id);
      state.selection?.keys?.clear?.();
      await state._api?.refreshList?.();
    }});
  
    items.push({ label: "Nowy podfolder", disabled: !editor, action: async () => {
      await createFolderHere(state, { parentId: target.id });
    }});
  
    items.push({ label: "Nowe pytanie w tym folderze", disabled: !editor, action: async () => {
      await createQuestionHere(state, { categoryId: target.id });
    }});
  
    items.push({ label: "Usuń", danger: true, disabled: !editor, action: async () => {
      // Explorer-style: PPM na folderze -> jeśli nie zaznaczony, zaznacz go
      const key = `c:${target.id}`;
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
