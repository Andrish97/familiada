import { sb, SUPABASE_URL } from "../core/supabase.js";
import { requireAuth, signOut, guestAuthEntryUrl } from "../core/auth.js";
import { isGuestUser, showGuestBlockedOverlay } from "../core/guest-mode.js";
import { alertModal, confirmModal } from "../core/modal.js";
import { initUiSelect } from "../core/ui-select.js";
import { getUiLang, initI18n, t } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const focusInviteToken = qs.get("s");
let focusInviteHandled = false;
let subTokenPrompted = false;

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
  return `${location.pathname.split("/").pop() || "subscriptions.html"}${location.search}${location.hash}`;
}

const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBackToBuilder");
const btnManual = $("btnManual");

const tabA = $("tabSubscribersMobile");
const tabB = $("tabSubscriptionsMobile");
const panelA = $("panelSubscribersMobile");
const panelB = $("panelSubscriptionsMobile");

const listAD = $("subscribersListDesktop");
const listAM = $("subscribersListMobile");
const listBD = $("subscriptionsListDesktop");
const listBM = $("subscriptionsListMobile");

const sortAD = $("sortSubscribersDesktop");
const sortAM = $("sortSubscribersMobile");
const sortBD = $("sortSubscriptionsDesktop");
const sortBM = $("sortSubscriptionsMobile");

const inviteInputDesktop = $("inviteInputDesktop");
const inviteInputMobile = $("inviteInputMobile");
const btnInviteDesktop = $("btnInviteDesktop");
const btnInviteMobile = $("btnInviteMobile");

const progressOverlay = $("progressOverlay");
const progressStep = $("progressStep");
const progressCount = $("progressCount");
const progressBar = $("progressBar");
const progressMsg = $("progressMsg");

const MAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-mail`;

const MSG = {
  dash: () => t("pollsHubSubscriptions.dash"),
  emptySubscribers: () => t("pollsHubSubscriptions.empty.subscribers"),
  emptySubscriptions: () => t("pollsHubSubscriptions.empty.subscriptions"),
  invalidEmail: () => t("pollsHubSubscriptions.errors.invalidEmail"),
  unknownUser: () => t("pollsHubSubscriptions.errors.unknownUser"),
  inviteFail: () => t("pollsHubSubscriptions.errors.invite"),
  inviteSaved: () => t("pollsHubSubscriptions.statusMsg.inviteSaved"),
  resendFail: () => t("pollsHubSubscriptions.errors.resend"),
  removeFail: () => t("pollsHubSubscriptions.errors.removeSubscriber"),
  acceptFail: () => t("pollsHubSubscriptions.errors.acceptSubscription"),
  updateFail: () => t("pollsHubSubscriptions.errors.updateSubscription"),
  loadFail: () => t("pollsHubSubscriptions.errors.loadHub"),
  focusPrompt: () => t("pollsHubSubscriptions.confirm.focusSub"),
  statusLabel: (s) => t(`pollsHubSubscriptions.status.${s}`),
  removeTitle: () => t("pollsHubSubscriptions.modal.removeSubscriber.title"),
  removeText: () => t("pollsHubSubscriptions.modal.removeSubscriber.text"),
  removeOk: () => t("pollsHubSubscriptions.modal.removeSubscriber.ok"),
  removeCancel: () => t("pollsHubSubscriptions.modal.removeSubscriber.cancel"),
  updateTitle: () => t("pollsHubSubscriptions.modal.updateSubscription.title"),
  updateTextPending: () => t("pollsHubSubscriptions.modal.updateSubscription.textPending"),
  updateTextActive: () => t("pollsHubSubscriptions.modal.updateSubscription.textActive"),
  updateOkPending: () => t("pollsHubSubscriptions.modal.updateSubscription.okPending"),
  updateOkActive: () => t("pollsHubSubscriptions.modal.updateSubscription.okActive"),
  updateCancel: () => t("pollsHubSubscriptions.modal.updateSubscription.cancel"),
resendCooldownAlert: (untilTsMs) => cooldownTextFromUntil(untilTsMs),
  tokenMismatchTitle: () => t("pollsHubSubscriptions.modal.tokenMismatch.title"),
  tokenMismatchText: () => t("pollsHubSubscriptions.modal.tokenMismatch.text"),
  tokenMismatchOk: () => t("pollsHubSubscriptions.modal.tokenMismatch.ok"),
  tokenMismatchCancel: () => t("pollsHubSubscriptions.modal.tokenMismatch.cancel"),
};


async function callSubscriptionAction(row, action) {
  if (!row?.sub_id) throw new Error("missing_subscription_id");
  const fn = action === "accept"
    ? "polls_hub_subscription_accept"
    : action === "reject"
      ? "polls_hub_subscription_reject"
      : "polls_hub_subscription_cancel";
  const { data, error } = await sb().rpc(fn, { p_id: row.sub_id });
  const ok = data?.ok === undefined ? true : !!data?.ok;
  if (error || !ok) throw error || new Error(String(data?.error || "subscription_action_failed"));
}

let subscribers = [];
let invites = [];

const archiveState = { subscribers: false, subscriptions: false };
const sortState = { subscribers: "newest", subscriptions: "newest" };
const sortSelects = new Map();
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PENDING_ARCHIVE_MS = 5 * 24 * 60 * 60 * 1000;

function setProgress({ show = false, step = "—", i = 0, n = 0, msg = "" } = {}) {
  if (progressOverlay) progressOverlay.style.display = show ? "grid" : "none";
  if (progressStep) progressStep.textContent = step;
  if (progressCount) progressCount.textContent = `${i}/${n}`;
  if (progressBar) progressBar.style.width = `${n ? Math.round((i / n) * 100) : 0}%`;
  if (progressMsg) progressMsg.textContent = msg;
}

function parseDate(value) { return value ? new Date(value).getTime() : 0; }
function isPendingOld(r) {
  const base = parseDate(r.email_sent_at) || parseDate(r.created_at);
  return base ? (Date.now() - base > PENDING_ARCHIVE_MS) : false;
}
function cooldownUntil(ts) {
  const base = parseDate(ts);
  return base ? base + COOLDOWN_MS : 0;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// when remaining is below 48h -> show hours; otherwise show days
function formatCooldownRemaining(untilTsMs) {
  const ms = Math.max(0, Number(untilTsMs || 0) - Date.now());
  if (!ms) return { unit: "hours", n: 0 };

  if (ms < 48 * HOUR_MS) {
    return { unit: "hours", n: Math.max(1, Math.ceil(ms / HOUR_MS)) };
  }
  return { unit: "days", n: Math.max(1, Math.ceil(ms / DAY_MS)) };
}

function cooldownTextFromUntil(untilTsMs) {
  const { unit, n } = formatCooldownRemaining(untilTsMs);
  return t(unit === "days"
    ? "pollsHubSubscriptions.cooldownLeftDays"
    : "pollsHubSubscriptions.cooldownLeftHours", { n });
}


function mailLink(path, { withLang = false } = {}) {
  let u;
  try {
    u = new URL(path, location.origin);
  } catch {
    u = new URL(String(path || ""), location.origin);
  }

  if (withLang) u.searchParams.set("lang", getUiLang() || "pl");
  return u.href;
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

function buildMailHtml({ title, subtitle, body, actionLabel, actionUrl }) {
  const inner = `
<div style="margin:0;padding:0;background:#050914;color:#ffffff;">
  <div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ffffff;background:#050914;">
    <div style="padding:14px 14px;background:#0b1020;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(10px);">
      <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
      <div style="margin-top:6px;font-size:12px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;">${subtitle}</div>
    </div>

    <div style="margin-top:14px;padding:18px;border-radius:20px;border:1px solid rgba(255,255,255,.14);background:#111827;background:rgba(255,255,255,.06);box-shadow:0 24px 60px rgba(0,0,0,.45);">
      <div style="font-weight:1000;font-size:18px;letter-spacing:.06em;color:#ffeaa6;margin:0 0 10px;">${title}</div>
      <div style="font-size:14px;opacity:.9;line-height:1.45;margin:0 0 14px;">${body}</div>

      <div style="margin:16px 0;">
        <a href="${actionUrl}" style="display:block;text-align:center;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,234,166,.35);background:#2a2b1a;background:rgba(255,234,166,.10);color:#ffeaa6;text-decoration:none;font-weight:1000;letter-spacing:.06em;">${actionLabel}</a>
      </div>

      <div style="margin-top:14px;font-size:12px;opacity:.75;line-height:1.4;">${t("pollsHubSubscriptions.mail.ignoreNote")}</div>

      <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
        ${t("pollsHubSubscriptions.mail.linkHint")}
        <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:#0a0f1e;background:rgba(0,0,0,.18);word-break:break-all;">${actionUrl}</div>
      </div>
    </div>

    <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">${t("pollsHubSubscriptions.mail.autoNote")}</div>
  </div>
</div>
`.trim();

  return wrapEmailDoc(inner);
}

async function sendMail({ to, subject, html }) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(t("pollsHubSubscriptions.errors.mailSession"));
  const doReq = async (accessToken) => fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html }),
  });
  let res = await doReq(token);
  if (res.status === 401) {
    const { data: refreshed } = await sb().auth.refreshSession();
    const freshToken = refreshed?.session?.access_token;
    if (freshToken) res = await doReq(freshToken);
  }
  if (!res.ok) throw new Error((await res.text()) || t("pollsHubSubscriptions.errors.mailSend"));
}

async function sendSubscriptionEmail({ to, link, ownerLabel }) {
  await sendMail({
    to,
    subject: t("pollsHubSubscriptions.mail.subscriptionTitle", { owner: ownerLabel }),
    html: buildMailHtml({
      title: t("pollsHubSubscriptions.mail.subscriptionTitle", { owner: ownerLabel }),
      subtitle: t("pollsHubSubscriptions.mail.subtitle"),
      body: t("pollsHubSubscriptions.mail.subscriptionBody", { owner: ownerLabel }),
      actionLabel: t("pollsHubSubscriptions.mail.subscriptionAction"),
      actionUrl: mailLink(link, { withLang: true }),
    }),
  });
}

function statusOrder(status) {
  if (status === "active") return 0;
  if (status === "pending") return 1;
  return 2;
}

function setBadge(name, count) {
  document.querySelectorAll(`[data-badge="${name}"]`).forEach((el) => {
    el.textContent = count > 99 ? "99+" : String(count);
    el.classList.toggle("is-empty", !count);
  });
}

function renderEmpty(el, txt) {
  if (!el) return;
  el.innerHTML = `<div class="hub-empty">${txt}</div>`;
}

function sortList(kind, list) {
  const sorted = [...list];
  const key = sortState[kind];
  const byName = (a, b) => String((a.subscriber_label || a.owner_label || "")).localeCompare(String((b.subscriber_label || b.owner_label || "")));
  if (key === "name-asc") sorted.sort(byName);
  else if (key === "name-desc") sorted.sort((a, b) => byName(b, a));
  else if (key === "status") sorted.sort((a, b) => statusOrder(a.status) - statusOrder(b.status));
  else if (key === "oldest") sorted.sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));
  else sorted.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  return sorted;
}

function renderSubscribers() {
  const visible = subscribers.filter((s) => {
    if (s.status === "cancelled") return false;
    if (s.status === "declined") return !s.is_expired;
    if (archiveState.subscribers) return s.status === "pending" && isPendingOld(s);
    if (s.status === "active") return true;
    if (s.status === "pending") return !isPendingOld(s);
    return false;
  });
  const sorted = sortList("subscribers", visible);
  const render = (el) => {
    if (!el) return;
    el.innerHTML = "";
    if (!sorted.length) return renderEmpty(el, MSG.emptySubscribers());
    for (const row of sorted) {
      const item = document.createElement("div");
      item.className = `hub-item ${row.status === "active" ? "sub-active" : row.status === "declined" ? "sub-declined" : "sub-pending"}`;
      item.innerHTML = `<div><div class="hub-item-title">${row.subscriber_label || MSG.dash()}</div><div class="hub-item-sub">${MSG.statusLabel(row.status)}</div></div><div class="hub-item-actions"></div>`;
      const actions = item.querySelector(".hub-item-actions");

      if (row.status !== "declined") {
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn xs danger";
        removeBtn.textContent = "X";
        removeBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await confirmModal({ title: MSG.removeTitle(), text: MSG.removeText(), okText: MSG.removeOk(), cancelText: MSG.removeCancel() });
          if (!ok) return;
          try {
            await sb().rpc("polls_hub_subscriber_remove", { p_id: row.sub_id });
            await refreshData();
          } catch {
            await alertModal({ text: MSG.removeFail() });
          }
        });
        actions?.appendChild(removeBtn);
      }

      if (row.status === "pending") {
        const resendBtn = document.createElement("button");
        resendBtn.className = "btn xs";
        resendBtn.textContent = "↻";
        const until = cooldownUntil(row.email_sent_at);
        if (until && Date.now() < until) {
          resendBtn.classList.add("cooldown");
          resendBtn.title = MSG.resendCooldownAlert(until);
        }
        resendBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            if (until && Date.now() < until) {
              await alertModal({ text: MSG.resendCooldownAlert(until) });
              return;
            }
            const { data, error } = await sb().rpc("polls_hub_subscriber_resend", { p_id: row.sub_id });
            if (error) throw error;
            if (data?.ok === false) {
              if (data?.error === "cooldown") {
                const untilTs = parseDate(data?.cooldown_until) || (Date.now() + 24 * 60 * 60 * 1000);
                await alertModal({ text: MSG.resendCooldownAlert(untilTs) });
                return;
              }
              throw new Error(data?.error || "fail");
            }
            if (data?.to && data?.link) {
              const ownerLabel = who?.textContent || "Familiada";
              await sendSubscriptionEmail({ to: data.to, link: data.link, ownerLabel });
            }
            await refreshData();
          } catch {
            await alertModal({ text: MSG.resendFail() });
          }
        });
        actions?.appendChild(resendBtn);
      }
      el.appendChild(item);
    }
  };
  render(listAD);
  render(listAM);
}

function renderInvites() {
  const visible = invites.filter((s) => {
    if (s.status === "cancelled") return false;
    if (s.status === "declined") return !s.is_expired;
    if (archiveState.subscriptions) return s.status === "pending" && isPendingOld(s);
    if (s.status === "active") return true;
    if (s.status === "pending") return !isPendingOld(s);
    return false;
  });
  const sorted = sortList("subscriptions", visible);
  const render = (el) => {
    if (!el) return;
    el.innerHTML = "";
    if (!sorted.length) return renderEmpty(el, MSG.emptySubscriptions());
    for (const row of sorted) {
      const item = document.createElement("div");
      item.className = `hub-item ${row.status === "active" ? "sub-active" : row.status === "declined" ? "sub-declined" : "sub-pending"}`;
      item.innerHTML = `<div><div class="hub-item-title">${row.owner_label || MSG.dash()}</div><div class="hub-item-sub">${MSG.statusLabel(row.status)}</div></div><div class="hub-item-actions"></div>`;
      const actions = item.querySelector(".hub-item-actions");

      if (row.status !== "declined") {
        const reject = document.createElement("button");
        reject.className = "btn xs danger";
        reject.textContent = "X";
        reject.addEventListener("click", async (e) => {
          e.stopPropagation();
          const isPending = row.status === "pending";
          const ok = await confirmModal({
            title: MSG.updateTitle(),
            text: isPending ? MSG.updateTextPending() : MSG.updateTextActive(),
            okText: isPending ? MSG.updateOkPending() : MSG.updateOkActive(),
            cancelText: MSG.updateCancel(),
          });
          if (!ok) return;
          try {
            await callSubscriptionAction(row, isPending ? "reject" : "cancel");
            await refreshData();
          } catch {
            await alertModal({ text: MSG.updateFail() });
          }
        });
        actions?.appendChild(reject);
      }

      if (row.status === "pending") {
        const accept = document.createElement("button");
        accept.className = "btn xs gold";
        accept.textContent = "✓";
        accept.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            await callSubscriptionAction(row, "accept");
            await refreshData();
          } catch {
            await alertModal({ text: MSG.acceptFail() });
          }
        });
        actions?.appendChild(accept);
      }

      el.appendChild(item);
    }
  };
  render(listBD);
  render(listBM);
}

function setActiveMobileTab(tab) {
  tabA?.classList.toggle("active", tab === "a");
  tabB?.classList.toggle("active", tab === "b");
  panelA?.classList.toggle("active", tab === "a");
  panelB?.classList.toggle("active", tab === "b");
}

function renderSelect(el, kind) {
  if (!el) return;
  const options = [
    { value: "newest", label: t("pollsHubSubscriptions.sort.newest") },
    { value: "oldest", label: t("pollsHubSubscriptions.sort.oldest") },
    { value: "name-asc", label: t("pollsHubSubscriptions.sort.nameEmailAsc") },
    { value: "name-desc", label: t("pollsHubSubscriptions.sort.nameEmailDesc") },
    { value: "status", label: t("pollsHubSubscriptions.sort.status") },
  ];
  let api = sortSelects.get(el);
  if (!api) {
    api = initUiSelect(el, {
      value: sortState[kind],
      options,
      onChange: (val) => {
        sortState[kind] = val;
        if (kind === "subscribers") renderSubscribers();
        else renderInvites();
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


function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

async function resolveInviteRecipient(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) {
    if (!isValidEmail(raw)) throw new Error("invalid_email");
    return raw.toLowerCase();
  }
  const { data, error } = await sb().rpc("profile_login_to_email", { p_login: raw });
  if (error) throw error;
  const email = String(data || "").trim().toLowerCase();
  if (!email) throw new Error("unknown_user");
  return email;
}

function registerToggleHandlers() {
  document.querySelectorAll(".hub-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.closest(".hub-toggle")?.dataset.kind;
      if (!kind) return;
      archiveState[kind] = btn.dataset.toggle === "archive";
      syncToggles();
      if (kind === "subscribers") renderSubscribers();
      else renderInvites();
    });
  });
}

async function invite(value) {
  const v = String(value || "").trim();
  if (!v) return;
  try {
    setProgress({ show: true, step: t("pollsHubSubscriptions.progress.invite"), i: 0, n: 2 });
    const recipient = await resolveInviteRecipient(v);
    const { data, error } = await sb().rpc("polls_hub_subscription_invite", { p_recipient: recipient });
    if (error) throw error;
    if (data?.ok === false) {
        if (data?.error === "cooldown") {
          const untilTs = parseDate(data?.cooldown_until) || (Date.now() + 5 * 24 * 60 * 60 * 1000);
          await alertModal({ text: cooldownTextFromUntil(untilTs) });
          return;
        }
      throw new Error(data?.error || "invite");
    }

    if (!data?.already && data?.id) {
      const { data: resendData } = await sb().rpc("polls_hub_subscriber_resend", { p_id: data.id });
      if (resendData?.to && resendData?.link) {
        await sendSubscriptionEmail({
          to: resendData.to,
          link: resendData.link,
          ownerLabel: who?.textContent || "Familiada",
        });
      }
      const url = new URL(location.href);
      url.searchParams.delete("s");
      history.replaceState(null, "", url.toString());
    }

    await refreshData();
  } catch (e) {
    const m = String(e?.message || "").toLowerCase();
    if (m.includes("invalid_email")) await alertModal({ text: MSG.invalidEmail() });
    else if (m.includes("unknown_user") || m.includes("unknown")) await alertModal({ text: MSG.unknownUser() });
    else if (m.includes("email")) await alertModal({ text: MSG.invalidEmail() });
    else await alertModal({ text: MSG.inviteFail() });
  } finally {
    setProgress({ show: false });
  }
}

let autoRefreshTimer = null;
function startAutoRefresh() {
  if (autoRefreshTimer) return;
  autoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
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
  const pendingInvites = Number(row?.subs_pending || 0);
  setBadge("tasks", 0);
  setBadge("subs", pendingInvites);
}

let subsRefreshInFlight = null;

async function refreshData() {
  if (subsRefreshInFlight) return subsRefreshInFlight;

  subsRefreshInFlight = (async () => {
  try {
    const [a, b] = await Promise.all([
      sb().rpc("polls_hub_list_my_subscribers"),
      sb().rpc("polls_hub_list_my_subscriptions"),
    ]);
    subscribers = a.data || [];
    invites = b.data || [];

    updateBackButtonLabel();
    renderSubscribers();
    renderInvites();
    await refreshTopBadges();

    if (focusInviteToken && !focusInviteHandled) {
      const match = invites.find((x) => String(x.token) === String(focusInviteToken));
      if (match) {
        if (match.status === "pending") {
          const ok = await confirmModal({ text: MSG.focusPrompt() });
          if (ok) {
            await callSubscriptionAction(match, "accept");
            await refreshData();
          } else {
            subTokenPrompted = true;
          }
        } else {
          focusInviteHandled = true;
          const url = new URL(location.href);
          url.searchParams.delete("s");
          history.replaceState(null, "", url.toString());
        }
      } else if (!subTokenPrompted) {
        subTokenPrompted = true;
        const ok = await confirmModal({
          title: MSG.tokenMismatchTitle(),
          text: MSG.tokenMismatchText(),
          okText: MSG.tokenMismatchOk(),
          cancelText: MSG.tokenMismatchCancel(),
        });
        if (ok) {
          await signOut();
          const url = new URL("login.html", location.href);
          url.searchParams.set("next", "subscriptions");
          url.searchParams.set("s", focusInviteToken);
          location.href = url.toString();
        }
      }
      focusInviteHandled = true;
      const url = new URL(location.href);
      if (url.searchParams.get("s") === focusInviteToken) {
        url.searchParams.delete("s");
        history.replaceState(null, "", url.toString());
      }
    }
  } catch {
    await alertModal({ text: MSG.loadFail() });
  }
  })();

  try {
    await subsRefreshInFlight;
  } finally {
    subsRefreshInFlight = null;
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
  if (retPath.endsWith("/bases.html")) btnBack.textContent = t("baseExplorer.backToBases");
  else if (retPath.endsWith("/polls-hub.html")) btnBack.textContent = t("polls.backToHub");
  else btnBack.textContent = t("pollsHubSubscriptions.backToGames");
}

function getBackLink() {
  const rawRet = getRetParam();
  return rawRet || "builder.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireAuth("login.html");
  if (isGuestUser(user)) {
    showGuestBlockedOverlay({ backHref: "builder.html", loginHref: "login.html?force_auth=1", showLoginButton: true });
    return;
  }
  who.textContent = user?.username || user?.email || "—";

  renderSelect(sortAD, "subscribers");
  renderSelect(sortAM, "subscribers");
  renderSelect(sortBD, "subscriptions");
  renderSelect(sortBM, "subscriptions");
  registerToggleHandlers();
  syncToggles();

  tabA?.addEventListener("click", () => setActiveMobileTab("a"));
  tabB?.addEventListener("click", () => setActiveMobileTab("b"));
  setActiveMobileTab("a");

  const doInviteDesktop = async () => { await invite(inviteInputDesktop?.value); if (inviteInputDesktop) inviteInputDesktop.value = ""; };
  const doInviteMobile = async () => { await invite(inviteInputMobile?.value); if (inviteInputMobile) inviteInputMobile.value = ""; };

  btnInviteDesktop?.addEventListener("click", doInviteDesktop);
  btnInviteMobile?.addEventListener("click", doInviteMobile);
  inviteInputDesktop?.addEventListener("keydown", (e) => { if (e.key === "Enter") doInviteDesktop(); });
  inviteInputMobile?.addEventListener("keydown", (e) => { if (e.key === "Enter") doInviteMobile(); });

  updateBackButtonLabel();
  btnBack?.addEventListener("click", () => { location.href = getBackLink(); });
  btnManual?.addEventListener("click", () => { location.href = buildManualUrl(); });
  btnLogout?.addEventListener("click", async () => { await signOut(); location.href = guestAuthEntryUrl(); });

  window.addEventListener("i18n:lang", () => {
    renderSelect(sortAD, "subscribers");
    renderSelect(sortAM, "subscribers");
    renderSelect(sortBD, "subscriptions");
    renderSelect(sortBM, "subscriptions");
    updateBackButtonLabel();
    renderSubscribers();
    renderInvites();
  });

  await refreshData();

  // po zamknięciu dowolnego confirm/alert w aplikacji — odśwież listy
  document.addEventListener("uni-modal:closed", () => { refreshData(); });

  startAutoRefresh();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else { startAutoRefresh(); refreshData(); }
  });
});
