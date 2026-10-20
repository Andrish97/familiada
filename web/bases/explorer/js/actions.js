// base-explorerjs/actions.js
// Obsługa zdarzeń i akcji UI (klik, selection, search, folder view)

import {
  VIEW,
  META_ORDER,
  setViewAll,
  setViewFolder,
  saveTreeOpen,
  selectionClear,
  selectionSetSingle,
  selectionToggle,
  rememberBrowseLocation,
  restoreBrowseLocation,
} from "./state.js?v=v2026-10-20T19584";

import { importGame } from "../../../games/js/games-import-export.js?v=v2026-10-20T19584";
import { evaluateReadiness } from "../../../shared/js/core/game-rules.js?v=v2026-10-20T19584";
import { normQuestionText } from "../../../shared/js/core/question-form.js?v=v2026-10-20T19584";

import { renderAll, renderToolbar, renderList } from "./render.js?v=v2026-10-20T19584";


import {
  listQuestionsByCategory,
  listAllQuestions,
  listCategories,
  listTags,
  listQuestionTags,
  listQuestionIndex,
  listQuestionIndexInFolders,
  getQuestion,
} from "./repo.js?v=v2026-10-20T19584";

import { showContextMenu, hideContextMenu } from "./context-menu.js?v=v2026-10-20T19584";
import { openTagsModal } from "./tags-modal.js?v=v2026-10-20T19584";
import { initExportModal } from "./export-modal.js?v=v2026-10-20T19584";
import { initQuestionModal } from "./question-modal.js?v=v2026-10-20T19584";
import { initTrashModal } from "./trash-modal.js?v=v2026-10-20T19584";
import * as ops from "./ops.js?v=v2026-10-20T19584";
import { acquireResourceLock, acquireResourceLocks } from "../../../shared/js/core/resource-lock.js?v=v2026-10-20T19584";
import { alertModal, confirmModal } from "../../../shared/js/core/modal.js?v=v2026-10-20T19584";
import { t } from "../../../shared/translation/translation.js?v=v2026-10-20T19584";
import { linkTo } from "../../../shared/js/core/nav-map.js?v=v2026-10-20T19584";
import { addLongPress, addDoubleTap, isTouchContextMenuWindow } from "./mobile.js?v=v2026-10-20T19584";
import { enterModalSheet, exitModalSheet, isSheetViewport } from "../../../shared/js/core/modal-sheet.js?v=v2026-10-20T19584";


const btnBack = document.getElementById("btnBack");

let exportModal = null;

let questionModal = null;

/* ================= Utils ================= */
function canWrite(state) {
  return state?.role === "owner" || state?.role === "editor";
}

function isVirtualView(state) {
  return state?.view === VIEW.SEARCH || state?.view === VIEW.TAG || state?.view === VIEW.META;
}

function canMutateHere(state) {
  // mutacje bazy: create/rename/delete/paste/dnd
  return canWrite(state) && !isVirtualView(state);
}

function canPasteHere(state) {
  // paste dodatkowo wymaga schowka
  return canMutateHere(state) && !!state?.clipboard?.mode && !!state?.clipboard?.keys?.size;
}

function isMetaView(state) {
  return state.view === VIEW.META;
}

export function canDeleteHere(state) {
  if (!canWrite(state)) return false;
  if (isMetaView(state)) return false;   // META: blokada
  return true;                           // SEARCH/FOLDER/ALL/TAG: dozwolone
}

function canCutHere(state) {
  return canDeleteHere(state); // wycinanie = usuń + clipboard, więc te same reguły
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

function textOfFolder(c) {
  return String(c?.name ?? "").trim();
}

function applySearchFilterToFolders(allFolders, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return allFolders || [];
  return (allFolders || []).filter((c) => textOfFolder(c).toLowerCase().includes(q));
}

function currentRowKeys(container) {
  const rows = Array.from(container?.querySelectorAll?.('.row[data-kind][data-id]') || []);
  return rows
    .map((row) => {
      const kind = row.dataset.kind;
      const id = row.dataset.id;
      if (!kind || !id) return null;
      if (kind === "q") return `q:${id}`;
      if (kind === "cat") return `c:${id}`;
      return null;
    })
    .filter(Boolean);
}

function selectRange(state, listEl, clickedKey) {
  const keys = currentRowKeys(listEl);
  if (!keys.length) return;

  const a = state.selection.anchorKey;

  // jeśli nie ma anchor albo anchor nie jest na liście -> single
  if (!a || keys.indexOf(a) === -1) {
    selectionSetSingle(state, clickedKey);
    state.selection.anchorKey = clickedKey;
    return;
  }

  const i1 = keys.indexOf(a);
  const i2 = keys.indexOf(clickedKey);
  if (i1 === -1 || i2 === -1) {
    selectionSetSingle(state, clickedKey);
    state.selection.anchorKey = clickedKey;
    return;
  }

  const [from, to] = i1 < i2 ? [i1, i2] : [i2, i1];

  state.selection.keys.clear();
  for (let i = from; i <= to; i++) state.selection.keys.add(keys[i]);
  state.selection.anchorKey = clickedKey;
}

function selectionSplitIds(state) {
  return splitKeys(state?.selection?.keys);
}

function uniqIds(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

/* ====== Folder counters (direct children only) ====== */

// Minimalny indeks pytań do liczenia: id + category_id (bez payloadów)
async function ensureQuestionIndexForCounts(state) {
  if (Array.isArray(state._qIndex)) return;

  state._qIndex = await listQuestionIndex(state.baseId);
}

// Buduje mapę: folderId -> liczba (direct subfolders + direct questions)
// Root liczymy osobno jako "root"
async function buildDirectChildrenCountMap(state) {
  await ensureQuestionIndexForCounts(state);

  const cats = Array.isArray(state.categories) ? state.categories : [];
  const qs = Array.isArray(state._qIndex) ? state._qIndex : [];

  // 1) direct subfolders count
  const subfolderCount = new Map(); // folderId -> number
  for (const c of cats) {
    const pid = c.parent_id || null;
    const key = pid || "root";
    subfolderCount.set(key, (subfolderCount.get(key) || 0) + 1);
  }

  // 2) direct questions count
  const questionCount = new Map(); // folderId -> number
  for (const q of qs) {
    const cid = q.category_id || null;
    const key = cid || "root";
    questionCount.set(key, (questionCount.get(key) || 0) + 1);
  }

  // 3) merged
  const out = new Map(); // folderId or "root" -> number
  const allKeys = new Set([
    ...Array.from(subfolderCount.keys()),
    ...Array.from(questionCount.keys()),
  ]);

  for (const k of allKeys) {
    out.set(k, (subfolderCount.get(k) || 0) + (questionCount.get(k) || 0));
  }

  state._directChildrenCount = out;
}

function buildChildrenIdIndex(categories) {
  const byParent = new Map();
  for (const c of (categories || [])) {
    const pid = c.parent_id || null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(c.id);
  }
  return byParent;
}


/* ================= META (stałe "tagi" bez DB) ================= */

// Sugestia typu dla pytania (E21): ten sam silnik co gra (game-rules.js),
// bez progu liczby pytań. To klasyfikacja do filtrów, nie zakaz -- modal
// tworzenia gry przyjmuje każde zaznaczone pytanie.
function metaForQuestionPayload(payload) {
  const p = (payload && typeof payload === "object") ? payload : {};
  const q = { answers: Array.isArray(p.answers) ? p.answers : [] };
  const out = new Set();
  for (const type of ["poll_text", "poll_points", "prepared"]) {
    const issues = evaluateReadiness(type, [q]).issues.filter((i) => i.code !== "minQuestions");
    if (!issues.length) out.add(type);
  }
  return out;
}

/**
 * Buduje:
 *  - state._allQuestionMetaMap: Map(questionId -> metaId)
 *  - state._viewQuestionMetaMap: Map(questionId -> metaId) dla aktualnie wyświetlanych
 *  - state._allCategoryMetaMap: Map(folderId -> Set(metaId)) = meta, które ma 100% pytań w poddrzewie
 */
async function ensureMetaMapsForUI(state) {
  // allQuestions potrzebne do folderów (rekurencja)
  if (!state._allQuestions) {
    state._allQuestions = await listAllQuestions(state.baseId);
  }

  // questionId -> metaId (CACHE globalny)
  if (!state._allQuestionMetaMap) {
    const m = new Map();
    for (const q of (state._allQuestions || [])) {
    const metaSet = metaForQuestionPayload(q?.payload);
    m.set(q.id, metaSet);
    }
    state._allQuestionMetaMap = m;
  }

  // view map: dla pytań w bieżącej liście po prawej
  {
    const mView = new Map();
    const shown = Array.isArray(state.questions) ? state.questions : [];
    for (const q of shown) {
    const metaSet = state._allQuestionMetaMap.get(q.id) || metaForQuestionPayload(q?.payload);
    mView.set(q.id, metaSet);
    }
    state._viewQuestionMetaMap = mView;
  }

  // folder meta = przecięcie (100% pytań w poddrzewie mają ten sam meta)
  // Używamy już istniejącego folderDesc (z ensureDerivedFolderMaps)
  await ensureDerivedFolderMaps(state);

  const cats = Array.isArray(state.categories) ? state.categories : [];
  const descQ = state._folderDescQIds || new Map();

  const derived = new Map(); // folderId -> Set(metaId)

  for (const c of cats) {
    const qids = descQ.get(c.id);
    if (!qids || qids.size === 0) {
      derived.set(c.id, new Set());
      continue;
    }

    let intersection = null; // Set(metaId) albo null

    for (const qid of qids) {
      const set = state._allQuestionMetaMap.get(qid) || new Set(["poll_text"]);
      if (intersection === null) {
        intersection = new Set(set);
      } else {
        for (const mid of Array.from(intersection)) {
          if (!set.has(mid)) intersection.delete(mid);
        }
      }
      if (intersection.size === 0) break;
    }
    
    derived.set(c.id, intersection || new Set());
  }

  state._allCategoryMetaMap = derived;
}




/**
 * Buduje:
 *  - state._folderDescQIds: Map(folderId -> Set(questionId)) (rekurencyjnie)
 *  - state._derivedCategoryTagMap: Map(folderId -> Set(tagId)) = tagi które mają WSZYSTKIE pytania w folderze (rekurencyjnie)
 *
 * Źródło prawdy: qb_question_tags + qb_questions.category_id. Nie używamy qb_category_tags.
 */
async function ensureDerivedFolderMaps(state) {
  // Potrzebujemy wszystkich pytań (żeby policzyć rekurencję dla każdego folderu)
  if (!state._allQuestions) {
    state._allQuestions = await listAllQuestions(state.baseId);
  }

  // Mapa tagów dla wszystkich pytań
  if (!state._allQuestionTagMap) {
    const ids = (state._allQuestions || []).map(q => q.id).filter(Boolean);
    const links = ids.length ? await listQuestionTags(ids) : [];
    const m = new Map();
    for (const l of (links || [])) {
      if (!m.has(l.question_id)) m.set(l.question_id, new Set());
      m.get(l.question_id).add(l.tag_id);
    }
    state._allQuestionTagMap = m;
  }

  const cats = Array.isArray(state.categories) ? state.categories : [];
  const byParent = buildChildrenIdIndex(cats);

  // folder -> pytania bezpośrednie
  const directQByFolder = new Map(); // folderId -> [qId...]
  for (const q of (state._allQuestions || [])) {
    const cid = q.category_id || null;
    if (!cid) continue; // root (pytania w folderze głównym) nie przypisujemy do folderId
    if (!directQByFolder.has(cid)) directQByFolder.set(cid, []);
    directQByFolder.get(cid).push(q.id);
  }

  // folder -> descendant question ids (rekurencyjnie)
  const descQ = new Map(); // folderId -> Set(qid)

  function computeDescQ(folderId) {
    if (descQ.has(folderId)) return descQ.get(folderId);

    const set = new Set();
    const direct = directQByFolder.get(folderId) || [];
    for (const qid of direct) set.add(qid);

    const childFolders = byParent.get(folderId) || [];
    for (const childId of childFolders) {
      const childSet = computeDescQ(childId);
      for (const qid of childSet) set.add(qid);
    }

    descQ.set(folderId, set);
    return set;
  }

  for (const c of cats) {
    computeDescQ(c.id);
  }
  state._folderDescQIds = descQ;

  // folder -> tagIds które mają wszystkie pytania w folderze (rekurencyjnie)
  const derived = new Map();
  const qTagMap = state._allQuestionTagMap;

  for (const c of cats) {
    const qids = descQ.get(c.id);
    if (!qids || qids.size === 0) {
      derived.set(c.id, new Set());
      continue;
    }

    let intersection = null; // Set(tagId) lub null
    for (const qid of qids) {
      const tags = qTagMap.get(qid) || new Set();
      if (intersection === null) {
        intersection = new Set(tags);
      } else {
        for (const tid of Array.from(intersection)) {
          if (!tags.has(tid)) intersection.delete(tid);
        }
      }
      if (intersection.size === 0) break;
    }

    derived.set(c.id, intersection || new Set());
  }

  state._derivedCategoryTagMap = derived;
}

async function selectionToQuestionIds(state) {
  const { qIds, cIds } = selectionSplitIds(state);

  // foldery -> pytania (w poddrzewie)
  if (cIds.length) {
    await ensureDerivedFolderMaps(state); // przygotuje state._folderDescQIds
    const map = state._folderDescQIds;    // Map(folderId -> Set(questionId))

    const out = new Set(qIds);
    for (const cid of cIds) {
      const set = map?.get?.(cid);
      if (!set) continue;
      for (const qid of set) out.add(qid);
    }
    return Array.from(out);
  }

  return qIds;
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

async function ensureTagMapsForUI(state) {
  // potrzebujemy listy tagów do tooltipów
  if (!Array.isArray(state.tags)) {
    try { await refreshTags(state); } catch {}
  }

  // 1) CATEGORY TAG MAP — najlepiej cache dla CAŁEGO drzewa (folderów)
  // ZAMIANA: nie bierzemy tagów folderów z qb_category_tags.
  // Folder ma "tag" tylko jeśli 100% pytań w jego poddrzewie ma ten tag.
  await ensureDerivedFolderMaps(state);

  // dla zgodności z resztą kodu:
  state._allCategoryTagMap = state._derivedCategoryTagMap || new Map();

  // 2) QUESTION TAG MAP — tylko dla pytań aktualnie wyświetlanych (lista po prawej)
  const qShown = Array.isArray(state.questions) ? state.questions : [];
  const qIds = qShown.map(q => q.id).filter(Boolean);

  const mQ = new Map();
  if (qIds.length) {
    const linksQ = await listQuestionTags(qIds);
    for (const l of (linksQ || [])) {
      if (!mQ.has(l.question_id)) mQ.set(l.question_id, new Set());
      mQ.get(l.question_id).add(l.tag_id);
    }
  }
  state._viewQuestionTagMap = mQ;
    // 3) META MAPS (stałe "tagi")
  await ensureMetaMapsForUI(state);
}

async function refreshList(state) {

  // ===== Refresh guard (eliminuje race-condition) =====
  state._refreshSeq = (state._refreshSeq || 0) + 1;
  const _seq = state._refreshSeq;
  const isStale = () => _seq !== state._refreshSeq;
  // ===================================================

  // --- Drzewo: init + auto-otwórz ścieżkę do aktualnego folderu ---
  if (!(state.treeOpen instanceof Set)) state.treeOpen = new Set();

  if (state.view === VIEW.FOLDER && state.folderId) {
    const byId = new Map((state.categories || []).map(c => [c.id, c]));
    let cur = byId.get(state.folderId);
    let guard = 0;
    while (cur && guard++ < 20) {
      state.treeOpen.add(cur.id);
      const pid = cur.parent_id || null;
      cur = pid ? byId.get(pid) : null;
    }
  }

  // ====== ŹRÓDŁA DANYCH ======
  // Widoki wirtualne liczymy na CAŁOŚCI (allQuestions + allFolders),
  // a browse liczymy lokalnie (folder/root).
  const foldersAll = Array.isArray(state.categories) ? state.categories : [];

  // globalny cache pytań jest potrzebny dla TAG/META/SEARCH
  if ((state.view === VIEW.SEARCH || state.view === VIEW.TAG || state.view === VIEW.META) && !state._allQuestions) {
    state._allQuestions = await listAllQuestions(state.baseId);
  }

  // browse: folder/root
  const browseQuestions = await loadQuestionsForCurrentView(state);
  state._viewQuestions = browseQuestions;

  // ====== WSPÓLNE MAPY (tag/meta) ======
  // Tylko gdy mamy coś do renderowania (kropki + tooltips)
  async function ensureMapsForCurrentRightList() {
    await ensureTagMapsForUI(state);
  }
  // ====== SILNIK FILTRÓW ======
  // 1) META: OR wewnątrz metaSelection
  // 2) TAG: AND (wszystkie zaznaczone tagi muszą być na pytaniu)
  // 3) TEXT: AND (po przefiltrowaniu tag/meta)
  //
  // Dodatkowo: SEARCH ma tekst + tagIds z searchTokens (a nie tylko z lewego panelu).
  function getActiveTagIdsForFilter() {
    // priorytet: jeśli jesteśmy w SEARCH i searchTokens ma tagi, używamy ich
    if (state.view === VIEW.SEARCH) {
      const ids = Array.isArray(state.searchTokens?.tagIds) ? state.searchTokens.tagIds : [];
      return ids.filter(Boolean);
    }
    // w TAG/META: tagi biorą się z lewego panelu (state.tagIds)
    const ids = Array.isArray(state.tagIds) ? state.tagIds : [];
    return ids.filter(Boolean);
  }

  function getActiveMetaIdsForFilter() {
    const ids = Array.from(state?.metaSelection?.ids || []).filter(Boolean);
    return ids;
  }

  function getActiveTextQuery() {
    if (state.view === VIEW.SEARCH) {
      return String(state.searchTokens?.text || "").trim();
    }
    // browse ma klasyczny searchQuery
    return String(state.searchQuery || "").trim();
  }

  async function ensureAllQuestionTagMap() {
    if (state._allQuestionTagMap) return;

    const qAll = state._allQuestions || [];
    const idsAll = qAll.map(x => x.id).filter(Boolean);

    // Każde pytanie ma wpis (nawet jeśli nie ma tagów)
    const m = new Map();
    for (const id of idsAll) m.set(id, new Set());

    if (idsAll.length) {
      const links = await listQuestionTags(idsAll);
      for (const l of (links || [])) {
        if (!m.has(l.question_id)) m.set(l.question_id, new Set());
        m.get(l.question_id).add(l.tag_id);
      }
    }

    state._allQuestionTagMap = m;
  }

  function questionPassesTags_AND(qid, tagIds) {
    if (!tagIds.length) return true;
    const set = state._allQuestionTagMap?.get?.(qid);
    if (!set) return false;
    for (const tid of tagIds) if (!set.has(tid)) return false;
    return true;
  }

  function questionPassesMeta_AND(qid, metaIds) {
    if (!metaIds.length) return true;
  
    const metaSet =
      state._allQuestionMetaMap?.get?.(qid) ||
      metaForQuestionPayload(
        (state._allQuestions || []).find(x => x.id === qid)?.payload
      ) ||
      new Set(["poll_text"]);
  
    for (const mid of metaIds) {
      if (!metaSet.has(mid)) return false;
    }
    return true;
  }
  
  // ====== WIDOKI WIRTUALNE ======
  // SEARCH / TAG / META korzystają z jednej ścieżki: filtrujemy pytania globalnie,
  // potem budujemy foldery wynikowe analogicznie do SEARCH (foldery z wyników + rodzice),
  // a na końcu "ukrywamy" pytania będące wewnątrz folderów które pokazujemy jako topFolders.
  async function buildVirtualViewResults({ tagIds, metaIds, textQ }) {
    const qAll = state._allQuestions || [];
    const byIdAll = new Map(foldersAll.map(c => [c.id, c]));

    // meta mapy (question->metaSet i folderDesc) potrzebne do meta/tagi/derived
    await ensureMetaMapsForUI(state);
    await ensureDerivedFolderMaps(state); // daje też _folderDescQIds

    // tag mapy globalnie tylko jeśli tagi są użyte
    if (tagIds.length) await ensureAllQuestionTagMap();

   // 1) META: AND wewnątrz metaSelection
    let qs = qAll.filter(q => {
      if (!questionPassesMeta_AND(q.id, metaIds)) return false;
      if (!questionPassesTags_AND(q.id, tagIds)) return false;
      return true;
    });

    qs = applySearchFilterToQuestions(qs, textQ);

    // 2) foldery wynikowe — WYŁĄCZNIE „100% dzieci pasujących"
    // Folder pokazujemy tylko wtedy, gdy wszystkie pytania w jego poddrzewie spełniają predykat (tag/meta/text).
    // Jeśli folder jest pokazany, to pytań spod niego NIE pokazujemy w wynikach.
    const matchedQIds = new Set((qs || []).map(q => q.id).filter(Boolean));

    const folderDesc = state._folderDescQIds || new Map();

    const fullFolders = [];           // foldery które mają 100% dopasowanych pytań w poddrzewie
    const fullFolderIdSet = new Set();

    for (const c of (foldersAll || [])) {
      const qids = folderDesc.get(c.id);
      if (!qids || qids.size === 0) continue;

      let ok = true;
      for (const qid of qids) {
        if (!matchedQIds.has(qid)) { ok = false; break; }
      }
      if (!ok) continue;

      fullFolders.push(c);
      fullFolderIdSet.add(c.id);
    }

    // topFolders = tylko te „pełne" foldery, które nie mają przodka też „pełnego"
    function hasFullAncestor(folderId) {
      let cur = byIdAll.get(folderId);
      let guard = 0;
      while (cur && guard++ < 50) {
        const pid = cur.parent_id || null;
        if (!pid) return false;
        if (fullFolderIdSet.has(pid)) return true;
        cur = byIdAll.get(pid);
      }
      return false;
    }

    const topFolders = fullFolders.filter(f => !hasFullAncestor(f.id));
    const topFolderIds = new Set(topFolders.map(f => f.id));

    // foldery pasujące po nazwie — dodaj je niezależnie od logiki "100% dzieci"
    if (textQ) {
      for (const c of applySearchFilterToFolders(foldersAll, textQ)) {
        if (!fullFolderIdSet.has(c.id)) {
          topFolders.push(c);
          topFolderIds.add(c.id);
        }
      }
    }
    
    function isInsideTopFolder(categoryId) {
      if (!categoryId) return false;
      let cur = byIdAll.get(categoryId);
      let guard = 0;
      while (cur && guard++ < 50) {
        if (topFolderIds.has(cur.id)) return true;
        const pid = cur.parent_id || null;
        cur = pid ? byIdAll.get(pid) : null;
      }
      return false;
    }
    const outQ = qs.filter(q => !isInsideTopFolder(q.category_id || null));

    return { folders: topFolders, questions: outQ };
  }

  // ====== ROUTING WIDOKU ======
  // SEARCH: tekst + opcjonalne tagi z searchTokens
  if (state.view === VIEW.SEARCH) {
    const tagIds = getActiveTagIdsForFilter();
    const metaIds = []; // SEARCH nie bierze meta z lewego panelu (meta to osobny filtr)
    const textQ = getActiveTextQuery();

    const { folders, questions } = await buildVirtualViewResults({ tagIds, metaIds, textQ });  
    state.folders = folders;
    state.questions = questions;
    if (isStale()) return;

    // ====== Liczniki folderów (pytania + foldery, tylko bezpośrednio) ======
    try {
      await buildDirectChildrenCountMap(state);
    } catch (e) {
      console.warn("Direct folder counts failed:", e);
      state._directChildrenCount = new Map();
    }

    await ensureMapsForCurrentRightList();
    if (isStale()) return;
    renderAll(state);

    return;
  }

  // META: metaSelection + opcjonalnie tagIds (AND)
  if (state.view === VIEW.META) {
    const metaIds = getActiveMetaIdsForFilter();
    if (!metaIds.length) {
      restoreBrowseLocation(state);
      selectionClear(state);
      await refreshList(state);
      return;
    }

    const tagIds = getActiveTagIdsForFilter();
    const textQ = ""; // META widok nie jest tekstowym wyszukiwaniem

    const { folders, questions } = await buildVirtualViewResults({ tagIds, metaIds, textQ });
    state.folders = folders;
    state.questions = questions;
    if (isStale()) return;
    
    await ensureMapsForCurrentRightList();
    if (isStale()) return;
    renderAll(state);

    return;
  }

  // TAG: tagIds (AND) + opcjonalnie metaSelection (OR)
  if (state.view === VIEW.TAG) {
    const tagIds = getActiveTagIdsForFilter();
    const metaIds = getActiveMetaIdsForFilter();

    if (!tagIds.length && !metaIds.length) {
      restoreBrowseLocation(state);
      selectionClear(state);
      await refreshList(state);
      return;
    }

    const textQ = ""; // TAG widok nie jest tekstowym wyszukiwaniem

    const { folders, questions } = await buildVirtualViewResults({ tagIds, metaIds, textQ });
    state.folders = folders;
    state.questions = questions;
    if (isStale()) return;

    await ensureMapsForCurrentRightList();
    if (isStale()) return;
    renderAll(state);

    return;
  }

  // ====== BROWSE (ALL/FOLDER) ======
  const parentId = (state.view === VIEW.ALL) ? null : state.folderId;

  const foldersHere = (foldersAll || [])
    .filter(c => (c.parent_id || null) === (parentId || null))
    .slice()

  state.folders = foldersHere;
  state.questions = applySearchFilterToQuestions(browseQuestions, getActiveTextQuery());

  await ensureMapsForCurrentRightList();
  if (isStale()) return;
  await rebuildStatusMaps(state);
  if (isStale()) return;
  renderAll(state);

}

function currentParentId(state) {
  // Root = parent_id null
  return (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
}


// ================== STATUS MAPS (global) ==================
async function rebuildStatusMaps(state) {
// _allQuestionTagMap buduje ensureDerivedFolderMaps/ensureAllQuestionTagMap.
// Nie ustawiamy tu pustej Map(), bo to psuje filtry tagów.
  try {
    await buildDirectChildrenCountMap(state);
  } catch (e) {
    console.warn("buildDirectChildrenCountMap failed:", e);
    state._directChildrenCount = new Map();
  }
}



export async function createFolderHere(state, { parentId = null } = {}) {
  if (!canMutateHere(state)) return false;
  await ops.createFolder(state.baseId, parentId, t("baseExplorer.toolbar.newFolder"));
  await afterMutation(state, { categories: true });
  return true;
}

export async function createQuestionHere(state, { categoryId = null } = {}) {
  if (!canMutateHere(state)) return false;
  await ops.createQuestion(state.baseId, categoryId, { text: t("baseExplorer.toolbar.newQuestion"), answers: [] });
  await afterMutation(state);
  return true;
}

export async function deleteItems(state, keys) {
  if (!canWrite(state)) return false;

  const { qIds, cIds } = splitKeys(keys);
  // jeśli w zaznaczeniu nie ma realnych elementów (np. tylko "root") — nic nie rób
  if (!qIds.length && !cIds.length) return false;

  // Blokada całego poddrzewa (patrz collectSubtreeLockResources); samo
  // usunięcie poddrzewa z pytaniami robi baza w jednej transakcji.
  const lease = await acquireResourceLocks([
    ...qIds.map((resourceId) => ({ resourceType: "base_question", resourceId })),
    ...(cIds.length ? await collectSubtreeLockResources(state, cIds) : []),
  ], { context: "base-explorer:delete" });
  if (!lease?.ok) return lockRefused(lease);

  try {
    await ops.deleteItems(state.baseId, { questionIds: qIds, folderIds: cIds });
  } catch (e) {
    return opFailed(e);
  } finally {
    lease.release();
  }

  await afterMutation(state, { categories: cIds.length > 0 });
  void state._api?.refreshTrash?.(); // licznik kosza
  return true;
}

export async function deleteSelected(state) {
  const keys = state?.selection?.keys;
  if (!keys || !keys.size) return false;

  if (keys.has("root")) {
    void alertModal({ text: t("baseExplorer.errors.rootDeleteBlocked") });
    return false;
  }

  const text = keys.size === 1
    ? t("baseExplorer.confirm.deleteOne")
    : t("baseExplorer.confirm.deleteMany", { n: keys.size });
  const ok = await confirmModal({ text });
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

// Ten sam limit pytania co edytory (100 znaków, E21).
function safeQuestionText(s) {
  return normQuestionText(s);
}

export async function renameByKey(state, key, newValueRaw) {
  if (!canWrite(state)) return false;
  if (!key) return false;

  const isFolder = key.startsWith("c:");
  if (!isFolder && !key.startsWith("q:")) return false;
  const val = isFolder ? safeName80(newValueRaw) : safeQuestionText(newValueRaw);
  if (!val) return false;

  const id = key.slice(2);
  try {
    // Pytanie: baza podmienia tylko payload.text — odpowiedzi dodane
    // w międzyczasie gdzie indziej zostają.
    if (isFolder) await ops.renameFolder(state.baseId, id, val);
    else await ops.setQuestionText(state.baseId, id, val);
  } catch (e) {
    return opFailed(e);
  }

  await afterMutation(state, { categories: isFolder });
  return true;
}

function openRenameModal({ title, value = "", maxLen = 80 } = {}) {
  const modal = document.getElementById("renameModal");
  const input = document.getElementById("renameModalInput");
  const btnSave = document.getElementById("renameModalSave");
  const btnClose = document.getElementById("renameModalClose");
  const titleEl = document.getElementById("renameModalTitle");

  if (!modal || !input || !btnSave || !btnClose || !titleEl) {
    // jeśli ktoś zapomni wkleić HTML: po prostu anuluj
    return Promise.resolve(null);
  }

  // jednorazowe bindowanie (żeby nie dokładać listenerów przy każdym otwarciu)
  if (!modal._wired) {
    modal._wired = true;

    modal.addEventListener("click", (e) => {
      // klik w tło zamyka -- ale nie w trybie sheet (mobile), gdzie
      // jedynym wyjściem ma być przycisk wstecz w topbarze.
      if (modal.classList.contains("modal--sheet") && isSheetViewport()) return;
      if (e.target && e.target.matches?.("[data-close]")) {
        modal._resolver?.(null);
      }
    });

    btnClose.addEventListener("click", () => {
      modal._resolver?.(null);
    });

    // ESC zamyka
    document.addEventListener("keydown", (e) => {
      if (modal.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        modal._resolver?.(null);
      }
    });

    // Enter = zapisz
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnSave.click();
      }
    });

    btnSave.addEventListener("click", () => {
      const v = String(input.value || "").trim();
      modal._resolver?.(v || null);
    });
  }

  titleEl.textContent = title || t("baseExplorer.rename.title");
  input.value = String(value || "");
  input.maxLength = Number(maxLen) || 80;

  modal.hidden = false;
  enterModalSheet(modal, { backBtn: btnBack, onClose: () => modal._resolver?.(null) });

  // focus + zaznacz tekst
  setTimeout(() => {
    try {
      input.focus();
      input.setSelectionRange(0, input.value.length);
    } catch {}
  }, 0);

  return new Promise((resolve) => {
    modal._resolver = (result) => {
      modal.hidden = true;
      exitModalSheet(modal);
      modal._resolver = null;
      resolve(result);
    };
  });
}

export async function renameSelectedPrompt(state) {
  if (!canWrite(state)) return false;

  const key = singleSelectedKey(state);

  // ZASADA: zmiana nazwy tylko gdy zaznaczony jest 1 element.
  // Bez alertu — po prostu nic nie rób.
  if (!key) return false;

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

  const title = isFolder
    ? t("baseExplorer.rename.folderTitle")
    : t("baseExplorer.rename.questionTitle");
  const maxLen = isFolder ? 80 : 200;
  const resourceId = key.slice(2);
  let lease = null;
  try {
    lease = await acquireResourceLock({
      resourceType: isFolder ? "base_folder" : "base_question",
      resourceId,
      context: "base-explorer:rename",
    });
    if (!lease?.ok) {
      void alertModal({
        text: lease?.error === "gone"
          ? t("resourceLock.goneMessage")
          : t("resourceLock.baseItemMessage"),
      });
      return false;
    }

    const next = await openRenameModal({ title, value: current, maxLen });
    if (next === null) return false; // anulowano (X / ESC / tło)

    if (!lease.ok) {
      void alertModal({
        text: lease.reason === "gone"
          ? t("resourceLock.goneMessage")
          : t("resourceLock.forbiddenMessage"),
      });
      return false;
    }

    return await renameByKey(state, key, next);
  } catch (e) {
    console.error(e);
    void alertModal({ text: t("baseExplorer.errors.renameFailed") });
    return false;
  } finally {
    lease?.release?.();
  }
}

// Usuń tagi jako byty (qb_tags) + ich przypisania
export async function deleteTags(state, tagIds) {
  if (!canWrite(state)) return false;

  const ids = uniqIds(tagIds);
  if (!ids.length) return false;

  const text = ids.length === 1
    ? t("baseExplorer.confirm.deleteTagsOne")
    : t("baseExplorer.confirm.deleteTagsMany", { n: ids.length });
  const ok = await confirmModal({ text });
  if (!ok) return false;

  const lease = await acquireResourceLocks(
    ids.map((resourceId) => ({ resourceType: "base_tag", resourceId })),
    { context: "base-explorer:delete-tags" }
  );
  if (!lease?.ok) return lockRefused(lease);

  try {
    await ops.deleteTags(state.baseId, ids); // przypisania znikają razem z tagiem
  } catch (e) {
    return opFailed(e);
  } finally {
    lease.release();
  }

  // lokalnie wyczyść selekcję usuniętych tagów
  for (const id of ids) state.tagSelection.ids.delete(id);
  if (!state.tagSelection.ids.size) state.tagSelection.anchorId = null;

  // w VIEW.TAG bez pozostałych tagów -> wróć do ostatniego miejsca
  if (state.view === VIEW.TAG) {
    const remaining = Array.from(state.tagSelection.ids);
    if (remaining.length) state.tagIds = remaining;
    else restoreBrowseLocation(state);
  }

  selectionClear(state);
  await afterMutation(state, { tags: true });
  return true;
}

// Duplikuj zaznaczone elementy w bieżącym miejscu (jak Explorer: copy+paste)
export async function duplicateSelected(state) {
  if (!canMutateHere(state)) return false;

  const keys = state?.selection?.keys;
  if (!keys || !keys.size) return false;

  // root nie jest elementem do duplikowania
  if (keys.size === 1 && keys.has("root")) return false;

  copySelectedToClipboard(state);
  return await pasteClipboardHere(state);
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
  const onlyReal = Array.from(keys || []).filter(k =>
    typeof k === "string" && (k.startsWith("q:") || k.startsWith("c:"))
  );
  state.clipboard.mode = mode;
  state.clipboard.keys = new Set(onlyReal);

  // odśwież toolbar żeby "Wklej" się odblokował
  renderToolbar(state);
}

function clipboardClear(state) {
  state.clipboard.mode = null;
  state.clipboard.keys = new Set();
  renderToolbar(state);
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
  if (!canMutateHere(state)) return false;

  const target = (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
  const keys = state.clipboard.keys;

  if (state.clipboard.mode === "copy") {
    return await copyItemsTo(state, keys, target);
  }

  // wycięcie = przeniesienie; schowek pustoszeje
  if (state.clipboard.mode === "cut") {
    const ok = await moveItemsTo(state, keys, target);
    clipboardClear(state);
    return ok;
  }

  return false;
}

/* ================= DnD / Clipboard helpers (MUSZĄ być poza wireActions) ================= */

function invalidateDerivedCaches(state) {
  // pytania
  state._allQuestions = null;
  state._viewQuestions = null;
  state._rootQuestions = null;

  // tagi
  state._viewQuestionTagMap = null;
  state._allQuestionTagMap = null;
  state._allCategoryTagMap = null;
  state._derivedCategoryTagMap = null;
  state._folderDescQIds = null;

  // meta
  state._allQuestionMetaMap = null;
  state._allCategoryMetaMap = null;
  state._viewQuestionMetaMap = null;

  // folder counters / indeksy do liczników (KLUCZOWE dla "wrzucam pytania do środka")
  state._qIndex = null;
  state._directChildrenCount = null;
}

// Klucze "q:<id>" / "c:<id>" → id pytań i folderów (inne klucze, np. "root", pomijane).
function splitKeys(keys) {
  const qIds = [];
  const cIds = [];
  for (const k of keys || []) {
    if (typeof k !== "string") continue;
    if (k.startsWith("q:")) qIds.push(k.slice(2));
    if (k.startsWith("c:")) cIds.push(k.slice(2));
  }
  return { qIds: uniqIds(qIds), cIds: uniqIds(cIds) };
}

function splitKeysToItems(keys) {
  const { qIds, cIds } = splitKeys(keys);
  return { questionIds: qIds, folderIds: cIds };
}

// Blokada zajęta (ktoś inny edytuje) albo element zniknął.
function lockRefused(lease) {
  void alertModal({ text: lease?.error === "gone" ? t("resourceLock.goneMessage") : t("resourceLock.baseItemMessage") });
  return false;
}

// Znany błąd operacji (ops.js: element zniknął, brak uprawnień, cykl…) →
// komunikat i false; nieznany leci dalej do ogólnego komunikatu wywołującego.
function opFailed(e) {
  if (!e?.userMessage) throw e;
  void alertModal({ text: e.userMessage });
  return false;
}

// Po każdym zapisie: jedno miejsce odświeżenia pamięci podręcznej i widoku.
async function afterMutation(state, { categories = false, tags = false } = {}) {
  invalidateDerivedCaches(state);
  if (categories) state.categories = await listCategories(state.baseId);
  if (tags) await refreshTags(state);
  await refreshList(state);
}

function isFolderDescendant(state, folderId, maybeParentId) {
  // true, jeśli maybeParentId leży w poddrzewie folderId
  const byId = new Map((state.categories || []).map(c => [c.id, c]));
  let cur = byId.get(maybeParentId);
  let guard = 0;
  while (cur && guard++ < 80) {
    if (cur.id === folderId) return true;
    const pid = cur.parent_id || null;
    cur = pid ? byId.get(pid) : null;
  }
  return false;
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

/**
 * Rozwija listę folderów do PEŁNEGO poddrzewa (foldery + zagnieżdżone
 * pytania) jako gotowa lista zasobów do zablokowania. Używane przez każdą
 * operację STRUKTURALNĄ na folderze (delete/move/reorder) -- blokowanie
 * całego poddrzewa, nie tylko samego folderu, to jedyny sposób, żeby
 * równoległa próba dotknięcia dowolnego potomka (który acquire'uje blokadę
 * na swoim WŁASNYM id) trafiła w kolizję na tym samym kluczu w edit_locks,
 * bez osobnego mechanizmu chodzenia po łańcuchu przodków. Rename folderu
 * (zmienia tylko `name`, nie rusza potomków) świadomie NIE korzysta z tego
 * helpera.
 */
async function collectSubtreeLockResources(state, folderIds) {
  const ids = Array.from(new Set((folderIds || []).filter(Boolean)));
  if (!ids.length) return [];

  const subtreeFolderIds = Array.from(new Set(
    ids.flatMap((fid) => collectSubtreeIds(state.categories || [], fid))
  ));

  const nested = await listQuestionIndexInFolders(state.baseId, subtreeFolderIds);

  return [
    ...subtreeFolderIds.map((resourceId) => ({ resourceType: "base_folder", resourceId })),
    ...nested.map((row) => ({ resourceType: "base_question", resourceId: row.id })),
  ];
}



// Kopiuje pytania i foldery (z poddrzewem i tagami) do folderu docelowego
// (null = korzeń). Kopię w całości robi baza (qb_copy_items).
async function copyItemsTo(state, keys, targetFolderIdOrNull) {
  if (!canWrite(state)) return false;
  const { qIds, cIds } = splitKeys(keys);
  if (!qIds.length && !cIds.length) return false;

  try {
    await ops.copyItems(state.baseId, { questionIds: qIds, folderIds: cIds }, targetFolderIdOrNull);
  } catch (e) {
    return opFailed(e);
  }
  await afterMutation(state, { categories: cIds.length > 0 });
  return true;
}


// Przenosi pytania i foldery do folderu docelowego (null / "root" = korzeń).
async function moveItemsTo(state, keys, targetFolderIdOrNull) {
  if (!canWrite(state)) return false;

  // "root" to sentinel UI — w bazie parent_id/category_id = null
  if (targetFolderIdOrNull === "root") targetFolderIdOrNull = null;

  const { qIds, cIds } = splitKeys(keys);
  if (!qIds.length && !cIds.length) return false;

  // szybka odpowiedź bez blokad; baza i tak sprawdza cykl (qb:cycle)
  if (cIds.includes(targetFolderIdOrNull)) {
    void alertModal({ text: t("baseExplorer.errors.moveIntoSelf") });
    return false;
  }
  if (cIds.some((fid) => isFolderDescendant(state, fid, targetFolderIdOrNull))) {
    void alertModal({ text: t("baseExplorer.errors.moveIntoChild") });
    return false;
  }

  // Całe przenoszone poddrzewo (foldery + zagnieżdżone pytania), nie tylko
  // sam przenoszony folder -- patrz collectSubtreeLockResources().
  const lease = await acquireResourceLocks([
    ...qIds.map((resourceId) => ({ resourceType: "base_question", resourceId })),
    ...(cIds.length ? await collectSubtreeLockResources(state, cIds) : []),
    ...(targetFolderIdOrNull ? [{ resourceType: "base_folder", resourceId: targetFolderIdOrNull }] : []),
  ], { context: "base-explorer:move" });
  if (!lease?.ok) return lockRefused(lease);

  try {
    await ops.moveItems(state.baseId, { questionIds: qIds, folderIds: cIds }, targetFolderIdOrNull);
  } catch (e) {
    return opFailed(e);
  } finally {
    lease.release();
  }

  await afterMutation(state, { categories: cIds.length > 0 });
  return true;
}

// Upuszczenie elementów na tag: tag dostają pytania i całe poddrzewa folderów.
async function applyTagToDraggedItems(state, tagId, draggedKeys) {
  if (!canWrite(state)) return false;
  if (!tagId) return false;

  const { qIds, cIds } = splitKeys(draggedKeys);
  if (!qIds.length && !cIds.length) return false;

  const lease = await acquireResourceLocks([
    { resourceType: "base_tag", resourceId: tagId },
    ...qIds.map((resourceId) => ({ resourceType: "base_question", resourceId })),
    ...(cIds.length ? await collectSubtreeLockResources(state, cIds) : []),
  ], { context: "base-explorer:assign-tag" });
  if (!lease?.ok) return lockRefused(lease);

  try {
    await ops.setTagLinks(state.baseId, [tagId], { questionIds: qIds, folderIds: cIds }, true);
  } catch (e) {
    return opFailed(e);
  } finally {
    lease.release();
  }

  await afterMutation(state);
  return true;
}

/* ================= Reorder folders in tree ================= */

function catById(state, id) {
  return (state.categories || []).find(c => c.id === id) || null;
}

function sortByOrd(a, b) {
  return (Number(a?.ord) || 0) - (Number(b?.ord) || 0);
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

async function applyCategoryOrder(state, parentIdOrNull, orderedIds) {
  const ids = uniq(orderedIds);
  if (!ids.length) return false;

  // "root" to sentinel UI — w bazie parent_id = null
  const dbParent = (parentIdOrNull === "root" || !parentIdOrNull) ? null : parentIdOrNull;

  // Całe poddrzewo każdego reorderowanego/przenoszonego folderu (foldery +
  // zagnieżdżone pytania), nie tylko jego własne id -- patrz
  // collectSubtreeLockResources(). Reorder w obrębie tego samego rodzica
  // (bez zmiany parent_id) zyskuje trochę szerszą blokadę niż ściśle
  // konieczna, ale to ten sam, jeden spójny model co przy delete/move.
  const lease = await acquireResourceLocks([
    ...(await collectSubtreeLockResources(state, ids)),
    ...(dbParent ? [{ resourceType: "base_folder", resourceId: dbParent }] : []),
  ], { context: "base-explorer:reorder-folders" });
  if (!lease?.ok) return lockRefused(lease);

  // rodzic + kolejność 1..N jednym zapisem w bazie
  try {
    await ops.reorderFolders(state.baseId, dbParent, ids);
  } catch (e) {
    return opFailed(e);
  } finally {
    lease.release();
  }

  await afterMutation(state, { categories: true });
  return true;
}

/**
 * Reorder / move folders among siblings of a parent.
 * mode:
 *  - "into": move into targetId (as parent), append at end
 *  - "before"/"after": ensure same parent as target, then insert before/after target among its siblings
 */
async function reorderFoldersByDrop(state, movedFolderIds, targetId, mode) {
  const moved = uniq(movedFolderIds);
  if (!moved.length) return;

  const target = catById(state, targetId);
  if (!target) return;

  // "into" => parent = targetId
  if (mode === "into") {
    // weź rodzeństwo w folderze docelowym
    const siblings = (state.categories || [])
      .filter(c => (c.parent_id || null) === (targetId || null))
      .slice()
      .sort(sortByOrd);

    const sibIds = siblings.map(c => c.id).filter(id => !moved.includes(id));
    const finalIds = sibIds.concat(moved); // na koniec
    await applyCategoryOrder(state, targetId, finalIds);
    return;
  }

  // before/after => parent = parent targetu
  const parentIdOrNull = target.parent_id || null;

  // walidacja cyklu: nowy rodzic (parent targetu) nie może być przenoszonym folderem
  // ani leżeć w jego poddrzewie -- inaczej folder stałby się swoim własnym przodkiem
  for (const fid of moved) {
    if (fid === parentIdOrNull) {
      void alertModal({ text: t("baseExplorer.errors.moveIntoChild") });
      return;
    }
    if (isFolderDescendant(state, fid, parentIdOrNull)) {
      void alertModal({ text: t("baseExplorer.errors.moveIntoChild") });
      return;
    }
  }

  // pobierz rodzeństwo targetu (w tym target) i usuń z niego moved (żeby nie dublować)
  const siblings = (state.categories || [])
    .filter(c => (c.parent_id || null) === (parentIdOrNull || null))
    .slice()
    .sort(sortByOrd);

  const baseIds = siblings.map(c => c.id).filter(id => !moved.includes(id));

  const idx = baseIds.indexOf(targetId);
  if (idx === -1) {
    // fallback: jeśli coś jest niespójne w cache
    const finalIds = baseIds.concat(moved);
    await applyCategoryOrder(state, parentIdOrNull, finalIds);
    return;
  }

  const insertAt = (mode === "before") ? idx : (idx + 1);
  const finalIds = baseIds.slice(0, insertAt).concat(moved, baseIds.slice(insertAt));

  await applyCategoryOrder(state, parentIdOrNull, finalIds);
}

async function refreshTags(state) {
  state.tags = await listTags(state.baseId);
}

async function untagSelectedInTagView(state) {
  if (!canWrite(state)) return false;

  // W TAG zdejmiemy TAGI z zaznaczonych elementów (foldery/pytania),
  // a NIE usuwamy tych elementów.
  const keys = state?.selection?.keys;
  if (!keys || !keys.size) {
    void alertModal({ text: t("baseExplorer.errors.selectItemsRight") });
    return false;
  }

  // tagi aktywnego widoku TAG (OR)
  const tagIds = Array.isArray(state.tagIds) ? state.tagIds.filter(Boolean) : [];
  if (!tagIds.length) {
    void alertModal({ text: t("baseExplorer.errors.noTagsSelected") });
    return false;
  }

  // Roota nie tagujemy/nie ruszamy
  if (keys.has("root")) {
    void alertModal({ text: t("baseExplorer.errors.rootInOperation") });
    return false;
  }

  const text = keys.size === 1
    ? t("baseExplorer.confirm.removeTagsOne")
    : t("baseExplorer.confirm.removeTagsMany", { n: keys.size });
  const ok = await confirmModal({ text });
  if (!ok) return false;

  // folder w widoku tagu pokazuje się przez tagi pytań w poddrzewie,
  // więc zdjęcie tagu z folderu zdejmuje go z całego poddrzewa
  try {
    await ops.setTagLinks(state.baseId, tagIds, splitKeysToItems(keys), false);
  } catch (e) {
    return opFailed(e);
  }

  await afterMutation(state);
  return true;
}

async function afterTagsModalClose(state, result) {
  const changed = (result === true) || (result && result.saved);
  if (!changed) {
    // nic nie zapisano – tylko odrysuj
    renderAll(state);
    return false;
  }

  // ZAPAMIĘTAJ selekcję, bo refreshList może ją po drodze "zgubić" w UI
  const selKeys = new Set(state?.selection?.keys || []);
  const selAnchor = state?.selection?.anchorKey || null;

  // 1) świeże tagi (nazwy/kolory/ord)
  await state._api?.refreshTags?.();

  // 2) unieważnij cache map tagów, żeby prawa strona na pewno wzięła nowe przypisania
  //    (bez tego czasem zobaczysz stare kropki/tooltipy)
  state._viewQuestionTagMap = null;
  state._allQuestionTagMap = null;
  state._derivedCategoryTagMap = null;
  state._folderDescQIds = null;
  state._allCategoryTagMap = null;

  // 3) odśwież bieżący widok (przeliczy mapy i wyrenderuje prawą stronę)
  await state._api?.refreshList?.();

  // 4) przywróć selekcję i wyrenderuj jeszcze raz (żeby klasy is-selected wróciły)
  if (state.selection) {
    state.selection.keys = selKeys;
    state.selection.anchorKey = selAnchor;
  }
  renderAll(state);

  return true;
}

/* ================= Wire ================= */
export function wireActions({ state }) {
  const treeEl = document.getElementById("tree");
  const listEl = document.getElementById("list");
  // Wspólny obszar zdarzeń dla dwóch niezależnie przewijanych sekcji:
  // pasujących kategorii i tagów.
  const tagsEl = document.getElementById("leftFilters");
  const breadcrumbsEl = document.getElementById("breadcrumbs");
  const toolbarEl = document.getElementById("toolbar");

  /* ================= Sort (TYLKO 3 kolumny: Nazwa/Typ/Data) ================= */

  const SORT_KEYS = new Set(["name", "type", "date"]);
  
  function toggleSort(key) {
    if (!SORT_KEYS.has(key)) return;
  
    const s = state.sort || (state.sort = { key: "name", dir: "asc" });
  
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
    // nagłówek jest przebudowywany w renderList(), więc zawsze bierzemy świeże elementy
    const head = listEl?.querySelector?.(".list-head");
    if (!head) return;
  
    const elName = head.querySelector(".h-main");
    const elType = head.querySelector(".h-type");
    const elDate = head.querySelector(".h-date");
  
    if (elName) elName.classList.toggle("active", state.sort?.key === "name");
    if (elType) elType.classList.toggle("active", state.sort?.key === "type");
    if (elDate) elDate.classList.toggle("active", state.sort?.key === "date");
  
    if (elName) elName.dataset.dir = (state.sort?.key === "name") ? (state.sort?.dir || "") : "";
    if (elType) elType.dataset.dir = (state.sort?.key === "type") ? (state.sort?.dir || "") : "";
    if (elDate) elDate.dataset.dir = (state.sort?.key === "date") ? (state.sort?.dir || "") : "";
  }
  
  listEl?.addEventListener("click", (e) => {
    // 1) jeśli klik był na resizerze (albo w jego obrębie) -> nie sortuj
    // (po drag-resize często i tak wpada click)
    const t = (e.target && e.target.nodeType === 3) ? e.target.parentElement : e.target; // TextNode-safe
    if (t?.closest?.(".col-resizer")) return;
  
    // 2) normalna delegacja
    const el = t?.closest?.(".list-head .h-main, .list-head .h-type, .list-head .h-date");
    if (!el) return;
  
    if (el.classList.contains("h-main")) return toggleSort("name");
    if (el.classList.contains("h-type")) return toggleSort("type");
    if (el.classList.contains("h-date")) return toggleSort("date");
  });
  
  // inicjalizacja (jeśli ktoś miał ord, przestawiamy na name)
  if (!SORT_KEYS.has(state.sort?.key)) state.sort = { key: "name", dir: "asc" };
  updateSortHeaderUI();

    /* ================= Interaction locks (bez MODE) ================= */

  // Throttle ostrzeżeń (żeby nie wyskakiwało 20 alertów przy drag/move)
  let _lockWarnAt = 0;
  function warnLocked(msg) {
    const now = Date.now();
    if (now - _lockWarnAt < 700) return; // 0.7s
    _lockWarnAt = now;
    void alertModal({ text: msg });
  }

  function isSearchFocus() {
    return document.activeElement?.id === "searchText";
  }

  function ensureLeftSelectionsForLock(state) {
    if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
    if (!state.metaSelection) state.metaSelection = { ids: new Set(), anchorId: null };
  }

  function hasLeftSelection(state) {
    ensureLeftSelectionsForLock(state);
    return !!state.tagSelection.ids.size || !!state.metaSelection.ids.size;
  }

  // Tree blokujemy, gdy:
  // - focus w search (SEARCH)
  // - lub aktywne Tagi/Kategorie po lewej (FILTER)
  function isTreeLocked(state) {
    return isSearchFocus() || hasLeftSelection(state);
  }

  // Tags/meta blokujemy tylko, gdy focus w search (SEARCH).
  // (W FILTER muszą działać, bo to właśnie tam wybierasz Tagi/Kategorie.)
  function isLeftPanelLockedBySearch() {
    return isSearchFocus();
  }

  // Search blokujemy, gdy aktywne Tagi/Kategorie (FILTER)
  function isSearchLockedByLeftSelection(state) {
    return hasLeftSelection(state);
  }

  // Komunikaty blokad (klik w zablokowany panel)
  function warnTreeLocked(state) {
    if (isSearchFocus()) {
      warnLocked(t("baseExplorer.errors.treeLockedSearch"));
      return;
    }
    if (hasLeftSelection(state)) {
      warnLocked(t("baseExplorer.errors.treeLockedSelection"));
      return;
    }
  }

  function warnLeftLockedBySearch() {
    warnLocked(t("baseExplorer.errors.tagsLockedSearch"));
  }


  // Blokada fokusa w search, gdy mamy aktywne Tagi/Kategorie (FILTER)
  const searchInput = document.getElementById("searchText");
  if (searchInput) {
    searchInput.addEventListener("mousedown", () => {
      if (!isSearchLockedByLeftSelection(state)) return;
      leftClear(state);
      restoreBrowseLocation(state);
      renderAll(state);
    });
  }

  // (opcjonalne, ale przydatne) klik w cały searchBox też ma ostrzec, gdy zablokowane
  const searchBox = document.getElementById("searchBox");
  if (searchBox) {
    searchBox.addEventListener("mousedown", () => {
      if (!isSearchLockedByLeftSelection(state)) return;
      leftClear(state);
      restoreBrowseLocation(state);
      renderAll(state);
    });
  }

    // drzewo: pamiętanie rozwinięć
  if (!(state.treeOpen instanceof Set)) state.treeOpen = new Set();

  state._drag = { keys: null, overKey: null, mode: "move" }; // mode: 'move'|'copy'

  let clickRenderTimer = null;

  function scheduleRenderList() {
    if (clickRenderTimer) clearTimeout(clickRenderTimer);
    clickRenderTimer = setTimeout(() => {
      clickRenderTimer = null;
      renderToolbar(state); // <-- kluczowe: aktualizuje disabled
      renderList(state);
    }, 180); // krótko: pozwala na dblclick
  }

  function currentTreeKeys() {
    const rows = Array.from(treeEl?.querySelectorAll?.('.row[data-kind="cat"][data-id]') || []);
    return rows.map(r => `c:${r.dataset.id}`).filter(Boolean);
  }
  
  function selectTreeRange(clickedKey) {
    const keys = currentTreeKeys();
    if (!keys.length) return;
  
    const a = state.selection.anchorKey;
    if (!a || !a.startsWith("c:")) {
      selectionSetSingle(state, clickedKey);
      state.selection.anchorKey = clickedKey;
      return;
    }
  
    const i1 = keys.indexOf(a);
    const i2 = keys.indexOf(clickedKey);
    if (i1 === -1 || i2 === -1) {
      selectionSetSingle(state, clickedKey);
      state.selection.anchorKey = clickedKey;
      return;
    }
  
    const [from, to] = i1 < i2 ? [i1, i2] : [i2, i1];
    state.selection.keys.clear();
    for (let i = from; i <= to; i++) state.selection.keys.add(keys[i]);
    state.selection.anchorKey = clickedKey;
  }

  /* ================= Left list (META + TAGS) unified selection ================= */

  function ensureLeftSelections(state) {
    if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
    if (!state.metaSelection) state.metaSelection = { ids: new Set(), anchorId: null };
    if (!("_leftAnchorKey" in state)) state._leftAnchorKey = null;
  }
  
  // Jedna kolejność jak w UI: META (META_ORDER) potem TAGI (ord)
  function leftItemsOrdered(state) {
    const items = [];
  
    const metaOrder = Array.isArray(META_ORDER) ? META_ORDER : [];
    for (const mid of metaOrder) items.push(`m:${mid}`);
  
    const orderedTags = (state.tags || [])
      .slice()
      .sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));
  
    for (const t of orderedTags) items.push(`t:${t.id}`);
  
    return items;
  }
  
  function leftKeyFromRow(row) {
    const kind = row?.dataset?.kind;
    const id = row?.dataset?.id;
    if (!kind || !id) return null;
    if (kind === "meta") return `m:${id}`;
    if (kind === "tag") return `t:${id}`;
    return null;
  }
  
  function leftIsSelected(state, key) {
    ensureLeftSelections(state);
    if (!key) return false;
    if (key.startsWith("m:")) return state.metaSelection.ids.has(key.slice(2));
    if (key.startsWith("t:")) return state.tagSelection.ids.has(key.slice(2));
    return false;
  }
  
  function leftClear(state) {
    ensureLeftSelections(state);
    state.tagSelection.ids.clear();
    state.tagSelection.anchorId = null;
    state.metaSelection.ids.clear();
    state.metaSelection.anchorId = null;
    state._leftAnchorKey = null;
  }
  
  function leftSelectSingle(state, key) {
    ensureLeftSelections(state);
    leftClear(state);
    leftSetSelected(state, key, true);
    leftSetAnchor(state, key);
  }
  
  function leftToggle(state, key) {
    ensureLeftSelections(state);
    const now = leftIsSelected(state, key);
    leftSetSelected(state, key, !now);
    leftSetAnchor(state, key);
  }
  
  function leftSetSelected(state, key, on) {
    ensureLeftSelections(state);
    if (!key) return;
    if (key.startsWith("m:")) {
      const id = key.slice(2);
      if (on) state.metaSelection.ids.add(id);
      else state.metaSelection.ids.delete(id);
      return;
    }
    if (key.startsWith("t:")) {
      const id = key.slice(2);
      if (on) state.tagSelection.ids.add(id);
      else state.tagSelection.ids.delete(id);
      return;
    }
  }
  
  function leftSetAnchor(state, key) {
    state._leftAnchorKey = key || null;
    if (key?.startsWith("m:")) state.metaSelection.anchorId = key.slice(2);
    if (key?.startsWith("t:")) state.tagSelection.anchorId = key.slice(2);
  }
  
  function leftSelectRange(state, clickedKey) {
    ensureLeftSelections(state);
    const ordered = leftItemsOrdered(state);
    if (!ordered.length) { leftSelectSingle(state, clickedKey); return; }
  
    const a = state._leftAnchorKey;
    if (!a || ordered.indexOf(a) === -1) { leftSelectSingle(state, clickedKey); return; }
  
    const i1 = ordered.indexOf(a);
    const i2 = ordered.indexOf(clickedKey);
    if (i1 === -1 || i2 === -1) { leftSelectSingle(state, clickedKey); return; }
  
    const [from, to] = i1 < i2 ? [i1, i2] : [i2, i1];
  
    leftClear(state);
    for (let i = from; i <= to; i++) leftSetSelected(state, ordered[i], true);
    leftSetAnchor(state, clickedKey);
  }
  
  async function applyLeftFiltersView() {
    const hasMeta = !!state?.metaSelection?.ids?.size;
    const tagIds = Array.isArray(state.tagSelection?.ids ? Array.from(state.tagSelection.ids) : []) 
      ? Array.from(state.tagSelection.ids)
      : [];
  
    const hasTags = tagIds.length > 0;
  
    if (!hasMeta && !hasTags) {
      if (state.view === VIEW.TAG || state.view === VIEW.META) restoreBrowseLocation(state);
      state.tagIds = [];
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    if (hasMeta) {
      if (state.view !== VIEW.META) rememberBrowseLocation(state);
      state.view = VIEW.META;
      // tagi w META biorą się z state.tagIds (u Ciebie META filtruje też tagami)
      state.tagIds = tagIds;
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    // tylko tagi
    if (state.view !== VIEW.TAG) rememberBrowseLocation(state);
    state.view = VIEW.TAG;
    state.tagIds = tagIds;
    selectionClear(state);
    await refreshList(state);
  }

  function isCopyDragModifier(ev) {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    // Etap G/TODO: na macOS kopia to Option/Alt (nie Ctrl)
    return isMac ? !!ev.altKey : (!!ev.ctrlKey || !!ev.metaKey);
  }

  function isMultiSelectModifier(ev) {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    // wieloselekcja jak w Explorerze:
    // Mac: Cmd (Meta)
    // Win/Linux: Ctrl
    return isMac ? !!ev.metaKey : !!ev.ctrlKey;
  }

  function canDnD() {
    return canMutateHere(state);
  }
  
  
  function clearDropTarget() {
    // zdejmujemy podgląd dropa z obu paneli (drzewo+lista), bo selektory są te same
    const els = document.querySelectorAll(".is-drop-target, .is-drop-before, .is-drop-after, .is-drop-into");
    for (const el of els) {
      el.classList.remove("is-drop-target", "is-drop-before", "is-drop-after", "is-drop-into");
    }
    if (state._drag) state._drag.overKey = null;
  }
  
  function setDropTarget(targetFolderIdOrNull, scopeEl) {
    clearDropTarget();
  
    // ROOT jako cel drop = null, ale highlight robimy na wierszu root (jeśli istnieje)
    if (!targetFolderIdOrNull) {
      const rootSel = `.row[data-kind="root"][data-id]`;
      const rootEl =
        scopeEl?.querySelector?.(rootSel) ||
        treeEl?.querySelector?.(rootSel) ||
        listEl?.querySelector?.(rootSel) ||
        null;
  
      rootEl?.classList?.add("is-drop-target");
      state._drag.overKey = "root";
      return;
    }
  
    // FOLDER jako cel drop
    const sel = `.row[data-kind="cat"][data-id="${CSS.escape(targetFolderIdOrNull)}"]`;
  
    let el =
      scopeEl?.querySelector?.(sel) ||
      treeEl?.querySelector?.(sel) ||
      listEl?.querySelector?.(sel) ||
      document.querySelector(sel);
  
    el?.classList?.add("is-drop-target");
    state._drag.overKey = `c:${targetFolderIdOrNull}`;
  }

  function pulseEl(el) {
    if (!el) return;
    el.classList.remove("drop-pulse"); // restart animacji
    void el.offsetWidth;               // reflow
    el.classList.add("drop-pulse");
    setTimeout(() => el.classList.remove("drop-pulse"), 460);
  }
  
  function pulseDropTargetIn(containerEl, selector, fallbackEl) {
    // selector ma wskazywać KONKRETNY wiersz, nie kontener
    const el = containerEl?.querySelector?.(selector) || null;
    pulseEl(el || fallbackEl || null);
  }

  toolbarEl?.addEventListener("input", async (e) => {
    const t = e.target;
    if (!t || t.id !== "searchText") return;
  
    // input ma być WYŁĄCZNIE tekstem (bez #tagów). Tagi siedzą w chipsach.
    const text = String(t.value || "");
  
    // trzymamy tagi z chipsów bez zmian
    const tagIds = Array.isArray(state.searchTokens?.tagIds) ? state.searchTokens.tagIds : [];
  
    state.searchTokens = { text, tagIds };
  
    const isEmpty = (!text.trim() && !tagIds.length);
  
    if (isEmpty) {
      if (state.view === VIEW.SEARCH || state.view === VIEW.TAG) restoreBrowseLocation(state);
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    // jeśli jest tekst -> SEARCH
    if (text.trim()) {
      if (state.view !== VIEW.SEARCH) rememberBrowseLocation(state);
      state.view = VIEW.SEARCH;
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    // jeśli brak tekstu, ale są tagi -> TAG
    if (tagIds.length) {
      if (state.view !== VIEW.TAG) rememberBrowseLocation(state);
      state.view = VIEW.TAG;
      state.tagIds = tagIds;
      selectionClear(state);
      await refreshList(state);
      return;
    }
  });

  toolbarEl?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!t) return;
  
    try {

      // E+ klik w chip usuwa taga
      const chip = t.closest?.('.chip[data-tag-id]');
      if (chip) {
        const tagId = chip.dataset.tagId;
        if (!tagId) return;
      
        const prev = Array.isArray(state.searchTokens?.tagIds) ? state.searchTokens.tagIds : [];
        const next = prev.filter(id => id !== tagId);
      
        const text = String(state.searchTokens?.text || "");
      
        state.searchTokens = { text, tagIds: next };
      
        // jeżeli po usunięciu chipów nie ma już nic — wyjdź z SEARCH
        const isEmpty = (!text.trim() && !next.length);
        if (isEmpty && state.view === VIEW.SEARCH) {
          restoreBrowseLocation(state);
        }
      
        selectionClear(state);
        await refreshList(state);
      
        // UX: po kliknięciu chipu wróć fokusem do inputa
        document.getElementById("searchText")?.focus();
      
        return;
      }

      // Przycisk przy polu przełącza lupę na X; X czyści tekst i tagi,
      // a lupa ustawia fokus w polu.
      if (t.closest?.("#searchSubmitBtn")) {
        e.preventDefault?.();
        e.stopPropagation?.();
      
        const hasSearch = !!String(state.searchTokens?.text || "").trim()
          || !!state.searchTokens?.tagIds?.length
          || !!String(searchInput?.value || "").trim();
        if (!hasSearch) {
          searchInput?.focus();
          return;
        }
      
        if (searchInput) searchInput.value = "";
        state.searchTokens = { text: "", tagIds: [] };
        state.searchQuery = "";
      
        if (state.view === VIEW.SEARCH || state.view === VIEW.TAG) restoreBrowseLocation(state);
        selectionClear(state);
        await refreshList(state);
      
        return;
      }
      
      // 2) Dopiero potem klik w searchBox -> focus
      if (t.id === "searchBox" || t.closest?.("#searchBox")) {
        document.getElementById("searchText")?.focus();
        return; // opcjonalnie: żeby nie leciało dalej w handlerze
      }
      
      // NOWE — toolbar działa jak context-menu: data-act
      const btn = e.target?.closest?.('button[data-act]');
      if (btn && toolbarEl?.contains?.(btn)) {
        if (btn.disabled) return;
      
        const act = btn.dataset.act;
      
        // kontekst jak w context-menu dla ROOT:
        const parentId = (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
        const categoryId = parentId;
      
        // pomocnicze: zaznaczenie "real" (bez root)
        const realKeys = Array.from(state.selection?.keys || []).filter(k => k && k !== "root");
        const oneSelected = realKeys.length === 1;
        const oneIsQuestion = oneSelected && String(realKeys[0]).startsWith("q:");
      
        try {
          switch (act) {
            // --- Tworzenie ---
            case "newFolder":
              if (!canMutateHere(state)) return;
              await createFolderHere(state, { parentId });
              return;
      
            case "newQuestion":
              if (!canMutateHere(state)) return;
              await createQuestionHere(state, { categoryId });
              return;
    
            case "editQuestion": {
              if (!canWrite(state)) return;
              if (!oneIsQuestion) return;
            
              const qid = String(realKeys[0]).slice(2); // "q:<id>"
              await state._api?.openQuestionModal?.(qid);
              return;
            }
            
            case "createGame": {
              if (!canWrite(state)) return;
            
              const qIds = await selectionToQuestionIds(state);
              if (!qIds.length) return;

              await state._api?.openExportModal?.();
              return;
            }
      
            case "editTags":
              if (!canWrite(state)) return;
              if (!realKeys.length) return;
              await state._api?.openAssignTagsModal?.();
              return;
      
            case "rename":
              if (!canMutateHere(state)) return;
              if (!oneSelected) return;
              await renameSelectedPrompt(state);
              return;
      
            case "delete":
              if (!canDeleteHere(state)) return;
              if (!realKeys.length) return;
              await deleteSelected(state);
              return;
      
            // --- Schowek ---
            case "copy":
              if (!canWrite(state)) return;
              if (!realKeys.length) return;
              copySelectedToClipboard(state);
              return;
      
            case "cut":
              if (!canCutHere(state)) return;
              if (!realKeys.length) return;
              cutSelectedToClipboard(state);
              return;
      
            case "paste":
              if (!canPasteHere(state)) return;
              await pasteClipboardHere(state);
              return;
      
            case "duplicate":
              // w context-menu "Duplikuj" jest placeholderem, ale u Ciebie funkcja istnieje – zostawiam realne wywołanie
              if (!canMutateHere(state)) return;
              if (!realKeys.length) return;
              await duplicateSelected(state);
              return;

            case "refreshView":
              await refreshList(state);
              return;
          }
        } catch (err) {
          console.error(err);
          void alertModal({ text: t("baseExplorer.errors.actionFailed") });
        }
      }
      
    } catch (err) {
      console.error(err);
      void alertModal({ text: t("baseExplorer.errors.actionFailed") });
    }
  });

  function tryConsumeHashTagTokenFromInput(inputEl) {
    if (!inputEl) return false;
  
    const val = String(inputEl.value || "");
    const pos = Number(inputEl.selectionStart || 0);
  
    // bierzemy tekst do kursora i znajdujemy ostatni token zaczynający się od '#'
    const left = val.slice(0, pos);
    const m = left.match(/(^|[\s,])#([^\s,#]+)$/);
    if (!m) return false;
  
    const nameRaw = String(m[2] || "").trim();
    if (!nameRaw) return false;
  
    // musi to być ISTNIEJĄCY tag (pełna nazwa)
    const byName = new Map((state.tags || []).map(t => [String(t.name || "").toLowerCase(), t.id]));
    const tagId = byName.get(nameRaw.toLowerCase());
    if (!tagId) return false;
  
    // dodaj do chipsów (uniq)
    const prev = Array.isArray(state.searchTokens?.tagIds) ? state.searchTokens.tagIds : [];
    if (!prev.includes(tagId)) prev.push(tagId);
  
    // usuń token "#name" z inputa (tylko ten ostatni)
    const start = left.lastIndexOf("#" + nameRaw);
    const before = val.slice(0, start).replace(/[,\s]*$/, " ");
    const after = val.slice(pos);
  
    const nextVal = (before + after).replace(/\s+/g, " ").trimStart();
    inputEl.value = nextVal;
  
    // kursor w miejscu "po czyszczeniu"
    const newPos = Math.min(before.trimEnd().length + 1, nextVal.length);
    try { inputEl.setSelectionRange(newPos, newPos); } catch {}
  
    state.searchTokens = { text: nextVal, tagIds: prev };
  
    // spójność z lewą selekcją tagów (jak klik)
    if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
    state.tagSelection.ids = new Set(prev);
    state.tagSelection.anchorId = prev.length ? prev[prev.length - 1] : null;
  
    return true;
  }

  toolbarEl?.addEventListener("keydown", async (e) => {
    const t = e.target;
    if (!t || t.id !== "searchText") return;
  
    // Backspace na pustym polu usuwa ostatni chip
    if (e.key === "Backspace") {
      const val = String(t.value || "");
      const caretAtStart = (t.selectionStart === 0 && t.selectionEnd === 0);
  
      const ids = Array.isArray(state.searchTokens?.tagIds) ? state.searchTokens.tagIds : [];
      if (!val && caretAtStart && ids.length) {
        e.preventDefault();
        const next = ids.slice(0, -1);
        state.searchTokens = { text: "", tagIds: next };
  
        // jeśli już nic nie ma: wyjdź z SEARCH
        if (!next.length) {
          if (state.view === VIEW.SEARCH) restoreBrowseLocation(state);
        }
  
        selectionClear(state);
        await refreshList(state);
      }
    }
    // Space / comma / Enter -> jeśli tuż przed kursorem jest #tag i jest pełną nazwą taga,
    // zamień na chip, ale NIE "przepisuj input" w trakcie normalnego pisania.
    if (e.key === " " || e.key === "," || e.key === "Enter") {
      const consumed = tryConsumeHashTagTokenFromInput(t);
      if (consumed) {
        // jeśli user wcisnął Enter tylko po to, żeby domknąć token, nie rób nowej linii
        if (e.key === "Enter") e.preventDefault();
    
        // po dodaniu chipu przelicz widok
        const text = String(state.searchTokens?.text || "");
        const tagIds = Array.isArray(state.searchTokens?.tagIds) ? state.searchTokens.tagIds : [];
    
        if (!text.trim() && tagIds.length) {
          if (state.view !== VIEW.TAG) rememberBrowseLocation(state);
          state.view = VIEW.TAG;
          state.tagIds = tagIds;
        } else {
          if (state.view !== VIEW.SEARCH) rememberBrowseLocation(state);
          state.view = VIEW.SEARCH;
        }
    
        selectionClear(state);
        await refreshList(state);
        return;
      }
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

  tagsEl?.addEventListener("click", async (e) => {
    if (isLeftPanelLockedBySearch()) {
      const inp = document.getElementById("searchText");
      if (inp) inp.value = "";
      state.searchTokens = { text: "", tagIds: [] };
      state.searchQuery = "";
      await refreshList(state);
    }
    if (suppressNextTagsClick) return;
    // 0) klik w "Dodaj tag"
    const btn = e.target?.closest?.("#btnAddTag");
    if (btn) {
      if (!canWrite(state)) return;
      const res = await openTagsModal(state, { mode: "create" });
      await afterTagsModalClose(state, res);
      return;
    }
  
    const row = e.target?.closest?.('.row[data-kind][data-id]');
  
    // 1) klik w tło panelu (czyść CAŁĄ lewą selekcję)
    if (!row) {
      leftClear(state);
  
      if (state.view === VIEW.TAG || state.view === VIEW.META) {
        restoreBrowseLocation(state);
      }
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    // 2) klik w element (meta/tag) – jedna logika
    const key = leftKeyFromRow(row);
    if (!key) return;
  
    const isCtrl = isMultiSelectModifier(e);
    const isShift = e.shiftKey;
  
    if (isShift) leftSelectRange(state, key);
    else if (isCtrl) leftToggle(state, key);
    else leftSelectSingle(state, key);
  
    // 3) odśwież view wynikający z lewego filtra
    await applyLeftFiltersView();
  });

  // PPM na tagach (tag + puste tło)
  tagsEl?.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    if (isTouchContextMenuWindow(tagsEl)) return; // natywne menu po long-pressie/scrollu na dotyku (patrz mobile.js)
    if (isLeftPanelLockedBySearch()) {
      warnLeftLockedBySearch();
      return;
    }
    const row = e.target?.closest?.('.row[data-kind][data-id]');
    if (row) {
      const key = leftKeyFromRow(row);
      if (key && !leftIsSelected(state, key)) {
        leftSelectSingle(state, key);
        // nie odpalamy applyLeftFiltersView() tutaj automatycznie,
        // bo PPM ma tylko ustawić selekcję – view zmieni się, jeśli user kliknie "Pokaż"
        renderAll(state);
      }
  
      const kind = row.dataset.kind; // "tag" | "meta"
      const id = row.dataset.id;
      await showContextMenu({ state, x: e.clientX, y: e.clientY, target: { kind, id } });
      return;
    }
  
    await showContextMenu({ state, x: e.clientX, y: e.clientY, target: { kind: "tags-bg", id: null } });
  });

  function canTagDnD() {
    // Tagowanie działa wszędzie (także w SEARCH), byle user miał prawa i coś przeciągał
    return canWrite(state);
  }
  
  function clearTagDropPreview() {
    const rows = tagsEl?.querySelectorAll?.('.row.is-drop-target') || [];
    rows.forEach(r => r.classList.remove("is-drop-target"));
    if (state._drag) state._drag.tagDrop = null;
  }
  
  // Drag over tag row => pokaż podświetlenie
  tagsEl?.addEventListener("dragover", (e) => {
    if (!canTagDnD()) return;
    e.preventDefault();
  
    // tu NIE ma copy/move – to zawsze "dodaj tag",
    // ale trzymamy to w logice dla spójności z UI (i ewentualnych badge'y)
    const isCopy = isCopyDragModifier(e);
    e.dataTransfer.dropEffect = isCopy ? "copy" : "copy"; // zawsze copy-semantyka
  
    const row = e.target?.closest?.('.row[data-kind="tag"][data-id]');
    if (!row) {
      clearTagDropPreview();
      return;
    }
  
    clearTagDropPreview();
    row.classList.add("is-drop-target");
    state._drag = state._drag || {};
    state._drag.tagDrop = { tagId: row.dataset.id };
  });
  
  tagsEl?.addEventListener("dragleave", (e) => {
    if (!tagsEl.contains(e.relatedTarget)) clearTagDropPreview();
  });
  
  tagsEl?.addEventListener("drop", async (e) => {
    if (!canTagDnD()) return;
    e.preventDefault();
  
    const row = e.target?.closest?.('.row[data-kind="tag"][data-id]');
    const tagId = row?.dataset?.id || state._drag?.tagDrop?.tagId || null;
  
    clearTagDropPreview();
  
    try {
      const keys = state._drag?.keys;
      if (!keys || !keys.size) return;

      await applyTagToDraggedItems(state, tagId, keys);

      // pulsuj KONKRETNY tag-row
      pulseDropTargetIn(
        tagsEl,
        `.row[data-kind="tag"][data-id="${CSS.escape(tagId)}"]`,
        null
      );
      
    } catch (err) {
      console.error(err);
      void alertModal({ text: t("baseExplorer.errors.assignTagFailed") });
    } finally {
      if (state._drag) state._drag.tagDrop = null;
    }
  });

  let treeClickRenderTimer = null;

  function scheduleRenderTree() {
    if (treeClickRenderTimer) clearTimeout(treeClickRenderTimer);
    treeClickRenderTimer = setTimeout(() => {
      treeClickRenderTimer = null;
      renderAll(state);
    }, 180);
  }

  treeEl?.addEventListener("click", async (e) => {
  
    if (isTreeLocked(state)) {
      const inp = document.getElementById("searchText");
      if (inp) inp.value = "";
      state.searchTokens = { text: "", tagIds: [] };
      state.searchQuery = "";
      leftClear(state);
      restoreBrowseLocation(state);
      await refreshList(state);
    }

    // 0) klik w puste tło drzewa = czyść selekcję
    if (e.target === treeEl || e.target?.closest?.(".treeList") === null) {
      selectionClear(state);
      scheduleRenderTree();
      return;
    }
  
    // 1) klik w chevron = tylko zwijanie/rozwijanie
    const tog = e.target?.closest?.(".tree-toggle[data-id]");
    if (tog) {
      e.preventDefault();
      e.stopPropagation();
      const id = tog.dataset.id;
      if (!id) return;
  
      if (!(state.treeOpen instanceof Set)) state.treeOpen = new Set();
      if (state.treeOpen.has(id)) state.treeOpen.delete(id);
      else state.treeOpen.add(id);
      saveTreeOpen(state.baseId, state.treeOpen);
  
      scheduleRenderTree();
      return;
    }
  
    // 2) klik w wiersz
    const row = e.target?.closest?.('.row[data-kind][data-id]');
    if (!row) return;
  
    const kind = row.dataset.kind;
    const id = row.dataset.id || null;
  
    // root: single select (opcjonalnie) + przejście do root dopiero na dblclick
    if (kind === "root") {
      selectionSetSingle(state, "root");
      state.selection.anchorKey = "root";
      scheduleRenderTree();
      return;
    }
  
    if (kind !== "cat" || !id) return;
  
    const key = `c:${id}`;
    const isCtrl = isMultiSelectModifier(e);
    const isShift = e.shiftKey;
  
    if (isShift) {
      selectTreeRange(key);
    } else if (isCtrl) {
      selectionToggle(state, key);
      state.selection.anchorKey = key;
    } else {
      selectionSetSingle(state, key);
      state.selection.anchorKey = key;
    }
  
    scheduleRenderTree();
  });

  treeEl?.addEventListener("dblclick", async (e) => {
    
    if (isTreeLocked(state)) {
      const inp = document.getElementById("searchText");
      if (inp) inp.value = "";
      state.searchTokens = { text: "", tagIds: [] };
      state.searchQuery = "";
      leftClear(state);
      restoreBrowseLocation(state);
      await refreshList(state);
    }

    const row = e.target?.closest?.('.row[data-kind]');
    if (!row) return;
  
    const kind = row.dataset.kind;
    const id = row.dataset.id || null;
  
    if (kind === "root") {
      setViewAll(state);
      selectionSetSingle(state, "root");
      state.selection.anchorKey = "root";
      state._rootQuestions = null;
      await refreshList(state);
      return;
    }
  
    if (kind === "cat" && id) {
      setViewFolder(state, id);
  
      // po wejściu folder ma być zaznaczony w drzewie
      const key = `c:${id}`;
      selectionSetSingle(state, key);
      state.selection.anchorKey = key;
  
      await refreshList(state);
    }
  });

  addDoubleTap(treeEl, async (target) => {
    if (isTreeLocked(state)) return;
    const row = target?.closest?.('.row[data-kind]');
    if (!row) return;
    const kind = row.dataset.kind;
    const id = row.dataset.id || null;
    if (kind === "root") {
      setViewAll(state); selectionSetSingle(state, "root");
      state.selection.anchorKey = "root"; state._rootQuestions = null;
      await refreshList(state);
    } else if (kind === "cat" && id) {
      setViewFolder(state, id);
      const key = `c:${id}`; selectionSetSingle(state, key);
      state.selection.anchorKey = key;
      await refreshList(state);
    }
  });

  // PPM na drzewie (foldery + puste tło)
  treeEl?.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    if (isTouchContextMenuWindow(treeEl)) return; // natywne menu po long-pressie/scrollu na dotyku (patrz mobile.js)

    if (isTreeLocked(state)) {
      warnTreeLocked(state);
      return;
    }

    const row = e.target?.closest?.('.row[data-kind][data-id]');
    if (row) {
      const kind = row.dataset.kind; // 'cat' | 'root'
      const id = row.dataset.id || null;

      if (kind === "cat") {
        await showContextMenu({ state, x: e.clientX, y: e.clientY, target: { kind: "cat", id } });
        return;
      }
      if (kind === "root") {
        await showContextMenu({ state, x: e.clientX, y: e.clientY, target: { kind: "root", id: null } });
        return;
      }
    }

    // puste tło drzewa = root (akcje w bieżącym miejscu, bo showContextMenu używa state.view)
    await showContextMenu({ state, x: e.clientX, y: e.clientY, target: { kind: "root", id: null, scope: "tree" } });
  });
    
    // --- Drag start z drzewa (folder jako źródło) ---
  treeEl?.addEventListener("dragstart", (e) => {
    
    if (isTreeLocked(state)) {
      warnTreeLocked(state);
      return;
    }

    if (!canWrite(state)) return;

    const row = e.target?.closest?.('.row[data-kind="cat"][data-id]');
    if (!row) return;

    const id = row.dataset.id;
    const key = `c:${id}`;

    // jeśli start drag na niezaznaczonym -> single select
    if (!state.selection?.keys?.has?.(key)) {
      selectionSetSingle(state, key);
      renderAll(state);
    }

    state._drag.keys = new Set(state.selection.keys);

    try { e.dataTransfer.setData("text/plain", "move"); } catch {}
    e.dataTransfer.effectAllowed = "copyMove";
  });

  // --- DnD na drzewie: dragover / drop (cel: folder w drzewie albo root) ---
  treeEl?.addEventListener("dragover", (e) => {
    
    if (isTreeLocked(state)) {
      // przy dragover nie spamuj alertem (i tak leci non-stop)
      return;
    }

    if (!canDnD()) return;
    e.preventDefault();
  
    const isCopy = isCopyDragModifier(e);
    state._drag.mode = isCopy ? "copy" : "move";
    e.dataTransfer.dropEffect = state._drag.mode;
  
    const row = e.target?.closest?.('.row[data-id]');
    if (!row) {
      return;
    }
  
    const targetId = row.dataset.id;
    const r = row.getBoundingClientRect();
    const y = e.clientY - r.top;
  
    // strefy: góra 25%, dół 25%, środek 50%
    let dropMode = "into";
    if (y < r.height * 0.25) dropMode = "before";
    else if (y > r.height * 0.75) dropMode = "after";
  
    state._drag.treeDrop = { mode: dropMode, targetId };
  
    // podgląd drop targetu
    clearDropTarget();
    row.classList.add(
      dropMode === "before" ? "is-drop-before" :
      dropMode === "after" ? "is-drop-after" :
      "is-drop-into"
    );
  });
  
  treeEl?.addEventListener("dragleave", (e) => {
    if (!treeEl.contains(e.relatedTarget)) {
      clearDropTarget();
      state._drag.treeDrop = null;
    }
  });
  
  treeEl?.addEventListener("drop", async (e) => {

    if (isTreeLocked(state)) {
      warnTreeLocked(state);
      return;
    }

    if (!canDnD()) return;
    e.preventDefault();
  
    const payload = state._drag.treeDrop;
    const modeKey = payload.mode;
    const targetId = payload.targetId;
  
    // przygotuj listę folderów z zaznaczenia (DnD w drzewie dotyczy folderów)
    const keys = state._drag?.keys;
    const cIds = keys ? Array.from(keys).filter(k => k.startsWith("c:")).map(k => k.slice(2)) : [];
  
    clearDropTarget();
    state._drag.treeDrop = null;
  
    try {
      // COPY: kopia zaznaczenia do folderu docelowego
      if (isCopyDragModifier(e)) {
        await copyItemsTo(state, keys, targetId);
        pulseDropTargetIn(
          treeEl,
          `.row[data-kind="root"][data-id]`,
          null
        );
        return;
      }
  
      // MOVE:
      // - jeśli drop na tło => normalny move do root
      if (modeKey === "root" || !targetId) {
        await moveItemsTo(state, keys, null);
        pulseDropTargetIn(
          treeEl,
          `.row[data-kind="root"][data-id]`,
          null
        );
        return;
      }
  
      // - jeśli drop "into" => move do środka folderu (parent = targetId)
      if (modeKey === "into") {
        await moveItemsTo(state, keys, targetId);
        pulseDropTargetIn(
          treeEl,
          `.row[data-kind="cat"][data-id="${CSS.escape(targetId)}"]`,
          null
        );
        return;
      }
  
      // - jeśli drop before/after => reorder w rodzeństwie targetu (z ewentualnym przeniesieniem parenta)
      if (cIds.length) {
        await reorderFoldersByDrop(state, cIds, targetId, modeKey);
        pulseDropTargetIn(
          treeEl,
          `.row[data-kind="cat"][data-id="${CSS.escape(targetId)}"]`,
          null
        );
        return;
      }
  
      // jeśli user przeciąga same pytania na drzewo "między" — traktujemy jak "do folderu"
      await moveItemsTo(state, keys, targetId);

      pulseEl(treeEl);
    } catch (err) {
      console.error(err);
      void alertModal({ text: t("baseExplorer.errors.moveFailed") });
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

    const isCtrl = isMultiSelectModifier(e);
    const isShift = e.shiftKey;

    if (isShift) {
      selectRange(state, listEl, key);
    } else if (isCtrl) {
      selectionToggle(state, key);
      state.selection.anchorKey = key; // ważne: Ctrl ustawia anchor jak w Windows
    } else {
      selectionSetSingle(state, key);
      state.selection.anchorKey = key;
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
      // Jeśli user jest w "SEARCH-focus" lub ma aktywne Tagi/Meta po lewej:
      // wychodzimy z tego stanu i dopiero otwieramy folder
      const needExit = isSearchFocus() || hasLeftSelection(state) ||
        state.view === VIEW.SEARCH || state.view === VIEW.TAG || state.view === VIEW.META;

      if (needExit) {
        // wyczyść search (input + tokens)
        const inp = document.getElementById("searchText");
        if (inp) inp.value = "";
        state.searchTokens = { text: "", tagIds: [] };
        state.searchQuery = "";

        // wyczyść selekcję lewą (tag/meta)
        leftClear(state);

        // wróć do browse (ostatni folder), ale zaraz i tak wejdziemy do id
        restoreBrowseLocation(state);
      }

      setViewFolder(state, id);
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    if (kind === "q") {
      if (!canWrite(state)) return;

      // jeśli user dwukliknął pytanie, otwieramy edycję zawsze
      await state._api?.openQuestionModal?.(id);
      return;
    }
  });

  addDoubleTap(listEl, async (target) => {
    const row = target?.closest?.(".row[data-kind][data-id]");
    if (!row) return;
    const kind = row.dataset.kind;
    const id = row.dataset.id;
    if (kind === "cat") {
      const needExit = isSearchFocus() || hasLeftSelection(state) ||
        state.view === VIEW.SEARCH || state.view === VIEW.TAG || state.view === VIEW.META;
      if (needExit) {
        const inp = document.getElementById("searchText");
        if (inp) inp.value = "";
        state.searchTokens = { text: "", tagIds: [] };
        state.searchQuery = "";
        leftClear(state);
        restoreBrowseLocation(state);
      }
      setViewFolder(state, id);
      selectionClear(state);
      await refreshList(state);
    } else if (kind === "q" && canWrite(state)) {
      await state._api?.openQuestionModal?.(id);
    }
  });

  listEl?.addEventListener("dragstart", (e) => {
    if (!canWrite(state)) return; // pozwól przeciągać także w SEARCH/TAG/META (do tagowania)
  
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
    if (e.target.closest(".list-head")) return; // NIE ustawiaj drop-target na header
    e.preventDefault();
  
    const isCopy = isCopyDragModifier(e);
    state._drag.mode = isCopy ? "copy" : "move";
    e.dataTransfer.dropEffect = state._drag.mode;
  
    const row = e.target?.closest?.('.row[data-kind="cat"][data-id]');
    if (row) setDropTarget(row.dataset.id, listEl);
    else setDropTarget(null, listEl);
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
      const keys = state._drag?.keys;
      if (isCopyDragModifier(e)) await copyItemsTo(state, keys, targetFolderId);
      else await moveItemsTo(state, keys, targetFolderId);

      // pulsuj target: folder-row albo root (tło)
      if (targetFolderId) {
        pulseDropTargetIn(
          listEl,
          `.row[data-kind="cat"][data-id="${CSS.escape(targetFolderId)}"]`,
          null
        );
      } else {
        // brak folderu => drop na root
        pulseDropTargetIn(
          document, // root jest w tree, nie w liście
          `.row[data-kind="root"][data-id]`,
          null
        );
      }
    } catch (err) {
      console.error(err);
      void alertModal({ text: t("baseExplorer.errors.moveFailed") });
    } finally {
      state._drag.keys = null;
    }
  });
  
  listEl?.addEventListener("dragend", () => {
    clearDropTarget();
    state._drag.keys = null;
  });

    // --- Zaznaczanie "od pustego" (marquee) ---
  let marquee = null;
  let marqueeStart = null;
  let marqueeAdd = false;       // ctrl/meta => dodawanie do selekcji
  let marqueeBaseKeys = null;   // snapshot selekcji startowej (dla add)
  let marqueeToggle = false;    // touch: XOR z bazą

  function listLocalPoint(ev) {
    const r = listEl.getBoundingClientRect();
    // uwzględnij scroll listy
    const x = ev.clientX - r.left + listEl.scrollLeft;
    const y = ev.clientY - r.top + listEl.scrollTop;
    return { x, y };
  }

  function rectNorm(a, b) {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const right = Math.max(a.x, b.x);
    const bottom = Math.max(a.y, b.y);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function rowRectInList(row) {
    const rr = row.getBoundingClientRect();
    const lr = listEl.getBoundingClientRect();
    const left = rr.left - lr.left + listEl.scrollLeft;
    const top = rr.top - lr.top + listEl.scrollTop;
    return { left, top, right: left + rr.width, bottom: top + rr.height };
  }

  function intersects(a, b) {
    return !(b.left > a.right || b.right < a.left || b.top > a.bottom || b.bottom < a.top);
  }

  function updateMarqueeSelection(box) {
    const rows = Array.from(listEl.querySelectorAll('.row[data-kind][data-id]'));
    const hit = new Set();
  
    for (const row of rows) {
      const kind = row.dataset.kind;
      const id = row.dataset.id;
      const key = (kind === "q") ? `q:${id}` : (kind === "cat") ? `c:${id}` : null;
      if (!key) continue;
  
      const r = rowRectInList(row);
      if (intersects(box, r)) hit.add(key);
    }
  
    const out = (marqueeAdd || marqueeToggle) && marqueeBaseKeys ? new Set(marqueeBaseKeys) : new Set();
    if (marqueeToggle) {
      for (const k of hit) { if (out.has(k)) out.delete(k); else out.add(k); }
    } else {
      for (const k of hit) out.add(k);
    }
  
    state.selection.keys = out;
    state.selection.anchorKey = null;
  
    // aktualizuj TYLKO klasy (bez przebudowy DOM)
    for (const row of rows) {
      const kind = row.dataset.kind;
      const id = row.dataset.id;
      const key = (kind === "q") ? `q:${id}` : (kind === "cat") ? `c:${id}` : null;
      if (!key) continue;
      row.classList.toggle("is-selected", out.has(key));
    }
  }

  listEl.addEventListener("mousedown", (e) => {
    // tylko lewy przycisk
    if (e.button !== 0) return;
    
    // NIE startuj marquee na nagłówku listy (to ma być klik do sortowania)
    const head = e.target?.closest?.(".list-head");
    if (head) return;
  
    // NIE startuj marquee na uchwycie do resize kolumn
    const rz = e.target?.closest?.(".col-resizer");
    if (rz) return;

    // nie startuj marquee, jeśli kliknięto w wiersz (to obsługuje normalna selekcja)
    const row = e.target?.closest?.('.row[data-kind][data-id]');
    if (row) return;
    
    // marquee startuje tylko jeśli klik jest "w listę", ale nie w kontrolki UI
    // (np. gdybyś kiedyś dodał jakieś przyciski w tle listy)
    const interactive = e.target?.closest?.('button,a,input,textarea,select,label');
    if (interactive) return;

    // nie startuj, jeśli user kliknął w input/textarea
    const tag = String(e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    // start marquee
    marqueeStart = listLocalPoint(e);
    
    marqueeAdd = isMultiSelectModifier(e);
    marqueeBaseKeys = marqueeAdd ? new Set(state.selection.keys) : null;
    
    if (!marqueeAdd) {
      selectionClear(state);
      renderList(state);
    }

    marquee = document.createElement("div");
    marquee.className = "marquee";
    marquee.style.left = `${marqueeStart.x}px`;
    marquee.style.top = `${marqueeStart.y}px`;
    marquee.style.width = "0px";
    marquee.style.height = "0px";
    listEl.appendChild(marquee);

    e.preventDefault(); // ważne: nie zaznaczaj tekstu
  });

  document.addEventListener("mousemove", (e) => {
    if (!marquee || !marqueeStart) return;

    const cur = listLocalPoint(e);
    const box = rectNorm(marqueeStart, cur);

    marquee.style.left = `${box.left}px`;
    marquee.style.top = `${box.top}px`;
    marquee.style.width = `${box.width}px`;
    marquee.style.height = `${box.height}px`;

    updateMarqueeSelection(box);
  });

  document.addEventListener("mouseup", () => {
    if (!marquee) return;
    marquee.remove();
    marquee = null;
    marqueeStart = null;
    marqueeAdd = false;
    marqueeBaseKeys = null;

    renderList(state); // wyrównaj po zakończeniu
  });

  // ── Touch marquee: LIST (2 palce = marquee addytywny) ─────────────────
  {
    let touchMarquee = null;
    let touchStart = null;
    let touchBase = null;

    if (listEl && getComputedStyle(listEl).position === "static")
      listEl.style.position = "relative";

    listEl?.addEventListener("touchstart", e => {
      if (e.touches.length !== 2) return;
      touchBase = new Set(state.selection.keys);
      touchStart = listLocalPoint(e.touches[0]);
      touchMarquee = document.createElement("div");
      touchMarquee.className = "marquee";
      touchMarquee.style.cssText = `left:${touchStart.x}px;top:${touchStart.y}px;width:0;height:0`;
      listEl.appendChild(touchMarquee);
    }, { passive: true });

    listEl?.addEventListener("touchmove", e => {
      if (!touchMarquee || e.touches.length < 2) return;
      e.preventDefault();
      const cur = listLocalPoint(e.touches[1]);
      const box = rectNorm(touchStart, cur);
      touchMarquee.style.left = `${box.left}px`;
      touchMarquee.style.top = `${box.top}px`;
      touchMarquee.style.width = `${box.width}px`;
      touchMarquee.style.height = `${box.height}px`;
      marqueeToggle = true; marqueeBaseKeys = touchBase;
      updateMarqueeSelection(box);
    }, { passive: false });

    listEl?.addEventListener("touchend", () => {
      if (!touchMarquee) return;
      touchMarquee.remove();
      touchMarquee = null; touchStart = null; touchBase = null;
      marqueeToggle = false; marqueeBaseKeys = null;
      renderList(state);
    });
  }

    /* ================= Marquee: TREE ================= */
  let treeMarquee = null;
  let treeMarqueeStart = null;
  let treeMarqueeAdd = false;
  let treeMarqueeBase = null;
  let treeMarqueeToggle = false;

  function treeLocalPoint(ev) {
    const r = treeEl.getBoundingClientRect();
    const x = ev.clientX - r.left + treeEl.scrollLeft;
    const y = ev.clientY - r.top + treeEl.scrollTop;
    return { x, y };
  }

  function rowRectInTree(row) {
    const rr = row.getBoundingClientRect();
    const tr = treeEl.getBoundingClientRect();
    const left = rr.left - tr.left + treeEl.scrollLeft;
    const top = rr.top - tr.top + treeEl.scrollTop;
    return { left, top, right: left + rr.width, bottom: top + rr.height };
  }

  function updateTreeMarqueeSelection(box) {
    // zaznaczamy tylko foldery (cat). Root pomijamy w marquee.
    const rows = Array.from(treeEl.querySelectorAll('.row[data-kind="cat"][data-id]'));
    const hit = new Set();

    for (const row of rows) {
      const id = row.dataset.id;
      if (!id) continue;
      const key = `c:${id}`;
      const r = rowRectInTree(row);
      if (intersects(box, r)) hit.add(key);
    }

    const out = (treeMarqueeAdd || treeMarqueeToggle) && treeMarqueeBase ? new Set(treeMarqueeBase) : new Set();
    if (treeMarqueeToggle) {
      for (const k of hit) { if (out.has(k)) out.delete(k); else out.add(k); }
    } else {
      for (const k of hit) out.add(k);
    }

    state.selection.keys = out;
    state.selection.anchorKey = null;

    // podświetlenie bez przebudowy DOM
    for (const row of rows) {
      const id = row.dataset.id;
      const key = id ? `c:${id}` : null;
      if (!key) continue;
      row.classList.toggle("is-selected", out.has(key));
    }
  }

  // TREE musi być pozycjonowany dla marquee
  if (treeEl && getComputedStyle(treeEl).position === "static") {
    treeEl.style.position = "relative";
  }

  treeEl?.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // tylko lewy

    if (isTreeLocked(state)) {
      warnTreeLocked(state);
      return;
    }

    // start tylko na "pustym tle": nie w row, nie w toggle, nie w kontrolki
    const onRow = e.target?.closest?.('.row[data-kind][data-id]');
    if (onRow) return;

    const onToggle = e.target?.closest?.('.tree-toggle');
    if (onToggle) return;

    const interactive = e.target?.closest?.('button,a,input,textarea,select,label');
    if (interactive) return;

    treeMarqueeStart = treeLocalPoint(e);

    treeMarqueeAdd = isMultiSelectModifier(e);
    treeMarqueeBase = treeMarqueeAdd ? new Set(state.selection.keys) : null;

    if (!treeMarqueeAdd) {
      selectionClear(state);
      // nie renderAll — tylko zdejmujemy klasy z tree (szybko)
      const rows = Array.from(treeEl.querySelectorAll('.row.is-selected'));
      for (const r of rows) r.classList.remove("is-selected");
    }

    treeMarquee = document.createElement("div");
    treeMarquee.className = "marquee";
    treeMarquee.style.left = `${treeMarqueeStart.x}px`;
    treeMarquee.style.top = `${treeMarqueeStart.y}px`;
    treeMarquee.style.width = "0px";
    treeMarquee.style.height = "0px";
    treeEl.appendChild(treeMarquee);

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!treeMarquee || !treeMarqueeStart) return;
    const cur = treeLocalPoint(e);
    const box = rectNorm(treeMarqueeStart, cur);

    treeMarquee.style.left = `${box.left}px`;
    treeMarquee.style.top = `${box.top}px`;
    treeMarquee.style.width = `${box.width}px`;
    treeMarquee.style.height = `${box.height}px`;

    updateTreeMarqueeSelection(box);
  });
  
  document.addEventListener("mouseup", () => {
    if (!treeMarquee) return;
    treeMarquee.remove();
    treeMarquee = null;
    treeMarqueeStart = null;
    treeMarqueeAdd = false;
    treeMarqueeBase = null;

    // wyrównaj UI po marquee w drzewie
    renderAll(state);
  });

  // ── Touch marquee: TREE ───────────────────────────────────────────────
  {
    let touchMarquee = null;
    let touchStart = null;
    let touchBase = null;

    treeEl?.addEventListener("touchstart", e => {
      if (e.touches.length !== 2) return;
      if (isTreeLocked(state)) return;
      touchBase = new Set(state.selection.keys);
      touchStart = treeLocalPoint(e.touches[0]);
      touchMarquee = document.createElement("div");
      touchMarquee.className = "marquee";
      touchMarquee.style.cssText = `left:${touchStart.x}px;top:${touchStart.y}px;width:0;height:0`;
      treeEl.appendChild(touchMarquee);
    }, { passive: true });

    treeEl?.addEventListener("touchmove", e => {
      if (!touchMarquee || e.touches.length < 2) return;
      e.preventDefault();
      const cur = treeLocalPoint(e.touches[1]);
      const box = rectNorm(touchStart, cur);
      touchMarquee.style.left = `${box.left}px`;
      touchMarquee.style.top = `${box.top}px`;
      touchMarquee.style.width = `${box.width}px`;
      touchMarquee.style.height = `${box.height}px`;
      treeMarqueeToggle = true; treeMarqueeBase = touchBase;
      updateTreeMarqueeSelection(box);
    }, { passive: false });

    treeEl?.addEventListener("touchend", () => {
      if (!touchMarquee) return;
      touchMarquee.remove();
      touchMarquee = null; touchStart = null; touchBase = null;
      treeMarqueeToggle = false; treeMarqueeBase = null;
      renderAll(state);
    });
  }

    /* ================= Marquee: TAGS ================= */
  let tagsMarquee = null;
  let suppressNextTagsClick = false;
  let tagsMarqueeStart = null;
  let tagsMarqueeAdd = false;
  let tagsMarqueeBase = null;
  let tagsMarqueeToggle = false;

  function tagsLocalPoint(ev) {
    const r = tagsEl.getBoundingClientRect();
    const x = ev.clientX - r.left + tagsEl.scrollLeft;
    const y = ev.clientY - r.top + tagsEl.scrollTop;
    return { x, y };
  }

  function rowRectInTags(row) {
    const rr = row.getBoundingClientRect();
    const tr = tagsEl.getBoundingClientRect();
    const left = rr.left - tr.left + tagsEl.scrollLeft;
    const top = rr.top - tr.top + tagsEl.scrollTop;
    return { left, top, right: left + rr.width, bottom: top + rr.height };
  }

  function updateTagsMarqueeSelection(box) {
    ensureLeftSelections(state);
  
    const rows = Array.from(tagsEl.querySelectorAll('.row[data-kind][data-id]')); // meta + tag
    const hitKeys = new Set();
  
    for (const row of rows) {
      const r = rowRectInTags(row);
      if (!intersects(box, r)) continue;
  
      const key = leftKeyFromRow(row);
      if (key) hitKeys.add(key);
    }
  
    const base = (tagsMarqueeAdd || tagsMarqueeToggle) && tagsMarqueeBase
      ? new Set(tagsMarqueeBase)
      : new Set();

    if (tagsMarqueeToggle) {
      for (const k of hitKeys) { if (base.has(k)) base.delete(k); else base.add(k); }
    } else {
      for (const k of hitKeys) base.add(k);
    }
  
    // Przepisz do state (meta/tag)
    state.tagSelection.ids.clear();
    state.metaSelection.ids.clear();
  
    for (const k of base) {
      if (k.startsWith("t:")) state.tagSelection.ids.add(k.slice(2));
      if (k.startsWith("m:")) state.metaSelection.ids.add(k.slice(2));
    }
  
    state.tagSelection.anchorId = null;
    state.metaSelection.anchorId = null;
    state._leftAnchorKey = null;
  
    // klasy bez przebudowy DOM
    for (const row of rows) {
      const key = leftKeyFromRow(row);
      row.classList.toggle("is-selected", !!key && base.has(key));
    }
  }

  // TAGS musi być pozycjonowany dla marquee
  if (tagsEl && getComputedStyle(tagsEl).position === "static") {
    tagsEl.style.position = "relative";
  }

  tagsEl?.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
        
    if (isLeftPanelLockedBySearch()) {
      warnLeftLockedBySearch();
      return;
    }

    // klik w "Dodaj tag" nie startuje marquee
    if (e.target?.closest?.("#btnAddTag")) return;

    const onRow = e.target?.closest?.('.row[data-kind][data-id]');
    if (onRow) return;

    const interactive = e.target?.closest?.('button,a,input,textarea,select,label');
    if (interactive) return;

    tagsMarqueeStart = tagsLocalPoint(e);

    tagsMarqueeAdd = isMultiSelectModifier(e);
    if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
    tagsMarqueeBase = tagsMarqueeAdd
      ? new Set([
          ...Array.from(state.metaSelection?.ids || []).map(id => `m:${id}`),
          ...Array.from(state.tagSelection?.ids || []).map(id => `t:${id}`),
        ])
      : null;

    if (!tagsMarqueeAdd) {
      state.tagSelection.ids.clear();
      state.tagSelection.anchorId = null;
    
      if (!state.metaSelection) state.metaSelection = { ids: new Set(), anchorId: null };
      state.metaSelection.ids.clear();
      state.metaSelection.anchorId = null;
    
      const rows = Array.from(tagsEl.querySelectorAll('.row.is-selected'));
      for (const r of rows) r.classList.remove("is-selected");
    }

    tagsMarquee = document.createElement("div");
    tagsMarquee.className = "marquee";
    tagsMarquee.style.left = `${tagsMarqueeStart.x}px`;
    tagsMarquee.style.top = `${tagsMarqueeStart.y}px`;
    tagsMarquee.style.width = "0px";
    tagsMarquee.style.height = "0px";
    tagsEl.appendChild(tagsMarquee);

    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!tagsMarquee || !tagsMarqueeStart) return;

    const cur = tagsLocalPoint(e);
    const box = rectNorm(tagsMarqueeStart, cur);

    tagsMarquee.style.left = `${box.left}px`;
    tagsMarquee.style.top = `${box.top}px`;
    tagsMarquee.style.width = `${box.width}px`;
    tagsMarquee.style.height = `${box.height}px`;

    updateTagsMarqueeSelection(box);
  });

  document.addEventListener("mouseup", async () => {
    if (!tagsMarquee) return;
    tagsMarquee.remove();
    tagsMarquee = null;
    tagsMarqueeStart = null;
    tagsMarqueeAdd = false;
    tagsMarqueeBase = null;

    suppressNextTagsClick = true;
    setTimeout(() => { suppressNextTagsClick = false; }, 0);

    await applyLeftFiltersView(); // <<< to robi właściwe "odświeżenie widoku"
  });

  // ── Touch marquee: TAGS ───────────────────────────────────────────────
  {
    let touchMarquee = null;
    let touchStart = null;
    let touchBase = null;

    tagsEl?.addEventListener("touchstart", e => {
      if (e.touches.length !== 2) return;
      if (isLeftPanelLockedBySearch()) return;
      ensureLeftSelections(state);
      touchBase = new Set([
        ...Array.from(state.metaSelection?.ids || []).map(id => `m:${id}`),
        ...Array.from(state.tagSelection?.ids || []).map(id => `t:${id}`),
      ]);
      touchStart = tagsLocalPoint(e.touches[0]);
      touchMarquee = document.createElement("div");
      touchMarquee.className = "marquee";
      touchMarquee.style.cssText = `left:${touchStart.x}px;top:${touchStart.y}px;width:0;height:0`;
      tagsEl.appendChild(touchMarquee);
    }, { passive: true });

    tagsEl?.addEventListener("touchmove", e => {
      if (!touchMarquee || e.touches.length < 2) return;
      e.preventDefault();
      const cur = tagsLocalPoint(e.touches[1]);
      const box = rectNorm(touchStart, cur);
      touchMarquee.style.left = `${box.left}px`;
      touchMarquee.style.top = `${box.top}px`;
      touchMarquee.style.width = `${box.width}px`;
      touchMarquee.style.height = `${box.height}px`;
      tagsMarqueeToggle = true; tagsMarqueeBase = touchBase;
      updateTagsMarqueeSelection(box);
    }, { passive: false });

    tagsEl?.addEventListener("touchend", async () => {
      if (!touchMarquee) return;
      touchMarquee.remove();
      touchMarquee = null; touchStart = null; touchBase = null;
      tagsMarqueeToggle = false; tagsMarqueeBase = null;
      suppressNextTagsClick = true;
      setTimeout(() => { suppressNextTagsClick = false; }, 0);
      await applyLeftFiltersView();
    });
  }

  const api = {
    refreshList: () => refreshList(state),
    refreshCategories: async () => {
      state.categories = await listCategories(state.baseId);
    },

    openAssignTagsModal: async () => {
      // 1) co jest zaznaczone
      const { qIds, cIds } = selectionSplitIds(state);
    
      // 2) jeśli zaznaczone są foldery, modal musi umieć je rozwinąć do pytań
      //    (u Ciebie tags-modal ma na to "folderDescQIds")
      await ensureDerivedFolderMaps(state);
    
      const res = await openTagsModal(state, {
        mode: "assign",
        selection: { qIds, cIds },
        folderDescQIds: state._folderDescQIds,
      });
    
      await afterTagsModalClose(state, res);
      return res;
    },
    
    openTagModal: async (opts) => {
      const mode = (opts && opts.mode) || "create";
      const tagId = (opts && opts.tagId) || null;
      const res = await openTagsModal(state, { mode, tagId });
      await afterTagsModalClose(state, res);
      return res;
    },
    
    refreshTags: async () => refreshTags(state),

    openTagView: async (tagIds) => {
      const ids = Array.isArray(tagIds) ? tagIds.filter(Boolean) : [];
      if (!ids.length) return;
    
      rememberBrowseLocation(state);
      state.tagIds = ids;
      state.view = VIEW.TAG;
    
      selectionClear(state);
      await refreshList(state);
    },
    untagSelectedInTagView: () => untagSelectedInTagView(state),

    selectionToQuestionIds: () => selectionToQuestionIds(state),
  };

  // udostępniamy do context-menu (żeby mogło odświeżyć widok po delete)
  state._api = state._api || {};
  Object.assign(state._api, api);
  
  // ================== Modals: init + API bridge ==================
  
  // ---------- Question modal ----------
  if (!questionModal) {
    questionModal = initQuestionModal({ state });
  }
  
  state._api.openQuestionModal = async (qid) => {
    if (!qid) return false;
    let lease = null;
    try {
      lease = await acquireResourceLock({
        resourceType: "base_question",
        resourceId: qid,
        context: "base-explorer:question-modal",
      });
      if (!lease?.ok) {
        void alertModal({
          text: lease?.error === "gone"
            ? t("resourceLock.goneMessage")
            : t("resourceLock.baseItemMessage"),
        });
        return false;
      }

      const row = await getQuestion(qid);

      const input = {
        id: row.id,
        payload: (row.payload && typeof row.payload === "object") ? row.payload : { text: "", answers: [] },
      };

      // Zapis odbywa się z otwartym modalem (save): przy błędzie komunikat
      // pokazuje się w modalu, a wpisana treść zostaje.
      const save = async (payload) => {
        if (!lease.ok) {
          const e = new Error("lease lost");
          e.userMessage = lease.reason === "gone"
            ? t("resourceLock.goneMessage")
            : t("resourceLock.forbiddenMessage");
          throw e;
        }
        await ops.saveQuestion(state.baseId, qid, payload);
      };

      const res = await questionModal.open(input, { save });
      if (!res?.ok) return false;

      await refreshList(state);
      return true;
    } catch (e) {
      console.error(e);
      void alertModal({ text: t("baseExplorer.errors.questionOpenSaveFailed") });
      return false;
    } finally {
      lease?.release?.();
    }
  };

  // ---------- Kosz ----------
  // Przywrócenie dokłada foldery i pytania (z tagami) — pełne odświeżenie.
  const trashModal = initTrashModal({
    state,
    onChange: async (kind) => {
      if (kind === "restore") await afterMutation(state, { categories: true });
    },
  });
  state._api.refreshTrash = () => trashModal?.refresh();
  void trashModal?.refresh();

  // ---------- Export modal ----------
  if (!exportModal) {
    exportModal = initExportModal({ state });
  }
  
  state._api.openExportModal = async (opts = {}) => {
    if (Array.isArray(opts)) opts = { questionIds: opts };
    try {
      const ownerId = state.user?.id || state.userId; // FIX: spójnie z resztą kodu
      if (!ownerId) {
        void alertModal({ text: t("baseExplorer.errors.missingUserId") });
        return false;
      }
  
      if (!exportModal?.open) {
        console.warn("exportModal.open missing");
        void alertModal({ text: t("baseExplorer.errors.exportModalMissing") });
        return false;
      }

      // Tworzenie gry "z folderu" -> podpowiedz jego nazwę jako nazwę gry:
      // albo zaznaczony jest dokładnie jeden folder (PPM/Ctrl+G na folderze),
      // albo nic nie jest zaznaczone, a po prostu przeglądamy jego zawartość
      // (Ctrl+G z toolbara wewnątrz folderu). W pozostałych przypadkach
      // (pojedyncze pytania, mieszane zaznaczenie, widoki wirtualne) zostaw
      // domyślną nazwę modala bez zmian.
      if (!opts.defaultName) {
        const realKeys = Array.from(state.selection?.keys || [])
          .filter(k => typeof k === "string" && (k.startsWith("c:") || k.startsWith("q:")));

        let folderId = null;
        if (realKeys.length === 1 && realKeys[0].startsWith("c:")) {
          folderId = realKeys[0].slice(2);
        } else if (!realKeys.length && state.view === VIEW.FOLDER && state.folderId) {
          folderId = state.folderId;
        }

        const folder = folderId ? (state.categories || []).find(c => c.id === folderId) : null;
        if (folder?.name) opts = { ...opts, defaultName: folder.name };
      }

      // === 1) Źródło pytań: preferuj zaznaczenie (pytania + foldery + podfoldery) ===
      let qids = [];
      try {
        qids = await selectionToQuestionIds(state); // rozwija foldery do pytań
      } catch (e) {
        console.warn("selectionToQuestionIds failed:", e);
        qids = [];
      }
  
      // Jeśli nie ma zaznaczenia, pozwól nadal użyć opts.questions albo state.questions (fallback)
      let questionsForModal = null;
  
      if (qids.length) {
        // potrzebujemy payloadów => bierzemy pełne allQuestions (cache) i filtrujemy po id
        if (!state._allQuestions) {
          state._allQuestions = await listAllQuestions(state.baseId);
        }

        const byId = new Map((state._allQuestions || []).map(q => [q.id, q]));

        // Normalizacja do formy, którą modal „łyka" zawsze:
        // - id musi być na top-level
        // - text/answers mogą być na top-level albo w payload (modal już jest odporny, ale tu też porządkujemy)
        const normalize = (r) => ({
          id: r.id,
          payload: (r.payload && typeof r.payload === "object") ? r.payload : { text: "", answers: [] },
          text: r.payload?.text ?? r.text ?? "",
          answers: Array.isArray(r.payload?.answers) ? r.payload.answers : (Array.isArray(r.answers) ? r.answers : []),
        });

        // Lista modala = cała pula bazy (można dozaznaczyć/odznaczyć), a
        // zaznaczenie = dokładnie wybrane pytania; modal niczego nie dobiera.
        questionsForModal = (state._allQuestions || []).map(normalize);
        const preselectRows = qids.map(id => byId.get(id)).filter(Boolean).map(normalize);

        opts = {
          ...opts,
          questions: questionsForModal,
          preselectIds: preselectRows.map(q => q.id),
        };
      } else {
        // fallback: jeśli caller nie podał questions, a selection pusta — daj state.questions
        if (!Array.isArray(opts.questions) && Array.isArray(state.questions)) {
          opts = { ...opts, questions: state.questions.slice() };
        }
      }
      
      opts = {
        ...opts,
        run: async (payload, progress) => {
          // Jeśli nie masz progresu per-insert w importGame, to i tak pokażemy sensowny UX:
          const n = payload?.questions?.length || 0;

          progress?.({
            step: t("baseExplorer.export.progress.creatingGame"),
            i: 0,
            n: n || 1,
            msg: "",
          });

          // "pływający" pasek (symulacja), żeby nie stał na 0%
          let tickTimer = null;
          let i = 0;
          const tick = () => {
            i = Math.min((n || 1) - 1, i + 1);
            progress?.({
              step: t("baseExplorer.export.progress.importingQuestions"),
              i,
              n: n || 1,
              msg: "",
            });
          };
          tickTimer = setInterval(tick, 120);

          try {
            const gameId = await importGame(payload, ownerId);
            progress?.({
              step: t("baseExplorer.export.progress.importDone"),
              i: n || 1,
              n: n || 1,
              msg: t("baseExplorer.export.progress.importOk"),
            });
            return { gameId };
          } finally {
            if (tickTimer) clearInterval(tickTimer);
          }
        },
      };
  
      // === 2) Otwórz modal i poczekaj na wynik ===
      // Gra jest już utworzona wewnątrz opts.run() (patrz wyżej) -- modal
      // czeka na jego zakończenie przed zamknięciem. Wołanie importGame()
      // tutaj ponownie tworzyłoby DRUGĄ grę o tej samej nazwie (realny bug:
      // każdy eksport dawał 2 wiersze w "games").
      const res = await exportModal.open(opts);
      if (!res?.ok) return false;

      // (opcjonalnie) nawigacja do strony gier:
      location.href = linkTo("games");

      return true;
    } catch (e) {
      console.error(e);
      void alertModal({ text: t("baseExplorer.errors.createGameFailed") });
      return false;
    }
  };
  // ===============================================================

  // PPM na liście (foldery/pytania/puste tło)
  listEl?.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    if (isTouchContextMenuWindow(listEl)) return; // natywne menu po long-pressie/scrollu na dotyku (patrz mobile.js)

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

  // Long press na liście (mobile — zamiennik PPM)
  addLongPress(listEl, async (x, y, target) => {
    const row = target?.closest?.(".row[data-kind][data-id]");
    if (row) {
      const kind = row.dataset.kind;
      const id = row.dataset.id;
      await showContextMenu({ state, x, y, target: { kind, id } });
      return;
    }
    await showContextMenu({ state, x, y, target: { kind: "root", id: null } });
  });

  // Long press na drzewie (mobile)
  addLongPress(treeEl, async (x, y, target) => {
    if (isTreeLocked(state)) { warnTreeLocked(state); return; }
    const row = target?.closest?.(".row[data-kind][data-id]");
    if (row) {
      const kind = row.dataset.kind;
      const id = row.dataset.id || null;
      if (kind === "cat") { await showContextMenu({ state, x, y, target: { kind: "cat", id } }); return; }
      if (kind === "root") { await showContextMenu({ state, x, y, target: { kind: "root", id: null } }); return; }
    }
    await showContextMenu({ state, x, y, target: { kind: "root", id: null, scope: "tree" } });
  });

  // Long press na tagach (mobile)
  addLongPress(tagsEl, async (x, y, target) => {
    if (isLeftPanelLockedBySearch()) { warnLeftLockedBySearch(); return; }
    const row = target?.closest?.(".row[data-kind][data-id]");
    if (row) {
      const key = leftKeyFromRow(row);
      if (key && !leftIsSelected(state, key)) { leftSelectSingle(state, key); renderAll(state); }
      const kind = row.dataset.kind;
      const id = row.dataset.id;
      await showContextMenu({ state, x, y, target: { kind, id } });
      return;
    }
    await showContextMenu({ state, x, y, target: { kind: "tags-bg", id: null } });
  });

  // Klik poza menu zamyka
  document.addEventListener("mousedown", (e) => {
    const cm = document.getElementById("contextMenu");
    if (!cm || cm.hidden) return;
    if (e.target === cm || cm.contains(e.target)) return;
    hideContextMenu();
  });

  // ================== Skróty klawiszowe ==================
  // Jedna bramka: przy otwartym oknie (pytanie, tagi, eksport, kosz, zmiana
  // nazwy, potwierdzenie) albo pisaniu w polu skróty menedżera nie działają
  // -- wcześniej Delete w polu treści pytania odpalał usuwanie zaznaczenia.
  const MODAL_IDS = ["questionOverlay", "tagsOverlay", "exportOverlay", "trashOverlay", "renameModal"];
  function shortcutsBlocked() {
    const tag = String(document.activeElement?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable) return true;
    if (document.querySelector(".uni-modal")) return true;
    return MODAL_IDS.some((id) => {
      const el = document.getElementById(id);
      return !!el && !el.hidden && el.style.display !== "none";
    });
  }

  function clickToolbar(act) {
    const btn = document.querySelector(`#toolbar button[data-act="${act}"]`);
    if (btn && !btn.disabled) btn.click();
  }

  async function tryAction(fn, errKey) {
    try {
      await fn();
    } catch (err) {
      console.error(err);
      void alertModal({ text: t(errKey) });
    }
  }

  async function onDeleteKey() {
    if (!canDeleteHere(state)) {
      void alertModal({ text: t("baseExplorer.errors.deleteInSearch") });
      return;
    }
    // TAG: zdejmowanie tagów (z ostrzeżeniem), nie usuwanie elementów
    if (state.view === VIEW.TAG) {
      await tryAction(() => untagSelectedInTagView(state), "baseExplorer.errors.removeTagsFailed");
      return;
    }
    await tryAction(() => deleteSelected(state), "baseExplorer.errors.deleteFailed");
  }

  async function onPasteKey() {
    if (state.view === VIEW.SEARCH) return void alertModal({ text: t("baseExplorer.errors.pasteInSearch") });
    if (state.view === VIEW.TAG) return void alertModal({ text: t("baseExplorer.errors.pasteInTag") });
    if (!canMutateHere(state)) return;
    await tryAction(() => pasteClipboardHere(state), "baseExplorer.errors.pasteFailed");
  }

  function selectAllInList() {
    // Wiersze mają data-kind+data-id, nie data-key -- currentRowKeys()
    // buduje z nich prawdziwe klucze selekcji ("q:"/"c:").
    const keys = currentRowKeys(document.getElementById("list"));
    if (!keys.length) return;
    state.selection.keys = new Set(keys);
    renderList(state);
  }

  // Skróty z modyfikatorem (Ctrl / ⌘): klucz = litera + ":shift" / ":alt".
  const MOD_SHORTCUTS = {
    "c": () => { if (canWrite(state)) copySelectedToClipboard(state); },
    "x": () => { cutSelectedToClipboard(state); },
    "v": onPasteKey,
    "a": selectAllInList,
    "n": () => canMutateHere(state) && tryAction(() => createQuestionHere(state, { categoryId: currentParentId(state) }), "baseExplorer.errors.createQuestionFailed"),
    "n:shift": () => canMutateHere(state) && tryAction(() => createFolderHere(state, { parentId: currentParentId(state) }), "baseExplorer.errors.createFolderFailed"),
    "r:alt": () => clickToolbar("refreshView"),
    "t": () => canWrite(state) && state._api?.openAssignTagsModal?.(),
    "e": () => clickToolbar("editQuestion"),
    "g": () => clickToolbar("createGame"),
    "d": () => clickToolbar("duplicate"),
    "z": () => state._api?.undo?.(),
    "z:shift": () => state._api?.redo?.(),
    "y": () => state._api?.redo?.(),
  };

  document.addEventListener("keydown", async (e) => {
    if (shortcutsBlocked()) return;

    const isMac = navigator.platform.toLowerCase().includes("mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (mod) {
      const letter = String(e.key || "").toLowerCase();
      const id = letter + (e.shiftKey ? ":shift" : e.altKey ? ":alt" : "");
      const fn = MOD_SHORTCUTS[id];
      if (!fn) return;
      e.preventDefault();
      await fn();
      return;
    }

    if (e.key === "Escape") {
      selectionClear(state);
      renderList(state);
      return;
    }

    if (e.key === "Delete") {
      e.preventDefault();
      await onDeleteKey();
      return;
    }

    if (e.key === "F2") {
      if (!canMutateHere(state)) return;
      e.preventDefault();
      await renameSelectedPrompt(state);
      return;
    }

    if (e.key === "Enter") {
      const key = onlyOneSelectedKey(state);
      if (key && key.startsWith("c:")) {
        e.preventDefault();
        await openFolderById(state, key.slice(2));
      }
      return;
    }

    // Backspace w eksploratorze: w górę
    if (e.key === "Backspace" && state.view === VIEW.FOLDER) {
      e.preventDefault();
      await goUp(state);
    }
  });

  return api;
}
