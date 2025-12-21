// js/pages/buzzer.js
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
let deviceId = localStorage.getItem(DEVICE_ID_KEY) || "";

const STATE = {
  OFF: "OFF",
  ON: "ON",
  PUSHED_A: "PUSHED_A",
  PUSHED_B: "PUSHED_B",
};

let cur = STATE.OFF;

// ===== fullscreen =====
function setFullscreenIcon() {
  if (!fsIco) return;
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    } else {
      await document.exitFullscreen?.();
    }
  } catch {}
  setFullscreenIcon();
}

// ===== UI =====
function show(state) {
  cur = state;

  const isOff = state === STATE.OFF;
  if (offScreen) offScreen.hidden = !isOff;
  if (arena) arena.hidden = isOff;

  btnA?.classList.remove("lit", "dim");
  btnB?.classList.remove("lit", "dim");

  if (btnA) btnA.disabled = true;
  if (btnB) btnB.disabled = true;

  if (isOff) return;

  if (state === STATE.ON) {
    btnA.disabled = false;
    btnB.disabled = false;
    btnA.classList.add("dim");
    btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_A) {
    btnA.classList.add("lit");
    btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_B) {
    btnB.classList.add("lit");
    btnA.classList.add("dim");
  }
}

// ===== snapshot =====
async function persistState() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
      p_patch: { state: cur },
    });
  } catch {}
}

async function restoreState() {
  if (!gameId || !key) return;
  try {
    const { data, error } = await sb().rpc("device_state_get", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
    });
    if (error) throw error;

    const st = String(data?.state ?? "OFF").toUpperCase();
    show(STATE[st] ? STATE[st] : STATE.OFF);
  } catch {
    show(STATE.OFF);
  }
}

// ===== realtime commands =====
let ch = null;
function ensureChannel() {
  if (ch) return ch;

  ch = sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, (msg) => {
      const line = String(msg?.payload?.line ?? "").trim().toUpperCase();

      if (line === "OFF") { show(STATE.OFF); persistState(); return; }
      if (line === "ON")  { show(STATE.ON);  persistState(); return; }

      if (line === "PUSHED A" || line === "PUSHED_A") { show(STATE.PUSHED_A); persistState(); return; }
      if (line === "PUSHED B" || line === "PUSHED_B") { show(STATE.PUSHED_B); persistState(); return; }
    })
    .subscribe();

  return ch;
}

// ===== click -> control =====
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

async function press(team, ev) {
  ev?.preventDefault?.();
  if (cur !== STATE.ON) return;

  show(team === "A" ? STATE.PUSHED_A : STATE.PUSHED_B);
  await persistState();
  await sendClick(team);
}

// ===== presence ping =====
async function ping() {
  if (!gameId || !key) return;
  try {
    const { data } = await sb().rpc("device_ping", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
      p_device_id: deviceId || null,
      p_meta: {},
    });

    if (data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch {}
}

// ===== touch UX: blokuj pinch + double-tap zoom =====
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

// ===== boot =====
btnFS?.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", setFullscreenIcon);

btnA?.addEventListener("touchstart", (e) => press("A", e), { passive: false });
btnB?.addEventListener("touchstart", (e) => press("B", e), { passive: false });
btnA?.addEventListener("click", (e) => press("A", e));
btnB?.addEventListener("click", (e) => press("B", e));

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();

  if (!gameId || !key) { show(STATE.OFF); return; }

  await restoreState();
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

window.__buzzer = { show, STATE };
