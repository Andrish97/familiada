import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");
const off = document.getElementById("off");
const arena = document.getElementById("arena");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

function setFullscreenIcon(){
  fsIco.textContent = document.fullscreenElement ? "▢" : "▢▢";
}

function setOff(){
  off.hidden = false;
  arena.style.display = "none";
  btnFS.style.display = "none"; // OFF = brak czegokolwiek
}

function setOn(){
  off.hidden = true;
  arena.style.display = "";
  btnFS.style.display = "";

  // obie zgaszone, ale aktywne
  btnA.disabled = false;
  btnB.disabled = false;

  btnA.classList.add("is-dim");
  btnB.classList.add("is-dim");
  btnA.classList.remove("is-lit");
  btnB.classList.remove("is-lit");
}

function setPushed(winner){
  off.hidden = true;
  arena.style.display = "";
  btnFS.style.display = "";

  // blokada
  btnA.disabled = true;
  btnB.disabled = true;

  // winner świeci
  if (winner === "A") {
    btnA.classList.remove("is-dim");
    btnA.classList.add("is-lit");
    btnB.classList.add("is-dim");
    btnB.classList.remove("is-lit");
  } else {
    btnB.classList.remove("is-dim");
    btnB.classList.add("is-lit");
    btnA.classList.add("is-dim");
    btnA.classList.remove("is-lit");
  }
}

function applyCmd(lineRaw){
  const line = String(lineRaw ?? "").trim();
  if (!line) return;

  const up = line.toUpperCase();
  if (up === "OFF") { setOff(); return; }
  if (up === "ON") { setOn(); return; }
  if (up === "RESET") { setOn(); return; }
  if (up === "PUSHED A") { setPushed("A"); return; }
  if (up === "PUSHED B") { setPushed("B"); return; }
}

async function press(team){
  // działa tylko w ON (czyli OFF ukrywa arenę, PUSHED ma disabled)
  if (btnA.disabled || btnB.disabled) return;

  // UX: natychmiast blokujemy klik
  btnA.disabled = true;
  btnB.disabled = true;

  try{
    await sb().rpc("buzzer_press", { p_game_id: gameId, p_key: key, p_team: team });
  }catch{
    // jak błąd, wróć do ON
    setOn();
  }
}

function ensureChannel(){
  return sb().channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event:"BUZZER_CMD" }, (msg)=>{
      applyCmd(msg?.payload?.line);
    })
    .subscribe();
}

// blok swipe/scroll
document.addEventListener("touchmove", (e)=> e.preventDefault(), { passive:false });

// fullscreen
btnFS.addEventListener("click", async () => {
  try{
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch{}
  setFullscreenIcon();
});
document.addEventListener("fullscreenchange", setFullscreenIcon);

btnA.addEventListener("click", ()=> press("A"));
btnB.addEventListener("click", ()=> press("B"));

async function ping(){
  try { await sb().rpc("public_ping", { p_game_id: gameId, p_kind:"buzzer", p_key:key }); } catch {}
}

document.addEventListener("DOMContentLoaded", ()=>{
  setFullscreenIcon();

  if (!gameId || !key) {
    setOff();
    return;
  }

  // domyślnie OFF
  setOff();

  ensureChannel();

  ping();
  setInterval(ping, 5000);

  // debug lokalny:
  window.__buzzer = { setOff, setOn, setPushed, applyCmd };
});
