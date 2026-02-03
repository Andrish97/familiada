// familiada/js/pages/polls-hub.js
// CENTRUM SONDAŻY (tylko dla zalogowanych)

import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

console.log("[polls_hub] boot script loaded ✅", new Date().toISOString());
window.__POLL_HUB = { loadedAt: Date.now() };

/* ================= DOM ================= */
const $ = (id) => document.getElementById(id);

const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");

// chips
const chipPolls = $("chipPolls");
const chipTasks = $("chipTasks");
const chipSubs = $("chipSubs");
const chipSubsToMe = $("chipSubsToMe");

// lists
const listPolls = $("listPolls");
const listTasks = $("listTasks");
const listSubs = $("listSubs");
const listSubsToMe = $("listSubsToMe");

// empty
const emptyPolls = $("emptyPolls");
const emptyTasks = $("emptyTasks");
const emptySubs = $("emptySubs");
const emptySubsToMe = $("emptySubsToMe");

// refresh
const btnPollsRefresh = $("btnPollsRefresh");
const btnTasksRefresh = $("btnTasksRefresh");
const btnSubsRefresh = $("btnSubsRefresh");
const btnSubsToMeRefresh = $("btnSubsToMeRefresh");

// segs
const pollsActiveBtn = $("pollsActiveBtn");
const pollsArchBtn = $("pollsArchBtn");

const tasksActiveBtn = $("tasksActiveBtn");
const tasksArchBtn = $("tasksArchBtn");

const subsActiveBtn = $("subsActiveBtn");
const subsArchBtn = $("subsArchBtn");

const subsToMeActiveBtn = $("subsToMeActiveBtn");
const subsToMeArchBtn = $("subsToMeArchBtn");

/* ================= State ================= */
let currentUser = null;

const view = {
  polls: "active",
  tasks: "active",
  subs: "active",
  subsToMe: "active",
};

/* ================= Utils ================= */
function esc(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function show(el, on){
  if (!el) return;
  el.style.display = on ? "" : "none";
}

function setChip(el, n){
  if (!el) return;
  const v = Number(n) || 0;
  el.textContent = String(v);
}

function isActiveStatus(s){
  const v = String(s || "").toLowerCase();
  return v === "pending" || v === "opened" || v === "active" || v === "accepted";
}

function isArchiveStatus(s){
  return !isActiveStatus(s);
}

function fmtStatus(s){
  const v = String(s || "").toLowerCase();
  if (!v) return "—";
  return v;
}

function statusBadgeClass(s){
  const v = String(s || "").toLowerCase();
  if (v === "done" || v === "accepted" || v === "active") return "ok";
  if (v === "pending" || v === "opened") return "warn";
  if (v === "declined" || v === "rejected" || v === "cancelled" || v === "removed") return "bad";
  return "dim";
}

function pickTitle(row){
  return (
    row?.name ||
    row?.game_name ||
    row?.title ||
    row?.owner_username ||
    row?.owner ||
    "—"
  );
}

function pickMetaPieces(row){
  const out = [];
  if (row?.poll_type) out.push(`typ: ${row.poll_type}`);
  if (row?.owner_username) out.push(`od: ${row.owner_username}`);
  if (row?.recipient_email) out.push(`do: ${row.recipient_email}`);
  if (row?.created_at) out.push(`utw.: ${String(row.created_at).slice(0,10)}`);
  return out;
}

/* ================= Render row ================= */
function renderRow({
  title,
  status,
  meta = [],
  primaryText = "Otwórz",
  onPrimary = null,
  secondaryText = null,
  onSecondary = null,
} = {}){
  const st = fmtStatus(status);
  const stCls = statusBadgeClass(status);

  const metaHtml = [
    `<span class="badge ${stCls}">status: ${esc(st)}</span>`,
    ...meta.map((m) => `<span class="badge dim">${esc(m)}</span>`),
  ].join(" ");

  const secBtn = secondaryText
    ? `<button class="btn sm" data-sec type="button">${esc(secondaryText)}</button>`
    : "";

  const el = document.createElement("div");
  el.className = "row";
  el.innerHTML = `
    <div class="rowMain">
      <div class="rowTitle">${esc(title || "—")}</div>
      <div class="rowMeta">${metaHtml}</div>
    </div>
    <div class="rowActions">
      ${secBtn}
      <button class="btn sm" data-pri type="button">${esc(primaryText || "Otwórz")}</button>
    </div>
  `;

  const pri = el.querySelector("[data-pri]");
  const sec = el.querySelector("[data-sec]");

  pri?.addEventListener("click", async () => {
    if (typeof onPrimary === "function") await onPrimary();
  });
  sec?.addEventListener("click", async () => {
    if (typeof onSecondary === "function") await onSecondary();
  });

  return el;
}

/* ================= Data loaders (RPC) ================= */
async function rpcList(name, args){
  console.log("[polls_hub] rpc ->", name, args || {});
  const { data, error } = await sb().rpc(name, args || {});
  console.log("[polls_hub] rpc <-", name, { error, data });
  if (error) throw error;
  return Array.isArray(data) ? data : (data ? [data] : []);
}

function renderEmpty(listEl, emptyEl, hasItems){
  if (listEl) listEl.style.opacity = "1";
  show(emptyEl, !hasItems);
}

/* ================= Actions (RPC wrappers) ================= */
async function taskDecline(row){
  // Preferujemy token (bo to jest spójne z poll_go / poll_task_*).
  const token = row?.token;
  const id = row?.id;

  // Najpierw próbujemy z tokenem
  if (token){
    const { error } = await sb().rpc("polls_hub_task_decline", { p_token: token });
    if (!error) return true;
    console.warn("[polls_hub] task_decline (token) failed:", error);
  }

  // Fallback z id (jeśli Twoja funkcja tak działa)
  if (id){
    const { error } = await sb().rpc("polls_hub_task_decline", { p_task_id: id });
    if (!error) return true;
    console.warn("[polls_hub] task_decline (id) failed:", error);
  }

  alert("Nie udało się odrzucić zadania.");
  return false;
}

async function subscriptionCancel(row){
  const id = row?.id;
  const ownerId = row?.owner_id;

  if (id){
    const { error } = await sb().rpc("polls_hub_subscription_cancel", { p_subscription_id: id });
    if (!error) return true;
    console.warn("[polls_hub] subscription_cancel (id) failed:", error);
  }

  if (ownerId){
    const { error } = await sb().rpc("polls_hub_subscription_cancel", { p_owner_id: ownerId });
    if (!error) return true;
    console.warn("[polls_hub] subscription_cancel (owner) failed:", error);
  }

  alert("Nie udało się anulować subskrypcji.");
  return false;
}

async function subscriberRemove(row){
  const id = row?.id;
  const email = row?.subscriber_email || row?.recipient_email;
  const userId = row?.subscriber_user_id || row?.recipient_user_id;

  if (id){
    const { error } = await sb().rpc("polls_hub_subscriber_remove", { p_subscription_id: id });
    if (!error) return true;
    console.warn("[polls_hub] subscriber_remove (id) failed:", error);
  }

  // fallbacki: email / userId
  if (userId){
    const { error } = await sb().rpc("polls_hub_subscriber_remove", { p_subscriber_user_id: userId });
    if (!error) return true;
    console.warn("[polls_hub] subscriber_remove (user) failed:", error);
  }
  if (email){
    const { error } = await sb().rpc("polls_hub_subscriber_remove", { p_subscriber_email: email });
    if (!error) return true;
    console.warn("[polls_hub] subscriber_remove (email) failed:", error);
  }

  alert("Nie udało się usunąć subskrybenta.");
  return false;
}

/* ================= Render: Polls ================= */
async function refreshPolls(){
  const rows = await rpcList("polls_hub_list_open_polls");
  const filtered = rows.filter((r) => {
    // open polls: traktujemy „active” jako po prostu to co RPC zwraca;
    // archiwum to ewentualnie status != active, jeśli masz status.
    const st = r?.status;
    return view.polls === "active" ? isActiveStatus(st || "active") : isArchiveStatus(st || "active");
  });

  if (listPolls) listPolls.innerHTML = "";
  setChip(chipPolls, filtered.length);
  renderEmpty(listPolls, emptyPolls, filtered.length > 0);

  for (const r of filtered){
    const title = pickTitle(r);
    const meta = pickMetaPieces(r);
    const status = r?.status || "active";

    // Klik -> polls.html?id=GAME
    const gameId = r?.game_id || r?.id;
    const el = renderRow({
      title,
      status,
      meta,
      primaryText: "Otwórz",
      onPrimary: async () => {
        if (!gameId) return;
        location.href = `polls.html?id=${encodeURIComponent(gameId)}`;
      },
      secondaryText: null,
    });

    listPolls?.appendChild(el);
  }
}

/* ================= Render: Tasks ================= */
async function refreshTasks(){
  const rows = await rpcList("polls_hub_list_tasks");

  const filtered = rows.filter((r) => {
    const st = r?.status;
    return view.tasks === "active" ? isActiveStatus(st) : isArchiveStatus(st);
  });

  if (listTasks) listTasks.innerHTML = "";
  setChip(chipTasks, filtered.length);
  renderEmpty(listTasks, emptyTasks, filtered.length > 0);

  for (const r of filtered){
    const title = r?.game_name || pickTitle(r);
    const meta = pickMetaPieces(r);
    const status = r?.status;

    const pollType = r?.poll_type;
    const gameId = r?.game_id;
    const shareKey = r?.share_key_poll;
    const token = r?.token;

    const canOpen = !!(pollType && gameId && shareKey);
    const primaryText = canOpen ? "Głosuj" : "Szczegóły";

    const el = renderRow({
      title,
      status,
      meta,
      primaryText,
      onPrimary: async () => {
        if (!canOpen) return;
        const base = pollType === "poll_text" ? "poll-text.html" : "poll-points.html";
        const url = new URL(base, location.href);
        url.searchParams.set("id", gameId);
        url.searchParams.set("key", shareKey);
        if (token) url.searchParams.set("t", token); // Etap 5: DONE po submit
        location.href = url.toString();
      },
      secondaryText: "Odrzuć",
      onSecondary: async () => {
        const ok = confirm("Odrzucić to zadanie?");
        if (!ok) return;
        const did = await taskDecline(r);
        if (did) await refreshTasks();
      },
    });

    listTasks?.appendChild(el);
  }
}

/* ================= Render: My subscriptions ================= */
async function refreshSubs(){
  const rows = await rpcList("polls_hub_list_my_subscriptions");
  const filtered = rows.filter((r) => {
    const st = r?.status;
    return view.subs === "active" ? isActiveStatus(st) : isArchiveStatus(st);
  });

  if (listSubs) listSubs.innerHTML = "";
  setChip(chipSubs, filtered.length);
  renderEmpty(listSubs, emptySubs, filtered.length > 0);

  for (const r of filtered){
    const title =
      r?.owner_username ? `Subskrybujesz: ${r.owner_username}` :
      r?.owner_email ? `Subskrybujesz: ${r.owner_email}` :
      pickTitle(r);

    const meta = pickMetaPieces(r);
    const status = r?.status;

    const el = renderRow({
      title,
      status,
      meta,
      primaryText: "Anuluj",
      onPrimary: async () => {
        const ok = confirm("Anulować subskrypcję?");
        if (!ok) return;
        const did = await subscriptionCancel(r);
        if (did) await refreshSubs();
      },
      secondaryText: null,
    });

    listSubs?.appendChild(el);
  }
}

/* ================= Render: My subscribers ================= */
async function refreshSubsToMe(){
  const rows = await rpcList("polls_hub_list_my_subscribers");
  const filtered = rows.filter((r) => {
    const st = r?.status;
    return view.subsToMe === "active" ? isActiveStatus(st) : isArchiveStatus(st);
  });

  if (listSubsToMe) listSubsToMe.innerHTML = "";
  setChip(chipSubsToMe, filtered.length);
  renderEmpty(listSubsToMe, emptySubsToMe, filtered.length > 0);

  for (const r of filtered){
    const whoLabel =
      r?.subscriber_username ||
      r?.subscriber_email ||
      r?.recipient_email ||
      "—";

    const title = `Subskrybent: ${whoLabel}`;
    const meta = pickMetaPieces(r);
    const status = r?.status;

    const el = renderRow({
      title,
      status,
      meta,
      primaryText: "Usuń",
      onPrimary: async () => {
        const ok = confirm("Usunąć subskrybenta?");
        if (!ok) return;
        const did = await subscriberRemove(r);
        if (did) await refreshSubsToMe();
      },
      secondaryText: null,
    });

    listSubsToMe?.appendChild(el);
  }
}

/* ================= Seg toggles ================= */
function setSeg(aBtn, bBtn, mode){
  if (aBtn) aBtn.classList.toggle("on", mode === "active");
  if (bBtn) bBtn.classList.toggle("on", mode === "archive");
}

function wireSeg(){
  pollsActiveBtn?.addEventListener("click", async () => {
    view.polls = "active";
    setSeg(pollsActiveBtn, pollsArchBtn, "active");
    await refreshPolls();
  });
  pollsArchBtn?.addEventListener("click", async () => {
    view.polls = "archive";
    setSeg(pollsActiveBtn, pollsArchBtn, "archive");
    await refreshPolls();
  });

  tasksActiveBtn?.addEventListener("click", async () => {
    view.tasks = "active";
    setSeg(tasksActiveBtn, tasksArchBtn, "active");
    await refreshTasks();
  });
  tasksArchBtn?.addEventListener("click", async () => {
    view.tasks = "archive";
    setSeg(tasksActiveBtn, tasksArchBtn, "archive");
    await refreshTasks();
  });

  subsActiveBtn?.addEventListener("click", async () => {
    view.subs = "active";
    setSeg(subsActiveBtn, subsArchBtn, "active");
    await refreshSubs();
  });
  subsArchBtn?.addEventListener("click", async () => {
    view.subs = "archive";
    setSeg(subsActiveBtn, subsArchBtn, "archive");
    await refreshSubs();
  });

  subsToMeActiveBtn?.addEventListener("click", async () => {
    view.subsToMe = "active";
    setSeg(subsToMeActiveBtn, subsToMeArchBtn, "active");
    await refreshSubsToMe();
  });
  subsToMeArchBtn?.addEventListener("click", async () => {
    view.subsToMe = "archive";
    setSeg(subsToMeActiveBtn, subsToMeArchBtn, "archive");
    await refreshSubsToMe();
  });
}

/* ================= Refresh buttons ================= */
function wireRefresh(){
  btnPollsRefresh?.addEventListener("click", refreshPolls);
  btnTasksRefresh?.addEventListener("click", refreshTasks);
  btnSubsRefresh?.addEventListener("click", refreshSubs);
  btnSubsToMeRefresh?.addEventListener("click", refreshSubsToMe);
}

/* ================= Topbar ================= */
btnBack?.addEventListener("click", () => {
  location.href = "builder.html";
});

btnLogout?.addEventListener("click", async () => {
  await signOut();
  location.href = "index.html";
});

/* ================= Boot ================= */
(async function boot(){
  currentUser = await requireAuth("index.html");
  if (who) who.textContent =
    currentUser?.user_metadata?.username ||
    currentUser?.username ||
    currentUser?.email ||
    "—";

  wireSeg();
  wireRefresh();

  await Promise.all([
    refreshPolls(),
    refreshTasks(),
    refreshSubs(),
    refreshSubsToMe(),
  ]);
  console.log("[polls_hub] currentUser:", currentUser);
  console.log("[polls_hub] DOM:", {
  listPolls: !!listPolls, listTasks: !!listTasks, listSubs: !!listSubs, listSubsToMe: !!listSubsToMe
});
})();
