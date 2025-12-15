import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const dot = document.getElementById("dot");
const txt = document.getElementById("txt");
const btnFS = document.getElementById("btnFS");

const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");

let locked = false;

function setStatus(ok, t){
  dot.style.background = ok ? "#22e06f" : "#ff6b6b";
  txt.textContent = t;
}

async function ping(){
  try{
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "buzzer", p_key: key });
    setStatus(true, locked ? "Zablokowane" : "Gotowe");
  }catch{
    setStatus(false, "Brak połączenia");
  }
}

async function press(team){
  if(locked) return;

  try{
    const res = await sb().rpc("buzzer_press", { p_game_id: gameId, p_key: key, p_team: team });
    const accepted = !!res.data?.accepted;
    const winner = res.data?.winner;

    locked = !!res.data?.locked;

    // ten, który wygrał, “gaśnie”
    btnA.classList.toggle("winner", winner === "A");
    btnB.classList.toggle("winner", winner === "B");

    // blokada inputu po pierwszym zwycięzcy
    btnA.disabled = locked;
    btnB.disabled = locked;

    if(accepted){
      setStatus(true, "Zgłoszono!");
    }else{
      setStatus(true, "Za późno");
    }
  }catch{
    setStatus(false, "Błąd");
  }
}

btnA.addEventListener("click", ()=>press("A"));
btnB.addEventListener("click", ()=>press("B"));

btnFS.addEventListener("click", async ()=>{
  try{
    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }catch{}
});

// alert przy odświeżeniu (nie psuje UX, ale ostrzega)
window.addEventListener("beforeunload", (e)=>{
  e.preventDefault();
  e.returnValue = "";
});

// start
document.addEventListener("DOMContentLoaded", ()=>{
  if(!gameId || !key){
    setStatus(false, "Zły link");
    btnA.disabled = true;
    btnB.disabled = true;
    return;
  }

  // ping co 5s
  ping();
  setInterval(ping, 5000);

  // reset wyglądu
  btnA.disabled = false;
  btnB.disabled = false;
  btnA.classList.remove("winner");
  btnB.classList.remove("winner");
});
