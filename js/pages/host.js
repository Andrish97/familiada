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

// ===== fullscreen =====
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

// ===== hide/reveal =====
function setHidden(on) {
  hidden = !!on;
  blank.hidden = !hidden;

  hint.textContent = hidden
    ? "Podwójne dotknięcie aby odsłonić"
    : "Podwójne dotknięcie aby zasłonić";
}

function setText(t) {
  lastText = String(t ?? "");
  if (!hidden) paperText.textContent = lastText;
}

function clearText() {
  lastText = "";
  if (!hidden) paperText.textContent = "";
}

// ===== double tap / dblclick =====
const DOUBLE_MS = 320;
let lastTapAt = 0;

function yOK(y) {
  const h = window.innerHeight || 1;
  return y > 70 && y < h - 70;
}

function toggleCover() {
  if (hidden) {
    setHidden(false);
    paperText.textContent = lastText;
  } else {
    setHidden(true);
  }
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

document.addEventListener("touchstart", (e) => {
  if (e.touches && e.touches.length > 1) { e.preventDefault(); return; }
  const y = e.touches?.[0]?.clientY ?? 0;
  handleTap(y);
}, { passive: false });

document.addEventListener("dblclick", (e) => handleTap(e.clientY));
document.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

// ===== realtime commands =====
let ch = null;
function ensureChannel() {
  if (ch) return ch;
  ch = sb()
    .channel(`familiada-host:${gameId}`)
    .on("broadcast", { event: "HOST_CMD" }, (msg) => handleCmd(msg?.payload?.line))
    .subscribe();
  return ch;
}

function norm(s) { return String(s ?? "").trim(); }

function handleCmd(lineRaw) {
  const line = norm(lineRaw);
  const up = line.toUpperCase();

  if (up === "OFF") { setHidden(true); return; }
  if (up === "ON")  { setHidden(false); paperText.textContent = lastText; return; }

  if (/^SET\b/i.test(line)) {
    const m = line.match(/^SET\s+"([\s\S]*)"\s*$/i);
    const text = m ? m[1] : line.replace(/^SET\s+/i, "");
    setText(text);
    return;
  }

  if (up === "CLEAR") {
    clearText();
    return;
  }
}

// ===== presence + snapshot =====
async function ping() {
  try {
    await sb().rpc("device_ping_v2", { p_game_id: gameId, p_kind: "host", p_key: key });
  } catch {}
}

async function loadSnapshotOrHide() {
  try {
    const { data, error } = await sb().rpc("get_public_snapshot_v2", {
      p_game_id: gameId,
      p_kind: "host",
      p_key: key,
    });
    if (error) throw error;

    const devices = data?.devices || {};
    const h = !!devices?.host_hidden;
    const t = String(devices?.host_text ?? "");

    setHidden(h);
    setText(t);
    if (h) paperText.textContent = ""; // zakryte => nie pokazuj
  } catch {
    setHidden(true);
  }
}

btnFS.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", setFullscreenIcon);

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();
  paperText.textContent = "";

  if (!gameId || !key) {
    setHidden(true);
    return;
  }

  await loadSnapshotOrHide();
  ensureChannel();

  await ping();
  setInterval(ping, 5000);
});

window.__host = { setHidden, setText, clearText, handleCmd };
