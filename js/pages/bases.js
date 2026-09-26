// js/pages/bases.js
// Lista baz pytań (warstwa 1) – styl i ergonomia jak strona gier (games).

import { addRenameGesture } from "../core/rename-gesture.js?v=v2026-09-26T16124";

import { sb, SUPABASE_URL } from "../core/supabase.js?v=v2026-09-26T16124";
import { updateChecked, ROW_GONE } from "../core/db-guard.js?v=v2026-09-26T16124";
import { requireAuth } from "../core/auth.js?v=v2026-09-26T16124";
import { alertModal, confirmModal } from "../core/modal.js?v=v2026-09-26T16124";
import { isGuestUser, hideForGuest } from "../core/guest-mode.js?v=v2026-09-26T16124";
import { initUiSelect } from "../core/ui-select.js?v=v2026-09-26T16124";
import { getUiLang, initI18n, t, withLangParam } from "../../translation/translation.js?v=v2026-09-26T16124";
import { initTopbarAccountDropdown } from "../core/topbar-controller.js?v=v2026-09-26T16124";
import { enterModalSheet, exitModalSheet, isSheetViewport, handleSheetBack } from "../core/modal-sheet.js?v=v2026-09-26T16124";
import "../core/contact-modal.js?v=v2026-09-26T16124";
import { icon, iconText } from "../core/icons.js?v=v2026-09-26T16124";
initI18n({ withSwitcher: true }).then(() => {
  document.documentElement.classList.remove('page-loading');
});

/* ================= DOM ================= */
const mineGrid = document.getElementById("mineGrid");
const sharedGrid = document.getElementById("sharedGrid");

// wypustki (mine/shared)
const tabBasesMine = document.getElementById("tabBasesMine");
const tabBasesShared = document.getElementById("tabBasesShared");
const basesSectionMine = document.getElementById("basesSectionMine");
const basesSectionShared = document.getElementById("basesSectionShared");
const basesSharedBadge = document.getElementById("basesSharedBadge");
const who = document.getElementById("who");
const hint = document.getElementById("hint");

const btnBack = document.getElementById("btnBack");
const btnManual = document.getElementById("btnManual");
const btnLogout = document.getElementById("btnLogout");
const btnBrowse = document.getElementById("btnBrowse");
const btnShare = document.getElementById("btnShare");
const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const btnGoAlt = document.getElementById("btnGoAlt");
const altBadgeEl = document.getElementById("altBadge");

// Modal nazwy
const nameOverlay = document.getElementById("nameOverlay");
const nameTitle = document.getElementById("nameTitle");
const nameSub = document.getElementById("nameSub");
const nameInp = document.getElementById("nameInp");
const btnNameOk = document.getElementById("btnNameOk");
const btnNameCancel = document.getElementById("btnNameCancel");
const nameMsg = document.getElementById("nameMsg");

// Modal importu
const importOverlay = document.getElementById("importOverlay");
const importFile = document.getElementById("importFile");
const btnImportJson = document.getElementById("btnImportJson");
const btnCancelImport = document.getElementById("btnCancelImport");
const importErr = document.getElementById("importErr");
const importMsg = document.getElementById("importMsg");

// Import progress
const importProg = document.getElementById("importProg");
const importProgStep = document.getElementById("importProgStep");
const importProgCount = document.getElementById("importProgCount");
const importProgBar = document.getElementById("importProgBar");
const importProgMsg = document.getElementById("importProgMsg");

// Export progress (overlay eksportu do pliku)
const exportJsonOverlay = document.getElementById("exportJsonOverlay");
const exportJsonSub = document.getElementById("exportJsonSub");
const exportJsonStep = document.getElementById("exportJsonStep");
const exportJsonCount = document.getElementById("exportJsonCount");
const exportJsonBar = document.getElementById("exportJsonBar");
const exportJsonMsg = document.getElementById("exportJsonMsg");

// Modal share
const shareOverlay = document.getElementById("shareOverlay");
const sharePendingList = document.getElementById("sharePendingList");
const shareSharedList = document.getElementById("shareSharedList");

const shareEmail = document.getElementById("shareEmail");
const shareEmailWrap = document.getElementById("shareEmailWrap");
const shareEmailError = document.getElementById("shareEmailError");
const shareRole = document.getElementById("shareRole");
const shareRecipientType = document.getElementById("shareRecipientType");
const shareSubscriberSelect = document.getElementById("shareSubscriberSelect");
const shareSubsWrap = document.getElementById("shareSubsWrap");
const btnShareAdd = document.getElementById("btnShareAdd");
const btnShareClose = document.getElementById("btnShareClose");
const shareMsg = document.getElementById("shareMsg");

const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;

/* ================= STATE ================= */
let currentUser = null;
let guestMode = false;
let ownedBases = []; // { id, name, owner_id, created_at, updated_at }
let sharedBases = []; // { id, name, owner_id, created_at, updated_at, sharedRole: 'viewer'|'editor' }
let selectedId = null;

// =======================================================
// Auto-refresh (jak polls-hub)
// - co 20s
// - tylko gdy strona widoczna
// - nie odświeżaj gdy overlay jest otwarty (żeby nie psuć UX)
// =======================================================
let autoRefreshTimer = null;
let basesRefreshInFlight = null;

function anyOverlayOpen() {
  const ovs = [nameOverlay, importOverlay, shareOverlay, exportJsonOverlay];
  if (ovs.some((ov) => ov && ov.style.display !== "none")) return true;
  // confirmModal/alertModal (js/core/modal.js) -- np. potwierdzenie usunięcia
  return !!document.querySelector(".uni-modal");
}

// Jedno miejsce "pobierz dane + przerysuj". Błąd sieci nie może zostawić
// nieobsłużonego odrzucenia (auto-refresh) -- zwracamy false, a wołający
// decyduje, czy pokazać komunikat.
async function refreshView({ withBadge = false } = {}) {
  if (basesRefreshInFlight) return basesRefreshInFlight;
  basesRefreshInFlight = (async () => {
    try {
      await refreshBases();
      if (withBadge) await refreshAltBadge();
      render();
      setButtonsState();
      return true;
    } catch (e) {
      console.warn("[bases] refresh failed:", e);
      return false;
    }
  })();
  try {
    return await basesRefreshInFlight;
  } finally {
    basesRefreshInFlight = null;
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer) return;
  autoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    if (anyOverlayOpen()) return;
    void refreshView({ withBadge: true });
  }, 20000);
}

function stopAutoRefresh() {
  if (!autoRefreshTimer) return;
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

let shareRoleSelect = null;
let shareRecipientTypeSelect = null;
let shareSubscriberSelectInst = null;
const SHARE_MODAL_CACHE_TTL_MS = 20_000;
const shareModalCache = new Map();

// modal nazwy – tryb
let nameMode = "create"; // 'create' | 'rename'
let renameBaseId = null; // która baza jest przemianowywana (niezależnie od zaznaczenia)

/* ================= UI helpers ================= */
function show(el, on) {
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setHint(t) {
  if (!hint) return;
  hint.textContent = t || "";
}

function setMsg(el, t) {
  if (!el) return;
  el.textContent = t || "";
}

function shareRoleOptions() {
  return [
    { value: "editor", label: t("bases.shareModal.roleEditor") },
    { value: "viewer", label: t("bases.shareModal.roleViewer") },
  ];
}

function shareRecipientTypeOptions() {
  return [
    { value: "email", label: t("bases.shareModal.recipientEmail") || "Wpisz adres email / nazwę" },
    { value: "subscriber", label: t("bases.shareModal.recipientSubscriber") || "Wybierz subskrybenta" },
  ];
}

function initShareRoleSelect() {
  if (!shareRole) return;
  if (!shareRoleSelect) {
    shareRoleSelect = initUiSelect(shareRole, {
      options: shareRoleOptions(),
      value: "editor",
    });
    return;
  }
  shareRoleSelect.setOptions(shareRoleOptions());
  shareRoleSelect.setValue("editor", { silent: true });
}

function initShareRecipientTypeSelect() {
  if (!shareRecipientType) return;
  if (!shareRecipientTypeSelect) {
    shareRecipientTypeSelect = initUiSelect(shareRecipientType, {
      options: shareRecipientTypeOptions(),
      value: "email",
      onChange: (val) => onRecipientTypeChange(val),
    });
    return;
  }
  shareRecipientTypeSelect.setOptions(shareRecipientTypeOptions());
  shareRecipientTypeSelect.setValue("email", { silent: true });
  onRecipientTypeChange("email");
}

function initShareSubscriberSelect() {
  if (!shareSubscriberSelect) return;
  if (!shareSubscriberSelectInst) {
    shareSubscriberSelectInst = initUiSelect(shareSubscriberSelect, {
      options: [],
      value: "",
      placeholder: t("bases.shareModal.selectSubscriber") || "Wybierz...",
    });
    return;
  }
  shareSubscriberSelectInst.setOptions([]);
  shareSubscriberSelectInst.setValue("", { silent: true });
}

function onRecipientTypeChange(val) {
  const showEmail = val === "email";
  const showSubs = val === "subscriber";
  if (shareEmailWrap) shareEmailWrap.style.display = showEmail ? "" : "none";
  if (shareSubsWrap) shareSubsWrap.style.display = showSubs ? "" : "none";
}

function safeName(s) {
  return (String(s ?? "").trim() || t("bases.defaults.name")).slice(0, 80);
}

function safeDownloadName(name) {
  const base = String(name || t("bases.defaults.slug"))
    .replace(/[^\w\d\- ]+/g, "")
    .trim()
    .slice(0, 40) || t("bases.defaults.slug");
  return `${base}.fambase`;
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isOwner(b) {
  return b && currentUser && b.owner_id === currentUser.id;
}

function selectedBase() {
  return (
    ownedBases.find((b) => b.id === selectedId) ||
    sharedBases.find((b) => b.id === selectedId) ||
    null
  );
}

function setButtonsState() {
  const b = selectedBase();
  // Zaproszenie (proposed) to jeszcze nie dostęp -- RLS i tak nie pozwoli
  // przeglądać ani eksportować bazy przed akceptacją.
  const hasAccess = !!b && !b.proposed;
  const owner = b ? isOwner(b) : false;

  // Przeglądanie: każdy z dostępem
  if (btnBrowse) btnBrowse.disabled = !hasAccess;

  // Udostępnianie: tylko owner
  if (btnShare) btnShare.disabled = !hasAccess || !owner;

  // Eksport: każdy z dostępem
  if (btnExport) btnExport.disabled = !hasAccess;
}

function showProgBlock(el, on) {
  if (!el) return;
  el.style.display = on ? "grid" : "none";
}

function setProgUi(stepEl, countEl, barEl, msgEl, { step, i, n, msg, isError } = {}) {
  if (stepEl && step != null) {
    if (isError) stepEl.innerHTML = iconText("error", String(step));
    else stepEl.textContent = String(step);
  }
  if (countEl) countEl.textContent = `${Number(i) || 0}/${Number(n) || 0}`;

  const nn = Number(n) || 0;
  const ii = Number(i) || 0;
  const pct = nn > 0 ? Math.round((ii / nn) * 100) : 0;
  if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;

  if (msgEl) msgEl.textContent = msg ? String(msg) : "";
}

/* ================= DB: listowanie baz ================= */
async function listOwnedBases() {
  const { data, error } = await sb()
    .from("question_bases")
    .select("id,name,owner_id,created_at,updated_at")
    .eq("owner_id", currentUser.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function listSharedBases() {
  const { data, error } = await sb().rpc("list_shared_bases_ext");
  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    name: r.name,
    owner_id: r.owner_id,
    ownerUsername: r.owner_username,
    ownerEmail: r.owner_email,
    created_at: r.created_at,
    updated_at: r.updated_at,
  
    sharedRole: r.shared_role,
  
    proposed: !!r.proposed,
    taskId: r.task_id || null,
    taskStatus: r.task_status || null,
    proposedRole: r.proposed_role || null,
  }));
}

async function refreshBases() {
  const owned = await listOwnedBases();

  // policz udostępnienia dla moich baz
  const ownedBaseIds = owned.map((b) => b.id);
  const shareCountByBase = new Map();

  if (ownedBaseIds.length) {
    const { data: shares, error } = await sb()
      .from("question_base_shares")
      .select("base_id")
      .in("base_id", ownedBaseIds);

    if (error) throw error;

    for (const s of shares || []) {
      shareCountByBase.set(s.base_id, (shareCountByBase.get(s.base_id) || 0) + 1);
    }
  }

  // dopisz shareCount do owned
  const ownedWithStats = owned.map((b) => ({
    ...b,
    shareCount: shareCountByBase.get(b.id) || 0,
  }));

  const shared = guestMode ? [] : await listSharedBases();

  ownedBases = ownedWithStats
    .slice()
    .sort((a, b) =>
      String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))
    );

  // Z ostrożności usuń duplikaty (gdyby kiedyś owner mógł mieć też share)
  const ownedIdSet = new Set(ownedBases.map((b) => b.id));
  sharedBases = (shared || [])
    .filter((b) => !ownedIdSet.has(b.id))
    .slice()
    .sort((a, b) =>
      String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))
    );

  // jeśli zaznaczona baza zniknęła
  const stillExists =
    ownedBases.some((b) => b.id === selectedId) ||
    sharedBases.some((b) => b.id === selectedId);

  if (selectedId && !stillExists) selectedId = null;
}

/* ================= DB: CRUD baz ================= */
async function createBase(name) {
  const { data, error } = await sb()
    .from("question_bases")
    .insert({
      owner_id: currentUser.id,
      name: safeName(name),
    }, { defaultToNull: false })
    .select("id,name,owner_id,created_at,updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function renameBase(baseId, newName) {
  await updateChecked(
    "question_bases",
    { id: baseId },
    { name: safeName(newName), updated_at: new Date().toISOString() }
  );
}

async function deleteBase(base) {
  const ok = await confirmModal({
    title: t("bases.delete.title"),
    text: t("bases.delete.text", { name: base.name }),
    okText: t("bases.delete.ok"),
    cancelText: t("bases.delete.cancel"),
  });
  if (!ok) return;

  // qb_questions/qb_categories/qb_tags mają ON DELETE CASCADE od
  // question_bases -- gołe .delete() skasowałoby też elementy, które ktoś
  // aktywnie edytuje w base-explorerze (Warstwa 1, edit_locks), bez
  // żadnego ostrzeżenia. delete_resource_checked sprawdza to atomowo po
  // stronie serwera, tak samo jak dla gry/logo w games.js.
  const { data, error } = await sb().rpc("delete_resource_checked", {
    p_resource_type: "base",
    p_resource_id: base.id,
  });
  if (error) {
    console.warn("[bases] delete error:", error);
    void alertModal({ text: t("bases.delete.failed") });
    return;
  }
  if (!data?.ok) {
    console.warn("[bases] delete blocked:", data);
    void alertModal({ text: data?.in_use ? t("bases.delete.inUse") : t("bases.delete.failed") });
  }
}

async function leaveSharedBase(base) {
  const ok = await confirmModal({
    title: t("bases.leaveShared.title"),
    text: t("bases.leaveShared.text", { name: base?.name || t("bases.defaults.baseLabel") }),
    okText: t("bases.leaveShared.ok"),
    cancelText: t("bases.leaveShared.cancel"),
  });
  if (!ok) return;

  const { data: ok2, error } = await sb().rpc("leave_shared_base", { p_base_id: base.id });
  if (error || ok2 !== true) {
    console.warn("[bases] leave_shared_base error:", error);
    void alertModal({ text: t("bases.leaveShared.failed") });
  }
}

/* ================= Export / Import ================= */
// Długie listy id w .in() lecą w URL-u (GET) -- dzielimy je, żeby duża baza
// nie kończyła się 414 URI Too Long.
const IN_CHUNK = 150;
// Wstawianie wsadowe -- jedno zapytanie na paczkę zamiast jednego na wiersz.
const INSERT_CHUNK = 200;

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function selectIn(table, cols, column, ids) {
  const rows = [];
  for (const part of chunks(ids, IN_CHUNK)) {
    const { data, error } = await sb().from(table).select(cols).in(column, part);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function insertAll(table, rows, onChunk) {
  for (const part of chunks(rows, INSERT_CHUNK)) {
    const { error } = await sb().from(table).insert(part, { defaultToNull: false });
    if (error) throw error;
    onChunk?.(part.length);
  }
}

const EXPORT_STEPS = 6;

async function exportBase(baseId, onProgress) {
  const prog = (step, i, msg = "") => {
    if (typeof onProgress === "function") onProgress({ step, i, n: EXPORT_STEPS, msg });
  };
  const { data: baseRow, error: bErr } = await sb()
    .from("question_bases")
    .select("id,name")
    .eq("id", baseId)
    .single();
  if (bErr) throw bErr;
  prog(t("bases.export.steps.base"), 1);

  const { data: cats, error: cErr } = await sb()
    .from("qb_categories")
    .select("id,parent_id,name,ord")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });
  if (cErr) throw cErr;
  prog(t("bases.export.steps.folders"), 2, t("bases.export.count", { count: (cats || []).length }));

  const { data: qs, error: qErr } = await sb()
    .from("qb_questions")
    .select("id,category_id,ord,payload")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });
  if (qErr) throw qErr;
  prog(t("bases.export.steps.questions"), 3, t("bases.export.count", { count: (qs || []).length }));

  const { data: tags, error: tErr } = await sb()
    .from("qb_tags")
    .select("id,name,color,ord")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });
  if (tErr) throw tErr;
  prog(t("bases.export.steps.tags"), 4, t("bases.export.count", { count: (tags || []).length }));

  const qtags = await selectIn("qb_question_tags", "question_id,tag_id", "question_id", (qs || []).map((q) => q.id));
  prog(t("bases.export.steps.questionTags"), 5, t("bases.export.count", { count: qtags.length }));

  // Tagi folderów -- import zawsze je obsługiwał, ale eksport ich nie
  // zapisywał, więc eksport → import po cichu je gubił.
  const ctags = await selectIn("qb_category_tags", "category_id,tag_id", "category_id", (cats || []).map((c) => c.id));
  prog(t("bases.export.steps.categoryTags"), 6, t("bases.export.count", { count: ctags.length }));

  return {
    base: { name: baseRow?.name ?? t("bases.defaults.baseLabel") },
    categories: cats || [],
    tags: tags || [],
    questions: (qs || []).map((q) => ({
      id: q.id,
      category_id: q.category_id,
      ord: Number(q.ord) || 0,
      payload: q.payload || {},
    })),
    question_tags: qtags,
    category_tags: ctags,
  };
}

function isValidImportPayload(p) {
  return !!p && typeof p === "object" && !!p.base && typeof p.base === "object" && Array.isArray(p.questions);
}

async function importBase(payload, onProgress) {
  const prog = (step, i, n, msg) => {
    if (typeof onProgress === "function") onProgress({ step, i, n, msg });
  };

  if (!isValidImportPayload(payload)) {
    throw new Error(t("bases.import.invalidFormat"));
  }

  const baseName = safeName(payload.base?.name || t("bases.defaults.name"));
  const base = await createBase(baseName);
  prog(t("bases.import.steps.createBase"), 1, 5, "");

  try {
    await importBaseContent(base.id, payload, prog);
  } catch (e) {
    // Import nie jest atomowy -- bez sprzątania po błędzie zostawałaby
    // na liście pusta/niepełna baza. Usunięcie bazy kasuje (CASCADE)
    // wszystko, co zdążyło się wstawić.
    const { error: delErr } = await sb().from("question_bases").delete().eq("id", base.id);
    if (delErr) console.warn("[bases] import cleanup failed:", delErr);
    throw e;
  }
  return base.id;
}

async function importBaseContent(baseId, payload, prog) {
  // Nowe id nadajemy po stronie klienta -- dzięki temu wszystko można wstawić
  // wsadowo, a mapowanie stare → nowe id (rodzic folderu, folder pytania,
  // powiązania tagów) jest znane z góry.
  const newId = () => crypto.randomUUID();
  const oldToNewCat = new Map();
  const oldToNewTag = new Map();
  const oldToNewQ = new Map();

  // 1) Kategorie – poziomami (rooty → dzieci), żeby rodzic zawsze istniał
  prog(t("bases.import.steps.categories"), 2, 5, "");
  const cats = (Array.isArray(payload.categories) ? payload.categories : []).filter((c) => c && c.id != null);
  for (const c of cats) oldToNewCat.set(c.id, newId());
  const catIds = new Set(cats.map((c) => c.id));
  const depthOf = new Map();
  const depth = (c, seen = new Set()) => {
    if (depthOf.has(c.id)) return depthOf.get(c.id);
    // rodzic spoza pliku albo cykl -> traktuj jak root
    const parent = catIds.has(c.parent_id) && !seen.has(c.parent_id) ? cats.find((x) => x.id === c.parent_id) : null;
    seen.add(c.id);
    const d = parent ? depth(parent, seen) + 1 : 0;
    depthOf.set(c.id, d);
    return d;
  };
  const levels = [];
  for (const c of cats) (levels[depth(c)] ||= []).push(c);
  for (const level of levels.filter(Boolean)) {
    await insertAll("qb_categories", level.map((c) => ({
      id: oldToNewCat.get(c.id),
      base_id: baseId,
      parent_id: depthOf.get(c.id) > 0 ? oldToNewCat.get(c.parent_id) : null,
      name: String(c.name || t("bases.defaults.category")).slice(0, 80),
      ord: Number(c.ord) || 0,
    })));
  }

  // 2) Tagi
  prog(t("bases.import.steps.tags"), 3, 5, "");
  const tags = (Array.isArray(payload.tags) ? payload.tags : []).filter((x) => x && x.id != null);
  for (const tag of tags) oldToNewTag.set(tag.id, newId());
  await insertAll("qb_tags", tags.map((tag) => ({
    id: oldToNewTag.get(tag.id),
    base_id: baseId,
    name: String(tag.name || t("bases.defaults.tag")).slice(0, 40),
    color: String(tag.color || "gray").slice(0, 24),
    ord: Number(tag.ord) || 0,
  })));

  // 3) Pytania
  const qs = (Array.isArray(payload.questions) ? payload.questions : []).filter((q) => q && typeof q === "object");
  let done = 0;
  prog(t("bases.import.steps.questions"), 0, qs.length, "");
  const qRows = qs.map((q) => {
    const id = newId();
    if (q.id != null) oldToNewQ.set(q.id, id);
    return {
      id,
      base_id: baseId,
      category_id: q.category_id != null ? (oldToNewCat.get(q.category_id) || null) : null,
      ord: Number(q.ord) || 0,
      payload: q.payload && typeof q.payload === "object" ? q.payload : {},
      updated_by: currentUser.id,
    };
  });
  await insertAll("qb_questions", qRows, (n) => {
    done += n;
    prog(t("bases.import.steps.questions"), done, qs.length, "");
  });

  // 4) Powiązania tagów pytań
  prog(t("bases.import.steps.questionTags"), 4, 5, "");
  const qtRows = [];
  const qtSeen = new Set();
  for (const r of Array.isArray(payload.question_tags) ? payload.question_tags : []) {
    const nq = oldToNewQ.get(r?.question_id);
    const nt = oldToNewTag.get(r?.tag_id);
    if (!nq || !nt || qtSeen.has(nq + nt)) continue;
    qtSeen.add(nq + nt);
    qtRows.push({ question_id: nq, tag_id: nt });
  }
  await insertAll("qb_question_tags", qtRows);

  // 5) Powiązania tagów kategorii (folderów)
  prog(t("bases.import.steps.categoryTags"), 5, 5, "");
  const ctRows = [];
  const ctSeen = new Set();
  for (const r of Array.isArray(payload.category_tags) ? payload.category_tags : []) {
    const nc = oldToNewCat.get(r?.category_id);
    const nt = oldToNewTag.get(r?.tag_id);
    if (!nc || !nt || ctSeen.has(nc + nt)) continue;
    ctSeen.add(nc + nt);
    ctRows.push({ category_id: nc, tag_id: nt });
  }
  await insertAll("qb_category_tags", ctRows);
}

/* ================= Share modal ================= */
function roleLabel(role) {
  return role === "editor" ? t("bases.roles.editorBadge") : t("bases.roles.viewerBadge");
}

function emailLooksOk(s) {
  const t = String(s || "").trim();
  // prosta walidacja – nie walczymy z RFC
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

async function resolveLoginToEmail(login) {
  const v = String(login || "").trim();
  if (!v) return "";

  if (v.includes("@")) return v.toLowerCase();

  // username -> email (to samo RPC co w auth.js)
  const { data, error } = await sb().rpc("profile_login_to_email", { p_login: v });
  if (error) {
    console.warn("[bases] profile_login_to_email error:", error);
    return "";
  }
  return String(data || "").trim().toLowerCase();
}

function mailLink(link) {
  let u;
  try {
    u = new URL(link, location.origin);
  } catch {
    u = new URL(String(link || ""), location.origin);
  }

  u.searchParams.set("lang", getUiLang() || "pl");
  return u.href;
}

function escapeMail(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function wrapEmailDoc(innerHtml) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style>:root { color-scheme: dark; }</style>
</head>
<body style="margin:0;padding:0;background:#050914;color:#ffffff;">
${innerHtml}
</body>
</html>`;
}

function buildMailHtml({ title, body, actionLabel, actionUrl }) {
  const safeTitle = escapeMail(title || t("bases.mail.title"));
  const safeBody = escapeMail(body || "");
  const safeActionLabel = escapeMail(actionLabel || t("bases.mail.action"));
  const safeActionUrl = escapeMail(actionUrl || "");

  const subtitle = escapeMail(t("bases.mail.subtitle"));
  const footer = escapeMail(t("bases.mail.footer"));
  const linkLabel = escapeMail(t("bases.mail.linkLabel"));

  const inner = `
<div style="margin:0;padding:0;background:#050914;color:#ffffff;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;background:#050914;">
    <div style="padding:14px 14px;background:#0b1020;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${subtitle}</div>
    </div>

    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:#111827;background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${safeTitle}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${safeBody}</div>

      <div style="margin:16px 0;">
        <a href="${safeActionUrl}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:#2a2b1a;background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;text-transform:uppercase;">
          ${safeActionLabel}
        </a>
      </div>

      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${linkLabel}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:#0a0f1e;background:rgba(0,0,0,.18);word-break:break-all;">
          ${safeActionUrl}
        </div>
      </div>
    </div>

    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${footer}</div>
  </div>
</div>
`.trim();

  return wrapEmailDoc(inner);
}

async function sendMail({ to, subject, html }) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(t("bases.mail.noSession"));

  const res = await fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, subject, html }),
  });

  if (!res.ok) {
    console.warn("[bases] sendMail failed:", await res.text());
    throw new Error(t("bases.mail.failed"));
  }
}

async function sendBaseShareEmail({ to, link, baseName, ownerLabel }) {
  const actionUrl = mailLink(link);
  const html = buildMailHtml({
    title: t("bases.mail.title"),
    body: t("bases.mail.body", { owner: ownerLabel || "—", base: baseName || "—" }),
    actionLabel: t("bases.mail.action"),
    actionUrl,
  });
  await sendMail({
    to,
    subject: t("bases.mail.subject", { base: baseName || "—" }),
    html,
  });
}


async function openShareModal() {
  setMsg(shareMsg, "");
  shareEmail.value = "";
  shareRoleSelect?.setValue("editor", { silent: true });
  await renderShareModal();
  show(shareOverlay, true);
  enterModalSheet(shareOverlay, { backBtn: btnBack, onClose: closeShareModal });
}

function closeShareModal() {
  show(shareOverlay, false);
  exitModalSheet(shareOverlay);

  // Odśwież status kafelków po zamknięciu modala (shareCount / udostępnione listy).
  // Fire-and-forget: UI wraca natychmiast, a odświeżenie dociągnie dane w tle.
  void refreshView({ withBadge: true });
}

function invalidateShareModalCache(baseId) {
  if (!baseId) return;
  shareModalCache.delete(String(baseId));
}

function getShareModalCache(baseId) {
  const key = String(baseId || "");
  if (!key) return null;
  const cached = shareModalCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > SHARE_MODAL_CACHE_TTL_MS) {
    shareModalCache.delete(key);
    return null;
  }
  return cached.payload;
}

function setShareModalCache(baseId, payload) {
  const key = String(baseId || "");
  if (!key || !payload) return;
  shareModalCache.set(key, { ts: Date.now(), payload });
}

function msLeftLabel(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

async function getCooldownUntil(baseId, userId) {
  const { data, error } = await sb().rpc("base_share_cooldown_until", {
    p_base_id: baseId,
    p_recipient_user_id: userId,
  });
  if (error) {
    console.warn("[bases] base_share_cooldown_until error:", error);
    return null;
  }
  return data ? new Date(data).getTime() : null;
}

async function renderShareModal() {
  const b = selectedBase();
  if (!b || !isOwner(b)) {
    if (sharePendingList) sharePendingList.innerHTML = "";
    if (shareSharedList) shareSharedList.innerHTML = "";
    return;
  }

  // Reset UI
  if (shareEmail) shareEmail.value = "";
  if (shareEmailError) shareEmailError.style.display = "none";
  setMsg(shareMsg, "");
  shareRoleSelect?.setValue("editor", { silent: true });
  shareRecipientTypeSelect?.setValue("email", { silent: true });
  onRecipientTypeChange("email");
  shareSubscriberSelectInst?.setValue("", { silent: true });

  const cached = getShareModalCache(b.id);
  let registeredSubs = cached?.registeredSubs || [];
  let pending = cached?.pending || [];
  let shared = cached?.shared || [];

  if (!cached) {
    const [subsRes, pendingRes, sharedRes] = await Promise.all([
      sb().rpc("polls_hub_list_my_subscribers"),
      sb().rpc("list_base_share_tasks_outgoing", { p_base_id: b.id }),
      sb().rpc("list_base_shares", { p_base_id: b.id }),
    ]);

    if (subsRes.error) console.warn("[bases] polls_hub_list_my_subscriptions error:", subsRes.error);
    if (pendingRes.error) console.warn("[bases] list_base_share_tasks_outgoing error:", pendingRes.error);
    if (sharedRes.error) console.warn("[bases] list_base_shares error:", sharedRes.error);

    registeredSubs = (subsRes.data || [])
      .filter((r) => r.status === "active")
      .filter((r) => !!r.subscriber_user_id);
    pending = pendingRes.data || [];
    shared = sharedRes.data || [];

    setShareModalCache(b.id, { registeredSubs, pending, shared });
  }

  // Populate subscriber select
  if (shareSubscriberSelectInst) {
    const subOptions = registeredSubs.map((r) => ({
      value: r.subscriber_user_id,
      label: r.subscriber_username || r.subscriber_email || r.subscriber_label || "—",
    }));
    if (!subOptions.length) {
      subOptions.push({ value: "", label: t("bases.shareModal.noSubscribers") || "Brak subskrybentów" });
    }
    shareSubscriberSelectInst.setOptions(subOptions);
    shareSubscriberSelectInst.setValue("", { silent: true });
  }

  const sharedByUser = new Map((shared || []).map((x) => [x.user_id, x]));
  const pendingByUser = new Map(
    (pending || [])
      .filter((x) => x.recipient_user_id)
      .map((x) => [x.recipient_user_id, x])
  );

  // ── PENDING LIST (wszyscy oczekujący) ──
  if (sharePendingList) {
    const rows = pending || [];
    if (!rows.length) {
      sharePendingList.innerHTML = `<div style="opacity:.75">${t("bases.shareModal.emptyPending")}</div>`;
    } else {
      sharePendingList.innerHTML = "";
      for (const r of rows) {
        const label = r.recipient_username || r.recipient_email || "—";
        const title = r.recipient_email || label;

        const row = document.createElement("div");
        row.className = "shareRow";
        row.innerHTML = `
          <div class="shareEmail" title="${escapeHtml(title)}">
            ${escapeHtml(label)}
          </div>
          <div class="shareRowActions">
            <button class="btn xsm" data-cancel type="button" title="${escapeHtml(t("bases.shareModal.cancelPending"))}">${icon("trash")}</button>
          </div>
        `;

        row.querySelector("[data-cancel]")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          setMsg(shareMsg, "");
          if (r.task_id) {
            const { data: ok, error } = await sb().rpc("base_share_cancel_task", { p_task_id: r.task_id });
            if (error || !ok) {
              await alertModal({ text: t("bases.share.failed") });
              return;
            }
            invalidateShareModalCache(b.id);
            await renderShareModal();
          }
        });
        sharePendingList.appendChild(row);
      }
    }
  }

  // ── SHARED LIST (aktywni - którzy zaakceptowali) ──
  if (shareSharedList) {
    const rows = shared || [];
    if (!rows.length) {
      shareSharedList.innerHTML = `<div style="opacity:.75">${t("bases.shareModal.emptyShared")}</div>`;
    } else {
      shareSharedList.innerHTML = "";
      for (const r of rows) {
        const userId = r.user_id;
        const label = r.email || r.username || "—";
        const title = r.email || label;
        const role = r.role || "viewer";

        const row = document.createElement("div");
        row.className = "shareRow";
        row.innerHTML = `
          <div class="shareEmail" title="${escapeHtml(title)}">
            ${escapeHtml(label)}
          </div>
          <div class="shareRowActions">
            <div class="ui-select share-role-select" data-user-id="${escapeHtml(userId)}">
              <button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
                <span class="ui-select-label">—</span>
                <span class="ui-select-caret" aria-hidden="true"><i class="ico" data-icon="caret-down"></i></span>
              </button>
              <div class="ui-select-menu" role="listbox"></div>
            </div>
            <button class="btn xsm" data-x type="button" title="${escapeHtml(t("bases.share.remove"))}">${icon("trash")}</button>
          </div>
        `;

        // Zmiana roli
        const roleSelectEl = row.querySelector(".share-role-select");
        const roleSelectInst = initUiSelect(roleSelectEl, {
          options: [
            { value: "editor", label: t("bases.share.roleEditor") || "Edycja" },
            { value: "viewer", label: t("bases.share.roleViewer") || "Przeglądanie" },
          ],
          value: role,
          onChange: async (newRole) => {
            const selUserId = roleSelectEl?.dataset.userId;
            if (!selUserId) return;
            roleSelectInst?.setDisabled(true);
            setMsg(shareMsg, "");

            const { data, error } = await sb().rpc("update_base_share_role", {
              p_base_id: b.id,
              p_user_id: selUserId,
              p_role: newRole,
            });

            roleSelectInst?.setDisabled(false);
            const rowRes = Array.isArray(data) ? data[0] : data;
            const ok = !error && !!rowRes?.ok;
            invalidateShareModalCache(b.id);
            await renderShareModal(); // czyści komunikat -- ustawiamy go dopiero potem
            setMsg(shareMsg, ok ? t("bases.share.roleChanged") : t("bases.share.failed"));
          },
        });

        // Usuń
        row.querySelector("[data-x]")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await confirmModal({
            title: t("bases.share.removeTitle"),
            text: t("bases.share.removeText", { email: label }),
            okText: t("bases.share.removeOk"),
            cancelText: t("bases.share.removeCancel"),
          });
          if (!ok) return;
          const { data: ok2, error } = await sb().rpc("revoke_base_share", { p_base_id: b.id, p_user_id: userId });
          if (error || ok2 !== true) {
            await alertModal({ text: t("bases.share.failed") });
            return;
          }
          invalidateShareModalCache(b.id);
          await renderShareModal();
        });
        shareSharedList.appendChild(row);
      }
    }
  }
}

// Enter w polu + klik "Dodaj" (albo dwa kliki) nie mogą wysłać dwóch zaproszeń/maili.
let shareAddInFlight = false;

async function shareAdd() {
  if (shareAddInFlight) return;
  shareAddInFlight = true;
  if (btnShareAdd) btnShareAdd.disabled = true;
  try {
    await shareAddInner();
  } finally {
    shareAddInFlight = false;
    if (btnShareAdd) btnShareAdd.disabled = false;
  }
}

async function shareAddInner() {
  const b = selectedBase();
  if (!b || !isOwner(b)) return;

  const recipientType = shareRecipientTypeSelect?.getValue?.() || "email";
  const role = shareRoleSelect?.getValue?.() || "editor";
  let targetEmail = "";
  let targetUserId = null;

  if (recipientType === "email") {
    const raw = String(shareEmail.value || "").trim();
    if (!raw) {
      setMsg(shareMsg, t("bases.share.enterEmail") || "Wpisz adres email lub nazwę użytkownika");
      return;
    }
    targetEmail = await resolveLoginToEmail(raw);
    if (!emailLooksOk(targetEmail)) {
      if (shareEmailError) {
        shareEmailError.textContent = raw.includes("@") ? t("bases.share.invalidEmail") : t("bases.share.unknownUser");
        shareEmailError.style.display = "block";
      }
      return;
    }
    if (shareEmailError) shareEmailError.style.display = "none";
  } else {
    targetUserId = shareSubscriberSelectInst?.getValue?.();
    if (!targetUserId) {
      setMsg(shareMsg, t("bases.share.selectSubscriber") || "Wybierz subskrybenta");
      return;
    }
  }

  // właściciel próbuje udostępnić samemu sobie
  const me = String(currentUser?.email || "").trim().toLowerCase();
  if (me && targetEmail === me) {
    setMsg(shareMsg, t("bases.share.owner"));
    return;
  }

  setMsg(shareMsg, "");

  let data, error;
  if (targetUserId) {
    ({ data, error } = await sb().rpc("base_share_by_user", {
      p_base_id: b.id,
      p_recipient_user_id: targetUserId,
      p_role: role,
    }));
  } else {
    ({ data, error } = await sb().rpc("base_share_by_email", {
      p_base_id: b.id,
      p_email: targetEmail,
      p_role: role,
    }));
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row?.ok) {
    const err = row?.err || "";
    if (err === "cooldown") setMsg(shareMsg, t("bases.share.cooldown"));
    else if (err === "already_pending") setMsg(shareMsg, t("bases.share.alreadyPending"));
    else setMsg(shareMsg, t("bases.share.failed"));
    return;
  }
  
  // jeśli mail_to/link są obecne – wysyłamy maila
  let mailFailed = false;
  if (row?.mail_to && row?.mail_link) {
    try {
      await sendBaseShareEmail({
        to: row.mail_to,
        link: row.mail_link,
        baseName: row.base_name,
        ownerLabel: row.owner_label,
      });
    } catch (e) {
      console.warn("[bases] email send failed:", e);
      mailFailed = true;
    }
  }

  invalidateShareModalCache(b.id);
  // renderShareModal() czyści formularz i komunikat -- komunikat ustawiamy PO nim,
  // inaczej "mail nie wyszedł" (zaproszenie istnieje) znikałby bez śladu.
  await renderShareModal();
  setMsg(shareMsg, mailFailed ? t("bases.share.emailFailed") : t("bases.share.success"));
}

/* ================= Wypustki (mine/shared) ================= */
const TAB_STORAGE_KEY = "basesMobileTab";
let activeTab = "mine";

function setActiveTab(tab, { remember = true } = {}) {
  if (guestMode) tab = "mine";
  activeTab = tab === "shared" ? "shared" : "mine";
  const mineOn = activeTab === "mine";
  basesSectionMine?.classList.toggle("active", mineOn);
  basesSectionShared?.classList.toggle("active", !mineOn);
  for (const [btn, on] of [[tabBasesMine, mineOn], [tabBasesShared, !mineOn]]) {
    btn?.closest(".tab-slot")?.classList.toggle("active", on);
    btn?.setAttribute("aria-selected", on ? "true" : "false");
  }
  setHint(mineOn ? t("bases.headerHint") : t("bases.headerHintShared"));
  if (remember) {
    try { sessionStorage.setItem(TAB_STORAGE_KEY, activeTab); } catch {}
  }
}

function storedTab() {
  try { return sessionStorage.getItem(TAB_STORAGE_KEY) === "shared" ? "shared" : "mine"; } catch { return "mine"; }
}

function setSharedBasesBadge(n) {
  if (!basesSharedBadge) return;
  const v = Number(n || 0);
  basesSharedBadge.textContent = v > 99 ? "99+" : (v > 0 ? String(v) : "");
  basesSharedBadge.classList.toggle("is-empty", !(v > 0));
}

/* ================= Render kafelków ================= */
function render() {
  if (!mineGrid || !sharedGrid) return;

  mineGrid.innerHTML = "";
  sharedGrid.innerHTML = "";

  const renderTile = (b, hostEl) => {
    const tile = document.createElement("div");
    tile.className = "card";
    tile.dataset.baseId = b.id;
    if (b.id === selectedId) tile.classList.add("selected");
    if (b.proposed) tile.classList.add("proposed");
    const badges = [];

    if (b.proposed) {
      badges.push({
        text: t("bases.badges.proposed"),
        title: t("bases.badges.proposedTitle"),
        kind: "proposed",
      });
    }
    
    // Udostępniona (albo dopiero proponowana) -- ta sama informacja "od kogo"
    // i z jakim dostępem; dla zaproszenia rola pochodzi z proposed_role.
    const shareRole = b.sharedRole || (b.proposed ? b.proposedRole : null);
    if (shareRole) {
      const ownerUn = String(b.ownerUsername || "").trim();
      const ownerMail = String(b.ownerEmail || "").trim();
      const fromLabel = ownerUn || ownerMail || "—";

      badges.push({
        text: t("bases.badges.from", { name: fromLabel }),
        title: ownerMail ? ownerMail : fromLabel,
        kind: "from",
      });

      const isEdit = shareRole === "editor";
      badges.push({
        icon: isEdit ? "edit-paper" : "eye",
        text: "",
        title: isEdit ? t("bases.badges.editAccess") : t("bases.badges.viewAccess"),
        kind: "role",
      });
    } else {
      const n = Number(b.shareCount || 0);
      badges.push(
        n > 0
          ? { icon: "people", text: String(n), title: t("bases.badges.sharedOthers", { count: n }), kind: "mine" }
          : { icon: "person", text: "", title: t("bases.badges.notShared"), kind: "mine" }
      );
    }

    const canDeleteOwned = isOwner(b);
    const canLeaveShared = !!b.sharedRole && !b.proposed;
    const deleteBtn = (canDeleteOwned || canLeaveShared)
      ? `<button class="x" type="button" title="${escapeHtml(
          canDeleteOwned ? t("bases.actions.remove") : t("bases.actions.leaveShared")
        )}">${icon("trash")}</button>`
      : ``;
      
    const proposedBtns = b.proposed
      ? `
        <div class="tileMiniActions">
          <button class="btn xsm gold" data-accept type="button" title="${escapeHtml(t("bases.proposed.accept"))}" aria-label="${escapeHtml(t("bases.proposed.accept"))}">${icon("check")}</button>
          <button class="btn xsm" data-decline type="button" title="${escapeHtml(t("bases.proposed.decline"))}" aria-label="${escapeHtml(t("bases.proposed.decline"))}">${icon("cancel")}</button>
        </div>`
      : "";

    const badgesHtml = badges.length
      ? badges
          .map(
            (x) =>
              `<span class="tileBadge" data-kind="${escapeHtml(x.kind)}" title="${escapeHtml(
                x.title || ""
              )}">${x.icon ? icon(x.icon) : ""}${escapeHtml(x.text || "")}</span>`
          )
          .join("")
      : "";

      tile.innerHTML = `
        ${deleteBtn}
        <div>
          <div class="name">${escapeHtml(b.name || t("bases.defaults.baseLabel"))}</div>
          <div class="meta">${badgesHtml}</div>
        </div>
        ${proposedBtns}
      `;
    
    if (b.proposed) {
      const respond = (rpcName) => async (e) => {
        e.stopPropagation();
        const btns = tile.querySelectorAll("[data-accept],[data-decline]");
        if ([...btns].some((x) => x.disabled)) return;
        btns.forEach((x) => { x.disabled = true; });
        const { data: ok, error } = await sb().rpc(rpcName, { p_task_id: b.taskId });
        if (error || ok !== true) {
          btns.forEach((x) => { x.disabled = false; });
          await alertModal({ text: t("bases.proposed.failed") });
        }
        await refreshView();
      };
      tile.querySelector("[data-accept]")?.addEventListener("click", respond("base_share_accept"));
      tile.querySelector("[data-decline]")?.addEventListener("click", respond("base_share_decline"));
    }

    // Zaznaczenie NIE przebudowuje kafelków (tylko przełącza klasę) -- inaczej
    // drugi tap podwójnego tapnięcia trafia w nowy element i zmiana nazwy
    // na dotyku nigdy się nie uruchamia (rename-gesture.js liczy tapnięcia
    // per element).
    tile.addEventListener("click", () => {
      selectBase(selectedId === b.id ? null : b.id);
    });

    const x = tile.querySelector(".x");
    if (x) {
      x.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (isOwner(b)) {
          await deleteBase(b);
        } else {
          await leaveSharedBase(b);
        }
        await refreshView();
      });
    }

    addRenameGesture(tile, (e) => {
      if (!isOwner(b)) return;
      if (e.target?.closest?.(".x")) return;
      selectBase(b.id);
      openNameModalRename(b);
    });

    hostEl.appendChild(tile);
  };

  // ===== MOJE (z kafelkiem +) =====
  const tNew = document.createElement("div");
  tNew.className = "addCard";
  tNew.innerHTML = `
    <div class="plus">${icon("plus")}</div>
    <div class="name">${escapeHtml(t("bases.sections.newBase"))}</div>
  `;
  tNew.addEventListener("click", () => openNameModalCreate());
  mineGrid.appendChild(tNew);

  for (const b of ownedBases) renderTile(b, mineGrid);

  // ===== UDOSTĘPNIONE =====
  if (!guestMode) {
    if (!sharedBases.length) {
      const empty = document.createElement("div");
      empty.className = "addCard";
      empty.style.cursor = "default";
      empty.style.pointerEvents = "none";
      empty.innerHTML = `
        <div class="txt">${escapeHtml(t("bases.sections.sharedEmpty"))}</div>
        <div class="sub">${escapeHtml(t("bases.sections.sharedEmptyHint"))}</div>
      `;
      sharedGrid.appendChild(empty);
    } else {
      for (const b of sharedBases) renderTile(b, sharedGrid);
    }
  }

  // mobile badge: pending invites in "shared"
  setSharedBasesBadge(sharedBases.filter((b) => !!b.proposed).length);
}


function selectBase(id) {
  selectedId = id;
  for (const el of document.querySelectorAll(".bases-section .card[data-base-id]")) {
    el.classList.toggle("selected", el.dataset.baseId === selectedId);
  }
  setButtonsState();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ================= Modals: nazwa ================= */
function openNameModalCreate() {
  nameMode = "create";
  setMsg(nameMsg, "");
  nameTitle.textContent = t("bases.nameModal.titleCreate");
  nameSub.textContent = t("bases.nameModal.subCreate");
  nameInp.value = "";
  show(nameOverlay, true);
  enterModalSheet(nameOverlay, { backBtn: btnBack, onClose: closeNameModal });
  setTimeout(() => nameInp.focus(), 0);
}

function openNameModalRename(base) {
  nameMode = "rename";
  renameBaseId = base?.id || null;
  setMsg(nameMsg, "");
  nameTitle.textContent = t("bases.nameModal.titleRename");
  nameSub.textContent = t("bases.nameModal.subRename");
  nameInp.value = base?.name || "";
  show(nameOverlay, true);
  enterModalSheet(nameOverlay, { backBtn: btnBack, onClose: closeNameModal });
  setTimeout(() => nameInp.select(), 0);
}

function closeNameModal() {
  show(nameOverlay, false);
  exitModalSheet(nameOverlay);
}

async function nameOk() {
  if (btnNameOk?.disabled) return;
  if (btnNameOk) btnNameOk.disabled = true;
  setMsg(nameMsg, "");
  const val = safeName(nameInp.value);
  try {
    if (nameMode === "create") {
      const b = await createBase(val);
      selectedId = b.id;
      setActiveTab("mine");
    } else {
      const b = ownedBases.find((x) => x.id === renameBaseId);
      if (b && isOwner(b)) {
        await renameBase(b.id, val);
      }
    }
    closeNameModal();
    await refreshView();
  } catch (e) {
    console.warn("[bases] name ok error:", e);
    setMsg(nameMsg, e?.code === ROW_GONE ? t("resourceLock.goneMessage") : t("bases.nameModal.failed"));
  } finally {
    if (btnNameOk) btnNameOk.disabled = false;
  }
}

/* ================= Modal import ================= */
let importParsed = null;

function importResetState() {
  importParsed = null;
  if (importErr) { importErr.style.display = "none"; importErr.textContent = ""; }
  if (btnImportJson) btnImportJson.disabled = true;
}

function openImportModal() {
  importResetState();
  if (importFile) importFile.value = "";
  setMsg(importMsg, "");
  showProgBlock(importProg, false);
  show(importOverlay, true);
  enterModalSheet(importOverlay, { backBtn: btnBack, onClose: closeImportModal });
}

function closeImportModal() {
  show(importOverlay, false);
  exitModalSheet(importOverlay);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error(t("bases.import.fileReadFailed")));
    r.readAsText(file);
  });
}


function getRetParam() {
  return new URLSearchParams(location.search).get("ret");
}

function getBackLink() {
  const rawRet = getRetParam();
  return withLangParam(rawRet || "games");
}

function getCurrentRelativeUrl() {
  return `${location.pathname.split("/").pop() || "bases"}${location.search}${location.hash}`;
}

function buildManualUrl() {
  const url = new URL("manual", location.href);
  url.searchParams.set("ret", getCurrentRelativeUrl());
  url.searchParams.set("lang", getUiLang() || "pl");
  url.hash = "bases";
  return url.toString();
}

document.addEventListener("DOMContentLoaded", () => {
  btnGoAlt?.addEventListener("click", async () => {
    const page = document.body.dataset.altPage || "subscriptions";
    location.href = `${page}?ret=${encodeURIComponent(getCurrentRelativeUrl())}`;
  });

  // Znacznik dla contact-modal.js (współdzielony przez wiele stron poza
  // zakresem sheet mode) -- pozwala mu znaleźć WYŁĄCZNIE przyciski, których
  // handler faktycznie respektuje handleSheetBack(), zamiast każdego
  // #btnBack na jakiejkolwiek stronie w aplikacji.
  if (btnBack) btnBack.dataset.sheetBack = "1";
  btnBack?.addEventListener("click", () => {
    if (handleSheetBack()) return;
    location.href = getBackLink();
  });

  btnManual?.addEventListener("click", () => {
    location.href = buildManualUrl();
  });

  btnBrowse?.addEventListener("click", () => {
    const b = selectedBase();
    if (!b) return;
    location.href = `base-explorer?base=${encodeURIComponent(b.id)}`;
  });

  btnShare?.addEventListener("click", async () => {
    const b = selectedBase();
    if (!b || !isOwner(b)) return;
    await openShareModal();
  });

  btnExport?.addEventListener("click", async () => {
    const b = selectedBase();
    if (!b || btnExport?.disabled) return;

    show(exportJsonOverlay, true);
    if (exportJsonSub) exportJsonSub.textContent = t("bases.exportModal.subtitle");
    setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, {
      step: t("bases.export.steps.start"), i: 0, n: 6, msg: "",
    });
    if (btnExport) btnExport.disabled = true;

    try {
      const out = await exportBase(b.id, ({ step, i, n, msg } = {}) => {
        setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, { step, i, n, msg });
      });
      downloadJson(safeDownloadName(b.name), out);
      show(exportJsonOverlay, false);
    } catch (e) {
      console.warn("[bases] export error:", e);
      setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, {
        step: t("bases.export.errorStep"), i: 0, n: 1, msg: e?.message || t("bases.export.failed"), isError: true,
      });
      setTimeout(() => show(exportJsonOverlay, false), 3000);
    } finally {
      if (btnExport) btnExport.disabled = false;
    }
  });

  btnImport?.addEventListener("click", () => openImportModal());

  // Wczytanie pliku → walidacja, bez podglądu
  importFile?.addEventListener("change", async () => {
    importResetState();
    const f = importFile?.files?.[0];
    if (!f) return;
    try {
      const obj = JSON.parse(await readFileAsText(f));
      if (!isValidImportPayload(obj)) throw new Error(t("bases.import.invalidFormat"));
      importParsed = obj;
      if (btnImportJson) btnImportJson.disabled = false;
    } catch (e) {
      if (importErr) { importErr.textContent = e?.message || t("bases.import.invalidJson"); importErr.style.display = ""; }
    }
  });

  btnImportJson?.addEventListener("click", async () => {
    if (btnImportJson?.disabled || !importParsed) return;
    const payload = importParsed;
    const qCount = Array.isArray(payload?.questions) ? payload.questions.length : 0;

    setMsg(importMsg, "");
    showProgBlock(importProg, true);
    setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
      step: t("bases.import.steps.start"), i: 0, n: qCount, msg: "",
    });
    if (btnImportJson) btnImportJson.disabled = true;
    if (btnCancelImport) btnCancelImport.disabled = true;
    if (importFile) importFile.disabled = true;

    try {
      const newId = await importBase(payload, ({ step, i, n, msg } = {}) => {
        setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
          step: step || t("bases.import.steps.default"), i, n, msg,
        });
      });
      selectedId = newId;
      setActiveTab("mine");
      closeImportModal();
      await refreshView();
    } catch (e) {
      console.warn("[bases] import error:", e);
      setMsg(importMsg, t("bases.import.failed"));
      setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
        step: t("bases.import.errorStep"), i: 0, n: 1, msg: e?.message || t("bases.import.errorMsg"), isError: true,
      });
    } finally {
      showProgBlock(importProg, false);
      if (btnImportJson) btnImportJson.disabled = !importParsed;
      if (btnCancelImport) btnCancelImport.disabled = false;
      if (importFile) importFile.disabled = false;
    }
  });

  btnCancelImport?.addEventListener("click", () => closeImportModal());

  btnNameCancel?.addEventListener("click", () => closeNameModal());
  btnNameOk?.addEventListener("click", () => nameOk());
  nameInp?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameOk();
    if (e.key === "Escape") closeNameModal();
  });

  btnShareClose?.addEventListener("click", () => closeShareModal());
  btnShareAdd?.addEventListener("click", async () => shareAdd());
  shareEmail?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") shareAdd();
  });

  [nameOverlay, importOverlay, shareOverlay].forEach((ov) => {
    ov?.addEventListener("click", (e) => {
      if (e.target !== ov) return;
      // W trybie sheet (mobile) modal zastępuje treść strony — jedynym
      // wyjściem ma być widoczny przycisk zamknięcia/anuluj, nie klik w tło.
      if (ov.classList.contains("modal--sheet") && isSheetViewport()) return;
      if (ov === nameOverlay) closeNameModal();
      if (ov === importOverlay) closeImportModal();
      if (ov === shareOverlay) closeShareModal();
    });
  });
});


async function refreshAltBadge() {
  try {
    const { data, error } = await sb().rpc("polls_badge_get");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const n = Number(row?.subs_pending || 0);
    if (!altBadgeEl || !btnGoAlt) return;
    altBadgeEl.textContent = n > 99 ? "99+" : (n > 0 ? String(n) : "");
    btnGoAlt.classList.toggle("has-badge", n > 0);
  } catch {}
}

/* ================= Init ================= */
function removeShareParam() {
  try {
    const u = new URL(location.href);
    u.searchParams.delete("share");
    history.replaceState(history.state, "", u.toString());
  } catch {}
}

// Wejście z maila: ?share=<token>. Sama decyzja (przyjmij/odrzuć) jest na
// kafelku zaproszenia -- tu tylko wyjaśniamy, dlaczego kafelka może nie być.
async function handleShareLink(token) {
  let info = null;
  try {
    const { data, error } = await sb().rpc("base_share_token_info", { p_token: token });
    if (error) throw error;
    // RPC zwraca TABLE -> supabase-js daje tablicę
    info = Array.isArray(data) ? (data[0] || null) : (data || null);
  } catch (e) {
    console.warn("[bases] token info failed:", e);
    return; // nie wiemy nic pewnego -- lepiej nie straszyć komunikatem
  }

  if (!info) {
    // zadania starsze niż 5 dni są kasowane (base_share_tasks_cleanup)
    await alertModal({ text: t("bases.proposed.expired") });
  } else if (info.recipient_user_id && info.recipient_user_id !== currentUser?.id) {
    await alertModal({ text: t("bases.proposed.mismatch") });
    return; // zostaw ?share= -- po przelogowaniu na właściwe konto link dalej działa
  } else if (info.status === "cancelled") {
    await alertModal({ text: t("bases.proposed.cancelled") });
  } else if (info.status === "pending" || info.status === "opened") {
    setActiveTab("shared");
    const invite = sharedBases.find((b) => b.proposed && b.id === info.base_id);
    if (invite) selectBase(invite.id);
  } else {
    // done / declined
    await alertModal({ text: t("bases.proposed.handled") });
    if (info.status === "done" && sharedBases.some((b) => b.id === info.base_id)) {
      setActiveTab("shared");
      selectBase(info.base_id);
    }
  }
  removeShareParam();
}

// PWA: otwarcie pliku .fambase z systemu (manifest.json -> file_handlers).
function initFileLaunch() {
  if (!("launchQueue" in window)) return;
  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files?.length) return;
    const file = await launchParams.files[0].getFile();
    openImportModal();
    const dt = new DataTransfer();
    dt.items.add(file);
    if (importFile) {
      importFile.files = dt.files;
      importFile.dispatchEvent(new Event("change"));
    }
  });
}

(async function init() {
  currentUser = await requireAuth("login");
  if (!currentUser) return;
  guestMode = isGuestUser(currentUser);
  if (guestMode) {
    document.body.classList.add("bases-guest");
    hideForGuest(currentUser, [btnGoAlt, btnShare, basesSectionShared]);
    tabBasesShared?.closest(".tab-slot")?.remove();
  }
  initTopbarAccountDropdown(currentUser);
  document.querySelector('.topbar')?.classList.add('topbar-ready');

  setActiveTab(storedTab(), { remember: false });
  tabBasesMine?.addEventListener("click", () => setActiveTab("mine"));
  tabBasesShared?.addEventListener("click", () => setActiveTab("shared"));

  initShareRoleSelect();
  initShareRecipientTypeSelect();
  initShareSubscriberSelect();
  window.addEventListener("i18n:lang", () => {
    initShareRoleSelect();
    initShareRecipientTypeSelect();
    initShareSubscriberSelect();
    setActiveTab(activeTab, { remember: false }); // podpowiedź w nowym języku
    render();
    setButtonsState();
  });

  initFileLaunch();

  const loaded = await refreshView({ withBadge: !guestMode });
  document.querySelectorAll('[data-skel-step]').forEach(el => el.classList.add('skel-step-ready'));
  if (!loaded) setHint(t("bases.loadFailed"));

  // auto refresh jak w polls-hub
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else startAutoRefresh();
  });
  startAutoRefresh();

  const shareToken = new URLSearchParams(location.search).get("share");
  if (!guestMode && shareToken && loaded) await handleShareLink(shareToken);
})();
