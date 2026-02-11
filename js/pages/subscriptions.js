import { sb, SUPABASE_URL } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { alertModal, confirmModal } from "../core/modal.js";
import { initUiSelect } from "../core/ui-select.js";
import { initI18n, t } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const focusInviteToken = qs.get("s");

const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBackToBuilder");
const btnGoAlt = $("btnGoAlt");
const altBadgeEl = $("altBadge");

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
};

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
  const byName = (a, b) => String((a.subscriber_display_label || a.owner_display_label || "")).localeCompare(String((b.subscriber_display_label || b.owner_display_label || "")));
  if (key === "name-asc") sorted.sort(byName);
  else if (key === "name-desc") sorted.sort((a, b) => byName(b, a));
  else if (key === "oldest") sorted.sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));
  else sorted.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  return sorted;
}

function renderSubscribers() {
  const visible = subscribers.filter((s) => {
    if (s.status === "declined" || s.status === "cancelled") return false;
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
      item.className = `hub-item ${row.status === "active" ? "sub-active" : "sub-pending"}`;
      item.innerHTML = `<div><div class="hub-item-title">${row.subscriber_display_label || MSG.dash()}</div><div class="hub-item-sub">${MSG.statusLabel(row.status)}</div></div><div class="hub-item-actions"></div>`;
      const actions = item.querySelector(".hub-item-actions");

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn xs danger";
      removeBtn.textContent = "X";
      removeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await confirmModal({ title: MSG.removeTitle(), text: MSG.removeText(), okText: MSG.removeOk(), cancelText: MSG.removeCancel() });
        if (!ok) return;
        try {
          await sb().rpc("polls_hub_subscription_owner_update", { p_sub_id: row.sub_id, p_status: "cancelled" });
          await refreshData();
        } catch {
          await alertModal({ text: MSG.removeFail() });
        }
      });
      actions?.appendChild(removeBtn);

      if (row.status === "pending") {
        const resendBtn = document.createElement("button");
        resendBtn.className = "btn xs";
        resendBtn.textContent = "↻";
        const until = cooldownUntil(row.email_sent_at);
        if (until && Date.now() < until) resendBtn.classList.add("cooldown");
        resendBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            const { data, error } = await sb().rpc("polls_hub_subscription_resend", { p_sub_id: row.sub_id });
            if (error || data?.ok === false) throw error || new Error("fail");
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
    if (s.status === "declined" || s.status === "cancelled") return false;
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
      item.className = `hub-item ${row.status === "active" ? "sub-active" : "sub-pending"}`;
      item.innerHTML = `<div><div class="hub-item-title">${row.owner_display_label || MSG.dash()}</div><div class="hub-item-sub">${MSG.statusLabel(row.status)}</div></div><div class="hub-item-actions"></div>`;
      const actions = item.querySelector(".hub-item-actions");

      const reject = document.createElement("button");
      reject.className = "btn xs danger";
      reject.textContent = "X";
      reject.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await sb().rpc("polls_hub_subscription_user_update", { p_sub_id: row.sub_id, p_status: row.status === "pending" ? "declined" : "cancelled" });
          await refreshData();
        } catch {
          await alertModal({ text: MSG.updateFail() });
        }
      });
      actions?.appendChild(reject);

      if (row.status === "pending") {
        const accept = document.createElement("button");
        accept.className = "btn xs gold";
        accept.textContent = "✓";
        accept.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            await sb().rpc("polls_hub_subscription_user_update", { p_sub_id: row.sub_id, p_status: "active" });
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
    const { data, error } = await sb().rpc("polls_hub_subscription_invite", { p_recipient: v });
    if (error || data?.ok === false) throw error || new Error(data?.error || "invite");

    const sub = data?.subscription || null;
    if (sub?.sub_id) {
      await sb().rpc("polls_hub_subscription_resend", { p_sub_id: sub.sub_id });
    }
    await refreshData();
  } catch (e) {
    const m = String(e?.message || "").toLowerCase();
    if (m.includes("email")) await alertModal({ text: MSG.invalidEmail() });
    else if (m.includes("unknown")) await alertModal({ text: MSG.unknownUser() });
    else await alertModal({ text: MSG.inviteFail() });
  } finally {
    setProgress({ show: false });
  }
}

async function refreshTopBadges() {
  const { data } = await sb().rpc("polls_badge_get");
  const row = Array.isArray(data) ? data[0] : data;
  const pendingInvites = Number(row?.subs_pending || 0);
  const pendingTasks = Number(row?.tasks_pending || 0);
  setBadge("tasks", 0);
  setBadge("subs", pendingInvites);
  if (altBadgeEl) {
    altBadgeEl.textContent = pendingTasks > 99 ? "99+" : String(pendingTasks || "");
    btnGoAlt?.classList.toggle("has-badge", pendingTasks > 0);
  }
}

async function refreshData() {
  try {
    const [a, b] = await Promise.all([
      sb().rpc("polls_hub_list_my_subscribers"),
      sb().rpc("polls_hub_list_my_subscriptions"),
    ]);
    subscribers = a.data || [];
    invites = b.data || [];

    renderSubscribers();
    renderInvites();
    await refreshTopBadges();

    if (focusInviteToken) {
      const match = invites.find((x) => String(x.token) === String(focusInviteToken));
      if (match?.status === "pending") {
        const ok = await confirmModal({ text: MSG.focusPrompt() });
        if (ok) {
          await sb().rpc("polls_hub_subscription_user_update", { p_sub_id: match.sub_id, p_status: "active" });
          await refreshData();
        }
      }
    }
  } catch {
    await alertModal({ text: MSG.loadFail() });
  }
}

function getBackLink() {
  const from = new URLSearchParams(location.search).get("from");
  if (from === "bases") return "bases.html";
  if (from === "hub-a") return document.body.dataset.altPage || "builder.html";
  return "builder.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireAuth("index.html");
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

  btnBack?.addEventListener("click", () => { location.href = getBackLink(); });
  btnGoAlt?.addEventListener("click", () => {
    const page = document.body.dataset.altPage || "builder.html";
    const from = document.body.dataset.altFrom || "hub-b";
    location.href = `${page}?from=${encodeURIComponent(from)}`;
  });
  btnLogout?.addEventListener("click", async () => { await signOut(); location.href = "index.html"; });

  window.addEventListener("i18n:lang", () => {
    renderSelect(sortAD, "subscribers");
    renderSelect(sortAM, "subscribers");
    renderSelect(sortBD, "subscriptions");
    renderSelect(sortBM, "subscriptions");
    renderSubscribers();
    renderInvites();
  });

  await refreshData();
  setInterval(() => refreshData(), 30000);
});
