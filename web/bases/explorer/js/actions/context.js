// base-explorerjs/actions/context.js
// Kontekst akcji: wszystko, czego rejestr (registry.js) potrzebuje, żeby
// ocenić widoczność i dostępność akcji — liczone w jednym miejscu dla paska,
// menu kontekstowego, skrótów, przeciągania i gestów.

import { VIEW } from "../state.js?v=v2026-10-20T19584";

export function canEdit(state) {
  return state?.role === "owner" || state?.role === "editor";
}

// Widoki wyników (wyszukiwanie, tag, proponowane kategorie): pokazują
// elementy z całej bazy, więc nie ma w nich „tu” do tworzenia i wklejania.
export function isFilterView(state) {
  return state?.view === VIEW.SEARCH || state?.view === VIEW.TAG || state?.view === VIEW.META;
}

// Zaznaczenie → elementy (bez „root” i innych kluczy).
export function selectionInfo(state) {
  const keys = Array.from(state?.selection?.keys || []);
  const folderIds = [];
  const questionIds = [];
  for (const k of keys) {
    if (typeof k !== "string") continue;
    if (k.startsWith("c:")) folderIds.push(k.slice(2));
    else if (k.startsWith("q:")) questionIds.push(k.slice(2));
  }
  const count = folderIds.length + questionIds.length;
  const oneKey = count === 1 ? (folderIds.length ? `c:${folderIds[0]}` : `q:${questionIds[0]}`) : null;
  return {
    keys: keys.filter((k) => typeof k === "string" && (k.startsWith("c:") || k.startsWith("q:"))),
    folderIds,
    questionIds,
    count,
    one: count === 1,
    oneKey,
    oneQuestionId: count === 1 && questionIds.length ? questionIds[0] : null,
    hasRoot: keys.includes("root"),
  };
}

function currentFolderId(state) {
  return state?.view === VIEW.FOLDER && state.folderId ? state.folderId : null;
}

/**
 * source: "toolbar" | "menu" | "keys" | "drop" | "gesture"
 * target: { kind: "root"|"cat"|"q"|"tag"|"tags-bg"|"meta", id } — cel menu
 * kontekstowego (PPM / przytrzymanie); dla paska i skrótów brak.
 */
export function buildContext(state, { source = "toolbar", target = null } = {}) {
  const sel = selectionInfo(state);
  // Folder, w którym tworzymy / do którego wklejamy: folder z menu
  // kontekstowego („w środku”), inaczej bieżący folder.
  // Wiersz „Folder główny” w drzewie (id "root") = folder główny.
  const here = target?.kind === "cat" && target.id ? target.id
    : target?.kind === "root" && target.id === "root" ? null
      : currentFolderId(state);
  return {
    state,
    source,
    target,
    view: state?.view,
    canEdit: canEdit(state),
    isFilterView: isFilterView(state),
    isTagView: state?.view === VIEW.TAG,
    sel,
    here,
    hasClipboard: !!state?.clipboard?.mode && !!state?.clipboard?.keys?.size,
    tagSel: Array.from(state?.tagSelection?.ids || []).filter(Boolean),
    typeSel: Array.from(state?.metaSelection?.ids || []).filter(Boolean),
  };
}
