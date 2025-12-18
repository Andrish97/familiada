import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnFS = document.getElementById("btnFS");
const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");
const hud = document.getElementById("hud");
const dot = document.getElementById("dot");
const txt = document.getElementById("txt");

let mode = "OFF";        // OFF | ON
let pushed = null;       // null | "A" | "B"

function setHud(ok, t){
  dot.style.background = ok ? "#22e06f" : "#ff6b6b";
  txt.textContent = t || "";
}

function setOff(){
  mode = "OFF";
  pushed = null;
  document.body.classList.add("is-off");
  btnA.disabled = true;
  btnB.disabled = true;
  btnA.classList.remove("lit","dim");
  btnB.classList.remove("lit","dim");
  setHud(true, "OFF");
}

function setOn(){
  mode = "ON";
  pushed = null;
  document.body.classList.remove("is-off");
  btnA.disabled = false;
  btnB.disabled = false;
  btnA.classList.remove("lit","dim");
  btnB.classList.remove("lit","dim");
  setHud(true, "ON");
}

function setPushed(team){
  mode = "ON";
  pushed = team;

  btnA.disabled = true;
  btnB.disabled = true;

  if (team === "A") {
    btnA.classList.add("lit");
    btnB.classList.add("dim");
  } else {
    btnB.classList.add("lit");
    btnA.classList.add("dim");
  }

  setHud(true, `PUSHED ${team}`);
}

function handleCommand(line){
  const s = String(line || "").trim();

  if (!s) return;

  const up = s.toUpperCase();

  if (up === "OFF") return setOff();
  if (up === "ON") return setOn();
  if (up === "RESET") return setOn();

  // opcjonalnie: wymuszenie winnera z control
  if (up === "PUSHED A") return setPushed("A");
  if (up === "PUSHED B") return setPushed("B");

  console.warn("[buzzer] unknown cmd:", s);
}

function subscribeCommands(){
  const ch = sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event:"CMD" }, (payload) => {
      handleCommand(payload?.payload?.line);
    })
    .subscribe();

  return () => sb().removeChannel(ch);
}

// ✅ ping „żyję” możesz zostawić jak masz
async function ping(){
  try {
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "buzzer", p_key: key });
  } catch {
    setHud(false, "BRAK POŁĄCZENIA");
  }
}

async function press(team){
  if (mode !== "ON" || pushed) return;

  try{
    const res = await sb().rpc("buzzer_press", { p_game_id: gameId, p_key: key, p_team: team });
    const accepted = !!res.data?.accepted;

    if (accepted) setPushed(team);
    else setHud(true, "ZA PÓŹNO");
  } catch {
    setHud(false, "BŁĄD");
  }
}

btnA.addEventListener("click", () => press("A"));
btnB.addEventListener("click", () => press("B"));

btnFS.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});

document.addEventListener("DOMContentLoaded", () => {
  if (!gameId || !key) { setHud(false, "ZŁY LINK"); setOff(); return; }
  subscribeCommands();
  setOff();          // start domyślnie OFF
  ping();
  setInterval(ping, 5000);
});

// debug:
window.handleCommand = handleCommand;
