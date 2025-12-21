import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paperText = document.getElementById("paperText");
const hint = document.getElementById("hint");
const blank = document.getElementById("blank");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

let hidden = false;
let lastText = "";

// ---------- fullscreen ----------
function setFullscreenIcon() {
  fsIco.textContent = document.fullscreenElement ? "▢" : "⧉";
}
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
  setFullscreenIcon();
}

// ---------- state + UI ----------
function setHidden(on) {
  hidden = !!on;
  blank.hidden = !hidden;

  hint.textContent = hidden
    ? "Podwójne dotknięcie aby odsłonić"
    : "Podwójne dotknięcie aby zasłonić";

  if (!hidden) paperText.textContent = lastText;
}

function setText(t) {
  lastText = String(t ?? "");
  if (!hidden) paperText.textContent = lastText;
}

function clearText() {
  lastText = "";
  if (!hidden) paperText.textContent = "";
}

async function persistHostState() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_kind: "host",
      p_key: key,
      p_patch: { hidden, text: lastText },
    });
  } catch {}
}

async function restoreFromSnapshot() {
  if (!gameId || !key) return;
  try {
    const { data, error } = await sb().rpc("device_state_get", {
      p_game_id: gameId,
      p_kind: "host",
      p_key: key,
    });
    if (error) throw error;

    const s = data || {};
    // snapshot może być pusty
    const snapHidden = !!s.hidden;
    const snapText = typeof s.text === "string" ? s.text : "";

    // najpierw tekst, potem hidden (żeby odsłonięcie pokazało treść)
    setText(snapText);
    setHidden(snapHidden);
  } catch {
    // jak nie ma snapshotu – start “odsłonięty, pusto”
    setText("");
    setHidden(false);
  }
}

// ---------- double tap / double click ----------
const DOUBLE_MS = 320;
let lastTapAt = 0;

function yOK(y) {
  const h = window.innerHeight || 1;
  return y > 70 && y < h - 70;
}

async function toggleCover() {
  setHidden(!hidden);
  await persistHostState();
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

// touch: ignoruj multi-touch (pinch)
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

// desktop: double click
document.addEventListener("dblclick", (e) => handleTap(e.clientY));

// blokuj ctrl+scroll zoom (desktop)
document.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false }
);

// ---------- commands from control ----------
function norm(s) {
  return String(s ?? "").trim();
}

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
    const m = line.match(/^SET\s+"([\s\S]*)"\s*$/i);
    const text = m ? m[1] : line.replace(/^SET\s+/i, "");
    setText(text);
    await persistHostState();
    return;
  }

  if (up === "CLEAR") {
    clearText();
    await persistHostState();
    return;
  }
}

// ---------- realtime channel ----------
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

// ---------- ping ----------
async function ping() {
  try {
    await sb().rpc("device_ping", {
      p_game_id,
      p_device_type: "host",
      p_device_id: "tablet",
      p_key,
    });
  } catch {}
}

btnFS.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", setFullscreenIcon);

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();
  paperText.textContent = "";

  if (!gameId || !key) {
    // brak paramów => zasłonięte
    setText("");
    setHidden(true);
    return;
  }

  await restoreFromSnapshot();
  ensureChannel();

  ping();
  setInterval(ping, 5000);
});

// debug
window.__host = { setHidden, setText, clearText, handleCmd, persistHostState };
