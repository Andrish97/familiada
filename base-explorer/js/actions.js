// base-explorer/js/actions.js
// Obsługa zdarzeń i akcji UI (klik, selection, search, folder view)

import {
  VIEW,
  META_ORDER,
  setViewAll,
  setViewFolder,
  selectionClear,
  selectionSetSingle,
  selectionToggle,
  setViewSearch,
  rememberBrowseLocation,
  restoreBrowseLocation,
} from "./state.js";

import { renderAll, renderList } from "./render.js";

import {
  listQuestionsByCategory,
  listAllQuestions,
  listCategories,
  listQuestionTags,
  listCategoryTags
} from "./repo.js";

import { showContextMenu, hideContextMenu } from "./context-menu.js";
import { openTagsModal } from "./tags-modal.js";
import { sb } from "../../js/core/supabase.js";

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

function uniqLower(arr) {
  const out = [];
  const seen = new Set();
  for (const x of (arr || [])) {
    const v = String(x || "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

// Wydobądź #tagi z wpisu, np. "#pieski, #kotki hello" => { tagNames:["pieski","kotki"], text:"hello" }
function parseSearchInputToTokens(raw) {
  const s = String(raw || "");

  // łapiemy #... do pierwszej spacji/przecinka
  const matches = s.match(/#[^\s,#]+/g) || [];
  const tagNames = uniqLower(matches.map(m => m.replace(/^#/, "").trim()).filter(Boolean));

  // usuń fragmenty #tagów z tekstu
  let text = s;
  for (const m of matches) {
    // usuń też ewentualne przecinki/odstępy obok
    text = text.replace(m, " ");
  }
  text = text.replace(/[,]+/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  return { text, tagNames };
}

function resolveTagIdsByNames(state, tagNames) {
  const byName = new Map((state.tags || []).map(t => [String(t.name || "").toLowerCase(), t.id]));
  const tagIds = [];
  for (const n of (tagNames || [])) {
    const id = byName.get(String(n || "").toLowerCase());
    if (id) tagIds.push(id);
  }
  // uniq
  return Array.from(new Set(tagIds));
}

function filterExistingTagNames(state, tagNames) {
  const byName = new Set((state.tags || []).map(t => String(t.name || "").toLowerCase()));
  return (tagNames || []).filter(n => byName.has(String(n || "").toLowerCase()));
}

function selectionSplitIds(state) {
  const keys = Array.from(state?.selection?.keys || []);
  const qIds = keys.filter(k => k.startsWith("q:")).map(k => k.slice(2));
  const cIds = keys.filter(k => k.startsWith("c:")).map(k => k.slice(2));
  return { qIds, cIds };
}

function uniqIds(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

/* ====== Folder counters (direct children only) ====== */

// Minimalny indeks pytań do liczenia: id + category_id (bez payloadów)
async function ensureQuestionIndexForCounts(state) {
  if (Array.isArray(state._qIndex)) return;

  const { data, error } = await sb()
    .from("qb_questions")
    .select("id,category_id")
    .eq("base_id", state.baseId);

  if (error) throw error;
  state._qIndex = data || [];
}

// Buduje mapę: folderId -> liczba (direct subfolders + direct questions)
// Root liczymy osobno jako "__root__"
async function buildDirectChildrenCountMap(state) {
  await ensureQuestionIndexForCounts(state);

  const cats = Array.isArray(state.categories) ? state.categories : [];
  const qs = Array.isArray(state._qIndex) ? state._qIndex : [];

  // 1) direct subfolders count
  const subfolderCount = new Map(); // folderId -> number
  for (const c of cats) {
    const pid = c.parent_id || null;
    const key = pid || "__root__";
    subfolderCount.set(key, (subfolderCount.get(key) || 0) + 1);
  }

  // 2) direct questions count
  const questionCount = new Map(); // folderId -> number
  for (const q of qs) {
    const cid = q.category_id || null;
    const key = cid || "__root__";
    questionCount.set(key, (questionCount.get(key) || 0) + 1);
  }

  // 3) merged
  const out = new Map(); // folderId or "__root__" -> number
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

function collectDescendantFolderIds(categories, rootFolderId) {
  const byParent = buildChildrenIdIndex(categories);
  const out = [];
  const stack = [rootFolderId];
  const seen = new Set();

  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);

    const kids = byParent.get(id) || [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
  return out;
}

/* ================= META (stałe “tagi” bez DB) ================= */

function metaForQuestionPayload(payload) {
  const p = (payload && typeof payload === "object") ? payload : {};
  const answers = Array.isArray(p.answers) ? p.answers : [];
  const n = answers.length;

  const out = new Set();

  // poll_text: traktujemy jako "kompatybilne zawsze"
  out.add("poll_text");

  // poll_points: 3–6 odpowiedzi
  const inRange = (n >= 3 && n <= 6);
  if (!inRange) return out;

  out.add("poll_points");

  // prepared: wszystkie fixed_points liczbowe, 0..100, suma <= 100
  let sum = 0;
  for (const a of answers) {
    const v = a?.fixed_points;
    if (!Number.isFinite(v)) return out;
    if (v < 0 || v > 100) return out;
    sum += v;
    if (sum > 100) return out;
  }

  out.add("prepared");
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
  // Folder ma “tag” tylko jeśli 100% pytań w jego poddrzewie ma ten tag.
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
    // 3) META MAPS (stałe “tagi”)
  await ensureMetaMapsForUI(state);
}

async function refreshList(state) {
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

  async function rebuildStatusMaps(state) {
    // 1) tagi pytan
    try {
      await buildAllQuestionTagMap(state); // jeśli masz inną nazwę – podmień na realną
    } catch (e) {
      console.warn("buildAllQuestionTagMap failed:", e);
      state._allQuestionTagMap = new Map();
    }
  
    // 2) meta folderów (liczniki dzieci itp.)
    try {
      await buildDirectChildrenCountMap(state);
    } catch (e) {
      console.warn("buildDirectChildrenCountMap failed:", e);
      state._directChildrenCount = new Map();
    }
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
    const links = idsAll.length ? await listQuestionTags(idsAll) : [];
    const m = new Map();
    for (const l of (links || [])) {
      if (!m.has(l.question_id)) m.set(l.question_id, new Set());
      m.get(l.question_id).add(l.tag_id);
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
  // a na końcu “ukrywamy” pytania będące wewnątrz folderów które pokazujemy jako topFolders.
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

    // 2) foldery wynikowe — WYŁĄCZNIE „100% dzieci pasujących”
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

    // topFolders = tylko te „pełne” foldery, które nie mają przodka też „pełnego”
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

    // ====== Liczniki folderów (pytania + foldery, tylko bezpośrednio) ======
    try {
      await buildDirectChildrenCountMap(state);
    } catch (e) {
      console.warn("Direct folder counts failed:", e);
      state._directChildrenCount = new Map();
    }

    await ensureMapsForCurrentRightList();
    renderAll(state);

    const writable = canWrite(state);
    document.getElementById("btnNewFolder")?.toggleAttribute("disabled", !writable);
    document.getElementById("btnNewQuestion")?.toggleAttribute("disabled", !writable);
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

    await ensureMapsForCurrentRightList();
    renderAll(state);

    const writable = canWrite(state);
    document.getElementById("btnNewFolder")?.toggleAttribute("disabled", !writable);
    document.getElementById("btnNewQuestion")?.toggleAttribute("disabled", !writable);
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

    await ensureMapsForCurrentRightList();
    renderAll(state);

    const writable = canWrite(state);
    document.getElementById("btnNewFolder")?.toggleAttribute("disabled", !writable);
    document.getElementById("btnNewQuestion")?.toggleAttribute("disabled", !writable);
    return;
  }

  // ====== BROWSE (ALL/FOLDER) ======
  const parentId = (state.view === VIEW.ALL) ? null : state.folderId;

  const foldersHere = (foldersAll || [])
    .filter(c => (c.parent_id || null) === (parentId || null))
    .slice()
    .sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));

  state.folders = foldersHere;
  state.questions = applySearchFilterToQuestions(browseQuestions, getActiveTextQuery());

  await ensureMapsForCurrentRightList();
  await rebuildStatusMaps(state);
  renderAll(state);

  const mutable = canMutateHere(state);
  document.getElementById("btnNewFolder")?.toggleAttribute("disabled", !mutable);
  document.getElementById("btnNewQuestion")?.toggleAttribute("disabled", !mutable);
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
  // jeśli w zaznaczeniu nie ma realnych elementów (np. tylko "root") — nic nie rób
  if (!qIds.length && !cIds.length) return false;

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

  if (keys.has("root")) {
    alert("Folder główny nie może być usuwany.");
    return false;
  }

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

function openRenameModal({ title = "Zmień nazwę", value = "", maxLen = 80 } = {}) {
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
      // klik w tło zamyka
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

  titleEl.textContent = title;
  input.value = String(value || "");
  input.maxLength = Number(maxLen) || 80;

  modal.hidden = false;

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

  const title = isFolder ? "Zmień nazwę folderu" : "Zmień treść pytania";
  const maxLen = isFolder ? 80 : 200;

  const next = await openRenameModal({ title, value: current, maxLen });
  if (next === null) return false; // anulowano (X / ESC / tło)

  try {
    return await renameByKey(state, key, next);
  } catch (e) {
    console.error(e);
    alert("Nie udało się zmienić.");
    return false;
  }
}

// Usuń tagi jako byty (qb_tags) + ich przypisania
export async function deleteTags(state, tagIds) {
  if (!canWrite(state)) return false;

  const ids = Array.from(new Set((tagIds || []).filter(Boolean)));
  if (!ids.length) return false;

  const label = (ids.length === 1) ? "ten tag" : `te tagi (${ids.length})`;
  const ok = confirm(`Usunąć ${label}?\n\nTo usunie też przypisania tagów do pytań (i ewentualnie folderów).`);
  if (!ok) return false;

  // 1) usuń przypisania do pytań
  {
    const { error } = await sb()
      .from("qb_question_tags")
      .delete()
      .in("tag_id", ids);
    if (error) throw error;
  }

  // 2) usuń przypisania do folderów (jeśli tabela jeszcze istnieje/używana)
  // Jeśli nie istnieje/RLS blokuje — ignorujemy.
  try {
    const { error } = await sb()
      .from("qb_category_tags")
      .delete()
      .in("tag_id", ids);
    if (error) throw error;
  } catch {}

  // 3) usuń same tagi
  {
    const { error } = await sb()
      .from("qb_tags")
      .delete()
      .in("id", ids);
    if (error) throw error;
  }

  // 4) lokalnie wyczyść selekcję usuniętych tagów
  if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
  for (const id of ids) state.tagSelection.ids.delete(id);
  if (!state.tagSelection.ids.size) state.tagSelection.anchorId = null;

  // 5) odśwież tagi i widok
  await state._api?.refreshTags?.();

  // jeśli jesteśmy w VIEW.TAG i usunęliśmy wszystko z selekcji -> wyjdź do ostatniego browse
  const remaining = Array.from(state.tagSelection.ids || []);
  if (state.view === VIEW.TAG) {
    if (!remaining.length) {
      restoreBrowseLocation(state);
      state.tagIds = [];
    } else {
      state.tagIds = remaining;
    }
  }

  selectionClear(state);
  await state._api?.refreshList?.();
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
  state.clipboard = state.clipboard || { mode: null, keys: new Set() };
  state.clipboard.mode = mode;

  const onlyReal = Array.from(keys || []).filter(k =>
    typeof k === "string" && (k.startsWith("q:") || k.startsWith("c:"))
  );

  state.clipboard.keys = new Set(onlyReal);
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
  if (!canMutateHere(state)) return false;

  const targetFolderIdOrNull = (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
  const mode = state.clipboard.mode;
  const keys = state.clipboard.keys;
  const qKeys = Array.from(keys).filter(k => k.startsWith("q:"));
  const cKeys = Array.from(keys).filter(k => k.startsWith("c:"));
  // COPY: na razie tylko pytania
  if (mode === "copy") {

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
  
    clipboardClear(state);
    return true;
  }

  return false;
}

/* ================= DnD / Clipboard helpers (MUSZĄ być poza wireActions) ================= */

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

function uniqueNameInSiblings(categories, parentIdOrNull, baseName) {
  const siblings = (categories || []).filter(c => (c.parent_id || null) === (parentIdOrNull || null));
  const names = new Set(siblings.map(s => String(s.name || "").toLowerCase()));

  const base = String(baseName || "Folder").slice(0, 80);
  if (!names.has(base.toLowerCase())) return base;

  const stem = `${base} (kopia)`;
  if (!names.has(stem.toLowerCase())) return stem;

  let n = 2;
  while (n < 9999) {
    const cand = `${base} (kopia ${n})`;
    if (!names.has(cand.toLowerCase())) return cand;
    n++;
  }
  return stem;
}

async function copyQuestionsTo(state, qIds, targetFolderIdOrNull) {
  if (!qIds || !qIds.length) return;

  // pobierz źródłowe pytania (minimalnie)
  const { data: src, error: e1 } = await sb()
    .from("qb_questions")
    .select("id,payload")
    .in("id", qIds);

  if (e1) throw e1;

  // ord startowy w folderze docelowym
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

async function copyFolderSubtree(state, sourceFolderId, targetParentIdOrNull) {
  // 1) zbierz foldery w poddrzewie
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

  // 3) nowy root kopiowanego drzewa
  const srcRoot = byId.get(sourceFolderId);
  const rootName = uniqueNameInSiblings(cats, targetParentIdOrNull, String(srcRoot?.name || "Folder"));
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

  // 4) mapowanie stary->nowy
  const mapOldToNew = new Map();
  mapOldToNew.set(sourceFolderId, newRoot.id);

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

  // 5) wstaw pytania (kopie)
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

  if (state._api?.refreshCategories) await state._api.refreshCategories();
  state._rootQuestions = null;
}

async function moveItemsTo(state, targetFolderIdOrNull, { mode = "move" } = {}) {
  if (!canWrite(state)) return;

  const keys = state._drag?.keys;
  if (!keys || !keys.size) return;

  // 1) najpierw rozbij na typy
  const qIds = [];
  const cIds = [];
  for (const k of keys) {
    if (k.startsWith("q:")) qIds.push(k.slice(2));
    if (k.startsWith("c:")) cIds.push(k.slice(2));
  }

  const isCopy = mode === "copy";

  // 2) COPY — pytania + foldery (foldery kopiujemy z poddrzewem i pytaniami)
  if (isCopy) {
    // 1) foldery (każdy jako osobne drzewo w miejscu docelowym)
    if (cIds.length) {
      for (const fid of cIds) {
        await copyFolderSubtree(state, fid, targetFolderIdOrNull);
      }
    }
  
    // 2) pytania
    if (qIds.length) {
      await copyQuestionsTo(state, qIds, targetFolderIdOrNull);
    }
  
    await state._api?.refreshList?.();
    return;
  }


  // 3) MOVE — walidacje folderów
  if (cIds.length && targetFolderIdOrNull) {
    for (const fid of cIds) {
      if (fid === targetFolderIdOrNull) {
        alert("Nie można przenieść folderu do niego samego.");
        return;
      }
      if (isFolderDescendant(state, fid, targetFolderIdOrNull)) {
        alert("Nie można przenieść folderu do jego podfolderu.");
        return;
      }
    }
  }

  // 4) MOVE — pytania
  if (qIds.length) {
    const upd = { category_id: targetFolderIdOrNull };
    if (state.user?.id) upd.updated_by = state.user.id;

    const { error } = await sb()
      .from("qb_questions")
      .update(upd)
      .in("id", qIds);

    if (error) throw error;
    state._rootQuestions = null;
  }

  // 5) MOVE — foldery
  if (cIds.length) {
    const { error } = await sb()
      .from("qb_categories")
      .update({ parent_id: targetFolderIdOrNull })
      .in("id", cIds);

    if (error) throw error;

    if (state._api?.refreshCategories) await state._api.refreshCategories();
  }

  await state._api?.refreshList?.();
}

async function applyTagToDraggedItems(state, tagId, draggedKeys) {
  if (!canWrite(state)) return false;
  if (!tagId) return false;

  const keys = Array.from(draggedKeys || []).filter(Boolean);
  if (!keys.length) return false;

  const qIds = [];
  const cIds = [];

  for (const k of keys) {
    if (k.startsWith("q:")) qIds.push(k.slice(2));
    if (k.startsWith("c:")) cIds.push(k.slice(2));
  }

  // Folder -> pytania w poddrzewie
  let qFromFolders = [];
  if (cIds.length) {
    await ensureDerivedFolderMaps(state);
    const folderDesc = state._folderDescQIds || new Map();
    const out = new Set();
    for (const cid of cIds) {
      const set = folderDesc.get(cid);
      if (!set) continue;
      for (const qid of set) out.add(qid);
    }
    qFromFolders = Array.from(out);
  }

  const allQIds = Array.from(new Set([...qIds, ...qFromFolders])).filter(Boolean);
  if (!allQIds.length) return false;

  // Pobierz istniejące linki (żeby nie robić duplikatów)
  const { data: existing, error: e0 } = await sb()
    .from("qb_question_tags")
    .select("question_id,tag_id")
    .in("question_id", allQIds)
    .eq("tag_id", tagId);

  if (e0) throw e0;

  const have = new Set((existing || []).map(x => x.question_id));
  const inserts = [];

  for (const qid of allQIds) {
    if (have.has(qid)) continue;
    inserts.push({ question_id: qid, tag_id: tagId });
  }

  if (inserts.length) {
    const { error: e1 } = await sb()
      .from("qb_question_tags")
      .insert(inserts, { defaultToNull: false });
    if (e1) throw e1;
  }

  // Unieważnij cache tagów / derived folder tags
  state._allQuestionTagMap = null;
  state._derivedCategoryTagMap = null;
  state._folderDescQIds = null;
  state._allCategoryTagMap = null;

  await state._api?.refreshList?.();
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
  if (!ids.length) return;

  // ustawiamy ord 1..N (prosto i stabilnie)
  // + parent_id (bo reorder może też oznaczać przeniesienie między rodzicami)
  const updates = ids.map((id, i) => ({
    id,
    parent_id: parentIdOrNull,
    ord: i + 1,
  }));

  // Supabase: najprościej i najczytelniej: pojedyncze update per element (ok dla małych list)
  // Jeśli kiedyś będzie tego tysiące, zrobimy RPC/batch.
  for (const u of updates) {
    const { error } = await sb()
      .from("qb_categories")
      .update({ parent_id: u.parent_id, ord: u.ord })
      .eq("id", u.id);
    if (error) throw error;
  }

  // odśwież cache kategorii i UI
  if (state._api?.refreshCategories) await state._api.refreshCategories();
  await state._api?.refreshList?.();
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
  const { data, error } = await sb()
    .from("qb_tags")
    .select("id,base_id,name,color,ord")
    .eq("base_id", state.baseId)
    .order("ord", { ascending: true });

  if (error) throw error;
  state.tags = data || [];
}

async function untagSelectedInTagView(state) {
  if (!canWrite(state)) return false;

  // W TAG zdejmiemy TAGI z zaznaczonych elementów (foldery/pytania),
  // a NIE usuwamy tych elementów.
  const keys = state?.selection?.keys;
  if (!keys || !keys.size) {
    alert("Zaznacz foldery lub pytania po prawej.");
    return false;
  }

  // tagi aktywnego widoku TAG (OR)
  const tagIds = Array.isArray(state.tagIds) ? state.tagIds.filter(Boolean) : [];
  if (!tagIds.length) {
    alert("Brak wybranych tagów.");
    return false;
  }

  // Roota nie tagujemy/nie ruszamy
  if (keys.has("root")) {
    alert("Folder główny nie może brać udziału w tej operacji.");
    return false;
  }

  const label = (keys.size === 1) ? "tym elemencie" : `tych elementach (${keys.size})`;
  const ok = confirm(
    `Jesteś w widoku tagów.\n\nUsuwamy tagi (bez kasowania elementów) na ${label}.\n\nKontynuować?`
  );
  if (!ok) return false;

  const qIds = [];
  const cIds = [];

  for (const k of keys) {
    if (k.startsWith("q:")) qIds.push(k.slice(2));
    if (k.startsWith("c:")) cIds.push(k.slice(2));
  }

  // zdejmujemy tylko wybrane tagIds
  if (qIds.length) {
    const { error } = await sb()
      .from("qb_question_tags")
      .delete()
      .in("question_id", qIds)
      .in("tag_id", tagIds);

    if (error) throw error;
  }

  if (cIds.length) {
    const { error } = await sb()
      .from("qb_category_tags")
      .delete()
      .in("category_id", cIds)
      .in("tag_id", tagIds);

    if (error) throw error;
  }

  // odśwież cache map tagów (SEARCH/TAG)
  state._allQuestionTagMap = null;
  state._allCategoryTagMap = null;

  await state._api?.refreshList?.();
  return true;
}

async function afterTagsModalClose(state, result) {
  const changed = (result === true) || (result && result.saved);
  if (!changed) {
    // nic nie zapisano – tylko odrysuj
    renderAll(state);
    return false;
  }

  // ZAPAMIĘTAJ selekcję, bo refreshList może ją po drodze “zgubić” w UI
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
  const tagsEl = document.getElementById("tags");
  const breadcrumbsEl = document.getElementById("breadcrumbs");
  const toolbarEl = document.getElementById("toolbar");
  const head = document.querySelector(".list-head");
  if (!head) return;
  
  const headNum  = head.querySelector(".h-num");
  const headMain = head.querySelector(".h-main");
  const headType = head.querySelector(".h-type");
  const headDate = head.querySelector(".h-date");

    /* ================= Interaction locks (bez MODE) ================= */

  // Throttle ostrzeżeń (żeby nie wyskakiwało 20 alertów przy drag/move)
  let _lockWarnAt = 0;
  function warnLocked(msg) {
    const now = Date.now();
    if (now - _lockWarnAt < 700) return; // 0.7s
    _lockWarnAt = now;
    alert(msg);
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
      warnLocked("W trakcie wyszukiwania drzewo jest zablokowane. Kliknij ✕ aby wyczyścić, albo kliknij poza pole wyszukiwania.");
      return;
    }
    if (hasLeftSelection(state)) {
      warnLocked("Masz zaznaczone Tagi/Kategorie. Wyczyść zaznaczenie po lewej (klik w tło panelu), aby używać drzewa.");
      return;
    }
  }

  function warnLeftLockedBySearch() {
    warnLocked("W trakcie wyszukiwania panel Tagi/Kategorie jest zablokowany. Kliknij ✕ aby wyczyścić, albo kliknij poza pole wyszukiwania.");
  }

  function warnSearchLockedByLeft(state) {
    if (hasLeftSelection(state)) {
      warnLocked("Masz zaznaczone Tagi/Kategorie — wyszukiwarka jest zablokowana. Wyczyść zaznaczenie po lewej (klik w tło panelu), aby szukać.");
    }
  }

  // Blokada fokusa w search, gdy mamy aktywne Tagi/Kategorie (FILTER)
  const searchInput = document.getElementById("searchText");
  if (searchInput) {
    searchInput.addEventListener("mousedown", (e) => {
      if (!isSearchLockedByLeftSelection(state)) return;
      e.preventDefault();
      e.stopPropagation();
      warnSearchLockedByLeft(state);
    });
    searchInput.addEventListener("focus", () => {
      if (!isSearchLockedByLeftSelection(state)) return;
      try { searchInput.blur(); } catch {}
      warnSearchLockedByLeft(state);
    });
  }

  // (opcjonalne, ale przydatne) klik w cały searchBox też ma ostrzec, gdy zablokowane
  const searchBox = document.getElementById("searchBox");
  if (searchBox) {
    searchBox.addEventListener("mousedown", (e) => {
      if (!isSearchLockedByLeftSelection(state)) return;
      e.preventDefault();
      e.stopPropagation();
      warnSearchLockedByLeft(state);
    });
  }

  // ===== Sort header: delegacja (bo renderList podmienia DOM) =====
  function toggleSort(key) {
    const s = state.sort || (state.sort = { key: "name", dir: "asc" });
  
    if (s.key === key) s.dir = (s.dir === "asc") ? "desc" : "asc";
    else { s.key = key; s.dir = "asc"; }
  
    renderList(state);
  }
  
  listEl?.addEventListener("click", (e) => {
    const h = e.target?.closest?.(".list-head [data-sort-key]");
    if (!h) return;
    const key = h.dataset.sortKey;
    if (!key) return;
    toggleSort(key);
  });

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
      // drzewo: pamiętanie rozwinięć
    if (!(state.treeOpen instanceof Set)) state.treeOpen = new Set();
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
    // drzewo: pamiętanie rozwinięć
  if (!(state.treeOpen instanceof Set)) state.treeOpen = new Set();

  state._drag = { keys: null, overKey: null, mode: "move" }; // mode: 'move'|'copy'

  let clickRenderTimer = null;

  function scheduleRenderList() {
    if (clickRenderTimer) clearTimeout(clickRenderTimer);
    clickRenderTimer = setTimeout(() => {
      clickRenderTimer = null;
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
  
  function keyFromKindId(kind, id) {
    if (kind === "q") return `q:${id}`;
    if (kind === "cat") return `c:${id}`;
    return null;
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

      if (t.id === "searchBox" || t.closest?.("#searchBox")) {
        document.getElementById("searchText")?.focus();
      }

      if (t.id === "btnNewFolder" || t.id === "btnNewQuestion") {
        if (!canMutateHere(state)) return;
      }

      if (t.id === "searchClearBtn") {

        const alreadyEmpty =
          !String(state.searchTokens?.text || "").trim() &&
          !(Array.isArray(state.searchTokens?.tagIds) && state.searchTokens.tagIds.length) &&
          !String(document.getElementById("searchText")?.value || "").trim();
        
        if (alreadyEmpty && state.view !== VIEW.SEARCH) return;
        
        const inp = document.getElementById("searchText");
        if (inp) inp.value = "";
        state.searchTokens = { text: "", tagIds: [] };
        state.searchQuery = "";
        
        if (state.view === VIEW.SEARCH) restoreBrowseLocation(state);
        selectionClear(state);
        await refreshList(state);
        
        document.getElementById("searchText")?.focus();
        return;
      }
      
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
  
    // kursor w miejscu “po czyszczeniu”
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
    // zamień na chip, ale NIE “przepisuj input” w trakcie normalnego pisania.
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
      warnLeftLockedBySearch();
      return;
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
  
    // tu NIE ma copy/move – to zawsze “dodaj tag”,
    // ale trzymamy to w logice dla spójności z UI (i ewentualnych badge’y)
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
      alert("Nie udało się przypisać taga.");
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
      warnTreeLocked(state);
      return;
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
      warnTreeLocked(state);
      return;
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

  // PPM na drzewie (foldery + puste tło)
  treeEl?.addEventListener("contextmenu", async (e) => {
    e.preventDefault();

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
  
    const row = e.target?.closest?.('.row[data-kind="cat"][data-id]');
    if (!row) {
      // upuszczenie na tło drzewa = root
      state._drag.treeDrop = { mode: "root", targetId: null };
      clearDropTarget();
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
  
    const payload = state._drag.treeDrop || { mode: "root", targetId: null };
    const modeKey = payload.mode;
    const targetId = payload.targetId;
  
    // przygotuj listę folderów z zaznaczenia (DnD w drzewie dotyczy folderów)
    const keys = state._drag?.keys;
    const cIds = keys ? Array.from(keys).filter(k => k.startsWith("c:")).map(k => k.slice(2)) : [];
  
    clearDropTarget();
    state._drag.treeDrop = null;
  
    try {
      const moveMode = isCopyDragModifier(e) ? "copy" : "move";
  
      // COPY: zostawiamy stare zachowanie (kopiowanie folderów już masz)
      if (moveMode === "copy") {
        await moveItemsTo(state, targetId, { mode: "copy" }); 
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
        await moveItemsTo(state, null, { mode: "move" });
        pulseDropTargetIn(
          treeEl,
          `.row[data-kind="root"][data-id]`,
          null
        );
        return;
      }
  
      // - jeśli drop "into" => move do środka folderu (parent = targetId)
      if (modeKey === "into") {
        await moveItemsTo(state, targetId, { mode: "move" });
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
  
      // jeśli user przeciąga same pytania na drzewo “między” — traktujemy jak “do folderu”
      await moveItemsTo(state, targetId, { mode: "move" });

      pulseEl(treeEl);
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
      return; // edytor pytania później
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
      const mode = isCopyDragModifier(e) ? "copy" : "move";
      await moveItemsTo(state, targetFolderId, { mode });

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
      pulseEl(listEl);
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

    // --- Zaznaczanie "od pustego" (marquee) ---
  let marquee = null;
  let marqueeStart = null;
  let marqueeAdd = false;       // ctrl/meta => dodawanie do selekcji
  let marqueeBaseKeys = null;   // snapshot selekcji startowej (dla add)

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
  
    // ctrl/meta = dodaj do bazowej selekcji
    const out = marqueeAdd && marqueeBaseKeys ? new Set(marqueeBaseKeys) : new Set();
    for (const k of hit) out.add(k);
  
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

    /* ================= Marquee: TREE ================= */
  let treeMarquee = null;
  let treeMarqueeStart = null;
  let treeMarqueeAdd = false;
  let treeMarqueeBase = null;

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

    const out = treeMarqueeAdd && treeMarqueeBase ? new Set(treeMarqueeBase) : new Set();
    for (const k of hit) out.add(k);

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

    /* ================= Marquee: TAGS ================= */
  let tagsMarquee = null;
  let suppressNextTagsClick = false;
  let tagsMarqueeStart = null;
  let tagsMarqueeAdd = false;
  let tagsMarqueeBase = null;

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
  
    const base = (tagsMarqueeAdd && tagsMarqueeBase)
      ? new Set(tagsMarqueeBase)
      : new Set();
  
    for (const k of hitKeys) base.add(k);
  
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
  
    await applyLeftFiltersView(); // <<< to robi właściwe “odświeżenie widoku”
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
      // C: SEARCH – blokada
      if (state.view === VIEW.SEARCH) {
        e.preventDefault();
        alert("W widoku wyszukiwania nie można usuwać.");
        return;
      }
    
      // C: TAG – zdejmowanie tagów (z ostrzeżeniem)
      if (state.view === VIEW.TAG) {
        e.preventDefault();
        try {
          await untagSelectedInTagView(state);
        } catch (err) {
          console.error(err);
          alert("Nie udało się zdjąć tagów.");
        }
        return;
      }
    
      // normalnie (FOLDER/ALL)
      if (!canMutateHere(state)) return;
    
      try {
        await deleteSelected(state);
      } catch (err) {
        console.error(err);
        alert("Nie udało się usunąć.");
      }
    }

      if (e.key === "F2") {
        if (!canMutateHere(state)) return;
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
        // C: w SEARCH/TAG wklejanie zablokowane
        if (state.view === VIEW.SEARCH) {
          e.preventDefault();
          alert("W widoku wyszukiwania nie można wklejać.");
          return;
        }
        if (state.view === VIEW.TAG) {
          e.preventDefault();
          alert("W widoku tagów nie można wklejać.");
          return;
        }
      
        if (!canMutateHere(state)) {
          e.preventDefault();
          return;
        }
      
        e.preventDefault();
        try {
          await pasteClipboardHere(state);
        } catch (err) {
          console.error(err);
          alert("Nie udało się wkleić.");
        }
        return;
      }

    // Ctrl+N / Cmd+N = nowy folder (w bieżącym folderze / root)
      if (mod && (e.key === "n" || e.key === "N")) {
        if (!canMutateHere(state)) return;
        e.preventDefault();
        try {
          const parentId = currentParentId(state);
          await createFolderHere(state, { parentId });
        } catch (err) {
          console.error(err);
          alert("Nie udało się utworzyć folderu.");
        }
        return;
      }

      if (mod && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        if (!canWrite(state)) return;
      
        await ensureDerivedFolderMaps(state);
        const { qIds, cIds } = selectionSplitIds(state);
      
        const res = await openTagsModal(state, { mode: "assign" });
        await afterTagsModalClose(state, res);
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
