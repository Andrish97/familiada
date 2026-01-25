// base-explorer/js/context-menu.js

import { VIEW, setViewFolder, selectionSetSingle, rememberBrowseLocation } from "./state.js";
import {
  createFolderHere,
  createQuestionHere,
  deleteSelected,
  renameSelectedPrompt,
  copySelectedToClipboard,
  cutSelectedToClipboard,
  pasteClipboardHere,
  deleteTags,
  duplicateSelected,
} from "./actions.js";

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

function isReadOnlyView(state) {
  return state?.view === VIEW.SEARCH || state?.view === VIEW.TAG;
}

function countRealSelected(state) {
  const keys = Array.from(state?.selection?.keys || []);
  return keys.filter(k => typeof k === "string" && (k.startsWith("c:") || k.startsWith("q:"))).length;
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

  const { label, disabled, danger } = item;

  const cls = [
    "cm-item",
    disabled ? "disabled" : "",
    danger ? "danger" : "",
  ].filter(Boolean).join(" ");

  // data-idx => pewne mapowanie (separatory nie psują indeksów)
  return `<button type="button" class="${cls}" data-idx="${idx}" ${disabled ? "disabled" : ""}>${label}</button>`;
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
  cm.hidden = false;

  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = cm.getBoundingClientRect();

  const left = clamp(x, pad, vw - rect.width - pad);
  const top = clamp(y, pad, vh - rect.height - pad);

  cm.style.left = `${left}px`;
  cm.style.top = `${top}px`;
}

export async function showContextMenu({ state, x, y, target }) {
  const cm = document.getElementById("contextMenu");
  if (!cm) return;

  const editor = isEditor(state);
  const readOnlyView = isReadOnlyView(state);

  const items = [];

  /* =========================================================
     TAGI (lewy panel): target.kind = "tags-bg" | "tag"
     Grupy:
       - Widok
       - Zarządzanie tagami
       - (placeholder) operacje niszczące
  ========================================================= */
  if (target.kind === "tags-bg" || target.kind === "tag" || target.kind === "meta") {
  
    // Explorer-style: PPM na niezaznaczonym elemencie lewego panelu => najpierw single-select
    if (target.id) {
      if (target.kind === "tag") {
        const tid = target.id;
        if (!state?.tagSelection?.ids?.has?.(tid)) {
          if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
          state.tagSelection.ids.clear();
          state.tagSelection.ids.add(tid);
          state.tagSelection.anchorId = tid;
        }
      }
  
      if (target.kind === "meta") {
        const mid = target.id;
        if (!state?.metaSelection?.ids?.has?.(mid)) {
          if (!state.metaSelection) state.metaSelection = { ids: new Set(), anchorId: null };
          state.metaSelection.ids.clear();
          state.metaSelection.ids.add(mid);
          state.metaSelection.anchorId = mid;
        }
      }
    }
  
    const selectedTagIds = Array.from(state?.tagSelection?.ids || []).filter(Boolean);
    const selectedMetaIds = Array.from(state?.metaSelection?.ids || []).filter(Boolean);
  
    // META (stałe): tylko “Pokaż”, reszta wyszarzona
    if (target.kind === "meta") {
      items.push({
        label: "Pokaż",
        disabled: selectedMetaIds.length === 0,
        action: async () => {
          // wejście w VIEW.META (zachowaj browse location jak przy TAG)
          if (state.view !== VIEW.META) rememberBrowseLocation(state);
  
          state.view = VIEW.META;
  
          // META view u Ciebie dopuszcza dodatkowy filtr tagami (state.tagIds)
          state.tagIds = selectedTagIds;
  
          await state._api?.refreshList?.();
        }
      });
  
      pushSep(items);
  
      items.push({ label: "Dodaj tag…", disabled: true });
      items.push({ label: "Edytuj tag…", disabled: true });
      pushSep(items);
      items.push({ label: "Usuń", disabled: true, danger: true });
  
      renderMenu(cm, items);
      positionMenu(cm, x, y);
      return;
    }

    // --- Widok ---
    items.push({
      label: "Pokaż",
      disabled: selectedTagIds.length === 0,
      action: async () => {
        await state._api?.openTagView?.(selectedTagIds);
      }
    });

    pushSep(items);

    // --- Zarządzanie tagami ---
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

    // placeholdery na przyszłość (PPM tagów)
    pushSep(items);
    
    items.push({
      label: (selectedTagIds.length === 1) ? "Usuń tag" : "Usuń tagi",
      disabled: !editor || selectedTagIds.length === 0,
      danger: true,
      action: async () => {
        try {
          await deleteTags(state, selectedTagIds);
        } catch (e) {
          console.error(e);
          alert("Nie udało się usunąć tagów.");
        }
      }
    });

    renderMenu(cm, items);
    positionMenu(cm, x, y);
    return;
  }

  /* =========================================================
     LISTA / DRZEWO: target.kind = "root" | "cat" | "q"
     Grupy:
       - Tworzenie (dla root)
       - Schowek
       - Tagi
       - Nawigacja / tworzenie w folderze (dla cat)
       - Edycja
       - Niebezpieczne
  ========================================================= */

  // ile realnie zaznaczono (bez "root")
  const selectedRealCount = countRealSelected(state);
  
  // ROOT (puste tło listy itp.)
  if (target.kind === "root") {
    const parentId = (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
    const categoryId = parentId;

    // --- Tworzenie ---
    items.push({
      label: "Nowy folder",
      disabled: !editor || readOnlyView,
      action: async () => {
        await createFolderHere(state, { parentId });
      }
    });

    items.push({
      label: "Nowe pytanie",
      disabled: !editor || readOnlyView,
      action: async () => {
        await createQuestionHere(state, { categoryId });
      }
    });

    pushSep(items);
  }

  // SCHOWEK (dla cat/q/root)
  const canPaste = !!state?.clipboard?.mode && !!state?.clipboard?.keys?.size;
  const pasteDisabled = readOnlyView || !canPaste || (!editor && state.clipboard?.mode === "cut");

  // Schowek ma sens dla cat/q, dla root też (bo wklejasz “tu”)
  items.push({
    label: "Kopiuj",
    disabled: !editor || target.kind === "root", // root nie jest elementem do kopiowania
    action: async () => { copySelectedToClipboard(state); }
  });

  items.push({
    label: "Wytnij",
    disabled: !editor || readOnlyView || target.kind === "root",
    action: async () => { cutSelectedToClipboard(state); }
  });

  items.push({
    label: "Wklej",
    disabled: pasteDisabled || !editor, // na razie tylko editor; jeśli chcesz, viewer może wklejać COPY lokalnie -> zmienimy
    action: async () => {
      if (readOnlyView) return;
      await pasteClipboardHere(state);
    }
  });

  // placeholder (na przyszłość)
  items.push({
    label: "Duplikuj",
    disabled: !editor || readOnlyView || target.kind === "root",
    action: async () => {
      try {
        await duplicateSelected(state);
      } catch (e) {
        console.error(e);
        alert("Nie udało się zduplikować.");
      }
    }
  });

  // jeśli jesteśmy na elemencie cat/q, dokładamy grupę TAGI
  if (target.kind === "cat" || target.kind === "q") {
    pushSep(items);

    items.push({
      label: "Tagi…",
      disabled: !editor, // viewer ogląda
      action: async () => {
        const key = (target.kind === "cat") ? `c:${target.id}` : `q:${target.id}`;
        if (!state.selection?.keys?.has?.(key)) {
          selectionSetSingle(state, key);
        }
        await state._api?.openAssignTagsModal?.();
      }
    });
  }

  // FOLDER (cat): nawigacja + tworzenie w środku
  if (target.kind === "cat") {
    pushSep(items);

    // --- Nawigacja ---
    items.push({
      label: "Otwórz folder",
      disabled: false,
      action: async () => {
        setViewFolder(state, target.id);
        state.selection?.keys?.clear?.();
        await state._api?.refreshList?.();
      }
    });

    pushSep(items);

    // --- Tworzenie w folderze ---
    items.push({
      label: "Nowy folder w tym folderze",
      disabled: !editor || readOnlyView,
      action: async () => {
        await createFolderHere(state, { parentId: target.id });
      }
    });

    items.push({
      label: "Nowe pytanie w tym folderze",
      disabled: !editor || readOnlyView,
      action: async () => {
        await createQuestionHere(state, { categoryId: target.id });
      }
    });
  }

  // EDYCJA (cat/q)
  if (target.kind === "cat" || target.kind === "q") {
    pushSep(items);

    // --- Edytuj pytanie ---
    items.push({
      label: "Edytuj pytanie…",
      disabled: !editor || readOnlyView || selectedRealCount !== 1 || target.kind !== "q",
      action: async () => {
        const qid = target.id;
        await state._api?.openQuestionModal?.(qid);
      }
    });

    items.push({
      label: target.kind === "cat" ? "Zmień nazwę" : "Zmień nazwę (treść)",
      disabled: !editor || readOnlyView || selectedRealCount !== 1,
      action: async () => {
        const key = (target.kind === "cat") ? `c:${target.id}` : `q:${target.id}`;
        if (!state.selection?.keys?.has?.(key)) {
          selectionSetSingle(state, key);
        }
        await renameSelectedPrompt(state);
      }
    });

    pushSep(items);

    // --- Utwórz grę ---
    items.push({
      label: "Utwórz grę…",
      disabled: !editor || readOnlyView || !Array.from(state.selection?.keys || []).some(k => String(k).startsWith("q:") || String(k).startsWith("c:")),
      action: async () => {
        // najprościej: użyj tego samego API co toolbar
        // (żeby nie dublować logiki rozwijania folderów w dwóch miejscach)
        const qIds = await state._api?.selectionToQuestionIds?.();
        if (!qIds?.length) return;
      
        state._api?.openExportModal?.({ preselectIds: qIds });
      }
    });

    // NIEBEZPIECZNE
    pushSep(items);
    
    items.push({
      label: (state.view === VIEW.TAG) ? "Usuń tagi" : "Usuń",
      danger: true,
      disabled: !editor,
      action: async () => {
        const key = (target.kind === "cat") ? `c:${target.id}` : `q:${target.id}`;
        if (!state.selection?.keys?.has?.(key)) {
          selectionSetSingle(state, key);
        }
    
        try {
          if (state.view === VIEW.TAG) {
            await state._api?.untagSelectedInTagView?.();
          } else {
            await deleteSelected(state);
          }
        } catch (e) {
          console.error(e);
          alert("Nie udało się wykonać operacji.");
        }
      }
    });
  }

  // sprzątanie: nie zostaw separatora na końcu
  while (items.length && items[items.length - 1]?.sep) items.pop();

  renderMenu(cm, items);
  positionMenu(cm, x, y);
}
