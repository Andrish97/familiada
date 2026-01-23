// base-explorer/js/context-menu.js

import {
  MODE,
  setBrowseFolder,
  selectionSetSingle,
  exitSearchToBrowse,
  exitFilterToBrowse,
  enterFilterModeFromLeft,
} from "./state.js";

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
  untagSelectedByTagIds,
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

function isVirtualMode(state) {
  return state?.mode === MODE.SEARCH || state?.mode === MODE.FILTER;
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

  return `<button type="button" class="${cls}" data-idx="${idx}" ${disabled ? "disabled" : ""}>${label}</button>`;
}

function renderMenu(cm, items) {
  cm.innerHTML = items.map((it, i) => itemHtml(it, i)).join("");

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

  const isSearchMode = (state.mode === MODE.SEARCH);
  const isFilterMode = (state.mode === MODE.FILTER);
  const isVirtual = isVirtualMode(state);

  const filterTagIds = Array.from(state.filter?.tagIds || []).filter(Boolean);
  const filterMetaIds = Array.from(state.filter?.metaIds || []).filter(Boolean);

  const items = [];

  /* =========================================================
     LEWY PANEL: TAGI / META
     target.kind = "tags-bg" | "tag" | "meta"
  ========================================================= */
  if (target.kind === "tags-bg" || target.kind === "tag" || target.kind === "meta") {

    // Explorer-style: PPM na niezaznaczonym elemencie => single-select
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

    // --- Widok: Pokaż (TAG lub META) => zawsze FILTER przez bramkę ---
    items.push({
      label: "Pokaż",
      disabled: (target.kind === "meta")
        ? (selectedMetaIds.length === 0)
        : (selectedTagIds.length === 0),
      action: async () => {
        // FILTER jest rozłączny z SEARCH — bramka w state.js też to pilnuje,
        // ale robimy twardo, żeby menu było przewidywalne.
        if (state.mode === MODE.SEARCH) exitSearchToBrowse(state);

        // Ustaw spójne selekcje (bo FILTER bierze z lewej selekcji)
        if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
        if (!state.metaSelection) state.metaSelection = { ids: new Set(), anchorId: null };

        // nic nie “zgadujemy”: bierzemy dokładnie to co zaznaczone
        state.tagSelection.ids = new Set(selectedTagIds);
        state.tagSelection.anchorId = selectedTagIds[selectedTagIds.length - 1] || null;

        state.metaSelection.ids = new Set(selectedMetaIds);
        state.metaSelection.anchorId = selectedMetaIds[selectedMetaIds.length - 1] || null;

        // Wejście w FILTER (ustawi state.mode i wewnętrznie przygotuje to, co potrzebne refreshList)
        enterFilterModeFromLeft(state);

        await state._api?.refreshList?.();
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

    items.push({
      label: "Usuń tag…",
      danger: true,
      disabled: !editor || selectedTagIds.length === 0,
      action: async () => {
        // usuwanie tagów to operacja “globalna”
        // dla porządku: nie rób jej w SEARCH — wyjdź do BROWSE
        if (state.mode === MODE.SEARCH) exitSearchToBrowse(state);

        try {
          const ok = await deleteTags(state, selectedTagIds);
          if (ok) {
            await state._api?.refreshTags?.();
            await state._api?.refreshList?.();
          }
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
  ========================================================= */

  const selectedRealCount = countRealSelected(state);

  // ROOT (puste tło listy)
  if (target.kind === "root") {
    // Tworzenie ma sens tylko w BROWSE (w SEARCH/FILTER i tak jest zablokowane)
    const parentId = (state.mode === MODE.BROWSE && state.folderId) ? state.folderId : null;
    const categoryId = parentId;

    items.push({
      label: "Nowy folder",
      disabled: !editor || isVirtual,
      action: async () => {
        await createFolderHere(state, { parentId });
      }
    });

    items.push({
      label: "Nowe pytanie",
      disabled: !editor || isVirtual,
      action: async () => {
        await createQuestionHere(state, { categoryId });
      }
    });
  
    pushSep(items);
  }
  
    // SCHOWEK
    const canPaste = !!state?.clipboard?.mode && !!state?.clipboard?.keys?.size;
    const pasteDisabled = isVirtual || !canPaste || (!editor && state.clipboard?.mode === "cut");
  
    items.push({
      label: "Kopiuj",
      disabled: !editor || isVirtual || target.kind === "root",
      action: async () => { copySelectedToClipboard(state); }
    });
  
    items.push({
      label: "Wytnij",
      disabled: !editor || isVirtual || target.kind === "root",
      action: async () => { cutSelectedToClipboard(state); }
    });
  
    items.push({
      label: "Wklej",
      disabled: pasteDisabled || !editor,
      action: async () => {
        if (isVirtual) return;
        await pasteClipboardHere(state);
      }
    });
  
    items.push({
      label: "Duplikuj",
      disabled: !editor || isVirtual || target.kind === "root",
      action: async () => {
        try {
          await duplicateSelected(state);
        } catch (e) {
          console.error(e);
          alert("Nie udało się zduplikować.");
        }
      }
    });
  
    // TAGI… (dla cat/q)
    if (target.kind === "cat" || target.kind === "q") {
      pushSep(items);
  
      items.push({
        label: "Tagi…",
        disabled: !editor,
        action: async () => {
          const key = (target.kind === "cat") ? `c:${target.id}` : `q:${target.id}`;
          if (!state.selection?.keys?.has?.(key)) {
            selectionSetSingle(state, key);
          }
          await state._api?.openAssignTagsModal?.();
        }
      });
    }
    
  // FOLDER (cat)
  if (target.kind === "cat") {
    pushSep(items);
  
    items.push({
      label: "Otwórz folder",
      disabled: false,
      action: async () => {
        // Reguła nadrzędna: wirtualne tryby nie trzymają nawigacji
        if (state.mode === MODE.SEARCH) exitSearchToBrowse(state);
        if (state.mode === MODE.FILTER) exitFilterToBrowse(state);
  
        // Wejście do folderu w BROWSE
        setBrowseFolder(state, target.id);
  
        // Czyścimy selekcję po prawej (Explorer-style)
        state.selection?.keys?.clear?.();
        state.selection.anchorKey = null;
  
        await state._api?.refreshList?.();
      }
    });
  
    pushSep(items);
  
    items.push({
      label: "Nowy folder w tym folderze",
      disabled: !editor || isVirtual,
      action: async () => {
        await createFolderHere(state, { parentId: target.id });
      }
    });
  
    items.push({
      label: "Nowe pytanie w tym folderze",
      disabled: !editor || isVirtual,
      action: async () => {
        await createQuestionHere(state, { categoryId: target.id });
      }
    });
  }

  // EDYCJA (cat/q)
  if (target.kind === "cat" || target.kind === "q") {
    pushSep(items);

    if (target.kind === "q") {
      items.push({ label: "Edytuj (wkrótce)", disabled: true });
    }

    items.push({
      label: target.kind === "cat" ? "Zmień nazwę" : "Zmień nazwę (treść)",
      disabled: !editor || isVirtual || selectedRealCount !== 1,
      action: async () => {
        const key = (target.kind === "cat") ? `c:${target.id}` : `q:${target.id}`;
        if (!state.selection?.keys?.has?.(key)) {
          selectionSetSingle(state, key);
        }
        await renameSelectedPrompt(state);
      }
    });

    pushSep(items);

    // USUŃ: wg MODE
    items.push({
      label: (isFilterMode && filterTagIds.length) ? "Usuń tagi" : "Usuń",
      danger: true,
      disabled:
        !editor ||
        isSearchMode ||
        (isFilterMode && (filterMetaIds.length > 0 || filterTagIds.length === 0)),
      action: async () => {
        const key = (target.kind === "cat") ? `c:${target.id}` : `q:${target.id}`;
        if (!state.selection?.keys?.has?.(key)) {
          selectionSetSingle(state, key);
        }

        try {
          if (isFilterMode) {
            await untagSelectedByTagIds(state, filterTagIds, "Tryb FILTRU");
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

  while (items.length && items[items.length - 1]?.sep) items.pop();

  renderMenu(cm, items);
  positionMenu(cm, x, y);
}
