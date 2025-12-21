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

const DEVICE_ID_KEY = "familiada:deviceId:buzzer";
let deviceId = localStorage.getItem(DEVICE_ID_KEY) || "phone";

const STATE = {
  OFF: "OFF",
  ON: "ON",
  PUSHED_A: "PUSHED_A",
  PUSHED_B: "PUSHED_B",
};

let cur = STATE.OFF;

// fullscreen
function setFullscreenIcon() {
  if (fsIco) fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
  setFullscreenIcon();
}

// UI
function show(state) {
  cur = state;

  const isOff = state === STATE.OFF;
  if (offScreen) offScreen.classList.toggle("hidden", !isOff);
  if (arena) arena.classList.toggle("hidden", isOff);

  if (btnA) btnA.disabled = true;
  if (btnB) btnB.disabled = true;

  btnA?.classList.remove("lit", "dim");
  btnB?.classList.remove("lit", "dim");

  if (isOff) return;

  if (state === STATE.ON) {
    btnA.disabled = false; btnB.disabled = false;
    btnA.classList.add("dim"); btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_A) {
    btnA.classList.add("lit"); btnB.classList.add("dim");
    return;
  }
  if (state === STATE.PUSHED_B) {
    btnB.classList.add("lit"); btnA.classList.add("dim");
  }
}

// snapshot
async function persistBuzzerState() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_kind: "buzzer",
      p_key: key,
      p_patch: { state: cur },
    });
  } catch {}
}

async function restoreFromSnapshot() {
  if (!gameId || !key) return;
  try {
    const { data } = await sb().rpc("device_state_get", {
      p_game_id: gameId,
      p_kind: "buzzer",
      p_key: key,
    });
    const st = String(data?.state || "OFF").toUpperCase();
    if (STATE[st]) show(STATE[st]);
    else show(STATE.OFF);
  } catch {
    show(STATE.OFF);
  }
}

// realtime: komendy z controla
let ch = null;
function ensureChannel() {
  if (ch) return ch;
  ch = sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, (msg) => {
      const line = String(msg?.payload?.line ?? "").trim().toUpperCase();
      if (line === "OFF") { show(STATE.OFF); persistBuzzerState(); return; }
      if (line === "ON")  { show(STATE.ON);  persistBuzzerState(); return; }
      if (line === "PUSHED A" || line === "PUSHED_A") { show(STATE.PUSHED_A); persistBuzzerState(); return; }
      if (line === "PUSHED B" || line === "PUSHED_B") { show(STATE.PUSHED_B); persistBuzzerState(); return; }
    })
    .subscribe();
  return ch;
}

// wysyłka kliknięcia do controla (event BUZZER_EVT na kanale control)
async function sendClick(team) {
  try {
    const ctl = sb().channel(`familiada-control:${gameId}`);
    await ctl.subscribe();
    await ctl.send({
      type: "broadcast",
      event: "BUZZER_EVT",
      payload: { line: `CLICK ${team}` },
    });
    sb().removeChannel(ctl);
  } catch {}
}

async function press(team) {
  if (cur !== STATE.ON) return;
  show(team === "A" ? STATE.PUSHED_A : STATE.PUSHED_B);
  await persistBuzzerState();
  await sendClick(team);
}

// presence ping
async function ping() {
  try {
    await sb().rpc("device_ping", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
      p_device_id: deviceId,
    });
  } catch {}
}

// input
btnA?.addEventListener("touchstart", (e) => { e.preventDefault(); press("A"); }, { passive:false });
btnB?.addEventListener("touchstart", (e) => { e.preventDefault(); press("B"); }, { passive:false });
btnA?.addEventListener("click", () => press("A"));
btnB?.addEventListener("click", () => press("B"));

btnFS?.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", setFullscreenIcon);

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();
  if (!gameId || !key) { show(STATE.OFF); return; }

  await restoreFromSnapshot();
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

window.__buzzer = { show, STATE };
