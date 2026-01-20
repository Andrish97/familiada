// base-explorer/js/state.js
// Stan eksploratora bazy pytań (warstwa 2)

export const VIEW = {
  ALL: "all",       // wszystkie pytania (w ramach bazy)
  FOLDER: "folder", // konkretna kategoria (folder)
  TAG: "tag",       // filtr tagów (wirtualny widok)
};

export const SORT = {
  UPDATED_DESC: "updated_desc",
  NAME_ASC: "name_asc",
  NAME_DESC: "name_desc",
  ORD_ASC: "ord_asc",
};

export function createState({ baseId, role = "viewer" }) {
  return {
    // kontekst
    baseId,
    role,                  // "owner" | "editor" | "viewer"
    canEdit: role !== "viewer",

    // dane (cache w pamięci)
    baseMeta: null,        // { id, name, ... }
    categories: [],        // flat: [{id,parent_id,name,ord}]
    tags: [],              // [{id,name,color,ord}]
    questions: [],         // aktualnie załadowane do widoku (zależnie od view)
    // opcjonalnie później: mapy pomocnicze (byId, childrenByParent) – tworzone w renderze lub osobno

    // widok
    view: VIEW.ALL,
    folderId: null,        // dla VIEW.FOLDER
    tagIds: [],            // dla VIEW.TAG (multi)
    searchQuery: "",
    sortMode: SORT.UPDATED_DESC,

    // selekcja (jak w explorerze)
    selection: {
      // Set kluczy elementów: np. "q:<uuid>" / "c:<uuid>"
      keys: new Set(),
      // anchor do shift-zaznaczania (ostatni kliknięty)
      anchorKey: null,
    },

    // clipboard wewnętrzny (etap 3)
    clipboard: {
      mode: null, // "copy" | "cut"
      keys: [],   // snapshot zaznaczenia
    },

    // UI status
    ui: {
      loading: false,
      error: "",
    },
  };
}

export function setRole(state, role) {
  state.role = role;
  state.canEdit = role !== "viewer";
}

export function clearError(state) {
  state.ui.error = "";
}

export function setError(state, msg) {
  state.ui.error = String(msg || "");
}

export function setLoading(state, on) {
  state.ui.loading = !!on;
}

/* ===== Widok ===== */
export function setViewAll(state) {
  state.view = VIEW.ALL;
  state.folderId = null;
  state.tagIds = [];
}

export function setViewFolder(state, folderId) {
  state.view = VIEW.FOLDER;
  state.folderId = folderId || null;
  state.tagIds = [];
}

export function setViewTags(state, tagIds) {
  state.view = VIEW.TAG;
  state.folderId = null;
  state.tagIds = Array.isArray(tagIds) ? tagIds.filter(Boolean) : [];
}

export function setSearch(state, q) {
  state.searchQuery = String(q || "").trim();
}

export function setSort(state, sortMode) {
  state.sortMode = sortMode || SORT.UPDATED_DESC;
}

/* ===== Selekcja ===== */
export function keyQuestion(id) {
  return `q:${id}`;
}
export function keyCategory(id) {
  return `c:${id}`;
}

export function selectionHas(state, key) {
  return state.selection.keys.has(key);
}

export function selectionClear(state) {
  state.selection.keys.clear();
  state.selection.anchorKey = null;
}

export function selectionSetSingle(state, key) {
  state.selection.keys.clear();
  if (key) state.selection.keys.add(key);
  state.selection.anchorKey = key || null;
}

export function selectionToggle(state, key) {
  if (!key) return;
  if (state.selection.keys.has(key)) state.selection.keys.delete(key);
  else state.selection.keys.add(key);
  state.selection.anchorKey = key;
}

export function selectionAdd(state, key) {
  if (!key) return;
  state.selection.keys.add(key);
  state.selection.anchorKey = key;
}

export function selectionRemove(state, key) {
  if (!key) return;
  state.selection.keys.delete(key);
  state.selection.anchorKey = key;
}

export function selectionSnapshot(state) {
  return Array.from(state.selection.keys);
}

export function clipboardSet(state, mode, keys) {
  state.clipboard.mode = mode; // "copy" | "cut"
  state.clipboard.keys = Array.isArray(keys) ? keys.slice() : [];
}

export function clipboardClear(state) {
  state.clipboard.mode = null;
  state.clipboard.keys = [];
}
