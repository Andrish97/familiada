// js/pages/polls-hub.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";

const $ = (id) => document.getElementById(id);

const who = $("who");
const hint = $("hint");
const msg = $("msg");

const btnBack = $("btnBack");
const btnLogout = $("btnLogout");

const cardPolls = $("cardPolls");
const cardTasks = $("cardTasks");
const cardMine  = $("cardMine");
const cardSubs  = $("cardSubs");

const dotPolls = $("dotPolls");
const dotTasks = $("dotTasks");
const dotMine  = $("dotMine");
const dotSubs  = $("dotSubs");

const subPolls = $("subPolls");
const subTasks = $("subTasks");
const subMine  = $("subMine");
const subSubs  = $("subSubs");

const panel = $("panel");
const panelTitle = $("panelTitle");
const panelList = $("panelList");
const btnHome = $("btnHome");

let currentUser = null;

/* ================= helpers ================= */
function setMsg(t){ if(msg) msg.textContent = t || ""; }
function setHint(t){ if(hint) hint.textContent = t || ""; }

function show(el, on){
  if(!el) return;
  el.style.display = on ? "" : "none";
}

function esc(s){
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function fmtCount(n, label){
  const x = Number(n) || 0;
  return `${x} ${label}`;
}

function isArchived(status, updatedAtIso, days=7){
  // ukrywanie DONE/DECLINED po czasie w UI
  if(status !== "done" && status !== "declined") return false;
  const t = Date.parse(updatedAtIso || "");
  if(!Number.isFinite(t)) return false;
  const ageMs = Date.now() - t;
  return ageMs > days * 24 * 3600 * 1000;
}

/* ================= RPC contracts =================
  W tym etapie zakładamy takie RPC (nazwy możesz podpiąć 1:1 w DB):

  1) polls_hub_overview() -> { polls_open, tasks_todo, subs_mine_pending, subs_their_pending }

  2) polls_hub_list_open_polls() -> rows:
     { game_id, game_name, poll_type, status, updated_at }

  3) polls_hub_list_tasks() -> rows:
     { task_id, game_id, game_name, poll_type, status, created_at, updated_at, go_url }

  4) polls_hub_list_my_subscriptions() -> rows:
     { sub_id, target_label, status, created_at, updated_at }

  5) polls_hub_list_my_subscribers() -> rows:
     { sub_id, subscriber_label, status, created_at, updated_at }

  6) akcje:
     - polls_hub_task_decline(p_task_id)
     - polls_hub_subscription_cancel(p_sub_id)
     - polls_hub_subscriber_remove(p_sub_id)
==================================================== */

async function rpc(name, args){
  const { data, error } = await sb().rpc(name, args || {});
  if(error) throw error;
  return data;
}

/* ================= render rows ================= */
function renderEmpty(text){
  panelList.innerHTML = `<div style="opacity:.75">${esc(text)}</div>`;
}

function rowHtml({ title, meta, badge, actionsHtml }){
  return `
    <div class="rowItem">
      <div class="rowMain">
        <div class="rowTitle">${esc(title)}</div>
        <div class="rowMeta">${esc(meta || "")}</div>
      </div>
      <div class="rowActions">
        ${badge ? `<span class="badge ${esc(badge.kind||"")}">${esc(badge.text||"")}</span>` : ""}
        ${actionsHtml || ""}
      </div>
    </div>
  `;
}

function btnHtml(kind, label, attrs=""){
  // kind: "sm" | "sm gold"
  return `<button class="btn ${kind}" type="button" ${attrs}>${esc(label)}</button>`;
}

/* ================= views ================= */
async function openHome(){
  show(panel, false);
  setMsg("");
  await refreshOverview();
}

async function openPanel(title){
  show(panel, true);
  panelTitle.textContent = title;
  panelList.innerHTML = "";
  setMsg("");
}

async function viewPolls(){
  await openPanel("SONDAŻE");

  const rows = await rpc("polls_hub_list_open_polls");
  const list = (rows || []).filter(r => !isArchived(r.status, r.updated_at));

  if(!list.length) return renderEmpty("Brak otwartych sondaży.");

  panelList.innerHTML = list.map(r => {
    const meta = `${r.poll_type || "—"} • ${r.status || "—"}`;
    const actions = [
      // otwarcie “polls.html?id=...”
      btnHtml("sm gold", "Otwórz", `data-open-polls="${esc(r.game_id)}"`),
    ].join("");
    return rowHtml({ title: r.game_name || "Sondaż", meta, badge:null, actionsHtml: actions });
  }).join("");

  panelList.querySelectorAll("[data-open-polls]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open-polls");
      if(!id) return;
      location.href = `polls.html?id=${encodeURIComponent(id)}`;
    });
  });
}

async function viewTasks(){
  await openPanel("ZADANIA");

  const rows = await rpc("polls_hub_list_tasks");
  const list = (rows || []).filter(r => !isArchived(r.status, r.updated_at));

  if(!list.length) return renderEmpty("Brak zadań.");

  panelList.innerHTML = list.map(r => {
    const st = String(r.status || "pending");
    const badge =
      st === "pending" ? { text:"DO ZROBIENIA", kind:"" } :
      st === "done" ? { text:"WYKONANE", kind:"ok" } :
      st === "declined" ? { text:"ODRZUCONE", kind:"bad" } :
      { text: st.toUpperCase(), kind:"" };

    const meta = `${r.poll_type || "—"}`;

    const actions = [
      st === "pending"
        ? btnHtml("sm gold", "Przejdź", `data-go="${esc(r.go_url || "")}"`)
        : "",
      st === "pending"
        ? btnHtml("sm", "Odrzuć", `data-decline-task="${esc(r.task_id)}"`)
        : "",
    ].join("");

    return rowHtml({ title: r.game_name || "Zadanie", meta, badge, actionsHtml: actions });
  }).join("");

  panelList.querySelectorAll("[data-go]").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-go");
      if(!url) return;
      location.href = url; // tu ma być docelowo poll_text/poll_points (bez pośredniego)
    });
  });

  panelList.querySelectorAll("[data-decline-task]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-decline-task");
      if(!id) return;
      setMsg("");
      try{
        await rpc("polls_hub_task_decline", { p_task_id: id });
        await viewTasks();
      }catch(e){
        console.warn(e);
        setMsg("Nie udało się.");
      }
    });
  });
}

async function viewMySubs(){
  await openPanel("MOJE SUBSKRYPCJE");

  const rows = await rpc("polls_hub_list_my_subscriptions");
  const list = (rows || []).filter(r => !isArchived(r.status, r.updated_at));

  if(!list.length) return renderEmpty("Brak subskrypcji.");

  panelList.innerHTML = list.map(r => {
    const st = String(r.status || "pending");
    const badge =
      st === "pending" ? { text:"ZAPROSZENIE", kind:"" } :
      st === "active" ? { text:"AKTYWNA", kind:"ok" } :
      st === "declined" ? { text:"ODRZUCONA", kind:"bad" } :
      { text: st.toUpperCase(), kind:"" };

    const actions = [
      (st === "active" || st === "pending")
        ? btnHtml("sm", "Anuluj", `data-cancel-sub="${esc(r.sub_id)}"`)
        : "",
    ].join("");

    return rowHtml({
      title: r.target_label || "Subskrypcja",
      meta: "",
      badge,
      actionsHtml: actions
    });
  }).join("");

  panelList.querySelectorAll("[data-cancel-sub]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-cancel-sub");
      if(!id) return;
      setMsg("");
      try{
        await rpc("polls_hub_subscription_cancel", { p_sub_id: id });
        await viewMySubs();
      }catch(e){
        console.warn(e);
        setMsg("Nie udało się.");
      }
    });
  });
}

async function viewMySubscribers(){
  await openPanel("MOI SUBSKRYBENCI");

  const rows = await rpc("polls_hub_list_my_subscribers");
  const list = (rows || []).filter(r => !isArchived(r.status, r.updated_at));

  if(!list.length) return renderEmpty("Brak subskrybentów.");

  panelList.innerHTML = list.map(r => {
    const st = String(r.status || "pending");
    const badge =
      st === "pending" ? { text:"ZAPROSZENIE", kind:"" } :
      st === "active" ? { text:"AKTYWNY", kind:"ok" } :
      st === "declined" ? { text:"ODRZUCONY", kind:"bad" } :
      { text: st.toUpperCase(), kind:"" };

    const actions = [
      (st === "active" || st === "pending")
        ? btnHtml("sm", "Usuń", `data-remove-sub="${esc(r.sub_id)}"`)
        : "",
    ].join("");

    return rowHtml({
      title: r.subscriber_label || "Subskrybent",
      meta: "",
      badge,
      actionsHtml: actions
    });
  }).join("");

  panelList.querySelectorAll("[data-remove-sub]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-remove-sub");
      if(!id) return;
      setMsg("");
      try{
        await rpc("polls_hub_subscriber_remove", { p_sub_id: id });
        await viewMySubscribers();
      }catch(e){
        console.warn(e);
        setMsg("Nie udało się.");
      }
    });
  });
}

/* ================= overview ================= */
async function refreshOverview(){
  setHint("Ładowanie…");
  try{
    const o = await rpc("polls_hub_overview");

    const pollsOpen = Number(o?.polls_open) || 0;
    const tasksTodo = Number(o?.tasks_todo) || 0;
    const minePend  = Number(o?.subs_mine_pending) || 0;
    const subsPend  = Number(o?.subs_their_pending) || 0;

    if(subPolls) subPolls.textContent = fmtCount(pollsOpen, "otwartych");
    if(subTasks) subTasks.textContent = fmtCount(tasksTodo, "do zrobienia");
    if(subMine)  subMine.textContent  = fmtCount(minePend, "zaproszeń");
    if(subSubs)  subSubs.textContent  = fmtCount(subsPend, "zaproszeń");

    show(dotPolls, pollsOpen > 0);
    show(dotTasks, tasksTodo > 0);
    show(dotMine,  minePend > 0);
    show(dotSubs,  subsPend > 0);

    setHint("Wybierz kafelek.");
  }catch(e){
    console.warn(e);
    setHint("Nie udało się wczytać.");
  }
}

/* ================= events ================= */
btnLogout?.addEventListener("click", async () => {
  await signOut();
  location.href = "index.html";
});

btnBack?.addEventListener("click", () => {
  // bez zgadywania: wracamy do poprzedniej strony albo do buildera
  if (history.length > 1) history.back();
  else location.href = "builder.html";
});

btnHome?.addEventListener("click", () => openHome());

cardPolls?.addEventListener("click", () => viewPolls());
cardTasks?.addEventListener("click", () => viewTasks());
cardMine ?.addEventListener("click", () => viewMySubs());
cardSubs ?.addEventListener("click", () => viewMySubscribers());

/* ================= init ================= */
(async function init(){
  currentUser = await requireAuth("index.html");
  if(who) who.textContent = currentUser?.username || currentUser?.email || "—";

  show(panel, false);
  await refreshOverview();
})();
