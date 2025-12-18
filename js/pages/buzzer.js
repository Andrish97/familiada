import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

const offScreen = document.getElementById("offScreen");
const arena = document.getElementById("arena");
const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");

const STATE = {
  OFF: "OFF",
  ON: "ON",
  PUSHED_A: "PUSHED_A",
  PUSHED_B: "PUSHED_B",
};

let cur = STATE.OFF;

// ---------- UI ----------
function setFullscreenIcon() {
  fsIco.textContent = document.fullscreenElement ? "▢" : "▢▢";
}

function show(state) {
  cur = state;

  const isOff = state === STATE.OFF;
  offScreen.hidden = !isOff;
  arena.hidden = isOff;

  // reset klasy
  btnA.classList.remove("win", "dim");
  btnB.classList.remove("win", "dim");

  if (state === STATE.ON) {
    btnA.disabled = false;
    btnB.disabled = false;
    return;
  }

  if (state === STATE.PUSHED_A) {
    btnA.disabled = true;
    btnB.disabled = true;
    btnA.classList.add("win");
    btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_B) {
    btnA.disabled = true;
    btnB.disabled = true;
    btnB.classList.add("win");
    btnA.classList.add("dim");
    return;
  }

  // OFF
  btnA.disabled = true;
  btnB.disabled = true;
}

// ---------- networking ----------
let ch = null;

function ensureChannel() {
  if (ch) return ch;
  ch = sb().channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, (msg) => {
      const line = String(msg?.payload?.line ?? "").trim();
      handleCmd(line);
    })
    .subscribe();
  return ch;
}

async function ping() {
  try {
    // jak masz swoje RPC public_ping – użyj go, ale nie musisz
    await sb().rpc("public_ping", { p_game_id: gameId, p_kind: "buzzer", p_key: key });
  } catch {}
}

async function sendClick(team) {
  // minimalnie: idź przez broadcast do control (jak chcesz),
  // ale skoro control i tak subskrybuje live_state,
  // najprościej: RPC buzzer_press (jeśli masz), albo broadcast.
  // Tu robimy broadcast "CLICK A/B" do CONTROL kanału.
  try{
    const ctl = sb().channel(`familiada-control:${gameId}`).subscribe();
    await ctl.send({
      type:"broadcast",
      event:"BUZZER_EVT",
      payload:{ line:`CLICK ${team}` }
    });
    // opcjonalnie odsub:
    sb().removeChannel(ctl);
  }catch{}
}

// ---------- commands ----------
function norm(line){
  return line.trim().toUpperCase();
}

function handleCmd(lineRaw) {
  const line = norm(lineRaw);

  if (line === "OFF") { show(STATE.OFF); return; }
  if (line === "ON") { show(STATE.ON); return; }
  if (line === "RESET") { show(STATE.ON); return; }

  // opcjonalnie: wymuszenie stanu
  if (line === "PUSHED A" || line === "PUSHED_A") { show(STATE.PUSHED_A); return; }
  if (line === "PUSHED B" || line === "PUSHED_B") { show(STATE.PUSHED_B); return; }
}

// ---------- input ----------
async function press(team) {
  if (cur !== STATE.ON) return;

  // ustaw lokalnie natychmiast
  show(team === "A" ? STATE.PUSHED_A : STATE.PUSHED_B);

  // wyślij event (do dopięcia w control)
  await sendClick(team);
}

btnA.addEventListener("click", () => press("A"));
btnB.addEventListener("click", () => press("B"));

// fullscreen
btnFS.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
  setFullscreenIcon();
});

document.addEventListener("fullscreenchange", setFullscreenIcon);

// blokuj iOS “bounce”
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive:false });

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();

  if (!gameId || !key) {
    show(STATE.OFF);
    return;
  }

  // domyślnie OFF (jak chciałeś)
  show(STATE.OFF);

  ensureChannel();

  ping();
  setInterval(ping, 5000);
});
