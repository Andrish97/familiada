// js/pages/builder.js
import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");

const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");
const hint = document.getElementById("hint");

const typeOverlay = document.getElementById("typeOverlay");
const btnCreateFixed = document.getElementById("btnCreateFixed");
const btnCreatePoll = document.getElementById("btnCreatePoll");
const btnCancelType = document.getElementById("btnCancelType");

let currentUser = null;
let games = [];
let selectedGame = null;
let selectedReady = { editOk:false, playOk:false, pollOk:false, reason:"" };

function setHint(t){ hint.textContent = t || ""; }
function openTypeModal(){ typeOverlay.style.display = ""; }
function closeTypeModal(){ typeOverlay.style.display = "none"; }

function clearSelection(){
  selectedGame = null;
  selectedReady = { editOk:false, playOk:false, pollOk:false, reason:"" };
  document.querySelectorAll(".card").forEach(c=>c.classList.remove("selected"));
  syncActions();
}

function syncActions(){
  const hasSel = !!selectedGame;
  btnEdit.disabled = !hasSel || !selectedReady.editOk;
  btnPlay.disabled = !hasSel || !selectedReady.playOk;
  btnPoll.disabled = !hasSel || !selectedReady.pollOk;

  if(!hasSel){
    setHint("Kliknij kafelek, żeby go zaznaczyć.");
    return;
  }

  if(selectedReady.reason) setHint(selectedReady.reason);
  else setHint(`Wybrano: ${selectedGame.name}`);
}

async function validateGameSetup(g){
  // wspólna zasada: min 10 pytań + dokładnie 5 odpowiedzi na pytanie
  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id,ord")
    .eq("game_id", g.id)
    .order("ord",{ascending:true});

  if(qErr) return { ok:false, reason:"Błąd wczytywania pytań." };

  if(!qs || qs.length < 10){
    return { ok:false, reason:`Brakuje pytań: masz ${qs?.length||0}/10.` };
  }

  // każdemu pytaniu: 5 odpowiedzi
  for(const q of qs){
    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("id,fixed_points")
      .eq("question_id", q.id);

    if(aErr) return { ok:false, reason:`Błąd wczytywania odpowiedzi (pytanie #${q.ord}).` };
    if(!ans || ans.length !== 5){
      return { ok:false, reason:`Pytanie #${q.ord} musi mieć dokładnie 5 odpowiedzi.` };
    }

    // tylko dla lokalnej: suma ≤ 100
    if(g.kind === "fixed"){
      const sum = ans.reduce((s,a)=>s + (Number(a.fixed_points)||0), 0);
      if(sum > 100) return { ok:false, reason:`Pytanie #${q.ord}: suma punktów ${sum} (max 100).` };
    }
  }

  return { ok:true, reason:"" };
}

async function computeButtons(g){
  // edit: zawsze, chyba że poll_open
  const editOk = !(g.kind === "poll" && g.status === "poll_open");

  // setup (10×5)
  const setup = await validateGameSetup(g);

  // play:
  // - fixed: setup musi być OK
  // - poll: setup OK + status ready
  let playOk = false;
  if(g.kind === "fixed") playOk = setup.ok;
  if(g.kind === "poll") playOk = setup.ok && (g.status === "ready");

  // poll button:
  // tylko poll kind i setup OK (żeby nie wchodzić na pustą)
  const pollOk = (g.kind === "poll") && setup.ok;

  let reason = "";
  if(g.kind === "poll"){
    if(g.status === "poll_open") reason = `Wybrano: ${g.name} (SONDAŻ OTWARTY — edycja zablokowana)`;
    else if(g.status === "ready") reason = `Wybrano: ${g.name} (SONDAŻ GOTOWY)`;
    else reason = `Wybrano: ${g.name} (SONDAŻ — szkic)`;
  } else {
    reason = `Wybrano: ${g.name} (LOKALNA)`;
  }

  if(!setup.ok) reason = `${reason} • ${setup.reason}`;

  if(g.kind === "poll" && g.status !== "ready"){
    // dodatkowo tłumaczymy dlaczego nie “Graj”
    if(setup.ok) reason = `${reason} • Żeby zagrać: zamknij sondaż (status musi być READY).`;
  }

  return { editOk, playOk, pollOk, reason };
}

function selectCard(el, g){
  document.querySelectorAll(".card").forEach(c=>c.classList.remove("selected"));
  el.classList.add("selected");
  selectedGame = g;

  // wyłącz chwilowo akcje aż policzymy walidację
  selectedReady = { editOk:false, playOk:false, pollOk:false, reason:"Sprawdzam grę…" };
  syncActions();

  computeButtons(g).then((res)=>{
    selectedReady = res;
    syncActions();
  }).catch((e)=>{
    console.error("[builder] validate error:", e);
    selectedReady = { editOk:false, playOk:false, pollOk:false, reason:"Błąd walidacji gry." };
    syncActions();
  });
}

function cardGame(g){
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <div class="x" title="Usuń">✕</div>
    <div class="name"></div>
    <div class="meta"></div>
  `;
  el.querySelector(".name").textContent = g.name;

  const meta = (g.kind === "poll")
    ? `Sondażowa • status: ${(g.status||"draft")}`
    : "Lokalna • podane wartości";
  el.querySelector(".meta").textContent = meta;

  el.addEventListener("click", ()=>selectCard(el, g));

  el.querySelector(".x").addEventListener("click", async (e)=>{
    e.stopPropagation();
    const ok = await confirmModal({
      title:"Usuń Familiadę",
      text:`Na pewno usunąć "${g.name}"?`,
      okText:"Usuń",
      cancelText:"Anuluj",
    });
    if(!ok) return;

    const { error } = await sb().from("games").delete().eq("id", g.id);
    if(error){
      console.error(error);
      alert("Nie udało się usunąć. Sprawdź konsolę.");
      return;
    }
    await refresh();
  });

  return el;
}

function cardPlus(){
  const el = document.createElement("div");
  el.className = "card plus";
  el.innerHTML = `
    <div>
      <div class="big">+</div>
      <div class="small">Nowa</div>
      <div class="tiny">Lokalna / Sondażowa</div>
    </div>
  `;
  el.addEventListener("click", ()=>openTypeModal());
  return el;
}

async function createGame(kind){
  const payload = {
    name:"Nowa Familiada",
    owner_id: currentUser.id,
    kind, // "fixed" | "poll"
    status: kind === "poll" ? "draft" : "draft",
  };

  const { data: g, error } = await sb().from("games").insert(payload).select("*").single();
  if(error) throw error;

  // live_state dla sterowania
  await sb().from("live_state").insert({ game_id: g.id }).select().maybeSingle();

  return g;
}

async function refresh(){
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status,created_at")
    .order("created_at",{ascending:false});

  if(error){
    console.error(error);
    alert("Nie udało się wczytać gier.");
    return;
  }

  games = data || [];
  grid.innerHTML = "";
  games.forEach(g=>grid.appendChild(cardGame(g)));
  grid.appendChild(cardPlus());

  clearSelection();
}

document.addEventListener("DOMContentLoaded", async ()=>{
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout.addEventListener("click", async ()=>{
    await signOut();
    location.href = "index.html";
  });

  btnEdit.addEventListener("click", ()=>{
    if(!selectedGame) return;
    if(!selectedReady.editOk){
      alert("Nie można edytować (sondaż jest otwarty albo gra niepoprawna).");
      return;
    }
    location.href = `editor.html?id=${encodeURIComponent(selectedGame.id)}`;
  });

  btnPlay.addEventListener("click", ()=>{
    if(!selectedGame) return;
    if(!selectedReady.playOk){
      alert("Gra nie jest gotowa do uruchomienia.");
      return;
    }
    location.href = `control.html?id=${encodeURIComponent(selectedGame.id)}`;
  });

  btnPoll.addEventListener("click", ()=>{
    if(!selectedGame) return;
    if(!selectedReady.pollOk){
      alert("Sondaż jest dostępny dopiero gdy gra ma 10 pytań i każde ma 5 odpowiedzi.");
      return;
    }
    location.href = `polls.html?id=${encodeURIComponent(selectedGame.id)}`;
  });

  btnCancelType.addEventListener("click", closeTypeModal);
  typeOverlay.addEventListener("click", (e)=>{ if(e.target===typeOverlay) closeTypeModal(); });

  btnCreateFixed.addEventListener("click", async ()=>{
    closeTypeModal();
    const g = await createGame("fixed");
    await refresh();
    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  btnCreatePoll.addEventListener("click", async ()=>{
    closeTypeModal();
    const g = await createGame("poll");
    await refresh();
    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  await refresh();
});
