// js/pages/polls-hub.js — HUB (styl builder) + kompatybilne auth (requireAuth)

import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

const $ = (id) => document.getElementById(id);

// bar
const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");
const hubMsg = $("hubMsg");

// lists
const listMyPolls = $("listMyPolls");
const listTasks = $("listTasks");
const listMySubscribers = $("listMySubscribers");
const listMySubscriptions = $("listMySubscriptions");

// filters
const selPollSort = $("selPollSort");
const chkPollArchive = $("chkPollArchive");
const selTaskSort = $("selTaskSort");
const chkTaskArchive = $("chkTaskArchive");
const selMySubsSort = $("selMySubsSort");
const selTheirSubsSort = $("selTheirSubsSort");

// actions
const btnAddSubscriber = $("btnAddSubscriber");
const btnShare = $("btnShare");
const btnDetails = $("btnDetails");

// modal add subscriber
const ovAddSubscriber = $("ovAddSubscriber");
const inpSubscriber = $("inpSubscriber");
const btnSendInvite = $("btnSendInvite");
const btnCloseAddSub = $("btnCloseAddSub");
const addSubMsg = $("addSubMsg");

let currentUser = null;

const state = {
  polls: [],
  tasks: [],
  mySubscribers: [],
  mySubscriptions: [],
};

function esc(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function setMsg(t){ hubMsg.textContent = t || "—"; }

function openOverlay(el){ el.style.display = ""; }
function closeOverlay(el){ el.style.display = "none"; }

function tileBtn(icon, title){
  return `<button class="tileBtn" type="button" title="${esc(title)}">${icon}</button>`;
}

function mkTile(cls, title, type, rightHtml = ""){
  const el = document.createElement("div");
  el.className = `tile ${cls}`;
  el.innerHTML = `
    <div class="tileMain">
      <span class="tileTitle">${esc(title)}</span>
      ${type ? `<span class="tileType">${esc(type)}</span>` : ``}
    </div>
    <div class="tileMeta">${rightHtml}</div>
  `;
  return el;
}

async function rpcOne(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message || error.code || "RPC error"}`);
  return data;
}

/* ===== minimalne sortowanie ===== */
function sortRows(mode, rows, getName){
  const r = [...rows];
  if (mode === "new") r.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  else if (mode === "old") r.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  else if (mode === "az") r.sort((a,b)=>String(getName(a)).localeCompare(String(getName(b)), "pl"));
  else if (mode === "za") r.sort((a,b)=>String(getName(b)).localeCompare(String(getName(a)), "pl"));
  return r;
}

/* ===== statusy (prosto, bez “nadmiarowych szczegółów”) ===== */
function pollStatusClass(r){
  if (r.poll_state === "closed") return "status-closed";
  if (r.poll_state === "draft") return "status-draft-bad";
  // open:
  const a = Number(r.tasks_active || 0);
  const d = Number(r.tasks_done || 0);
  const v = Number(r.anon_votes || 0);
  if (a === 0 && v === 0) return "status-open-empty";
  if ((a > 0 && d < a) || (v > 0 && v < 10)) return "status-open-running";
  return "status-open-done";
}

function taskStatusClass(r){
  return r.status === "done" ? "status-task-done" : "status-task-open";
}

function subStatusClass(status){
  if (status === "active") return "status-sub-active";
  if (status === "declined" || status === "cancelled") return "status-sub-declined";
  return "status-sub-pending";
}

/* ===== render ===== */
function renderPolls(){
  listMyPolls.innerHTML = "";
  const showArchive = chkPollArchive.checked;
  const now = Date.now();
  const FIVE = 5*24*3600*1000;

  let rows = sortRows(selPollSort.value, state.polls, x=>x.name);

  rows = rows.filter(r=>{
    const isClosed = r.poll_state === "closed";
    const age = now - new Date(r.created_at).getTime();
    const arch = isClosed && age > FIVE;
    return showArchive ? arch : !arch;
  });

  if (!rows.length){
    listMyPolls.appendChild(mkTile("status-draft-bad","Brak sondaży","—"));
    return;
  }

  for (const r of rows){
    const el = mkTile(
      pollStatusClass(r),
      r.name,
      r.poll_type,
      `<span class="tileType">${esc((r.poll_share_mode||"A").toUpperCase())}</span>`
    );

    // dblclick -> polls (wyniki/close)
    el.ondblclick = () => {
      if (r.poll_state === "draft") return;
      location.href = `polls.html?id=${encodeURIComponent(r.game_id)}`;
    };

    listMyPolls.appendChild(el);
  }
}

function renderTasks(){
  listTasks.innerHTML = "";
  const showArchive = chkTaskArchive.checked;
  const now = Date.now();
  const FIVE = 5*24*3600*1000;

  let rows = sortRows(selTaskSort.value, state.tasks, x=>x.game_name || "");

  rows = rows.filter(r=>{
    const done = r.status === "done";
    const age = now - new Date(r.created_at).getTime();
    const arch = done && age > FIVE;
    return showArchive ? arch : !arch;
  });

  if (!rows.length){
    listTasks.appendChild(mkTile("status-task-done","Brak zadań","—"));
    return;
  }

  for (const r of rows){
    const right = (r.status !== "done") ? tileBtn("✖","Odrzuć") : "";
    const el = mkTile(taskStatusClass(r), r.game_name || "Sondaż", r.poll_type || "zadanie", right);

    el.ondblclick = () => {
      if (r.go_url) location.href = r.go_url;
      else location.href = `poll_go.html?t=${encodeURIComponent(r.token || "")}`;
    };

    const btn = el.querySelector(".tileBtn");
    if (btn){
      btn.onclick = async (e)=>{
        e.stopPropagation();
        try{
          await rpcOne("polls_hub_task_decline", { p_task_id: r.task_id });
          await refreshAll();
        }catch(err){
          setMsg(String(err.message||err));
        }
      };
    }

    listTasks.appendChild(el);
  }
}

function renderMySubscribers(){
  listMySubscribers.innerHTML = "";
  let rows = sortRows(selMySubsSort.value, state.mySubscribers, x=>x.subscriber_label || "");

  if (!rows.length){
    listMySubscribers.appendChild(mkTile("status-sub-pending","Brak subskrybentów","—"));
    return;
  }

  for (const r of rows){
    const right = `${r.status==="pending" ? tileBtn("↻","Wyślij ponownie (później)") : ""}${tileBtn("✖", r.status==="active"?"Usuń":"Anuluj")}`;
    const el = mkTile(subStatusClass(r.status), r.subscriber_label || "—", "", right);

    const btns = el.querySelectorAll(".tileBtn");
    const btnX = btns[btns.length-1];
    btnX.onclick = async (e)=>{
      e.stopPropagation();
      try{
        await rpcOne("polls_hub_subscriber_remove", { p_sub_id: r.sub_id });
        await refreshAll();
      }catch(err){
        setMsg(String(err.message||err));
      }
    };

    listMySubscribers.appendChild(el);
  }
}

function renderMySubscriptions(){
  listMySubscriptions.innerHTML = "";
  let rows = sortRows(selTheirSubsSort.value, state.mySubscriptions, x=>x.owner_label || "");

  if (!rows.length){
    listMySubscriptions.appendChild(mkTile("status-sub-pending","Brak subskrypcji","—"));
    return;
  }

  for (const r of rows){
    const right = `${r.status==="pending" ? tileBtn("✔","Akceptuj") : ""}${tileBtn("✖", r.status==="active"?"Anuluj":"Odrzuć")}`;
    const el = mkTile(subStatusClass(r.status), r.owner_label || "—", "", right);

    const btns = el.querySelectorAll(".tileBtn");
    let i = 0;

    if (r.status === "pending"){
      const btnOk = btns[i++];
      btnOk.onclick = async (e)=>{
        e.stopPropagation();
        try{
          await rpcOne("sub_invite_accept", { p_sub_id: r.sub_id });
          await refreshAll();
        }catch(err){
          setMsg(String(err.message||err));
        }
      };
    }

    const btnX = btns[i];
    btnX.onclick = async (e)=>{
      e.stopPropagation();
      try{
        await rpcOne("polls_hub_subscription_cancel", { p_sub_id: r.sub_id });
        await refreshAll();
      }catch(err){
        setMsg(String(err.message||err));
      }
    };

    listMySubscriptions.appendChild(el);
  }
}

function renderAll(){
  renderPolls();
  renderTasks();
  renderMySubscribers();
  renderMySubscriptions();
}

/* ===== data ===== */
async function refreshAll(){
  setMsg("Ładowanie…");
  try{
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
  }catch(err){
    console.error(err);
    setMsg(String(err.message||err));
  }
}

/* ===== boot ===== */
function wire(){
  btnLogout.onclick = () => signOut();
  btnBack.onclick = () => (location.href = "builder.html");

  selPollSort.onchange = renderPolls;
  chkPollArchive.onchange = renderPolls;
  selTaskSort.onchange = renderTasks;
  chkTaskArchive.onchange = renderTasks;
  selMySubsSort.onchange = renderMySubscribers;
  selTheirSubsSort.onchange = renderMySubscriptions;

  btnShare.onclick = () => setMsg("Udostępnianie: modal dopinamy jako następny etap (A / S / A+S + checklista).");
  btnDetails.onclick = () => setMsg("Szczegóły: modal dopinamy jako następny etap (głosujący + anon count + usuń głos).");

  btnAddSubscriber.onclick = () => {
    addSubMsg.textContent = "—";
    inpSubscriber.value = "";
    openOverlay(ovAddSubscriber);
    setTimeout(()=>inpSubscriber.focus(), 30);
  };

  btnCloseAddSub.onclick = () => closeOverlay(ovAddSubscriber);
  ovAddSubscriber.addEventListener("click", (e)=>{ if (e.target === ovAddSubscriber) closeOverlay(ovAddSubscriber); });

  btnSendInvite.onclick = async ()=>{
    const val = String(inpSubscriber.value||"").trim();
    if (!val){ addSubMsg.textContent = "Podaj e-mail lub username."; return; }

    addSubMsg.textContent = "Wysyłanie…";
    try{
      // jeśli Twoje RPC ma inne argumenty, podeślij definicję – dopasuję 1:1
      await rpcOne("polls_hub_subscription_invite_a", { p_identifier: val });
      addSubMsg.textContent = "Zaproszenie wysłane.";
      await refreshAll();
    }catch(err){
      addSubMsg.textContent = String(err.message||err);
    }
  };
}

async function boot(){
  // klucz: requireAuth zwraca usera i u Ciebie działa — nie dotykamy sb.auth
  currentUser = await requireAuth();

  // pokaż username zamiast maila
  const { data: prof } = await sb
    .from("profiles")
    .select("username,email")
    .eq("id", currentUser.id)
    .maybeSingle();

  who.textContent = prof?.username || prof?.email || currentUser.email || "—";

  wire();
  await refreshAll();
}

boot().catch((e)=>{
  console.error(e);
  setMsg(String(e?.message || e));
});
