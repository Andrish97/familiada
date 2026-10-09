import { sb, SUPABASE_URL } from "../../shared/js/core/supabase.js?v=v2026-10-09T17351";
import { requireAuth, signOut } from "../../shared/js/core/auth.js?v=v2026-10-09T17351";
import { isGuestUser, showGuestBlockedOverlay } from "../../shared/js/core/guest-mode.js?v=v2026-10-09T17351";
import { toast } from "../../shared/js/core/toast.js?v=v2026-10-09T17351";
import { alertModal, confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-09T17351";
import { getUiLang, initI18n, t } from "../../shared/translation/translation.js?v=v2026-10-09T17351";
import { linkTo, backHref, renderBackLabel } from "../../shared/js/core/nav-map.js?v=v2026-10-09T17351";
import { initTopbarAccountDropdown } from "../../shared/js/core/topbar-controller.js?v=v2026-10-09T17351";
import "../../shared/js/core/contact-modal.js?v=v2026-10-09T17351";
import { icon } from "../../shared/js/core/icons.js?v=v2026-10-09T17351";
import { createCooldownTicker } from "../../shared/js/core/cooldown.js?v=v2026-10-09T17351";
import { enterModalSheet, exitModalSheet, handleSheetBack } from "../../shared/js/core/modal-sheet.js?v=v2026-10-09T17351";
import { initUiSelect } from "../../shared/js/core/ui-select.js?v=v2026-10-09T17351";
import { initListSearch } from "../../shared/js/core/list-search.js?v=v2026-10-09T17351";

const i18nReady = initI18n({ withSwitcher: true }).catch((err) => {
  console.error("[subscriptions] i18n nieaktywny:", err);
}).finally(() => {
  document.documentElement.classList.remove('page-loading');
});

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const qs = new URLSearchParams(location.search);
const focusInviteToken = qs.get("s");
const focusTaskToken = qs.get("t");
let focusInviteHandled = false;
let focusTaskHandled = false;
let subTokenPrompted = false;


const who = $("who");
const btnBack = $("btnBackToGames");
const btnManual = $("btnManual");
const hintEl = $("hint");

const TABS = ["subscribers", "subscriptions", "tasks"];
const tabBtns = { subscribers: $("tabSubscribers"), subscriptions: $("tabSubscriptions"), tasks: $("tabTasks") };
const sections = { subscribers: $("subsSectionSubscribers"), subscriptions: $("subsSectionSubscriptions"), tasks: $("subsSectionTasks") };
const grids = { subscribers: $("subscribersGrid"), subscriptions: $("subscriptionsGrid"), tasks: $("tasksGrid") };

const btnResend = $("btnResend");
const btnAccept = $("btnAccept");
const btnVote = $("btnVote");

const inviteOverlay = $("inviteOverlay");
const inviteInput = $("inviteInput");
const btnInviteOk = $("btnInviteOk");

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
  emptyTasks: () => t("pollsHubSubscriptions.empty.tasks"),
  invalidEmail: () => t("pollsHubSubscriptions.errors.invalidEmail"),
  unknownUser: () => t("pollsHubSubscriptions.errors.unknownUser"),
  inviteFail: () => t("pollsHubSubscriptions.errors.invite"),
  inviteSaved: () => t("pollsHubSubscriptions.statusMsg.inviteSaved"),
  resendFail: () => t("pollsHubSubscriptions.errors.resend"),
  inviteMailFailed: () => t("pollsHubSubscriptions.errors.inviteMailFailed"),
  resendMailFailed: () => t("pollsHubSubscriptions.errors.resendMailFailed"),
  removeFail: () => t("pollsHubSubscriptions.errors.removeSubscriber"),
  acceptFail: () => t("pollsHubSubscriptions.errors.acceptSubscription"),
  updateFail: () => t("pollsHubSubscriptions.errors.updateSubscription"),
  declineTaskFail: () => t("pollsHubSubscriptions.errors.declineTask"),
  loadFail: () => t("pollsHubSubscriptions.errors.loadHub"),
  focusPrompt: () => t("pollsHubSubscriptions.confirm.focusSub"),
  focusTaskPrompt: () => t("pollsHubSubscriptions.confirm.focusTask"),
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
  declineTaskTitle: () => t("pollsHubSubscriptions.modal.declineTask.title"),
  declineTaskText: () => t("pollsHubSubscriptions.modal.declineTask.text"),
  declineTaskOk: () => t("pollsHubSubscriptions.modal.declineTask.ok"),
  declineTaskCancel: () => t("pollsHubSubscriptions.modal.declineTask.cancel"),
  tokenMismatchTitle: () => t("pollsHubSubscriptions.modal.tokenMismatch.title"),
  tokenMismatchText: () => t("pollsHubSubscriptions.modal.tokenMismatch.text"),
  tokenMismatchOk: () => t("pollsHubSubscriptions.modal.tokenMismatch.ok"),
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

async function callOkRpc(name, args) {
  const { data, error } = await sb().rpc(name, args);
  if (error || data?.ok === false) {
    throw error || new Error(String(data?.error || `${name}_failed`));
  }
  return data;
}

let subscribers = [];
let invites = [];
let tasks = [];

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function setProgress({ show = false, step = "—", i = 0, n = 0, msg = "" } = {}) {
  if (progressOverlay) progressOverlay.style.display = show ? "grid" : "none";
  if (progressStep) progressStep.textContent = step;
  if (progressCount) progressCount.textContent = `${i}/${n}`;
  if (progressBar) progressBar.style.width = `${n ? Math.round((i / n) * 100) : 0}%`;
  if (progressMsg) progressMsg.textContent = msg;
}

function parseDate(value) { return value ? new Date(value).getTime() : 0; }
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

// Mechanizm (żywe odliczanie) z wspólnego js/core/cooldown.js, ale FORMAT
// tekstu zostaje własny, lokalnie zlokalizowany (cooldownTextFromUntil).
// resetBindings() na początku każdego renderu listy subskrybentów, bo kafle
// są przebudowywane w całości przy każdym odświeżeniu.
const resendCooldownTicker = createCooldownTicker();
resendCooldownTicker.start();

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

function buildMailHtml({ title, subtitle, body, actionLabel, actionUrl, unsubToken, isRegistered }) {
  let footerExtra = "";
  if (isRegistered) {
    const accountUrl = mailLink("account", { withLang: true });
    footerExtra = `<div style="margin-top:10px;font-size:11px;opacity:.55;text-align:center;">
      ${t("pollGo.mailAccountSettings")}
      <a href="${accountUrl}" style="color:#ffeaa6;text-decoration:underline;">${t("pollGo.mailAccountSettingsLink")}</a>
    </div>`;
  } else if (unsubToken) {
    const globalUrl = mailLink(`/go/?u=${encodeURIComponent(unsubToken)}`);
    footerExtra = `<div style="margin-top:10px;font-size:11px;opacity:.55;text-align:center;">
      <a href="${globalUrl}" style="color:#ffeaa6;opacity:.7;text-decoration:underline;">${t("pollGo.mailUnsubGlobal")}</a>
    </div>`;
  }

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
    ${footerExtra}
  </div>
</div>
`.trim();

  return wrapEmailDoc(inner);
}

async function sendMail({ to, subject, html, cooldownActionKey, cooldownTargetKey }) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(t("pollsHubSubscriptions.errors.mailSession"));
  const doReq = async (accessToken) => fetch(MAIL_FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html, cooldownActionKey, cooldownTargetKey }),
  });
  let res = await doReq(token);
  if (res.status === 401) {
    const { data: refreshed } = await sb().auth.refreshSession();
    const freshToken = refreshed?.session?.access_token;
    if (freshToken) res = await doReq(freshToken);
  }
  if (!res.ok) throw new Error((await res.text()) || t("pollsHubSubscriptions.errors.mailSend"));
}

// Mail tu wysyłany ZAWSZE w konsekwencji polls_hub_subscriber_resend (czy to
// z invite(), czy z samego resend) -- stąd action_key "poll:resend", a nie
// "poll:invite". target_key nie musi bitowo zgadzać się z tym, co RPC użyło
// wewnętrznie (trigger na mail_queue sprawdza tylko baseline:recipient po
// created_by+to_email, niezależnie od tej wartości) -- email wystarcza jako
// rozpoznawalny, czytelny identyfikator do audytu.
async function sendSubscriptionEmail({ to, link, ownerLabel, unsubToken, isRegistered }) {
  await sendMail({
    to,
    subject: t("pollsHubSubscriptions.mail.subscriptionTitle", { owner: ownerLabel }),
    cooldownActionKey: "poll:resend",
    cooldownTargetKey: `email:${String(to || "").trim().toLowerCase()}`,
    html: buildMailHtml({
      title: t("pollsHubSubscriptions.mail.subscriptionTitle", { owner: ownerLabel }),
      subtitle: t("pollsHubSubscriptions.mail.subtitle"),
      body: t("pollsHubSubscriptions.mail.subscriptionBody", { owner: ownerLabel }),
      actionLabel: t("pollsHubSubscriptions.mail.subscriptionAction"),
      actionUrl: mailLink(link, { withLang: true }),
      unsubToken,
      isRegistered,
    }),
  });
}


function setBadge(id, count) {
  const el = $(id);
  if (el) el.textContent = count > 99 ? "99+" : (count > 0 ? String(count) : "");
}

// ===== zakładki + zaznaczenie =====

let activeTab = "subscribers";
let selected = null; // { tab, id }

function tabFromUrl() {
  const tab = new URLSearchParams(location.search).get("tab");
  if (TABS.includes(tab)) return tab;
  return focusTaskToken ? "tasks" : "subscribers";
}

function setActiveTab(tab) {
  activeTab = TABS.includes(tab) ? tab : "subscribers";
  const url = new URL(location.href);
  if (url.searchParams.get("tab") !== activeTab) {
    url.searchParams.set("tab", activeTab);
    history.replaceState(history.state, "", url);
  }
  for (const k of TABS) {
    const on = k === activeTab;
    sections[k]?.classList.toggle("active", on);
    tabBtns[k]?.closest(".tab-slot")?.classList.toggle("active", on);
    tabBtns[k]?.setAttribute("aria-selected", on ? "true" : "false");
  }
  const hintKey = { subscribers: "hintSubscribers", subscriptions: "hintSubscriptions", tasks: "hintTasks" }[activeTab];
  if (hintEl) hintEl.textContent = t(`pollsHubSubscriptions.bar.${hintKey}`);
  document.querySelectorAll(".actions [data-for]").forEach((b) => { b.hidden = b.dataset.for !== activeTab; });
  syncViewControls();
  updateActions();
}

function selectedRow() {
  if (!selected) return null;
  const list = selected.tab === "subscribers" ? subscribers : selected.tab === "subscriptions" ? invites : tasks;
  const key = selected.tab === "tasks" ? "task_id" : "sub_id";
  return list.find((r) => String(r[key]) === String(selected.id)) || null;
}

function selectTile(tab, id) {
  selected = selected && selected.tab === tab && String(selected.id) === String(id) ? null : { tab, id };
  for (const k of TABS) {
    grids[k]?.querySelectorAll(".card").forEach((el) => {
      el.classList.toggle("selected", !!selected && selected.tab === k && el.dataset.id === String(selected.id));
    });
  }
  updateActions();
}

function updateActions() {
  const row = selected && selected.tab === activeTab ? selectedRow() : null;
  if (btnResend) btnResend.disabled = !(row && activeTab === "subscribers" && row.status === "pending");
  if (btnAccept) btnAccept.disabled = !(row && activeTab === "subscriptions" && row.status === "pending");
  if (btnVote) btnVote.disabled = !(row && activeTab === "tasks" && row.status === "pending" && row.token);
}

// Widok per zakładka (tylko w pamięci): aktualne/archiwalne + sortowanie.
const viewState = {
  subscribers: { archive: false, sort: "newest" },
  subscriptions: { archive: false, sort: "newest" },
  tasks: { archive: false, sort: "newest" },
};
const SORTS = ["newest", "oldest", "nameAsc", "nameDesc"];
let sortSelectApi = null;
let viewToggleBtns = null;

function isArchivedStatus(status) {
  return status === "declined" || status === "cancelled" || status === "done";
}

function sortRows(list, sort, nameOf) {
  const cmpName = (a, b) => String(nameOf(a)).localeCompare(String(nameOf(b)), getUiLang() || "pl", { sensitivity: "base" });
  const rows = [...list];
  if (sort === "oldest") rows.sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));
  else if (sort === "nameAsc") rows.sort(cmpName);
  else if (sort === "nameDesc") rows.sort((a, b) => cmpName(b, a));
  else rows.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  return rows;
}

function rerenderAll() {
  renderSubscribers();
  renderInvites();
  renderTasks();
  updateActions();
}

function syncViewControls() {
  const v = viewState[activeTab];
  if (!v || !viewToggleBtns) return;
  viewToggleBtns.current.classList.toggle("gold", !v.archive);
  viewToggleBtns.archive.classList.toggle("gold", v.archive);
  viewToggleBtns.current.setAttribute("aria-pressed", v.archive ? "false" : "true");
  viewToggleBtns.archive.setAttribute("aria-pressed", v.archive ? "true" : "false");
  sortSelectApi?.setValue(v.sort, { silent: true });
}

function initViewControls() {
  const slot = document.querySelector(".games-bottom-left");
  if (!slot) return;
  const group = document.createElement("div");
  group.className = "subs-view-toggle";
  group.setAttribute("role", "group");
  const mk = (archive) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn sm";
    b.addEventListener("click", () => {
      viewState[activeTab].archive = archive;
      syncViewControls();
      rerenderAll();
    });
    return b;
  };
  viewToggleBtns = { current: mk(false), archive: mk(true) };
  group.append(viewToggleBtns.current, viewToggleBtns.archive);

  const wrap = document.createElement("div");
  wrap.className = "ui-select subs-sort";
  wrap.innerHTML = `<button class="btn sm ui-select-btn" type="button" aria-haspopup="listbox" aria-expanded="false"><span class="ui-select-label">—</span><span class="ui-select-caret" aria-hidden="true"><i class="ico" data-icon="caret-down"></i></span></button><div class="ui-select-menu" role="listbox"></div>`;
  slot.prepend(wrap);
  slot.prepend(group);

  const sortOptions = () => SORTS.map((k) => ({ value: k, label: t(`pollsHubSubscriptions.view.sort.${k}`) }));
  const labelAll = () => {
    viewToggleBtns.current.textContent = t("pollsHubSubscriptions.view.current");
    viewToggleBtns.archive.textContent = t("pollsHubSubscriptions.view.archive");
    wrap.querySelector(".ui-select-btn")?.setAttribute("aria-label", t("pollsHubSubscriptions.view.sortLabel"));
  };
  labelAll();
  sortSelectApi = initUiSelect(wrap, {
    options: sortOptions(),
    value: viewState[activeTab].sort,
    onChange: (val) => {
      if (!SORTS.includes(val)) return;
      viewState[activeTab].sort = val;
      rerenderAll();
    },
  });
  window.addEventListener("i18n:lang", () => {
    labelAll();
    sortSelectApi?.setOptions(sortOptions());
  });
  syncViewControls();
}

function tagHtml(variant, text) {
  return `<span class="tag ${variant} tileBadge">${escapeHtml(text)}</span>`;
}

function statusTagHtml(status) {
  const variant = status === "active" ? "tag--ok" : status === "declined" ? "tag--bad" : "tag--warn";
  return tagHtml(variant, MSG.statusLabel(status));
}

function renderEmptyTile(el, txt) {
  const d = document.createElement("div");
  d.className = "subs-empty";
  d.textContent = txt;
  el.appendChild(d);
}

function trashButtonHtml(title) {
  return `<button class="x" type="button" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${icon("trash")}</button>`;
}

function buildTile(tab, id, { name, sub = "", metaHtml = "", trashTitle = "" }) {
  const tile = document.createElement("div");
  tile.className = "card";
  tile.dataset.id = String(id);
  if (selected && selected.tab === tab && String(selected.id) === String(id)) tile.classList.add("selected");
  tile.innerHTML = `
    ${trashTitle ? trashButtonHtml(trashTitle) : ""}
    <div>
      <div class="name">${escapeHtml(name)}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ""}
      <div class="meta">${metaHtml}</div>
    </div>`;
  // zaznaczenie nie przebudowuje kafli -- tylko przełącza klasę
  tile.addEventListener("click", () => selectTile(tab, id));
  return tile;
}

// ===== Moi subskrybenci =====

function renderSubscribers() {
  const el = grids.subscribers;
  if (!el) return;
  resendCooldownTicker.resetBindings();
  el.innerHTML = "";

  const add = document.createElement("div");
  add.className = "addCard";
  add.innerHTML = `<div class="plus">${icon("plus")}</div><div class="name">${escapeHtml(t("pollsHubSubscriptions.inviteModal.title"))}</div>`;
  add.addEventListener("click", openInviteModal);
  el.appendChild(add);

  const arch = viewState.subscribers.archive;
  const visible = sortRows(subscribers.filter((s) => {
    if (s.is_expired) return false;
    return arch ? isArchivedStatus(s.status) : (s.status === "active" || s.status === "pending");
  }), viewState.subscribers.sort, (r) => r.subscriber_label || "");
  if (!visible.length) renderEmptyTile(el, MSG.emptySubscribers());

  for (const row of visible) {
    const key = `resend:${row.sub_id}`;
    const tile = buildTile("subscribers", row.sub_id, {
      name: row.subscriber_label || MSG.dash(),
      metaHtml: statusTagHtml(row.status) + (row.status === "pending" ? `<span class="tag tag--muted tag--cooldown tileBadge" hidden></span>` : ""),
      trashTitle: row.status !== "declined" ? t("pollsHubSubscriptions.actions.remove") : "",
    });
    const cd = tile.querySelector(".tag--cooldown");
    if (cd) {
      resendCooldownTicker.bind({
        key,
        labelEl: cd,
        formatText: (ms) => cooldownTextFromUntil(Date.now() + ms),
      });
      resendCooldownTicker.setEndMs(key, cooldownUntil(row.email_sent_at));
    }
    tile.querySelector(".x")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmModal({ title: MSG.removeTitle(), text: MSG.removeText(), okText: MSG.removeOk(), cancelText: MSG.removeCancel() });
      if (!ok) return;
      try {
        await callOkRpc("polls_hub_subscriber_remove", { p_id: row.sub_id });
        if (selected?.tab === "subscribers" && String(selected.id) === String(row.sub_id)) selected = null;
        await refreshData();
      } catch {
        await alertModal({ text: MSG.removeFail() });
      }
    });
    el.appendChild(tile);
  }
}

let resendInFlight = false;
async function resendSelected() {
  const row = selected?.tab === "subscribers" ? selectedRow() : null;
  if (!row || row.status !== "pending" || resendInFlight) return;
  const key = `resend:${row.sub_id}`;
  const left = resendCooldownTicker.getRemainingMs(key);
  if (left > 0) {
    await alertModal({ text: cooldownTextFromUntil(Date.now() + left) });
    return;
  }
  resendInFlight = true;
  btnResend.disabled = true;
  try {
    const { data, error } = await sb().rpc("polls_hub_subscriber_resend", { p_id: row.sub_id });
    if (error) throw error;
    if (data?.ok === false) {
      if (data?.err === "cooldown") {
        const untilTs = parseDate(data?.cooldown_until) || (Date.now() + COOLDOWN_MS);
        resendCooldownTicker.setEndMs(key, untilTs);
        await alertModal({ text: cooldownTextFromUntil(untilTs) });
        return;
      }
      throw new Error(data?.err || "fail");
    }
    if (data?.to && data?.link) {
      const ownerLabel = who?.querySelector('.account-who')?.textContent || "Familiada";
      try {
        await sendSubscriptionEmail({ to: data.to, link: data.link, ownerLabel, unsubToken: data.unsub_token || null, isRegistered: !!data.registered });
        toast(t("pollsHubSubscriptions.statusMsg.mailSent"));
      } catch {
        await alertModal({ text: MSG.resendMailFailed() });
      }
    }
    await refreshData();
  } catch {
    await alertModal({ text: MSG.resendFail() });
  } finally {
    resendInFlight = false;
    updateActions();
  }
}

// ===== Moje subskrypcje =====

function renderInvites() {
  const el = grids.subscriptions;
  if (!el) return;
  el.innerHTML = "";
  const arch = viewState.subscriptions.archive;
  const visible = sortRows(invites.filter((s) => {
    if (s.is_expired) return false;
    return arch ? isArchivedStatus(s.status) : (s.status === "active" || s.status === "pending");
  }), viewState.subscriptions.sort, (r) => r.owner_label || "");
  if (!visible.length) renderEmptyTile(el, MSG.emptySubscriptions());

  for (const row of visible) {
    const isPending = row.status === "pending";
    const tile = buildTile("subscriptions", row.sub_id, {
      name: row.owner_label || MSG.dash(),
      metaHtml: statusTagHtml(row.status),
      trashTitle: row.status !== "declined" ? t(`pollsHubSubscriptions.actions.${isPending ? "decline" : "cancel"}`) : "",
    });
    tile.querySelector(".x")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmModal({
        title: MSG.updateTitle(),
        text: isPending ? MSG.updateTextPending() : MSG.updateTextActive(),
        okText: isPending ? MSG.updateOkPending() : MSG.updateOkActive(),
        // Dolny przycisk "Zamknij" zbędny — modal zamyka X w nagłówku.
        showCancel: false,
      });
      if (!ok) return;
      try {
        await callSubscriptionAction(row, isPending ? "reject" : "cancel");
        if (selected?.tab === "subscriptions" && String(selected.id) === String(row.sub_id)) selected = null;
        await refreshData();
      } catch {
        await alertModal({ text: MSG.updateFail() });
      }
    });
    el.appendChild(tile);
  }
}

async function acceptSelected() {
  const row = selected?.tab === "subscriptions" ? selectedRow() : null;
  if (!row || row.status !== "pending") return;
  btnAccept.disabled = true;
  try {
    await callSubscriptionAction(row, "accept");
    await refreshData();
  } catch {
    await alertModal({ text: MSG.acceptFail() });
  } finally {
    updateActions();
  }
}

// ===== Zadania (ankiety do wypełnienia) =====

function pollTypeLabel(type) {
  return t(type === "poll_points" ? "pollsHubSubscriptions.pollType.points" : "pollsHubSubscriptions.pollType.text");
}

function openTask(task) {
  if (!task?.token) return false;
  const page = task.poll_type === "poll_points" ? "/polls/vote/points/" : "/polls/vote/text/";
  location.href = `${page}?t=${encodeURIComponent(task.token)}&lang=${encodeURIComponent(getUiLang() || "pl")}`;
  return true;
}

function renderTasks() {
  const el = grids.tasks;
  if (!el) return;
  el.innerHTML = "";
  // Aktualne: zadania do wykonania; archiwalne: zrobione / odrzucone / anulowane.
  // Zamknięcie ankiety anuluje jej oczekujące
  // zadania po stronie bazy, więc „pending” oznacza ankietę otwartą.
  const arch = viewState.tasks.archive;
  const visible = sortRows(tasks.filter((r) => (r.status === "pending") !== arch), viewState.tasks.sort,
    (r) => r.game_name || "");
  if (!visible.length) renderEmptyTile(el, MSG.emptyTasks());

  for (const task of visible) {
    const ownerLabel = (task?.owner_username || task?.owner_email || "").trim() || MSG.dash();
    const tile = buildTile("tasks", task.task_id, {
      name: `${pollTypeLabel(task.poll_type)} — ${task.game_name || MSG.dash()}`,
      sub: escapeHtml(t("pollsHubSubscriptions.taskFrom", { owner: ownerLabel })),
      metaHtml: tagHtml("tag--gold", t("pollsHubSubscriptions.taskStatus.available")),
      trashTitle: t("pollsHubSubscriptions.actions.decline"),
    });
    tile.querySelector(".x")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmModal({
        title: MSG.declineTaskTitle(),
        text: MSG.declineTaskText(),
        okText: MSG.declineTaskOk(),
        cancelText: MSG.declineTaskCancel(),
      });
      if (!ok) return;
      try {
        setProgress({ show: true, step: t("pollsHubSubscriptions.progress.declineTask"), i: 0, n: 1 });
        const { data, error } = await sb().rpc("polls_hub_task_decline", { p_task_id: task.task_id });
        if (error) throw error;
        if (!data) throw new Error("decline_task_failed");
        if (selected?.tab === "tasks" && String(selected.id) === String(task.task_id)) selected = null;
        await refreshData();
      } catch {
        await alertModal({ text: MSG.declineTaskFail() });
      } finally {
        setProgress({ show: false });
      }
    });
    tile.addEventListener("dblclick", async () => {
      if (!openTask(task)) await alertModal({ text: MSG.loadFail() });
    });
    el.appendChild(tile);
  }
}

// ===== zaproszenie nowego subskrybenta =====

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

function openInviteModal() {
  if (!inviteOverlay) return;
  inviteInput.value = "";
  inviteOverlay.style.display = "grid";
  enterModalSheet(inviteOverlay, { backBtn: btnBack, onClose: closeInviteModal });
  setTimeout(() => inviteInput.focus(), 0);
}

function closeInviteModal() {
  if (inviteOverlay) inviteOverlay.style.display = "none";
  exitModalSheet(inviteOverlay);
}

let inviteInFlight = false;
async function invite(value) {
  const v = String(value || "").trim();
  if (!v || inviteInFlight) return false;
  inviteInFlight = true;
  btnInviteOk.disabled = true;
  try {
    setProgress({ show: true, step: t("pollsHubSubscriptions.progress.invite"), i: 0, n: 2 });
    const recipient = await resolveInviteRecipient(v);
    const { data, error } = await sb().rpc("polls_hub_subscription_invite", { p_recipient: recipient });
    if (error) throw error;
    if (data?.ok === false) {
      if (data?.err === "cooldown") {
        const untilTs = parseDate(data?.cooldown_until) || (Date.now() + 5 * 24 * 60 * 60 * 1000);
        await alertModal({ text: cooldownTextFromUntil(untilTs) });
        return false;
      }
      throw new Error(data?.err || "invite");
    }

    if (!data?.already && data?.id) {
      const { data: resendData, error: resendError } = await sb().rpc("polls_hub_subscriber_resend", { p_id: data.id });
      if (resendError || resendData?.ok === false) {
        throw resendError || new Error(String(resendData?.err || "resend_failed"));
      }
      if (resendData?.to && resendData?.link) {
        try {
          await sendSubscriptionEmail({
            to: resendData.to,
            link: resendData.link,
            ownerLabel: who?.querySelector('.account-who')?.textContent || "Familiada",
            unsubToken: resendData.unsub_token || null,
            isRegistered: !!resendData.registered,
          });
        } catch {
          closeInviteModal();
          await alertModal({ text: MSG.inviteMailFailed() });
          await refreshData();
          return true;
        }
      }
    }

    closeInviteModal();
    await refreshData();
    toast(MSG.inviteSaved());
    return true;
  } catch (e) {
    const m = String(e?.message || "").toLowerCase();
    if (m.includes("invalid_email")) await alertModal({ text: MSG.invalidEmail() });
    else if (m.includes("unknown_user") || m.includes("unknown")) await alertModal({ text: MSG.unknownUser() });
    else if (m.includes("email")) await alertModal({ text: MSG.invalidEmail() });
    else await alertModal({ text: MSG.inviteFail() });
    return false;
  } finally {
    setProgress({ show: false });
    inviteInFlight = false;
    btnInviteOk.disabled = false;
  }
}

// ===== odświeżanie =====

let autoRefreshTimer = null;
function startAutoRefresh() {
  if (autoRefreshTimer) return;
  autoRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    if (progressOverlay && progressOverlay.style.display === "grid") return;
    if (inviteOverlay && inviteOverlay.style.display !== "none") return;
    refreshData();
  }, 20000);
}

function stopAutoRefresh() {
  if (!autoRefreshTimer) return;
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

async function refreshTopBadges() {
  const { data, error } = await sb().rpc("polls_badge_get");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  setBadge("subsBadge", Number(row?.subs_pending || 0));
  setBadge("tasksBadge", Number(row?.tasks_pending || 0));
}

function taskTokenOf(task) {
  if (task?.token) return task.token;
  try {
    if (!task?.go_url) return null;
    return new URL(task.go_url, location.origin).searchParams.get("t");
  } catch {
    return null;
  }
}

let subsRefreshInFlight = null;

async function refreshData() {
  if (subsRefreshInFlight) return subsRefreshInFlight;

  subsRefreshInFlight = (async () => {
  try {
    const [a, b, c] = await Promise.all([
      sb().rpc("polls_hub_list_my_subscribers"),
      sb().rpc("polls_hub_list_my_subscriptions"),
      sb().rpc("polls_hub_list_tasks"),
    ]);
    if (a.error || b.error || c.error) throw a.error || b.error || c.error;
    subscribers = a.data || [];
    invites = b.data || [];
    tasks = (c.data || []).map((task) => ({ ...task, token: taskTokenOf(task) }));

    renderSubscribers();
    renderInvites();
    renderTasks();
    updateActions();
    await refreshTopBadges();

    if (focusTaskToken && !focusTaskHandled) {
      focusTaskHandled = true;
      const found = tasks.find((x) => String(x.token) === String(focusTaskToken));
      if (found) {
        const ok = await confirmModal({ text: MSG.focusTaskPrompt() });
        if (ok) openTask(found);
      }
      const url = new URL(location.href);
      url.searchParams.delete("t");
      history.replaceState(null, "", url.toString());
    }

    if (focusInviteToken && !focusInviteHandled) {
      focusInviteHandled = true;
      const match = invites.find((x) => String(x.token) === String(focusInviteToken));
      if (match) {
        if (match.status === "pending") {
          const ok = await confirmModal({ text: MSG.focusPrompt() });
          if (ok) {
            await callSubscriptionAction(match, "accept");
            await refreshData();
          }
        }
      } else if (!subTokenPrompted) {
        subTokenPrompted = true;
        const ok = await confirmModal({
          title: MSG.tokenMismatchTitle(),
          text: MSG.tokenMismatchText(),
          okText: MSG.tokenMismatchOk(),
          // Dolny przycisk "Zamknij" zbędny — modal zamyka X w nagłówku.
          showCancel: false,
        });
        if (ok) {
          await signOut();
          const url = new URL("/login/", location.href);
          url.searchParams.set("next", "subscriptions");
          url.searchParams.set("s", focusInviteToken);
          location.href = url.toString();
        }
      }
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


// Navigation is usable while authentication and lists are still loading.
// Znacznik dla contact-modal.js: ten przycisk respektuje handleSheetBack().
if (btnBack) btnBack.dataset.sheetBack = "1";
btnBack?.addEventListener("click", () => {
  if (handleSheetBack()) return;
  location.href = backHref("subscriptions");
});
btnManual?.addEventListener("click", () => { location.href = linkTo("manual", { hash: "subscriptions" }); });

document.addEventListener("DOMContentLoaded", async () => {
  await i18nReady;
  const user = await requireAuth("/login/");
  if (isGuestUser(user)) {
    document.querySelector('.topbar')?.classList.add('topbar-ready');
    showGuestBlockedOverlay({ backHref: backHref("subscriptions"), loginHref: "/login/?force_auth=1", showLoginButton: true });
    return;
  }
  initTopbarAccountDropdown(user);
  document.querySelector('.topbar')?.classList.add('topbar-ready');

  initViewControls();
  initListSearch({ grids: "#subscribersGrid, #subscriptionsGrid, #tasksGrid", tile: ".card", name: ".name" });

  TABS.forEach((k, index) => {
    const btn = tabBtns[k];
    btn?.addEventListener("click", () => setActiveTab(k));
    btn?.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight") next = TABS[(index + 1) % TABS.length];
      else if (event.key === "ArrowLeft") next = TABS[(index + TABS.length - 1) % TABS.length];
      else if (event.key === "Home") next = TABS[0];
      else if (event.key === "End") next = TABS[TABS.length - 1];
      if (!next) return;
      event.preventDefault();
      setActiveTab(next);
      tabBtns[next]?.focus();
    });
  });
  setActiveTab(tabFromUrl());

  btnResend?.addEventListener("click", resendSelected);
  btnAccept?.addEventListener("click", acceptSelected);
  btnVote?.addEventListener("click", () => {
    const row = selected?.tab === "tasks" ? selectedRow() : null;
    if (row) openTask(row);
  });

  $("btnInviteClose")?.addEventListener("click", closeInviteModal);
  $("btnInviteCancel")?.addEventListener("click", closeInviteModal);
  btnInviteOk?.addEventListener("click", () => invite(inviteInput?.value));
  inviteInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") invite(inviteInput.value); });

  renderBackLabel(btnBack, "subscriptions");

  window.addEventListener("i18n:lang", () => {
    setActiveTab(activeTab);
    renderSubscribers();
    renderInvites();
    renderTasks();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else { startAutoRefresh(); refreshData(); }
  });

  await refreshData();
  document.querySelectorAll('[data-skel-step]').forEach(el => el.classList.add('skel-step-ready'));

  startAutoRefresh();
});
