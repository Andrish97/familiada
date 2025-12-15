import { sb } from "../core/supabase.js";
import { requireAuth, signOut } from "../core/auth.js";
import { guardDesktopOnly } from "../core/device-guard.js";
import { confirmModal } from "../core/modal.js";

guardDesktopOnly({ message: "Panel tworzenia Familiad jest dostępny tylko na komputerze." });

const grid = document.getElementById("grid");
const who = document.getElementById("who");
const btnLogout = document.getElementById("btnLogout");

const hint = document.getElementById("hint");
const btnEdit = document.getElementById("btnEdit");
const btnPlay = document.getElementById("btnPlay");
const btnPoll = document.getElementById("btnPoll");

const typeOverlay = document.getElementById("typeOverlay");
const btnCreateFixed = document.getElementById("btnCreateFixed");
const btnCreatePoll = document.getElementById("btnCreatePoll");
const btnCancelType = document.getElementById("btnCancelType");

let currentUser = null;
let games = [];
let selectedId = null;

function openTypeModal(){
  typeOverlay.style.display = "";
}
function closeTypeModal(){
  typeOverlay.style.display = "none";
}

function setHint(t){
  hint.textContent = t || "";
}

function selectedGame(){
  return games.find(g => g.id === selectedId) || null;
}

function updateActions(){
  const g = selectedGame();
  const has = !!g;

  btnEdit.disabled = !has;
  btnPlay.disabled = !has;

  // Sondaż tylko dla kind=poll
  btnPoll.disabled = !(has && g.kind === "poll");

  if(!has){
    setHint("Kliknij kafelek, żeby go zaznaczyć.");
    return;
  }

  const kindTxt = g.kind === "poll" ? "SONDAŻOWA" : "LOKALNA";
  setHint(`Zaznaczono: ${g.name} • ${kindTxt} • status: ${g.status}`);
}

function cardGame(g) {
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.id = g.id;

  const kindTxt = g.kind === "poll" ? "SONDAŻ" : "LOKALNA";
  const statusTxt = g.status || "draft";

  el.innerHTML = `
    <div class="x" title="Usuń">✕</div>
    <div class="name"></div>
    <div class="meta">${kindTxt} • status: ${statusTxt}<br/>Kliknij, aby zaznaczyć</div>
  `;
  el.querySelector(".name").textContent = g.name;

  el.addEventListener("click", () => {
    selectedId = g.id;
    renderSelection();
    updateActions();
  });

  el.querySelector(".x").addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await confirmModal({
      title: "Usuń Familiadę",
      text: `Na pewno usunąć "${g.name}"? Tego nie da się łatwo odkręcić.`,
      okText: "Usuń",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    const { error } = await sb().from("games").delete().eq("id", g.id);
    if (error) {
      console.error("[builder] delete error:", error);
      alert("Nie udało się usunąć. Sprawdź konsolę.");
      return;
    }

    if(selectedId === g.id) selectedId = null;
    await refresh();
  });

  return el;
}

function cardPlus() {
  const el = document.createElement("div");
  el.className = "card plus";
  el.innerHTML = `
    <div>
      <div class="big">+</div>
      <div class="small">Nowa Familiada</div>
      <div class="tiny">wybierz typ</div>
    </div>
  `;

  el.addEventListener("click", () => {
    openTypeModal();
  });

  return el;
}

function renderSelection(){
  Array.from(grid.querySelectorAll(".card")).forEach(c=>{
    const id = c.dataset.id;
    c.classList.toggle("selected", !!id && id === selectedId);
  });
}

async function refresh() {
  const { data, error } = await sb()
    .from("games")
    .select("id,name,created_at,kind,status")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[builder] list games error:", error);
    alert("Nie udało się wczytać listy gier. Sprawdź konsolę.");
    return;
  }

  games = data || [];

  grid.innerHTML = "";
  games.forEach((g) => grid.appendChild(cardGame(g)));
  grid.appendChild(cardPlus());

  renderSelection();
  updateActions();
}

async function createGame(kind){
  if (!currentUser?.id) {
    alert("Brak sesji użytkownika. Zaloguj się ponownie.");
    location.href = "index.html";
    return;
  }

  const name = kind === "poll" ? "Nowa Familiada (sondaż)" : "Nowa Familiada";

  const { data: game, error } = await sb()
    .from("games")
    .insert({
      name,
      owner_id: currentUser.id,
      kind,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[builder] create game error:", error);
    alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    return;
  }

  // live_state (pod sterowanie)
  const { error: lsErr } = await sb()
    .from("live_state")
    .insert({ game_id: game.id })
    .select()
    .maybeSingle();
  if (lsErr) console.warn("[builder] live_state insert warn:", lsErr);

  closeTypeModal();
  selectedId = game.id;
  await refresh();
}

async function validateFixedForPlay(gameId){
  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("id,ord,text")
    .eq("game_id", gameId)
    .order("ord",{ascending:true});
  if(qErr) throw qErr;

  if((qs||[]).length !== 5){
    return { ok:false, reason:`Familiada lokalna musi mieć dokładnie 5 pytań. Masz: ${(qs||[]).length}.` };
  }

  for(const q of qs){
    const { data: ans, error: aErr } = await sb()
      .from("answers")
      .select("fixed_points")
      .eq("question_id", q.id);
    if(aErr) throw aErr;

    const sum = (ans||[]).reduce((s,a)=>s + (Number(a.fixed_points)||0), 0);
    if(sum > 100){
      return { ok:false, reason:`Pytanie #${q.ord}: suma punktów = ${sum} (max 100).` };
    }
  }

  return { ok:true, reason:"" };
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  // modal
  btnCancelType.addEventListener("click", closeTypeModal);
  typeOverlay.addEventListener("click", (e)=>{
    if(e.target === typeOverlay) closeTypeModal();
  });

  btnCreateFixed.addEventListener("click", ()=>createGame("fixed"));
  btnCreatePoll.addEventListener("click", ()=>createGame("poll"));

  // akcje
  btnEdit.addEventListener("click", async ()=>{
    const g = selectedGame();
    if(!g) return;

    if(g.kind === "poll" && g.status === "poll_open"){
      alert("Sondaż jest otwarty — edycja zablokowana. Zamknij sondaż w panelu Sondaże.");
      return;
    }

    location.href = `editor.html?id=${encodeURIComponent(g.id)}`;
  });

  btnPlay.addEventListener("click", async ()=>{
    const g = selectedGame();
    if(!g) return;

    // poll musi być ready
    if(g.kind === "poll"){
      if(g.status !== "ready"){
        alert("Familiada sondażowa nie jest gotowa do gry. Najpierw zamknij sondaż (panel Sondaże).");
        return;
      }
      location.href = `control.html?id=${encodeURIComponent(g.id)}`;
      return;
    }

    // fixed: walidacja 5 pytań + suma<=100
    try{
      const res = await validateFixedForPlay(g.id);
      if(!res.ok){
        alert(res.reason);
        return;
      }
      location.href = `control.html?id=${encodeURIComponent(g.id)}`;
    }catch(e){
      console.error(e);
      alert("Nie udało się sprawdzić gry. Sprawdź konsolę.");
    }
  });

  btnPoll.addEventListener("click", async ()=>{
    const g = selectedGame();
    if(!g) return;
    if(g.kind !== "poll") return;

    // prosta walidacja: czy są pytania (sondaż bez pytań nie ma sensu)
    const { count, error } = await sb()
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("game_id", g.id);

    if(error){
      console.error(error);
      alert("Nie udało się sprawdzić pytań.");
      return;
    }

    if((count||0) < 1){
      alert("Najpierw dodaj pytania i odpowiedzi w edytorze, potem uruchom sondaż.");
      return;
    }

    // przejście do panelu sondaży (tam jest link/uruchom/zamknij/podgląd)
    location.href = "polls.html";
  });

  await refresh();
});
