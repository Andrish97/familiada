// base-explorer/js/state.js
// Stan eksploratora bazy pytań (warstwa 2)

// W BROWSE rozróżniamy tylko: root (folderId=null) i folder (folderId!=null).
export const VIEW = {
  ROOT: "root",
  FOLDER: "folder",
};

export const MODE = {
  BROWSE: "browse",
  SEARCH: "search",
  FILTER: "filter",
};

export const SORT = {
  UPDATED_DESC: "updated_desc",
  NAME_ASC: "name_asc",
  NAME_DESC: "name_desc",
  ORD_ASC: "ord_asc",
};

export const META = {
  prepared:    { id: "prepared",    name: "preparowane",    color: "rgba(77, 163, 255, .95)" },
  poll_points: { id: "poll_points", name: "punktowane", color: "rgba(255, 200, 77, .95)" },
  poll_text:   { id: "poll_text",   name: "typowe",   color: "rgba(160, 160, 160, .95)" },
};

// kolejność wyświetlania
export const META_ORDER = ["prepared", "poll_points", "poll_text"];

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
    
    mode: MODE.BROWSE,
    
    // powrót do ostatniego BROWSE (root/folder)
    lastBrowse: { folderId: null },
    
    // FILTER: spójny filtr (tagi + meta)
    filter: {
      tagIds: new Set(),
      metaIds: new Set(),
    },
    
    // BROWSE: null = root, string = folder
    folderId: null,
    
    // SEARCH: tokeny
    searchRaw: "",
    searchTokens: {
      text: "",
      tagNames: [],
      tagIds: [],
    },
    
    sortMode: SORT.UPDATED_DESC,

    // selekcja (jak w explorerze)
    selection: {
      // Set kluczy elementów: np. "q:<uuid>" / "c:<uuid>"
      keys: new Set(),
      // anchor do shift-zaznaczania (ostatni kliknięty)
      anchorKey: null,
    },
    // selekcja tagów (lewy panel)
    tagSelection: {
      ids: new Set(),     // Set(tagId)
      anchorId: null,     // do shift-range
    },

    // selekcja meta (stałe “tagi”)
    metaSelection: {
      ids: new Set(),   // Set(metaId)
      anchorId: null,
    },

    // clipboard wewnętrzny (etap 3)
    clipboard: {
      mode: null,      // 'copy' | 'cut' | null
      keys: new Set(), // Set('q:..' / 'c:..')
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


/* ===== BROWSE (root/folder) ===== */
export function setBrowseRoot(state) {
  state.folderId = null;
}

export function setBrowseFolder(state, folderId) {
  state.folderId = folderId || null;
}

export function rememberBrowseLocation(state) {
  // zapamiętujemy tylko BROWSE
  if (state.mode === MODE.BROWSE) {
    state.lastBrowse = { folderId: state.folderId || null };
  }
}

export function restoreBrowseLocation(state) {
  const b = state.lastBrowse || { folderId: null };
  state.folderId = b.folderId || null;
}

/* ===== MODE (bramki przejść) ===== */

export function enterSearchMode(state) {
  if (state.mode === MODE.FILTER) exitFilterToBrowse(state);
  // zapamiętaj BROWSE zanim wejdziesz w SEARCH
  if (state.mode === MODE.BROWSE) rememberBrowseLocation(state);
  state.mode = MODE.SEARCH;
}

export function exitSearchToBrowse(state) {
  state.mode = MODE.BROWSE;
  restoreBrowseLocation(state);
}

export function enterFilterModeFromLeft(state) {
  if (state.mode === MODE.SEARCH) exitSearchToBrowse(state);
  if (state.mode === MODE.BROWSE) rememberBrowseLocation(state);

  state.mode = MODE.FILTER;

  const tagIds = new Set(Array.from(state.tagSelection?.ids || []).filter(Boolean));
  const metaIds = new Set(Array.from(state.metaSelection?.ids || []).filter(Boolean));

  state.filter = state.filter || { tagIds: new Set(), metaIds: new Set() };
  state.filter.tagIds = tagIds;
  state.filter.metaIds = metaIds;
}

export function exitFilterToBrowse(state) {
  state.mode = MODE.BROWSE;

  if (state.filter?.tagIds) state.filter.tagIds.clear();
  if (state.filter?.metaIds) state.filter.metaIds.clear();

  if (state.tagSelection?.ids) state.tagSelection.ids.clear();
  if (state.metaSelection?.ids) state.metaSelection.ids.clear();

  restoreBrowseLocation(state);
}


export function setSearchTokens(state, { text = "", tagNames = [], tagIds = [] } = {}) {
  state.searchTokens = state.searchTokens || { text: "", tagNames: [], tagIds: [] };
  state.searchTokens.text = String(text || "");
  state.searchTokens.tagNames = Array.isArray(tagNames) ? tagNames.slice() : [];
  state.searchTokens.tagIds = Array.isArray(tagIds) ? tagIds.slice() : [];
}

export function clearSearchTokens(state) {
  setSearchTokens(state, { text: "", tagNames: [], tagIds: [] });
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
  // keys może przyjść jako Set albo Array
  const arr = (keys instanceof Set) ? Array.from(keys) : (Array.isArray(keys) ? keys : []);
  state.clipboard.keys = new Set(arr.filter(Boolean));
}

export function clipboardClear(state) {
  state.clipboard.mode = null;
  state.clipboard.keys = new Set();
}

export function tagSelectionClear(state) {
  if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
  state.tagSelection.ids.clear();
  state.tagSelection.anchorId = null;
}

export function metaSelectionClear(state) {
  if (!state.metaSelection) state.metaSelection = { ids: new Set(), anchorId: null };
  state.metaSelection.ids.clear();
  state.metaSelection.anchorId = null;
}
