// /base-explorer/js/state.js
// Rewolucja trybów: wywalamy VIEW, wprowadzamy MODE (BROWSE/SEARCH/FILTER).

export const MODE = Object.freeze({
  BROWSE: "BROWSE",
  SEARCH: "SEARCH",
  FILTER: "FILTER",
});

export function createState() {
  const state = {
    // ====== Tryb pracy (zamiast VIEW) ======
    mode: MODE.BROWSE,

    // ====== BROWSE: gdzie jesteśmy w drzewie ======
    browse: {
      folderId: null, // null = root
    },

    // pamięć "ostatniego przeglądania" do powrotu po SEARCH/FILTER
    lastBrowse: {
      folderId: null,
    },

    // ====== SEARCH: tokeny wyszukiwania ======
    // Uwaga: chipsy #tag zrobimy później w UI; tu jest stan logiczny.
    search: {
      text: "",
      tagIds: [], // IDs tagów (logicznie AND)
    },

    // ====== FILTER: Tag + Meta jako jeden filtr ======
    filter: {
      tagIds: [],  // AND
      metaIds: [], // OR (jak dotąd)
    },

    // ====== UI / dane ======
    loading: false,
    error: "",
    readOnly: false,

    // dane
    tree: [],               // drzewo folderów
    tags: [],               // lista tagów
    meta: [],               // lista meta-kropek
    questions: [],          // aktualnie renderowana lista w prawym panelu
    allQuestionsCache: [],  // cache pełnej listy pytań (dla SEARCH/FILTER)
    allQuestionTagMap: new Map(), // qId -> Set(tagId) (dla filtrów)

    // selekcje
    selection: new Set(),       // prawa lista
    treeSelection: new Set(),   // lewy panel: drzewo (foldery)
    tagSelection: new Set(),    // lewy panel: tagi (do FILTER)
    metaSelection: new Set(),   // lewy panel: meta (do FILTER)

    // stany pomocnicze
    context: {
      lastFocus: "", // "search" | "tags" | "meta" | "tree" | ""
    },
  };

  return state;
}

// =====================
// BROWSE (nawigacja)
// =====================

export function rememberBrowseLocation(state) {
  state.lastBrowse.folderId = state.browse.folderId ?? null;
}

export function restoreBrowseLocation(state) {
  state.mode = MODE.BROWSE;
  state.browse.folderId = state.lastBrowse.folderId ?? null;
}

export function setBrowseRoot(state) {
  state.mode = MODE.BROWSE;
  state.browse.folderId = null;
}

export function setBrowseFolder(state, folderId) {
  state.mode = MODE.BROWSE;
  state.browse.folderId = folderId || null;
}

// =====================
// SEARCH (wejście/wyjście)
// =====================

export function enterSearch(state) {
  if (state.mode !== MODE.BROWSE) return;
  rememberBrowseLocation(state);
  state.mode = MODE.SEARCH;

  // w SEARCH blokujemy lewy panel selekcji (ale DnD tagów zostaje w renderze/actions)
  state.treeSelection.clear();
  state.tagSelection.clear();
  state.metaSelection.clear();
  state.filter.tagIds = [];
  state.filter.metaIds = [];
}

export function exitSearchToBrowse(state) {
  if (state.mode !== MODE.SEARCH) return;
  // czyścimy stan SEARCH
  state.search.text = "";
  state.search.tagIds = [];
  restoreBrowseLocation(state);
}

export function setSearchText(state, text) {
  state.search.text = (text || "").trim();
}

export function setSearchTagIds(state, tagIds) {
  state.search.tagIds = Array.isArray(tagIds) ? tagIds.filter(Boolean) : [];
}

// =====================
// FILTER (Tag+Meta)
// =====================

export function enterFilter(state) {
  if (state.mode !== MODE.BROWSE) return;
  rememberBrowseLocation(state);
  state.mode = MODE.FILTER;

  // w FILTER wyszukiwarka ma być zablokowana (render/actions)
  // czyścimy SEARCH
  state.search.text = "";
  state.search.tagIds = [];
}

export function exitFilterToBrowse(state) {
  if (state.mode !== MODE.FILTER) return;
  // czyścimy selekcje filtrów
  state.tagSelection.clear();
  state.metaSelection.clear();
  state.filter.tagIds = [];
  state.filter.metaIds = [];
  restoreBrowseLocation(state);
}

export function syncFilterFromSelections(state) {
  state.filter.tagIds = [...state.tagSelection];
  state.filter.metaIds = [...state.metaSelection];
}

// =====================
// Selekcje (wspólne)
// =====================

export function clearRightSelection(state) {
  state.selection.clear();
}

export function clearLeftSelections(state) {
  state.treeSelection.clear();
  state.tagSelection.clear();
  state.metaSelection.clear();
}

export function clearAllSelections(state) {
  clearRightSelection(state);
  clearLeftSelections(state);
}

// =====================
// Helpery trybów
// =====================

export function isBrowse(state) {
  return state.mode === MODE.BROWSE;
}
export function isSearch(state) {
  return state.mode === MODE.SEARCH;
}
export function isFilter(state) {
  return state.mode === MODE.FILTER;
}
export function isVirtualMode(state) {
  return state.mode === MODE.SEARCH || state.mode === MODE.FILTER;
}
