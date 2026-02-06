// js/pages/polls-hub.js — HUB od zera (UI jak builder) + RPC

import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

const $ = (id) => document.getElementById(id);

// Topbar
const who = $("who");
const btnLogout = $("btnLogout");
const btnBack = $("btnBack");

// Lists
const listMyPolls = $("listMyPolls");
const listTasks = $("listTasks");
const listMySubscribers = $("listMySubscribers");
const listMySubscriptions = $("listMySubscriptions");

// Filters
const selPollSort = $("selPollSort");
const chkPollArchive = $("chkPollArchive");
const selTaskSort = $("selTaskSort");
const chkTaskArchive = $("chkTaskArchive");
const selMySubsSort = $("selMySubsSort");
const selTheirSubsSort = $("selTheirSubsSort");

const hubMsg = $("hubMsg");

// Actions
const btnAddSubscriber = $("btnAddSubscriber");
const btnShare = $("btnShare");
const btnDetails = $("btnDetails");

// Modal add subscriber
const ovAddSubscriber = $("ovAddSubscriber");
const inpSubscriber = $("inpSubscriber");
const btnSendInvite = $("btnSendInvite");
const btnCloseAddSub = $("btnCloseAddSub");
const addSubMsg = $("addSubMsg");

let state = {
  polls: [],
  tasks: [],
  mySubscribers: [],
  mySubscriptions: [],
};

// ---------- helpers ----------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setMsg(text) {
  hubMsg.textContent = text || "—";
}

function openOverlay(el) { el.style.display = ""; }
function closeOverlay(el) { el.style.display = "none"; }

function tile(html, cls) {
  const d = document.createElement("div");
  d.className = `tile ${cls || ""}`;
  d.innerHTML = html;
  return d;
}

function tileBtn(icon, title) {
  return `<button class="tileBtn" type="button" title="${escapeHtml(title)}">${icon}</button>`;
}

function pollTypeLabel(t) {
  if (t === "poll_text") return "poll_text";
  if (t === "poll_points") return "poll_points";
  return String(t || "—");
}

function pollOpenUrl(row) {
  // double-click ma iść do "polls" (wyniki/close) — zgodnie z Twoimi wytycznymi
  // na razie: otwieramy polls.html?id=<game_id>
  return `polls.html?id=${encodeURIComponent(row.game_id)}`;
}

function taskGoUrl(row) {
  // RPC już zwraca go_url w Twoich funkcjach
  return row.go_url || `poll_go.html?t=${encodeURIComponent(row.token || "")}`;
}

function statusClassForPoll(row) {
  // Minimalna logika bez “nadmiarowych szczegółów”.
  // Dopniemy “draft red vs gray” gdy dodasz can_open w RPC (albo osobne RPC).
  if (row.poll_state === "closed") return "status-closed";
  if (row.poll_state === "draft") return "status-draft-bad";

  // open:
  const tasksActive = Number(row.tasks_active || 0);
  const tasksDone = Number(row.tasks_done || 0);
  const anonVotes = Number(row.anon_votes || 0);

  if (tasksActive === 0 && anonVotes === 0) return "status-open-empty";
  if ((tasksActive > 0 && tasksDone < tasksActive) || (anonVotes > 0 && anonVotes < 10)) return "status-open-running";
  return "status-open-done";
}

function statusClassForTask(row) {
  return row.status === "done" ? "status-task-done" : "status-task-open";
}

function statusClassForSub(status) {
  if (status === "active") return "status-sub-active";
  if (status === "declined" || status === "cancelled") return "status-sub-declined";
  return "status-sub-pending";
}

function sortBy(mode, a, b, getName) {
  if (mode === "new") return (new Date(b.created_at) - new Date(a.created_at));
  if (mode === "old") return (new Date(a.created_at) - new Date(b.created_at));
  if (mode === "az") return String(getName(a)).localeCompare(String(getName(b)), "pl");
  if (mode === "za") return String(getName(b)).localeCompare(String(getName(a)), "pl");
  return 0;
}

// ---------- RPC wrapper ----------
async function rpcOne(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    console.error("[polls_hub] rpc failed:", name, error);
    throw new Error(`${name}: ${error.message || error.code || "RPC error"}`);
  }
  return data;
}

// ---------- render ----------
function renderPolls() {
  listMyPolls.innerHTML = "";

  const mode = selPollSort.value;
  const showArchive = !!chkPollArchive.checked;

  // Archiwalne: zamknięte > 5 dni (na razie prosto: state=closed i created_at older)
  const now = Date.now();
  const FIVE_DAYS = 5 * 24 * 3600 * 1000;

  let rows = [...state.polls];
  rows.sort((a, b) => sortBy(mode, a, b, (x) => x.name));

  rows = rows.filter((r) => {
    const isClosed = r.poll_state === "closed";
    const age = now - new Date(r.created_at).getTime();
    const isArchive = isClosed && age > FIVE_DAYS;
    return showArchive ? isArchive : !isArchive;
  });

  if (!rows.length) {
    listMyPolls.appendChild(tile(`
      <div class="tileMain">
        <span class="tileTitle">Brak sondaży</span>
        <span class="tileType">—</span>
      </div>
    `, "status-draft-bad"));
    return;
  }

  for (const r of rows) {
    const cls = statusClassForPoll(r);
    const shareMode = (r.poll_share_mode || "anon");
    const badge = shareMode === "mixed" ? "A+S" : (shareMode === "subs" ? "S" : "A");

    const el = tile(`
      <div class="tileMain">
        <span class="tileTitle">${escapeHtml(r.name)}</span>
        <span class="tileType">${escapeHtml(pollTypeLabel(r.poll_type))}</span>
      </div>
      <div class="tileMeta">
        <span class="tileType" title="Tryb">${escapeHtml(badge)}</span>
      </div>
    `, cls);

    // dblclick -> polls (wyniki/close)
    el.ondblclick = () => {
      if (r.poll_state === "draft") return; // szkice niegotowe blokujemy (na razie wszystkie draft)
      location.href = pollOpenUrl(r);
    };

    listMyPolls.appendChild(el);
  }
}

function renderTasks() {
  listTasks.innerHTML = "";
  const mode = selTaskSort.value;
  const showArchive = !!chkTaskArchive.checked;
  const now = Date.now();
  const FIVE_DAYS = 5 * 24 * 3600 * 1000;

  let rows = [...state.tasks];
  rows.sort((a, b) => sortBy(mode, a, b, (x) => x.game_name || ""));

  rows = rows.filter((r) => {
    const isDone = r.status === "done";
    const age = now - new Date(r.created_at).getTime();
    const isArchive = isDone && age > FIVE_DAYS;
    return showArchive ? isArchive : !isArchive;
  });

  if (!rows.length) {
    listTasks.appendChild(tile(`
      <div class="tileMain">
        <span class="tileTitle">Brak zadań</span>
        <span class="tileType">—</span>
      </div>
    `, "status-task-done"));
    return;
  }

  for (const r of rows) {
    const cls = statusClassForTask(r);

    const el = tile(`
      <div class="tileMain">
        <span class="tileTitle">${escapeHtml(r.game_name || "Sondaż")}</span>
        <span class="tileType">${escapeHtml(r.poll_type || "zadanie")}</span>
      </div>
      <div class="tileMeta">
        ${r.status !== "done" ? tileBtn("✖", "Odrzuć") : ""}
      </div>
    `, cls);

    el.ondblclick = () => { location.href = taskGoUrl(r); };

    // reject
    const btn = el.querySelector(".tileBtn");
    if (btn) {
      btn.onclick = async (e) => {
        e.stopPropagation();
        try {
          await rpcOne("polls_hub_task_decline", { p_task_id: r.task_id });
          await refreshAll();
        } catch (err) {
          setMsg(String(err.message || err));
        }
      };
    }

    listTasks.appendChild(el);
  }
}

function renderMySubscribers() {
  listMySubscribers.innerHTML = "";

  const mode = selMySubsSort.value;
  let rows = [...state.mySubscribers];
  rows.sort((a, b) => sortBy(mode, a, b, (x) => x.subscriber_label || ""));

  if (!rows.length) {
    listMySubscribers.appendChild(tile(`
      <div class="tileMain">
        <span class="tileTitle">Brak subskrybentów</span>
      </div>
    `, "status-sub-pending"));
    return;
  }

  for (const r of rows) {
    const cls = statusClassForSub(r.status);

    const el = tile(`
      <div class="tileMain">
        <span class="tileTitle">${escapeHtml(r.subscriber_label || "—")}</span>
      </div>
      <div class="tileMeta">
        ${r.status === "pending" ? tileBtn("↻", "Wyślij ponownie (wkrótce)") : ""}
        ${tileBtn("✖", r.status === "active" ? "Usuń subskrybenta" : "Anuluj zaproszenie")}
      </div>
    `, cls);

    const btns = el.querySelectorAll(".tileBtn");
    // na razie obsługujemy tylko X (remove/cancel). Resend dopniemy do maili po ustaleniu RPC.
    const btnX = btns[btns.length - 1];
    btnX.onclick = async (e) => {
      e.stopPropagation();
      try {
        await rpcOne("polls_hub_subscriber_remove", { p_sub_id: r.sub_id });
        await refreshAll();
      } catch (err) {
        setMsg(String(err.message || err));
      }
    };

    listMySubscribers.appendChild(el);
  }
}

function renderMySubscriptions() {
  listMySubscriptions.innerHTML = "";

  const mode = selTheirSubsSort.value;
  let rows = [...state.mySubscriptions];
  rows.sort((a, b) => sortBy(mode, a, b, (x) => x.owner_label || ""));

  if (!rows.length) {
    listMySubscriptions.appendChild(tile(`
      <div class="tileMain">
        <span class="tileTitle">Brak subskrypcji</span>
      </div>
    `, "status-sub-pending"));
    return;
  }

  for (const r of rows) {
    const cls = statusClassForSub(r.status);

    const el = tile(`
      <div class="tileMain">
        <span class="tileTitle">${escapeHtml(r.owner_label || "—")}</span>
      </div>
      <div class="tileMeta">
        ${r.status === "pending" ? tileBtn("✔", "Akceptuj") : ""}
        ${tileBtn("✖", r.status === "active" ? "Anuluj subskrypcję" : "Odrzuć")}
      </div>
    `, cls);

    const btns = el.querySelectorAll(".tileBtn");
    let idx = 0;

    if (r.status === "pending") {
      const btnAccept = btns[idx++];
      btnAccept.onclick = async (e) => {
        e.stopPropagation();
        try {
          // inbound accept (z Twojej listy RPC): sub_invite_accept(token)
          await rpcOne("sub_invite_accept", { p_token: r.token || null, p_sub_id: r.sub_id || null });
          await refreshAll();
        } catch (err) {
          setMsg(String(err.message || err));
        }
      };
    }

    const btnX = btns[idx];
    btnX.onclick = async (e) => {
      e.stopPropagation();
      try {
        // cancel subscription (RPC masz): polls_hub_subscription_cancel(sub_id)
        await rpcOne("polls_hub_subscription_cancel", { p_sub_id: r.sub_id });
        await refreshAll();
      } catch (err) {
        setMsg(String(err.message || err));
      }
    };

    listMySubscriptions.appendChild(el);
  }
}

function renderAll() {
  renderPolls();
  renderTasks();
  renderMySubscribers();
  renderMySubscriptions();
}

// ---------- data ----------
async function refreshAll() {
  setMsg("Ładowanie…");
  const [polls, tasks, mySubs, theirSubs] = await Promise.all([
    rpcOne("polls_hub_list_polls"),
    rpcOne("polls_hub_list_tasks"),
    rpcOne("polls_hub_list_my_subscribers"),
    rpcOne("polls_hub_list_my_subscriptions"),
  ]);

  state.polls = Array.isArray(polls) ? polls : [];
  state.tasks = Array.isArray(tasks) ? tasks : [];
  state.mySubscribers = Array.isArray(mySubs) ? mySubs : [];
  state.mySubscriptions = Array.isArray(theirSubs) ? theirSubs : [];

  renderAll();
  setMsg("OK");
}

// ---------- boot ----------
async function refreshWho() {
  const { data } = await sb.auth.getUser();
  const u = data?.user;
  if (!u) {
    who.textContent = "—";
    return;
  }

  // w Twoich założeniach: w auth bar pokazujemy username (profiles.username)
  const { data: prof } = await sb.from("profiles").select("username,email").eq("id", u.id).maybeSingle();
  who.textContent = prof?.username || prof?.email || u.email || "—";
}

function wire() {
  btnLogout.onclick = () => signOut();
  btnBack.onclick = () => (location.href = "builder.html");

  // filters re-render
  selPollSort.onchange = renderPolls;
  chkPollArchive.onchange = renderPolls;
  selTaskSort.onchange = renderTasks;
  chkTaskArchive.onchange = renderTasks;
  selMySubsSort.onchange = renderMySubscribers;
  selTheirSubsSort.onchange = renderMySubscriptions;

  // modale docelowe: tu tylko placeholder — żeby UI nie był martwy
  btnShare.onclick = () => setMsg("Udostępnianie: modal dopinamy w następnym kroku (tryb A/S/M + lista).");
  btnDetails.onclick = () => setMsg("Szczegóły: modal dopinamy w następnym kroku (głosujący + anon count).");

  // add subscriber modal
  btnAddSubscriber.onclick = () => {
    addSubMsg.textContent = "—";
    inpSubscriber.value = "";
    openOverlay(ovAddSubscriber);
    setTimeout(() => inpSubscriber.focus(), 30);
  };

  btnCloseAddSub.onclick = () => closeOverlay(ovAddSubscriber);
  ovAddSubscriber.addEventListener("click", (e) => {
    if (e.target === ovAddSubscriber) closeOverlay(ovAddSubscriber);
  });

  btnSendInvite.onclick = async () => {
    const val = String(inpSubscriber.value || "").trim();
    if (!val) {
      addSubMsg.textContent = "Podaj e-mail albo nazwę użytkownika.";
      return;
    }

    addSubMsg.textContent = "Wysyłanie…";

    try {
      // Twoje RPC (z logów): polls_hub_subscription_invite_a
      // UWAGA: nazwy parametrów mogą być inne — jeśli dostaniesz błąd “missing argument”,
      // podeślij definicję RPC i dopasuję 1:1.
      await rpcOne("polls_hub_subscription_invite_a", { p_identifier: val });
      addSubMsg.textContent = "Zaproszenie wysłane.";
      await refreshAll();
    } catch (err) {
      addSubMsg.textContent = String(err.message || err);
    }
  };
}

async function boot() {
  await requireAuth();
  wire();
  await refreshWho();
  await refreshAll();
}

boot().catch((e) => {
  console.error(e);
  setMsg(String(e?.message || e));
});
