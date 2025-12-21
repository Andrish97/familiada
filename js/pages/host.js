// /familiada/js/pages/host.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paperText = document.getElementById("paperText");
const hint = document.getElementById("hint");
const blank = document.getElementById("blank");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

// stabilny device_id dla presence
const DEVICE_ID_KEY = "familiada:deviceId:host";
let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;

// stan hosta
let hidden = false;
let text = "";

/* ========= FULLSCREEN ========= */
function setFullscreenIcon() {
  if (!fsIco) return;
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      // iOS Safari lubi jak request jest na elemencie <html>
      await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    } else {
      await document.exitFullscreen?.();
    }
  } catch (e) {
    // iOS czasem rzuca bez sensu – nie przerywamy UI
    // console.warn("[host] fullscreen failed", e);
  }
  setFullscreenIcon();
}

/* ========= UI ========= */
function render() {
  if (blank) blank.hidden = !hidden;

  if (hint) {
    hint.textContent = hidden
      ? "Szybki podwójny tap aby odsłonić"
      : "Szybki podwójny tap aby zasłonić";
  }

  if (paperText) {
    paperText.textContent = hidden ? "" : text;
  }
}

function setHidden(on) {
  hidden = !!on;
  render();
}

function setText(next) {
  text = String(next ?? "");
  render();
}

function clearText() {
  text = "";
  render();
}

function appendLine(line) {
  const s = String(line ?? "");
  if (!s) return;
  text = text ? (text + "\n" + s) : s;
  render();
}

/* ========= SNAPSHOT (device_state) ========= */
async function persistState() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_device_type: "host",
      p_key: key,
      p_patch: { hidden, text },
    });
  } catch (e) {
    console.warn("[host] persist failed", e);
  }
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

    const s = data || {};
    text = typeof s.text === "string" ? s.text : "";
    hidden = !!s.hidden;
    render();
  } catch (e) {
    // start bez snapshotu
    text = "";
    hidden = false;
    render();
  }
}

/* ========= KOMENDY Z CONTROLA =========
Obsługujemy:
- OFF / ON
- SET "..."
- APPEND "..."
- CLEAR
W SET/APPEND wspieramy \n w stringu.
*/
function unquotePayload(line, keyword) {
  // SET "...." (może zawierać \n)
  const re = new RegExp(`^${keyword}\\s+"([\\s\\S]*)"\\s*$`, "i");
  const m = String(line).match(re);
  if (m) return m[1];

  // SET cokolwiek (bez cudzysłowu)
  return String(line).replace(new RegExp(`^${keyword}\\s+`, "i"), "");
}

function decodeEscapes(s) {
  // pozwala wysyłać \n z controla jako dwa znaki i zamienić na newline
  return String(s)
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"');
}

async function handleCmd(lineRaw) {
  const line = String(lineRaw ?? "").trim();
  const up = line.toUpperCase();

  if (!line) return;

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

  if (up === "CLEAR") {
    clearText();
    await persistState();
    return;
  }

  if (/^SET\b/i.test(line)) {
    const payload = decodeEscapes(unquotePayload(line, "SET"));
    setText(payload);
    await persistState();
    return;
  }

  if (/^APPEND\b/i.test(line)) {
    const payload = decodeEscapes(unquotePayload(line, "APPEND"));
    appendLine(payload);
    await persistState();
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

/* ========= PRESENCE (device_presence) ========= */
async function ping() {
  if (!gameId || !key) return;
  try {
    const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId,
      p_device_type: "host",
      p_key: key,
      p_device_id: deviceId, // null ok
      p_meta: {},
    });
    if (error) throw error;

    // jeśli backend nadał device_id albo zwrócił inny
    const nextId = data?.device_id;
    if (nextId && nextId !== deviceId) {
      deviceId = nextId;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch (e) {
    console.warn("[host] device_ping failed", e);
  }
}

/* ========= PODWÓJNY TAP / KLIK (szybki, bez „mulenia”) =========
Używamy pointerdown:
- działa na dotyku i myszce
- nie czekamy na dblclick (który na mobile bywa opóźniony)
*/
const DOUBLE_MS = 240; // szybciej niż 320, mniej „mielenia”
let lastTapAt = 0;

function yOK(y) {
  const h = window.innerHeight || 1;
  return y > 70 && y < h - 70;
}

async function toggleCover() {
  setHidden(!hidden);
  await persistState();
}

function onPointerDown(ev) {
  // ignoruj multi-touch: pointerType + isPrimary
  if (ev.pointerType === "touch" && ev.isPrimary === false) return;

  const y = ev.clientY ?? 0;
  if (!yOK(y)) return;

  const now = Date.now();
  if (now - lastTapAt <= DOUBLE_MS) {
    lastTapAt = 0;
    toggleCover();
  } else {
    lastTapAt = now;
  }
}

// blokuj ctrl+scroll zoom (desktop)
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
    // bez parametrów = zasłonięte i puste
    text = "";
    hidden = true;
    render();
    return;
  }

  // szybki toggle: tap/click
  document.addEventListener("pointerdown", onPointerDown, { passive: true });

  await restoreState();
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

// debug
window.__host = {
  setHidden,
  setText,
  clearText,
  appendLine,
  handleCmd,
  ping,
};
