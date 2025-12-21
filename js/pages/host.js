// familiada/js/pages/host.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paperText = document.getElementById("paperText");
const hint = document.getElementById("hint");
const blank = document.getElementById("blank");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

// stabilny device id dla presence
const DEVICE_ID_KEY = "familiada:deviceId:host";
let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;

// stan hosta
let hidden = false;
let lastText = "";

/* ========= FULLSCREEN ========= */
function setFullscreenIcon() {
  if (!fsIco) return;
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}

async function toggleFullscreen(ev) {
  // iOS/Chrome wymagają bezpośredniego gestu użytkownika
  ev?.preventDefault?.();
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    } else {
      await document.exitFullscreen?.();
    }
  } catch (e) {
    // na iOS czasem rzuca bez sensu — nie spamujemy
    console.warn("[host] fullscreen failed", e);
  }
  setFullscreenIcon();
}

/* ========= UI ========= */
function setHidden(on) {
  hidden = !!on;
  if (blank) blank.hidden = !hidden;

  if (hint) {
    hint.textContent = hidden
      ? "Podwójne dotknięcie aby odsłonić"
      : "Podwójne dotknięcie aby zasłonić";
  }

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

/* ========= ESCAPES / PARSING ========= */
// pozwala wysyłać z controla: SET "linia1\nlinia2"
function decodeEscapes(s) {
  return String(s ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseQuotedOrRest(line, cmd) {
  const re = new RegExp(`^${cmd}\\s+"([\\s\\S]*)"\\s*$`, "i");
  const m = String(line).match(re);
  if (m) return decodeEscapes(m[1]);
  return decodeEscapes(String(line).replace(new RegExp(`^${cmd}\\s+`, "i"), ""));
}

function norm(s) {
  return String(s ?? "").trim();
}

/* ========= SNAPSHOT (DB) ========= */
async function persistHostState() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_device_type: "host",
      p_key: key,
      p_patch: { hidden, text: lastText },
    });
  } catch (e) {
    console.warn("[host] persist failed", e);
  }
}

async function restoreFromSnapshot() {
  if (!gameId || !key) return;
  try {
    const { data, error } = await sb().rpc("device_state_get", {
      p_game_id: gameId,
      p_device_type: "host",
      p_key: key,
    });
    if (error) throw error;

    const s = data || {};
    // kolejność: tekst -> hidden (żeby odsłonięcie miało co pokazać)
    setText(typeof s.text === "string" ? s.text : "");
    setHidden(!!s.hidden);
  } catch (e) {
    // start awaryjny
    console.warn("[host] snapshot get failed", e);
    setText("");
    setHidden(false);
  }
}

/* ========= COMMANDS (z controla) ========= */
async function handleCmd(lineRaw) {
  const line = norm(lineRaw);
  const up = line.toUpperCase();

  if (up === "OFF") {
    setHidden(true);
    await persistHostState();
    return;
  }

  if (up === "ON") {
    setHidden(false);
    await persistHostState();
    return;
  }

  if (/^SET\b/i.test(line)) {
    const text = parseQuotedOrRest(line, "SET");
    setText(text);
    await persistHostState();
    return;
  }

  if (/^APPEND\b/i.test(line)) {
    const add = parseQuotedOrRest(line, "APPEND");
    const base = String(lastText ?? "");
    setText(base ? (base + "\n" + add) : add);
    await persistHostState();
    return;
  }

  if (up === "CLEAR") {
    clearText();
    await persistHostState();
    return;
  }
}

/* ========= REALTIME ========= */
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

/* ========= PRESENCE ========= */
async function ping() {
  if (!gameId || !key) return;
  try {
    const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId,
      p_device_type: "host",
      p_key: key,
      p_device_id: deviceId,
      p_meta: {},
    });
    if (error) throw error;

    if (data?.device_id && data.device_id !== deviceId) {
      deviceId = data.device_id;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch (e) {
    console.warn("[host] ping failed", e);
  }
}

/* ========= DOUBLE TAP (szybkie i stabilne) ========= */
const DOUBLE_MS = 240;
const DOUBLE_PX = 32;
let lastTapAt = 0;
let lastX = 0;
let lastY = 0;

function yOK(y) {
  const h = window.innerHeight || 1;
  return y > 70 && y < h - 70;
}

async function toggleCover() {
  setHidden(!hidden);
  await persistHostState();
}

function onPointerUp(e) {
  // nie łap klików w przycisk fullscreen
  if (e.target && e.target.closest?.("#btnFS")) return;

  const y = e.clientY ?? 0;
  if (!yOK(y)) return;

  const now = Date.now();
  const dx = (e.clientX ?? 0) - lastX;
  const dy = (e.clientY ?? 0) - lastY;
  const near = (dx * dx + dy * dy) <= (DOUBLE_PX * DOUBLE_PX);

  if (near && (now - lastTapAt) <= DOUBLE_MS) {
    lastTapAt = 0;
    e.preventDefault?.(); // blokuj podwójny-tap zoom
    toggleCover();
    return;
  }

  lastTapAt = now;
  lastX = e.clientX ?? 0;
  lastY = e.clientY ?? 0;
}

// pointer events: działa na dotyku i myszy
document.addEventListener("pointerup", onPointerUp, { passive: false });

// blokuj ctrl+scroll zoom na desktop
document.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false }
);

/* ========= BOOT ========= */
btnFS?.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", setFullscreenIcon);

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();

  if (!gameId || !key) {
    setText("");
    setHidden(true);
    return;
  }

  await restoreFromSnapshot();
  ensureChannel();

  await ping();
  setInterval(ping, 5000);
});

// debug
window.__host = { setHidden, setText, clearText, handleCmd };
