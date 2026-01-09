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
let deviceId = localStorage.getItem(DEVICE_ID_KEY);

if (!deviceId) {
  deviceId = "buz_" + (crypto?.randomUUID?.() || String(Math.random()).slice(2));
  deviceId = deviceId.replace(/-/g, "").slice(0, 24);
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
}

const STATE = {
  OFF: "OFF",
  ON: "ON",
  PUSHED_A: "PUSHED_A",
  PUSHED_B: "PUSHED_B",
};

let cur = STATE.OFF;

/* ========= FULLSCREEN (+ iOS fallback) ========= */
let pseudoFS = false;

function isIOSSafari() {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

function setFullscreenIcon() {
  if (!fsIco) return;
  const isReal = !!document.fullscreenElement;
  fsIco.textContent = (isReal || pseudoFS) ? "⧉" : "▢";
}

function setPseudoFS(on) {
  pseudoFS = !!on;
  document.documentElement.classList.toggle("pseudoFS", pseudoFS);
  // iOS: próba schowania paska adresu
  setTimeout(() => window.scrollTo(0, 1), 50);
  setFullscreenIcon();
}

async function toggleFullscreen() {
  
  if (isIOSSafari() && !window.navigator.standalone) {
    // w Safari nie zrobimy prawdziwego FS; pokaż instrukcję webapp
    document.documentElement.classList.toggle("showA2HS");
    return;
  }

  try {
    // wyjście
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
      setFullscreenIcon();
      return;
    }
    if (pseudoFS) {
      setPseudoFS(false);
      return;
    }

    // wejście (spróbuj prawdziwego fullscreen)
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) throw new Error("Fullscreen API not available");
    await req.call(el, { navigationUI: "hide" });

    setFullscreenIcon();
  } catch (e) {
    // iOS / blokady / iframe => pseudo-fullscreen
    setPseudoFS(true);
    console.warn("[buzzer] fullscreen fallback:", e);
  }
}

/* ========= UI ========= */
function show(state) {
  cur = state;

  const isOff = state === STATE.OFF;

  offScreen && (offScreen.hidden = !isOff);
  arena && (arena.hidden = isOff);

  btnA?.classList.remove("lit", "dim");
  btnB?.classList.remove("lit", "dim");

  btnA && (btnA.disabled = true);
  btnB && (btnB.disabled = true);

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

/* ========= SNAPSHOT ========= */
async function persistState() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
      p_patch: { state: cur },
    });
  } catch (e) {
    console.warn("[buzzer] persist failed", e);
  }
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

    const st = String(data?.state || "OFF").toUpperCase();
    show(STATE[st] ?? STATE.OFF);
  } catch {
    show(STATE.OFF);
  }
}

/* ========= REALTIME ========= */
let ch = null;
function ensureChannel() {
  if (ch) return ch;

  ch = sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, (msg) => {
      const line = String(msg?.payload?.line || "").toUpperCase().trim();

      if (line === "OFF") return show(STATE.OFF), persistState();
      if (line === "ON")  return show(STATE.ON),  persistState();
      if (line === "RESET") return show(STATE.ON), persistState();

      if (line === "PUSHED A" || line === "PUSHED_A")
        return show(STATE.PUSHED_A), persistState();

      if (line === "PUSHED B" || line === "PUSHED_B")
        return show(STATE.PUSHED_B), persistState();
    })
    .subscribe();

  return ch;
}

/* ========= CLICK -> CONTROL ========= */
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
  } catch (e) {
    console.warn("[buzzer] click failed", e);
  }
}

async function press(team, ev) {
  ev?.preventDefault?.();
  if (cur !== STATE.ON) return;

  show(team === "A" ? STATE.PUSHED_A : STATE.PUSHED_B);
  await persistState();
  await sendClick(team);
}

/* ========= PRESENCE ========= */
async function ping() {
  if (!gameId || !key) return;

  const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
      p_device_id: deviceId,
      p_meta: {},
  });

  if (error) {
    console.warn("[buzzer] device_ping error:", error);
    return;
  }

  // jeśli funkcja zwraca device_id (u Ciebie tak robi dla display), utrzymaj spójność
  if (data?.device_id && data.device_id !== deviceId) {
    deviceId = data.device_id;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
}

/* ========= BOOT ========= */
btnFS?.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", setFullscreenIcon);

btnA?.addEventListener("touchstart", (e) => press("A", e), { passive: false });
btnB?.addEventListener("touchstart", (e) => press("B", e), { passive: false });
btnA?.addEventListener("click", (e) => press("A", e));
btnB?.addEventListener("click", (e) => press("B", e));

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();

  if (window.navigator.standalone) {
    document.documentElement.classList.add("webapp");
  }

  if (!gameId || !key) {
    show(STATE.OFF);
    return;
  }

  await restoreState();
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

window.__buzzer = { show, STATE };
