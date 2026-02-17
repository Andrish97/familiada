import { sb, SUPABASE_URL } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { validatePollReadyToOpen } from "../core/game-validate.js";
import { alertModal, confirmModal } from "../core/modal.js";
import { initUiSelect } from "../core/ui-select.js";
import { initI18n, t, getUiLang } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const focusTaskToken = qs.get("t");
let focusTaskHandled = false;


async function rpcDebug(fn, args) {
  const trace = crypto?.randomUUID?.() || String(Date.now()) + "_" + Math.random().toString(16).slice(2);

  console.warn(`[rpc] START ${fn} trace=${trace}`, args);

  try {
    const res = await sb().rpc(fn, args);

    console.warn(`[rpc] END ${fn} trace=${trace}`, {
      hasData: !!res?.data,
      error: res?.error
        ? { message: res.error.message, code: res.error.code, hint: res.error.hint, details: res.error.details }
        : null,
      data: res?.data,
    });

    return { ...res, trace };
  } catch (e) {
    console.error(`[rpc] EXCEPTION ${fn} trace=${trace}`, e);
    throw e;
  }
}

function getRetParam() {
  return new URLSearchParams(location.search).get("ret");
}

function getRetPathnameLower() {
  const raw = getRetParam();
  if (!raw) return "";
  try {
    return new URL(raw, location.origin + "/").pathname.toLowerCase();
  } catch {
    return "";
  }
}

function getCurrentRelativeUrl() {
  return `${location.pathname.split("/").pop() || "polls-hub.html"}${location.search}${location.hash}`;
}

const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBackToBuilder");
const btnManual = $("btnManual");
const btnGoAlt = $("btnGoAlt");
const altBadgeEl = $("altBadge");

const tabPollsMobile = $("tabPollsMobile");
const tabTasksMobile = $("tabTasksMobile");
const panelPollsMobile = $("panelPollsMobile");
const panelTasksMobile = $("panelTasksMobile");

const listPollsDesktop = $("pollsListDesktop");
const listPollsMobile = $("pollsListMobile");
const listTasksDesktop = $("tasksListDesktop");
const listTasksMobile = $("tasksListMobile");

const sortPollsDesktop = $("sortPollsDesktop");
const sortPollsMobile = $("sortPollsMobile");
const sortTasksDesktop = $("sortTasksDesktop");
const sortTasksMobile = $("sortTasksMobile");

const btnShare = $("btnShare");
const btnDetails = $("btnDetails");
const btnShareMobile = $("btnShareMobile");
const btnDetailsMobile = $("btnDetailsMobile");

const shareOverlay = $("shareOverlay");
const shareList = $("shareList");
const shareMsg = $("shareMsg");
const btnShareSave = $("btnShareSave");
const btnShareClose = $("btnShareClose");

const detailsOverlay = $("detailsOverlay");
const detailsVoted = $("detailsVoted");
const detailsPending = $("detailsPending");
const detailsDeclined = $("detailsDeclined");
const detailsCancelled = $("detailsCancelled");
const detailsAnon = $("detailsAnon");
const btnDetailsClose = $("btnDetailsClose");
const detailsTitle = $("detailsTitle");

const progressOverlay = $("progressOverlay");
const progressStep = $("progressStep");
const progressCount = $("progressCount");
const progressBar = $("progressBar");
const progressMsg = $("progressMsg");

const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;

const MSG = {
  ok: () => t("pollsHubPolls.ok"),
  error: () => t("pollsHubPolls.errorLabel"),
  shareLabel: () => t("pollsHubPolls.actions.share"),
  detailsLabel: () => t("pollsHubPolls.actions.details"),
  dash: () => t("pollsHubPolls.dash"),
  pollTypeText: () => t("pollsHubPolls.pollType.text"),
  pollTypePoints: () => t("pollsHubPolls.pollType.points"),
  pollStateOpen: () => t("pollsHubPolls.pollState.open"),
  pollStateClosed: () => t("pollsHubPolls.pollState.closed"),
  pollStateDraft: () => t("pollsHubPolls.pollState.draft"),
  taskStatusDone: () => t("pollsHubPolls.taskStatus.done"),
  taskStatusAvailable: () => t("pollsHubPolls.taskStatus.available"),
  taskFrom: (owner) => t("pollsHubPolls.taskFrom", { owner }),
  votesBadgeLabel: () => t("pollsHubPolls.votesBadgeLabel"),
  anonBadgeLabel: () => t("pollsHubPolls.anonBadgeLabel"),
  emptyPolls: () => t("pollsHubPolls.empty.polls"),
  emptyTasks: () => t("pollsHubPolls.empty.tasks"),
  pollReadyAlert: () => t("pollsHubPolls.pollReadyAlert"),
  loadHubFail: () => t("pollsHubPolls.errors.loadHub"),
  focusTaskPrompt: () => t("pollsHubPolls.confirm.focusTask"),
  detailsTitle: (name) => t("pollsHubPolls.details.titleWithName", { name }),
  detailsEmpty: () => t("pollsHubPolls.empty.details"),
  shareSaved: () => t("pollsHubPolls.statusMsg.shareSaved"),
  shareSavedMsg: () => t("pollsHubPolls.statusMsg.shareSavedMsg"),
  shareSavedWithMail: (sent, total) => t("pollsHubPolls.statusMsg.shareSavedWithMail", { sent, total }),
  shareSaveFail: () => t("pollsHubPolls.errors.shareSave"),
  shareLockedHint: () => t("pollsHubPolls.shareLockedHint"),
  shareStatus: (status) => t(`pollsHubPolls.shareStatus.${status}`),
  shareHint: (status) => t(`pollsHubPolls.shareHint.${status}`),
  shareStatusMissing: () => t("pollsHubPolls.shareStatus.missing"),
  shareHintMissing: () => t("pollsHubPolls.shareHint.missing"),
  shareStatusLabel: () => t("pollsHubPolls.shareStatusLabel"),
  shareHintCooldown: (hours) => t("pollsHubPolls.shareHint.cooldown", { hours }),
  shareCooldownAlert: (hours) => t("pollsHubPolls.shareCooldownAlert", { hours }),
  emptyActiveSubscribers: () => t("pollsHubPolls.empty.activeSubscribers"),
  loadDetailsFail: () => t("pollsHubPolls.errors.loadDetails"),
  deleteVoteStep: () => t("pollsHubPolls.progress.deleteVote"),
  deleteVoteFail: () => t("pollsHubPolls.errors.deleteVote"),
  mailFailed: () => t("pollsHubPolls.statusMsg.mailFailed"),
  mailBatchSending: () => t("pollsHubPolls.statusMsg.mailBatchSending"),
  mailMarking: () => t("pollsHubPolls.statusMsg.mailMarking"),
  pollFallback: () => t("pollsHubPolls.pollFallback"),
  ownerFallback: () => t("pollsHubPolls.ownerFallback"),
  pollNameLabel: (name) => t("pollsHubPolls.pollNameLabel", { name }),
  mailSubtitle: () => t("pollsHubPolls.mail.subtitle"),
  mailTaskTitle: () => t("pollsHubPolls.mail.taskTitle"),
  mailTaskSubject: (name) => t("pollsHubPolls.mail.taskSubject", { name }),
  mailTaskBody: (owner, name) => t("pollsHubPolls.mail.taskBody", { owner, name }),
  mailTaskAction: () => t("pollsHubPolls.mail.taskAction"),
  shareStep: () => t("pollsHubPolls.progress.share"),
  shareNoChanges: () => t("pollsHubPolls.statusMsg.shareNoChanges"),
  declineTaskTitle: () => t("pollsHubPolls.modal.declineTask.title"),
  declineTaskText: () => t("pollsHubPolls.modal.declineTask.text"),
  declineTaskOk: () => t("pollsHubPolls.modal.declineTask.ok"),
  declineTaskCancel: () => t("pollsHubPolls.modal.declineTask.cancel"),
  deleteVoteTitle: () => t("pollsHubPolls.modal.deleteVote.title"),
  deleteVoteText: () => t("pollsHubPolls.modal.deleteVote.text"),
  deleteVoteOk: () => t("pollsHubPolls.modal.deleteVote.ok"),
  deleteVoteCancel: () => t("pollsHubPolls.modal.deleteVote.cancel"),
};

let currentUser = null;
let polls = [];
let tasks = [];
let selectedPollId = null;
let selectedPoll = null;
let pollClosedAt = new Map();
let pollReadyMap = new Map();
let sharePollId = null;
let shareBaseline = new Set();

const archiveState = { polls: false, tasks: false };
const sortState = { polls: "newest", tasks: "newest" };
const sortSelects = new Map();
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function setProgress({ show = false, step = "—", i = 0, n = 0, msg = "" } = {}) {
  if (progressOverlay) progressOverlay.style.display = show ? "grid" : "none";
  if (progressStep) progressStep.textContent = step;
  if (progressCount) progressCount.textContent = `${i}/${n}`;
  if (progressBar) progressBar.style.width = `${n ? Math.round((i / n) * 100) : 0}%`;
  if (progressMsg) progressMsg.textContent = msg;
}

function setBadge(name, count) {
  document.querySelectorAll(`[data-badge="${name}"]`).forEach((el) => {
    el.textContent = count > 99 ? "99+" : String(count);
    el.classList.toggle("is-empty", !count);
  });
}

function pollTypeLabel(type) {
  return type === "poll_points" ? MSG.pollTypePoints() : MSG.pollTypeText();
}

function parseDate(value) {
  return value ? new Date(value).getTime() : 0;
}


function getPollStateOrder(poll) {
  if (poll.poll_state === "draft") return 0;
  if (poll.poll_state === "open") return 1;
  return 2;
}

function hoursLeftFrom(untilTs) {
  const ms = untilTs - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (60 * 60 * 1000));
}

function shareStatusLabel(status) {
  if (status === "done") return MSG.shareStatus("done");
  if (status === "pending" || status === "opened") return MSG.shareStatus("active");
  if (status === "declined") return MSG.shareStatus("declined");
  if (status === "cancelled") return MSG.shareStatus("cancelled");
  return MSG.shareStatusMissing();
}

function shareStatusHint(status, cooldownUntil = 0) {
  if (cooldownUntil && Date.now() < cooldownUntil) return MSG.shareHintCooldown(hoursLeftFrom(cooldownUntil));
  if (status === "done") return MSG.shareHint("locked");
  if (status === "pending" || status === "opened") return MSG.shareHint("active");
  if (status === "declined") return MSG.shareHint("retry");
  if (status === "cancelled") return MSG.shareHint("retry");
  return MSG.shareHintMissing();
}

function extractToken(goUrl, key) {
  if (!goUrl) return null;
  try {
    const url = new URL(goUrl, location.href);
    return url.searchParams.get(key);
  } catch {
    const params = new URLSearchParams(goUrl.split("?")[1] || "");
    return params.get(key);
  }
}

function mailLink(path) {
  try {
    return new URL(path, location.origin).href;
  } catch {
    return path;
  }
}

function buildMailHtml({ title, subtitle, body, actionLabel, actionUrl }) {
  return `
    <div style="margin:0;padding:0;background:#050914;">
      <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;">
        <div style="padding:14px 14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
          <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
          <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${subtitle}</div>
        </div>
        <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
          <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${title}</div>
          <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${body}</div>
          <div style="margin:16px 0;">
            <a href="${actionUrl}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;">${actionLabel}</a>
          </div>
          <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t("pollsHubPolls.mail.ignoreNote")}</div>
          <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
            ${t("pollsHubPolls.mail.linkHint")}
            <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18);word-break:break-all;">${actionUrl}</div>
          </div>
        </div>
        <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t("pollsHubPolls.mail.autoNote")}</div>
      </div>
    </div>
  `.trim();
}

async function sendMailBatch(items) {
  console.debug("[polls-hub] sendMailBatch:start", {
    count: Array.isArray(items) ? items.length : 0,
    preview: Array.isArray(items)
      ? items.slice(0, 3).map((x) => ({ to: x?.to, subject: x?.subject, htmlLength: String(x?.html || "").length }))
      : [],
  });
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(t("pollsHubPolls.errors.mailSession"));

  const doReq = async (accessToken) => fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

  let res = await doReq(token);
  if (res.status === 401) {
    const { data: refreshed } = await sb().auth.refreshSession();
    const freshToken = refreshed?.session?.access_token;
    if (freshToken) res = await doReq(freshToken);
  }

  let payload = null;
  try { payload = await res.json(); } catch { payload = null; }

  if (!res.ok || !payload?.ok) {
    console.error("[polls-hub] sendMailBatch:error", {
      status: res.status,
      statusText: res.statusText,
      payload,
    });
    throw new Error(payload?.error || t("pollsHubPolls.errors.mailSend"));
  }

  console.debug("[polls-hub] sendMailBatch:done", {
    status: res.status,
    ok: payload?.ok,
    results: Array.isArray(payload?.results) ? payload.results.length : 0,
    failed: Array.isArray(payload?.results) ? payload.results.filter((r) => !r?.ok).length : 0,
  });

  return payload; // { ok:true, results:[{to, ok, error?}] }
}

function isPollArchived(poll) {
  if (poll.poll_state !== "closed") return false;
  const closedAt = pollClosedAt.get(poll.game_id) || poll.created_at;
  return Date.now() - parseDate(closedAt) > 5 * 24 * 60 * 60 * 1000;
}

function sortPollsList(list) {
  const sorted = [...list];
  switch (sortState.polls) {
    case "oldest":
      sorted.sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));
      break;
    case "name-asc":
      sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      break;
    case "name-desc":
      sorted.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
      break;
    case "type":
      sorted.sort((a, b) => pollTypeLabel(a.poll_type).localeCompare(pollTypeLabel(b.poll_type)));
      break;
    case "state":
      sorted.sort((a, b) => getPollStateOrder(a) - getPollStateOrder(b));
      break;
    case "tasks-active":
      sorted.sort((a, b) => (b.tasks_active || 0) - (a.tasks_active || 0));
      break;
    case "tasks-done":
      sorted.sort((a, b) => (b.tasks_done || 0) - (a.tasks_done || 0));
      break;
    default:
      sorted.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  }
  return sorted;
}

function sortTasksList(list) {
  let filtered = [...list];
  if (sortState.tasks === "available") filtered = filtered.filter((t) => t.status === "pending");
  if (sortState.tasks === "done") filtered = filtered.filter((t) => t.status === "done");
  switch (sortState.tasks) {
    case "oldest":
      filtered.sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));
      break;
    case "name-asc":
      filtered.sort((a, b) => (a.game_name || "").localeCompare(b.game_name || ""));
      break;
    case "name-desc":
      filtered.sort((a, b) => (b.game_name || "").localeCompare(a.game_name || ""));
      break;
    case "type":
      filtered.sort((a, b) => pollTypeLabel(a.poll_type).localeCompare(pollTypeLabel(b.poll_type)));
      break;
    default:
      filtered.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  }
  return filtered;
}

function renderEmpty(el, text) {
  if (!el) return;
  el.innerHTML = `<div class="hub-empty">${text}</div>`;
}

function pollVotesMeta(poll) {
  const total = Number(poll.tasks_active || poll.shared_total || 0) + Number(poll.tasks_done || 0);
  const done = Number(poll.tasks_done || poll.shared_done || 0);
  const votes = Number(poll.votes_count || done || 0);
  const anon = Number(poll.anon_votes || 0);
  return {
    left: poll.poll_state === "closed" ? `${votes}` : (total > 0 ? `${done}/${total}` : "0/0"),
    anon: `${anon}`,
  };
}

function pollTileClass(poll) {
  if (poll.poll_state === "closed") return "poll-closed";
  if (poll.poll_state === "open") {
    const hasActivity = (poll.anon_votes || 0) > 0 || (poll.tasks_active || 0) > 0;
    if (poll.close_ready) return "poll-open-good";
    return hasActivity ? "poll-open-active" : "poll-open-empty";
  }
  const ready = pollReadyMap.get(poll.game_id) === true;
  return ready ? "poll-draft-ready" : "poll-draft";
}

function renderPolls() {
  const visible = polls.filter((p) => (archiveState.polls ? isPollArchived(p) : !isPollArchived(p)));
  const sorted = sortPollsList(visible);
  const render = (listEl) => {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!sorted.length) return renderEmpty(listEl, MSG.emptyPolls());
    for (const poll of sorted) {
      const m = pollVotesMeta(poll);
      const item = document.createElement("div");
      item.className = `hub-item ${pollTileClass(poll)} ${poll.game_id === selectedPollId ? "selected" : ""}`;
      const badgesHtml = poll.poll_state === "draft"
        ? ""
        : `<div class="hub-item-actions hub-item-actions--poll-badges"><span class="hub-item-badge">${MSG.votesBadgeLabel()}: ${m.left}</span><span class="hub-item-badge hub-item-badge-alt">${MSG.anonBadgeLabel()}: ${m.anon}</span></div>`;
      item.innerHTML = `<div><div class="hub-item-title">${pollTypeLabel(poll.poll_type)} — ${poll.name || MSG.dash()}</div><div class="hub-item-sub">${poll.poll_state === "open" ? MSG.pollStateOpen() : poll.poll_state === "closed" ? MSG.pollStateClosed() : MSG.pollStateDraft()}</div></div>${badgesHtml}`;
      item.addEventListener("click", () => selectPoll(poll));
      item.addEventListener("dblclick", () => openPoll(poll));
      listEl.appendChild(item);
    }
  };
  render(listPollsDesktop);
  render(listPollsMobile);
}

function renderTasks() {
  const visible = tasks.filter((r) => {
    if (r.status === "declined" || r.status === "cancelled") return false;
    if (archiveState.tasks) return r.is_archived && r.status === "done";
    return !r.is_archived && (r.status === "pending" || r.status === "done");
  });
  const sorted = sortTasksList(visible);
  const render = (listEl) => {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!sorted.length) return renderEmpty(listEl, MSG.emptyTasks());
    for (const task of sorted) {
      const ownerLabel = (task?.owner_username || task?.owner_email || "").trim() || MSG.dash();
      const statusLabel = task.status === "done" ? MSG.taskStatusDone() : MSG.taskStatusAvailable();
      const item = document.createElement("div");
      item.className = `hub-item ${task.status === "done" ? "task-done" : "task-pending"}`;
      item.innerHTML = `<div><div class="hub-item-title">${pollTypeLabel(task.poll_type)} — ${task.game_name || MSG.dash()}</div><div class="hub-item-sub">${MSG.taskFrom(ownerLabel)} • ${statusLabel}</div></div><div class="hub-item-actions"></div>`;
      if (task.status === "pending") {
        const btn = document.createElement("button");
        btn.className = "btn xs danger";
        btn.textContent = "X";
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await confirmModal({
            title: MSG.declineTaskTitle(),
            text: MSG.declineTaskText(),
            okText: MSG.declineTaskOk(),
            cancelText: MSG.declineTaskCancel(),
          });
          if (!ok) return;
          try {
            setProgress({ show: true, step: t("pollsHubPolls.progress.declineTask"), i: 0, n: 1 });
            await sb().rpc("polls_hub_task_decline", { p_task_id: task.task_id });
            await refreshData();
          } catch {
            await alertModal({ text: t("pollsHubPolls.errors.declineTask") });
          } finally {
            setProgress({ show: false });
          }
        });
        item.querySelector(".hub-item-actions")?.appendChild(btn);
      }
      item.addEventListener("dblclick", async () => {
        if (!task.token) {
          await alertModal({ text: MSG.loadHubFail() });
          return;
        }
        const page = task.poll_type === "poll_points" ? "poll-points.html" : "poll-text.html";
        location.href = `${page}?t=${encodeURIComponent(task.token)}&lang=${encodeURIComponent(getUiLang() || "pl")}`;
      });
      listEl.appendChild(item);
    }
  };
  render(listTasksDesktop);
  render(listTasksMobile);
}

function updatePollActions() {
  const isOpen = selectedPoll?.poll_state === "open";
  const canShare = !!selectedPollId && isOpen;
  const canDetails = !!selectedPollId && selectedPoll?.poll_state !== "draft";
  if (btnShare) btnShare.disabled = !canShare;
  if (btnShareMobile) btnShareMobile.disabled = !canShare;
  if (btnDetails) btnDetails.disabled = !canDetails;
  if (btnDetailsMobile) btnDetailsMobile.disabled = !canDetails;
}

function selectPoll(poll) {
  selectedPollId = poll.game_id;
  selectedPoll = poll;
  renderPolls();
  updatePollActions();
}

async function openPoll(poll) {
  if (poll.poll_state === "draft" && !pollReadyMap.get(poll.game_id)) {
    await alertModal({ text: MSG.pollReadyAlert() });
    return;
  }
  location.href = `polls.html?id=${encodeURIComponent(poll.game_id)}&ret=${encodeURIComponent(getCurrentRelativeUrl())}`;
}

function setActiveMobileTab(tab) {
  tabPollsMobile?.classList.toggle("active", tab === "polls");
  tabTasksMobile?.classList.toggle("active", tab === "tasks");
  panelPollsMobile?.classList.toggle("active", tab === "polls");
  panelTasksMobile?.classList.toggle("active", tab === "tasks");
}

function renderSelect(el, kind) {
  if (!el) return;
  const options = kind === "polls"
    ? [
      { value: "newest", label: t("pollsHubPolls.sort.newest") },
      { value: "oldest", label: t("pollsHubPolls.sort.oldest") },
      { value: "name-asc", label: t("pollsHubPolls.sort.nameAsc") },
      { value: "name-desc", label: t("pollsHubPolls.sort.nameDesc") },
      { value: "type", label: t("pollsHubPolls.sort.type") },
      { value: "state", label: t("pollsHubPolls.sort.state") },
      { value: "tasks-active", label: t("pollsHubPolls.sort.tasksActive") },
      { value: "tasks-done", label: t("pollsHubPolls.sort.tasksDone") },
    ]
    : [
      { value: "newest", label: t("pollsHubPolls.sort.newest") },
      { value: "oldest", label: t("pollsHubPolls.sort.oldest") },
      { value: "name-asc", label: t("pollsHubPolls.sort.nameAsc") },
      { value: "name-desc", label: t("pollsHubPolls.sort.nameDesc") },
      { value: "type", label: t("pollsHubPolls.sort.type") },
      { value: "available", label: t("pollsHubPolls.sort.available") },
      { value: "done", label: t("pollsHubPolls.sort.done") },
    ];
  let api = sortSelects.get(el);
  if (!api) {
    api = initUiSelect(el, {
      value: sortState[kind],
      options,
      onChange: (val) => {
        sortState[kind] = val;
        if (kind === "polls") renderPolls();
        else renderTasks();
      },
    });
    sortSelects.set(el, api);
    return;
  }
  api.setOptions(options);
  api.setValue(sortState[kind], { silent: true });
}

function syncToggles() {
  document.querySelectorAll(".hub-toggle").forEach((wrap) => {
    const kind = wrap.dataset.kind;
    wrap.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", archiveState[kind] === (b.dataset.toggle === "archive"));
    });
  });
}

function registerToggleHandlers() {
  document.querySelectorAll(".hub-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.closest(".hub-toggle")?.dataset.kind;
      if (!kind) return;
      archiveState[kind] = btn.dataset.toggle === "archive";
      syncToggles();
      if (kind === "polls") renderPolls();
      else renderTasks();
    });
  });
}

async function openShareModal() {
  if (!selectedPollId) return;
  sharePollId = selectedPollId;
  shareBaseline = new Set();
  shareMsg.textContent = "";
  shareList.innerHTML = "";
  try {
    setProgress({ show: true, step: t("pollsHubPolls.progress.loadSubscribers"), i: 0, n: 1 });
    const { data, error } = await sb().rpc("polls_hub_list_my_subscribers");
    if (error) throw error;
    const activeSubs = (data || []).filter((s) => s.status === "active");
    const { data: taskRows, error: taskError } = await sb()
      .from("poll_tasks")
      .select("id,recipient_user_id,recipient_email,status,cancelled_at,declined_at,created_at")
      .eq("game_id", sharePollId)
      .eq("owner_id", currentUser.id);
    if (taskError) throw taskError;

    const statusBySub = new Map();
    const cooldownUntilBySub = new Map();
    for (const task of taskRows || []) {
      const emailKey = String(task.recipient_email || "").toLowerCase();
      const userKey = task.recipient_user_id ? String(task.recipient_user_id) : "";
      if (userKey) statusBySub.set(userKey, task.status);
      if (emailKey) statusBySub.set(emailKey, task.status);
      if (task.status === "cancelled" || task.status === "declined") {
        const baseTs = parseDate(task.cancelled_at) || parseDate(task.declined_at) || parseDate(task.created_at);
        const until = baseTs ? baseTs + COOLDOWN_MS : 0;
        if (until) {
          if (userKey) cooldownUntilBySub.set(userKey, Math.max(cooldownUntilBySub.get(userKey) || 0, until));
          if (emailKey) cooldownUntilBySub.set(emailKey, Math.max(cooldownUntilBySub.get(emailKey) || 0, until));
        }
      }
    }

    for (const sub of activeSubs) {
      const emailKey = String(sub.subscriber_email || "").toLowerCase();
      const userKey = sub.subscriber_user_id ? String(sub.subscriber_user_id) : "";
      const status = statusBySub.get(userKey) || statusBySub.get(emailKey);
      const isActive = status === "pending" || status === "opened";
      const isLocked = status === "done";
      const cooldownUntil = cooldownUntilBySub.get(userKey) || cooldownUntilBySub.get(emailKey) || 0;
      const isCooldown = !isActive && !isLocked && cooldownUntil && Date.now() < cooldownUntil;
      const row = document.createElement("label");
      row.className = "hub-share-item" + (isCooldown ? " cooldown" : "");
      if (isActive) shareBaseline.add(String(sub.sub_id));
      row.innerHTML = `
        <input type="checkbox" ${isActive ? "checked" : ""} ${isLocked ? "disabled" : ""} data-id="${sub.sub_id}">
        <div>
          <div class="hub-item-title">${sub.subscriber_label || sub.subscriber_email || MSG.dash()}</div>
          <div class="hub-share-status">${shareStatusLabel(status)}</div>
        </div>
        <div class="hub-share-status">${shareStatusHint(status, isCooldown ? cooldownUntil : 0)}</div>
      `;
      const input = row.querySelector("input");
      if (input) {
        if (isLocked) input.title = MSG.shareLockedHint();
        else if (isCooldown) {
          input.title = MSG.shareCooldownAlert(hoursLeftFrom(cooldownUntil));
          input.addEventListener("change", async () => {
            if (input.checked) {
              await alertModal({ text: MSG.shareCooldownAlert(hoursLeftFrom(cooldownUntil)) });
              input.checked = false;
            }
          });
        }
      }
      shareList.appendChild(row);
    }

    if (!activeSubs.length) shareList.innerHTML = `<div class="hub-empty">${MSG.emptyActiveSubscribers()}</div>`;
    shareOverlay.style.display = "grid";
  } catch {
    await alertModal({ text: t("pollsHubPolls.errors.loadSubscribers") });
  } finally {
    setProgress({ show: false });
  }
}

function closeShareModal() { shareOverlay.style.display = "none"; shareList.innerHTML = ""; }

async function buildMailItemsForTasksFallback({ gameId, ownerId, selectedSubIds }) {
  const { data: rows, error } = await sb()
    .from("poll_tasks")
    .select("id,recipient_user_id,recipient_email,token,status")
    .eq("game_id", gameId)
    .eq("owner_id", ownerId)
    .in("status", ["pending", "opened"]);
  if (error) throw error;
  const tokenByKey = new Map();
  const taskIdByToken = new Map();
  for (const r of rows || []) {
    const emailKey = String(r.recipient_email || "").trim().toLowerCase();
    const userKey = r.recipient_user_id ? String(r.recipient_user_id) : "";
    if (userKey && r.token) tokenByKey.set(userKey, r.token);
    if (emailKey && r.token) tokenByKey.set(emailKey, r.token);
    if (r.token && r.id) taskIdByToken.set(String(r.token), r.id);
  }
  const subById = new Map(((await sb().rpc("polls_hub_list_my_subscribers")).data || []).map((x) => [String(x.sub_id), x]));
    // 🔧 jeśli sub ma user_id, a nie ma emaila — dociągnij z profiles
  const needProfileIds = [];
  for (const subId of selectedSubIds || []) {
    const sub = subById.get(String(subId));
    if (!sub) continue;
    const emailKey = String(sub.subscriber_email || "").trim().toLowerCase();
    if (!emailKey && sub.subscriber_user_id) needProfileIds.push(sub.subscriber_user_id);
  }

  const profileEmailById = new Map();
  if (needProfileIds.length) {
    const uniq = [...new Set(needProfileIds.map(String))];
    const { data: prof } = await sb().from("profiles").select("id,email").in("id", uniq);
    for (const p of prof || []) profileEmailById.set(String(p.id), String(p.email || "").trim().toLowerCase());
  }

  const mailItems = [];
  for (const subId of selectedSubIds || []) {
    const sub = subById.get(String(subId));
    if (!sub) continue;
    const emailKey =
      String(sub.subscriber_email || "").trim().toLowerCase() ||
      (sub.subscriber_user_id ? (profileEmailById.get(String(sub.subscriber_user_id)) || "") : "");
    const userKey = sub.subscriber_user_id ? String(sub.subscriber_user_id) : "";
    const token = (userKey ? tokenByKey.get(userKey) : null) || (emailKey ? tokenByKey.get(emailKey) : null);
    if (!token || !emailKey) continue;
    mailItems.push({ task_id: taskIdByToken.get(String(token)) || null, to: emailKey, link: `poll-go.html?t=${encodeURIComponent(token)}&lang=${encodeURIComponent(getUiLang() || "pl")}` });
  }
  return mailItems;
}

async function saveShareModal() {
  console.warn("[polls-hub] saveShareModal:click", { sharePollId, shareListExists: !!shareList });

  if (!sharePollId) {
    console.error("[polls-hub] saveShareModal:no_sharePollId");
    shareMsg.textContent = "ERR: missing sharePollId";
    return;
  }

  const selected = [...shareList.querySelectorAll('input[type="checkbox"]')]
    .filter((x) => x.checked)
    .map((x) => String(x.dataset.id || "").trim())
    .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

  console.warn("[polls-hub] saveShareModal:selected", { count: selected.length, selected });

  const changed =
    selected.length !== shareBaseline.size ||
    selected.some((id) => !shareBaseline.has(String(id)));

  console.warn("[polls-hub] saveShareModal:changed?", {
    changed,
    baselineCount: shareBaseline.size,
  });

  if (!changed) {
    shareMsg.textContent = MSG.shareNoChanges();
    return;
  }

  try {
    setProgress({ show: true, step: MSG.shareStep(), i: 0, n: 4, msg: "" });

    const args = { p_game_id: sharePollId, p_sub_ids: selected };
    console.warn("[polls-hub] rpc call polls_hub_share_poll", args);

    const { data, error, trace } = await rpcDebug("polls_hub_share_poll", args);

    console.warn("[polls-hub] rpc result polls_hub_share_poll", { trace, ok: data?.ok, data, error });

    if (error || data?.ok === false) {
      const msg = error?.message || error?.details || error?.hint || "share_failed";
      shareMsg.textContent = `${MSG.shareSaveFail()} (${msg})`;
      await alertModal({ text: `${MSG.shareSaveFail()}\n\n${msg}\n\ntrace=${trace}` });
      return;
    }

    setProgress({ show: true, step: MSG.shareStep(), i: 1, n: 4, msg: MSG.shareSavedMsg() });

    let mailItems = Array.isArray(data?.mail) ? data.mail : [];
    if (!mailItems.length) {
      try {
        mailItems = await buildMailItemsForTasksFallback({ gameId: sharePollId, ownerId: currentUser.id, selectedSubIds: selected });
      } catch {
        mailItems = [];
      }
    }

    let sentCount = 0;
    if (mailItems.length) {
      const ownerLabel = currentUser?.username || currentUser?.email || MSG.ownerFallback();
      const pollName = selectedPoll?.name || "";

      setProgress({ show: true, step: MSG.shareStep(), i: 2, n: 4, msg: MSG.mailBatchSending() });

      const emailToTaskId = new Map();
      const items = mailItems
        .map((item) => {
          if (item?.to) emailToTaskId.set(String(item.to).toLowerCase(), item.task_id || null);

          const actionUrl = mailLink(item.link);
          const safeName = pollName ? MSG.pollNameLabel(pollName) : MSG.pollFallback();
          const html = buildMailHtml({
            title: MSG.mailTaskTitle(),
            subtitle: MSG.mailSubtitle(),
            body: MSG.mailTaskBody(ownerLabel, safeName),
            actionLabel: MSG.mailTaskAction(),
            actionUrl,
          });

          return {
            to: item.to,
            subject: MSG.mailTaskSubject(pollName || MSG.pollFallback()),
            html,
          };
        })
        .filter((x) => x.to && x.subject && x.html);

      let failedCount = 0;
      const sentTaskIds = [];
      let batchFailed = false;

      let out = { results: [] };
      if (items.length) {
        try {
          out = await sendMailBatch(items); // 1 request
        } catch (e) {
          batchFailed = true;
          failedCount = items.length;
          await alertModal({ text: `${MSG.mailFailed()} (${failedCount}/${items.length})` });
        }
      }

      const results = Array.isArray(out?.results) ? out.results : [];
      for (const r of results) {
        const emailKey = String(r?.to || "").toLowerCase();
        if (r?.ok) {
          sentCount += 1;
          const tid = emailToTaskId.get(emailKey);
          if (tid) sentTaskIds.push(tid);
        } else if (emailKey) {
          failedCount += 1;
        }
      }

      if (failedCount && !batchFailed) {
        await alertModal({ text: `${MSG.mailFailed()} (${failedCount}/${items.length})` });
      }

      if (sentTaskIds.length) {
        setProgress({ show: true, step: MSG.shareStep(), i: 3, n: 4, msg: MSG.mailMarking() });
        await sb().rpc("polls_hub_tasks_mark_emailed", { p_task_ids: sentTaskIds });
      }
    }

    shareMsg.textContent = MSG.shareSaved();
    await refreshData();
  } catch (e) {
    const msg = String(e?.message || e || "unknown_error");
    console.error("[polls-hub] saveShareModal:catch", e);
    shareMsg.textContent = `${MSG.shareSaveFail()} (${msg})`;
    await alertModal({ text: `${MSG.shareSaveFail()}\n\n${msg}` });
  } finally {
    setProgress({ show: false });
  }
}

function renderDetailsList(container, rows) {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<div class="hub-empty">${MSG.detailsEmpty()}</div>`;
    return;
  }
  container.innerHTML = "";
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "hub-details-item";
    item.innerHTML = `<span>${row.subscriber_display_label || MSG.dash()}</span><button class="btn xs danger">X</button>`;
    const removeBtn = item.querySelector("button");
    if (!row.task_id) removeBtn?.setAttribute("disabled", "disabled");
    removeBtn?.addEventListener("click", async () => {
      const ok = await confirmModal({
        title: MSG.deleteVoteTitle(),
        text: MSG.deleteVoteText(),
        okText: MSG.deleteVoteOk(),
        cancelText: MSG.deleteVoteCancel(),
      });
      if (!ok) return;
      try {
        setProgress({ show: true, step: MSG.deleteVoteStep(), i: 0, n: 2 });
        if (!row.task_id) throw new Error("missing_task_id");
        await sb().rpc("poll_admin_delete_vote", { p_game_id: selectedPollId, p_voter_token: `task:${row.task_id}` });
        await sb().from("poll_tasks").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", row.task_id).eq("owner_id", currentUser.id);
        setProgress({ show: true, step: MSG.deleteVoteStep(), i: 1, n: 2 });
        await openDetailsModal();
      } catch {
        await alertModal({ text: MSG.deleteVoteFail() });
      } finally {
        setProgress({ show: false });
      }
    });
    container.appendChild(item);
  }
}

async function openDetailsModal() {
  if (!selectedPollId) return;
  try {
    const { data: taskRows, error: taskErr } = await sb()
      .from("poll_tasks")
      .select("id,status,recipient_email,recipient_user_id,done_at,declined_at,cancelled_at")
      .eq("game_id", selectedPollId)
      .eq("owner_id", currentUser.id);
    if (taskErr) throw taskErr;
    const userIds = [...new Set((taskRows || []).map((r) => r.recipient_user_id).filter(Boolean))];
    let profilesMap = new Map();
    if (userIds.length) {
      const { data: prof } = await sb().from("profiles").select("id,username,email").in("id", userIds);
      profilesMap = new Map((prof || []).map((p) => [p.id, p]));
    }
    const rows = (taskRows || []).map((r) => {
      const profile = r.recipient_user_id ? profilesMap.get(r.recipient_user_id) : null;
      const status = r?.done_at
        ? "done"
        : r?.declined_at
          ? "declined"
          : r?.cancelled_at
            ? "cancelled"
            : (r.status || "pending");
      return {
        sub_id: r.id,
        task_id: r.id,
        voter_user_id: r.recipient_user_id || null,
        status,
        subscriber_display_label: profile?.username || profile?.email || r.recipient_email || MSG.dash(),
      };
    });
    detailsTitle.textContent = MSG.detailsTitle(selectedPoll?.name || MSG.dash());
    renderDetailsList(detailsVoted, rows.filter((r) => r.status === "done"));
    renderDetailsList(detailsPending, rows.filter((r) => r.status === "pending"));
    renderDetailsList(detailsDeclined, rows.filter((r) => r.status === "declined"));
    renderDetailsList(detailsCancelled, rows.filter((r) => r.status === "cancelled"));
    detailsAnon.textContent = String(selectedPoll?.anon_votes || 0);
    detailsOverlay.style.display = "grid";
  } catch {
    await alertModal({ text: MSG.loadDetailsFail() });
  }
}

function closeDetailsModal() { detailsOverlay.style.display = "none"; }

let autoRefreshTimer = null;
function startAutoRefresh() {
  if (autoRefreshTimer) return;
  autoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    // nie wchodź w wyścigi podczas progress overlay
    if (progressOverlay && progressOverlay.style.display === "grid") return;
    refreshData();
  }, 20000);
}

function stopAutoRefresh() {
  if (!autoRefreshTimer) return;
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

async function refreshTopBadges() {
  const { data } = await sb().rpc("polls_badge_get");
  const row = Array.isArray(data) ? data[0] : data;
  const tasksPending = Number(row?.tasks_pending || 0);
  const altPending = Number(row?.subs_pending || 0);
  setBadge("tasks", tasksPending);
  setBadge("subs", 0);
  if (altBadgeEl) {
    altBadgeEl.textContent = altPending > 99 ? "99+" : String(altPending || "");
    btnGoAlt?.classList.toggle("has-badge", altPending > 0);
  }
}

let hubRefreshInFlight = null;

async function refreshData() {
  if (hubRefreshInFlight) return hubRefreshInFlight;

  hubRefreshInFlight = (async () => {
  try {
    const [pollsRes, tasksRes] = await Promise.all([
      sb().rpc("polls_hub_list_polls"),
      sb().rpc("polls_hub_list_tasks"),
    ]);
    polls = pollsRes.data || [];
    tasks = (tasksRes.data || []).map((task) => {
      const token = task?.token || (() => {
        try {
          if (!task?.go_url) return null;
          const u = new URL(task.go_url, location.origin);
          return u.searchParams.get("t");
        } catch {
          return null;
        }
      })();
      return { ...task, token };
    });

    const ids = polls.map((p) => p.game_id).filter(Boolean);
    pollClosedAt = new Map();
    if (ids.length) {
      const { data } = await sb().from("games").select("id,poll_closed_at").in("id", ids);
      for (const row of data || []) pollClosedAt.set(row.id, row.poll_closed_at);
    }

    pollReadyMap = new Map();
    await Promise.all(
      polls
        .filter((p) => p.poll_state === "draft")
        .map(async (poll) => {
          try {
            const ready = await validatePollReadyToOpen(poll.game_id);
            pollReadyMap.set(poll.game_id, !!ready?.ok);
          } catch {
            pollReadyMap.set(poll.game_id, false);
          }
        })
    );

    updateBackButtonLabel();
    renderPolls();
    renderTasks();
    updatePollActions();
    await refreshTopBadges();

    if (focusTaskToken && !focusTaskHandled) {
      const found = tasks.find((x) => String(x.token) === String(focusTaskToken));
      focusTaskHandled = true;
      if (found) {
        const ok = await confirmModal({ text: MSG.focusTaskPrompt() });
        if (ok) {
          const page = found.poll_type === "poll_points" ? "poll-points.html" : "poll-text.html";
          location.href = `${page}?t=${encodeURIComponent(focusTaskToken)}&lang=${encodeURIComponent(getUiLang() || "pl")}`;
        }
      }
      const url = new URL(location.href);
      url.searchParams.delete("t");
      history.replaceState(null, "", url.toString());
    }
  } catch {
    await alertModal({ text: MSG.loadHubFail() });
  }
  })();

  try {
    await hubRefreshInFlight;
  } finally {
    hubRefreshInFlight = null;
  }
}



function buildManualUrl() {
  const url = new URL("manual.html", location.href);
  url.searchParams.set("ret", getCurrentRelativeUrl());
  url.searchParams.set("lang", getUiLang() || "pl");
  return url.toString();
}


function updateBackButtonLabel() {
  if (!btnBack) return;
  const retPath = getRetPathnameLower();
  btnBack.textContent = retPath.endsWith("/bases.html")
    ? t("baseExplorer.backToBases")
    : t("pollsHubPolls.backToGames");
}

function getBackLink() {
  const rawRet = getRetParam();
  return rawRet || "builder.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.username || currentUser?.email || "—";

  renderSelect(sortPollsDesktop, "polls");
  renderSelect(sortPollsMobile, "polls");
  renderSelect(sortTasksDesktop, "tasks");
  renderSelect(sortTasksMobile, "tasks");
  registerToggleHandlers();
  syncToggles();

  tabPollsMobile?.addEventListener("click", () => setActiveMobileTab("polls"));
  tabTasksMobile?.addEventListener("click", () => setActiveMobileTab("tasks"));
  setActiveMobileTab("polls");

  btnShare?.addEventListener("click", openShareModal);
  btnShareMobile?.addEventListener("click", openShareModal);
  btnDetails?.addEventListener("click", openDetailsModal);
  btnDetailsMobile?.addEventListener("click", openDetailsModal);
  btnShareSave?.addEventListener("click", saveShareModal);
  btnShareClose?.addEventListener("click", () => { closeShareModal(); refreshData(); });
  btnDetailsClose?.addEventListener("click", () => { closeDetailsModal(); refreshData(); });

  shareOverlay?.addEventListener("click", (e) => { if (e.target === shareOverlay) { closeShareModal(); refreshData(); } });
  detailsOverlay?.addEventListener("click", (e) => { if (e.target === detailsOverlay) { closeDetailsModal(); refreshData(); } });

  // po zamknięciu dowolnego confirm/alert w aplikacji — odśwież listy
  document.addEventListener("uni-modal:closed", () => { refreshData(); });

  startAutoRefresh();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else { startAutoRefresh(); refreshData(); }
  });

  updateBackButtonLabel();
  btnBack?.addEventListener("click", () => { location.href = getBackLink(); });
  btnManual?.addEventListener("click", () => { location.href = buildManualUrl(); });
  btnGoAlt?.addEventListener("click", () => { location.href = `subscriptions.html?ret=${encodeURIComponent(getCurrentRelativeUrl())}`; });
  btnLogout?.addEventListener("click", async () => { await signOut(); location.href = "index.html"; });

  window.addEventListener("i18n:lang", () => {
    renderSelect(sortPollsDesktop, "polls");
    renderSelect(sortPollsMobile, "polls");
    renderSelect(sortTasksDesktop, "tasks");
    renderSelect(sortTasksMobile, "tasks");
    updateBackButtonLabel();
    renderPolls();
    renderTasks();
  });

  await refreshData();
  setInterval(() => refreshData(), 30000);
});
