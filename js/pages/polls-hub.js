// js/pages/polls-hub.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

const $ = (id) => document.getElementById(id);

/* top */
const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");
const btnRefresh = $("btnRefresh");

/* chips */
const chipPolls = $("chipPolls");
const chipTasks = $("chipTasks");
const chipSubs = $("chipSubs");
const chipMySubs = $("chipMySubs");

/* lists */
const listMyPolls = $("listMyPolls");
const listTasks = $("listTasks");
const listSubsToMe = $("listSubsToMe");
const listMySubs = $("listMySubs");

/* empty */
const emptyMyPolls = $("emptyMyPolls");
const emptyTasks = $("emptyTasks");
const emptySubsToMe = $("emptySubsToMe");
const emptyMySubs = $("emptyMySubs");

/* filters */
const btnPollsActive = $("btnPollsActive");
const btnPollsArch = $("btnPollsArch");
const btnTasksActive = $("btnTasksActive");
const btnTasksArch = $("btnTasksArch");
const btnSubsToMeActive = $("btnSubsToMeActive");
const btnSubsToMeArch = $("btnSubsToMeArch");
const btnMySubsActive = $("btnMySubsActive");
const btnMySubsArch = $("btnMySubsArch");

/* controls */
const btnPollShare = $("btnPollShare");
const btnPollDetails = $("btnPollDetails");

/* modals */
const ovAddSub = $("ovAddSub");
const inpAddSub = $("inpAddSub");
const btnAddSubscriber = $("btnAddSubscriber");
const btnAddSubCancel = $("btnAddSubCancel");
const btnAddSubSend = $("btnAddSubSend");
const msgAddSub = $("msgAddSub");

const ovShare = $("ovShare");
const shareSub = $("shareSub");
const shareModeAnon = $("shareModeAnon");
const shareModeSubs = $("shareModeSubs");
const shareModeMixed = $("shareModeMixed");
const shareAnonBox = $("shareAnonBox");
const shareSubsBox = $("shareSubsBox");
const shareAnonLink = $("shareAnonLink");
const btnShareCopy = $("btnShareCopy");
const btnShareOpen = $("btnShareOpen");
const btnShareCancel = $("btnShareCancel");
const btnShareSave = $("btnShareSave");
const sharePick = $("sharePick");
const msgShare = $("msgShare");

const ovDetails = $("ovDetails");
const btnDetailsClose = $("btnDetailsClose");

/* state */
const view = {
  polls: "active",
  tasks: "active",
  subsToMe: "active",
  mySubs: "active",
};

let currentUser = null;
let selectedPoll = null;

const shareState = {
  mode: "anon",           // anon|subs|mixed
  poll: null,             // selected poll row
  subscribers: [],        // list_my_subscribers
  picked: new Set(),      // sub_id selected
};

/* utils */
function show(el, on){ if(el) el.style.display = on ? "" : "none"; }
function setText(el, t){ if(el) el.textContent = String(t ?? ""); }
function setChip(el, n){ if(el) el.textContent = String(Number(n)||0); }

function setSeg(aBtn, bBtn, mode){
  aBtn?.classList.toggle("on", mode === "active");
  bBtn?.classList.toggle("on", mode === "archive");
}

function modalMsg(el, text){
  if(!el) return;
  if(!text){ el.textContent=""; show(el,false); return; }
  el.textContent = String(text);
  show(el,true);
}

function openOverlay(el){
  modalMsg(msgAddSub, "");
  modalMsg(msgShare, "");
  show(el,true);
}
function closeOverlay(el){ show(el,false); }

async function rpcOne(name, args){
  const { data, error } = await sb().rpc(name, args || {});
  if(error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
async function rpcList(name, args){
  const { data, error } = await sb().rpc(name, args || {});
  if(error) throw error;
  return Array.isArray(data) ? data : (data ? [data] : []);
}

/* status mapping (wizualne, wg Twoich reguł – bez “draft-ready” dopóki DB nie zwróci flagi) */
function pollRowStatusClass(r){
  const state = String(r?.poll_state || "draft").toLowerCase();

  if(state === "closed") return "st-blue";

  if(state === "draft"){
    // dopóki DB nie zwraca can_open: traktujemy draft jako szary
    return "st-gray";
  }

  // open:
  const anon = Number(r?.anon_votes || 0);
  const ta = Number(r?.tasks_active || 0);
  const td = Number(r?.tasks_done || 0);

  if(anon === 0 && ta === 0 && td === 0) return "st-orange";            // otwarte bez głosów
  if(ta > 0 || anon > 0) return "st-yellow";                            // w trakcie
  if(ta === 0 && (td > 0 || anon >= 10)) return "st-green";             // “zielone”
  return "st-yellow";
}

function pollShareDot(mode){
  const m = String(mode||"").toLowerCase();
  if(m === "anon" || m === "a") return "dot a";
  if(m === "subs" || m === "s") return "dot s";
  if(m === "mixed" || m === "m") return "dot m";
  return "dot";
}

/* build anon link */
function pollTypeToVotingPage(pollType){
  const t = String(pollType||"").toLowerCase();
  if (t === "poll_text" || t === "text") return "poll-text.html";
  if (t === "poll_points" || t === "points") return "poll-points.html";
  return "";
}
function buildAnonVoteLink(pollType, shareKey){
  const page = pollTypeToVotingPage(pollType);
  const key = String(shareKey||"").trim();
  if (!page || !key) return "";
  const url = new URL(page, location.href);
  url.searchParams.set("key", key);
  return url.toString();
}
async function copyToClipboardOrPrompt(text){
  const v = String(text||"");
  if (!v) return false;
  try { await navigator.clipboard.writeText(v); return true; }
  catch { prompt("Skopiuj link:", v); return true; }
}

/* render row helpers */
function mkRow({cls="", title="", meta="", rightHtml=""}){
  const el = document.createElement("div");
  el.className = `hubRow ${cls}`.trim();
  el.innerHTML = `
    <div class="hubRowMain">
      <div class="hubRowTitle">${title}</div>
      <div class="hubRowMeta">${meta}</div>
    </div>
    <div class="hubRowRight">${rightHtml || ""}</div>
  `;
  return el;
}

function renderEmpty(listEl, emptyEl, has){
  if(!listEl || !emptyEl) return;
  show(emptyEl, !has);
}

/* ===== refresh ===== */
async function refreshAll(){
  await Promise.all([
    refreshMyPolls(),
    refreshTasks(),
    refreshSubsToMe(),
    refreshMySubs(),
  ]);
}

/* Polls */
let cachePolls = [];
async function refreshMyPolls(){
  const rows = await rpcList("polls_hub_list_polls");
  cachePolls = rows;

  // filtr aktywne/arch
  const filtered = rows.filter(r => {
    const arch = !!r?.is_archived; // jeśli masz to w RPC; jak nie masz, to będzie false i pójdzie do aktywnych
    return view.polls === "active" ? !arch : arch;
  });

  setChip(chipPolls, filtered.length);
  listMyPolls.innerHTML = "";
  renderEmpty(listMyPolls, emptyMyPolls, filtered.length > 0);

  // jeśli zaznaczony poll zniknął – reset
  if(selectedPoll && !filtered.some(x => x.game_id === selectedPoll.game_id)){
    selectedPoll = null;
    btnPollShare.disabled = true;
    btnPollDetails.disabled = true;
  }

  for(const r of filtered){
    const stCls = pollRowStatusClass(r);

    const mode = String(r?.poll_share_mode || "anon"); // docelowo z DB
    const modeDot = pollShareDot(mode);

    const metaBits = [
      `<span class="${modeDot}" title="Tryb udostępniania"></span>`,
      `<span class="dot" title="Typ"></span>`,
      `typ: ${r?.poll_type || "—"}`,
      `pyt: ${Number(r?.sessions_total||0)}`,
      `zad: ${Number(r?.tasks_active||0)} / ${Number(r?.tasks_done||0)}`,
      `anon: ${Number(r?.anon_votes||0)}`
    ].join(" • ");

    const el = mkRow({
      cls: `${stCls} ${selectedPoll?.game_id === r.game_id ? "sel" : ""}`,
      title: (r?.name || "—").replace(/</g,"&lt;"),
      meta: metaBits,
      rightHtml: `<span class="dot ${String(r?.poll_state||"").toLowerCase()==="closed" ? "done":""}" title="Stan"></span>`
    });

    el.addEventListener("click", () => {
      // zaznaczanie
      selectedPoll = r;
      btnPollShare.disabled = false;
      btnPollDetails.disabled = false;

      // odśwież highlight
      [...listMyPolls.querySelectorAll(".hubRow")].forEach(x => x.classList.remove("sel"));
      el.classList.add("sel");
    });

    el.addEventListener("dblclick", () => {
      const state = String(r?.poll_state||"draft").toLowerCase();
      if(state === "draft") return; // szkic (na razie)
      location.href = `polls.html?id=${encodeURIComponent(r.game_id)}`;
    });

    listMyPolls.appendChild(el);
  }
}

/* Tasks */
async function refreshTasks(){
  const rows = await rpcList("polls_hub_list_tasks");

  const filtered = rows.filter(r => {
    const arch = !!r?.is_archived;
    return view.tasks === "active" ? !arch : arch;
  });

  setChip(chipTasks, filtered.length);
  listTasks.innerHTML = "";
  renderEmpty(listTasks, emptyTasks, filtered.length > 0);

  for(const r of filtered){
    const status = String(r?.status || "pending").toLowerCase();
    const stCls = status === "done" ? "st-blue" : "st-green";

    const dotCls = status === "done" ? "dot done" : "dot todo";

    const el = mkRow({
      cls: stCls,
      title: (r?.game_name || "Sondaż").replace(/</g,"&lt;"),
      meta: [
        `<span class="${dotCls}" title="Status"></span>`,
        `typ: ${r?.poll_type || "—"}`,
        `utw: ${String(r?.created_at||"").slice(0,10)}`
      ].join(" • "),
      rightHtml: status === "done"
        ? ``
        : `<button class="hubX" data-x type="button" title="Odrzuć">✕</button>`
    });

    el.addEventListener("dblclick", () => {
      if(r?.go_url) location.href = r.go_url;
    });

    el.querySelector("[data-x]")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if(!confirm("Odrzucić to zadanie?")) return;
      // zakładam, że masz RPC/akcję po tokenie (jak wcześniej)
      const { error } = await sb().rpc("polls_hub_task_decline", { p_token: r?.token });
      if(error) alert("Nie udało się odrzucić zadania.");
      await refreshTasks();
    });

    listTasks.appendChild(el);
  }
}

/* Subscribers (to me) */
async function refreshSubsToMe(){
  const rows = await rpcList("polls_hub_list_my_subscribers");

  const filtered = rows.filter(r => {
    const expired = !!r?.is_expired;
    return view.subsToMe === "active" ? !expired : expired;
  });

  setChip(chipSubs, filtered.length);
  listSubsToMe.innerHTML = "";
  renderEmpty(listSubsToMe, emptySubsToMe, filtered.length > 0);

  for(const r of filtered){
    const status = String(r?.status||"pending").toLowerCase();
    const stCls =
      status === "active" ? "st-green" :
      status === "pending" ? "st-yellow" :
      "st-red";

    const canResend = status === "pending" && !!r?.subscriber_email;

    const el = mkRow({
      cls: stCls,
      title: (r?.subscriber_label || "—").replace(/</g,"&lt;"),
      meta: [
        `<span class="dot ${status==="active" ? "todo" : status==="pending" ? "s":"bad"}"></span>`,
        `status: ${status}`,
        `utw: ${String(r?.created_at||"").slice(0,10)}`
      ].join(" • "),
      rightHtml: `
        ${canResend ? `<button class="btn sm" data-r type="button" title="Wyślij ponownie">↻</button>` : ``}
        <button class="hubX" data-x type="button" title="${status==="active"?"Usuń":"Anuluj"}">✕</button>
      `
    });

    el.querySelector("[data-x]")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if(!confirm(status==="active" ? "Usunąć subskrybenta?" : "Anulować zaproszenie?")) return;
      const out = await rpcOne("polls_hub_subscriber_remove", { p_id: r.sub_id });
      if(!out?.ok) alert(out?.error || "Nie udało się.");
      await refreshSubsToMe();
    });

    el.querySelector("[data-r]")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const out = await rpcOne("polls_hub_subscriber_resend", { p_id: r.sub_id });
      if(!out?.ok) alert(out?.error || "Nie udało się.");
      // mail resend dopniemy w etapie maili (tu UI i DB akcja jest)
      alert("Wysłano ponownie (DB). Mail dopniemy w kroku maili ✉️");
      await refreshSubsToMe();
    });

    listSubsToMe.appendChild(el);
  }
}

/* My subscriptions */
async function refreshMySubs(){
  const rows = await rpcList("polls_hub_list_my_subscriptions");

  const filtered = rows.filter(r => {
    const expired = !!r?.is_expired;
    return view.mySubs === "active" ? !expired : expired;
  });

  setChip(chipMySubs, filtered.length);
  listMySubs.innerHTML = "";
  renderEmpty(listMySubs, emptyMySubs, filtered.length > 0);

  for(const r of filtered){
    const status = String(r?.status||"pending").toLowerCase();
    const stCls = status === "active" ? "st-green" : "st-yellow";

    const el = mkRow({
      cls: stCls,
      title: (r?.owner_label || "—").replace(/</g,"&lt;"),
      meta: [
        `<span class="dot ${status==="active" ? "todo":"s"}"></span>`,
        `status: ${status}`,
        `utw: ${String(r?.created_at||"").slice(0,10)}`
      ].join(" • "),
      rightHtml: `
        ${status==="pending" ? `<button class="btn sm" data-acc type="button">Akceptuj</button>` : ``}
        <button class="hubX" data-x type="button" title="${status==="pending"?"Odrzuć":"Anuluj"}">✕</button>
      `
    });

    el.querySelector("[data-acc]")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const out = await rpcOne("polls_hub_subscription_accept", { p_id: r.sub_id });
      if(!out?.ok) alert(out?.error || "Nie udało się.");
      await refreshMySubs();
    });

    el.querySelector("[data-x]")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if(status === "pending"){
        if(!confirm("Odrzucić zaproszenie?")) return;
        const out = await rpcOne("polls_hub_subscription_reject", { p_id: r.sub_id });
        if(!out?.ok) alert(out?.error || "Nie udało się.");
      } else {
        if(!confirm("Anulować subskrypcję?")) return;
        const out = await rpcOne("polls_hub_subscription_cancel", { p_id: r.sub_id });
        if(!out?.ok) alert(out?.error || "Nie udało się.");
      }
      await refreshMySubs();
    });

    listMySubs.appendChild(el);
  }
}

/* ===== actions: share/details/add ===== */
function setMode(mode){
  shareState.mode = mode;

  shareModeAnon.classList.toggle("on", mode === "anon");
  shareModeSubs.classList.toggle("on", mode === "subs");
  shareModeMixed.classList.toggle("on", mode === "mixed");

  show(shareAnonBox, mode === "anon" || mode === "mixed");
  show(shareSubsBox, mode === "subs" || mode === "mixed");
}

async function openShare(){
  if(!selectedPoll) return;

  shareState.poll = selectedPoll;
  shareState.picked = new Set();

  setText(shareSub, selectedPoll?.name || "—");

  // anon link
  shareAnonLink.value = buildAnonVoteLink(selectedPoll.poll_type, selectedPoll.share_key_poll || selectedPoll.share_key_poll);

  // load subscribers list (UI picker)
  shareState.subscribers = await rpcList("polls_hub_list_my_subscribers");
  renderSharePick();

  setMode(String(selectedPoll?.poll_share_mode || "anon")); // docelowo z DB
  openOverlay(ovShare);
}

function renderSharePick(){
  sharePick.innerHTML = "";

  for(const r of shareState.subscribers){
    const id = r.sub_id;
    const label = r.subscriber_label || "—";
    const status = String(r.status||"").toLowerCase();

    const row = document.createElement("div");
    row.className = "hubPickRow";
    row.innerHTML = `
      <div class="hubPickLeft">
        <input class="hubChk" type="checkbox" data-id="${id}"/>
        <div style="min-width:0">
          <div class="hubPickLabel">${label.replace(/</g,"&lt;")}</div>
          <div class="hubPickMeta">status: ${status}</div>
        </div>
      </div>
      <span class="dot ${status==="active" ? "todo" : status==="pending" ? "s" : "bad"}"></span>
    `;

    row.querySelector("input")?.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      if(on) shareState.picked.add(id);
      else shareState.picked.delete(id);
    });

    sharePick.appendChild(row);
  }
}

async function saveShare(){
  if(!shareState.poll) return;

  btnShareSave.disabled = true;
  modalMsg(msgShare, "Zapisuję…");

  try {
    const subIds = Array.from(shareState.picked);
    const out = await rpcOne("polls_hub_share_poll", {
      p_game_id: shareState.poll.game_id,
      p_mode: shareState.mode,
      p_sub_ids: subIds
    });

    if(!out?.ok) throw new Error(out?.error || "share failed");

    modalMsg(msgShare, `Zapisano ✅ (created: ${out.created}, cancelled: ${out.cancelled})`);
    await refreshTasks();
    await refreshMyPolls();
  } catch (e) {
    modalMsg(msgShare, String(e?.message || e));
  } finally {
    btnShareSave.disabled = false;
  }
}

/* add subscriber */
async function openAddSub(){
  inpAddSub.value = "";
  modalMsg(msgAddSub, "");
  openOverlay(ovAddSub);
  setTimeout(()=>inpAddSub.focus(), 50);
}
async function sendAddSub(){
  const v = String(inpAddSub.value||"").trim();
  if(!v) return;

  btnAddSubSend.disabled = true;
  modalMsg(msgAddSub, "Wysyłam…");

  try {
    const out = await rpcOne("polls_hub_subscription_invite_a", { p_handle: v });
    if(!out?.ok) throw new Error(out?.error || "invite failed");

    // mail dopniemy w kolejnym etapie; tu UI/DB jest OK
    modalMsg(msgAddSub, out.already ? "Zaproszenie już istnieje (pending/active)." : "Zaproszenie utworzone ✅ (mail dopniemy).");
    await refreshSubsToMe();
  } catch (e) {
    modalMsg(msgAddSub, String(e?.message || e));
  } finally {
    btnAddSubSend.disabled = false;
  }
}

/* details placeholder */
function openDetails(){
  openOverlay(ovDetails);
}

/* ===== boot ===== */
async function boot(){
  currentUser = await requireAuth();
  who.textContent = currentUser?.user?.email || "—";

  btnBack.addEventListener("click", ()=>location.href="builder.html");
  btnLogout.addEventListener("click", async ()=>{ await signOut(); location.href="index.html"; });

  btnRefresh.addEventListener("click", refreshAll);

  // filters
  btnPollsActive.addEventListener("click", async ()=>{ view.polls="active"; setSeg(btnPollsActive,btnPollsArch,"active"); await refreshMyPolls(); });
  btnPollsArch.addEventListener("click", async ()=>{ view.polls="archive"; setSeg(btnPollsActive,btnPollsArch,"archive"); await refreshMyPolls(); });

  btnTasksActive.addEventListener("click", async ()=>{ view.tasks="active"; setSeg(btnTasksActive,btnTasksArch,"active"); await refreshTasks(); });
  btnTasksArch.addEventListener("click", async ()=>{ view.tasks="archive"; setSeg(btnTasksActive,btnTasksArch,"archive"); await refreshTasks(); });

  btnSubsToMeActive.addEventListener("click", async ()=>{ view.subsToMe="active"; setSeg(btnSubsToMeActive,btnSubsToMeArch,"active"); await refreshSubsToMe(); });
  btnSubsToMeArch.addEventListener("click", async ()=>{ view.subsToMe="archive"; setSeg(btnSubsToMeActive,btnSubsToMeArch,"archive"); await refreshSubsToMe(); });

  btnMySubsActive.addEventListener("click", async ()=>{ view.mySubs="active"; setSeg(btnMySubsActive,btnMySubsArch,"active"); await refreshMySubs(); });
  btnMySubsArch.addEventListener("click", async ()=>{ view.mySubs="archive"; setSeg(btnMySubsActive,btnMySubsArch,"archive"); await refreshMySubs(); });

  // buttons
  btnPollShare.addEventListener("click", openShare);
  btnPollDetails.addEventListener("click", openDetails);

  // add sub modal
  btnAddSubscriber.addEventListener("click", openAddSub);
  btnAddSubCancel.addEventListener("click", ()=>closeOverlay(ovAddSub));
  btnAddSubSend.addEventListener("click", sendAddSub);
  ovAddSub.addEventListener("click", (e)=>{ if(e.target===ovAddSub) closeOverlay(ovAddSub); });

  // share modal
  shareModeAnon.addEventListener("click", ()=>setMode("anon"));
  shareModeSubs.addEventListener("click", ()=>setMode("subs"));
  shareModeMixed.addEventListener("click", ()=>setMode("mixed"));

  btnShareCancel.addEventListener("click", ()=>closeOverlay(ovShare));
  ovShare.addEventListener("click", (e)=>{ if(e.target===ovShare) closeOverlay(ovShare); });

  btnShareCopy.addEventListener("click", async ()=>{
    const ok = await copyToClipboardOrPrompt(shareAnonLink.value);
    modalMsg(msgShare, ok ? "Skopiowano ✅" : "Nie udało się skopiować.");
  });
  btnShareOpen.addEventListener("click", ()=>{
    const url = shareAnonLink.value;
    if(url) window.open(url, "_blank", "noopener,noreferrer");
  });
  btnShareSave.addEventListener("click", saveShare);

  // details modal
  btnDetailsClose.addEventListener("click", ()=>closeOverlay(ovDetails));
  ovDetails.addEventListener("click", (e)=>{ if(e.target===ovDetails) closeOverlay(ovDetails); });

  await refreshAll();
}

boot().catch((e)=>{
  console.error(e);
  alert(String(e?.message || e));
});
