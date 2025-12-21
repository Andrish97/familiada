// js/pages/host.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paper = document.getElementById("paper");
const paperText = document.getElementById("paperText");
const hint = document.getElementById("hint");
const blank = document.getElementById("blank");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

const DEVICE_ID_KEY = "familiada:deviceId:host";
let deviceId = localStorage.getItem(DEVICE_ID_KEY) || "";

// stan
let hidden = false;
let lastText = "";

// ===== fullscreen =====
function setFullscreenIcon() {
  if (!fsIco) return;
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      // Fullscreen API bywa ograniczone na iOS Safari — ale to jest poprawne wywołanie
      await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    } else {
      await document.exitFullscreen?.();
    }
  } catch {}
  setFullscreenIcon();
}

// ===== UI =====
function renderHint() {
  if (!hint) return;
  hint.textContent = hidden
    ? "Podwójne dotknięcie / dwuklik aby odsłonić"
    : "Podwójne dotknięcie / dwuklik aby zasłonić";
}

function setHidden(on) {
  hidden = !!on;
  if (blank) blank.hidden = !hidden;
  renderHint();
  if (!hidden && paperText) paperText.textContent = lastText;
}

function setText(t) {
  lastText = String(t ?? "");
  if (!hidden && paperText) paperText.textContent = lastText;
}

function clearText() {
  lastText = "";
  if (!hidden && paperText) paperText.textContent = "";
}

// ===== snapshot (device_state) =====
async function persistState() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_device_type: "host",
      p_key: key,
      p_patch: { hidden, text: lastText },
    });
  } catch {}
}

async function restoreState() {
  if (!gameId || !key) return;
  try {
    const { data, error } = await sb().rpc("device_state_get", {
      p_game_id: gameId,
      p_device_type: "host",
      p_key: key,
    });
    if (error) throw error;

    const st = data || {};
    // najpierw tekst, potem hidden (żeby odsłonięcie pokazało treść)
    setText(typeof st.text === "string" ? st.text : "");
    setHidden(!!st.hidden);
  } catch {
    setText("");
    setHidden(false);
  }
}

// ===== double tap / double click (działa wszędzie) =====
const DOUBLE_MS = 320;
let lastTapAt = 0;

function yOK(y) {
  const h = window.innerHeight || 1;
  return y > 70 && y < h - 70;
}

async function toggleCover() {
  setHidden(!hidden);
  await persistState();
}

function handleTap(y) {
  if (!yOK(y)) return;
  const now = Date.now();
  if (now - lastTapAt <= DOUBLE_MS) {
    lastTapAt = 0;
    toggleCover();
  } else {
    lastTapAt = now;
  }
}

// dotyk
document.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
      return;
    }
    const y = e.touches?.[0]?.clientY ?? 0;
    handleTap(y);
  },
  { passive: false }
);

// desktop: dblclick na CAŁEJ kartce i okładce (nie tylko na dokumencie)
function dbl(e) {
  if (e.target?.closest?.("#btnFS")) return;
  handleTap(e.clientY);
}
paper?.addEventListener("dblclick", dbl);
blank?.addEventListener("dblclick", dbl);
document.addEventListener("dblclick", dbl);

// blokuj ctrl+scroll zoom (desktop)
document.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false }
);

// ===== commands from control =====
function norm(s) {
  return String(s ?? "").trim();
}

async function handleCmd(lineRaw) {
  const line = norm(lineRaw);
  const up = line.toUpperCase();

  if (up === "OFF") {
    setHidden(true);
    await persistState();
    return;
  }
  if (up === "ON") {
    setHidden(false);
    await persistState();
    return;
  }

  if (/^SET\b/i.test(line)) {
    const m = line.match(/^SET\s+"([\s\S]*)"\s*$/i);
    const text = m ? m[1] : line.replace(/^SET\s+/i, "");
    setText(text);
    await persistState();
    return;
  }

  if (up === "CLEAR") {
    clearText();
    await persistState();
    return;
  }
}

// ===== realtime channel =====
let ch = null;
function ensureChannel() {
  if (ch) return ch;
  ch = sb()
    .channel(`familiada-host:${gameId}`)
    .on("broadcast", { event: "HOST_CMD" }, (msg) => {
      handleCmd(msg?.payload?.line);
    })
    .subscribe();
  return ch;
}

// ===== presence ping =====
async function ping() {
  if (!gameId || !key) return;
  try {
    const { data } = await sb().rpc("device_ping", {
      p_game_id: gameId,
      p_device_type: "host",
      p_key: key,
      p_device_id: deviceId || null,
      p_meta: {},
    });

    // jeśli backend nada device_id — zapamiętaj
    if (data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch {}
}

// ===== boot =====
btnFS?.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", setFullscreenIcon);

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();

  if (!gameId || !key) {
    setText("");
    setHidden(true);
    return;
  }

  // start: odtwórz stan i włącz komunikację
  await restoreState();
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

// debug
window.__host = { setHidden, setText, clearText, handleCmd };
