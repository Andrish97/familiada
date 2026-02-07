// js/pages/polls-hub.js
import { sb, SUPABASE_URL } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { validatePollReadyToOpen } from "../core/game-validate.js";
import { confirmModal } from "../core/modal.js";

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
const detailsAnon = $("detailsAnon");
const btnDetailsClose = $("btnDetailsClose");
const detailsTitle = $("detailsTitle");

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

const sortState = {
  polls: "newest",
  tasks: "newest",
  subscribers: "newest",
  subscriptions: "newest",
};

const archiveState = {
  polls: false,
  tasks: false,
  subscribers: false,
  subscriptions: false,
};

const sortOptions = {
  polls: [
    { value: "newest", label: "Najnowsze" },
    { value: "oldest", label: "Najstarsze" },
    { value: "name-asc", label: "Nazwa A–Z" },
    { value: "name-desc", label: "Nazwa Z–A" },
    { value: "type", label: "Typ" },
    { value: "state", label: "Stan" },
    { value: "tasks-active", label: "Najwięcej aktywnych zadań" },
    { value: "tasks-done", label: "Najwięcej oddanych zadań" },
  ],
  tasks: [
    { value: "newest", label: "Najnowsze" },
    { value: "oldest", label: "Najstarsze" },
    { value: "name-asc", label: "Nazwa A–Z" },
    { value: "name-desc", label: "Nazwa Z–A" },
    { value: "type", label: "Typ" },
    { value: "available", label: "Tylko dostępne" },
    { value: "done", label: "Tylko wykonane" },
  ],
  subscribers: [
    { value: "newest", label: "Najnowsze" },
    { value: "oldest", label: "Najstarsze" },
    { value: "name-asc", label: "Nazwa/Email A–Z" },
    { value: "name-desc", label: "Nazwa/Email Z–A" },
    { value: "status", label: "Status" },
  ],
  subscriptions: [
    { value: "newest", label: "Najnowsze" },
    { value: "oldest", label: "Najstarsze" },
    { value: "name-asc", label: "Nazwa A–Z" },
    { value: "name-desc", label: "Nazwa Z–A" },
    { value: "status", label: "Status" },
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
            Jeśli to nie Ty, zignoruj tę wiadomość.
          </div>
          <div style="margin-top:10px;font-size:12px;opacity:.75;line-height:1.4;">
            Link nie działa? Skopiuj i wklej do przeglądarki:
            <div style="margin-top:6px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.18);word-break:break-all;">
              ${actionUrl}
            </div>
          </div>
        </div>
        <div style="margin-top:14px;font-size:12px;opacity:.7;text-align:center;">
          Wiadomość automatyczna — prosimy nie odpowiadać.
        </div>
      </div>
    </div>
  `.trim();
}

async function sendMail({ to, subject, html }) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error("Brak aktywnej sesji do wysyłki maila.");
  }
  const res = await fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Nie udało się wysłać maila.");
  }
}

async function sendSubscriptionEmail({ to, link, ownerLabel }) {
  const actionUrl = mailLink(link);
  const html = buildMailHtml({
    title: "Zaproszenie do subskrypcji",
    subtitle: "Centrum sondaży",
    body: `Użytkownik <strong>${ownerLabel}</strong> zaprasza Cię do subskrypcji. Kliknij przycisk, aby zaakceptować zaproszenie.`,
    actionLabel: "Akceptuj zaproszenie",
    actionUrl,
  });
  await sendMail({
    to,
    subject: "Zaproszenie do subskrypcji — Familiada",
    html,
  });
}

async function sendTaskEmail({ to, link, pollName, ownerLabel }) {
  const actionUrl = mailLink(link);
  const safeName = pollName ? `„${pollName}”` : "sondzie";
  const html = buildMailHtml({
    title: "Zaproszenie do głosowania",
    subtitle: "Centrum sondaży",
    body: `Użytkownik <strong>${ownerLabel}</strong> zaprasza Cię do udziału w ${safeName}.`,
    actionLabel: "Przejdź do głosowania",
    actionUrl,
  });
  await sendMail({
    to,
    subject: `Zaproszenie do głosowania — ${pollName || "Sondaż"}`,
    html,
  });
}

function renderSelect(el, kind) {
  if (!el) return;
  el.innerHTML = "";
  for (const opt of sortOptions[kind]) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    el.appendChild(o);
  }
  el.value = sortState[kind];
}

function setActiveTab(tab) {
  const isPolls = tab === "polls";
  tabPolls?.classList.toggle("active", isPolls);
  tabSubs?.classList.toggle("active", !isPolls);
  panelPolls?.classList.toggle("active", isPolls);
  panelSubs?.classList.toggle("active", !isPolls);
}

function updateBadges() {
  const tasksPending = tasks.filter((t) => t.status === "pending").length;
  const subsPending = subscriptions.filter((s) => s.status === "pending").length;
  setBadge("tasks", tasksPending);
  setBadge("subs", subsPending);
}

function pollTypeLabel(t) {
  return t === "poll_points" ? "Punktacja odpowiedzi" : "Typowy sondaż";
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
      sorted.sort((a, b) => (a.subscriber_label || "").localeCompare(b.subscriber_label || ""));
      break;
    case "name-desc":
      sorted.sort((a, b) => (b.subscriber_label || "").localeCompare(a.subscriber_label || ""));
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
      sorted.sort((a, b) => (a.owner_label || "").localeCompare(b.owner_label || ""));
      break;
    case "name-desc":
      sorted.sort((a, b) => (b.owner_label || "").localeCompare(a.owner_label || ""));
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
      renderEmpty(listEl, "Brak sondaży do pokazania.");
      return;
    }
    for (const poll of sorted) {
      const item = document.createElement("div");
      item.className = `hub-item ${pollTileClass(poll)} ${poll.game_id === selectedPollId ? "selected" : ""}`;
      item.dataset.id = poll.game_id;
      item.innerHTML = `
        <div>
          <div class="hub-item-title">${pollTypeLabel(poll.poll_type)} — ${poll.name || "—"}</div>
          <div class="hub-item-sub">${poll.poll_state === "open" ? "Otwarty" : poll.poll_state === "closed" ? "Zamknięty" : "Szkic"}</div>
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
      renderEmpty(listEl, "Brak zadań do pokazania.");
      return;
    }
    for (const task of sorted) {
      const item = document.createElement("div");
      const statusClass = task.status === "done" ? "task-done" : "task-pending";
      item.className = `hub-item ${statusClass}`;
      item.innerHTML = `
        <div>
          <div class="hub-item-title">${pollTypeLabel(task.poll_type)} — ${task.game_name || "—"}</div>
          <div class="hub-item-sub">${task.status === "done" ? "Wykonane" : "Dostępne"}</div>
        </div>
        <div class="hub-item-actions"></div>
      `;
      const actions = item.querySelector(".hub-item-actions");
      if (task.status === "pending") {
        const btn = document.createElement("button");
        btn.className = "btn xs danger";
        btn.textContent = "X";
        btn.title = "Odrzuć";
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
      renderEmpty(listEl, "Brak subskrybentów.");
      return;
    }
    for (const sub of sorted) {
      const statusClass = sub.status === "active" ? "sub-active" : sub.status === "pending" ? "sub-pending" : "sub-declined";
      const item = document.createElement("div");
      item.className = `hub-item ${statusClass}`;
      item.innerHTML = `
        <div>
          <div class="hub-item-title">${sub.subscriber_label || "—"}</div>
          <div class="hub-item-sub">${statusLabel(sub.status)}</div>
        </div>
        <div class="hub-item-actions"></div>
      `;
      const actions = item.querySelector(".hub-item-actions");
      const btnRemove = document.createElement("button");
      btnRemove.className = "btn xs danger";
      btnRemove.textContent = "X";
      btnRemove.title = "Usuń";
      btnRemove.addEventListener("click", async (e) => {
        e.stopPropagation();
        await removeSubscriber(sub);
      });
      actions?.appendChild(btnRemove);

      if (sub.status === "pending") {
        const btnResend = document.createElement("button");
        btnResend.className = "btn xs";
        btnResend.textContent = "↻";
        btnResend.title = "Ponów zaproszenie";
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
      renderEmpty(listEl, "Brak subskrypcji.");
      return;
    }
    for (const sub of sorted) {
      const statusClass = sub.status === "active" ? "sub-active" : "sub-pending";
      const item = document.createElement("div");
      item.className = `hub-item ${statusClass}`;
      item.innerHTML = `
        <div>
          <div class="hub-item-title">${sub.owner_label || "—"}</div>
          <div class="hub-item-sub">${statusLabel(sub.status)}</div>
        </div>
        <div class="hub-item-actions"></div>
      `;
      const actions = item.querySelector(".hub-item-actions");
      const btnRemove = document.createElement("button");
      btnRemove.className = "btn xs danger";
      btnRemove.textContent = "X";
      btnRemove.title = sub.status === "pending" ? "Odrzuć" : "Anuluj";
      btnRemove.addEventListener("click", async (e) => {
        e.stopPropagation();
        await rejectSubscription(sub);
      });
      actions?.appendChild(btnRemove);

      if (sub.status === "pending") {
        const btnAccept = document.createElement("button");
        btnAccept.className = "btn xs gold";
        btnAccept.textContent = "✓";
        btnAccept.title = "Akceptuj";
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
  if (status === "active") return "Aktywny";
  if (status === "pending") return "Oczekujące";
  if (status === "declined") return "Odrzucone";
  if (status === "cancelled") return "Anulowane";
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
    alert("Dokończ grę w Moich grach");
    return;
  }
  location.href = `polls.html?id=${encodeURIComponent(poll.game_id)}`;
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
  try {
    await sb().rpc("polls_hub_task_decline", { p_task_id: task.task_id });
    await refreshData();
  } catch (e) {
    console.error(e);
    alert("Nie udało się odrzucić zadania.");
  }
}

async function inviteSubscriber(recipient) {
  if (!recipient) return;
  try {
    const { data, error } = await sb().rpc("polls_hub_subscription_invite", { p_recipient: recipient });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data?.error || "Nie udało się zaprosić.");
    if (!data?.already && data?.id) {
      const { data: resendData, error: resendError } = await sb().rpc("polls_hub_subscriber_resend", { p_id: data.id });
      if (resendError) throw resendError;
      if (resendData?.ok === false) throw new Error(resendData?.error || "Nie udało się wysłać zaproszenia.");
      if (resendData?.to && resendData?.link) {
        const ownerLabel = currentUser?.username || currentUser?.email || "Użytkownik Familiady";
        try {
          await sendSubscriptionEmail({
            to: resendData.to,
            link: resendData.link,
            ownerLabel,
          });
        } catch (mailError) {
          console.error(mailError);
          alert("Zaproszenie zapisane, ale wysyłka maila nie powiodła się.");
        }
      }
    }
    await refreshData();
  } catch (e) {
    console.error(e);
    alert(e?.message || "Nie udało się zaprosić.");
  }
}

async function resendSubscriber(sub) {
  try {
    const { data, error } = await sb().rpc("polls_hub_subscriber_resend", { p_id: sub.sub_id });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data?.error || "Nie udało się ponowić zaproszenia.");
    if (data?.to && data?.link) {
      const ownerLabel = currentUser?.username || currentUser?.email || "Użytkownik Familiady";
      try {
        await sendSubscriptionEmail({
          to: data.to,
          link: data.link,
          ownerLabel,
        });
      } catch (mailError) {
        console.error(mailError);
        alert("Ponowienie zapisane, ale wysyłka maila nie powiodła się.");
      }
    }
    await refreshData();
  } catch (e) {
    console.error(e);
    alert("Nie udało się ponowić zaproszenia.");
  }
}

async function removeSubscriber(sub) {
  const ok = await confirmModal({
    title: "Usuń subskrybenta",
    text: "Czy na pewno chcesz usunąć tego subskrybenta?",
    okText: "Usuń",
    cancelText: "Anuluj",
  });
  if (!ok) return;
  try {
    await sb().rpc("polls_hub_subscriber_remove", { p_id: sub.sub_id });
    await refreshData();
  } catch (e) {
    console.error(e);
    alert("Nie udało się usunąć subskrybenta.");
  }
}

async function acceptSubscription(sub) {
  try {
    await sb().rpc("polls_hub_subscription_accept", { p_id: sub.sub_id });
    await refreshData();
  } catch (e) {
    console.error(e);
    alert("Nie udało się zaakceptować zaproszenia.");
  }
}

async function rejectSubscription(sub) {
  try {
    const rpc = sub.status === "pending" ? "polls_hub_subscription_reject" : "polls_hub_subscription_cancel";
    await sb().rpc(rpc, { p_id: sub.sub_id });
    await refreshData();
  } catch (e) {
    console.error(e);
    alert("Nie udało się zaktualizować subskrypcji.");
  }
}

async function openShareModal() {
  if (!selectedPollId) return;
  sharePollId = selectedPollId;
  shareMsg.textContent = "";
  shareList.innerHTML = "";
  try {
    const activeSubs = subscribers.filter((s) => s.status === "active");
    const { data: taskRows, error } = await sb()
      .from("poll_tasks")
      .select("id,recipient_user_id,recipient_email,status")
      .eq("game_id", sharePollId)
      .eq("owner_id", currentUser.id);
    if (error) throw error;

    const statusBySub = new Map();
    for (const task of taskRows || []) {
      const key = task.recipient_user_id || (task.recipient_email || "").toLowerCase();
      statusBySub.set(key, task.status);
    }

    for (const sub of activeSubs) {
      const key = sub.subscriber_user_id || (sub.subscriber_email || "").toLowerCase();
      const status = statusBySub.get(key);
      const row = document.createElement("label");
      row.className = "hub-share-item";
      const isActive = status === "pending" || status === "opened";
      row.innerHTML = `
        <input type="checkbox" ${isActive ? "checked" : ""} data-sub-id="${sub.sub_id}">
        <div>
          <div class="hub-item-title">${sub.subscriber_label || "—"}</div>
          <div class="hub-share-status">${shareStatusLabel(status)}</div>
        </div>
        <div class="hub-share-status">${status === "done" ? "Wykonane" : status ? "Dostępne" : "Brak"}</div>
      `;
      shareList.appendChild(row);
    }

    if (!activeSubs.length) {
      shareList.innerHTML = "<div class=\"hub-empty\">Brak aktywnych subskrybentów.</div>";
    }
    shareOverlay.style.display = "grid";
  } catch (e) {
    console.error(e);
    alert("Nie udało się pobrać subskrybentów.");
  }
}

function shareStatusLabel(status) {
  if (status === "done") return "Wykonane";
  if (status === "pending" || status === "opened") return "Dostępne";
  return "Brak";
}

async function saveShareModal() {
  const selected = [...shareList.querySelectorAll("input[type=checkbox]")]
    .filter((x) => x.checked)
    .map((x) => x.dataset.subId);
  try {
    const { data, error } = await sb().rpc("polls_hub_share_poll", {
      p_game_id: sharePollId,
      p_sub_ids: selected,
    });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data?.error || "Nie udało się udostępnić.");
    const mailItems = Array.isArray(data?.mail) ? data.mail : [];
    let sentCount = 0;
    if (mailItems.length) {
      const ownerLabel = currentUser?.username || currentUser?.email || "Użytkownik Familiady";
      const pollName = selectedPoll?.name || "";
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
        await sb().rpc("polls_hub_tasks_mark_emailed", { p_task_ids: sentTaskIds });
      }
    }
    shareMsg.textContent = mailItems.length
      ? `Zapisano udostępnienie. Maile: ${sentCount}/${mailItems.length}.`
      : "Zapisano udostępnienie.";
    await refreshData();
    setTimeout(closeShareModal, 500);
  } catch (e) {
    console.error(e);
    shareMsg.textContent = "Nie udało się zapisać udostępnienia.";
  }
}

function closeShareModal() {
  shareOverlay.style.display = "none";
  sharePollId = null;
}

async function openDetailsModal() {
  if (!selectedPollId) return;
  detailsVoted.innerHTML = "";
  detailsPending.innerHTML = "";
  detailsAnon.textContent = String(selectedPoll?.anon_votes || 0);
  detailsTitle.textContent = `Szczegóły głosowania — ${selectedPoll?.name || ""}`;
  try {
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
        profiles.set(p.id, p.username || p.email || "—");
      }
    }

    for (const task of taskRows || []) {
      const label = task.recipient_user_id
        ? profiles.get(task.recipient_user_id) || task.recipient_user_id
        : task.recipient_email || "—";
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
        btn.textContent = "Usuń";
        btn.addEventListener("click", async () => {
          const ok = await confirmModal({
            title: "Usuń głos",
            text: "Czy na pewno chcesz usunąć głos tej osoby?",
            okText: "Usuń",
            cancelText: "Anuluj",
          });
          if (!ok) return;
          await deleteVote(task.id);
        });
        actions?.appendChild(btn);
        detailsVoted.appendChild(item);
      } else {
        detailsPending.appendChild(item);
      }
    }

    if (!taskRows?.length) {
      detailsVoted.innerHTML = "<div class=\"hub-empty\">Brak zadań.</div>";
      detailsPending.innerHTML = "<div class=\"hub-empty\">Brak zadań.</div>";
    }

    detailsOverlay.style.display = "grid";
  } catch (e) {
    console.error(e);
    alert("Nie udało się pobrać szczegółów.");
  }
}

async function deleteVote(taskId) {
  try {
    await sb().rpc("poll_admin_delete_vote", { p_game_id: selectedPollId, p_voter_token: `task:${taskId}` });
    await openDetailsModal();
  } catch (e) {
    console.error(e);
    alert("Nie udało się usunąć głosu.");
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
    maybeFocusFromToken();
  } catch (e) {
    console.error(e);
    alert("Nie udało się pobrać danych centrum sondaży.");
  }
}

function maybeFocusFromToken() {
  if (focusTaskToken) {
    const match = tasks.find((t) => extractToken(t.go_url, "t") === focusTaskToken);
    if (match) {
      const page = match.poll_type === "poll_points" ? "poll-points.html" : "poll-text.html";
      const promptVote = confirm("Masz zadanie do wykonania. Chcesz przejść do głosowania?");
      if (promptVote) {
        location.href = `${page}?t=${encodeURIComponent(focusTaskToken)}`;
      }
    }
  }
  if (focusSubToken) {
    const match = subscriptions.find((s) => String(s.token) === focusSubToken);
    if (match && match.status === "pending") {
      const promptAccept = confirm("Masz zaproszenie do subskrypcji. Chcesz je zaakceptować?");
      if (promptAccept) {
        acceptSubscription(match);
      }
    }
  }
}

function wireSort(selectEl, kind) {
  if (!selectEl) return;
  selectEl.addEventListener("change", () => {
    sortState[kind] = selectEl.value;
    renderAll();
  });
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
  if (who) who.textContent = currentUser?.username || currentUser?.email || "—";

  renderSelect(sortPollsDesktop, "polls");
  renderSelect(sortPollsMobile, "polls");
  renderSelect(sortTasksDesktop, "tasks");
  renderSelect(sortTasksMobile, "tasks");
  renderSelect(sortSubscribersDesktop, "subscribers");
  renderSelect(sortSubscribersMobile, "subscribers");
  renderSelect(sortSubscriptionsDesktop, "subscriptions");
  renderSelect(sortSubscriptionsMobile, "subscriptions");

  wireSort(sortPollsDesktop, "polls");
  wireSort(sortPollsMobile, "polls");
  wireSort(sortTasksDesktop, "tasks");
  wireSort(sortTasksMobile, "tasks");
  wireSort(sortSubscribersDesktop, "subscribers");
  wireSort(sortSubscribersMobile, "subscribers");
  wireSort(sortSubscriptionsDesktop, "subscriptions");
  wireSort(sortSubscriptionsMobile, "subscriptions");

  registerToggleHandlers();
  syncToggles();

  tabPolls?.addEventListener("click", () => setActiveTab("polls"));
  tabSubs?.addEventListener("click", () => setActiveTab("subs"));
  setActiveTab("polls");

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

  await refreshData();
});
