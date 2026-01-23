// base-explorer/js/actions.js
// Obsługa zdarzeń i akcji UI (klik, selection, search, folder view)

import {
  VIEW,
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
import { sb } from "../../js/core/supabase.js";

/* ================= Utils ================= */
function canWrite(state) {
  return state?.role === "owner" || state?.role === "editor";
}

function isVirtualView(state) {
  return state?.view === VIEW.SEARCH || state?.view === VIEW.TAG;
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
}

async function refreshList(state) {

  // --- Drzewo: init + auto-otwórz ścieżkę do aktualnego folderu ---
  if (!(state.treeOpen instanceof Set)) state.treeOpen = new Set();

  if (state.view === VIEW.FOLDER && state.folderId) {
    const byId = new Map((state.categories || []).map(c => [c.id, c]));
    let cur = byId.get(state.folderId);
    let guard = 0;
    while (cur && guard++ < 20) {
      state.treeOpen.add(cur.id); // otwórz każdy element na ścieżce
      const pid = cur.parent_id || null;
      cur = pid ? byId.get(pid) : null;
    }
  }
  
  const allQ = await loadQuestionsForCurrentView(state);
  state._viewQuestions = allQ;

  // === SEARCH: „wirtualny widok wyników” po CAŁOŚCI ===
  if (state.view === VIEW.SEARCH) {
    // pytania globalnie
    if (!state._allQuestions) {
      state._allQuestions = await listAllQuestions(state.baseId);
    }

    const foldersAll = Array.isArray(state.categories) ? state.categories : [];
    const qAll = state._allQuestions;

    // pomocnicze struktury dla SEARCH (tagi + rodzice)
    const byIdAll = new Map(foldersAll.map(c => [c.id, c]));
    const foldersFromTags = new Set(); // foldery "wynikowe" przez tagi (kategorie otagowane + rodzice)

    const tokens = state.searchTokens || { text: state.searchQuery || "", tagIds: [], tagNames: [] };
    const textQ = String(tokens.text || "").trim();

    // 1) filtr po tagach (OR): pytanie przechodzi jeśli ma którykolwiek tag z tagIds
    let qs = qAll;

    const tagIds = Array.isArray(tokens.tagIds) ? tokens.tagIds.filter(Boolean) : [];
    if (tagIds.length) {
      // cache mapy question_id -> Set(tag_id) (dla wszystkich pytań)
      if (!state._allQuestionTagMap) {
        const ids = (qAll || []).map(x => x.id).filter(Boolean);
        const links = await listQuestionTags(ids);
        const m = new Map();
        for (const l of (links || [])) {
          if (!m.has(l.question_id)) m.set(l.question_id, new Set());
          m.get(l.question_id).add(l.tag_id);
        }
        state._allQuestionTagMap = m;
      }

      const m = state._allQuestionTagMap;
      qs = (qs || []).filter(q => {
        const set = m.get(q.id);
        if (!set) return false;
        for (const tid of tagIds) if (set.has(tid)) return true;
        return false;
      });
    }

    // 2) filtr tekstowy na pytania (AND z tagami)
    qs = applySearchFilterToQuestions(qs, textQ);

    // 3) foldery:
    // - jeśli jest tekst: foldery po nazwie
    // - jeśli są tagi: foldery, które zawierają wyniki (category_id) + ich rodzice (żeby “dało się wejść”)
    let fs = applySearchFilterToFolders(foldersAll, textQ);

    if (tagIds.length) {
      // foldery bezpośrednie wyników (z pytań) + ich rodzice
      for (const q of (qs || [])) {
        const cid = q.category_id || null;
        if (!cid) continue;
    
        foldersFromTags.add(cid);
    
        let cur = byIdAll.get(cid);
        let guard = 0;
        while (cur && guard++ < 20) {
          const pid = cur.parent_id || null;
          if (!pid) break;
          foldersFromTags.add(pid);
          cur = byIdAll.get(pid);
        }
      }
    
      const extra = foldersAll.filter(c => foldersFromTags.has(c.id));
    
      // merge uniq
      const merged = new Map();
      for (const c of fs) merged.set(c.id, c);
      for (const c of extra) merged.set(c.id, c);
      fs = Array.from(merged.values());
    }

    state.folders = fs;
    state.questions = qs;
    await ensureTagMapsForUI(state);
    renderAll(state);

    const writable = canWrite(state);
    document.getElementById("btnNewFolder")?.toggleAttribute("disabled", !writable);
    document.getElementById("btnNewQuestion")?.toggleAttribute("disabled", !writable);
    return;
  }

  // === TAG: „wirtualny widok wyników” po CAŁOŚCI (jak SEARCH, tylko filtr tagów) ===
  if (state.view === VIEW.TAG) {
    // tagIds = zaznaczone po lewej (multi)
    const tagIds = Array.isArray(state.tagIds) ? state.tagIds.filter(Boolean) : [];
    if (!tagIds.length) {
      // brak filtra = wróć do normalnego przeglądania
      restoreBrowseLocation(state);
      selectionClear(state);
      await refreshList(state);
      return;
    }

    // indeksy (wszystkie pytania + tagi pytań + folder->descQ + derived folder tags)
    await ensureDerivedFolderMaps(state);

    const qAll = state._allQuestions || [];
    const qm = state._allQuestionTagMap || new Map();
    const folderDesc = state._folderDescQIds || new Map();

    const wanted = new Set(tagIds);

    // helper: pytanie ma wszystkie tagi?
    function questionHasAll(qid) {
      const set = qm.get(qid);
      if (!set) return false;
      for (const tid of wanted) if (!set.has(tid)) return false;
      return true;
    }

    // 1) pasujące foldery = 100% pytań w poddrzewie ma wszystkie tagi
    const cats = Array.isArray(state.categories) ? state.categories : [];
    const matchingFolderIds = new Set();

    for (const c of cats) {
      const qids = folderDesc.get(c.id);
      if (!qids || qids.size === 0) continue;

      let ok = true;
      for (const qid of qids) {
        if (!questionHasAll(qid)) { ok = false; break; }
      }
      if (ok) matchingFolderIds.add(c.id);
    }

    // 2) jeżeli folder pasuje, to jego PODFOLDERY i tak “zawierają się” w nim.
    // Żeby UI było czytelne: pokażemy tylko NAJWYŻSZE pasujące (bez przodków w matching).
    // (Opcjonalne, ale bardzo pomaga: nie masz 20 folderów zduplikowanych w górę/dół.)
    const byId = new Map(cats.map(c => [c.id, c]));
    function hasMatchingAncestor(folderId) {
      let cur = byId.get(folderId);
      let guard = 0;
      while (cur && guard++ < 50) {
        const pid = cur.parent_id || null;
        if (!pid) return false;
        if (matchingFolderIds.has(pid)) return true;
        cur = byId.get(pid);
      }
      return false;
    }

    const topFolders = cats.filter(c => matchingFolderIds.has(c.id) && !hasMatchingAncestor(c.id));

    // 3) pasujące pytania (ale nie pokazuj, jeśli są w folderze, który już pokazujemy – lub w jego poddrzewie)
    // czyli: jeśli pytanie należy do folderu, który jest “wewnątrz” topFolders, to ukryj je.
    const topFolderIds = new Set(topFolders.map(f => f.id));

    function isInsideTopFolder(categoryId) {
      if (!categoryId) return false;
      let cur = byId.get(categoryId);
      let guard = 0;
      while (cur && guard++ < 50) {
        if (topFolderIds.has(cur.id)) return true;
        const pid = cur.parent_id || null;
        cur = pid ? byId.get(pid) : null;
      }
      return false;
    }

    const matchingQuestions = [];
    for (const q of qAll) {
      if (!questionHasAll(q.id)) continue;
      if (isInsideTopFolder(q.category_id || null)) continue; // już “jest” w pokazanym folderze
      matchingQuestions.push(q);
    }

    // Ustaw stan widoku
    state.folders = topFolders;
    state.questions = matchingQuestions;

    // mapy do kropek: dla pytań w bieżącej liście potrzebujemy _viewQuestionTagMap
    // (folderowe kropki mamy globalnie z derived)
    await ensureTagMapsForUI(state);
    renderAll(state);

    const writable = canWrite(state);
    document.getElementById("btnNewFolder")?.toggleAttribute("disabled", !writable);
    document.getElementById("btnNewQuestion")?.toggleAttribute("disabled", !writable);
    return;
  }
  
  const parentId = (state.view === VIEW.ALL) ? null : state.folderId;
  const foldersHere = (state.categories || [])
    .filter(c => (c.parent_id || null) === (parentId || null))
    .slice()
    .sort((a,b) => (Number(a.ord)||0) - (Number(b.ord)||0));
  
    state.folders = foldersHere;
    state.questions = applySearchFilterToQuestions(allQ, state.searchQuery);
  
    await ensureTagMapsForUI(state);
    
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

  // Blokada Etap C/G: w SEARCH nie tagujemy niczego
  if (state.view === VIEW.SEARCH) {
    alert("W widoku wyszukiwania nie można przypisywać tagów.");
    return false;
  }

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

async function openTagsModal(state, opts = {}) {
  const el = tagsModalEls();
  if (!el) return false;

  const editor = canWrite(state);

  // opts:
  // - mode: "assign" | "create" | "edit"
  // - tagId (dla edit)
  // - selection: { qIds, cIds } opcjonalnie (domyślnie z current selection)
  const mode = opts.mode || "assign";
  const editTagId = opts.tagId || null;

  // snapshot selection do L1
  const sel = opts.selection || selectionSplitIds(state);
  const qIds = sel.qIds || [];
  const cIds = sel.cIds || [];

  // stan modalowy (lokalny)
  const m = {
    layer: 1,
    // L1: tri-state per tag
    tri: new Map(), // tagId -> "all" | "none" | "some"
    // L2/L3:
    edit: { mode: "create", tagId: null, name: "", color: "#4da3ff" },

    colorBase: null,
    
    pickedColor: null,
  };

  m.dirty = new Set(); // tagIds, które user faktycznie zmienił

  async function expandFoldersToQuestionIds(folderIds) {
    const cIds = uniqIds(folderIds || []);
    if (!cIds.length) return [];

    // potrzebujemy indeksów z całej bazy
    await ensureDerivedFolderMaps(state);

    const folderDesc = state._folderDescQIds || new Map();
    const out = new Set();
    for (const cid of cIds) {
      const set = folderDesc.get(cid);
      if (!set) continue;
      for (const qid of set) out.add(qid);
    }
    return Array.from(out);
  }

  function close(result) {
    el.modal.hidden = true;
    el.modal.removeEventListener("click", onBackdrop);
    document.removeEventListener("keydown", onKey);

    el.close?.removeEventListener("click", onClose);

    el.assignAddBtn?.removeEventListener("click", onAssignAdd);
    el.assignCancel?.removeEventListener("click", onAssignCancel);
    el.assignSave?.removeEventListener("click", onAssignSave);

    el.editCancel?.removeEventListener("click", onEditCancel);
    el.editSave?.removeEventListener("click", onEditSave);
    el.editColorBtn?.removeEventListener("click", onEditColor);

    el.colorClose?.removeEventListener("click", onColorClose);
    el.colorCancel?.removeEventListener("click", onColorCancel);
    el.colorDone?.removeEventListener("click", onColorDone);
    
    el.colorR?.removeEventListener("input", onSliderInput);
    el.colorG?.removeEventListener("input", onSliderInput);
    el.colorB?.removeEventListener("input", onSliderInput);
    el.colorHex?.removeEventListener("input", onHexInput);

    resolvePromise(result);
  }

  function goLayer(n) {
    m.layer = n;
    showLayer(el, n);
    hideErrBox(el.assignErr);
    hideErrBox(el.editErr);
  }

  function stepBackOrClose() {
    if (m.layer === 3) return goLayer(2);
    if (m.layer === 2) return goLayer(1);
    return close(false);
  }

  function renderAssignInfo() {
    if (!el.assignInfo) return;
    const parts = [];
    if (qIds.length) parts.push(`${qIds.length} pyt.`);
    if (cIds.length) parts.push(`${cIds.length} folder(ów)`);
    el.assignInfo.textContent = parts.length ? `Zaznaczenie: ${parts.join(" + ")}.` : "Brak zaznaczenia.";
  }

  // policz tri-state na starcie
  async function initAssignTriState() {
    if (!Array.isArray(state.tags) || !state.tags.length) {
      await refreshTags(state);
    }

    const tagIdsAll = (state.tags || []).map(t => t.id).filter(Boolean);

    // ZAMIANA: foldery rozwijamy do listy pytań (rekurencyjnie)
    const qFromFolders = await expandFoldersToQuestionIds(cIds);
    const allQIds = uniqIds([...(qIds || []), ...(qFromFolders || [])]);

    const qMap = new Map();
    if (allQIds.length) {
      const links = await listQuestionTags(allQIds);
      for (const l of (links || [])) {
        if (!qMap.has(l.question_id)) qMap.set(l.question_id, new Set());
        qMap.get(l.question_id).add(l.tag_id);
      }
    }

    const total = allQIds.length;

    for (const tid of tagIdsAll) {
      if (total === 0) { m.tri.set(tid, "none"); continue; }

      let has = 0;
      for (const qid of allQIds) {
        const set = qMap.get(qid);
        if (set && set.has(tid)) has++;
      }

      if (has === 0) m.tri.set(tid, "none");
      else if (has === total) m.tri.set(tid, "all");
      else m.tri.set(tid, "some");
    }
  }

  function triToUiState(tri) {
    // checkbox:
    // all -> checked
    // none -> unchecked
    // some -> indeterminate + unchecked
    return {
      checked: tri === "all",
      indeterminate: tri === "some",
    };
  }

  function cycleTri(tagId) {
    const cur = m.tri.get(tagId) || "none";

    // ustalenie: cyklicznie wszyscy <-> nikt
    // częściowo: ostrzeżenie i przejście do "wszyscy"
    if (cur === "some") {
      alert("Tag jest przypisany częściowo. Kliknięcie ustawi: wszyscy.");
      m.tri.set(tagId, "all");
      return;
    }
    if (cur === "all") { m.tri.set(tagId, "none"); return; }
    m.tri.set(tagId, "all");
    m.dirty.add(tagId);
  }

  function renderAssignList() {
    if (!el.assignList) return;

    const tags = (state.tags || []).slice().sort((a,b) => (Number(a.ord)||0)-(Number(b.ord)||0));

    el.assignList.innerHTML = tags.map((t) => {
      const tri = m.tri.get(t.id) || "none";
      const ui = triToUiState(tri);

      return `
        <label class="tags-row" data-tag-id="${t.id}" style="opacity:${editor ? "1":"0.75"}; cursor:${editor ? "pointer":"default"};">
          <input type="checkbox" data-tag-id="${t.id}" ${ui.checked ? "checked":""} ${editor ? "" : "disabled"} />
          <span class="tag-dot" style="background:${t.color || "#777"}"></span>
          <span class="m-p">#${String(t.name||"")}</span>
          ${tri === "some" ? `<span class="m-note">częściowo</span>` : `<span class="m-note" style="visibility:hidden;">.</span>`}
        </label>
      `;
    }).join("");

    // ustaw indeterminate + bind klik (dla editor)
    const boxes = Array.from(el.assignList.querySelectorAll('input[type="checkbox"][data-tag-id]'));
    for (const box of boxes) {
      const tid = box.dataset.tagId;
      const tri = m.tri.get(tid) || "none";
      box.indeterminate = (tri === "some");
      box.addEventListener("click", (e) => {
        // checkbox click sam zmienia stan — my go kontrolujemy, więc blokujemy domyślny
        e.preventDefault();
        e.stopPropagation();
        if (!editor) return;

        cycleTri(tid);
        renderAssignList();
      });
    }
  }

  function enterEditLayer(editMode, tagId) {
    m.edit.mode = editMode;
    m.edit.tagId = tagId || null;

    const current = (editMode === "edit" && tagId)
      ? (state.tags || []).find(t => t.id === tagId) || null
      : null;

    m.edit.name = String(current?.name || "");
    m.edit.color = String(current?.color || "#4da3ff");
    m.pickedColor = m.edit.color;

    if (el.editHelp) {
      el.editHelp.textContent = (editMode === "edit") ? "Zmień nazwę i kolor taga. Zmieni się wszędzie." : "Dodaj nowy tag.";
    }
    if (el.editName) el.editName.value = m.edit.name;
    if (el.editColorDot) el.editColorDot.style.background = m.edit.color;

    goLayer(2);
    el.editName?.focus?.();
  }


  async function saveAssignTriToDb() {
    if (!editor) return false;

    // target = pytania zaznaczone + pytania w poddrzewie folderów
    const qFromFolders = await expandFoldersToQuestionIds(cIds);
    const allQIds = uniqIds([...(qIds || []), ...(qFromFolders || [])]);

    if (!allQIds.length) {
      close(true);
      return true;
    }

    const dirtyTagIds = Array.from(m.dirty || []).filter(Boolean);
    if (!dirtyTagIds.length) {
      // nic nie zmienione
      close(true);
      return true;
    }

    // Pobierz istniejące linki dla (allQIds x dirtyTagIds)
    const { data: existing, error: e0 } = await sb()
      .from("qb_question_tags")
      .select("question_id,tag_id")
      .in("question_id", allQIds)
      .in("tag_id", dirtyTagIds);
    if (e0) throw e0;

    const have = new Set((existing || []).map(x => `${x.question_id}::${x.tag_id}`));

    // Zbuduj operacje per tag
    const inserts = [];
    const deletesByTag = []; // { tagId, qIdsToDelete }

    for (const tid of dirtyTagIds) {
      const tri = m.tri.get(tid) || "none";

      if (tri === "all") {
        for (const qid of allQIds) {
          const k = `${qid}::${tid}`;
          if (!have.has(k)) inserts.push({ question_id: qid, tag_id: tid });
        }
      }

      if (tri === "none") {
        deletesByTag.push({ tagId: tid, qIds: allQIds });
      }

      // tri === "some" (np. user kliknął “some” -> alert -> “all” i dirty),
      // jeśli jakimś cudem został "some", to nie robimy nic.
    }

    // DELETE (per tag) – prosty i czytelny
    for (const d of deletesByTag) {
      const { error } = await sb()
        .from("qb_question_tags")
        .delete()
        .in("question_id", d.qIds)
        .eq("tag_id", d.tagId);
      if (error) throw error;
    }

    // INSERT brakujących
    if (inserts.length) {
      const { error } = await sb()
        .from("qb_question_tags")
        .insert(inserts, { defaultToNull: false });
      if (error) throw error;
    }

    // unieważnij cache
    state._allQuestionTagMap = null;
    state._derivedCategoryTagMap = null;
    state._folderDescQIds = null;
    state._allCategoryTagMap = null;

    await refreshList(state);
    close(true);
    return true;
  }

  function normTagName(s) {
    return String(s || "")
      .trim()
      .replace(/^#/, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }
  
  function isDuplicateTagName(state, nameRaw, { allowId = null } = {}) {
    const wanted = normTagName(nameRaw);
    if (!wanted) return false;
  
    const tags = Array.isArray(state.tags) ? state.tags : [];
    return tags.some(t => {
      if (!t) return false;
      if (allowId && t.id === allowId) return false; // edycja: pozwól na własną nazwę
      return normTagName(t.name) === wanted;
    });
  }

  async function saveTagEditToDb() {
    if (!editor) return false;

    const nameRaw = String(el.editName?.value || "").trim().replace(/^#/, "").slice(0, 40);
    if (!nameRaw) { showErrBox(el.editErr, "Podaj nazwę."); return false; }
    
    // upewnij się, że mamy aktualną listę tagów
    if (!Array.isArray(state.tags)) await refreshTags(state);
    
    // blokada duplikatu (case-insensitive)
    const allowId = (m.edit.mode === "edit") ? (m.edit.tagId || null) : null;
    if (isDuplicateTagName(state, nameRaw, { allowId })) {
      showErrBox(el.editErr, "Taki tag już istnieje. Wybierz inną nazwę.");
      return false;
    }

    const color = String(m.pickedColor || m.edit.color || "#4da3ff").trim();

    if (m.edit.mode === "edit" && m.edit.tagId) {
      const { error } = await sb().from("qb_tags").update({ name: nameRaw, color }).eq("id", m.edit.tagId);
      if (error) throw error;
    } else {
      const { error } = await sb()
        .from("qb_tags")
        .insert({ base_id: state.baseId, name: nameRaw, color, ord: 9999 }, { defaultToNull: false });
      if (error) throw error;
    }

    await refreshTags(state);
    await refreshList(state);

    // po dodaniu/edycji: wróć do L1 i odśwież tri-state (NOWY tag ma start: "nikt")
    await initAssignTriState();
    renderAssignList();
    goLayer(1);
    return true;
  }

  // events
  function onBackdrop(e) {
    if (e.target?.dataset?.close === "1") stepBackOrClose();
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); stepBackOrClose(); }
  }
  function onClose() { stepBackOrClose(); }

  async function onAssignAdd() {
    enterEditLayer("create", null);
  }
  function onAssignCancel() { close(false); }
  async function onAssignSave() {
    try { hideErrBox(el.assignErr); await saveAssignTriToDb(); }
    catch (err) { console.error(err); showErrBox(el.assignErr, "Nie udało się zapisać tagów."); }
  }

  function onEditCancel() { goLayer(1); }
  async function onEditSave() {
    try { hideErrBox(el.editErr); await saveTagEditToDb(); }
    catch (err) { console.error(err); showErrBox(el.editErr, "Nie udało się zapisać taga."); }
  }
  function onEditColor() {
    showPickerLayer();
  }

  function clamp255(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(255, Math.round(n)));
  }
  
  function rgbToHex(r,g,b) {
    const to2 = (x) => x.toString(16).padStart(2, "0");
    return "#" + to2(clamp255(r)) + to2(clamp255(g)) + to2(clamp255(b));
  }
  
  function hexToRgb(hex) {
    const s = String(hex || "").trim();
    const m = s.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return null;
    const h = m[1];
    const r = parseInt(h.slice(0,2), 16);
    const g = parseInt(h.slice(2,4), 16);
    const b = parseInt(h.slice(4,6), 16);
    return { r, g, b };
  }
  
  function setPickerUI({ r, g, b }, { silent = false } = {}) {
    r = clamp255(r); g = clamp255(g); b = clamp255(b);
  
    if (el.colorR) el.colorR.value = String(r);
    if (el.colorG) el.colorG.value = String(g);
    if (el.colorB) el.colorB.value = String(b);
  
    if (el.colorRVal) el.colorRVal.textContent = String(r);
    if (el.colorGVal) el.colorGVal.textContent = String(g);
    if (el.colorBVal) el.colorBVal.textContent = String(b);
  
    const hex = rgbToHex(r,g,b);

    // ===== Control-like gradient tracks (CSS var --track) =====
    if (el.colorR) {
      const left = rgbToHex(0, g, b);
      const right = rgbToHex(255, g, b);
      el.colorR.style.setProperty("--track", `linear-gradient(to right, ${left}, ${right})`);
    }
    
    if (el.colorG) {
      const left = rgbToHex(r, 0, b);
      const right = rgbToHex(r, 255, b);
      el.colorG.style.setProperty("--track", `linear-gradient(to right, ${left}, ${right})`);
    }
    
    if (el.colorB) {
      const left = rgbToHex(r, g, 0);
      const right = rgbToHex(r, g, 255);
      el.colorB.style.setProperty("--track", `linear-gradient(to right, ${left}, ${right})`);
    }
    
    if (el.colorHex && !silent) el.colorHex.value = hex;
  
    if (el.colorPreview) el.colorPreview.style.background = hex;
  
    // klucz: w warstwie 3 zmiany lecą "na bieżąco" do warstwy 2
    m.pickedColor = hex;
    m.edit.color = hex;
    if (el.editColorDot) el.editColorDot.style.background = hex;
  }
  
  function initPickerFromColor(hex) {
    const rgb = hexToRgb(hex) || { r: 77, g: 163, b: 255 }; // fallback
    // silent: żeby nie walczyć z inputem w trakcie inicjalizacji
    setPickerUI(rgb, { silent: false });
  }
  
  function showPickerLayer() {
    // baza do "Anuluj"
    m.colorBase = String(m.pickedColor || m.edit.color || "#4da3ff");
  
    initPickerFromColor(m.colorBase);
    goLayer(3);
  }

  function onColorClose() { stepBackOrClose(); }

  function onColorCancel() {
    const rgb = hexToRgb(m.colorBase || m.edit.color || "#4da3ff");
    if (rgb) setPickerUI(rgb, { silent: false });
    goLayer(2);
  }
  
  function onColorDone() { goLayer(2); }
  
  function onSliderInput() {
    const r = clamp255(el.colorR?.value);
    const g = clamp255(el.colorG?.value);
    const b = clamp255(el.colorB?.value);
    setPickerUI({ r, g, b }, { silent: false });
  }
  
  function onHexInput() {
    const v = String(el.colorHex?.value || "").trim();
    const rgb = hexToRgb(v);
    if (!rgb) {
      // nie krzyczymy alertem przy każdym znaku; tylko podgląd zostaje ostatni poprawny
      return;
    }
    // silent: true => nie przepisuj hex w trakcie wpisu (tu akurat jest poprawny, ale zostawmy userowi kontrolę)
    setPickerUI(rgb, { silent: true });
  }

  // open
  el.modal.hidden = false;
  goLayer(1);
  hideErrBox(el.assignErr);
  hideErrBox(el.editErr);

  el.modal.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onKey);
  el.close?.addEventListener("click", onClose);

  el.assignAddBtn?.addEventListener("click", onAssignAdd);
  el.assignCancel?.addEventListener("click", onAssignCancel);
  el.assignSave?.addEventListener("click", onAssignSave);

  el.editCancel?.addEventListener("click", onEditCancel);
  el.editSave?.addEventListener("click", onEditSave);
  el.editColorBtn?.addEventListener("click", onEditColor);

  el.colorClose?.addEventListener("click", onColorClose);
  el.colorCancel?.addEventListener("click", onColorCancel);
  el.colorDone?.addEventListener("click", onColorDone);
  
  el.colorR?.addEventListener("input", onSliderInput);
  el.colorG?.addEventListener("input", onSliderInput);
  el.colorB?.addEventListener("input", onSliderInput);
  el.colorHex?.addEventListener("input", onHexInput);

  // init L1
  renderAssignInfo();
  await initAssignTriState();
  renderAssignList();

  // wejścia skrótowe:
  if (mode === "create") enterEditLayer("create", null);
  if (mode === "edit") enterEditLayer("edit", editTagId);

  // promise
  let resolvePromise = null;
  return await new Promise((resolve) => { resolvePromise = resolve; });
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

function tagsModalEls() {
  const modal = document.getElementById("tagsModal");
  if (!modal) return null;

  const el = {
    modal,
    close: document.getElementById("tagsModalClose"),
    // layers
    L1: document.getElementById("tagsLayerAssign"),
    L2: document.getElementById("tagsLayerEdit"),
    L3: document.getElementById("tagsLayerColor"),

    // L1 assign
    assignInfo: document.getElementById("tagsAssignInfo"),
    assignList: document.getElementById("tagsAssignList"),
    assignErr: document.getElementById("tagsAssignErr"),
    assignAddBtn: document.getElementById("tagsAssignAddBtn"),
    assignCancel: document.getElementById("tagsAssignCancel"),
    assignSave: document.getElementById("tagsAssignSave"),

    // L2 edit
    editHelp: document.getElementById("tagsEditHelp"),
    editName: document.getElementById("tagsEditName"),
    editColorBtn: document.getElementById("tagsEditColorBtn"),
    editColorDot: document.getElementById("tagsEditColorDot"),
    editErr: document.getElementById("tagsEditErr"),
    editCancel: document.getElementById("tagsEditCancel"),
    editSave: document.getElementById("tagsEditSave"),
    
    // L3 color (RGB/HEX)
    colorTitle: document.getElementById("tagsColorTitle"),
    colorClose: document.getElementById("tagsColorClose"),
    colorPreview: document.getElementById("tagsColorPreview"),
    colorHex: document.getElementById("tagsColorHex"),
    colorR: document.getElementById("tagsColorR"),
    colorG: document.getElementById("tagsColorG"),
    colorB: document.getElementById("tagsColorB"),
    colorRVal: document.getElementById("tagsColorRVal"),
    colorGVal: document.getElementById("tagsColorGVal"),
    colorBVal: document.getElementById("tagsColorBVal"),
    colorDone: document.getElementById("tagsColorDone"),
    colorCancel: document.getElementById("tagsColorCancel"),
  };
  return el;
}

function showLayer(el, which) {
  el.L1.hidden = which !== 1;
  el.L2.hidden = which !== 2;
  el.L3.hidden = which !== 3;
}

function hideErrBox(box) { if (box) { box.hidden = true; box.textContent = ""; } }
function showErrBox(box, msg) { if (box) { box.hidden = false; box.textContent = String(msg || ""); } }

/* ================= Wire ================= */
export function wireActions({ state }) {
  const treeEl = document.getElementById("tree");
  const listEl = document.getElementById("list");
  const tagsEl = document.getElementById("tags");
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

  function tagOrder(state) {
    return (state.tags || []).slice().sort((a,b) => (Number(a.ord)||0) - (Number(b.ord)||0));
  }
  
  function tagSelectSingle(state, tagId) {
    if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
    state.tagSelection.ids.clear();
    if (tagId) state.tagSelection.ids.add(tagId);
    state.tagSelection.anchorId = tagId || null;
  }
  
  function tagToggle(state, tagId) {
    if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
    if (!tagId) return;
  
    if (state.tagSelection.ids.has(tagId)) state.tagSelection.ids.delete(tagId);
    else state.tagSelection.ids.add(tagId);
  
    state.tagSelection.anchorId = tagId;
  }
  
  function tagSelectRange(state, clickedId) {
    if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
  
    const ordered = tagOrder(state).map(t => t.id);
    if (!ordered.length) return;
  
    const a = state.tagSelection.anchorId;
    if (!a || ordered.indexOf(a) === -1) {
      tagSelectSingle(state, clickedId);
      return;
    }
  
    const i1 = ordered.indexOf(a);
    const i2 = ordered.indexOf(clickedId);
    if (i1 === -1 || i2 === -1) {
      tagSelectSingle(state, clickedId);
      return;
    }
  
    const [from, to] = i1 < i2 ? [i1, i2] : [i2, i1];
    state.tagSelection.ids.clear();
    for (let i = from; i <= to; i++) state.tagSelection.ids.add(ordered[i]);
    state.tagSelection.anchorId = clickedId;
  }
  
  function tagSelectionToIds(state) {
    const ids = Array.from(state?.tagSelection?.ids || []);
    return ids.filter(Boolean);
  }

  async function applyTagSelectionView(state) {
    const ids = tagSelectionToIds(state);
  
    // brak zaznaczenia => wyjście z VIEW.TAG i powrót do ostatniego folderu/root
    if (!ids.length) {
      if (state.view === VIEW.TAG) {
        restoreBrowseLocation(state);
      }
      state.tagIds = [];
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    // jest zaznaczenie => wejdź/odśwież VIEW.TAG (OR)
    if (state.view !== VIEW.TAG) rememberBrowseLocation(state);
    state.view = VIEW.TAG;
    state.tagIds = ids;
  
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
  
    const raw = String(t.value || "");
  
    const parsed = parseSearchInputToTokens(raw);
    
    // tylko tagi które istnieją
    const existingNames = filterExistingTagNames(state, parsed.tagNames);
    const resolvedIds = resolveTagIdsByNames(state, existingNames);
    
    // tekst: usuń z raw TYLKO istniejące tagi (a nie wszystkie match’e)
    let nextText = raw;
    for (const name of existingNames) {
      const re = new RegExp(`#${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|,|$)`, "gi");
      nextText = nextText.replace(re, " ");
    }
    nextText = nextText.replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
    
    // przepisuj input tylko jeśli coś realnie wyczyściliśmy (czyli jeśli istniejące tagi były w raw)
    if (existingNames.length && t.value !== nextText) {
      t.value = nextText;
      try { t.setSelectionRange(nextText.length, nextText.length); } catch {}
    }
    
    const prevIds = Array.isArray(state.searchTokens?.tagIds) ? state.searchTokens.tagIds : [];
    const mergedIds = Array.from(new Set(prevIds.concat(resolvedIds)));
  
    state.searchTokens = { text: nextText, tagIds: mergedIds };
  
    // jeśli wszystko puste: wyjście z SEARCH i powrót do ostatniego folderu/root
    const isEmpty = (!nextText.trim() && !mergedIds.length);
    if (isEmpty) {
      if (state.view === VIEW.SEARCH) restoreBrowseLocation(state);
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    // jeśli zaczynamy pisać i nie jesteśmy w SEARCH: zapamiętaj skąd przyszliśmy
    if (state.view !== VIEW.SEARCH) {
      rememberBrowseLocation(state);
      setViewSearch(state, ""); // query trzymamy w tokens
      selectionClear(state);
      await refreshList(state);
      return;
    }
  
    await refreshList(state);
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
    // 0) klik w "Dodaj tag"
    const btn = e.target?.closest?.("#btnAddTag");
    if (btn) {
      if (!canWrite(state)) return;
      const saved = await openTagsModal(state, { mode: "create" });
      if (saved) {
        await refreshTags(state);
        renderAll(state);
      }
      return;
    }
  
    // 1) klik w tag-row = selekcja (ctrl/shift)
    const row = e.target?.closest?.('.row[data-kind="tag"][data-id]');
    if (!row) {
      tagSelectionClear(state);
      await applyTagSelectionView(state);
    }
  
    const tagId = row.dataset.id;
    if (!tagId) return;
  
    const isCtrl = isMultiSelectModifier(e);
    const isShift = e.shiftKey;
  
    if (isShift) tagSelectRange(state, tagId);
    else if (isCtrl) tagToggle(state, tagId);
    else tagSelectSingle(state, tagId);

    await applyTagSelectionView(state);
    return;
  });

  // PPM na tagach (tag + puste tło)
  tagsEl?.addEventListener("contextmenu", async (e) => {
    e.preventDefault();

    const row = e.target?.closest?.('.row[data-kind="tag"][data-id]');
    if (row) {
      const id = row.dataset.id;
      await showContextMenu({ state, x: e.clientX, y: e.clientY, target: { kind: "tag", id } });
      return;
    }

    // puste tło tags
    await showContextMenu({ state, x: e.clientX, y: e.clientY, target: { kind: "tags-bg", id: null } });
  });

  function canTagDnD() {
    // Tagowanie to mutacja, ale Etap G mówi: blokujemy tylko SEARCH.
    return canWrite(state) && state.view !== VIEW.SEARCH;
  }
  
  function clearTagDropPreview() {
    const rows = Array.from(tagsEl?.querySelectorAll?.('.row[data-kind="tag"].is-drop-target') || []);
    for (const r of rows) r.classList.remove("is-drop-target");
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
    if (!canDnD()) return;

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

  document.addEventListener("mouseup", async () => {
    if (!tagsMarquee) return;
    tagsMarquee.remove();
    tagsMarquee = null;
    tagsMarqueeStart = null;
    tagsMarqueeAdd = false;
    tagsMarqueeBase = null;
  
    await applyTagSelectionView(state);
  });

    /* ================= Marquee: TAGS ================= */
  let tagsMarquee = null;
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
    const rows = Array.from(tagsEl.querySelectorAll('.row[data-kind="tag"][data-id]'));
    const hit = new Set();

    for (const row of rows) {
      const id = row.dataset.id;
      if (!id) continue;
      const r = rowRectInTags(row);
      if (intersects(box, r)) hit.add(id);
    }

    if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };

    const out = tagsMarqueeAdd && tagsMarqueeBase ? new Set(tagsMarqueeBase) : new Set();
    for (const id of hit) out.add(id);

    state.tagSelection.ids = out;
    state.tagSelection.anchorId = null;

    for (const row of rows) {
      const id = row.dataset.id;
      row.classList.toggle("is-selected", out.has(id));
    }
  }

  // TAGS musi być pozycjonowany dla marquee
  if (tagsEl && getComputedStyle(tagsEl).position === "static") {
    tagsEl.style.position = "relative";
  }

  tagsEl?.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;

    // klik w "Dodaj tag" nie startuje marquee
    if (e.target?.closest?.("#btnAddTag")) return;

    const onRow = e.target?.closest?.('.row[data-kind="tag"][data-id]');
    if (onRow) return;

    const interactive = e.target?.closest?.('button,a,input,textarea,select,label');
    if (interactive) return;

    tagsMarqueeStart = tagsLocalPoint(e);

    tagsMarqueeAdd = isMultiSelectModifier(e);
    if (!state.tagSelection) state.tagSelection = { ids: new Set(), anchorId: null };
    tagsMarqueeBase = tagsMarqueeAdd ? new Set(state.tagSelection.ids) : null;

    if (!tagsMarqueeAdd) {
      state.tagSelection.ids.clear();
      state.tagSelection.anchorId = null;
      // zdejmij klasy szybko
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

  document.addEventListener("mouseup", () => {
    if (!tagsMarquee) return;
    tagsMarquee.remove();
    tagsMarquee = null;
    tagsMarqueeStart = null;
    tagsMarqueeAdd = false;
    tagsMarqueeBase = null;

    renderAll(state);
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
    
    openAssignTagsModal: () => openTagsModal(state, { mode: "assign" }),
    
    openTagModal: async (opts) => {
      const mode = (opts && opts.mode) || "create";
      const tagId = (opts && opts.tagId) || null;
      return await openTagsModal(state, { mode, tagId });
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
        await openTagsModal(state, { mode: "assign" });
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
