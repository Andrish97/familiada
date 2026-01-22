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

function selectionSplitIds(state) {
  const keys = Array.from(state?.selection?.keys || []);
  const qIds = keys.filter(k => k.startsWith("q:")).map(k => k.slice(2));
  const cIds = keys.filter(k => k.startsWith("c:")).map(k => k.slice(2));
  return { qIds, cIds };
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

      // + foldery otagowane bezpośrednio (qb_category_tags)
      if (!state._allCategoryTagMap) {
        const cIdsAll = foldersAll.map(c => c.id).filter(Boolean);
        const linksC = await listCategoryTags(cIdsAll);
        const mC = new Map();
        for (const l of (linksC || [])) {
          if (!mC.has(l.category_id)) mC.set(l.category_id, new Set());
          mC.get(l.category_id).add(l.tag_id);
        }
        state._allCategoryTagMap = mC;
      }

      const mC = state._allCategoryTagMap;
      for (const c of foldersAll) {
        const set = mC.get(c.id);
        if (!set) continue;
        for (const tid of tagIds) {
          if (set.has(tid)) {
            add.add(c.id);

            // dodaj rodziców też (żeby ścieżka była widoczna)
            let cur = byId.get(c.id);
            let guard2 = 0;
            while (cur && guard2++ < 20) {
              const pid = cur.parent_id || null;
              if (!pid) break;
              add.add(pid);
              cur = byId.get(pid);
            }

            break;
          }
        }
      }
    }

    // 2) filtr tekstowy na pytania (AND z tagami)
    qs = applySearchFilterToQuestions(qs, textQ);

    // 3) foldery:
    // - jeśli jest tekst: foldery po nazwie
    // - jeśli są tagi: foldery, które zawierają wyniki (category_id) + ich rodzice (żeby “dało się wejść”)
    let fs = applySearchFilterToFolders(foldersAll, textQ);

    if (tagIds.length) {
      const byId = new Map(foldersAll.map(c => [c.id, c]));
      const add = new Set();

      // foldery bezpośrednie wyników
      for (const q of (qs || [])) {
        const cid = q.category_id || null;
        if (!cid) continue;
        add.add(cid);

        // dodaj rodziców (breadcrumb w lewym panelu ma sens)
        let cur = byId.get(cid);
        let guard = 0;
        while (cur && guard++ < 20) {
          const pid = cur.parent_id || null;
          if (!pid) break;
          add.add(pid);
          cur = byId.get(pid);
        }
      }

      const extra = foldersAll.filter(c => add.has(c.id));
      // merge uniq
      const merged = new Map();
      for (const c of fs) merged.set(c.id, c);
      for (const c of extra) merged.set(c.id, c);
      fs = Array.from(merged.values());
    }

    state.folders = fs;
    state.questions = qs;

    renderAll(state);

    const writable = canWrite(state);
    document.getElementById("btnNewFolder")?.toggleAttribute("disabled", !writable);
    document.getElementById("btnNewQuestion")?.toggleAttribute("disabled", !writable);
    return;
  }

    // === TAG: „wirtualny widok wyników” po CAŁOŚCI (jak SEARCH, tylko filtr tagów) ===
  if (state.view === VIEW.TAG) {
    if (!state._allQuestions) {
      state._allQuestions = await listAllQuestions(state.baseId);
    }

    const qAll = state._allQuestions;
    const foldersAll = Array.isArray(state.categories) ? state.categories : [];

    // TODO: na etapie tagów dopniemy dokładny model danych.
    // Na razie robimy filtr odporny na różne pola (payload.tags / tag_ids / tags).
    const wanted = new Set((state.tagIds || []).filter(Boolean));

    const qHasAnyTag = (q) => {
      const p = q?.payload && typeof q.payload === "object" ? q.payload : {};
      const a =
        Array.isArray(p.tags) ? p.tags :
        Array.isArray(q?.tags) ? q.tags :
        Array.isArray(q?.tag_ids) ? q.tag_ids :
        [];
      for (const id of a) if (wanted.has(id)) return true;
      return false;
    };

    // Foldery w TAG: na tym etapie najprościej pokazujemy WSZYSTKIE foldery,
    // a dopiero w etapie tagów dopniemy “foldery, które mają dopasowane pytania”
    // (da się zrobić, ale wymaga ustalenia modelu tagowania).
    state.folders = foldersAll;

    // Pytania: globalnie po tagach
    state.questions = qAll.filter(qHasAnyTag);

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
  
  // filtr wyszukiwania stosujemy tylko do pytań (na razie)
  state.questions = applySearchFilterToQuestions(allQ, state.searchQuery);
  
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

async function openTagModal(state, { mode = "create", tagId = null } = {}) {
  const modal = document.getElementById("tagModal");
  if (!modal) return false;

  const titleEl = document.getElementById("tagModalTitle");
  const nameInp = document.getElementById("tagNameInp");
  const colorInp = document.getElementById("tagColorInp");
  const errEl = document.getElementById("tagModalErr");

  const btnClose = document.getElementById("tagModalClose");
  const btnCancel = document.getElementById("tagModalCancel");
  const btnSave = document.getElementById("tagModalSave");

  const hideErr = () => { if (errEl) { errEl.hidden = true; errEl.textContent = ""; } };
  const showErr = (msg) => { if (errEl) { errEl.hidden = false; errEl.textContent = String(msg || ""); } };

  // init
  hideErr();
  let current = null;
  if (mode === "edit" && tagId) {
    current = (state.tags || []).find(t => t.id === tagId) || null;
  }

  if (titleEl) titleEl.textContent = (mode === "edit") ? "Edytuj tag" : "Dodaj tag";
  if (nameInp) nameInp.value = (current?.name || "");
  if (colorInp) colorInp.value = (current?.color || "#4da3ff");

  // open
  modal.hidden = false;
  nameInp?.focus?.();

  // promise/cleanup
  return await new Promise((resolve) => {
    const cleanup = () => {
      modal.hidden = true;
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      btnClose?.removeEventListener("click", onCancel);
      btnCancel?.removeEventListener("click", onCancel);
      btnSave?.removeEventListener("click", onSave);
      resolve(false);
    };

    const closeOk = () => {
      modal.hidden = true;
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      btnClose?.removeEventListener("click", onCancel);
      btnCancel?.removeEventListener("click", onCancel);
      btnSave?.removeEventListener("click", onSave);
      resolve(true);
    };

    const onBackdrop = (e) => {
      if (e.target?.dataset?.close === "1") cleanup();
    };

    const onKey = (e) => {
      if (e.key === "Escape") cleanup();
      if (e.key === "Enter") onSave();
    };

    const onCancel = () => cleanup();

    const onSave = async () => {
      try {
        hideErr();

        const name = String(nameInp?.value || "").trim().replace(/^#/, "").slice(0, 40);
        const color = String(colorInp?.value || "#4da3ff").trim();

        if (!name) { showErr("Podaj nazwę."); return; }

        if (mode === "edit" && tagId) {
          const { error } = await sb()
            .from("qb_tags")
            .update({ name, color })
            .eq("id", tagId);
          if (error) throw error;
        } else {
          const { error } = await sb()
            .from("qb_tags")
            .insert({ base_id: state.baseId, name, color, ord: 9999 }, { defaultToNull: false });
          if (error) throw error;
        }

        // odśwież tagi (żeby chipsy/kolory działały)
        await refreshTags(state);

        closeOk();
      } catch (err) {
        console.error(err);
        showErr("Nie udało się zapisać taga.");
      }
    };

    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    btnClose?.addEventListener("click", onCancel);
    btnCancel?.addEventListener("click", onCancel);
    btnSave?.addEventListener("click", onSave);
  });
}

async function openAssignTagsModal(state) {
  const { qIds, cIds } = selectionSplitIds(state);
  if (!qIds.length && !cIds.length) {
    alert("Zaznacz foldery lub pytania.");
    return false;
  }

  const modal = document.getElementById("assignTagsModal");
  if (!modal) return false;

  const titleEl = document.getElementById("assignTagsTitle");
  const infoEl = document.getElementById("assignTagsInfo");
  const listEl = document.getElementById("assignTagsList");
  const errEl = document.getElementById("assignTagsErr");

  const btnClose = document.getElementById("assignTagsClose");
  const btnCancel = document.getElementById("assignTagsCancel");
  const btnSave = document.getElementById("assignTagsSave");

  const hideErr = () => { if (errEl) { errEl.hidden = true; errEl.textContent = ""; } };
  const showErr = (msg) => { if (errEl) { errEl.hidden = false; errEl.textContent = String(msg || ""); } };

  hideErr();

  const editor = canWrite(state);
  if (titleEl) titleEl.textContent = "Przypisz tagi";
  if (infoEl) {
    const parts = [];
    if (qIds.length) parts.push(`${qIds.length} pyt.`);
    if (cIds.length) parts.push(`${cIds.length} folder(ów)`);
    infoEl.textContent = `Zaznaczenie: ${parts.join(" + ")}.`;
  }

  // upewnij się, że tagi są załadowane
  if (!Array.isArray(state.tags) || !state.tags.length) {
    // minimalny fetch (jak w refreshTags)
    const { data, error } = await sb()
      .from("qb_tags")
      .select("id,base_id,name,color,ord")
      .eq("base_id", state.baseId)
      .order("ord", { ascending: true });
    if (error) throw error;
    state.tags = data || [];
  }

  // pobierz aktualne tagi zaznaczenia:
  // strategia: pokazujemy checkboxy jako:
  // - checked, jeśli WSZYSTKIE elementy zaznaczenia mają ten tag
  // - indeterminate, jeśli TYLKO część ma
  // (to jest “profesjonalne” zachowanie)
  const tagIdsAll = (state.tags || []).map(t => t.id);

  // mapy: element -> set(tag_id)
  const qMap = new Map();
  const cMap = new Map();

  if (qIds.length) {
    const links = await listQuestionTags(qIds);
    for (const l of (links || [])) {
      if (!qMap.has(l.question_id)) qMap.set(l.question_id, new Set());
      qMap.get(l.question_id).add(l.tag_id);
    }
  }

  if (cIds.length) {
    const links = await listCategoryTags(cIds);
    // UWAGA: jeśli wolisz bez dynamic import, dodaj listCategoryTags do importów na górze actions.js
    for (const l of (links || [])) {
      if (!cMap.has(l.category_id)) cMap.set(l.category_id, new Set());
      cMap.get(l.category_id).add(l.tag_id);
    }
  }

  function countHasTagInSet(map, ids, tagId) {
    let has = 0;
    for (const id of ids) {
      const set = map.get(id);
      if (set && set.has(tagId)) has++;
    }
    return has;
  }

  // render checklist
  if (listEl) {
    listEl.innerHTML = (state.tags || [])
      .slice()
      .sort((a,b) => (Number(a.ord)||0)-(Number(b.ord)||0))
      .map((t) => {
        const color = t.color || "#777";
        const name = String(t.name || "");
        const id = t.id;

        const qHas = qIds.length ? countHasTagInSet(qMap, qIds, id) : 0;
        const cHas = cIds.length ? countHasTagInSet(cMap, cIds, id) : 0;

        const total = (qIds.length + cIds.length);
        const hasTotal = qHas + cHas;

        const checked = total > 0 && hasTotal === total;
        const ind = total > 0 && hasTotal > 0 && hasTotal < total;

        return `
          <label class="cm-tag-row" style="display:flex; align-items:center; gap:10px; cursor:${editor ? "pointer":"default"}; opacity:${editor ? "1":"0.75"};">
            <input type="checkbox" data-tag-id="${id}" ${checked ? "checked":""} ${editor ? "" : "disabled"} />
            <span class="tag-dot" style="background:${color}"></span>
            <span class="m-p">#${name}</span>
            ${ind ? `<span class="m-note" style="margin-left:auto;">częściowo</span>` : `<span style="margin-left:auto;"></span>`}
          </label>
        `;
      }).join("");

    // ustaw indeterminate po renderze
    const boxes = Array.from(listEl.querySelectorAll('input[type="checkbox"][data-tag-id]'));
    for (const box of boxes) {
      const tid = box.dataset.tagId;
      const qHas = qIds.length ? countHasTagInSet(qMap, qIds, tid) : 0;
      const cHas = cIds.length ? countHasTagInSet(cMap, cIds, tid) : 0;
      const total = qIds.length + cIds.length;
      const hasTotal = qHas + cHas;
      box.indeterminate = (total > 0 && hasTotal > 0 && hasTotal < total);
    }
  }

  modal.hidden = false;

  return await new Promise((resolve) => {
    const cleanup = () => {
      modal.hidden = true;
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      btnClose?.removeEventListener("click", onCancel);
      btnCancel?.removeEventListener("click", onCancel);
      btnSave?.removeEventListener("click", onSave);
      resolve(false);
    };

    const closeOk = () => {
      modal.hidden = true;
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      btnClose?.removeEventListener("click", onCancel);
      btnCancel?.removeEventListener("click", onCancel);
      btnSave?.removeEventListener("click", onSave);
      resolve(true);
    };

    const onBackdrop = (e) => {
      if (e.target?.dataset?.close === "1") cleanup();
    };

    const onKey = (e) => {
      if (e.key === "Escape") cleanup();
      if (e.key === "Enter") onSave();
    };

    const onCancel = () => cleanup();

    const onSave = async () => {
      try {
        hideErr();
        if (!canWrite(state)) { cleanup(); return; }

        const boxes = Array.from(listEl.querySelectorAll('input[type="checkbox"][data-tag-id]'));
        const picked = boxes.filter(b => b.checked).map(b => b.dataset.tagId).filter(Boolean);

        // Najprościej i stabilnie:
        // 1) usuń wszystkie linki tagów dla zaznaczenia
        // 2) wstaw nowe dla "picked"

        if (qIds.length) {
          const { error: d1 } = await sb()
            .from("qb_question_tags")
            .delete()
            .in("question_id", qIds);
          if (d1) throw d1;

          if (picked.length) {
            const rows = [];
            for (const qid of qIds) for (const tid of picked) rows.push({ question_id: qid, tag_id: tid });
            const { error: i1 } = await sb().from("qb_question_tags").insert(rows, { defaultToNull: false });
            if (i1) throw i1;
          }
        }

        if (cIds.length) {
          const { error: d2 } = await sb()
            .from("qb_category_tags")
            .delete()
            .in("category_id", cIds);
          if (d2) throw d2;

          if (picked.length) {
            const rows = [];
            for (const cid of cIds) for (const tid of picked) rows.push({ category_id: cid, tag_id: tid });
            const { error: i2 } = await sb().from("qb_category_tags").insert(rows, { defaultToNull: false });
            if (i2) throw i2;
          }
        }

        // Po zmianie tagów: wywal cache map tagów, bo SEARCH/TAG ich używa
        state._allQuestionTagMap = null;
        state._allCategoryTagMap = null;

        await refreshList(state);
        closeOk();
      } catch (err) {
        console.error(err);
        showErr("Nie udało się zapisać tagów.");
      }
    };

    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    btnClose?.addEventListener("click", onCancel);
    btnCancel?.addEventListener("click", onCancel);
    btnSave?.addEventListener("click", onSave);
  });
}

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

  toolbarEl?.addEventListener("input", async (e) => {
    const t = e.target;
    if (!t || t.id !== "searchInp") return;

    const raw = String(t.value || "");
    state.searchRaw = raw;
    const { text, tagNames } = parseSearchInputToTokens(raw);
    const tagIds = resolveTagIdsByNames(state, tagNames);

    // ustaw tokeny (to też zaktualizuje state.searchQuery "ładnie")
    state.searchTokens = { text, tagNames, tagIds };

    // jeśli wszystko puste: wyjście z SEARCH i powrót do ostatniego folderu/root
    const isEmpty = (!text.trim() && !(tagNames && tagNames.length));
    if (isEmpty) {
      if (state.view === VIEW.SEARCH) {
        restoreBrowseLocation(state);
        selectionClear(state);
        await refreshList(state);
      } else {
        await refreshList(state);
      }
      return;
    }

    // jeśli zaczynamy pisać i nie jesteśmy w SEARCH: zapamiętaj skąd przyszliśmy
    if (state.view !== VIEW.SEARCH) {
      rememberBrowseLocation(state);
      setViewSearch(state, ""); // query trzymamy w tokens, nie w view
      selectionClear(state);
      await refreshList(state);
      return;
    }

    // już w SEARCH: odśwież wyniki
    await refreshList(state);
  });

  toolbarEl?.addEventListener("click", async (e) => {
    const t = e.target;
    if (!t) return;
  
    try {

      if (t.id === "btnNewFolder" || t.id === "btnNewQuestion") {
        if (!canMutateHere(state)) return;
      }

      if (t.id === "searchClearBtn") {
        const inp = document.getElementById("searchInp");
        if (inp) inp.value = "";
        state.searchTokens = { text: "", tagNames: [], tagIds: [] };
        state.searchQuery = "";
        state.searchRaw = "";

        if (state.view === VIEW.SEARCH) restoreBrowseLocation(state);
        selectionClear(state);
        await refreshList(state);

        document.getElementById("searchInp")?.focus();
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

  // --- Tagi: klik = zaznacz (ctrl/shift), dblclick = otwórz VIEW.TAG ---
  tagsEl?.addEventListener("click", (e) => {
    const row = e.target?.closest?.('.row[data-kind="tag"][data-id]');
    if (!row) return;

    const tagId = row.dataset.id;
    if (!tagId) return;

    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    if (isShift) tagSelectRange(state, tagId);
    else if (isCtrl) tagToggle(state, tagId);
    else tagSelectSingle(state, tagId);

    // tylko odśwież lewy panel / całość (łatwo i stabilnie)
    renderAll(state);
  });

  tagsEl?.addEventListener("dblclick", async (e) => {
    const row = e.target?.closest?.('.row[data-kind="tag"][data-id]');
    if (!row) return;

    // Otwieramy widok na podstawie aktualnej selekcji (multi)
    const ids = tagSelectionToIds(state);
    if (!ids.length) return;

    rememberBrowseLocation(state);
    state.tagIds = ids;          // multi-tag
    state.view = VIEW.TAG;

    selectionClear(state);
    await refreshList(state);
  });

  tagsEl?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("#btnAddTag");
    if (!btn) return;

    if (!canWrite(state)) return;

    // modal (poniżej) – otwieramy jako "create"
    const saved = await openTagModal(state, { mode: "create" });
    if (saved) {
      // odśwież tagi w state + rerender
      await refreshTags(state);
      renderAll(state);
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
      renderAll(state);
      return;
    }
  
    if (kind !== "cat" || !id) return;
  
    const key = `c:${id}`;
    const isCtrl = e.ctrlKey || e.metaKey;
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
  
    const isCopy = e.ctrlKey || e.metaKey;
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
      const moveMode = (e.ctrlKey || e.metaKey) ? "copy" : "move";
  
      // COPY: zostawiamy stare zachowanie (kopiowanie folderów już masz)
      if (moveMode === "copy") {
        await moveItemsTo(state, targetId, { mode: "copy" }); // targetId null => root
        return;
      }
  
      // MOVE:
      // - jeśli drop na tło => normalny move do root
      if (modeKey === "root" || !targetId) {
        await moveItemsTo(state, null, { mode: "move" });
        return;
      }
  
      // - jeśli drop "into" => move do środka folderu (parent = targetId)
      if (modeKey === "into") {
        await moveItemsTo(state, targetId, { mode: "move" });
        return;
      }
  
      // - jeśli drop before/after => reorder w rodzeństwie targetu (z ewentualnym przeniesieniem parenta)
      if (cIds.length) {
        await reorderFoldersByDrop(state, cIds, targetId, modeKey); // before/after
        return;
      }
  
      // jeśli user przeciąga same pytania na drzewo “między” — traktujemy jak “do folderu”
      await moveItemsTo(state, targetId, { mode: "move" });
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
  
    const isCopy = e.ctrlKey || e.metaKey;
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
      const mode = (e.ctrlKey || e.metaKey) ? "copy" : "move";
      await moveItemsTo(state, targetFolderId, { mode });
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
    
    marqueeAdd = e.ctrlKey || e.metaKey;
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
    openAssignTagsModal: () => openAssignTagsModal(state),
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
        await openAssignTagsModal(state);
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
