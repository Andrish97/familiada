// base-explorer/js/actions.js
// Obsługa zdarzeń i akcji UI (klik, selection, search, folder view)

import { VIEW, setViewAll, setViewFolder, selectionClear, selectionSetSingle, selectionToggle } from "./state.js";
import { renderAll, renderList } from "./render.js";
import { listQuestionsByCategory, listAllQuestions } from "./repo.js";

/* ================= Utils ================= */
function keyFromRow(row) {
  const kind = row?.dataset?.kind;
  const id = row?.dataset?.id;
  if (!kind || !id) return null;
  if (kind === "q") return `q:${id}`;
  if (kind === "cat") return `c:${id}`;
  return null;
}

function textOfQuestion(q) {
  // u nas pytanie jest w payload.text (docelowo), ale niech będzie odporne
  return String(q?.payload?.text ?? q?.text ?? "").trim();
}

function applySearchFilterToQuestions(all, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return all;

  return (all || []).filter((item) => textOfQuestion(item).toLowerCase().includes(q));
}

function currentRowKeys(container) {
  // kolejność kluczy na ekranie (dla shift)
  const rows = Array.from(container?.querySelectorAll?.(".row[data-kind][data-id]") || []);
  return rows
    .map(keyFromRow)
    .filter(Boolean)
    // shift zaznaczanie robimy tylko dla pytań (q:...), foldery zostawmy na później
    .filter((k) => k.startsWith("q:"));
}

function selectRange(state, listEl, clickedKey) {
  const keys = currentRowKeys(listEl);
  if (!keys.length) return;

  const a = state.selection.anchorKey;
  if (!a || !a.startsWith("q:")) {
    // brak anchor -> zachowaj się jak single
    selectionSetSingle(state, clickedKey);
    return;
  }

  const i1 = keys.indexOf(a);
  const i2 = keys.indexOf(clickedKey);
  if (i1 === -1 || i2 === -1) {
    selectionSetSingle(state, clickedKey);
    return;
  }

  const [from, to] = i1 < i2 ? [i1, i2] : [i2, i1];
  state.selection.keys.clear();
  for (let i = from; i <= to; i++) state.selection.keys.add(keys[i]);
  state.selection.anchorKey = clickedKey;
}

/* ================= Data loading by view ================= */
async function loadQuestionsForCurrentView(state) {
  // Etap 1:
  // - ALL: trzymamy cache w state._allQuestions (żeby nie pytać DB co klik)
  // - FOLDER: pobieramy pytania folderu (może być dużo mniej)
  // - TAG: później

  if (state.view === VIEW.ALL) {
    if (!state._allQuestions) {
      state._allQuestions = await listAllQuestions(state.baseId);
    }
    return state._allQuestions;
  }

  if (state.view === VIEW.FOLDER) {
    return await listQuestionsByCategory(state.baseId, state.folderId);
  }

  // VIEW.TAG – na razie brak (dojdzie później)
  return [];
}

async function refreshList(state) {
  const all = await loadQuestionsForCurrentView(state);
  state._viewQuestions = all; // cache surowego zestawu dla widoku
  state.questions = applySearchFilterToQuestions(all, state.searchQuery);
  renderAll(state);
}

/* ================= Wire ================= */
export function wireActions({ state }) {
  const treeEl = document.getElementById("tree");
  const listEl = document.getElementById("list");
  const breadcrumbsEl = document.getElementById("breadcrumbs");
  const toolbarEl = document.getElementById("toolbar");

  // --- Search (delegacja: input jest renderowany dynamicznie) ---
  toolbarEl?.addEventListener("input", async (e) => {
    const t = e.target;
    if (!t || t.id !== "searchInp") return;

    state.searchQuery = String(t.value || "");

    // filtr lokalny bez DB
    const base = Array.isArray(state._viewQuestions) ? state._viewQuestions : Array.isArray(state.questions) ? state.questions : [];
    state.questions = applySearchFilterToQuestions(base, state.searchQuery);
    renderList(state); // nie ruszamy toolbar, więc focus zostaje w inpucie
  });

  // --- Breadcrumbs: klik = wróć do "Wszystkie" (na start) ---
  breadcrumbsEl?.addEventListener("click", async () => {
    setViewAll(state);
    selectionClear(state);
    await refreshList(state);
  });

  // --- Klik w folder po lewej: przejście do widoku folderu ---
  treeEl?.addEventListener("click", async (e) => {
    const row = e.target?.closest?.(".row[data-kind='cat'][data-id]");
    if (!row) return;

    const catId = row.dataset.id;

    setViewFolder(state, catId);
    selectionClear(state);
    await refreshList(state);
  });

  // --- Klik w listę: selekcja Windows (single / ctrl / shift) ---
  listEl?.addEventListener("click", (e) => {
    const row = e.target?.closest?.(".row[data-kind][data-id]");
    if (!row) return;

    const kind = row.dataset.kind;
    const id = row.dataset.id;

    // na start selekcja głównie pytań
    const key = kind === "q" ? `q:${id}` : kind === "cat" ? `c:${id}` : null;
    if (!key) return;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift && key.startsWith("q:")) {
      // range dla pytań
      selectRange(state, listEl, key);
    } else if (isCtrl) {
      selectionToggle(state, key);
    } else {
      selectionSetSingle(state, key);
    }

    renderAll(state);
  });

  // --- Dblclick na pytanie: (na razie placeholder) ---
  listEl?.addEventListener("dblclick", (e) => {
    const row = e.target?.closest?.(".row[data-kind='q'][data-id]");
    if (!row) return;

    // Edytor pytania dojdzie później (modal), tu zostawiamy zaczep.
    // Na tym etapie brak akcji.
  });

  // pierwsze „odśwież” listy po podpięciu akcji
  // (żeby działało też po przełączeniu view/search)
  return {
    refreshList: () => refreshList(state),
  };
}
