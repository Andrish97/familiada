// js/pages/polls-hub.js
import { sb, SUPABASE_URL } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { validatePollReadyToOpen } from "../core/game-validate.js";
import { alertModal, confirmModal } from "../core/modal.js";
import { initUiSelect } from "../core/ui-select.js";
import { initI18n, t } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

const MSG = {
  ok: () => t("pollsHub.ok"),
  error: () => t("pollsHub.errorLabel"),
  dash: () => t("common.dash"),
  pollTypeText: () => t("pollsHub.pollType.text"),
  pollTypePoints: () => t("pollsHub.pollType.points"),
  pollStateOpen: () => t("pollsHub.pollState.open"),
  pollStateClosed: () => t("pollsHub.pollState.closed"),
  pollStateDraft: () => t("pollsHub.pollState.draft"),
  tasksBadgeTitle: (done, total) => t("pollsHub.tasksBadgeTitle", { done, total }),
  tasksBadgeNone: () => t("pollsHub.tasksBadgeNone"),
  anonBadgeTitle: (count) => t("pollsHub.anonBadgeTitle", { count }),
  anonBadgeLabel: () => t("pollsHub.anonBadgeLabel"),
  emptyPolls: () => t("pollsHub.empty.polls"),
  emptyTasks: () => t("pollsHub.empty.tasks"),
  emptySubscribers: () => t("pollsHub.empty.subscribers"),
  emptySubscriptions: () => t("pollsHub.empty.subscriptions"),
  emptyActiveSubscribers: () => t("pollsHub.empty.activeSubscribers"),
  emptyTasksShort: () => t("pollsHub.empty.tasksShort"),
  subscriptionStatus: (status) => t(`pollsHub.subscriptionStatus.${status}`),
  taskStatusDone: () => t("pollsHub.taskStatus.done"),
  taskStatusAvailable: () => t("pollsHub.taskStatus.available"),
  pollReadyAlert: () => t("pollsHub.alert.pollReady"),
  declineTaskStep: () => t("pollsHub.progress.declineTask"),
  declineTaskFail: () => t("pollsHub.errors.declineTask"),
  inviteStep: () => t("pollsHub.progress.invite"),
  invalidEmail: () => t("pollsHub.errors.invalidEmail"),
  unknownUser: () => t("pollsHub.errors.unknownUser"),
  inviteFail: () => t("pollsHub.errors.invite"),
  inviteSaved: () => t("pollsHub.statusMsg.inviteSaved"),
  resendStep: () => t("pollsHub.progress.resend"),
  resendFail: () => t("pollsHub.errors.resend"),
  mailSending: () => t("pollsHub.statusMsg.mailSending"),
  mailSent: () => t("pollsHub.statusMsg.mailSent"),
  mailFailed: () => t("pollsHub.statusMsg.mailFailed"),
  inviteSavedMailFail: () => t("pollsHub.errors.inviteMailFailed"),
  resendSavedMailFail: () => t("pollsHub.errors.resendMailFailed"),
  removeSubscriberTitle: () => t("pollsHub.modal.removeSubscriber.title"),
  removeSubscriberText: () => t("pollsHub.modal.removeSubscriber.text"),
  removeSubscriberOk: () => t("pollsHub.modal.removeSubscriber.ok"),
  removeSubscriberCancel: () => t("pollsHub.modal.removeSubscriber.cancel"),
  removeSubscriberStep: () => t("pollsHub.progress.removeSubscriber"),
  removeSubscriberFail: () => t("pollsHub.errors.removeSubscriber"),
  acceptSubscriptionStep: () => t("pollsHub.progress.acceptSubscription"),
  acceptSubscriptionFail: () => t("pollsHub.errors.acceptSubscription"),
  updateSubscriptionStep: () => t("pollsHub.progress.updateSubscription"),
  updateSubscriptionFail: () => t("pollsHub.errors.updateSubscription"),
  loadSubscribersStep: () => t("pollsHub.progress.loadSubscribers"),
  loadSubscribersFail: () => t("pollsHub.errors.loadSubscribers"),
  shareStatus: (status) => t(`pollsHub.shareStatus.${status}`),
  shareHint: (status) => t(`pollsHub.shareHint.${status}`),
  shareLockedHint: () => t("pollsHub.shareLockedHint"),
  shareNoChanges: () => t("pollsHub.statusMsg.shareNoChanges"),
  shareStep: () => t("pollsHub.progress.share"),
  shareSaveFail: () => t("pollsHub.errors.shareSave"),
  shareSaved: () => t("pollsHub.statusMsg.shareSaved"),
  shareSavedWithMail: (sent, total) => t("pollsHub.statusMsg.shareSavedWithMail", { sent, total }),
  shareSavedMsg: () => t("pollsHub.statusMsg.shareSavedMsg"),
  mailBatchSending: () => t("pollsHub.statusMsg.mailBatchSending"),
  mailMarking: () => t("pollsHub.statusMsg.mailMarking"),
  detailsTitle: (name) => t("pollsHub.details.titleWithName", { name }),
  loadDetailsStep: () => t("pollsHub.progress.loadDetails"),
  loadDetailsFail: () => t("pollsHub.errors.loadDetails"),
  deleteVoteTitle: () => t("pollsHub.modal.deleteVote.title"),
  deleteVoteText: () => t("pollsHub.modal.deleteVote.text"),
  deleteVoteOk: () => t("pollsHub.modal.deleteVote.ok"),
  deleteVoteCancel: () => t("pollsHub.modal.deleteVote.cancel"),
  deleteVoteStep: () => t("pollsHub.progress.deleteVote"),
  deleteVoteFail: () => t("pollsHub.errors.deleteVote"),
  loadHubFail: () => t("pollsHub.errors.loadHub"),
  focusTaskPrompt: () => t("pollsHub.confirm.focusTask"),
  focusSubPrompt: () => t("pollsHub.confirm.focusSub"),
  tokenMismatchTitle: () => t("pollsHub.modal.tokenMismatch.title"),
  tokenMismatchText: () => t("pollsHub.modal.tokenMismatch.text"),
  tokenMismatchOk: () => t("pollsHub.modal.tokenMismatch.ok"),
  tokenMismatchCancel: () => t("pollsHub.modal.tokenMismatch.cancel"),
  shareStatusLabel: () => t("pollsHub.shareStatusLabel"),
  shareStatusMissing: () => t("pollsHub.shareStatus.missing"),
  shareHintMissing: () => t("pollsHub.shareHint.missing"),
  detailsEmpty: () => t("pollsHub.empty.details"),
  pollFallback: () => t("pollsHub.pollFallback"),
  ownerFallback: () => t("pollsHub.ownerFallback"),
  mailSubTitle: (owner) => t("pollsHub.mail.subscriptionTitle", { owner }),
  mailSubBody: (owner) => t("pollsHub.mail.subscriptionBody", { owner }),
  mailSubAction: () => t("pollsHub.mail.subscriptionAction"),
  mailTaskTitle: () => t("pollsHub.mail.taskTitle"),
  mailTaskSubject: (name) => t("pollsHub.mail.taskSubject", { name }),
  mailTaskBody: (owner, name) => t("pollsHub.mail.taskBody", { owner, name }),
  mailTaskAction: () => t("pollsHub.mail.taskAction"),
  mailSubtitle: () => t("pollsHub.mail.subtitle"),
  pollNameLabel: (name) => t("pollsHub.pollNameLabel", { name }),
};

const qs = new URLSearchParams(location.search);
const focusTaskToken = qs.get("t");
const focusSubToken = qs.get("s");

const $ = (id) => document.getElementById(id);

const who = $("who");
const btnLogout = $("btnLogout");
const btnBackToBuilder = $("btnBackToBuilder");

const tabPolls = $("tabPolls");
const tabSubs = $("tabSubs");
const panelPolls = $("panelPolls");
const panelSubs = $("panelSubs");
const tabPollsMobile = $("tabPollsMobile");
const tabTasksMobile = $("tabTasksMobile");
const tabSubscribersMobile = $("tabSubscribersMobile");
const tabSubscriptionsMobile = $("tabSubscriptionsMobile");
const panelPollsMobile = $("panelPollsMobile");
const panelTasksMobile = $("panelTasksMobile");
const panelSubscribersMobile = $("panelSubscribersMobile");
const panelSubscriptionsMobile = $("panelSubscriptionsMobile");

const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;

const btnShare = $("btnShare");
const btnDetails = $("btnDetails");
const btnShareMobile = $("btnShareMobile");
const btnDetailsMobile = $("btnDetailsMobile");

const listPollsDesktop = $("pollsListDesktop");
const listPollsMobile = $("pollsListMobile");
const listTasksDesktop = $("tasksListDesktop");
const listTasksMobile = $("tasksListMobile");
const listSubscribersDesktop = $("subscribersListDesktop");
const listSubscribersMobile = $("subscribersListMobile");
const listSubscriptionsDesktop = $("subscriptionsListDesktop");
const listSubscriptionsMobile = $("subscriptionsListMobile");

const sortPollsDesktop = $("sortPollsDesktop");
const sortPollsMobile = $("sortPollsMobile");
const sortTasksDesktop = $("sortTasksDesktop");
const sortTasksMobile = $("sortTasksMobile");
const sortSubscribersDesktop = $("sortSubscribersDesktop");
const sortSubscribersMobile = $("sortSubscribersMobile");
const sortSubscriptionsDesktop = $("sortSubscriptionsDesktop");
const sortSubscriptionsMobile = $("sortSubscriptionsMobile");

const inviteInputDesktop = $("inviteInputDesktop");
const inviteInputMobile = $("inviteInputMobile");
const btnInviteDesktop = $("btnInviteDesktop");
const btnInviteMobile = $("btnInviteMobile");

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

let currentUser = null;
let selectedPollId = null;
let selectedPoll = null;
let polls = [];
let tasks = [];
let subscribers = [];
let subscriptions = [];
let pollClosedAt = new Map();
let pollReadyMap = new Map();
let sharePollId = null;
let shareBaseline = new Set();
let autoRefreshTimer = null;
let isRefreshing = false;
let subTokenPrompted = false;

const sortState = {
  polls: "newest",
  tasks: "newest",
  subscribers: "newest",
  subscriptions: "newest",
};

const sortSelects = new Map();

const archiveState = {
  polls: false,
  tasks: false,
  subscribers: false,
  subscriptions: false,
};

const sortOptions = {
  polls: [
    { value: "newest", labelKey: "pollsHub.sort.newest" },
    { value: "oldest", labelKey: "pollsHub.sort.oldest" },
    { value: "name-asc", labelKey: "pollsHub.sort.nameAsc" },
    { value: "name-desc", labelKey: "pollsHub.sort.nameDesc" },
    { value: "type", labelKey: "pollsHub.sort.type" },
    { value: "state", labelKey: "pollsHub.sort.state" },
    { value: "tasks-active", labelKey: "pollsHub.sort.tasksActive" },
    { value: "tasks-done", labelKey: "pollsHub.sort.tasksDone" },
  ],
  tasks: [
    { value: "newest", labelKey: "pollsHub.sort.newest" },
    { value: "oldest", labelKey: "pollsHub.sort.oldest" },
    { value: "name-asc", labelKey: "pollsHub.sort.nameAsc" },
    { value: "name-desc", labelKey: "pollsHub.sort.nameDesc" },
    { value: "type", labelKey: "pollsHub.sort.type" },
    { value: "available", labelKey: "pollsHub.sort.available" },
    { value: "done", labelKey: "pollsHub.sort.done" },
  ],
  subscribers: [
    { value: "newest", labelKey: "pollsHub.sort.newest" },
    { value: "oldest", labelKey: "pollsHub.sort.oldest" },
    { value: "name-asc", labelKey: "pollsHub.sort.nameEmailAsc" },
    { value: "name-desc", labelKey: "pollsHub.sort.nameEmailDesc" },
    { value: "status", labelKey: "pollsHub.sort.status" },
  ],
  subscriptions: [
    { value: "newest", labelKey: "pollsHub.sort.newest" },
    { value: "oldest", labelKey: "pollsHub.sort.oldest" },
    { value: "name-asc", labelKey: "pollsHub.sort.nameAsc" },
    { value: "name-desc", labelKey: "pollsHub.sort.nameDesc" },
    { value: "status", labelKey: "pollsHub.sort.status" },
  ],
};

function badgeNodes(kind) {
  return [...document.querySelectorAll(`[data-badge="${kind}"]`)];
}

function setBadge(kind, count) {
  const nodes = badgeNodes(kind);
  if (!nodes.length) return;
  const value = Number(count || 0);
  const text = value > 99 ? "99+" : String(value);
  const show = value > 0;
  nodes.forEach((node) => {
    node.textContent = show ? text : "";
    node.classList.toggle("is-empty", !show);
  });
}

function mailLink(path) {
  try {
    return new URL(path, location.origin).href;
  } catch {
    return path;
  }
}

function showProgress(on) {
  if (!progressOverlay) return;
  progressOverlay.style.display = on ? "grid" : "none";
}

function setProgress({ step = MSG.dash(), i = 0, n = 1, msg = "", isError = false } = {}) {
  if (progressStep) progressStep.textContent = String(step || MSG.dash());
  if (progressCount) progressCount.textContent = `${Number(i) || 0}/${Number(n) || 0}`;
  const nn = Number(n) || 0;
  const ii = Number(i) || 0;
  const pct = nn > 0 ? Math.round((ii / nn) * 100) : 0;
  if (progressBar) {
    progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    progressBar.style.background = isError ? "rgba(255,120,120,.9)" : "rgba(255,255,255,.85)";
  }
  if (progressMsg) progressMsg.textContent = msg ? String(msg) : "";
}

function finishProgress(step, n = 1, msg = MSG.ok()) {
  setProgress({ step, i: n, n, msg });
  setTimeout(() => showProgress(false), 400);
}

function failProgress(step, n = 1, msg = MSG.error()) {
  setProgress({ step, i: n, n, msg, isError: true });
  setTimeout(() => showProgress(false), 1200);
}

function resolveLabel({ primary, fallback, email }) {
  return String(primary || fallback || email || "").trim() || MSG.dash();
}

async function resolveLoginToEmail(login) {
  const v = String(login || "").trim();
  if (!v) return "";
  if (v.includes("@")) return v.toLowerCase();
  const { data, error } = await sb().rpc("profile_login_to_email", { p_login: v });
  if (error) {
    console.warn("[polls-hub] profile_login_to_email error:", error);
    return "";
  }
  return String(data || "").trim().toLowerCase();
}

async function hydrateSubscriptionLabels() {
  const subscriberIds = subscribers.map((s) => s.subscriber_user_id).filter(Boolean);
  const ownerIds = subscriptions.map((s) => s.owner_user_id || s.owner_id).filter(Boolean);
  const ids = [...new Set([...subscriberIds, ...ownerIds])];
  const subscriberEmails = subscribers.map((s) => (s.subscriber_email || "").toLowerCase()).filter(Boolean);
  const ownerEmails = subscriptions.map((s) => (s.owner_email || "").toLowerCase()).filter(Boolean);
  const emails = [...new Set([...subscriberEmails, ...ownerEmails])];

  const profiles = new Map();
  if (ids.length) {
    const { data: rows, error } = await sb().from("profiles").select("id,username,email").in("id", ids);
    if (error) {
      console.warn("[polls-hub] profiles lookup failed:", error);
    } else {
      for (const p of rows || []) {
        profiles.set(p.id, p.username || p.email || MSG.dash());
      }
    }
  }
  const profilesByEmail = new Map();
  if (emails.length) {
    const { data: rows, error } = await sb().from("profiles").select("id,username,email").in("email", emails);
    if (error) {
      console.warn("[polls-hub] profiles email lookup failed:", error);
    } else {
      for (const p of rows || []) {
        const email = String(p.email || "").toLowerCase();
        if (!email) continue;
        profilesByEmail.set(email, p);
      }
    }
  }

  subscribers = subscribers.map((sub) => {
    const profileLabel = sub.subscriber_user_id ? profiles.get(sub.subscriber_user_id) : "";
    const emailMatch = sub.subscriber_email ? profilesByEmail.get(String(sub.subscriber_email).toLowerCase()) : null;
    const label = resolveLabel({
      primary: sub.subscriber_username || profileLabel || emailMatch?.username || sub.subscriber_label,
      email: sub.subscriber_email,
    });
    return {
      ...sub,
      subscriber_display_label: label,
      subscriber_matched_user_id: sub.subscriber_user_id || emailMatch?.id || null,
    };
  });

  subscriptions = subscriptions.map((sub) => {
    const ownerId = sub.owner_user_id || sub.owner_id;
    const profileLabel = ownerId ? profiles.get(ownerId) : "";
    const emailMatch = sub.owner_email ? profilesByEmail.get(String(sub.owner_email).toLowerCase()) : null;
    const label = resolveLabel({
      primary: sub.owner_username || profileLabel || emailMatch?.username || sub.owner_label,
      email: sub.owner_email,
    });
    return {
      ...sub,
      owner_display_label: label,
      owner_matched_user_id: ownerId || emailMatch?.id || null,
    };
  });
}

function buildMailHtml({ title, subtitle, body, actionLabel, actionUrl }) {
  return `
    <div style="margin:0;padding:0;background:#050914;">
      <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;">
        <div style="padding:14px 14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
          <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">
            FAMILIADA
          </div>
          <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">
            ${subtitle}
          </div>
        </div>
        <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
          <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">
            ${title}
          </div>
          <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">
            ${body}
          </div>
          <div style="margin:16px 0;">
            <a href="${actionUrl}"
               style="display:block;text-align:center;padding:12px 14px;border-radius:14px;
                      border:1px solid rgba(255,234,166,.35);
                      background:rgba(255,234,166,.10);
                      color:#ffeaa6;
                      text-decoration:none;font-weight:1000;letter-spacing:.06em;">
              ${actionLabel}
            </a>
          </div>
          <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">
            ${t("pollsHub.mail.ignoreNote")}
          </div>
          <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
            ${t("pollsHub.mail.linkHint")}
            <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18);word-break:break-all;">
              ${actionUrl}
            </div>
          </div>
        </div>
        <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">
          ${t("pollsHub.mail.autoNote")}
        </div>
      </div>
    </div>
  `.trim();
}

async function sendMail({ to, subject, html }) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error(t("pollsHub.errors.mailSession"));
  }
  const res = await fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, subject, html }),
  });
  if (res.status === 401) {
    const { data: refreshed } = await sb().auth.refreshSession();
    const freshToken = refreshed?.session?.access_token;
    if (freshToken) {
      const retry = await fetch(MAIL_FUNCTION_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${freshToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to, subject, html }),
      });
      if (!retry.ok) {
        const text = await retry.text();
        throw new Error(text || t("pollsHub.errors.mailSend"));
      }
      return;
    }
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || t("pollsHub.errors.mailSend"));
  }
}

async function sendSubscriptionEmail({ to, link, ownerLabel }) {
  const actionUrl = mailLink(link);
  const title = MSG.mailSubTitle(ownerLabel);
  const html = buildMailHtml({
    title,
    subtitle: MSG.mailSubtitle(),
    body: MSG.mailSubBody(ownerLabel),
    actionLabel: MSG.mailSubAction(),
    actionUrl,
  });
  await sendMail({
    to,
    subject: title,
    html,
  });
}

async function sendTaskEmail({ to, link, pollName, ownerLabel }) {
  const actionUrl = mailLink(link);
  const safeName = pollName ? MSG.pollNameLabel(pollName) : MSG.pollFallback();
  const html = buildMailHtml({
    title: MSG.mailTaskTitle(),
    subtitle: MSG.mailSubtitle(),
    body: MSG.mailTaskBody(ownerLabel, safeName),
    actionLabel: MSG.mailTaskAction(),
    actionUrl,
  });
  await sendMail({
    to,
    subject: MSG.mailTaskSubject(pollName || MSG.pollFallback()),
    html,
  });
}

function renderSelect(el, kind) {
  if (!el) return;
  const options = sortOptions[kind].map((opt) => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));
  let api = sortSelects.get(el);
  if (!api) {
    api = initUiSelect(el, {
      options,
      value: sortState[kind],
      onChange: (value) => {
        sortState[kind] = value;
        renderAll();
      },
    });
    sortSelects.set(el, api);
    return;
  }
  api.setOptions(options);
  api.setValue(sortState[kind], { silent: true });
}

function setActiveTab(tab) {
  const isPolls = tab === "polls";
  tabPolls?.classList.toggle("active", isPolls);
  tabSubs?.classList.toggle("active", !isPolls);
  panelPolls?.classList.toggle("active", isPolls);
  panelSubs?.classList.toggle("active", !isPolls);
}

function setActiveMobileTab(tab) {
  const isPolls = tab === "polls";
  const isTasks = tab === "tasks";
  const isSubscribers = tab === "subscribers";
  const isSubscriptions = tab === "subscriptions";

  tabPollsMobile?.classList.toggle("active", isPolls);
  tabTasksMobile?.classList.toggle("active", isTasks);
  tabSubscribersMobile?.classList.toggle("active", isSubscribers);
  tabSubscriptionsMobile?.classList.toggle("active", isSubscriptions);

  panelPollsMobile?.classList.toggle("active", isPolls);
  panelTasksMobile?.classList.toggle("active", isTasks);
  panelSubscribersMobile?.classList.toggle("active", isSubscribers);
  panelSubscriptionsMobile?.classList.toggle("active", isSubscriptions);
}

function updateBadges() {
  const tasksPending = tasks.filter((t) => t.status === "pending").length;
  const subsPending = subscriptions.filter((s) => s.status === "pending").length;
  setBadge("tasks", tasksPending);
  setBadge("subs", subsPending);
}

function pollTypeLabel(t) {
  return t === "poll_points" ? MSG.pollTypePoints() : MSG.pollTypeText();
}

function getPollStateOrder(poll) {
  if (poll.poll_state === "draft") return 0;
  if (poll.poll_state === "open") return 1;
  return 2;
}

function parseDate(d) {
  return d ? new Date(d).getTime() : 0;
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
  if (sortState.tasks === "available") {
    filtered = filtered.filter((t) => t.status === "pending");
  }
  if (sortState.tasks === "done") {
    filtered = filtered.filter((t) => t.status === "done");
  }
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

function sortSubscribersList(list) {
  const sorted = [...list];
  switch (sortState.subscribers) {
    case "oldest":
      sorted.sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));
      break;
    case "name-asc":
      sorted.sort((a, b) => (a.subscriber_display_label || "").localeCompare(b.subscriber_display_label || ""));
      break;
    case "name-desc":
      sorted.sort((a, b) => (b.subscriber_display_label || "").localeCompare(a.subscriber_display_label || ""));
      break;
    case "status":
      sorted.sort((a, b) => subscriberStatusOrder(a.status) - subscriberStatusOrder(b.status));
      break;
    default:
      sorted.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  }
  return sorted;
}

function sortSubscriptionsList(list) {
  const sorted = [...list];
  switch (sortState.subscriptions) {
    case "oldest":
      sorted.sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));
      break;
    case "name-asc":
      sorted.sort((a, b) => (a.owner_display_label || "").localeCompare(b.owner_display_label || ""));
      break;
    case "name-desc":
      sorted.sort((a, b) => (b.owner_display_label || "").localeCompare(a.owner_display_label || ""));
      break;
    case "status":
      sorted.sort((a, b) => subscriptionStatusOrder(a.status) - subscriptionStatusOrder(b.status));
      break;
    default:
      sorted.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  }
  return sorted;
}

function subscriberStatusOrder(status) {
  if (status === "active") return 0;
  if (status === "pending") return 1;
  return 2;
}

function subscriptionStatusOrder(status) {
  if (status === "active") return 0;
  return 1;
}

function pollTileClass(poll) {
  if (poll.poll_state === "closed") return "poll-closed";
  if (poll.poll_state === "open") {
    const hasVotes = (poll.anon_votes || 0) > 0 || (poll.tasks_active || 0) > 0;
    const isGood = (poll.anon_votes || 0) >= 10 || ((poll.tasks_active || 0) === 0 && (poll.tasks_done || 0) > 0);
    if (isGood) return "poll-open-good";
    return hasVotes ? "poll-open-active" : "poll-open-empty";
  }
  const ready = pollReadyMap.get(poll.game_id) === true;
  return ready ? "poll-draft-ready" : "poll-draft";
}

function pollVotesMeta(poll) {
  const sharedTotal = (poll.tasks_active || 0) + (poll.tasks_done || 0);
  const tasksDone = poll.tasks_done || 0;
  const anonVotes = poll.anon_votes || 0;
  const tasksText = sharedTotal > 0 ? `${tasksDone}/${sharedTotal}` : "0/0";
  return {
    tasksText,
    tasksTitle: sharedTotal > 0
      ? MSG.tasksBadgeTitle(tasksDone, sharedTotal)
      : MSG.tasksBadgeNone(),
    anonText: `${anonVotes}`,
    anonTitle: MSG.anonBadgeTitle(anonVotes),
  };
}

function renderEmpty(listEl, text) {
  if (!listEl) return;
  listEl.innerHTML = `<div class="hub-empty">${text}</div>`;
}

function renderPolls() {
  const visible = polls.filter((p) => (archiveState.polls ? isPollArchived(p) : !isPollArchived(p)));
  const sorted = sortPollsList(visible);
  const render = (listEl) => {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!sorted.length) {
      renderEmpty(listEl, MSG.emptyPolls());
      return;
    }
    for (const poll of sorted) {
      const votesMeta = pollVotesMeta(poll);
      const item = document.createElement("div");
      item.className = `hub-item ${pollTileClass(poll)} ${poll.game_id === selectedPollId ? "selected" : ""}`;
      item.dataset.id = poll.game_id;
      item.innerHTML = `
        <div>
          <div class="hub-item-title">${pollTypeLabel(poll.poll_type)} — ${poll.name || MSG.dash()}</div>
          <div class="hub-item-sub">${poll.poll_state === "open" ? MSG.pollStateOpen() : poll.poll_state === "closed" ? MSG.pollStateClosed() : MSG.pollStateDraft()}</div>
        </div>
        <div class="hub-item-actions">
          <span class="hub-item-badge" title="${votesMeta.tasksTitle}">${t("pollsHub.tasksBadgeLabel")}: ${votesMeta.tasksText}</span>
          <span class="hub-item-badge hub-item-badge-alt" title="${votesMeta.anonTitle}">${MSG.anonBadgeLabel()}: ${votesMeta.anonText}</span>
        </div>
      `;
      item.addEventListener("click", () => selectPoll(poll));
      item.addEventListener("dblclick", () => openPoll(poll));
      listEl.appendChild(item);
    }
  };
  render(listPollsDesktop);
  render(listPollsMobile);
}

function renderTasks() {
  const visible = tasks.filter((t) => {
    if (t.status === "declined" || t.status === "cancelled") return false;
    if (archiveState.tasks) return t.is_archived && t.status === "done";
    return !t.is_archived && (t.status === "pending" || t.status === "done");
  });
  const sorted = sortTasksList(visible);
  const render = (listEl) => {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!sorted.length) {
      renderEmpty(listEl, MSG.emptyTasks());
      return;
    }
    for (const task of sorted) {
      const item = document.createElement("div");
      const statusClass = task.status === "done" ? "task-done" : "task-pending";
      item.className = `hub-item ${statusClass}`;
      item.innerHTML = `
        <div>
          <div class="hub-item-title">${pollTypeLabel(task.poll_type)} — ${task.game_name || MSG.dash()}</div>
          <div class="hub-item-sub">${task.status === "done" ? MSG.taskStatusDone() : MSG.taskStatusAvailable()}</div>
        </div>
        <div class="hub-item-actions"></div>
      `;
      const actions = item.querySelector(".hub-item-actions");
      if (task.status === "pending") {
        const btn = document.createElement("button");
        btn.className = "btn xs danger";
        btn.textContent = "X";
        btn.title = t("pollsHub.actions.decline");
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await declineTask(task);
        });
        actions?.appendChild(btn);
      }
      item.addEventListener("dblclick", () => openTask(task));
      listEl.appendChild(item);
    }
  };
  render(listTasksDesktop);
  render(listTasksMobile);
}

function renderSubscribers() {
  const visible = subscribers.filter((s) => {
    if (archiveState.subscribers) return s.is_expired || s.status === "declined" || s.status === "cancelled";
    return s.status === "pending" || s.status === "active";
  });
  const sorted = sortSubscribersList(visible);
  const render = (listEl) => {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!sorted.length) {
      renderEmpty(listEl, MSG.emptySubscribers());
      return;
    }
    for (const sub of sorted) {
      const statusClass = sub.status === "active" ? "sub-active" : sub.status === "pending" ? "sub-pending" : "sub-declined";
      const item = document.createElement("div");
      item.className = `hub-item ${statusClass}`;
      item.innerHTML = `
        <div>
          <div class="hub-item-title">${sub.subscriber_display_label || MSG.dash()}</div>
          <div class="hub-item-sub">${statusLabel(sub.status)}</div>
        </div>
        <div class="hub-item-actions"></div>
      `;
      const actions = item.querySelector(".hub-item-actions");
      const btnRemove = document.createElement("button");
      btnRemove.className = "btn xs danger";
      btnRemove.textContent = "X";
      btnRemove.title = t("pollsHub.actions.remove");
      btnRemove.addEventListener("click", async (e) => {
        e.stopPropagation();
        await removeSubscriber(sub);
      });
      actions?.appendChild(btnRemove);

      if (sub.status === "pending") {
        const btnResend = document.createElement("button");
        btnResend.className = "btn xs";
        btnResend.textContent = "↻";
        btnResend.title = t("pollsHub.actions.resend");
        btnResend.addEventListener("click", async (e) => {
          e.stopPropagation();
          await resendSubscriber(sub);
        });
        actions?.appendChild(btnResend);
      }
      listEl.appendChild(item);
    }
  };
  render(listSubscribersDesktop);
  render(listSubscribersMobile);
}

function renderSubscriptions() {
  const visible = subscriptions.filter((s) => {
    if (archiveState.subscriptions) return s.is_expired;
    return true;
  });
  const sorted = sortSubscriptionsList(visible);
  const render = (listEl) => {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!sorted.length) {
      renderEmpty(listEl, MSG.emptySubscriptions());
      return;
    }
    for (const sub of sorted) {
      const statusClass = sub.status === "active" ? "sub-active" : "sub-pending";
      const item = document.createElement("div");
      item.className = `hub-item ${statusClass}`;
      item.innerHTML = `
        <div>
          <div class="hub-item-title">${sub.owner_display_label || MSG.dash()}</div>
          <div class="hub-item-sub">${statusLabel(sub.status)}</div>
        </div>
        <div class="hub-item-actions"></div>
      `;
      const actions = item.querySelector(".hub-item-actions");
      const btnRemove = document.createElement("button");
      btnRemove.className = "btn xs danger";
      btnRemove.textContent = "X";
      btnRemove.title = sub.status === "pending" ? t("pollsHub.actions.decline") : t("pollsHub.actions.cancel");
      btnRemove.addEventListener("click", async (e) => {
        e.stopPropagation();
        await rejectSubscription(sub);
      });
      actions?.appendChild(btnRemove);

      if (sub.status === "pending") {
        const btnAccept = document.createElement("button");
        btnAccept.className = "btn xs gold";
        btnAccept.textContent = "✓";
        btnAccept.title = t("pollsHub.actions.accept");
        btnAccept.addEventListener("click", async (e) => {
          e.stopPropagation();
          await acceptSubscription(sub);
        });
        actions?.appendChild(btnAccept);
      }

      listEl.appendChild(item);
    }
  };
  render(listSubscriptionsDesktop);
  render(listSubscriptionsMobile);
}

function statusLabel(status) {
  if (status === "active") return t("pollsHub.status.active");
  if (status === "pending") return t("pollsHub.status.pending");
  if (status === "declined") return t("pollsHub.status.declined");
  if (status === "cancelled") return t("pollsHub.status.cancelled");
  return status;
}

function selectPoll(poll) {
  selectedPollId = poll.game_id;
  selectedPoll = poll;
  renderPolls();
  updatePollActions();
}

function updatePollActions() {
  const isOpen = selectedPoll?.poll_state === "open";
  const canShare = !!selectedPollId && isOpen;
  const canDetails = !!selectedPollId && selectedPoll?.poll_state !== "draft";
  btnShare && (btnShare.disabled = !canShare);
  btnShareMobile && (btnShareMobile.disabled = !canShare);
  btnDetails && (btnDetails.disabled = !canDetails);
  btnDetailsMobile && (btnDetailsMobile.disabled = !canDetails);
}

async function openPoll(poll) {
  if (poll.poll_state === "draft" && !pollReadyMap.get(poll.game_id)) {
    void alertModal({ text: MSG.pollReadyAlert() });
    return;
  }
  location.href = `polls.html?id=${encodeURIComponent(poll.game_id)}&from=polls-hub`;
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

function openTask(task) {
  if (task.status !== "pending") return;
  const token = extractToken(task.go_url, "t");
  if (!token) return;
  const page = task.poll_type === "poll_points" ? "poll-points.html" : "poll-text.html";
  location.href = `${page}?t=${encodeURIComponent(token)}`;
}

async function declineTask(task) {
  const step = MSG.declineTaskStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 2, msg: "" });
    await sb().rpc("polls_hub_task_decline", { p_task_id: task.task_id });
    setProgress({ step, i: 1, n: 2, msg: MSG.ok() });
    await refreshData();
    finishProgress(step, 2);
  } catch (e) {
    console.error(e);
    failProgress(step, 2, MSG.declineTaskFail());
    void alertModal({ text: MSG.declineTaskFail() });
  }
}

async function inviteSubscriber(recipient) {
  if (!recipient) return;
  const step = MSG.inviteStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 3, msg: "" });
    const resolved = await resolveLoginToEmail(recipient);
    if (!resolved) {
      const msg = recipient.includes("@") ? MSG.invalidEmail() : MSG.unknownUser();
      failProgress(step, 3, msg);
      void alertModal({ text: msg });
      return;
    }

    const { data, error } = await sb().rpc("polls_hub_subscription_invite", { p_recipient: resolved });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data?.error || MSG.inviteFail());
    setProgress({ step, i: 1, n: 3, msg: MSG.inviteSaved() });
    if (!data?.already && data?.id && data?.channel === "email") {
      const { data: resendData, error: resendError } = await sb().rpc("polls_hub_subscriber_resend", { p_id: data.id });
      if (resendError) throw resendError;
      if (resendData?.ok === false) throw new Error(resendData?.error || MSG.inviteFail());
      if (resendData?.to && resendData?.link) {
        const ownerLabel = currentUser?.username || currentUser?.email || MSG.ownerFallback();
        try {
          setProgress({ step, i: 2, n: 3, msg: MSG.mailSending() });
          await sendSubscriptionEmail({
            to: resendData.to,
            link: resendData.link,
            ownerLabel,
          });
          setProgress({ step, i: 2, n: 3, msg: MSG.mailSent() });
        } catch (mailError) {
          console.error(mailError);
          setProgress({ step, i: 2, n: 3, msg: MSG.mailFailed() });
          void alertModal({ text: MSG.inviteSavedMailFail() });
        }
      }
    }
    await refreshData();
    finishProgress(step, 3);
  } catch (e) {
    console.error(e);
    const msg = e?.message || MSG.inviteFail();
    failProgress(step, 3, msg);
    void alertModal({ text: msg });
  }
}

async function resendSubscriber(sub) {
  const step = MSG.resendStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 3, msg: "" });
    const { data, error } = await sb().rpc("polls_hub_subscriber_resend", { p_id: sub.sub_id });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data?.error || MSG.resendFail());
    if (data?.to && data?.link) {
      const ownerLabel = currentUser?.username || currentUser?.email || MSG.ownerFallback();
      try {
        setProgress({ step, i: 1, n: 3, msg: MSG.mailSending() });
        await sendSubscriptionEmail({
          to: data.to,
          link: data.link,
          ownerLabel,
        });
        setProgress({ step, i: 1, n: 3, msg: MSG.mailSent() });
      } catch (mailError) {
        console.error(mailError);
        setProgress({ step, i: 1, n: 3, msg: MSG.mailFailed() });
        void alertModal({ text: MSG.resendSavedMailFail() });
      }
    }
    await refreshData();
    finishProgress(step, 3);
  } catch (e) {
    console.error(e);
    failProgress(step, 3, MSG.resendFail());
    void alertModal({ text: MSG.resendFail() });
  }
}

async function removeSubscriber(sub) {
  const ok = await confirmModal({
    title: MSG.removeSubscriberTitle(),
    text: MSG.removeSubscriberText(),
    okText: MSG.removeSubscriberOk(),
    cancelText: MSG.removeSubscriberCancel(),
  });
  if (!ok) return;
  const step = MSG.removeSubscriberStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 2, msg: "" });
    await sb().rpc("polls_hub_subscriber_remove", { p_id: sub.sub_id });
    setProgress({ step, i: 1, n: 2, msg: MSG.ok() });
    await refreshData();
    finishProgress(step, 2);
  } catch (e) {
    console.error(e);
    failProgress(step, 2, MSG.removeSubscriberFail());
    void alertModal({ text: MSG.removeSubscriberFail() });
  }
}

async function acceptSubscription(sub) {
  const step = MSG.acceptSubscriptionStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 2, msg: "" });
    await sb().rpc("polls_hub_subscription_accept", { p_id: sub.sub_id });
    setProgress({ step, i: 1, n: 2, msg: MSG.ok() });
    await refreshData();
    finishProgress(step, 2);
  } catch (e) {
    console.error(e);
    failProgress(step, 2, MSG.acceptSubscriptionFail());
    void alertModal({ text: MSG.acceptSubscriptionFail() });
  }
}

async function rejectSubscription(sub) {
  const step = MSG.updateSubscriptionStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 2, msg: "" });
    const rpc = sub.status === "pending" ? "polls_hub_subscription_reject" : "polls_hub_subscription_cancel";
    await sb().rpc(rpc, { p_id: sub.sub_id });
    setProgress({ step, i: 1, n: 2, msg: MSG.ok() });
    await refreshData();
    finishProgress(step, 2);
  } catch (e) {
    console.error(e);
    failProgress(step, 2, MSG.updateSubscriptionFail());
    void alertModal({ text: MSG.updateSubscriptionFail() });
  }
}

async function openShareModal() {
  if (!selectedPollId) return;
  sharePollId = selectedPollId;
  shareBaseline = new Set();
  shareMsg.textContent = "";
  shareList.innerHTML = "";
  const step = MSG.loadSubscribersStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 1, msg: "" });
    const activeSubs = subscribers.filter((s) => s.status === "active");
    const { data: taskRows, error } = await sb()
      .from("poll_tasks")
      .select("id,recipient_user_id,recipient_email,status")
      .eq("game_id", sharePollId)
      .eq("owner_id", currentUser.id);
    if (error) throw error;

    const statusBySub = new Map();
    const taskEmails = [...new Set((taskRows || []).map((t) => (t.recipient_email || "").toLowerCase()).filter(Boolean))];
    const taskProfiles = new Map();
    if (taskEmails.length) {
      const { data: rows, error: profileError } = await sb()
        .from("profiles")
        .select("id,email")
        .in("email", taskEmails);
      if (profileError) {
        console.warn("[polls-hub] task email lookup failed:", profileError);
      } else {
        for (const p of rows || []) {
          const email = String(p.email || "").toLowerCase();
          if (email) taskProfiles.set(email, p.id);
        }
      }
    }
    for (const task of taskRows || []) {
      const key = task.recipient_user_id || (task.recipient_email || "").toLowerCase();
      statusBySub.set(key, task.status);
      const matchedId = task.recipient_email ? taskProfiles.get(String(task.recipient_email).toLowerCase()) : null;
      if (matchedId) {
        statusBySub.set(matchedId, task.status);
      }
    }

    for (const sub of activeSubs) {
      const key = sub.subscriber_matched_user_id
        || sub.subscriber_user_id
        || (sub.subscriber_email || "").toLowerCase();
      const status = statusBySub.get(key);
      const row = document.createElement("label");
      row.className = "hub-share-item";
      const isActive = status === "pending" || status === "opened";
      const isLocked = status === "done";
      if (isActive) shareBaseline.add(String(sub.sub_id));
      row.innerHTML = `
        <input type="checkbox" ${isActive ? "checked" : ""} ${isLocked ? "disabled" : ""} data-sub-id="${sub.sub_id}">
        <div>
          <div class="hub-item-title">${sub.subscriber_display_label || MSG.dash()}</div>
          <div class="hub-share-status">${shareStatusLabel(status)}</div>
        </div>
        <div class="hub-share-status">${shareStatusHint(status)}</div>
      `;
      const input = row.querySelector("input");
      if (input && isLocked) {
        input.title = MSG.shareLockedHint();
      }
      shareList.appendChild(row);
    }

    if (!activeSubs.length) {
      shareList.innerHTML = `<div class="hub-empty">${MSG.emptyActiveSubscribers()}</div>`;
    }
    shareOverlay.style.display = "grid";
    finishProgress(step, 1);
  } catch (e) {
    console.error(e);
    failProgress(step, 1, MSG.loadSubscribersFail());
    void alertModal({ text: MSG.loadSubscribersFail() });
  }
}

function shareStatusLabel(status) {
  if (status === "done") return MSG.shareStatus("done");
  if (status === "pending" || status === "opened") return MSG.shareStatus("active");
  if (status === "declined") return MSG.shareStatus("declined");
  if (status === "cancelled") return MSG.shareStatus("cancelled");
  return MSG.shareStatusMissing();
}

function shareStatusHint(status) {
  if (status === "done") return MSG.shareHint("locked");
  if (status === "pending" || status === "opened") return MSG.shareHint("active");
  if (status === "declined") return MSG.shareHint("retry");
  if (status === "cancelled") return MSG.shareHint("retry");
  return MSG.shareHintMissing();
}

async function saveShareModal() {
  const selected = [...shareList.querySelectorAll("input[type=checkbox]")]
    .filter((x) => x.checked)
    .map((x) => x.dataset.subId);
  const selectedSet = new Set(selected);
  const changed =
    selected.length !== shareBaseline.size ||
    selected.some((id) => !shareBaseline.has(String(id)));
  if (!changed) {
    shareMsg.textContent = MSG.shareNoChanges();
    setTimeout(closeShareModal, 600);
    return;
  }
  const step = MSG.shareStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 4, msg: "" });
    const { data, error } = await sb().rpc("polls_hub_share_poll", {
      p_game_id: sharePollId,
      p_sub_ids: selected,
    });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data?.error || MSG.shareSaveFail());
    setProgress({ step, i: 1, n: 4, msg: MSG.shareSavedMsg() });
    const mailItems = Array.isArray(data?.mail) ? data.mail : [];
    let sentCount = 0;
    if (mailItems.length) {
      const ownerLabel = currentUser?.username || currentUser?.email || MSG.ownerFallback();
      const pollName = selectedPoll?.name || "";
      setProgress({ step, i: 2, n: 4, msg: MSG.mailBatchSending() });
      const results = await Promise.allSettled(
        mailItems.map((item) =>
          sendTaskEmail({
            to: item.to,
            link: item.link,
            pollName,
            ownerLabel,
          })
        )
      );
      const sentTaskIds = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          sentCount += 1;
          if (mailItems[index]?.task_id) sentTaskIds.push(mailItems[index].task_id);
        }
      });
      if (sentTaskIds.length) {
        setProgress({ step, i: 3, n: 4, msg: MSG.mailMarking() });
        await sb().rpc("polls_hub_tasks_mark_emailed", { p_task_ids: sentTaskIds });
      }
    }
    shareMsg.textContent = mailItems.length
      ? MSG.shareSavedWithMail(sentCount, mailItems.length)
      : MSG.shareSaved();
    await refreshData();
    finishProgress(step, 4);
    setTimeout(closeShareModal, 500);
  } catch (e) {
    console.error(e);
    failProgress(step, 4, MSG.shareSaveFail());
    shareMsg.textContent = MSG.shareSaveFail();
  }
}

function closeShareModal() {
  shareOverlay.style.display = "none";
  sharePollId = null;
}

async function openDetailsModal({ withProgress = true } = {}) {
  if (!selectedPollId) return;
  detailsVoted.innerHTML = "";
  detailsPending.innerHTML = "";
  detailsDeclined.innerHTML = "";
  detailsCancelled.innerHTML = "";
  detailsAnon.textContent = String(selectedPoll?.anon_votes || 0);
  detailsTitle.textContent = MSG.detailsTitle(selectedPoll?.name || "");
  const step = MSG.loadDetailsStep();
  try {
    if (withProgress) {
      showProgress(true);
      setProgress({ step, i: 0, n: 1, msg: "" });
    }
    const { data: taskRows, error } = await sb()
      .from("poll_tasks")
      .select("id,recipient_user_id,recipient_email,status")
      .eq("game_id", selectedPollId)
      .eq("owner_id", currentUser.id);
    if (error) throw error;

    const ids = [...new Set(taskRows.map((t) => t.recipient_user_id).filter(Boolean))];
    const profiles = new Map();
    if (ids.length) {
      const { data: profileRows } = await sb().from("profiles").select("id,username,email").in("id", ids);
      for (const p of profileRows || []) {
        profiles.set(p.id, p.username || p.email || MSG.dash());
      }
    }

    for (const task of taskRows || []) {
      const label = task.recipient_user_id
        ? profiles.get(task.recipient_user_id) || task.recipient_user_id
        : task.recipient_email || MSG.dash();
      const item = document.createElement("div");
      item.className = "hub-details-item";
      item.innerHTML = `
        <div>${label}</div>
        <div class="hub-item-actions"></div>
      `;
      const actions = item.querySelector(".hub-item-actions");
      if (task.status === "done") {
        const btn = document.createElement("button");
        btn.className = "btn xs danger";
        btn.textContent = t("pollsHub.actions.remove");
        btn.addEventListener("click", async () => {
          const ok = await confirmModal({
            title: MSG.deleteVoteTitle(),
            text: MSG.deleteVoteText(),
            okText: MSG.deleteVoteOk(),
            cancelText: MSG.deleteVoteCancel(),
          });
          if (!ok) return;
          await deleteVote(task.id);
        });
        actions?.appendChild(btn);
        detailsVoted.appendChild(item);
      } else if (task.status === "declined") {
        detailsDeclined.appendChild(item);
      } else if (task.status === "cancelled") {
        detailsCancelled.appendChild(item);
      } else {
        detailsPending.appendChild(item);
      }
    }

    const maybeEmpty = (list) => {
      if (!list || list.children.length) return;
      list.innerHTML = `<div class="hub-empty">${MSG.emptyTasksShort()}</div>`;
    };
    if (!taskRows?.length) {
      const empty = `<div class="hub-empty">${MSG.emptyTasksShort()}</div>`;
      detailsVoted.innerHTML = empty;
      detailsPending.innerHTML = empty;
      detailsDeclined.innerHTML = empty;
      detailsCancelled.innerHTML = empty;
    } else {
      maybeEmpty(detailsVoted);
      maybeEmpty(detailsPending);
      maybeEmpty(detailsDeclined);
      maybeEmpty(detailsCancelled);
    }

    detailsOverlay.style.display = "grid";
    if (withProgress) finishProgress(step, 1);
  } catch (e) {
    console.error(e);
    if (withProgress) failProgress(step, 1, MSG.loadDetailsFail());
    void alertModal({ text: MSG.loadDetailsFail() });
  }
}

async function deleteVote(taskId) {
  const step = MSG.deleteVoteStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 2, msg: "" });
    await sb().rpc("poll_admin_delete_vote", { p_game_id: selectedPollId, p_voter_token: `task:${taskId}` });
    await sb()
      .from("poll_tasks")
      .update({ status: "cancelled" })
      .eq("id", taskId)
      .eq("owner_id", currentUser.id);
    setProgress({ step, i: 1, n: 2, msg: MSG.ok() });
    await openDetailsModal({ withProgress: false });
    finishProgress(step, 2);
  } catch (e) {
    console.error(e);
    failProgress(step, 2, MSG.deleteVoteFail());
    void alertModal({ text: MSG.deleteVoteFail() });
  }
}

function closeDetailsModal() {
  detailsOverlay.style.display = "none";
}

function syncToggles() {
  document.querySelectorAll(".hub-toggle").forEach((wrap) => {
    const kind = wrap.dataset.kind;
    const isArchive = archiveState[kind];
    wrap.querySelectorAll("button").forEach((btn) => {
      const mode = btn.dataset.toggle;
      btn.classList.toggle("active", (mode === "archive") === isArchive);
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
      renderAll();
    });
  });
}

function renderAll() {
  renderPolls();
  renderTasks();
  renderSubscribers();
  renderSubscriptions();
}

async function refreshData() {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    const [pollsRes, tasksRes, subsRes, mySubsRes] = await Promise.all([
      sb().rpc("polls_hub_list_polls"),
      sb().rpc("polls_hub_list_tasks"),
      sb().rpc("polls_hub_list_my_subscribers"),
      sb().rpc("polls_hub_list_my_subscriptions"),
    ]);
    polls = pollsRes.data || [];
    tasks = tasksRes.data || [];
    subscribers = subsRes.data || [];
    subscriptions = mySubsRes.data || [];
    await hydrateSubscriptionLabels();

    if (selectedPollId && !polls.some((p) => p.game_id === selectedPollId)) {
      selectedPollId = null;
      selectedPoll = null;
    }

    const pollIds = polls.map((p) => p.game_id).filter(Boolean);
    pollClosedAt = new Map();
    if (pollIds.length) {
      const { data: dates } = await sb().from("games").select("id,poll_closed_at").in("id", pollIds);
      for (const row of dates || []) {
        pollClosedAt.set(row.id, row.poll_closed_at);
      }
    }

    pollReadyMap = new Map();
    await Promise.all(
      polls
        .filter((p) => p.poll_state === "draft")
        .map(async (p) => {
          try {
            const ready = await validatePollReadyToOpen(p.game_id);
            pollReadyMap.set(p.game_id, !!ready?.ok);
          } catch {
            pollReadyMap.set(p.game_id, false);
          }
        })
    );

    updateBadges();
    renderAll();
    updatePollActions();
    await maybeFocusFromToken();
  } catch (e) {
    console.error(e);
    void alertModal({ text: MSG.loadHubFail() });
  } finally {
    isRefreshing = false;
  }
}

async function maybeFocusFromToken() {
  if (focusTaskToken) {
    const match = tasks.find((t) => extractToken(t.go_url, "t") === focusTaskToken);
    if (match) {
      const page = match.poll_type === "poll_points" ? "poll-points.html" : "poll-text.html";
      const promptVote = await confirmModal({ text: MSG.focusTaskPrompt() });
      if (promptVote) {
        location.href = `${page}?t=${encodeURIComponent(focusTaskToken)}`;
      }
    }
  }
  if (focusSubToken) {
    const match = subscriptions.find((s) => String(s.token) === focusSubToken);
    if (match && match.status === "pending") {
      const promptAccept = await confirmModal({ text: MSG.focusSubPrompt() });
      if (promptAccept) {
        acceptSubscription(match);
      }
    } else if (currentUser && !subTokenPrompted) {
      subTokenPrompted = true;
      confirmModal({
        title: MSG.tokenMismatchTitle(),
        text: MSG.tokenMismatchText(),
        okText: MSG.tokenMismatchOk(),
        cancelText: MSG.tokenMismatchCancel(),
      }).then(async (ok) => {
        if (!ok) return;
        await signOut();
        const url = new URL("index.html", location.href);
        url.searchParams.set("next", "polls-hub");
        url.searchParams.set("s", focusSubToken);
        location.href = url.toString();
      });
    }
  }
}

function wireInvite(inputEl) {
  if (!inputEl) return;
  const handler = async () => {
    const v = inputEl.value.trim();
    if (!v) return;
    await inviteSubscriber(v);
    inputEl.value = "";
  };
  return handler;
}

function wireOverlayClose(overlay, onClose) {
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) onClose();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  if (who) who.textContent = currentUser?.username || currentUser?.email || MSG.dash();

  renderSelect(sortPollsDesktop, "polls");
  renderSelect(sortPollsMobile, "polls");
  renderSelect(sortTasksDesktop, "tasks");
  renderSelect(sortTasksMobile, "tasks");
  renderSelect(sortSubscribersDesktop, "subscribers");
  renderSelect(sortSubscribersMobile, "subscribers");
  renderSelect(sortSubscriptionsDesktop, "subscriptions");
  renderSelect(sortSubscriptionsMobile, "subscriptions");

  registerToggleHandlers();
  syncToggles();

  tabPolls?.addEventListener("click", () => setActiveTab("polls"));
  tabSubs?.addEventListener("click", () => setActiveTab("subs"));
  setActiveTab("polls");

  tabPollsMobile?.addEventListener("click", () => setActiveMobileTab("polls"));
  tabTasksMobile?.addEventListener("click", () => setActiveMobileTab("tasks"));
  tabSubscribersMobile?.addEventListener("click", () => setActiveMobileTab("subscribers"));
  tabSubscriptionsMobile?.addEventListener("click", () => setActiveMobileTab("subscriptions"));
  setActiveMobileTab("polls");

  btnShare?.addEventListener("click", openShareModal);
  btnShareMobile?.addEventListener("click", openShareModal);
  btnDetails?.addEventListener("click", openDetailsModal);
  btnDetailsMobile?.addEventListener("click", openDetailsModal);

  btnShareSave?.addEventListener("click", saveShareModal);
  btnShareClose?.addEventListener("click", closeShareModal);
  btnDetailsClose?.addEventListener("click", closeDetailsModal);

  wireOverlayClose(shareOverlay, closeShareModal);
  wireOverlayClose(detailsOverlay, closeDetailsModal);

  const inviteDesktop = wireInvite(inviteInputDesktop);
  const inviteMobile = wireInvite(inviteInputMobile);
  btnInviteDesktop?.addEventListener("click", inviteDesktop);
  btnInviteMobile?.addEventListener("click", inviteMobile);
  inviteInputDesktop?.addEventListener("keydown", (e) => e.key === "Enter" && inviteDesktop());
  inviteInputMobile?.addEventListener("keydown", (e) => e.key === "Enter" && inviteMobile());

  btnBackToBuilder?.addEventListener("click", () => {
    location.href = "builder.html";
  });

  btnLogout?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  window.addEventListener("i18n:lang", () => {
    renderSelect(sortPollsDesktop, "polls");
    renderSelect(sortPollsMobile, "polls");
    renderSelect(sortTasksDesktop, "tasks");
    renderSelect(sortTasksMobile, "tasks");
    renderSelect(sortSubscribersDesktop, "subscribers");
    renderSelect(sortSubscribersMobile, "subscribers");
    renderSelect(sortSubscriptionsDesktop, "subscriptions");
    renderSelect(sortSubscriptionsMobile, "subscriptions");
    renderAll();
    updatePollActions();
  });

  await refreshData();

  autoRefreshTimer = setInterval(() => {
    const shareOpen = shareOverlay?.style.display === "grid";
    const detailsOpen = detailsOverlay?.style.display === "grid";
    if (!shareOpen && !detailsOpen) refreshData();
  }, 30000);
});
