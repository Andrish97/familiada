// base-explorer/js/state.js
// Stan eksploratora bazy pytań (warstwa 2)

export const VIEW = {
  ALL: "all",       // wszystkie pytania (w ramach bazy)
  FOLDER: "folder", // konkretna kategoria (folder)
  TAG: "tag",       // filtr tagów (wirtualny widok)
  SEARCH: "search",
  META: "meta",     // filtr “meta” (wirtualny widok)
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

    // TRYB (rozłączny): BROWSE / SEARCH / FILTER
    mode: MODE.BROWSE,

    // powrót do ostatniego BROWSE
    lastBrowse: { view: VIEW.ALL, folderId: null },

    // SEARCH: tokeny (tagi + tekst)
    // (na razie używamy istniejących searchTokens; to jest przygotowanie pod „commit” tagów)
    // search: { text: "", tagIds: [] }  // docelowo — później

    // FILTER: tagi + meta jako jeden filtr
    filter: {
      tagIds: new Set(),
      metaIds: new Set(),
    },
    
    // widok
    view: VIEW.ALL,
    folderId: null,        // dla VIEW.FOLDER
    tagIds: [],            // dla VIEW.TAG (multi)
    searchQuery: "",
        // search jako "tokeny" (jak iOS: tagi jako elementy + zwykły tekst)
    searchRaw: "",         // dokładnie to co user wpisał w input (z #tagami, przecinkami itd.)
    searchTokens: {
      text: "",       // zwykły tekst (bez #tagów)
      tagNames: [],   // np. ["pieski","kotki"] (bez #)
      tagIds: [],     // resolved do state.tags (jeśli istnieją)
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

export function setViewSearch(state, query) {
  state.view = VIEW.SEARCH;
  state.searchQuery = String(query || "");
}

export function setSearchTokens(state, { text = "", tagNames = [], tagIds = [] } = {}) {
  state.searchTokens = state.searchTokens || { text: "", tagNames: [], tagIds: [] };
  state.searchTokens.text = String(text || "");
  state.searchTokens.tagNames = Array.isArray(tagNames) ? tagNames.slice() : [];
  state.searchTokens.tagIds = Array.isArray(tagIds) ? tagIds.slice() : [];

  // dla kompatybilności: searchQuery to "widoczny" string (tu tekst + #tagi)
  const tags = state.searchTokens.tagNames.map(n => `#${n}`).join(", ");
  const t = String(state.searchTokens.text || "").trim();
  state.searchQuery = [tags, t].filter(Boolean).join(tags && t ? " " : "");
}

export function clearSearchTokens(state) {
  setSearchTokens(state, { text: "", tagNames: [], tagIds: [] });
}

export function rememberBrowseLocation(state) {
  // zapamiętujemy tylko, gdy jesteśmy w „normalnym” przeglądaniu
  if (state.view === VIEW.ALL || state.view === VIEW.FOLDER) {
    state._browse = { view: state.view, folderId: state.folderId || null };
  }
}

export function restoreBrowseLocation(state) {
  // wyjście z widoków wirtualnych zawsze czyści ich parametry
  state.tagIds = [];
  // nie ruszam searchTokens (SEARCH ma swój przycisk X), ale jeśli chcesz, też można tu wyczyścić

  const b = state._browse;
  if (b?.view === VIEW.FOLDER && b.folderId) {
    state.view = VIEW.FOLDER;
    state.folderId = b.folderId;
    return;
  }

  state.view = VIEW.ALL;
  state.folderId = null;
}

export function rememberLastBrowse(state) {
  // zapamiętujemy tylko realny browse
  if (state.view === VIEW.ALL || state.view === VIEW.FOLDER) {
    state.lastBrowse = { view: state.view, folderId: state.folderId || null };
  }
}

export function restoreLastBrowse(state) {
  const b = state.lastBrowse || { view: VIEW.ALL, folderId: null };
  if (b.view === VIEW.FOLDER && b.folderId) {
    state.view = VIEW.FOLDER;
    state.folderId = b.folderId;
  } else {
    state.view = VIEW.ALL;
    state.folderId = null;
  }
}

// ===== MODE gates =====

export function enterSearch(state) {
  // wejście tylko „logicznie” z BROWSE, ale jeśli ktoś wywoła z innego — wymuś porządek
  if (state.mode !== MODE.BROWSE) exitToBrowse(state);

  rememberLastBrowse(state);
  state.mode = MODE.SEARCH;

  // SEARCH używa istniejącego VIEW.SEARCH (detal kompatybilności)
  state.view = VIEW.SEARCH;

  // SEARCH nie miesza się z filtrem
  if (state.filter?.tagIds) state.filter.tagIds.clear();
  if (state.filter?.metaIds) state.filter.metaIds.clear();

  // w SEARCH lewy panel ma być „zamrożony”, ale nie czyścimy selekcji automatycznie
  // (czyścisz tylko, gdy UX tego wymaga)
}

export function exitSearchToBrowse(state) {
  // wyjście z SEARCH => powrót do lastBrowse
  state.mode = MODE.BROWSE;

  // czyścimy search UI (na razie tokeny; to odpowiada X w toolbarze)
  // jeśli wolisz: rób to tylko przy X — wtedy usuń dwie linie niżej
  // clearSearchTokens(state);

  restoreLastBrowse(state);
}

export function enterFilterFromLeftSelections(state) {
  // FILTER ma być rozłączny z SEARCH
  if (state.mode === MODE.SEARCH) exitSearchToBrowse(state);
  if (state.mode !== MODE.BROWSE) exitToBrowse(state);

  rememberLastBrowse(state);
  state.mode = MODE.FILTER;

  const tagIds = new Set(Array.from(state.tagSelection?.ids || []).filter(Boolean));
  const metaIds = new Set(Array.from(state.metaSelection?.ids || []).filter(Boolean));

  state.filter = state.filter || { tagIds: new Set(), metaIds: new Set() };
  state.filter.tagIds = tagIds;
  state.filter.metaIds = metaIds;

  // Kompatybilność z obecną architekturą:
  // - jeśli jest meta => jedziemy przez VIEW.META
  // - inaczej przez VIEW.TAG
  state.tagIds = Array.from(tagIds); // bo META branch używa state.tagIds jako dodatkowego AND  [oai_citation:4‡context-menu.js](sediment://file_00000000209c71f4a5d8b7f883347e04)

  if (metaIds.size) state.view = VIEW.META;
  else state.view = VIEW.TAG;
}

export function exitFilterToBrowse(state) {
  state.mode = MODE.BROWSE;

  // czyścimy filtr i selekcje po lewej (to jest „clear filter”)
  if (state.filter?.tagIds) state.filter.tagIds.clear();
  if (state.filter?.metaIds) state.filter.metaIds.clear();

  // lewa selekcja wraca do pustej, bo filtr jest wyłączony
  if (state.tagSelection?.ids) state.tagSelection.ids.clear();
  if (state.metaSelection?.ids) state.metaSelection.ids.clear();

  restoreLastBrowse(state);
}

export function exitToBrowse(state) {
  // twardy „reset trybu” bez zgadywania
  if (state.mode === MODE.SEARCH) return exitSearchToBrowse(state);
  if (state.mode === MODE.FILTER) return exitFilterToBrowse(state);

  state.mode = MODE.BROWSE;
  // view zostaje (ALL/FOLDER)
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
