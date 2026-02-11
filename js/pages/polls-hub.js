// js/pages/polls-hub.js
import { sb, SUPABASE_URL } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { validatePollReadyToOpen } from "../core/game-validate.js";
import { alertModal, confirmModal } from "../core/modal.js";
import { initUiSelect } from "../core/ui-select.js";
import { initI18n, t, getUiLang } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PENDING_ARCHIVE_MS = 5 * 24 * 60 * 60 * 1000;

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
  votesBadgeLabel: () => t("pollsHub.votesBadgeLabel"),
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
  pollReadyAlert: () => t("pollsHub.pollReadyAlert"),
  declineTaskStep: () => t("pollsHub.progress.declineTask"),
  declineTaskFail: () => t("pollsHub.errors.declineTask"),
  inviteStep: () => t("pollsHub.progress.invite"),
  invalidEmail: () => t("pollsHub.errors.invalidEmail"),
  unknownUser: () => t("pollsHub.errors.unknownUser"),
  inviteFail: () => t("pollsHub.errors.invite"),
  inviteSaved: () => t("pollsHub.statusMsg.inviteSaved"),
  resendStep: () => t("pollsHub.progress.resend"),
  resendFail: () => t("pollsHub.errors.resend"),
  resendCooldownAlert: (hours) => t("pollsHub.resendCooldownAlert", { hours }),
  shareCooldownAlert: (hours) => t("pollsHub.shareCooldownAlert", { hours }),
  shareHintCooldown: (hours) => t("pollsHub.shareHint.cooldown", { hours }),
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
let focusSubHandled = false;
let focusTaskHandled = false;

function clearUrlParam(key) {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has(key)) return;
    url.searchParams.delete(key);
    history.replaceState(null, "", url.toString());
  } catch {
    // ignore
  }
}

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

function buildPollGoLink({ tokenKey, token, lang }) {
  const safeLang = String(lang || "").trim() || (typeof getUiLang === "function" ? getUiLang() : "pl") || "pl";
  const url = new URL("poll_go.html", location.origin);
  url.searchParams.set(tokenKey, token);
  url.searchParams.set("lang", safeLang);
  return url.href;
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

function isPendingOlderThan5Days(row) {
  // baza: kiedy wysłano maila (najlepsze), fallback: created_at
  const base = parseDate(row.email_sent_at) || parseDate(row.created_at);
  if (!base) return false;
  return (Date.now() - base) > PENDING_ARCHIVE_MS;
}

function hoursLeftFrom(untilTs) {
  const ms = untilTs - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (60 * 60 * 1000));
}

function cooldownUntilFromTs(ts) {
  const base = parseDate(ts);
  if (!base) return 0;
  return base + COOLDOWN_MS;
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
    const hasActivity = (poll.anon_votes || 0) > 0 || (poll.tasks_active || 0) > 0;

    // ✅ zielone = spełnia warunki zamknięcia z polls (liczone w DB jako close_ready)
    const canClose = !!poll.close_ready;
    if (canClose) return "poll-open-good";

    // żółte = ma aktywność, ale jeszcze nie można zamknąć
    // pomarańczowe = brak anon i brak tasków
    return hasActivity ? "poll-open-active" : "poll-open-empty";
  }
  const ready = pollReadyMap.get(poll.game_id) === true;
  return ready ? "poll-draft-ready" : "poll-draft";
}


function pollVotesMeta(poll) {
  const isClosed = poll.poll_state === "closed";
  const sharedTotal = (poll.tasks_active || 0) + (poll.tasks_done || 0);
  const tasksDone = poll.tasks_done || 0;
  const anonVotes = poll.anon_votes || 0;
  // open: tasks X/Y
  // closed: votes X (głosy od subskrybentów = tasks_done)
  const leftLabel = isClosed ? MSG.votesBadgeLabel() : t("pollsHub.tasksBadgeLabel");
  const leftText = isClosed
    ? `${tasksDone}`
    : (sharedTotal > 0 ? `${tasksDone}/${sharedTotal}` : "0/0");

  const leftTitle = isClosed
    ? leftLabel
    : (sharedTotal > 0 ? MSG.tasksBadgeTitle(tasksDone, sharedTotal) : MSG.tasksBadgeNone());

  return {
    leftLabel,
    leftText,
    leftTitle,
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
      
      // Drafty (szare/czerwone): bez badge’y
      const badgesHtml = (poll.poll_state === "draft")
        ? ""
        : `
          <div class="hub-item-actions hub-item-actions--poll-badges">
            <span class="hub-item-badge" title="${votesMeta.leftTitle}">${votesMeta.leftLabel}: ${votesMeta.leftText}</span>
            <span class="hub-item-badge hub-item-badge-alt" title="${votesMeta.anonTitle}">${MSG.anonBadgeLabel()}: ${votesMeta.anonText}</span>
          </div>
        `;
      item.innerHTML = `
        <div>
          <div class="hub-item-title">${pollTypeLabel(poll.poll_type)} — ${poll.name || MSG.dash()}</div>
          <div class="hub-item-sub">${poll.poll_state === "open" ? MSG.pollStateOpen() : poll.poll_state === "closed" ? MSG.pollStateClosed() : MSG.pollStateDraft()}</div>
        </div>
        ${badgesHtml}
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
    // nigdy nie pokazujemy anulowanych/odrzuconych (historia = śmieci na liście)
    if (s.status === "declined" || s.status === "cancelled") return false;
  
    // ARCHIWALNE = pending > 5 dni
    if (archiveState.subscribers) return s.status === "pending" && isPendingOlderThan5Days(s);
  
    // AKTUALNE = active + pending <= 5 dni
    if (s.status === "active") return true;
    if (s.status === "pending") return !isPendingOlderThan5Days(s);
    return false;
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
        const until = cooldownUntilFromTs(sub.email_sent_at);
        const isCooldown = !!until && Date.now() < until;
        btnResend.title = isCooldown ? MSG.resendCooldownAlert(hoursLeftFrom(until)) : t("pollsHub.actions.resend");
        if (isCooldown) btnResend.classList.add("cooldown");
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
    // nigdy nie pokazujemy anulowanych/odrzuconych
    if (s.status === "declined" || s.status === "cancelled") return false;
  
    // ARCHIWALNE = pending > 5 dni
    if (archiveState.subscriptions) return s.status === "pending" && isPendingOlderThan5Days(s);
  
    // AKTUALNE = active + pending <= 5 dni
    if (s.status === "active") return true;
    if (s.status === "pending") return !isPendingOlderThan5Days(s);
    return false;
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
  const token = task.token;
  if (!token) return;
  location.href = `poll_go.html?t=${encodeURIComponent(token)}&lang=${encodeURIComponent(getUiLang() || "pl")}`;
}

async function declineTask(task) {
  const step = MSG.declineTaskStep();
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 2, msg: "" });
    await sb().rpc("polls_hub_task_decline", { p_task_id: task.task_id });
    setProgress({ step, i: 1, n: 2, msg: MSG.ok() });
    await refreshData();
    
    /* ✅ po akceptacji token NIE może dalej siedzieć w URL, bo inaczej
       maybeFocusFromToken() będzie to interpretować jako “mismatch” */
    focusTaskHandled = true;
    clearUrlParam("t");
    
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
    console.log("[invite] invite rpc data:", data);
    if (error) throw error;
    if (data?.ok === false) throw new Error(data?.error || MSG.inviteFail());
    setProgress({ step, i: 1, n: 3, msg: MSG.inviteSaved() });
    if (!data?.already && data?.id) {
      const { data: resendData, error: resendError } = await sb().rpc("polls_hub_subscriber_resend", { p_id: data.id });
      console.log("[invite] resend rpc data:", resendData);
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
  const until = cooldownUntilFromTs(sub.email_sent_at);
  if (until && Date.now() < until) {
    const hours = hoursLeftFrom(until);
    void alertModal({ text: MSG.resendCooldownAlert(hours) });
    return;
  }
  try {
    showProgress(true);
    setProgress({ step, i: 0, n: 3, msg: "" });
    const { data, error } = await sb().rpc("polls_hub_subscriber_resend", { p_id: sub.sub_id });
    if (error) throw error;
	    if (data?.ok === false) {
	      if (data?.error === "cooldown") {
	        const untilTs = parseDate(data?.cooldown_until);
	        const hours = untilTs ? hoursLeftFrom(untilTs) : 24;
	        void alertModal({ text: MSG.resendCooldownAlert(hours) });
	        showProgress(false);
	        return;
	      }
	      throw new Error(data?.error || MSG.resendFail());
	    }
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
    focusSubHandled = true;
    clearUrlParam("s");
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
      .select("id,recipient_user_id,recipient_email,status,cancelled_at,declined_at,created_at")
      .eq("game_id", sharePollId)
      .eq("owner_id", currentUser.id);
    if (error) throw error;

    const statusBySub = new Map();
    const cooldownUntilBySub = new Map();
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

      const isCooldownStatus = task.status === "cancelled" || task.status === "declined";
      if (isCooldownStatus) {
        const baseTs = parseDate(task.cancelled_at) || parseDate(task.declined_at) || parseDate(task.created_at);
        const until = baseTs ? baseTs + COOLDOWN_MS : 0;
        if (until) {
          const prev = cooldownUntilBySub.get(key) || 0;
          if (until > prev) cooldownUntilBySub.set(key, until);
        }
      }

      const matchedId = task.recipient_email ? taskProfiles.get(String(task.recipient_email).toLowerCase()) : null;
      if (matchedId) {
        statusBySub.set(matchedId, task.status);
        const until = cooldownUntilBySub.get(key);
        if (until) {
          const prev = cooldownUntilBySub.get(matchedId) || 0;
          if (until > prev) cooldownUntilBySub.set(matchedId, until);
        }
      }
    }

    for (const sub of activeSubs) {
      const key = sub.subscriber_matched_user_id
        || sub.subscriber_user_id
        || (sub.subscriber_email || "").toLowerCase();
      const status = statusBySub.get(key);
	      const isActive = status === "pending" || status === "opened";
	      const isLocked = status === "done";
	      const cooldownUntil = cooldownUntilBySub.get(key) || 0;
	      const isCooldown = !isActive && !isLocked && cooldownUntil && Date.now() < cooldownUntil;
	      const row = document.createElement("label");
	      row.className = "hub-share-item" + (isCooldown ? " cooldown" : "");
      if (isActive) shareBaseline.add(String(sub.sub_id));
      row.innerHTML = `
        <input type="checkbox" ${isActive ? "checked" : ""} ${isLocked ? "disabled" : ""} data-sub-id="${sub.sub_id}">
        <div>
          <div class="hub-item-title">${sub.subscriber_display_label || MSG.dash()}</div>
          <div class="hub-share-status">${shareStatusLabel(status)}</div>
        </div>
        <div class="hub-share-status">${shareStatusHint(status, isCooldown ? cooldownUntil : 0)}</div>
      `;
      const input = row.querySelector("input");
      if (input) {
        if (isLocked) {
          input.title = MSG.shareLockedHint();
        } else if (isCooldown) {
          input.title = MSG.shareCooldownAlert(hoursLeftFrom(cooldownUntil));
          input.addEventListener("change", () => {
            if (input.checked) {
              void alertModal({ text: MSG.shareCooldownAlert(hoursLeftFrom(cooldownUntil)) });
              input.checked = false;
            }
          });
        }
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

function shareStatusHint(status, cooldownUntil = 0) {
  if (cooldownUntil && Date.now() < cooldownUntil) return MSG.shareHintCooldown(hoursLeftFrom(cooldownUntil));
  if (status === "done") return MSG.shareHint("locked");
  if (status === "pending" || status === "opened") return MSG.shareHint("active");
  if (status === "declined") return MSG.shareHint("retry");
  if (status === "cancelled") return MSG.shareHint("retry");
  return MSG.shareHintMissing();
}

async function buildMailItemsForTasksFallback({ gameId, ownerId, selectedSubIds }) {
  // 1) pobierz taski (muszą mieć token)
  const { data: rows, error } = await sb()
    .from("poll_tasks")
    .select("id,recipient_user_id,recipient_email,token,status")
    .eq("game_id", gameId)
    .eq("owner_id", ownerId)
    .in("status", ["pending", "opened"]);

  if (error) throw error;

  // 2) mapy pomocnicze: task token per recipient (user_id lub email)
  const tokenByKey = new Map();
  for (const r of rows || []) {
    const emailKey = (r.recipient_email || "").trim().toLowerCase();
    const userKey = r.recipient_user_id ? String(r.recipient_user_id) : "";
    if (userKey && r.token) tokenByKey.set(userKey, r.token);
    if (emailKey && r.token) tokenByKey.set(emailKey, r.token);
  }

  // 3) lookup emaili z profiles (dla tasków, gdzie jest tylko recipient_user_id)
  const userIds = [...new Set((rows || []).map((r) => r.recipient_user_id).filter(Boolean))];
  const emailsById = new Map();

  if (userIds.length) {
    const { data: profs, error: pErr } = await sb()
      .from("profiles")
      .select("id,email")
      .in("id", userIds);

    if (pErr) throw pErr;

    for (const p of profs || []) {
      const email = String(p.email || "").trim().toLowerCase();
      if (email) emailsById.set(p.id, email);
    }
  }

  // 4) lang per subscriber (bierzemy z obiektu subscribers, fallback do UI lang)
  //    (nie zakładam konkretnej nazwy pola; wspieram kilka)
  const subById = new Map(subscribers.map((s) => [String(s.sub_id), s]));

  const defaultLang = (typeof getUiLang === "function" ? getUiLang() : "pl") || "pl";

  // 5) składamy mailItems DLA ZAZNACZONYCH subów
  const mailItems = [];

  for (const subId of selectedSubIds || []) {
    const sub = subById.get(String(subId));
    if (!sub) continue;

    const subEmail = String(sub.subscriber_email || "").trim().toLowerCase();
    const subUserId = sub.subscriber_matched_user_id || sub.subscriber_user_id || null;

    const to =
      subEmail ||
      (subUserId ? emailsById.get(subUserId) : "") ||
      "";

    if (!to) continue;

    const token =
      (subUserId ? tokenByKey.get(String(subUserId)) : null) ||
      (subEmail ? tokenByKey.get(subEmail) : null) ||
      null;

    if (!token) continue;

    const lang = defaultLang;

    mailItems.push({
      task_id: null, // uzupełnimy niżej
      to,
      link: buildPollGoLink({ tokenKey: "t", token, lang }),
    });
  }

  // 6) opcjonalnie: uzupełnij task_id jeśli chcesz markować emaile dokładnie per task
  //    (mapujemy po (to, token) -> task.id)
  const taskIdByToken = new Map();
  for (const r of rows || []) {
    if (r.token && r.id) taskIdByToken.set(String(r.token), r.id);
  }
  for (const item of mailItems) {
    const tok = extractToken(item.link, "t");
    const id = tok ? taskIdByToken.get(String(tok)) : null;
    if (id) item.task_id = id;
  }

  return mailItems;
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
    let mailItems = Array.isArray(data?.mail) ? data.mail : [];

    // ✅ fallback dla TASKÓW (gdy RPC nie zwróciło listy maili, a taski powstały)
    if (!mailItems.length) {
      try {
        mailItems = await buildMailItemsForTasksFallback({
          gameId: sharePollId,
          ownerId: currentUser.id,
          selectedSubIds: selected,
        });
      } catch (e) {
        console.warn("[share] fallback mailItems failed:", e);
      }
    }
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
      
      const failed = results
        .map((r, i) => ({ r, i }))
        .filter((x) => x.r.status === "rejected")
        .map((x) => ({
          to: mailItems[x.i]?.to,
          err: String(x.r.reason?.message || x.r.reason || ""),
        }));
      
      if (failed.length) {
        console.warn("[share] mail failed:", failed);
        // minimum: powiedz userowi, że X/Y nie poszło
        void alertModal({
          text: `${MSG.mailFailed()} (${failed.length}/${mailItems.length})`,
        });
      }
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
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
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
  if (focusTaskToken && !focusTaskHandled) {
    const match = tasks.find((t) => String(t.token || "") === String(focusTaskToken || ""));
  
    // jeśli token nie pasuje do żadnego taska w tym koncie -> czyścimy URL (nie ma co spamować promptem)
    if (!match) {
      focusTaskHandled = true;
      clearUrlParam("t");
    } else {
      const page = match.poll_type === "poll_points" ? "poll-points.html" : "poll-text.html";
      const promptVote = await confirmModal({ text: MSG.focusTaskPrompt() });
  
      // niezależnie od decyzji, token nie powinien “wisieć” na polls-hub
      focusTaskHandled = true;
      clearUrlParam("t");
  
      if (promptVote) {
        location.href = `poll_go.html?t=${encodeURIComponent(focusTaskToken)}&lang=${encodeURIComponent(getUiLang() || "pl")}`;
      }
    }
  }
  if (focusSubToken && !focusSubHandled) {
    const match = subscriptions.find((s) => String(s.token) === String(focusSubToken));
  
    // ✅ jeśli token jest “mój”, ale już nie pending (np. active/declined/cancelled),
    // to znaczy że temat jest załatwiony — czyścimy URL i NIE straszymy mismatch.
    if (match) {
      if (match.status === "pending") {
        const promptAccept = await confirmModal({ text: MSG.focusSubPrompt() });
        if (promptAccept) {
          await acceptSubscription(match);
        } else {
          // user anulował — nie czyścimy, może wróci później
          subTokenPrompted = true;
        }
      } else {
        focusSubHandled = true;
        clearUrlParam("s");
      }
      return;
    }
  
    // ❗ dopiero jeśli NIE MA matcha dla aktualnego usera — pokazujemy mismatch
    if (currentUser && !subTokenPrompted) {
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

// ✅ Globalny auto-refresh po zamknięciu dowolnego modala (alert/confirm/overlay/aria-modal)
function installModalAutoRefresh({ refreshFn }) {
  const MODAL_SELECTOR = [
    // Twoje overlaye w hubie (share/details/progress)
    ".overlay",
    // typowe overlaye z core/modal.js (często tak się nazywa)
    ".modal-overlay",
    ".modal-backdrop",
    // dowolne dialogi dostępnościowe
    "[role='dialog'][aria-modal='true']",
    // fallback jeśli kiedyś dodasz data-modal
    "[data-modal]",
  ].join(",");

  const isVisible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    if (el.hasAttribute("hidden")) return false;
    const ariaHidden = el.getAttribute("aria-hidden");
    if (ariaHidden === "true") return false;

    const st = getComputedStyle(el);
    if (st.display === "none") return false;
    if (st.visibility === "hidden") return false;
    if (Number(st.opacity || "1") === 0) return false;

    // jeśli element jest w DOM, ale ma 0 rozmiaru, też traktuj jako niewidoczny (częsty pattern)
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;

    return true;
  };

  const anyModalOpen = () => {
    const els = document.querySelectorAll(MODAL_SELECTOR);
    for (const el of els) {
      if (isVisible(el)) return true;
    }
    return false;
  };

  let prevOpen = anyModalOpen();

  // debounce do jednej decyzji na “tick” (unikasz spamowania przy wielu mutacjach DOM)
  let scheduled = false;
  const check = () => {
    scheduled = false;
    const nowOpen = anyModalOpen();

    // klucz: było coś otwarte → teraz NIC nie jest otwarte
    if (prevOpen && !nowOpen) {
      try {
        refreshFn();
      } catch {
        // ignore
      }
    }
    prevOpen = nowOpen;
  };

  const scheduleCheck = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(check);
  };

  const obs = new MutationObserver(scheduleCheck);

  // obserwujemy:
  // - dodawanie/usuwanie nodów (alert/confirm mogą być dynamiczne)
  // - zmiany style/class/hidden/aria-hidden (zamykanie modalnych overlayów)
  obs.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden", "aria-hidden"],
  });

  // zwróć "unsubscribe", gdybyś kiedyś chciał to wyłączyć
  return () => obs.disconnect();
}

// ✅ refresh, ale nie “mruga” w trakcie share/details
async function refreshAfterAnyModalClose() {
  const shareOpen = shareOverlay?.style.display === "grid";
  const detailsOpen = detailsOverlay?.style.display === "grid";
  if (shareOpen || detailsOpen) return;

  await refreshData();
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
  
  installModalAutoRefresh({ refreshFn: () => void refreshAfterAnyModalClose() });

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