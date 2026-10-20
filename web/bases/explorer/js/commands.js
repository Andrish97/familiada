// base-explorerjs/commands.js
// Polecenia menedżera bazy: wszystkie operacje na danych w jednym miejscu.
// Zapis idzie przez ops.js (jedna funkcja SQL = jedna transakcja), blokady
// zasobów przez resource-lock.js, a po każdej zmianie jedno odświeżenie:
// przeładowanie magazynu (data/store.js) i narysowanie strony.
// Rejestr akcji (actions/registry.js) woła te funkcje; dostępność sprawdza
// rejestr, tu zostają tylko warunki ochronne.

import * as ops from "./ops.js?v=v2026-10-20T19584";
import { reload } from "./data/store.js?v=v2026-10-20T19584";
import { getQuestion } from "./repo.js?v=v2026-10-20T19584";
import {
  goTo, currentFolderId, isTrash, selectionClear, setQuery,
} from "./state.js?v=v2026-10-20T19584";
import { renderAll } from "./render.js?v=v2026-10-20T19584";
import { openRenameModal } from "./ui/rename-modal.js?v=v2026-10-20T19584";
import { openTagsModal } from "./tags-modal.js?v=v2026-10-20T19584";
import { initQuestionModal } from "./question-modal.js?v=v2026-10-20T19584";
import { initExportModal } from "./export-modal.js?v=v2026-10-20T19584";
import { importGame } from "../../../games/js/games-import-export.js?v=v2026-10-20T19584";
import { normQuestionText, LIMITS } from "../../../shared/js/core/question-form.js?v=v2026-10-20T19584";
import { acquireResourceLock, acquireResourceLocks } from "../../../shared/js/core/resource-lock.js?v=v2026-10-20T19584";
import { alertModal, confirmModal } from "../../../shared/js/core/modal.js?v=v2026-10-20T19584";
import { t } from "../../../shared/translation/translation.js?v=v2026-10-20T19584";
import { linkTo } from "../../../shared/js/core/nav-map.js?v=v2026-10-20T19584";

/* ================= Wspólne ================= */

// Po każdej zmianie danych: przeładuj magazyn i narysuj.
export async function refresh(state) {
  if (await reload(state)) renderAll(state);
}

// Klucze "c:<id>" / "q:<id>" → id folderów i pytań (inne klucze pomijane).
export function splitKeys(keys) {
  const folderIds = [];
  const questionIds = [];
  for (const k of keys || []) {
    if (typeof k !== "string") continue;
    if (k.startsWith("c:")) folderIds.push(k.slice(2));
    else if (k.startsWith("q:")) questionIds.push(k.slice(2));
  }
  return { folderIds: [...new Set(folderIds)], questionIds: [...new Set(questionIds)] };
}

function trashIdsOf(keys) {
  return [...keys].filter((k) => typeof k === "string" && k.startsWith("t:")).map((k) => k.slice(2));
}

function lockRefused(lease) {
  void alertModal({ text: lease?.error === "gone" ? t("resourceLock.goneMessage") : t("resourceLock.baseItemMessage") });
  return false;
}

// Znany błąd ops.js (element zniknął, brak uprawnień, cykl…) → komunikat
// i false; nieznany leci dalej do komunikatu akcji (actions/run.js).
function opFailed(e) {
  if (!e?.userMessage) throw e;
  void alertModal({ text: e.userMessage });
  return false;
}

// Blokada całego poddrzewa folderów (foldery + pytania w nich) i pytań:
// równoległa edycja dowolnego elementu w środku trafia na ten sam klucz
// blokady (edit_locks) bez chodzenia po przodkach.
function locksFor(state, { folderIds = [], questionIds = [] }, extra = []) {
  const d = state.d;
  const folders = new Set(folderIds);
  for (const fid of folderIds) for (const id of d.descendantFolderIds(fid)) folders.add(id);
  const questions = new Set(questionIds);
  for (const fid of folderIds) for (const id of d.subtreeQuestionIds(fid)) questions.add(id);
  return [
    ...[...questions].map((resourceId) => ({ resourceType: "base_question", resourceId })),
    ...[...folders].map((resourceId) => ({ resourceType: "base_folder", resourceId })),
    ...extra,
  ];
}

async function withLocks(resources, context, fn) {
  const lease = resources.length ? await acquireResourceLocks(resources, { context }) : { ok: true, release() {} };
  if (!lease?.ok) return lockRefused(lease);
  try {
    return await fn();
  } catch (e) {
    return opFailed(e);
  } finally {
    lease.release();
  }
}

// Pytania zaznaczenia z folderami rozwiniętymi do całych poddrzew.
export function selectionQuestionIds(state) {
  const { folderIds, questionIds } = splitKeys(state.selection.keys);
  const out = new Set(questionIds);
  for (const fid of folderIds) for (const id of state.d.subtreeQuestionIds(fid)) out.add(id);
  return [...out];
}

/* ================= Nawigacja ================= */

export async function openFolder(state, folderId) {
  goTo(state, folderId || null);
  renderAll(state);
}

export async function openTrash(state) {
  goTo(state, "trash");
  renderAll(state);
}

export async function goUp(state) {
  if (state.location.kind !== "folder") return;
  const parent = state.d.folderById.get(state.location.folderId)?.parent_id || null;
  await openFolder(state, parent);
}

/* ================= Tworzenie i zmiana nazwy ================= */

export async function createFolder(state, parentId) {
  try {
    await ops.createFolder(state.baseId, parentId, t("baseExplorer.toolbar.newFolder"));
  } catch (e) {
    return opFailed(e);
  }
  await refresh(state);
  return true;
}

export async function createQuestion(state, folderId) {
  try {
    await ops.createQuestion(state.baseId, folderId, { text: t("baseExplorer.toolbar.newQuestion"), answers: [] });
  } catch (e) {
    return opFailed(e);
  }
  await refresh(state);
  return true;
}

export async function renameSelected(state) {
  const keys = [...state.selection.keys];
  if (keys.length !== 1) return false;
  const key = keys[0];
  const isFolder = key.startsWith("c:");
  if (!isFolder && !key.startsWith("q:")) return false;
  const id = key.slice(2);

  const current = isFolder
    ? state.d.folderById.get(id)?.name || ""
    : String(state.d.questionById.get(id)?.payload?.text || "");

  const lease = await acquireResourceLock({
    resourceType: isFolder ? "base_folder" : "base_question",
    resourceId: id,
    context: "base-explorer:rename",
  });
  if (!lease?.ok) return lockRefused(lease);
  try {
    const next = await openRenameModal({
      title: t(isFolder ? "baseExplorer.rename.folderTitle" : "baseExplorer.rename.questionTitle"),
      value: current,
      maxLen: isFolder ? 80 : LIMITS.Q_TEXT,
    });
    if (next === null) return false;
    if (!lease.ok) {
      void alertModal({ text: lease.reason === "gone" ? t("resourceLock.goneMessage") : t("resourceLock.forbiddenMessage") });
      return false;
    }
    const value = isFolder ? String(next).trim().slice(0, 80) : normQuestionText(next);
    if (!value) return false;
    try {
      // pytanie: baza podmienia tylko payload.text — odpowiedzi dodane
      // w międzyczasie gdzie indziej zostają
      if (isFolder) await ops.renameFolder(state.baseId, id, value);
      else await ops.setQuestionText(state.baseId, id, value);
    } catch (e) {
      return opFailed(e);
    }
  } finally {
    lease.release();
  }
  await refresh(state);
  return true;
}

/* ================= Usuwanie i kosz ================= */

// Usuń zaznaczone: w koszu — trwale, wszędzie indziej — do kosza.
export async function deleteSelected(state) {
  if (isTrash(state)) return purgeTrash(state, trashIdsOf(state.selection.keys));

  const items = splitKeys(state.selection.keys);
  const n = items.folderIds.length + items.questionIds.length;
  if (!n) return false;
  const ok = await confirmModal({
    text: n === 1 ? t("baseExplorer.confirm.deleteOne") : t("baseExplorer.confirm.deleteMany", { n }),
  });
  if (!ok) return false;

  const done = await withLocks(locksFor(state, items), "base-explorer:delete",
    () => ops.deleteItems(state.baseId, items));
  if (done === false) return false;
  selectionClear(state);
  await refresh(state);
  return true;
}

export async function restoreFromTrash(state) {
  const ids = trashIdsOf(state.selection.keys);
  if (!ids.length) return false;
  try {
    await ops.trashRestore(state.baseId, ids);
  } catch (e) {
    return opFailed(e);
  }
  selectionClear(state);
  await refresh(state);
  return true;
}

// ids null = opróżnij cały kosz
export async function purgeTrash(state, ids) {
  if (ids && !ids.length) return false;
  const ok = await confirmModal({ text: t(ids ? "baseExplorer.trash.confirmPurge" : "baseExplorer.trash.confirmEmpty") });
  if (!ok) return false;
  try {
    await ops.trashPurge(state.baseId, ids);
  } catch (e) {
    return opFailed(e);
  }
  selectionClear(state);
  await refresh(state);
  return true;
}

/* ================= Schowek, kopiowanie, przenoszenie ================= */

export function copyToClipboard(state, mode) {
  const keys = [...state.selection.keys].filter((k) => k.startsWith("c:") || k.startsWith("q:"));
  if (!keys.length) return false;
  state.clipboard = { mode, keys: new Set(keys) };
  renderAll(state);
  return true;
}

export async function copyItems(state, keys, targetFolderId) {
  const items = splitKeys(keys);
  if (!items.folderIds.length && !items.questionIds.length) return false;
  try {
    await ops.copyItems(state.baseId, items, targetFolderId);
  } catch (e) {
    return opFailed(e);
  }
  await refresh(state);
  return true;
}

export async function moveItems(state, keys, targetFolderId) {
  const items = splitKeys(keys);
  if (!items.folderIds.length && !items.questionIds.length) return false;
  if (items.folderIds.includes(targetFolderId)) {
    void alertModal({ text: t("baseExplorer.errors.moveIntoSelf") });
    return false;
  }
  if (targetFolderId && state.d.ancestorIds(targetFolderId).some((a) => items.folderIds.includes(a))) {
    void alertModal({ text: t("baseExplorer.errors.moveIntoChild") });
    return false;
  }
  const target = targetFolderId ? [{ resourceType: "base_folder", resourceId: targetFolderId }] : [];
  const done = await withLocks(locksFor(state, items, target), "base-explorer:move",
    () => ops.moveItems(state.baseId, items, targetFolderId));
  if (done === false) return false;
  await refresh(state);
  return true;
}

// Wklej: kopia albo przeniesienie (wycięte) do folderu docelowego.
export async function paste(state, targetFolderId) {
  const { mode, keys } = state.clipboard;
  if (!mode || !keys.size) return false;
  if (mode === "copy") return copyItems(state, keys, targetFolderId);
  const ok = await moveItems(state, keys, targetFolderId);
  // schowek pustoszeje tylko po udanym przeniesieniu
  if (ok) state.clipboard = { mode: null, keys: new Set() };
  renderAll(state);
  return ok;
}

// Duplikuj: kopia w tym samym folderze, bez ruszania schowka.
export async function duplicateSelected(state) {
  return copyItems(state, state.selection.keys, currentFolderId(state));
}

// Zmiana kolejności folderów (upuszczenie przed/za folderem w drzewie).
export async function reorderFolders(state, movedIds, targetId, mode) {
  const d = state.d;
  const target = d.folderById.get(targetId);
  if (!target || !movedIds.length) return false;
  const parentId = mode === "into" ? targetId : (target.parent_id || null);
  if (parentId && (movedIds.includes(parentId) || d.ancestorIds(parentId).some((a) => movedIds.includes(a)))) {
    void alertModal({ text: t("baseExplorer.errors.moveIntoChild") });
    return false;
  }
  const siblings = d.childFolders(parentId).map((f) => f.id).filter((id) => !movedIds.includes(id));
  let ordered;
  if (mode === "into") ordered = siblings.concat(movedIds);
  else {
    const idx = siblings.indexOf(targetId);
    const at = idx === -1 ? siblings.length : (mode === "before" ? idx : idx + 1);
    ordered = siblings.slice(0, at).concat(movedIds, siblings.slice(at));
  }
  const parentLock = parentId ? [{ resourceType: "base_folder", resourceId: parentId }] : [];
  const done = await withLocks(locksFor(state, { folderIds: movedIds }, parentLock), "base-explorer:reorder-folders",
    () => ops.reorderFolders(state.baseId, parentId, ordered));
  if (done === false) return false;
  await refresh(state);
  return true;
}

/* ================= Tagi ================= */

// Upuszczenie elementów na tag: tag dostają pytania i całe poddrzewa folderów.
export async function assignTag(state, tagId, keys) {
  const items = splitKeys(keys);
  if (!tagId || (!items.folderIds.length && !items.questionIds.length)) return false;
  const done = await withLocks(locksFor(state, items, [{ resourceType: "base_tag", resourceId: tagId }]),
    "base-explorer:assign-tag", () => ops.setTagLinks(state.baseId, [tagId], items, true));
  if (done === false) return false;
  await refresh(state);
  return true;
}

// Zdejmij tagi z filtra z zaznaczonych elementów (folder = całe poddrzewo).
export async function untagSelected(state) {
  const tagIds = state.query.tagIds || [];
  const items = splitKeys(state.selection.keys);
  const n = items.folderIds.length + items.questionIds.length;
  if (!tagIds.length || !n) return false;
  const ok = await confirmModal({
    text: n === 1 ? t("baseExplorer.confirm.removeTagsOne") : t("baseExplorer.confirm.removeTagsMany", { n }),
  });
  if (!ok) return false;
  const done = await withLocks(locksFor(state, items, tagIds.map((resourceId) => ({ resourceType: "base_tag", resourceId }))),
    "base-explorer:untag", () => ops.setTagLinks(state.baseId, tagIds, items, false));
  if (done === false) return false;
  selectionClear(state);
  await refresh(state);
  return true;
}

export async function deleteTags(state, tagIds) {
  const ids = [...new Set((tagIds || []).filter(Boolean))];
  if (!ids.length) return false;
  const ok = await confirmModal({
    text: ids.length === 1 ? t("baseExplorer.confirm.deleteTagsOne") : t("baseExplorer.confirm.deleteTagsMany", { n: ids.length }),
  });
  if (!ok) return false;
  const done = await withLocks(ids.map((resourceId) => ({ resourceType: "base_tag", resourceId })),
    "base-explorer:delete-tags", () => ops.deleteTags(state.baseId, ids));
  if (done === false) return false;
  // usunięte tagi znikają z filtra
  setQuery(state, { tagIds: state.query.tagIds.filter((id) => !ids.includes(id)) });
  await refresh(state);
  return true;
}

// Okno tagów: przypisanie zaznaczeniu ("assign") albo nowy / edycja tagu.
export async function openTagsWindow(state, { mode = "assign", tagId = null } = {}) {
  let res;
  if (mode === "assign") {
    const { folderIds, questionIds } = splitKeys(state.selection.keys);
    const folderDescQIds = new Map(folderIds.map((fid) => [fid, new Set(state.d.subtreeQuestionIds(fid))]));
    res = await openTagsModal(state, { mode, selection: { qIds: questionIds, cIds: folderIds }, folderDescQIds });
  } else {
    res = await openTagsModal(state, { mode, tagId });
  }
  if (res === true || res?.saved) await refresh(state);
  else renderAll(state);
  return res;
}

/* ================= Okno pytania ================= */

let questionModal = null;

export async function editQuestion(state, qid) {
  if (!qid) return false;
  questionModal ||= initQuestionModal({ state });
  const lease = await acquireResourceLock({ resourceType: "base_question", resourceId: qid, context: "base-explorer:question-modal" });
  if (!lease?.ok) return lockRefused(lease);
  try {
    const row = await getQuestion(qid);
    const input = { id: row.id, payload: (row.payload && typeof row.payload === "object") ? row.payload : { text: "", answers: [] } };
    // zapis z otwartym oknem: błąd pokazuje się w oknie, wpisana treść zostaje
    const save = async (payload) => {
      if (!lease.ok) {
        const e = new Error("lease lost");
        e.userMessage = lease.reason === "gone" ? t("resourceLock.goneMessage") : t("resourceLock.forbiddenMessage");
        throw e;
      }
      await ops.saveQuestion(state.baseId, qid, payload);
    };
    const res = await questionModal.open(input, { save });
    if (!res?.ok) return false;
  } finally {
    lease.release();
  }
  await refresh(state);
  return true;
}

/* ================= Utwórz grę ================= */

let exportModal = null;

export async function createGame(state) {
  exportModal ||= initExportModal({ state });
  const ownerId = state.user?.id;
  if (!ownerId) return false;

  const qids = selectionQuestionIds(state);
  // nazwa podpowiadana z folderu, gdy zaznaczony jest dokładnie jeden folder
  const { folderIds, questionIds } = splitKeys(state.selection.keys);
  const folder = folderIds.length === 1 && !questionIds.length ? state.d.folderById.get(folderIds[0]) : null;

  // lista okna = cała baza (można dozaznaczyć), zaznaczenie = wybrane pytania
  const questions = (state.store.questions || []).map((r) => ({
    id: r.id,
    payload: (r.payload && typeof r.payload === "object") ? r.payload : { text: "", answers: [] },
    text: r.payload?.text ?? "",
    answers: Array.isArray(r.payload?.answers) ? r.payload.answers : [],
  }));

  const res = await exportModal.open({
    questions,
    preselectIds: qids,
    ...(folder?.name ? { defaultName: folder.name } : {}),
    // gra powstaje tu (okno czeka na wynik); bez drugiego importGame
    run: async (payload, progress) => {
      const n = payload?.questions?.length || 1;
      progress?.({ step: t("baseExplorer.export.progress.creatingGame"), i: 0, n, msg: "" });
      let i = 0;
      const timer = setInterval(() => {
        i = Math.min(n - 1, i + 1);
        progress?.({ step: t("baseExplorer.export.progress.importingQuestions"), i, n, msg: "" });
      }, 120);
      try {
        const gameId = await importGame(payload, ownerId);
        progress?.({ step: t("baseExplorer.export.progress.importDone"), i: n, n, msg: t("baseExplorer.export.progress.importOk") });
        return { gameId };
      } finally {
        clearInterval(timer);
      }
    },
  });
  if (!res?.ok) return false;
  location.href = linkTo("games");
  return true;
}
