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
let selectedId = null;

function setHint(t){ hint.textContent = t || ""; }

function setButtons(){
  const g = games.find(x => x.id === selectedId) || null;
  const has = !!g;

  btnEdit.disabled = !has;
  btnPlay.disabled = !has;
  btnPoll.disabled = !has;

  if(!g){
    setHint("Kliknij kafelek, żeby go zaznaczyć.");
    btnPoll.disabled = true;
    return;
  }

  if(g.kind === "fixed"){
    btnPoll.disabled = true;
    setHint("Gra lokalna: Edytuj / Graj. (Sondaż niedostępny)");
  } else {
    // poll
    btnPoll.disabled = false;
    if(g.status !== "ready"){
      setHint(`Gra sondażowa: status = ${g.status}. Do grania musi być READY (zamknięty i przeliczony).`);
    } else {
      setHint("Gra sondażowa READY: możesz grać.");
    }
  }

  // blokada Graj dla poll jeśli nie ready
  if(g.kind === "poll" && g.status !== "ready"){
    btnPlay.disabled = true;
  }
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

  const meta = g.kind === "fixed"
    ? "Lokalna (punkty wpisane)"
    : `Sondażowa (${g.status})`;

  el.querySelector(".meta").textContent = meta;

  el.addEventListener("click", ()=>{
    selectedId = g.id;
    Array.from(grid.querySelectorAll(".card")).forEach(c=>c.classList.remove("selected"));
    el.classList.add("selected");
    setButtons();
  });

  el.querySelector(".x").addEventListener("click", async (e)=>{
    e.stopPropagation();
    const ok = await confirmModal({
      title: "Usuń Familiadę",
      text: `Na pewno usunąć "${g.name}"?`,
      okText: "Usuń",
      cancelText: "Anuluj",
    });
    if(!ok) return;

    const { error } = await sb().from("games").delete().eq("id", g.id);
    if(error){
      console.error("[builder] delete error:", error);
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
  el.innerHTML = `<div><div class="big">+</div><div class="small">Nowa</div><div class="tiny">Wybierz typ</div></div>`;
  el.addEventListener("click", ()=>{
    typeOverlay.style.display = "";
  });
  return el;
}

async function createGame(kind){
  if(!currentUser?.id){
    alert("Brak sesji. Zaloguj się ponownie.");
    location.href = "index.html";
    return;
  }

  const { data: game, error } = await sb()
    .from("games")
    .insert({
      name: "Nowa Familiada",
      owner_id: currentUser.id,
      kind,
      status: (kind === "poll") ? "draft" : "draft",
    })
    .select("*")
    .single();

  if(error){
    console.error("[builder] create game error:", error);
    alert("Nie udało się utworzyć gry. Sprawdź konsolę.");
    return;
  }

  // live_state zawsze tworzymy (pod display/buzzer/host)
  const { error: lsErr } = await sb().from("live_state").insert({ game_id: game.id });
  if(lsErr){
    console.warn("[builder] live_state insert warn:", lsErr);
  }

  location.href = `editor.html?id=${encodeURIComponent(game.id)}`;
}

async function refresh(){
  const { data, error } = await sb()
    .from("games")
    .select("id,name,kind,status,created_at")
    .order("created_at", { ascending:false });

  if(error){
    console.error("[builder] list games error:", error);
    alert("Nie udało się wczytać listy. Sprawdź konsolę.");
    return;
  }

  games = data || [];
  selectedId = null;

  grid.innerHTML = "";
  games.forEach(g => grid.appendChild(cardGame(g)));
  grid.appendChild(cardPlus());

  setButtons();
}

document.addEventListener("DOMContentLoaded", async ()=>{
  currentUser = await requireAuth("index.html");
  who.textContent = currentUser?.email || "—";

  btnLogout.addEventListener("click", async ()=>{
    await signOut();
    location.href = "index.html";
  });

  // modal
  btnCancelType.addEventListener("click", ()=> typeOverlay.style.display = "none");
  btnCreateFixed.addEventListener("click", async ()=>{
    typeOverlay.style.display = "none";
    await createGame("fixed");
  });
  btnCreatePoll.addEventListener("click", async ()=>{
    typeOverlay.style.display = "none";
    await createGame("poll");
  });

  // akcje na zaznaczonej grze
  btnEdit.addEventListener("click", ()=>{
    if(!selectedId) return;
    location.href = `editor.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnPlay.addEventListener("click", async ()=>{
    if(!selectedId) return;
    const g = games.find(x=>x.id === selectedId);
    if(!g) return;

    if(g.kind === "poll" && g.status !== "ready"){
      alert("Nie możesz grać: sondaż nie jest zamknięty i przeliczony (READY).");
      return;
    }

    location.href = `control.html?id=${encodeURIComponent(selectedId)}`;
  });

  btnPoll.addEventListener("click", async ()=>{
    if(!selectedId) return;
    const g = games.find(x=>x.id === selectedId);
    if(!g) return;

    if(g.kind !== "poll"){
      return;
    }
    location.href = `polls.html?id=${encodeURIComponent(selectedId)}`;
  });

  await refresh();
});
