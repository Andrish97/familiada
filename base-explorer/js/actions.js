// base-explorer/js/actions.js
// Obsługa zdarzeń i akcji UI (klik, selection, search, folder view)

import { VIEW, setViewAll, setViewFolder, selectionClear, selectionSetSingle, selectionToggle } from "./state.js";
import { renderAll, renderList } from "./render.js";
import { listQuestionsByCategory, listAllQuestions } from "./repo.js";
import { showContextMenu, hideContextMenu } from "./context-menu.js";
import { sb } from "../../js/core/supabase.js";

/* ================= Utils ================= */
function canWrite(state) {
  return state?.role === "owner" || state?.role === "editor";
}

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
    // root-folder = pytania bez category_id
    if (!state._rootQuestions) {
      state._rootQuestions = await listQuestionsByCategory(state.baseId, null);
    }
    return state._rootQuestions;
  }

  if (state.view === VIEW.FOLDER) {
    return await listQuestionsByCategory(state.baseId, state.folderId);
  }

  // VIEW.TAG – na razie brak (dojdzie później)
  return [];
}

async function refreshList(state) {
  const allQ = await loadQuestionsForCurrentView(state);
  state._viewQuestions = allQ;
  
  const parentId = (state.view === VIEW.ALL) ? null : state.folderId;
  const foldersHere = (state.categories || [])
    .filter(c => (c.parent_id || null) === (parentId || null))
    .slice()
    .sort((a,b) => (Number(a.ord)||0) - (Number(b.ord)||0));
  
  state.folders = foldersHere;
  
  // filtr wyszukiwania stosujemy tylko do pytań (na razie)
  state.questions = applySearchFilterToQuestions(allQ, state.searchQuery);
  
  renderAll(state);

  const writable = canWrite(state);
  document.getElementById("btnNewFolder")?.toggleAttribute("disabled", !writable);
  document.getElementById("btnNewQuestion")?.toggleAttribute("disabled", !writable);
}

function currentParentId(state) {
  // Root = parent_id null
  return (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
}

function currentCategoryId(state) {
  // Root = category_id null
  return (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
}

async function nextOrdForFolder(state, parentId) {
  const baseQ = sb()
    .from("qb_categories")
    .select("ord")
    .eq("base_id", state.baseId);

  const q = (parentId === null)
    ? baseQ.is("parent_id", null)
    : baseQ.eq("parent_id", parentId);

  const { data: last, error } = await q
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (Number(last?.ord) || 0) + 1;
}

async function nextOrdForQuestion(state, categoryId) {
  const baseQ = sb()
    .from("qb_questions")
    .select("ord")
    .eq("base_id", state.baseId);

  const q = (categoryId === null)
    ? baseQ.is("category_id", null)
    : baseQ.eq("category_id", categoryId);

  const { data: last, error } = await q
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (Number(last?.ord) || 0) + 1;
}

export async function createFolderHere(state, { parentId = null } = {}) {
  if (!canWrite(state)) return false;

  const ord = await nextOrdForFolder(state, parentId);

  const { error } = await sb()
    .from("qb_categories")
    .insert(
      { base_id: state.baseId, parent_id: parentId, name: "Nowy folder", ord },
      { defaultToNull: false }
    );

  if (error) throw error;

  // odśwież listę i cache root
  state._rootQuestions = null;
  await state._api?.refreshList?.();
  return true;
}

export async function createQuestionHere(state, { categoryId = null } = {}) {
  if (!canWrite(state)) return false;

  const ord = await nextOrdForQuestion(state, categoryId);

  const row = {
    base_id: state.baseId,
    category_id: categoryId,
    ord,
    payload: { text: "Nowe pytanie", answers: [] },
  };
  if (state.user?.id) row.updated_by = state.user.id;

  const { error } = await sb().from("qb_questions").insert(row, { defaultToNull: false });
  if (error) throw error;

  state._rootQuestions = null;
  await state._api?.refreshList?.();
  return true;
}

/* ================= Wire ================= */
export function wireActions({ state }) {
  const treeEl = document.getElementById("tree");
  const listEl = document.getElementById("list");
  const breadcrumbsEl = document.getElementById("breadcrumbs");
  const toolbarEl = document.getElementById("toolbar");

  const headNum = document.querySelector(".list-head .h-num");
  const headMain = document.querySelector(".list-head .h-main");

  function toggleSort(key) {
    const s = state.sort || (state.sort = { key: "ord", dir: "asc" });

    if (s.key === key) {
      s.dir = (s.dir === "asc") ? "desc" : "asc";
    } else {
      s.key = key;
      s.dir = "asc";
    }

    renderList(state);
    updateSortHeaderUI();
  }

  function updateSortHeaderUI() {
    if (headNum) headNum.classList.toggle("active", state.sort?.key === "ord");
    if (headMain) headMain.classList.toggle("active", state.sort?.key === "name");

    if (headNum) headNum.dataset.dir = state.sort?.key === "ord" ? state.sort?.dir : "";
    if (headMain) headMain.dataset.dir = state.sort?.key === "name" ? state.sort?.dir : "";
  }

  headNum?.addEventListener("click", () => toggleSort("ord"));
  headMain?.addEventListener("click", () => toggleSort("name"));

  // zainicjuj UI nagłówka
  updateSortHeaderUI();

  let clickRenderTimer = null;

  function scheduleRenderList() {
    if (clickRenderTimer) clearTimeout(clickRenderTimer);
    clickRenderTimer = setTimeout(() => {
      clickRenderTimer = null;
      renderList(state);
    }, 180); // krótko: pozwala na dblclick
  }

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

  toolbarEl?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!t) return;
  
    try {
      if (t.id === "btnNewFolder") {
        const parentId = currentParentId(state);
        await createFolderHere(state, { parentId });
      }
  
      if (t.id === "btnNewQuestion") {
        const categoryId = currentCategoryId(state);
        await createQuestionHere(state, { categoryId });
      }
    } catch (err) {
      console.error(err);
      alert("Nie udało się wykonać akcji.");
    }
  });

  breadcrumbsEl?.addEventListener("click", async (e) => {
    const el = e.target?.closest?.(".crumb");
    if (!el) return;
  
    const kind = el.dataset.kind;
  
    if (kind === "root") {
      setViewAll(state); // root-folder
      selectionClear(state);
      state._rootQuestions = null;
      await refreshList(state);
      return;
    }
  
    if (kind === "crumb") {
      const id = el.dataset.id;
      if (!id) return;
      setViewFolder(state, id);
      selectionClear(state);
      await refreshList(state);
    }
  });

  treeEl?.addEventListener("click", async (e) => {
  const row = e.target?.closest?.(".row[data-kind][data-id]");
  if (!row) return;

  const kind = row.dataset.kind;
  const id = row.dataset.id;

  if (kind === "cat") {
    setViewFolder(state, id);
    selectionClear(state);
    await refreshList(state);
    return;
  }
    
  if (kind === "root") {
    setViewAll(state);
    selectionClear(state);
    state._rootQuestions = null;
    await refreshList(state);
    return;
  }
    
});

  // --- Klik w listę: selekcja Windows (single / ctrl / shift) ---
  listEl?.addEventListener("click", (e) => {

    if (e.target === listEl) {
      selectionClear(state);
      renderList(state);
      return
    }
    
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

    scheduleRenderList();
  });

  // --- Dblclick na pytanie: (na razie placeholder) ---
  listEl?.addEventListener("dblclick", async (e) => {
    if (clickRenderTimer) {
      clearTimeout(clickRenderTimer);
      clickRenderTimer = null;
    }
  
    const row = e.target?.closest?.(".row[data-kind][data-id]");
    if (!row) return;
  
    const kind = row.dataset.kind;
    const id = row.dataset.id;
  
    if (kind === "cat") {
      setViewFolder(state, id);
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    if (kind === "q") {
      return; // edytor pytania później
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      selectionClear(state);
      renderList(state);
    }
  });
  // pierwsze „odśwież” listy po podpięciu akcji
  // (żeby działało też po przełączeniu view/search)
  const api = {
    refreshList: () => refreshList(state),
  };

  // udostępniamy do context-menu (żeby mogło odświeżyć widok po delete)
  state._api = api;

  // PPM na liście (foldery/pytania/puste tło)
  listEl?.addEventListener("contextmenu", async (e) => {
    e.preventDefault();

    const row = e.target?.closest?.(".row[data-kind][data-id]");
    if (row) {
      const kind = row.dataset.kind; // 'cat' | 'q'
      const id = row.dataset.id;
      await showContextMenu({ state, x: e.clientX, y: e.clientY, target: { kind, id } });
      return;
    }

    // puste tło listy = root (bez specjalnych akcji na razie)
    await showContextMenu({ state, x: e.clientX, y: e.clientY, target: { kind: "root", id: null } });
  });

  // Klik poza menu zamyka
  document.addEventListener("mousedown", (e) => {
    const cm = document.getElementById("contextMenu");
    if (!cm || cm.hidden) return;
    if (e.target === cm || cm.contains(e.target)) return;
    hideContextMenu();
  });

  // Esc zamyka menu (nie kłóci się z Twoim Esc od selekcji)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideContextMenu();
  });

  return api;
}
