// js/pages/bases.js
// Builder baz pytań (warstwa 1) – styl i ergonomia jak builder gier.

import { sb, SUPABASE_URL } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { alertModal, confirmModal } from "../core/modal.js";
import { initUiSelect } from "../core/ui-select.js";
import { getUiLang, initI18n, t } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

/* ================= DOM ================= */
const mineGrid = document.getElementById("mineGrid");
const sharedGrid = document.getElementById("sharedGrid");
const mineTitle = document.getElementById("mineTitle");
const sharedTitle = document.getElementById("sharedTitle");

// mobile tabs (mine/shared)
const basesTabsMobile = document.getElementById("basesTabsMobile");
const tabBasesMineMobile = document.getElementById("tabBasesMineMobile");
const tabBasesSharedMobile = document.getElementById("tabBasesSharedMobile");
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
const btnImportFile = document.getElementById("btnImportFile");
const btnImportJson = document.getElementById("btnImportJson");
const btnCancelImport = document.getElementById("btnCancelImport");
const importTa = document.getElementById("importTa");
const importMsg = document.getElementById("importMsg");

// Import progress (modal importu)
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
const shareSubsList = document.getElementById("shareSubsList");
const sharePendingList = document.getElementById("sharePendingList");
const shareSharedList = document.getElementById("shareSharedList");

const shareEmail = document.getElementById("shareEmail");
const shareRole = document.getElementById("shareRole");
const btnShareAdd = document.getElementById("btnShareAdd");
const btnShareClose = document.getElementById("btnShareClose");
const shareMsg = document.getElementById("shareMsg");

const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;

/* ================= STATE ================= */
let currentUser = null;
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
  return ovs.some((ov) => ov && (ov.style.display === "grid" || ov.style.display === "block" || ov.style.display === ""));
}

async function refreshView() {
  if (basesRefreshInFlight) return basesRefreshInFlight;
  basesRefreshInFlight = (async () => {
    await refreshBases();
    await refreshAltBadge();
    render();
    setButtonsState();
  })();
  try {
    await basesRefreshInFlight;
  } finally {
    basesRefreshInFlight = null;
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer) return;
  autoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    if (anyOverlayOpen()) return;
    void refreshView();
  }, 20000);
}

function stopAutoRefresh() {
  if (!autoRefreshTimer) return;
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

let shareRoleSelect = null;
const SHARE_MODAL_CACHE_TTL_MS = 20_000;
const shareModalCache = new Map();

// modal nazwy – tryb
let nameMode = "create"; // 'create' | 'rename'

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

function safeName(s) {
  return (String(s ?? "").trim() || t("bases.defaults.name")).slice(0, 80);
}

function safeDownloadName(name) {
  const base = String(name || t("bases.defaults.slug"))
    .replace(/[^\w\d\- ]+/g, "")
    .trim()
    .slice(0, 40) || t("bases.defaults.slug");
  return `${base}.json`;
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
  const hasSel = !!b;
  const owner = b ? isOwner(b) : false;

  // Przeglądanie: każdy z dostępem
  if (btnBrowse) btnBrowse.disabled = !hasSel;

  // Udostępnianie: tylko owner
  if (btnShare) btnShare.disabled = !hasSel || !owner;

  // Eksport: każdy z dostępem
  if (btnExport) btnExport.disabled = !hasSel;
}

function showProgBlock(el, on) {
  if (!el) return;
  el.style.display = on ? "grid" : "none";
}

function setProgUi(stepEl, countEl, barEl, msgEl, { step, i, n, msg } = {}) {
  if (stepEl && step != null) stepEl.textContent = String(step);
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
    .order("updated_at", { ascending: false });

  if (error) throw error;
  // RLS i tak ograniczy do tych, do których masz dostęp, ale owner_id pozwoli nam odfiltrować.
  return (data || []).filter((b) => b.owner_id === currentUser.id);
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

  const shared = await listSharedBases();

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
  const { error } = await sb()
    .from("question_bases")
    .update({ name: safeName(newName), updated_at: new Date().toISOString() })
    .eq("id", baseId);
  if (error) throw error;
}

async function deleteBase(base) {
  const ok = await confirmModal({
    title: t("bases.delete.title"),
    text: t("bases.delete.text", { name: base.name }),
    okText: t("bases.delete.ok"),
    cancelText: t("bases.delete.cancel"),
  });
  if (!ok) return;

  const { error } = await sb().from("question_bases").delete().eq("id", base.id);
  if (error) {
    console.warn("[bases] delete error:", error);
    void alertModal({ text: t("bases.delete.failed") });
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
async function exportBase(baseId, onProgress) {
  const prog = (step, i, n, msg) => {
    if (typeof onProgress === "function") onProgress({ step, i, n, msg });
  };
  const { data: baseRow, error: bErr } = await sb()
    .from("question_bases")
    .select("id,name,owner_id,created_at,updated_at")
    .eq("id", baseId)
    .single();
  if (bErr) throw bErr;
  prog(t("bases.export.steps.base"), 1, 5, "");

  const { data: cats, error: cErr } = await sb()
    .from("qb_categories")
    .select("id,parent_id,name,ord")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });
  if (cErr) throw cErr;
  prog(t("bases.export.steps.folders"), 2, 5, "");

  const { data: qs, error: qErr } = await sb()
    .from("qb_questions")
    .select("id,category_id,ord,payload")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });
  if (qErr) throw qErr;
  prog(
    t("bases.export.steps.questions"),
    3,
    5,
    t("bases.export.count", { count: (qs || []).length })
  );
  
  const { data: tags, error: tErr } = await sb()
    .from("qb_tags")
    .select("id,name,color,ord")
    .eq("base_id", baseId)
    .order("ord", { ascending: true });
  if (tErr) throw tErr;
  prog(
    t("bases.export.steps.questions"),
    3,
    5,
    t("bases.export.count", { count: (qs || []).length })
  );
  
  // powiązania tagów (po pytaniach z tej bazy)
  const qIds = (qs || []).map((q) => q.id);
  let qtags = [];
  if (qIds.length) {
    const { data: qt, error: qtErr } = await sb()
      .from("qb_question_tags")
      .select("question_id,tag_id")
      .in("question_id", qIds);
    if (qtErr) throw qtErr;
    qtags = qt || [];
  }
  prog(
    t("bases.export.steps.questionTags"),
    5,
    5,
    t("bases.export.count", { count: (qtags || []).length })
  );
  
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
  };
}

function isValidImportPayload(p) {
  return !!p && typeof p === "object" && p.base && Array.isArray(p.questions);
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

  const oldToNewCat = new Map();
  const oldToNewTag = new Map();
  const oldToNewQ = new Map();

  // 1) Kategorie – w kolejności topologicznej (rooty → dzieci)
  prog(t("bases.import.steps.categories"), 2, 5, "");
  const cats = Array.isArray(payload.categories) ? payload.categories : [];
  const byParent = new Map();
  for (const c of cats) {
    const key = c.parent_id || "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  }
  // sortuj po ord, żeby zachować porządek
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (Number(a.ord) || 0) - (Number(b.ord) || 0));
  }

  async function insertCatSubtree(parentOldId, parentNewId) {
    const key = parentOldId || "__root__";
    const kids = byParent.get(key) || [];
    for (const c of kids) {
      const { data, error } = await sb()
        .from("qb_categories")
        .insert({
          base_id: base.id,
          parent_id: parentNewId,
          name: String(c.name || t("bases.defaults.category")).slice(0, 80),
          ord: Number(c.ord) || 0,
        }, { defaultToNull: false })
        .select("id")
        .single();
      if (error) throw error;

      oldToNewCat.set(c.id, data.id);
      await insertCatSubtree(c.id, data.id);
    }
  }
  await insertCatSubtree(null, null);

  // 2) Tagi
  prog(t("bases.import.steps.tags"), 3, 5, "");
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  for (const tag of tags) {
    const { data, error } = await sb()
      .from("qb_tags")
      .insert({
        base_id: base.id,
        name: String(tag.name || t("bases.defaults.tag")).slice(0, 40),
        color: String(tag.color || "gray").slice(0, 24),
        ord: Number(tag.ord) || 0,
      }, { defaultToNull: false })
      .select("id")
      .single();
    if (error) throw error;
    oldToNewTag.set(tag.id, data.id);
  }

  // 3) Pytania
  const qs = Array.isArray(payload.questions) ? payload.questions : [];
  prog(t("bases.import.steps.questions"), 0, qs.length || 0, "");
  for (let qi = 0; qi < qs.length; qi++) {
    const q = qs[qi];
    const newCatId = q.category_id ? (oldToNewCat.get(q.category_id) || null) : null;
  
    const { data, error } = await sb()
      .from("qb_questions")
      .insert({
        base_id: base.id,
        category_id: newCatId,
        ord: Number(q.ord) || 0,
        payload: q.payload || {},
        updated_by: currentUser.id,
      }, { defaultToNull: false })
      .select("id")
      .single();
  
    if (error) throw error;
    oldToNewQ.set(q.id, data.id);
  
    prog(
      t("bases.import.steps.questions"),
      qi + 1,
      qs.length || 0,
      String(q?.payload?.text || "").slice(0, 60)
    );
  }

  // 4) Powiązania tagów
  prog(t("bases.import.steps.questionTags"), 4, 5, "");
  const qtags = Array.isArray(payload.question_tags) ? payload.question_tags : [];
  const rows = [];
  for (const r of qtags) {
    const nq = oldToNewQ.get(r.question_id);
    const nt = oldToNewTag.get(r.tag_id);
    if (!nq || !nt) continue;
    rows.push({ question_id: nq, tag_id: nt });
  }
  if (rows.length) {
    const { error } = await sb().from("qb_question_tags").insert(rows);
    if (error) throw error;
  }

  // 5) Powiązania tagów kategorii (folderów)
  prog(t("bases.import.steps.categoryTags"), 5, 5, "");
  const ctags = Array.isArray(payload.category_tags) ? payload.category_tags : [];
  const crows = [];
  for (const r of ctags) {
    const nc = oldToNewCat.get(r.category_id);
    const nt = oldToNewTag.get(r.tag_id);
    if (!nc || !nt) continue;
    crows.push({ category_id: nc, tag_id: nt });
  }
  if (crows.length) {
    const { error } = await sb().from("qb_category_tags").insert(crows);
    if (error) throw error;
  }

  return base.id;
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
  // link z DB jest typu "/bases.html?share=..."
  try {
    const u = new URL(link, location.origin);
    return u.toString();
  } catch {
    return String(link || "");
  }
}

function escapeMail(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function buildMailHtml({ title, body, actionLabel, actionUrl }) {
  const safeTitle = escapeMail(title || t("bases.mail.title"));
  const safeBody = escapeMail(body || "");
  const safeActionLabel = escapeMail(actionLabel || t("bases.mail.action"));
  const safeActionUrl = escapeMail(actionUrl || "");

  // bez fallbacków-stringów, bo klucze już masz w pl/en/uk:
  const subtitle = escapeMail(t("bases.mail.subtitle"));
  const footer = escapeMail(t("bases.mail.footer"));
  const linkLabel = escapeMail(t("bases.mail.linkLabel"));

  return `
<div style="margin:0;padding:0;background:#050914;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;">
    <div style="padding:14px 14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${subtitle}</div>
    </div>

    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${safeTitle}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${safeBody}</div>

      <div style="margin:16px 0;">
        <a href="${safeActionUrl}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;">
          ${safeActionLabel}
        </a>
      </div>

      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${linkLabel}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18);word-break:break-all;">
          ${safeActionUrl}
        </div>
      </div>
    </div>

    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${footer}</div>
  </div>
</div>
`;
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
}

function closeShareModal() {
  show(shareOverlay, false);

  // Odśwież status kafelków po zamknięciu modala (shareCount / udostępnione listy).
  // Fire-and-forget: UI wraca natychmiast, a odświeżenie dociągnie dane w tle.
  (async () => {
    try {
      await refreshBases();
  await refreshAltBadge();
      render();
      setButtonsState();
    } catch (e) {
      console.warn("[bases] refresh after share close failed:", e);
    }
  })();
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
    if (shareSubsList) shareSubsList.innerHTML = "";
    if (sharePendingList) sharePendingList.innerHTML = "";
    if (shareSharedList) shareSharedList.innerHTML = "";
    return;
  }

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

  const sharedByUser = new Map((shared || []).map((x) => [x.user_id, x]));
  const pendingByUser = new Map(
    (pending || [])
      .filter((x) => x.recipient_user_id)
      .map((x) => [x.recipient_user_id, x])
  );

  // 🔑 Reguła UX: subskrybenci NIGDY nie lądują w Pending ani Shared listach.
  const subscriberUserIds = new Set(
    (registeredSubs || [])
      .map((r) => r.subscriber_user_id)
      .filter(Boolean)
  );
 
  // helper: cooldown dla subscriber (po cancelled/declined) – bazujemy na danych z "pending" NIE wystarczy,
  // więc UX-only robimy: jeśli istnieje w DB cancelled/declined, backend i tak blokuje (err=cooldown).
  // Żeby UX był pełny 1:1 jak polls-hub, można dodać kolejne RPC (opcjonalnie). Tu robimy minimum sensowne.

  // SUBS LIST
  if (shareSubsList) {
    if (!registeredSubs.length) {
      shareSubsList.innerHTML = `<div style="opacity:.75">${t("bases.shareModal.emptySubscribers")}</div>`;
    } else {
      const rows = registeredSubs
        .slice()
        .sort((a, b) =>
          String(a.subscriber_username || a.subscriber_email || "").localeCompare(
            String(b.subscriber_username || b.subscriber_email || "")
          )
        );

      shareSubsList.innerHTML = "";
      for (const r of rows) {
        const row = document.createElement("div");      // ✅ FIX: wcześniej używałeś "row" bez definicji
        row.className = "shareRow";

        const userId = r.subscriber_user_id;
        const label = r.subscriber_label || r.subscriber_email || "—";
        const title = r.subscriber_email || label;

        const isShared = sharedByUser.has(userId);
        const isPending = pendingByUser.has(userId);
        const pendingTask = pendingByUser.get(userId) || null;
        const email =
          String(r.subscriber_email || "").trim().toLowerCase() ||
          null;
             
        let cooldownUntilMs = null;
        let isCooldown = false;
        let cooldownLabel = "";
        
        if (!isShared && !isPending) {
          cooldownUntilMs = await getCooldownUntil(b.id, userId);
          if (cooldownUntilMs && cooldownUntilMs > Date.now()) {
            isCooldown = true;
            cooldownLabel = msLeftLabel(cooldownUntilMs - Date.now());
          }
        }
        
        const stateText = isShared
          ? t("bases.shareModal.subStateShared")
          : (isPending
              ? t("bases.shareModal.subStatePending")
              : (isCooldown
                  ? t("bases.shareModal.subStateCooldown", { left: cooldownLabel })
                  : t("bases.shareModal.subStateReady")
                )
            );
        
        row.innerHTML = `
          <div class="shareEmail" title="${String(title).replace(/\"/g, "&quot;")}">
            ${escapeHtml(label)}
          </div>
          <div class="shareRowActions">
            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none">
              <input type="checkbox"
                ${isShared || isPending ? "checked" : ""}
                ${(isShared || isPending || isCooldown) ? "disabled" : ""}/>
              <span style="opacity:${(isShared || isPending || isCooldown) ? ".75" : "1"}">
                ${escapeHtml(stateText)}
              </span>
            </label>
            ${
              (isPending || isShared)
                ? `<button class="btn xsm" data-x type="button" title="${escapeHtml(isPending ? t("bases.shareModal.cancelPending") : t("bases.share.remove"))}">✕</button>`
                : ``
            }
          </div>
        `;

        const cb = row.querySelector("input[type=checkbox]");
        cb?.addEventListener("change", async () => {
          if (cb.disabled) return;
          if (!cb.checked) return; // tylko dodawanie
          setMsg(shareMsg, "");

          const role = shareRoleSelect?.getValue?.() || "viewer";
          
          const payload = r.subscriber_user_id
            ? {
                p_base_id: b.id,
                p_recipient_user_id: r.subscriber_user_id,
                p_role: role,
              }
            : {
                p_base_id: b.id,
                p_email: email,
                p_role: role,
              };
          
          const { data, error } = await sb().rpc(
            r.subscriber_user_id ? "base_share_by_user" : "base_share_by_email",
            payload
          );

          const rowRes = Array.isArray(data) ? data[0] : data;

          if (error || !rowRes?.ok) {
            cb.checked = false;
            const err = rowRes?.err || "";
            if (err === "cooldown") setMsg(shareMsg, t("bases.share.cooldown"));
            else if (err === "already_pending") setMsg(shareMsg, t("bases.share.alreadyPending"));
            else setMsg(shareMsg, t("bases.share.failed"));
            return;
          }

          if (rowRes?.mail_to && rowRes?.mail_link) {
            try {
              await sendBaseShareEmail({
                to: rowRes.mail_to,
                link: rowRes.mail_link,
                baseName: rowRes.base_name,
                ownerLabel: rowRes.owner_label,
              });
            } catch (e) {
              console.warn("[bases] email send failed:", e);
              setMsg(shareMsg, t("bases.share.emailFailed"));
            }
          }
          invalidateShareModalCache(b.id);
          await renderShareModal();
        });
        
        // X na subskrybencie: pending -> cancel task, shared -> revoke share
        row.querySelector("[data-x]")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          setMsg(shareMsg, "");
          if (isPending && pendingTask?.task_id) {
            const { data: ok, error } = await sb().rpc("base_share_cancel_task", { p_task_id: pendingTask.task_id });
            if (error || !ok) {
              await alertModal({ text: t("bases.share.failed") });
              return;
            }
            invalidateShareModalCache(b.id);
            await renderShareModal();
            return;
          }
          if (isShared) {
            const ok = await confirmModal({
              title: t("bases.share.removeTitle"),
              text: t("bases.share.removeText", { email: (r.subscriber_email || label) }),
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
          }
        });  
        shareSubsList.appendChild(row);
      }
    }
  }

  // PENDING LIST
  if (sharePendingList) {
    const rows = (pending || []).filter((r) => {
      // 🔑 ukryj subskrybentów
      return !(r.recipient_user_id && subscriberUserIds.has(r.recipient_user_id));
      });
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
          <div class="shareEmail" title="${String(title).replace(/\"/g, "&quot;")}">
            ${escapeHtml(label)}
          </div>
          <div class="shareRowActions">
            <button class="btn xsm" data-cancel type="button" title="${escapeHtml(t("bases.shareModal.cancelPending"))}">✕</button>
          </div>
        `;
        row.querySelector("[data-cancel]")?.addEventListener("click", async () => {
          const ok = await sb().rpc("base_share_cancel_task", { p_task_id: r.task_id });
          if (!ok?.data) {
            await alertModal({ text: t("bases.share.failed") });
            return;
          }
          invalidateShareModalCache(b.id);
          await renderShareModal();
        });

        sharePendingList.appendChild(row);
      }
    }
  }

  // SHARED LIST
  if (shareSharedList) {
    const rows = (shared || [])
      .filter((r) => !subscriberUserIds.has(r.user_id)) // 🔑 ukryj subskrybentów
      .slice()
      .sort((a, b) => String(a.username || a.email || "").localeCompare(String(b.username || b.email || "")));
    if (!rows.length) {
      shareSharedList.innerHTML = `<div style="opacity:.75">${t("bases.shareModal.emptyShared")}</div>`;
    } else {
      shareSharedList.innerHTML = "";
      for (const r of rows) {
        const label = r.username || r.email || "—";
        const title = r.email || label;

        const row = document.createElement("div");
        row.className = "shareRow";
        row.innerHTML = `
          <div class="shareEmail" title="${String(title).replace(/\"/g, "&quot;")}">
            ${escapeHtml(label)}
          </div>
          <div class="shareRowActions">
            <button class="btn xsm" data-remove type="button" title="${escapeHtml(t("bases.share.remove"))}">✕</button>
          </div>
        `;

        row.querySelector("[data-remove]")?.addEventListener("click", async () => {
          const ok = await confirmModal({
            title: t("bases.share.removeTitle"),
            text: t("bases.share.removeText", { email: r.email }),
            okText: t("bases.share.removeOk"),
            cancelText: t("bases.share.removeCancel"),
          });
          if (!ok) return;

          const { data: ok2, error } = await sb().rpc("revoke_base_share", {
            p_base_id: b.id,
            p_user_id: r.user_id,
          });
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

async function shareAdd() {
  const b = selectedBase();
  if (!b || !isOwner(b)) return;

  const raw = String(shareEmail.value || "").trim();
  const role = shareRoleSelect?.getValue?.() || "editor";

  const email = await resolveLoginToEmail(raw);
  if (!emailLooksOk(email)) {
    setMsg(
      shareMsg,
      raw.includes("@") ? t("bases.share.invalidEmail") : t("bases.share.unknownUser")
    );
    return;
  }

  // właściciel próbuje udostępnić samemu sobie
  const me = String(currentUser?.email || "").trim().toLowerCase();
  if (me && email === me) {
    setMsg(shareMsg, t("bases.share.owner"));
    return;
  }

  const { data, error } = await sb().rpc("base_share_by_email", {
    p_base_id: b.id,
    p_email: email,
    p_role: role,
  });
  const row = Array.isArray(data) ? data[0] : data;
  
  if (error || !row?.ok) {
    const err = row?.err || "";
    if (err === "cooldown") setMsg(shareMsg, t("bases.share.cooldown"));
    else if (err === "already_pending") setMsg(shareMsg, t("bases.share.alreadyPending"));
    else setMsg(shareMsg, t("bases.share.failed"));
    return;
  }
  
  // jeśli mail_to/link są obecne – wysyłamy maila
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
      // UX: invite istnieje, ale mail mógł nie wyjść
      setMsg(shareMsg, t("bases.share.emailFailed"));
    }
  }
  
  shareEmail.value = "";
  setMsg(shareMsg, t("bases.share.success"));
  invalidateShareModalCache(b.id);
  await renderShareModal();
}

/* ================= Mobile tabs (mine/shared) ================= */
function setActiveBasesMobileTab(tab) {
  const mineOn = tab !== "shared";
  basesSectionMine?.classList.toggle("active", mineOn);
  basesSectionShared?.classList.toggle("active", !mineOn);
  // highlight tab slots (parent .tab-slot)
  tabBasesMineMobile?.closest(".tab-slot")?.classList.toggle("active", mineOn);
  tabBasesSharedMobile?.closest(".tab-slot")?.classList.toggle("active", !mineOn);
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

  // nagłówki są stałe (poza scrollami)
  if (mineTitle) mineTitle.textContent = t("bases.sections.mine");
  if (sharedTitle) sharedTitle.textContent = t("bases.sections.shared");

  mineGrid.innerHTML = "";
  sharedGrid.innerHTML = "";

  const renderTile = (b, hostEl) => {
    const tile = document.createElement("div");
    tile.className = "card";
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
    
    if (b.sharedRole) {
      const ownerUn = String(b.ownerUsername || "").trim();
      const ownerMail = String(b.ownerEmail || "").trim();
      const fromLabel = ownerUn || ownerMail || "—";

      badges.push({
        text: t("bases.badges.from", { name: fromLabel }),
        title: ownerMail ? ownerMail : fromLabel,
        kind: "from",
      });

      const isEdit = b.sharedRole === "editor";
      badges.push({
        text: isEdit ? "✎" : "👁",
        title: isEdit ? t("bases.badges.editAccess") : t("bases.badges.viewAccess"),
        kind: "role",
      });
    } else {
      const n = Number(b.shareCount || 0);
      badges.push(
        n > 0
          ? { text: `👥 ${n}`, title: t("bases.badges.sharedOthers", { count: n }), kind: "mine" }
          : { text: "👤", title: t("bases.badges.notShared"), kind: "mine" }
      );
    }

    const canDeleteOwned = isOwner(b);
    const canLeaveShared = !!b.sharedRole && !b.proposed;
    const deleteBtn = (canDeleteOwned || canLeaveShared)
      ? `<button class="x" type="button" title="${escapeHtml(
          canDeleteOwned ? t("bases.actions.remove") : t("bases.actions.leaveShared")
        )}">✕</button>`
      : ``;
      
    const proposedBtns = b.proposed
      ? `
        <div class="tileMiniActions">
          <button class="btn xsm gold" data-accept type="button" title="${escapeHtml(t("bases.proposed.accept"))}">✓</button>
          <button class="btn xsm" data-decline type="button" title="${escapeHtml(t("bases.proposed.decline"))}">✕</button>
        </div>`
      : "";

    const badgesHtml = badges.length
      ? badges
          .map(
            (x) =>
              `<span class="tileBadge" data-kind="${escapeHtml(x.kind)}" title="${escapeHtml(
                x.title || ""
              )}">${escapeHtml(x.text || "")}</span>`
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
      tile.querySelector("[data-accept]")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const { data: ok, error } = await sb().rpc("base_share_accept", { p_task_id: b.taskId });
        if (error || ok !== true) {
          await alertModal({ text: t("bases.proposed.failed") });
          return;
        }
        await refreshBases();
        render();
        setButtonsState();
      });
    
      tile.querySelector("[data-decline]")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const { data: ok, error } = await sb().rpc("base_share_decline", { p_task_id: b.taskId });
        if (error || ok !== true) {
          await alertModal({ text: t("bases.proposed.failed") });
          return;
        }
        await refreshBases();
        render();
        setButtonsState();
      });
    }

    tile.addEventListener("click", (e) => {
      if (e.target?.classList?.contains("x")) return;
      selectedId = selectedId === b.id ? null : b.id;
      setButtonsState();
      render();
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
        await refreshBases();
        render();
        setButtonsState();
      });
    }

    tile.addEventListener("dblclick", (e) => {
      if (!isOwner(b)) return;
      if (e.target?.classList?.contains("x")) return;
      selectedId = b.id;
      setButtonsState();
      render();
      openNameModalRename(b);
    });

    hostEl.appendChild(tile);
  };

  // ===== MOJE (z kafelkiem +) =====
  const tNew = document.createElement("div");
  tNew.className = "addCard";
  tNew.innerHTML = `
    <div class="plus">＋</div>
    <div class="name">${escapeHtml(t("bases.sections.newBase"))}</div>
  `;
  tNew.addEventListener("click", () => openNameModalCreate());
  mineGrid.appendChild(tNew);

  for (const b of ownedBases) renderTile(b, mineGrid);

  // ===== UDOSTĘPNIONE =====
  if (!sharedBases.length) {
    const empty = document.createElement("div");
    empty.className = "emptyNote";
    empty.textContent = t("bases.sections.sharedEmpty");
    sharedGrid.appendChild(empty);
  } else {
    for (const b of sharedBases) renderTile(b, sharedGrid);
  }

  // mobile badge: pending invites in "shared"
  setSharedBasesBadge(sharedBases.filter((b) => !!b.proposed).length);
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
  setTimeout(() => nameInp.focus(), 0);
}

function openNameModalRename(base) {
  nameMode = "rename";
  setMsg(nameMsg, "");
  nameTitle.textContent = t("bases.nameModal.titleRename");
  nameSub.textContent = t("bases.nameModal.subRename");
  nameInp.value = base?.name || "";
  show(nameOverlay, true);
  setTimeout(() => nameInp.select(), 0);
}

function closeNameModal() {
  show(nameOverlay, false);
}

async function nameOk() {
  setMsg(nameMsg, "");
  const val = safeName(nameInp.value);
  try {
    if (nameMode === "create") {
      const b = await createBase(val);
      selectedId = b.id;
    } else {
      const b = selectedBase();
      if (b && isOwner(b)) {
        await renameBase(b.id, val);
      }
    }
    await refreshBases();
    render();
    setButtonsState();
    closeNameModal();
  } catch (e) {
    console.warn("[bases] name ok error:", e);
    setMsg(nameMsg, t("bases.nameModal.failed"));
  }
}

/* ================= Modal import ================= */
function openImportModal() {
  if (importTa) importTa.value = "";
  if (importFile) importFile.value = "";
  setMsg(importMsg, "");
  show(importOverlay, true);
}

function closeImportModal() {
  show(importOverlay, false);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error(t("bases.import.fileReadFailed")));
    r.readAsText(file);
  });
}

async function importFromJsonText(txt) {
  setMsg(importMsg, "");

  let payload;
  try {
    payload = JSON.parse(txt);
  } catch {
    setMsg(importMsg, t("bases.import.invalidJson"));
    return;
  }

  // UI start
  showProgBlock(importProg, true);
  setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
    step: t("bases.import.steps.start"),
    i: 0,
    n: Array.isArray(payload?.questions) ? payload.questions.length : 0,
    msg: "",
  });

  // blokady
  if (btnImportJson) btnImportJson.disabled = true;
  if (btnCancelImport) btnCancelImport.disabled = true;
  if (btnImportFile) btnImportFile.disabled = true;
  if (importFile) importFile.disabled = true;
  if (importTa) importTa.disabled = true;

  try {
    // UWAGA: w bases.js masz lokalne importBase(payload) – jeśli wolisz, możesz przejść na import z bases-import.js.
    const newId = await importBase(payload, ({ step, i, n, msg } = {}) => {
      setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
        step: step || t("bases.import.steps.default"),
        i,
        n,
        msg,
      });
    });

    selectedId = newId;
    await refreshBases();
    render();
    setButtonsState();

    setMsg(importMsg, t("bases.import.success"));
    closeImportModal();
  } catch (e) {
    console.warn("[bases] import error:", e);
    setMsg(importMsg, t("bases.import.failed"));
    setProgUi(importProgStep, importProgCount, importProgBar, importProgMsg, {
      step: t("bases.import.errorStep"),
      i: 0,
      n: 1,
      msg: e?.message || t("bases.import.errorMsg"),
    });
  } finally {
    showProgBlock(importProg, false);

    if (btnImportJson) btnImportJson.disabled = false;
    if (btnCancelImport) btnCancelImport.disabled = false;
    if (btnImportFile) btnImportFile.disabled = false;
    if (importFile) importFile.disabled = false;
    if (importTa) importTa.disabled = false;
  }
}



function getRetParam() {
  return new URLSearchParams(location.search).get("ret");
}

function getBackLink() {
  const rawRet = getRetParam();
  return rawRet || "builder.html";
}

function getCurrentRelativeUrl() {
  return `${location.pathname.split("/").pop() || "bases.html"}${location.search}${location.hash}`;
}

function buildManualUrl() {
  const url = new URL("manual.html", location.href);
  url.searchParams.set("ret", getCurrentRelativeUrl());
  url.searchParams.set("lang", getUiLang() || "pl");
  return url.toString();
}

/* ================= Events ================= */
btnBack?.addEventListener("click", () => {
  location.href = getBackLink();
});

btnManual?.addEventListener("click", () => {
  location.href = buildManualUrl();
});

btnGoAlt?.addEventListener("click", async () => {
  const page = document.body.dataset.altPage || "subscriptions.html";
  location.href = `${page}?ret=${encodeURIComponent(getCurrentRelativeUrl())}`;
});

btnLogout?.addEventListener("click", async () => {
  await signOut();
  location.href = "index.html";
});

btnBrowse?.addEventListener("click", () => {
  const b = selectedBase();
  if (!b) return;
  // warstwa 2 będzie później – na razie przekierowanie na placeholder
  location.href = `base-explorer/base-explorer.html?base=${encodeURIComponent(b.id)}`;
});

btnShare?.addEventListener("click", async () => {
  const b = selectedBase();
  if (!b || !isOwner(b)) return;
  await openShareModal();
});

btnExport?.addEventListener("click", async () => {
  const b = selectedBase();
  if (!b) return;
  if (btnExport?.disabled) return;

  show(exportJsonOverlay, true);
  if (exportJsonSub) exportJsonSub.textContent = t("bases.exportModal.subtitle");

  setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, {
    step: t("bases.export.steps.start"),
    i: 0,
    n: 6,
    msg: "",
  });

  if (btnExport) btnExport.disabled = true;

  try {
    // prosty progres etapowy (query po query)
    const onProgress = ({ step, i, n, msg } = {}) => {
      setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, { step, i, n, msg });
    };

    const out = await exportBase(b.id, onProgress);
    onProgress({
      step: t("bases.export.steps.download"),
      i: 6,
      n: 6,
      msg: safeDownloadName(b.name),
    });

    downloadJson(safeDownloadName(b.name), out);

    setTimeout(() => show(exportJsonOverlay, false), 250);
  } catch (e) {
    console.warn("[bases] export error:", e);
    setProgUi(exportJsonStep, exportJsonCount, exportJsonBar, exportJsonMsg, {
      step: t("bases.export.errorStep"),
      i: 0,
      n: 1,
      msg: e?.message || t("bases.export.failed"),
    });
    setTimeout(() => show(exportJsonOverlay, false), 1200);
  } finally {
    if (btnExport) btnExport.disabled = false;
  }
});

btnImport?.addEventListener("click", () => openImportModal());

btnImportFile?.addEventListener("click", async () => {
  const file = importFile?.files?.[0];
  if (!file) {
    setMsg(importMsg, t("bases.import.pickFile"));
    return;
  }
  const txt = await readFileAsText(file);
  if (importTa) importTa.value = txt;
});

btnImportJson?.addEventListener("click", async () => {
  const txt = String(importTa?.value || "").trim();
  if (!txt) {
    setMsg(importMsg, t("bases.import.pasteJson"));
    return;
  }
  await importFromJsonText(txt);
});

btnCancelImport?.addEventListener("click", () => closeImportModal());

// modal nazwy
btnNameCancel?.addEventListener("click", () => closeNameModal());
btnNameOk?.addEventListener("click", () => nameOk());
nameInp?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") nameOk();
  if (e.key === "Escape") closeNameModal();
});

// modal share
btnShareClose?.addEventListener("click", () => closeShareModal());
btnShareAdd?.addEventListener("click", async () => shareAdd());
shareEmail?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") shareAdd();
});

// overlay click-to-close (import/share/name) – klik poza modalem
[nameOverlay, importOverlay, shareOverlay].forEach((ov) => {
  ov?.addEventListener("click", (e) => {
    if (e.target !== ov) return;
    if (ov === nameOverlay) closeNameModal();
    if (ov === importOverlay) closeImportModal();
    if (ov === shareOverlay) closeShareModal();
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
(async function init() {
  currentUser = await requireAuth("index.html");
  if (who) who.textContent = currentUser?.username || currentUser?.email || "—";

  // mobile tabs
  if (basesTabsMobile) {
    const stored = sessionStorage.getItem("basesMobileTab") || "mine";
    setActiveBasesMobileTab(stored === "shared" ? "shared" : "mine");
    tabBasesMineMobile?.addEventListener("click", () => {
      sessionStorage.setItem("basesMobileTab", "mine");
      setActiveBasesMobileTab("mine");
    });
    tabBasesSharedMobile?.addEventListener("click", () => {
      sessionStorage.setItem("basesMobileTab", "shared");
      setActiveBasesMobileTab("shared");
    });
  }

  initShareRoleSelect();
  window.addEventListener("i18n:lang", () => {
    initShareRoleSelect();
    render();          // 🔑 odśwież kafelki i nagłówki sekcji
    setButtonsState(); // (opcjonalnie, ale bezpiecznie)
  });
    
  await refreshBases();
  render();

  // auto refresh jak w polls-hub
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else startAutoRefresh();
  });
  startAutoRefresh();

  // Jeśli weszliśmy z maila: ?share=<token>
  // UX: tylko ustawia "opened_at" po stronie DB nie jest potrzebne,
  // bo decyzja accept/decline jest w UI. Tu robimy mismatch-check:
  const params = new URLSearchParams(location.search);
  const shareToken = params.get("share");
  if (shareToken) {
    // przypadek: zalogowany na innym koncie niż adresat
    // -> jeśli zaproszenie nie jest dla auth.uid, to go nie zobaczymy w list_shared_bases_ext()
    // więc pokazujemy alert i prosimy o właściwe konto.
    // 🔎 najpierw sprawdź token (czy nie cofnięty)
    try {
      const { data: info, error } = await sb().rpc("base_share_token_info", { p_token: shareToken });
      if (!error && info) {
        const status = info.status;
        const recId = info.recipient_user_id;
        if (status === "cancelled") {
          await alertModal({ text: t("bases.proposed.cancelled") });
          // usuń ?share= z URL
          try {
            const u = new URL(location.href);
            u.searchParams.delete("share");
            history.replaceState({}, "", u.toString());
          } catch {}
        } else if (recId && currentUser?.id && recId !== currentUser.id) {
          await alertModal({ text: t("bases.proposed.mismatch") });
        }
      }
    } catch (e) {
      console.warn("[bases] token info failed:", e);
    }

    // dotychczasowy mismatch-check po list_shared_bases_ext (zostaje jako fallback)
    await refreshBases();
    const hasInvite = sharedBases.some((b) => b.proposed && String(b.taskId || ""));
    if (!hasInvite) {
      await alertModal({ text: t("bases.proposed.mismatch") });
    }
  }
  setButtonsState();
})();
