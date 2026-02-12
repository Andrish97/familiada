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
  shareSaveFail: () => t("pollsHubPolls.errors.shareSave"),
  loadDetailsFail: () => t("pollsHubPolls.errors.loadDetails"),
  deleteVoteStep: () => t("pollsHubPolls.progress.deleteVote"),
  deleteVoteFail: () => t("pollsHubPolls.errors.deleteVote"),
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

function isPollArchived(poll) {
  if (poll.poll_state !== "closed") return false;
  const closedAt = pollClosedAt.get(poll.game_id) || poll.created_at;
  return Date.now() - parseDate(closedAt) > 5 * 24 * 60 * 60 * 1000;
}

function sortPollsList(list) {
  const sorted = [...list];
  const cmpName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));
  if (sortState.polls === "name-asc") sorted.sort(cmpName);
  else if (sortState.polls === "name-desc") sorted.sort((a, b) => cmpName(b, a));
  else if (sortState.polls === "oldest") sorted.sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));
  else sorted.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  return sorted;
}

function sortTasksList(list) {
  const sorted = [...list];
  const cmpName = (a, b) => String(a.game_name || "").localeCompare(String(b.game_name || ""));
  if (sortState.tasks === "name-asc") sorted.sort(cmpName);
  else if (sortState.tasks === "name-desc") sorted.sort((a, b) => cmpName(b, a));
  else if (sortState.tasks === "oldest") sorted.sort((a, b) => parseDate(a.created_at) - parseDate(b.created_at));
  else sorted.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  return sorted;
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
      const item = document.createElement("div");
      item.className = `hub-item ${task.status === "done" ? "task-done" : "task-pending"}`;
      item.innerHTML = `<div><div class="hub-item-title">${pollTypeLabel(task.poll_type)} — ${task.game_name || MSG.dash()}</div><div class="hub-item-sub">${task.status === "done" ? MSG.taskStatusDone() : MSG.taskStatusAvailable()}</div></div><div class="hub-item-actions"></div>`;
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
        location.href = `poll_go.html?t=${encodeURIComponent(task.token)}&lang=${encodeURIComponent(getUiLang() || "pl")}`;
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
  location.href = `polls.html?id=${encodeURIComponent(poll.game_id)}&from=polls-hub`;
}

function setActiveMobileTab(tab) {
  tabPollsMobile?.classList.toggle("active", tab === "polls");
  tabTasksMobile?.classList.toggle("active", tab === "tasks");
  panelPollsMobile?.classList.toggle("active", tab === "polls");
  panelTasksMobile?.classList.toggle("active", tab === "tasks");
}

function renderSelect(el, kind) {
  if (!el) return;
  const options = [
    { value: "newest", label: t("pollsHubPolls.sort.newest") },
    { value: "oldest", label: t("pollsHubPolls.sort.oldest") },
    { value: "name-asc", label: t("pollsHubPolls.sort.nameAsc") },
    { value: "name-desc", label: t("pollsHubPolls.sort.nameDesc") },
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
  const { data, error } = await sb().rpc("polls_hub_list_my_subscribers");
  if (error) return;
  const subs = (data || []).filter((x) => x.status === "active");
  const selectedIds = new Set((selectedPoll?.recipients_preview || []).map((n) => String(n || "").toLowerCase()));
  shareBaseline = new Set();
  shareList.innerHTML = subs.map((s) => {
    const label = String(s.subscriber_label || s.subscriber_email || "").trim();
    const isChecked = selectedIds.has(label.toLowerCase());
    if (isChecked) shareBaseline.add(String(s.sub_id));
    return `<label class="hub-share-item"><input type="checkbox" data-id="${s.sub_id}" ${isChecked ? "checked" : ""}/><span>${label || MSG.dash()}</span></label>`;
  }).join("");
  shareMsg.textContent = "";
  shareOverlay.style.display = "grid";
}

function closeShareModal() { shareOverlay.style.display = "none"; shareList.innerHTML = ""; }

async function saveShareModal() {
  if (!sharePollId) return;
  const selected = new Set([...shareList.querySelectorAll('input[type="checkbox"]:checked')].map((el) => String(el.dataset.id)));
  const add = [...selected].filter((id) => !shareBaseline.has(id));
  const remove = [...shareBaseline].filter((id) => !selected.has(id));
  if (!add.length && !remove.length) { shareMsg.textContent = MSG.shareNoChanges(); return; }

  try {
    setProgress({ show: true, step: MSG.shareStep(), i: 0, n: 1 });
    const { data, error } = await sb().rpc("polls_hub_share_poll", { p_game_id: sharePollId, p_sub_ids: [...selected] });
    if (error || data?.ok === false) throw error || new Error("share_failed");

    const mailItems = Array.isArray(data?.mail) ? data.mail : [];
    if (mailItems.length) {
      const { data: sess } = await sb().auth.getSession();
      const token = sess?.session?.access_token;
      if (token) {
        await Promise.allSettled(mailItems.map((item) => fetch(MAIL_FUNCTION_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: item.to,
            subject: t("pollsHubPolls.mail.taskSubject", { name: selectedPoll?.name || t("pollsHubPolls.pollFallback") }),
            html: `<p>${t("pollsHubPolls.mail.taskBody", { owner: currentUser?.username || currentUser?.email || t("pollsHubPolls.ownerFallback"), name: selectedPoll?.name || t("pollsHubPolls.pollFallback") })}</p><p><a href="${item.link}">${t("pollsHubPolls.mail.taskAction")}</a></p>`,
          }),
        })));
      }
    }

    shareMsg.textContent = MSG.shareSaved();
    await refreshData();
  } catch {
    shareMsg.textContent = MSG.shareSaveFail();
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
    const { data: taskRows, error: taskErr } = await sb().from("poll_tasks").select("id,status,recipient_email,recipient_user_id").eq("game_id", selectedPollId);
    if (taskErr) throw taskErr;
    const userIds = [...new Set((taskRows || []).map((r) => r.recipient_user_id).filter(Boolean))];
    let profilesMap = new Map();
    if (userIds.length) {
      const { data: prof } = await sb().from("profiles").select("id,username,email").in("id", userIds);
      profilesMap = new Map((prof || []).map((p) => [p.id, p]));
    }
    const rows = (taskRows || []).map((r) => {
      const profile = r.recipient_user_id ? profilesMap.get(r.recipient_user_id) : null;
      return {
        sub_id: r.id,
        task_id: r.id,
        voter_user_id: r.recipient_user_id || null,
        status: r.status || "pending",
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

async function refreshData() {
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
    for (const poll of polls.filter((p) => p.poll_state === "draft")) {
      try {
        const ready = await validatePollReadyToOpen(poll.game_id);
        pollReadyMap.set(poll.game_id, !!ready?.ok);
      } catch {
        pollReadyMap.set(poll.game_id, false);
      }
    }

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
          location.href = `poll_go.html?t=${encodeURIComponent(focusTaskToken)}&lang=${encodeURIComponent(getUiLang() || "pl")}`;
        }
      }
      const url = new URL(location.href);
      url.searchParams.delete("t");
      history.replaceState(null, "", url.toString());
    }
  } catch {
    await alertModal({ text: MSG.loadHubFail() });
  }
}


function buildManualUrl() {
  const url = new URL("manual.html", location.href);
  const ret = `${location.pathname.split("/").pop() || ""}${location.search}${location.hash}`;
  url.searchParams.set("ret", ret);
  return url.toString();
}


function updateBackButtonLabel() {
  if (!btnBack) return;
  const from = new URLSearchParams(location.search).get("from");
  btnBack.textContent = from === "bases" ? t("baseExplorer.backToBases") : t("pollsHubPolls.backToGames");
}

function getBackLink() {
  const from = new URLSearchParams(location.search).get("from");
  if (from === "bases") return "bases.html";
  return "builder.html";
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
  btnShareClose?.addEventListener("click", closeShareModal);
  btnDetailsClose?.addEventListener("click", closeDetailsModal);

  shareOverlay?.addEventListener("click", (e) => { if (e.target === shareOverlay) closeShareModal(); });
  detailsOverlay?.addEventListener("click", (e) => { if (e.target === detailsOverlay) closeDetailsModal(); });

  updateBackButtonLabel();
  btnBack?.addEventListener("click", () => { location.href = getBackLink(); });
  btnManual?.addEventListener("click", () => { location.href = buildManualUrl(); });
  btnGoAlt?.addEventListener("click", () => { location.href = "subscriptions.html?from=polls-hub"; });
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
