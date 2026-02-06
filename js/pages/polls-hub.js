// js/pages/polls-hub.js — Centrum sondaży (pełny rewrite)

import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { validatePollReadyToOpen } from "../core/game-validate.js";

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
const pollSelectionHint = $("pollSelectionHint");

// modal add subscriber
const ovAddSubscriber = $("ovAddSubscriber");
const inpSubscriber = $("inpSubscriber");
const btnSendInvite = $("btnSendInvite");
const btnCloseAddSub = $("btnCloseAddSub");
const addSubMsg = $("addSubMsg");

// modal share
const ovShare = $("ovShare");
const sharePollName = $("sharePollName");
const shareLink = $("shareLink");
const shareLinkMixed = $("shareLinkMixed");
const btnCopyLink = $("btnCopyLink");
const btnOpenLink = $("btnOpenLink");
const btnOpenQr = $("btnOpenQr");
const btnOpenDisplay = $("btnOpenDisplay");
const shareMsg = $("shareMsg");
const btnCloseShare = $("btnCloseShare");
const btnApplyShare = $("btnApplyShare");
const shareTabs = Array.from(document.querySelectorAll(".hubTab"));
const sharePanels = Array.from(document.querySelectorAll(".hubTabBody"));
const shareSubsList = $("shareSubsList");
const shareSubsListMixed = $("shareSubsListMixed");
const subsSelectionMeta = $("subsSelectionMeta");
const subsSelectionMetaMixed = $("subsSelectionMetaMixed");

// modal details
const ovDetails = $("ovDetails");
const detailsPollName = $("detailsPollName");
const detailsVotesList = $("detailsVotesList");
const detailsAnonCount = $("detailsAnonCount");
const detailsMsg = $("detailsMsg");
const btnCloseDetails = $("btnCloseDetails");

let currentUser = null;

const state = {
  polls: [],
  tasks: [],
  mySubscribers: [],
  mySubscriptions: [],
  pollReady: new Map(),
  selectedPollId: null,
  shareMode: "anon",
  shareSelections: new Map(),
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
function setModalMsg(el, t){ if (el) el.textContent = t || "—"; }

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
  const { data, error } = await sb().rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message || error.code || "RPC error"}`);
  return data;
}

/* ===== helpers ===== */
function sortRows(mode, rows, getName){
  const r = [...rows];
  if (mode === "new") r.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  else if (mode === "old") r.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  else if (mode === "az") r.sort((a,b)=>String(getName(a)).localeCompare(String(getName(b)), "pl"));
  else if (mode === "za") r.sort((a,b)=>String(getName(b)).localeCompare(String(getName(a)), "pl"));
  return r;
}

function pollShareLabel(mode){
  const v = String(mode || "").toLowerCase();
  if (v === "subs") return "S";
  if (v === "mixed") return "M";
  return "A";
}

function pollStatusClass(r){
  if (r.poll_state === "closed") return "status-closed";
  if (r.poll_state === "draft") {
    return state.pollReady.get(r.game_id) ? "status-draft-good" : "status-draft-bad";
  }
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

function getSelectedPoll(){
  return state.polls.find((p)=>p.game_id === state.selectedPollId) || null;
}

function getPollLink(poll){
  if (!poll?.game_id || !poll?.share_key_poll) return "";
  const base =
    poll.poll_type === "poll_text"
      ? new URL("poll-text.html", location.href)
      : new URL("poll-points.html", location.href);

  base.searchParams.set("id", poll.game_id);
  base.searchParams.set("key", poll.share_key_poll);
  return base.toString();
}

function updateSelectionUI(){
  const poll = getSelectedPoll();
  const hasSelection = !!poll;
  btnShare.disabled = !hasSelection;
  btnDetails.disabled = !hasSelection;
  pollSelectionHint.textContent = hasSelection
    ? `Wybrano: ${poll.name || "—"}`
    : "Wybierz sondaż z listy.";
}

function setSelectedPoll(id){
  state.selectedPollId = id;
  updateSelectionUI();
  renderPolls();
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
      `<span class="tileType">${esc(pollShareLabel(r.poll_share_mode))}</span>`
    );

    if (r.game_id === state.selectedPollId) {
      el.classList.add("is-selected");
    }

    el.onclick = () => setSelectedPoll(r.game_id);
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
    const right = `${r.status==="pending" ? tileBtn("↻","Wyślij ponownie") : ""}${tileBtn("✖", r.status==="active"?"Usuń":"Anuluj")}`;
    const el = mkTile(subStatusClass(r.status), r.subscriber_label || "—", "", right);

    const btns = el.querySelectorAll(".tileBtn");
    let i = 0;
    if (r.status === "pending") {
      const btnResend = btns[i++];
      btnResend.onclick = async (e)=>{
        e.stopPropagation();
        try{
          await rpcOne("polls_hub_subscriber_resend", { p_id: r.sub_id });
          await refreshAll();
        }catch(err){
          setMsg(String(err.message||err));
        }
      };
    }
    const btnX = btns[btns.length-1];
    btnX.onclick = async (e)=>{
      e.stopPropagation();
      try{
        await rpcOne("polls_hub_subscriber_remove", { p_id: r.sub_id });
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
          await rpcOne("polls_hub_subscription_accept", { p_id: r.sub_id });
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
        await rpcOne("polls_hub_subscription_cancel", { p_id: r.sub_id });
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
  updateSelectionUI();
}

/* ===== share modal ===== */
function setShareMode(mode){
  state.shareMode = mode;
  shareTabs.forEach((tab)=>tab.classList.toggle("active", tab.dataset.mode === mode));
  sharePanels.forEach((panel)=>panel.classList.toggle("active", panel.dataset.panel === mode));
}

function getShareSelection(pollId){
  if (!state.shareSelections.has(pollId)) {
    state.shareSelections.set(pollId, new Set());
  }
  return state.shareSelections.get(pollId);
}

function renderShareSubsLists(){
  const poll = getSelectedPoll();
  const pollId = poll?.game_id;
  if (!pollId) return;
  const selected = getShareSelection(pollId);

  const rows = state.mySubscribers.filter((s)=>s.status === "active");
  const buildItem = (s) => {
    const el = document.createElement("div");
    el.className = "hubSubsItem";
    el.innerHTML = `
      <label>
        <input type="checkbox" data-sub-id="${esc(s.sub_id)}">
        <span class="hubSubsName">${esc(s.subscriber_label || "—")}</span>
      </label>
      <span class="hubSubsStatus">${esc(s.status)}</span>
    `;
    const checkbox = el.querySelector("input");
    checkbox.checked = selected.has(s.sub_id);
    checkbox.addEventListener("change", ()=>{
      if (checkbox.checked) selected.add(s.sub_id);
      else selected.delete(s.sub_id);
      updateShareSelectionMeta();
      syncShareSelections();
    });
    return el;
  };

  shareSubsList.innerHTML = "";
  shareSubsListMixed.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "hubSubsItem";
    empty.textContent = "Brak aktywnych subskrybentów.";
    shareSubsList.appendChild(empty.cloneNode(true));
    shareSubsListMixed.appendChild(empty);
    updateShareSelectionMeta();
    return;
  }

  for (const r of rows) {
    shareSubsList.appendChild(buildItem(r));
    shareSubsListMixed.appendChild(buildItem(r));
  }

  updateShareSelectionMeta();
}

function updateShareSelectionMeta(){
  const poll = getSelectedPoll();
  const pollId = poll?.game_id;
  if (!pollId) return;
  const count = getShareSelection(pollId).size;
  subsSelectionMeta.textContent = `${count} zaznaczonych`;
  subsSelectionMetaMixed.textContent = `${count} zaznaczonych`;
}

function syncShareSelections(){
  const poll = getSelectedPoll();
  const pollId = poll?.game_id;
  if (!pollId) return;
  const selected = getShareSelection(pollId);
  const syncList = (list) => {
    list.querySelectorAll("input[type='checkbox']").forEach((box)=>{
      const id = box.dataset.subId;
      box.checked = selected.has(id);
    });
  };
  syncList(shareSubsList);
  syncList(shareSubsListMixed);
}

function openShareModal(){
  const poll = getSelectedPoll();
  if (!poll) return;
  sharePollName.textContent = poll.name || "—";
  const link = getPollLink(poll);
  shareLink.value = link || "Brak linku";
  shareLinkMixed.value = link || "Brak linku";
  setShareMode(poll.poll_share_mode || "anon");
  setModalMsg(shareMsg, "—");
  renderShareSubsLists();
  openOverlay(ovShare);
}

async function applyShare(){
  const poll = getSelectedPoll();
  if (!poll) return;
  setModalMsg(shareMsg, "Zapisywanie…");

  const selected = Array.from(getShareSelection(poll.game_id));
  const mode = state.shareMode;
  const subIds = mode === "anon" ? [] : selected;

  try{
    await rpcOne("polls_hub_share_poll", {
      p_game_id: poll.game_id,
      p_mode: mode,
      p_sub_ids: subIds,
    });
    setModalMsg(shareMsg, "Udostępnienie zapisane.");
    await refreshAll();
  }catch(err){
    setModalMsg(shareMsg, String(err.message||err));
  }
}

/* ===== details modal ===== */
async function openDetailsModal(){
  const poll = getSelectedPoll();
  if (!poll) return;
  detailsPollName.textContent = poll.name || "—";
  detailsVotesList.innerHTML = "";
  detailsAnonCount.textContent = "—";
  setModalMsg(detailsMsg, "Ładowanie…");
  openOverlay(ovDetails);

  try{
    const { data: votes, error } = await sb()
      .from("poll_votes")
      .select("voter_user_id,voter_token")
      .eq("game_id", poll.game_id);
    if (error) throw error;

    const rows = Array.isArray(votes) ? votes : [];
    const userIds = [...new Set(rows.filter(v=>v.voter_user_id).map(v=>v.voter_user_id))];
    const anonTokens = new Set(rows.filter(v=>!v.voter_user_id).map(v=>v.voter_token));

    detailsAnonCount.textContent = `${anonTokens.size}`;

    if (!userIds.length){
      const empty = document.createElement("div");
      empty.className = "hubDetailsItem";
      empty.textContent = "Brak głosów od subskrybentów.";
      detailsVotesList.appendChild(empty);
      setModalMsg(detailsMsg, "OK");
      return;
    }

    const { data: profs, error: profErr } = await sb()
      .from("profiles")
      .select("id,username,email")
      .in("id", userIds);
    if (profErr) throw profErr;

    const byId = new Map((profs || []).map((p)=>[p.id, p]));

    for (const uid of userIds) {
      const p = byId.get(uid);
      const label = p?.username || p?.email || uid;
      const el = document.createElement("div");
      el.className = "hubDetailsItem";
      el.innerHTML = `
        <span class="hubDetailsName">${esc(label)}</span>
        ${tileBtn("✖","Usuń głosy")}
      `;
      const btn = el.querySelector(".tileBtn");
      btn.onclick = async (e)=>{
        e.stopPropagation();
        try{
          const { error: delErr } = await sb()
            .from("poll_votes")
            .delete()
            .eq("game_id", poll.game_id)
            .eq("voter_user_id", uid);
          if (delErr) throw delErr;
          setModalMsg(detailsMsg, "Usunięto głosy użytkownika.");
          await openDetailsModal();
        }catch(err){
          setModalMsg(detailsMsg, String(err.message||err));
        }
      };
      detailsVotesList.appendChild(el);
    }

    setModalMsg(detailsMsg, "OK");
  }catch(err){
    setModalMsg(detailsMsg, String(err.message||err));
  }
}

/* ===== data ===== */
async function refreshPollReadiness(polls){
  const next = new Map();
  const drafts = polls.filter((p)=>p.poll_state === "draft");
  await Promise.all(drafts.map(async (p)=>{
    try{
      const res = await validatePollReadyToOpen(p.game_id);
      next.set(p.game_id, !!res.ok);
    }catch{
      next.set(p.game_id, false);
    }
  }));
  state.pollReady = next;
}

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

    if (state.selectedPollId && !state.polls.some((p)=>p.game_id === state.selectedPollId)) {
      state.selectedPollId = null;
    }

    await refreshPollReadiness(state.polls);
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

  btnShare.onclick = openShareModal;
  btnDetails.onclick = openDetailsModal;

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
      await rpcOne("polls_hub_subscription_invite_a", { p_handle: val });
      addSubMsg.textContent = "Zaproszenie wysłane.";
      await refreshAll();
    }catch(err){
      addSubMsg.textContent = String(err.message||err);
    }
  };

  shareTabs.forEach((tab)=>{
    tab.addEventListener("click", ()=>setShareMode(tab.dataset.mode));
  });

  btnCloseShare.onclick = () => closeOverlay(ovShare);
  ovShare.addEventListener("click", (e)=>{ if (e.target === ovShare) closeOverlay(ovShare); });
  btnApplyShare.onclick = applyShare;

  btnCopyLink.onclick = async ()=>{
    const value = shareLink.value || "";
    if (!value) return;
    try{
      await navigator.clipboard.writeText(value);
      setModalMsg(shareMsg, "Skopiowano link.");
    }catch{
      shareLink.select();
      document.execCommand("copy");
      setModalMsg(shareMsg, "Skopiowano link.");
    }
  };
  btnOpenLink.onclick = () => {
    if (shareLink.value) window.open(shareLink.value, "_blank");
  };
  btnOpenQr.onclick = () => {
    if (!shareLink.value) return;
    const url = new URL("poll-qr.html", location.href);
    url.searchParams.set("url", shareLink.value);
    window.open(url.toString(), "_blank");
  };
  btnOpenDisplay.onclick = () => {
    if (!shareLink.value) return;
    const url = new URL("poll-qr.html", location.href);
    url.searchParams.set("url", shareLink.value);
    window.open(url.toString(), "_blank");
  };

  btnCloseDetails.onclick = () => closeOverlay(ovDetails);
  ovDetails.addEventListener("click", (e)=>{ if (e.target === ovDetails) closeOverlay(ovDetails); });
}

async function boot(){
  currentUser = await requireAuth();

  const { data: prof } = await sb()
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
