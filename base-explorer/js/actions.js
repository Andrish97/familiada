// base-explorer/js/actions.js
// Obsługa zdarzeń i akcji UI (klik, selection, search, folder view)

import { VIEW, setViewAll, setViewFolder, selectionClear, selectionSetSingle, selectionToggle } from "./state.js";
import { renderAll, renderList } from "./render.js";
import { listQuestionsByCategory, listAllQuestions, listCategories } from "./repo.js";
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
  const rows = Array.from(container?.querySelectorAll?.('.row[data-kind="q"][data-id]') || []);
  return rows
    .map((row) => `q:${row.dataset.id}`)
    .filter(Boolean);
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

  state.categories = await listCategories(state.baseId);

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

export async function deleteItems(state, keys) {
  if (!canWrite(state)) return false;

  const list = Array.from(keys || []).filter(Boolean);
  if (!list.length) return false;

  // rozbij na foldery i pytania
  const qIds = [];
  const cIds = [];

  for (const k of list) {
    if (k.startsWith("q:")) qIds.push(k.slice(2));
    if (k.startsWith("c:")) cIds.push(k.slice(2));
  }

  // Uwaga: foldery mają dzieci/pytania -> DB ma FK? jeśli masz ON DELETE CASCADE to ok.
  // Jeśli nie masz cascade, to najpierw trzeba usunąć pytania w folderach albo blokować usuwanie niepustych.
  // Na tym etapie robimy najprościej: spróbuj usunąć, a w razie błędu pokaż komunikat.
  if (qIds.length) {
    const { error } = await sb().from("qb_questions").delete().in("id", qIds);
    if (error) throw error;
  }

  if (cIds.length) {
    const { error } = await sb().from("qb_categories").delete().in("id", cIds);
    if (error) throw error;
  }

  // cache root + odśwież
  state._rootQuestions = null;
  // foldery odświeżamy, bo state.categories jest cachem
  if (state._api?.refreshCategories) await state._api.refreshCategories();
  await state._api?.refreshList?.();

  return true;
}

export async function deleteSelected(state) {
  const keys = state?.selection?.keys;
  if (!keys || !keys.size) return false;

  const label = (keys.size === 1) ? "ten element" : `te elementy (${keys.size})`;
  const ok = confirm(`Usunąć ${label}? Tego nie da się cofnąć.`);
  if (!ok) return false;

  return await deleteItems(state, keys);
}

function singleSelectedKey(state) {
  const keys = state?.selection?.keys;
  if (!keys || keys.size !== 1) return null;
  return Array.from(keys)[0] || null;
}

function safeName80(s) {
  return String(s ?? "").trim().slice(0, 80);
}

function safeQuestionText(s) {
  return String(s ?? "").trim().slice(0, 200); // na razie limit UI, potem możemy zmienić
}

export async function renameByKey(state, key, newValueRaw) {
  if (!canWrite(state)) return false;
  if (!key) return false;

  const val = key.startsWith("c:") ? safeName80(newValueRaw) : safeQuestionText(newValueRaw);
  if (!val) return false;

  if (key.startsWith("c:")) {
    const id = key.slice(2);
    const { error } = await sb()
      .from("qb_categories")
      .update({ name: val })
      .eq("id", id);
    if (error) throw error;

    // odśwież cache kategorii (bo lista folderów jest z state.categories)
    if (state._api?.refreshCategories) await state._api.refreshCategories();
    await state._api?.refreshList?.();
    return true;
  }

  if (key.startsWith("q:")) {
    const id = key.slice(2);

    // bierzemy istniejący payload z cache widoku jeśli jest
    const q =
      (Array.isArray(state.questions) ? state.questions : []).find(x => x.id === id) ||
      (Array.isArray(state._viewQuestions) ? state._viewQuestions : []).find(x => x.id === id) ||
      null;

    const payload = (q && q.payload && typeof q.payload === "object") ? { ...q.payload } : {};
    payload.text = val;

    const upd = { payload };
    if (state.user?.id) upd.updated_by = state.user.id;

    const { error } = await sb()
      .from("qb_questions")
      .update(upd)
      .eq("id", id);
    if (error) throw error;

    // root cache może się zmienić
    state._rootQuestions = null;
    await state._api?.refreshList?.();
    return true;
  }

  return false;
}

export async function renameSelectedPrompt(state) {
  if (!canWrite(state)) return false;

  const key = singleSelectedKey(state);
  if (!key) {
    alert("Zaznacz jeden element.");
    return false;
  }

  const isFolder = key.startsWith("c:");
  const isQuestion = key.startsWith("q:");

  let current = "";

  if (isFolder) {
    const id = key.slice(2);
    const c = (Array.isArray(state.categories) ? state.categories : []).find(x => x.id === id);
    current = c?.name || "";
  }

  if (isQuestion) {
    const id = key.slice(2);
    const q =
      (Array.isArray(state.questions) ? state.questions : []).find(x => x.id === id) ||
      (Array.isArray(state._viewQuestions) ? state._viewQuestions : []).find(x => x.id === id) ||
      null;
    current = String(q?.payload?.text ?? q?.text ?? "");
  }

  const label = isFolder ? "Zmień nazwę folderu:" : "Zmień nazwę (treść) pytania:";
  const next = prompt(label, current);
  if (next === null) return false; // anulowano

  try {
    return await renameByKey(state, key, next);
  } catch (e) {
    console.error(e);
    alert("Nie udało się zmienić.");
    return false;
  }
}

function onlyOneSelectedKey(state) {
  const keys = state?.selection?.keys;
  if (!keys || keys.size !== 1) return null;
  return Array.from(keys)[0] || null;
}

function parentFolderId(state) {
  if (state.view !== VIEW.FOLDER || !state.folderId) return null;
  const cur = (state.categories || []).find(c => c.id === state.folderId);
  return cur ? (cur.parent_id || null) : null;
}

async function openFolderById(state, folderId) {
  setViewFolder(state, folderId);
  selectionClear(state);
  await state._api?.refreshList?.();
}

async function goUp(state) {
  const pid = parentFolderId(state);
  if (pid) {
    await openFolderById(state, pid);
  } else {
    // jeśli jesteś w folderze najwyższego poziomu -> root
    setViewAll(state);
    selectionClear(state);
    state._rootQuestions = null;
    await state._api?.refreshList?.();
  }
}

function clipboardSet(state, mode, keys) {
  state.clipboard = state.clipboard || { mode: null, keys: new Set() };
  state.clipboard.mode = mode;
  state.clipboard.keys = new Set(Array.from(keys || []).filter(Boolean));
}

function clipboardClear(state) {
  if (!state.clipboard) state.clipboard = { mode: null, keys: new Set() };
  state.clipboard.mode = null;
  state.clipboard.keys.clear();
}

function clipboardHas(state) {
  return !!state?.clipboard?.mode && state?.clipboard?.keys?.size > 0;
}

export function copySelectedToClipboard(state) {
  const keys = state?.selection?.keys;
  if (!keys || !keys.size) return false;
  clipboardSet(state, "copy", keys);
  return true;
}

export function cutSelectedToClipboard(state) {
  if (!canWrite(state)) return false;
  const keys = state?.selection?.keys;
  if (!keys || !keys.size) return false;
  clipboardSet(state, "cut", keys);
  return true;
}

export async function pasteClipboardHere(state) {
  if (!clipboardHas(state)) return false;

  const targetFolderIdOrNull = (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
  const mode = state.clipboard.mode;
  const keys = state.clipboard.keys;

  // COPY: na razie tylko pytania
  if (mode === "copy") {
    const qKeys = Array.from(keys).filter(k => k.startsWith("q:"));
    const cKeys = Array.from(keys).filter(k => k.startsWith("c:"));

    // 1) kopiuj foldery (każdy jako osobne drzewo)
    if (cKeys.length) {
      for (const k of cKeys) {
        const folderId = k.slice(2);
        await copyFolderSubtree(state, folderId, targetFolderIdOrNull);
      }
    }

    // 2) kopiuj pytania (już działa)
    if (qKeys.length) {
      state._drag = state._drag || {};
      state._drag.keys = new Set(qKeys);
      await moveItemsTo(state, targetFolderIdOrNull, { mode: "copy" });
    }

    await state._api?.refreshList?.();
    return true;
  }

  // CUT: przenieś pytania + foldery
  if (mode === "cut") {
    if (!canWrite(state)) return false;

    state._drag = state._drag || {};
    state._drag.keys = new Set(keys);
    await moveItemsTo(state, targetFolderIdOrNull, { mode: "move" });

    // po udanym "wytnij->wklej" czyścimy schowek
    clipboardClear(state);
    return true;
  }

  return false;
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

  state._drag = { keys: null, overKey: null }; // keys = Set('q:..'/'c:..'), overKey = 'c:folderId' lub null(root)

  let clickRenderTimer = null;

  function scheduleRenderList() {
    if (clickRenderTimer) clearTimeout(clickRenderTimer);
    clickRenderTimer = setTimeout(() => {
      clickRenderTimer = null;
      renderList(state);
    }, 180); // krótko: pozwala na dblclick
  }

  function canDnD() {
    return canWrite(state);
  }
  
  function keyFromKindId(kind, id) {
    if (kind === "q") return `q:${id}`;
    if (kind === "cat") return `c:${id}`;
    return null;
  }
  
  function clearDropTarget() {
    const prev = state._drag?.overKey;
    if (!prev) return;
    const [k, id] = prev.split(":");
    const kind = (k === "c") ? "cat" : null;
    if (!kind) return;
  
    const el = document.querySelector(`.row[data-kind="${kind}"][data-id="${CSS.escape(id)}"]`);
    el?.classList?.remove("is-drop-target");
    state._drag.overKey = null;
  }
  
  function setDropTarget(folderIdOrNull) {
    clearDropTarget();
    if (!folderIdOrNull) {
      state._drag.overKey = null; // root
      return;
    }
    const el = document.querySelector(`.row[data-kind="cat"][data-id="${CSS.escape(folderIdOrNull)}"]`);
    el?.classList?.add("is-drop-target");
    state._drag.overKey = `c:${folderIdOrNull}`;
  }
  
  function isFolderDescendant(folderId, maybeParentId) {
    // zwraca true, jeśli maybeParentId leży w poddrzewie folderId (czyli nie wolno tam wrzucić folderuId)
    const byId = new Map((state.categories || []).map(c => [c.id, c]));
    let cur = byId.get(maybeParentId);
    let guard = 0;
    while (cur && guard++ < 50) {
      if (cur.id === folderId) return true;
      const pid = cur.parent_id || null;
      cur = pid ? byId.get(pid) : null;
    }
    return false;
  }

  async function copyQuestionsTo(state, qIds, targetFolderIdOrNull) {
    if (!qIds.length) return;
  
    // pobierz źródłowe pytania
    const { data: src, error: e1 } = await sb()
      .from("qb_questions")
      .select("id,payload")
      .in("id", qIds);
  
    if (e1) throw e1;
  
    // ustal ord startowy w folderze docelowym
    const ordStart = await nextOrdForQuestion(state, targetFolderIdOrNull);
  
    const rows = (src || []).map((q, i) => {
      const row = {
        base_id: state.baseId,
        category_id: targetFolderIdOrNull,
        ord: ordStart + i,
        payload: (q?.payload && typeof q.payload === "object") ? q.payload : { text: "", answers: [] },
      };
      if (state.user?.id) row.updated_by = state.user.id;
      return row;
    });
  
    const { error: e2 } = await sb().from("qb_questions").insert(rows, { defaultToNull: false });
    if (e2) throw e2;
  
    state._rootQuestions = null;
  }

  function buildChildrenIndex(categories) {
    const byParent = new Map();
    for (const c of (categories || [])) {
      const pid = c.parent_id || null;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(c);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));
    }
    return byParent;
  }
  
  function collectSubtreeIds(categories, rootId) {
    const byParent = buildChildrenIndex(categories);
    const out = [];
    const stack = [rootId];
    const seen = new Set();
  
    while (stack.length) {
      const id = stack.pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
  
      const kids = byParent.get(id) || [];
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i].id);
    }
    return out;
  }
  
  function uniqueNameInSiblings(categories, parentIdOrNull, baseName) {
    const siblings = (categories || []).filter(c => (c.parent_id || null) === (parentIdOrNull || null));
    const names = new Set(siblings.map(s => String(s.name || "").toLowerCase()));
  
    if (!names.has(String(baseName).toLowerCase())) return baseName;
  
    // dodajemy (kopia), (kopia 2), ...
    const stem = `${baseName} (kopia)`;
    if (!names.has(stem.toLowerCase())) return stem;
  
    let n = 2;
    while (n < 9999) {
      const cand = `${baseName} (kopia ${n})`;
      if (!names.has(cand.toLowerCase())) return cand;
      n++;
    }
    return `${baseName} (kopia)`;
  }
  
  async function copyFolderSubtree(state, sourceFolderId, targetParentIdOrNull) {
    // 1) zbierz wszystkie foldery w poddrzewie
    const ids = collectSubtreeIds(state.categories || [], sourceFolderId);
    if (!ids.length) return;
  
    const cats = state.categories || [];
    const byId = new Map(cats.map(c => [c.id, c]));
  
    // 2) pobierz pytania z tych folderów
    const { data: qs, error: eQ } = await sb()
      .from("qb_questions")
      .select("id,category_id,ord,payload")
      .eq("base_id", state.baseId)
      .in("category_id", ids);
    if (eQ) throw eQ;
  
    // 3) wstaw nowy “root” kopiowanego drzewa jako dziecko targetParent
    const srcRoot = byId.get(sourceFolderId);
    const rootName = uniqueNameInSiblings(cats, targetParentIdOrNull, String(srcRoot?.name || "Folder").slice(0, 80));
  
    // ord na końcu w targetParent
    const ord = await nextOrdForFolder(state, targetParentIdOrNull);
  
    const { data: newRoot, error: eInsRoot } = await sb()
      .from("qb_categories")
      .insert({
        base_id: state.baseId,
        parent_id: targetParentIdOrNull,
        name: rootName,
        ord,
      }, { defaultToNull: false })
      .select("id")
      .single();
    if (eInsRoot) throw eInsRoot;
  
    // 4) mapowanie id: staryRoot -> nowyRoot, reszta w kolejności topologicznej
    const mapOldToNew = new Map();
    mapOldToNew.set(sourceFolderId, newRoot.id);
  
    // posortuj ids tak, żeby rodzic był przed dziećmi:
    // ids zwraca DFS od root w dół — to nam wystarczy
    for (const oldId of ids) {
      if (oldId === sourceFolderId) continue;
  
      const old = byId.get(oldId);
      if (!old) continue;
  
      const oldParent = old.parent_id || null;
      const newParent = oldParent ? mapOldToNew.get(oldParent) : null;
  
      const { data: inserted, error } = await sb()
        .from("qb_categories")
        .insert({
          base_id: state.baseId,
          parent_id: newParent,
          name: String(old.name || "Folder").slice(0, 80),
          ord: Number(old.ord) || 0,
        }, { defaultToNull: false })
        .select("id")
        .single();
  
      if (error) throw error;
      mapOldToNew.set(oldId, inserted.id);
    }
  
    // 5) wstaw pytania (duplikaty) do odpowiadających folderów
    const rows = (qs || []).map((q) => ({
      base_id: state.baseId,
      category_id: mapOldToNew.get(q.category_id) || newRoot.id,
      ord: Number(q.ord) || 0,
      payload: (q.payload && typeof q.payload === "object") ? q.payload : {},
      ...(state.user?.id ? { updated_by: state.user.id } : {}),
    }));
  
    if (rows.length) {
      const { error } = await sb().from("qb_questions").insert(rows, { defaultToNull: false });
      if (error) throw error;
    }
  
    // odśwież cache kategorii (bo doszło dużo folderów)
    if (state._api?.refreshCategories) await state._api.refreshCategories();
    state._rootQuestions = null;
  }
  
  async function moveItemsTo(state, targetFolderIdOrNull, { mode = "move" } = {}) {
    if (!canWrite(state)) return;
  
    const keys = state._drag?.keys;
    if (!keys || !keys.size) return;
  
    const qIds = [];
    const cIds = [];

    const isCopy = mode === "copy";

    if (isCopy && cIds.length) {
      alert("Kopiowanie folderów będzie w następnym etapie (na razie kopiują się tylko pytania).");
      return;
    }
  
    if (isCopy) {
      // COPY: tworzymy nowe pytania w docelowym folderze (ord na końcu)
      await copyQuestionsTo(state, qIds, targetFolderIdOrNull);
      await state._api?.refreshList?.();
      return;
    }
    
    for (const k of keys) {
      if (k.startsWith("q:")) qIds.push(k.slice(2));
      if (k.startsWith("c:")) cIds.push(k.slice(2));
    }
  
    // folder do siebie / do potomka = zakazane
    if (cIds.length && targetFolderIdOrNull) {
      for (const fid of cIds) {
        if (fid === targetFolderIdOrNull) {
          alert("Nie można przenieść folderu do niego samego.");
          return;
        }
        if (isFolderDescendant(fid, targetFolderIdOrNull)) {
          alert("Nie można przenieść folderu do jego podfolderu.");
          return;
        }
      }
    }
  
    // pytania: MOVE = update category_id, COPY = duplikuj rekordy
    if (qIds.length) {
      if (mode === "copy") {
        // weź źródłowe pytania z cache widoku (fallback: dociągnij z DB)
        const cache = Array.isArray(state._viewQuestions) ? state._viewQuestions : [];
        const byId = new Map(cache.map(q => [q.id, q]));
    
        // jeśli czegoś nie ma w cache, dociągniemy minimalnie z DB
        const missing = qIds.filter(id => !byId.has(id));
        if (missing.length) {
          const { data, error } = await sb()
            .from("qb_questions")
            .select("id,ord,payload,category_id")
            .in("id", missing);
          if (error) throw error;
          for (const q of (data || [])) byId.set(q.id, q);
        }
    
        const rows = qIds.map((id) => {
          const src = byId.get(id);
          return {
            base_id: state.baseId,
            category_id: targetFolderIdOrNull,
            ord: Number(src?.ord) || 0,
            payload: (src?.payload && typeof src.payload === "object") ? src.payload : {},
            ...(state.user?.id ? { updated_by: state.user.id } : {}),
          };
        });
    
        const { error } = await sb().from("qb_questions").insert(rows, { defaultToNull: false });
          if (error) throw error;
        } else {
          // move
          const upd = { category_id: targetFolderIdOrNull };
          if (state.user?.id) upd.updated_by = state.user.id;
      
          const { error } = await sb()
            .from("qb_questions")
            .update(upd)
            .in("id", qIds);
      
          if (error) throw error;
        }
      state._rootQuestions = null;
    }
  
    // foldery -> zmiana parent_id
    if (cIds.length) {
      const { error } = await sb()
        .from("qb_categories")
        .update({ parent_id: targetFolderIdOrNull })
        .in("id", cIds);
  
      if (error) throw error;
  
      // odśwież cache kategorii
      if (state._api?.refreshCategories) await state._api.refreshCategories();
    }
  
    // odśwież widok i zostaw zaznaczenie jak jest
    await state._api?.refreshList?.();
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

    // --- DnD na drzewie: drop na folder ---
  treeEl?.addEventListener("dragover", (e) => {
    if (!canDnD()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const row = e.target?.closest?.('.row[data-kind="cat"][data-id]');
    if (row) {
      // podświetlenie celu (użyj tej samej klasy co lista)
      row.classList.add("is-drop-target");
    }
  });

  treeEl?.addEventListener("dragleave", (e) => {
    const row = e.target?.closest?.('.row[data-kind="cat"][data-id]');
    row?.classList?.remove("is-drop-target");
  });

  treeEl?.addEventListener("drop", async (e) => {
    if (!canDnD()) return;
    e.preventDefault();

    const row = e.target?.closest?.('.row[data-kind="cat"][data-id]');
    const targetFolderId = row ? row.dataset.id : null;

    row?.classList?.remove("is-drop-target");

    try {
      // przenosimy to, co było przeciągane z listy
      if (state._drag?.keys?.size) {
        await moveItemsTo(state, targetFolderId, { mode: "move" });
      }
    } catch (err) {
      console.error(err);
      alert("Nie udało się przenieść.");
    } finally {
      state._drag.keys = null;
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

    if (isShift) {
      renderList(state);
    } else {
      scheduleRenderList();
    }
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

  listEl?.addEventListener("dragstart", (e) => {
    if (!canDnD()) return;
  
    const row = e.target?.closest?.('.row[data-kind][data-id]');
    if (!row) return;
  
    const kind = row.dataset.kind;   // 'q' | 'cat'
    const id = row.dataset.id;
    const key = (kind === "cat") ? `c:${id}` : (kind === "q" ? `q:${id}` : null);
    if (!key) return;
  
    // jeśli start drag na niezaznaczonym -> single select
    if (!state.selection?.keys?.has?.(key)) {
      selectionSetSingle(state, key);
      renderList(state);
    }
  
    // przenosimy całe zaznaczenie
    state._drag.keys = new Set(state.selection.keys);
  
    // wymagane przez przeglądarki
    try { e.dataTransfer.setData("text/plain", "move"); } catch {}
    e.dataTransfer.effectAllowed = "copyMove";
  });
  
  listEl?.addEventListener("dragover", (e) => {
    if (!canDnD()) return;
    e.preventDefault(); // pozwala na drop
    const isCopy = e.ctrlKey || e.metaKey;
    e.dataTransfer.dropEffect = isCopy ? "copy" : "move";
  
    const row = e.target?.closest?.('.row[data-kind="cat"][data-id]');
    if (row) {
      setDropTarget(row.dataset.id); // folder jako cel
    } else {
      setDropTarget(null); // puste tło -> root
    }
  });
  
  listEl?.addEventListener("dragleave", (e) => {
    // jeśli wychodzimy poza listę, zdejmij podświetlenie (nie zawsze odpali idealnie, ale pomaga)
    if (!listEl.contains(e.relatedTarget)) clearDropTarget();
  });
  
  listEl?.addEventListener("drop", async (e) => {
    if (!canDnD()) return;
    e.preventDefault();
  
    const row = e.target?.closest?.('.row[data-kind="cat"][data-id]');
    const targetFolderId = row ? row.dataset.id : null;
  
    clearDropTarget();
  
    try {
      const isCopy = e.ctrlKey || e.metaKey;
      await moveItemsTo(state, targetFolderId, { mode: isCopy ? "copy" : "move" });
    } catch (err) {
      console.error(err);
      alert("Nie udało się przenieść.");
    } finally {
      state._drag.keys = null;
    }
  });
  
  listEl?.addEventListener("dragend", () => {
    clearDropTarget();
    state._drag.keys = null;
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
    refreshCategories: async () => {
      // jeśli masz listCategories w repo.js, użyj jej:
      // state.categories = await listCategories(state.baseId);
  
      // jeśli jeszcze nie masz, to na razie zrób minimalny fetch tu:
      const { data, error } = await sb()
        .from("qb_categories")
        .select("id,base_id,parent_id,name,ord")
        .eq("base_id", state.baseId)
        .order("ord", { ascending: true });
      if (error) throw error;
      state.categories = data || [];
    },
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

  document.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") {
      selectionClear(state);
      renderList(state);
      return;
    }
  
    if (e.key === "Delete") {
      try {
        await deleteSelected(state);
      } catch (err) {
        console.error(err);
        alert("Nie udało się usunąć.");
      }
    }

      if (e.key === "F2") {
        // nie rename'uj kiedy user pisze w inpucie/textarea
        const tag = String(document.activeElement?.tagName || "").toLowerCase();
        if (tag === "input" || tag === "textarea") return;
    
        await renameSelectedPrompt(state);
      }
    
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
  
      // nie rób skrótów, gdy user pisze w inpucie/textarea
      const tag = String(document.activeElement?.tagName || "").toLowerCase();
      const typing = (tag === "input" || tag === "textarea");
      if (typing) return;
  
      if (mod && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        copySelectedToClipboard(state);
        return;
      }
  
      if (mod && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        cutSelectedToClipboard(state);
        return;
      }
  
      if (mod && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        try {
          await pasteClipboardHere(state);
        } catch (err) {
          console.error(err);
          alert("Nie udało się wkleić.");
        }
        return;
      }
    
      if (!typing && e.key === "Enter") {
        const key = onlyOneSelectedKey(state);
        if (key && key.startsWith("c:")) {
          e.preventDefault();
          const folderId = key.slice(2);
          await openFolderById(state, folderId);
          return;
        }
      }
    
      if (!typing && e.key === "Backspace") {
        // Backspace w eksploratorze: w górę
        if (state.view === VIEW.FOLDER) {
          e.preventDefault();
          await goUp(state);
          return;
        }
      }
  });

  return api;
}
