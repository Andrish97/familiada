// base-explorer/js/context-menu.js
import { VIEW, setViewFolder, selectionSetSingle } from "./state.js";
import {
  createFolderHere,
  createQuestionHere,
  deleteSelected,
  renameSelectedPrompt,
  copySelectedToClipboard,
  cutSelectedToClipboard,
  pasteClipboardHere
} from "./actions.js";
  // dopisz do importu
  // (to są funkcje, które zaraz udostępnimy w state._api w actions.js)

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

  const readOnlyView =
    state.view === VIEW.SEARCH ||
    state.view === VIEW.TAG; // jeśli VIEW.TAG jeszcze nie ma, daj guard jak niżej

  const items = [];

  // ===== TAGS (lewy panel) =====
  if (target.kind === "tags-bg" || target.kind === "tag") {
    const editor = isEditor(state);

    // Explorer-style: PPM na niezaznaczonym tagu => single-select
    if (target.kind === "tag" && target.id) {
      const tid = target.id;
      if (!state?.tagSelection?.ids?.has?.(tid)) {
        if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
        state.tagSelection.ids.clear();
        state.tagSelection.ids.add(tid);
        state.tagSelection.anchorId = tid;
      }
    }

    const selectedTagIds = Array.from(state?.tagSelection?.ids || []).filter(Boolean);

    items.push({
      label: "Pokaż",
      disabled: !selectedTagIds.length,
      action: async () => {
        await state._api?.openTagView?.(selectedTagIds);
      }
    });

    items.push({ label: "—", disabled: true });

    items.push({
      label: "Dodaj tag…",
      disabled: !editor,
      action: async () => {
        const ok = await state._api?.openTagModal?.({ mode: "create" });
        if (ok) {
          await state._api?.refreshTags?.();
          await state._api?.refreshList?.();
        }
      }
    });

    items.push({
      label: "Edytuj tag…",
      disabled: !editor || selectedTagIds.length !== 1,
      action: async () => {
        const tagId = selectedTagIds[0];
        const ok = await state._api?.openTagModal?.({ mode: "edit", tagId });
        if (ok) {
          await state._api?.refreshTags?.();
          await state._api?.refreshList?.();
        }
      }
    });

    // (później) Usuń tag jako byt / multi-PPM na tagach
    // items.push({ label:"Usuń tag(i)", ... })

    // Tag-menu już zbudowane — renderujemy i kończymy (żeby nie mieszać z menu listy)
    cm.innerHTML = items.map(itemHtml).join("");

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

    cm.hidden = false;

    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = cm.getBoundingClientRect();

    const left = clamp(x, pad, vw - rect.width - pad);
    const top  = clamp(y, pad, vh - rect.height - pad);

    cm.style.left = `${left}px`;
    cm.style.top = `${top}px`;
    return;
  }

  // Root / puste tło listy: akcje w aktualnym miejscu (root lub aktualny folder)
  if (target.kind === "root") {
    const parentId = (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
    const categoryId = parentId;
  
    items.push({ label: "Nowy folder", disabled: !editor || readOnlyView, action: async () => {
      await createFolderHere(state, { parentId });
    }});

    items.push({ label: "Nowe pytanie", disabled: !editor || readOnlyView, action: async () => {
      await createQuestionHere(state, { categoryId });
    }});
  
    items.push({ label: "—", disabled: true }); // separator „na biedno” (na razie)
  }

  if (target.kind === "cat" || target.kind === "q") {
    items.push({ label: "Kopiuj", disabled: !editor, action: async () => {
      // jeśli kliknięto nie-zaznaczone, ustaw single select (opcjonalnie, jeśli chcesz)
      copySelectedToClipboard(state);
    }});
    items.push({ label: "Wytnij", disabled: !editor, action: async () => {
      cutSelectedToClipboard(state);
    }});

    items.push({
      label: "Tagi…",
      disabled: !editor, // viewer tylko ogląda
      action: async () => {
        // jeśli element pod PPM nie jest zaznaczony – zaznacz go (Explorer-style)
        const key = (target.kind === "cat") ? `c:${target.id}` : `q:${target.id}`;
        if (!state.selection?.keys?.has?.(key)) {
          selectionSetSingle(state, key);
        }
        // otwórz modal (funkcja z actions.js musi być dostępna — patrz niżej)
        await state._api?.openAssignTagsModal?.();
      }
    });
  }

  const canPaste = !!state?.clipboard?.mode && state?.clipboard?.keys?.size > 0;

  const pasteDisabled =
    readOnlyView ||
    !canPaste ||
    (!editor && state.clipboard?.mode === "cut");

  items.push({
    label: "Wklej",
    disabled: pasteDisabled,
    action: async () => {
      if (readOnlyView) return; // twarda blokada (na wszelki wypadek)
      await pasteClipboardHere(state);
    }
  });

  // Folder
  if (target.kind === "cat") {
    items.push({ label: "Otwórz folder", action: async () => {
      setViewFolder(state, target.id);
      state.selection?.keys?.clear?.();
      await state._api?.refreshList?.();
    }});
  
    items.push({ label: "Nowy folder", disabled: !editor || readOnlyView, action: async () => {
      await createFolderHere(state, { parentId: target.id });
    }});
  
    items.push({ label: "Nowe pytanie w tym folderze", disabled: !editor || readOnlyView, action: async () => {
      await createQuestionHere(state, { categoryId: target.id });
    }});

    items.push({ label: "Zmień nazwę", disabled: !editor || readOnlyView, action: async () => {
      const key = `c:${target.id}`;
      if (!state.selection?.keys?.has?.(key)) {
        selectionSetSingle(state, key);
      }
      await renameSelectedPrompt(state);
    }});
  
    items.push({ label: "Usuń", danger: true, disabled: !editor || readOnlyView, action: async () => {
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
    items.push({ label: "Zmień nazwę (treść)", disabled: !editor || readOnlyView, action: async () => {
      const key = `q:${target.id}`;
      if (!state.selection?.keys?.has?.(key)) {
        selectionSetSingle(state, key);
      }
      await renameSelectedPrompt(state);
    }});
    items.push({ label: "Usuń", danger: true, disabled: !editor || readOnlyView, action: async () => {
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
