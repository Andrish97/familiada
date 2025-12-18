import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");
const btnFS = document.getElementById("btnFS");

let state = "OFF"; // OFF | ON | PUSHED
let winner = null;

function apply() {
  const active = state === "ON";
  btnA.disabled = !active;
  btnB.disabled = !active;

  btnA.classList.toggle("winner", winner === "A");
  btnB.classList.toggle("winner", winner === "B");
}

async function sendBuzz(team) {
  if (state !== "ON") return;

  state = "PUSHED";
  winner = team;
  apply();

  await sb()
    .channel(`familiada-control:${gameId}`)
    .send({
      type: "broadcast",
      event: "BUZZ",
      payload: { team }
    });
}

function handleCmd(line) {
  const cmd = line.trim().toUpperCase();

  if (cmd === "OFF") {
    state = "OFF";
    winner = null;
  }

  if (cmd === "ON") {
    state = "ON";
    winner = null;
  }

  if (cmd === "RESET") {
    state = "ON";
    winner = null;
  }

  apply();
}

function sub() {
  sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, (e) => {
      handleCmd(e.payload?.line || "");
    })
    .subscribe();
}

btnA.onclick = () => sendBuzz("A");
btnB.onclick = () => sendBuzz("B");

btnFS.onclick = async () => {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  else await document.exitFullscreen();
};

document.addEventListener("DOMContentLoaded", () => {
  if (!gameId || !key) return;
  apply();
  sub();
});
