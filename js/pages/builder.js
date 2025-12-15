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

// modal typu (jak w Twoim HTML)
const typeOverlay = document.getElementById("typeOverlay");
const btnCreateFixed = document.getElementById("btnCreateFixed");
const btnCreatePoll = document.getElementById("btnCreatePoll");
const btnCancelType = document.getElementById("btnCancelType");

// jeśli masz przycisk “Nowa” w HTML — podepnij
const btnNew = document.getElementById("btnNew");

let currentUser = null;
let games = [];
let selectedId = null;

const QN = 10;
const AN = 5;

function show(el, on){ if(el) el.style.display = on ? "" : "none"; }

function openTypeModal(){ show(typeOverlay, true); }
function closeTypeModal(){ show(typeOverlay, false); }

async function listGames(){
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at,kind,status")
    .order("created_at", { ascending:false });

  if(error) throw error;
  return data || [];
}

async function loadQuestions(gameId){
  const { data, error } = await sb()
    .from("questions")
    .select("id,ord,text,mode")
    .eq("game_id", gameId)
    .order("ord", { ascending:true });

  if(error) throw error;
  return data || [];
}

async function loadAnswers(qid){
  const { data, error } = await sb()
    .from("answers")
    .select("id,ord,text,fixed_points")
    .eq("question_id", qid)
    .order("ord", { ascending:true });

  if(error) throw error;
  return data || [];
}

async function ensureLive(gameId){
  const { data, error } = await sb()
    .from("live_state")
    .select("game_id")
    .eq("game_id", gameId)
    .maybeSingle();

  if(error) throw error;
  if(data?.game_id) return;

  const { error: insErr } = await sb().from("live_state").insert({ game_id: gameId });
  if(insErr) throw insErr;
}

async function createGame(kind){
  // NIE tworzymy pytań/odpowiedzi. Tylko gra.
  const { data: game, error } = await sb()
    .from("games")
    .insert({
      name: kind === "poll" ? "Nowa Familiada (Sondaż)" : "Nowa Familiada",
      owner_id: currentUser.id,
      kind: kind === "poll" ? "poll" : "fixed",
      status: "draft",
    })
    .select("id,name,kind,status")
    .single();

  if(error) throw error;

  await ensureLive(game.id);
  return game;
}

async function deleteGame(game){
  const ok = await confirmModal({
    title:"Usuń Familiadę",
    text:`Na pewno usunąć "${game.name}"?`,
    okText:"Usuń",
    cancelText:"Anuluj",
  });
  if(!ok) return;

  const { error } = await sb().from("games").delete().eq("id", game.id);
  if(error){
    console.error("[builder] delete error:", error);
    alert("Nie udało się usunąć. Sprawdź konsolę.");
  }
}

function setButtonsState({ hasSel, canEdit, canPlay, canPoll }){
  if(btnEdit) btnEdit.disabled = !hasSel || !canEdit;
  if(btnPlay) btnPlay.disabled = !hasSel || !canPlay;
  if(btnPoll) btnPoll.disabled = !hasSel || !canPoll;
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

  const meta = el.querySelector(".meta");
  const st = (g.status || "draft").toUpperCase();
  const kind = (g.kind || "fixed") === "poll" ? "SONDAŻ" : "LOKALNA";
  meta.textContent = `${kind} • ${st}`;

  el.addEventListener("click", async ()=>{
    selectedId = g.id;
    render();
    await updateActionState(); // dociągnij walidację
  });

  el.querySelector(".x").addEventListener("click", async (e)=>{
    e.stopPropagation();
    await deleteGame(g);
    await refresh();
  });

  return el;
}

function render(){
  grid.innerHTML = "";
  for(const g of games){
    const el = cardGame(g);
    if(g.id === selectedId) el.classList.add("selected");
    grid.appendChild(el);
  }

  // nic nie wybrane => wszystko off
  setButtonsState({ hasSel: !!selectedId, canEdit:false, canPlay:false, canPoll:false });
}

async function validateGameForRules(game){
  // Zasada: 10 pytań, 5 odpowiedzi.
  // Dla lokalnej: dodatkowo suma punktów <= 100 na pytanie.
  // Dla sondażu:
  // - status poll_open => NIE gra, NIE edycja
  // - status ready => można grać
  // - draft => można edytować, można wejść w panel sondażu, ale nie grać
  const res = {
    okQuestions: false,
    okAnswers: false,
    okPoints: true,
    reason: "",
  };

  const qs = await loadQuestions(game.id);
  if(qs.length !== QN){
    res.reason = `Wymagane ${QN} pytań. Masz: ${qs.length}.`;
    return res;
  }
  res.okQuestions = true;

  for(const q of qs){
    const ans = await loadAnswers(q.id);
    if(ans.length !== AN){
      res.reason = `Pytanie #${q.ord}: wymagane ${AN} odpowiedzi. Masz: ${ans.length}.`;
      res.okAnswers = false;
      return res;
    }
    res.okAnswers = true;

    if(game.kind === "fixed"){
      const sum = ans.reduce((s,a)=> s + (Number(a.fixed_points)||0), 0);
      if(sum > 100){
        res.okPoints = false;
        res.reason = `Pytanie #${q.ord}: suma punktów = ${sum} (max 100).`;
        return res;
      }
    }
  }

  return res;
}

async function updateActionState(){
  const sel = games.find(g => g.id === selectedId) || null;
  if(!sel){
    setButtonsState({ hasSel:false, canEdit:false, canPlay:false, canPoll:false });
    return;
  }

  // statusowe blokady
  const kind = sel.kind || "fixed";
  const status = sel.status || "draft";

  // jeśli poll_open: nic nie wolno poza wejściem w panel sondażu
  if(kind === "poll" && status === "poll_open"){
    setButtonsState({ hasSel:true, canEdit:false, canPlay:false, canPoll:true });
    return;
  }

  // walidacja zasad 10×5 (+ suma<=100 dla fixed) decyduje o “Graj”
  let rules;
  try{
    rules = await validateGameForRules(sel);
  }catch(e){
    console.error("[builder] validate error:", e);
    setButtonsState({ hasSel:true, canEdit:true, canPlay:false, canPoll:(kind==="poll") });
    return;
  }

  const canEdit = true; // jeśli nie poll_open, można edytować
  const canPoll = (kind === "poll"); // panel sondażu tylko dla poll

  // gra:
  // - fixed: musi spełniać reguły
  // - poll: musi mieć status=ready i spełniać reguły
  const canPlay =
    (kind === "fixed" && rules.okQuestions && rules.okAnswers && rules.okPoints) ||
    (kind === "poll" && status === "ready" && rules.okQuestions && rules.okAnswers);

  setButtonsState({ hasSel:true, canEdit, canPlay, canPoll });
}

async function refresh(){
  games = await listGames();
  if(selectedId && !games.some(g=>g.id === selectedId)) selectedId = null;

  render();
  await updateActionState();
}

document.addEventListener("DOMContentLoaded", async ()=>{
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout?.addEventListener("click", async ()=>{
    await signOut();
    location.href = "index.html";
  });

  // jeśli masz btnNew w HTML, super; jeśli nie masz - i tak modal można otworzyć inaczej
  btnNew?.addEventListener("click", openTypeModal);

  btnCancelType?.addEventListener("click", closeTypeModal);

  btnCreateFixed?.addEventListener("click", async ()=>{
    closeTypeModal();
    try{
      const g = await createGame("fixed");
      selectedId = g.id;
      await refresh();
    }catch(e){
      console.error(e);
      alert("Nie udało się utworzyć gry.");
    }
  });

  btnCreatePoll?.addEventListener("click", async ()=>{
    closeTypeModal();
    try{
      const g = await createGame("poll");
      selectedId = g.id;
      await refresh();
    }catch(e){
      console.error(e);
      alert("Nie udało się utworzyć gry.");
    }
  });

  btnEdit?.addEventListener("click", async ()=>{
    if(!selectedId) return;

    const sel = games.find(g=>g.id === selectedId);
    if(sel?.kind === "poll" && sel?.status === "poll_open"){
      alert("Sondaż jest otwarty — edycja zablokowana.");
      return;
    }

    location.href = `editor.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnPlay?.addEventListener("click", async ()=>{
    if(!selectedId) return;

    const sel = games.find(g=>g.id === selectedId);
    if(!sel) return;

    if(sel.kind === "poll" && sel.status !== "ready"){
      alert("Nie można grać: sondaż nie jest zakończony (status nie READY).");
      return;
    }

    const rules = await validateGameForRules(sel);
    if(!(rules.okQuestions && rules.okAnswers && rules.okPoints)){
      alert(rules.reason || "Gra nie spełnia wymagań.");
      await updateActionState();
      return;
    }

    location.href = `control.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnPoll?.addEventListener("click", async ()=>{
    if(!selectedId) return;

    const sel = games.find(g=>g.id === selectedId);
    if(!sel) return;

    if(sel.kind !== "poll"){
      alert("To nie jest Familiada sondażowa.");
      return;
    }

    location.href = `polls.html?id=${encodeURIComponent(selectedId)}`;
  });

  await refresh();
});
