import { sb } from "../core/supabase.js";

// ===== anti-zoom iOS (zostawiamy) =====
document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false });

let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 250) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

document.addEventListener("touchstart", (e) => {
  if (e.touches && e.touches.length > 1) e.preventDefault();
}, { passive: false });
document.addEventListener("touchmove", (e) => {
  if (e.touches && e.touches.length > 1) e.preventDefault();
}, { passive: false });

// ===== params =====
const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

// ===== DOM =====
const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

const offScreen = document.getElementById("offScreen");
const arena = document.getElementById("arena");
const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");

// ===== state =====
const STATE = {
  OFF: "OFF",
  ON: "ON",
  PUSHED_A: "PUSHED_A",
  PUSHED_B: "PUSHED_B",
};
let cur = STATE.OFF;

// ===== fullscreen =====
function setFullscreenIcon() {
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}

// ===== UI =====
function show(state) {
  cur = state;

  const isOff = state === STATE.OFF;
  offScreen.hidden = !isOff;
  arena.hidden = isOff;

  arena.style.pointerEvents = isOff ? "none" : "";
  arena.style.visibility = isOff ? "hidden" : "visible";

  btnA.classList.remove("lit", "dim");
  btnB.classList.remove("lit", "dim");

  if (isOff) {
    btnA.disabled = true;
    btnB.disabled = true;
    return;
  }

  if (state === STATE.ON) {
    btnA.disabled = false;
    btnB.disabled = false;
    btnA.classList.add("dim");
    btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_A) {
    btnA.disabled = true;
    btnB.disabled = true;
    btnA.classList.add("lit");
    btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_B) {
    btnA.disabled = true;
    btnB.disabled = true;
    btnB.classList.add("lit");
    btnA.classList.add("dim");
  }
}

function norm(line) {
  return String(line ?? "").trim().toUpperCase();
}

// ===== realtime commands (od controla) =====
let ch = null;
function ensureChannel() {
  if (ch) return ch;
  ch = sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, (msg) => {
      const line = norm(msg?.payload?.line);
      handleCmd(line);
    })
    .subscribe();
  return ch;
}

function handleCmd(line) {
  if (line === "OFF") return show(STATE.OFF);
  if (line === "ON") return show(STATE.ON);
  if (line === "PUSHED A" || line === "PUSHED_A") return show(STATE.PUSHED_A);
  if (line === "PUSHED B" || line === "PUSHED_B") return show(STATE.PUSHED_B);
}

// ===== presence + snapshot =====
async function ping() {
  try {
    await sb().rpc("device_ping_v2", { p_game_id: gameId, p_kind: "buzzer", p_key: key });
  } catch {}
}

async function loadSnapshotOrOff() {
  try {
    const { data, error } = await sb().rpc("get_public_snapshot_v2", {
      p_game_id: gameId,
      p_kind: "buzzer",
      p_key: key,
    });
    if (error) throw error;

    const devices = data?.devices || {};
    const st = String(devices?.buzzer_state || "OFF").toUpperCase();

    if (STATE[st]) show(STATE[st]);
    else show(STATE.OFF);
  } catch {
    show(STATE.OFF);
  }
}

// ===== input =====
async function press(team, ev) {
  try { ev?.preventDefault?.(); } catch {}

  if (cur !== STATE.ON) return;

  // natychmiast lokalnie
  show(team === "A" ? STATE.PUSHED_A : STATE.PUSHED_B);

  // atomowo w DB (kto pierwszy)
  try {
    await sb().rpc("buzzer_press_v2", { p_game_id: gameId, p_key: key, p_team: team });
  } catch {
    // jeśli nie przeszło, control i tak to wyprostuje snapshotem
  }
}

btnA.addEventListener("touchstart", (e) => press("A", e), { passive: false });
btnB.addEventListener("touchstart", (e) => press("B", e), { passive: false });
btnA.addEventListener("click", (e) => press("A", e));
btnB.addEventListener("click", (e) => press("B", e));

// fullscreen
btnFS.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
});
document.addEventListener("fullscreenchange", setFullscreenIcon);

// ===== main =====
document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();

  if (!gameId || !key) {
    show(STATE.OFF);
    return;
  }

  await loadSnapshotOrOff();
  ensureChannel();

  await ping();
  setInterval(ping, 5000);
});

window.__buzzer = { show, STATE };
