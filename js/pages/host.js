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

// cache (żeby nie przepisywać identycznego tekstu = brak migotania)
let lastRendered = {
  paper: null,
  hint: null,
};

/* ========= FULLSCREEN ========= */
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
  } catch (e) {}
  setFullscreenIcon();
  // iOS fallback – schowaj pasek adresu
  setTimeout(() => {
    window.scrollTo(0, 1);
  }, 50);

}

/* ========= AUDIO =========
Usunięte: symulacja "szurania kartki" była zbugowana i irytowała.
Zostawiamy stub, żeby wywołania (jeśli kiedyś wrócą) nie sypały błędów.
*/
function playRustle() {}

/* ========= UI/ANIM ========= */
function setBlankInstant(on) {
  if (!blank) return;
  blank.classList.add("noAnim");

  if (on) {
    blank.classList.add("blankOn");
    blank.classList.remove("blankOffLeft", "blankOffRight");
  } else {
    blank.classList.remove("blankOn");
    blank.classList.add("blankOffLeft");
    blank.classList.remove("blankOffRight");
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => blank.classList.remove("noAnim"));
  });
}

function animateHide() {
  if (!blank) return;
  blank.classList.remove("blankOffLeft");
  blank.classList.add("blankOffRight");
  blank.classList.remove("blankOn");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => blank.classList.add("blankOn"));
  });
}

function animateOpen() {
  if (!blank) return;
  blank.classList.remove("blankOffRight");
  blank.classList.add("blankOffLeft");
  requestAnimationFrame(() => {
    blank.classList.remove("blankOn");
  });
}

function render(opts = {}) {
  const animate = !!opts.animate;

  const nextHint = hidden
    ? "Przesuń w lewo, żeby odsłonić"
    : "Przesuń w prawo, żeby zasłonić";

  if (hint && lastRendered.hint !== nextHint) {
    hint.textContent = nextHint;
    lastRendered.hint = nextHint;
  }

  const nextPaper = hidden ? "" : text;
  if (paperText && lastRendered.paper !== nextPaper) {
    paperText.textContent = nextPaper;
    lastRendered.paper = nextPaper;
  }

  if (!blank) return;

  if (!animate) {
    setBlankInstant(hidden);
    return;
  }

  if (hidden) animateHide();
  else animateOpen();
}

function setHidden(on, opts = {}) {
  hidden = !!on;
  render(opts);
}

function setText(next, opts = {}) {
  text = String(next ?? "");
  render(opts);
}

function clearText(opts = {}) {
  text = "";
  render(opts);
}

function appendLine(line, opts = {}) {
  const s = String(line ?? "");
  if (!s) return;
  text = text ? (text + "\n" + s) : s;
  render(opts);
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
    render({ animate: false });
  } catch (e) {
    text = "";
    hidden = false;
    render({ animate: false });
  }
}

/* ========= KOMENDY Z CONTROLA =========
Obsługujemy:
- OFF / ON   (OFF=HIDE, ON=OPEN)
- HIDE / OPEN (dodatkowo, bez szkody)
- SET "..."
- APPEND "..."
- CLEAR
W SET/APPEND wspieramy \n w stringu.
*/
function unquotePayload(line, keyword) {
  const re = new RegExp(`^${keyword}\\s+"([\\s\\S]*)"\\s*$`, "i");
  const m = String(line).match(re);
  if (m) return m[1];
  return String(line).replace(new RegExp(`^${keyword}\\s+`, "i"), "");
}

function decodeEscapes(s) {
  return String(s)
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"');
}

async function handleCmd(lineRaw) {
  const line = String(lineRaw ?? "").trim();
  const up = line.toUpperCase();

  if (!line) return;

  if (up === "OFF" || up === "HIDE") {
    setHidden(true, { animate: true });
    await persistState();
    return;
  }

  if (up === "ON" || up === "OPEN") {
    setHidden(false, { animate: true });
    await persistState();
    return;
  }

  if (up === "CLEAR") {
    clearText({ animate: false });
    await persistState();
    return;
  }

  if (/^SET\b/i.test(line)) {
    const payload = decodeEscapes(unquotePayload(line, "SET"));
    setText(payload, { animate: false });
    await persistState();
    return;
  }

  if (/^APPEND\b/i.test(line)) {
    const payload = decodeEscapes(unquotePayload(line, "APPEND"));
    appendLine(payload, { animate: false });
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
      p_device_id: deviceId,
      p_meta: {},
    });
    if (error) throw error;

    const nextId = data?.device_id;
    if (nextId && nextId !== deviceId) {
      deviceId = nextId;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch (e) {
    console.warn("[host] device_ping failed", e);
  }
}

/* ========= SWIPE =========
Prawo  -> HIDE
Lewo   -> OPEN
Start nie z krawędzi (systemowe cofanie).
*/
const EDGE_GUARD = 28;
const SWIPE_MIN = 70;
const SWIPE_SLOPE = 1.25;

let swDown = false;
let sx = 0, sy = 0, st = 0;

function startAllowed(x) {
  const w = window.innerWidth || 1;
  return x > EDGE_GUARD && x < (w - EDGE_GUARD);
}

function onPointerDown(ev) {
  if (ev.pointerType === "touch" && ev.isPrimary === false) return;

  const x = ev.clientX ?? 0;
  if (!startAllowed(x)) return;

  swDown = true;
  sx = x;
  sy = ev.clientY ?? 0;
  st = Date.now();
}

async function onPointerUp(ev) {
  if (!swDown) return;
  swDown = false;

  const dx = (ev.clientX ?? 0) - sx;
  const dy = Math.abs((ev.clientY ?? 0) - sy);

  if (Date.now() - st > 650) return;

  const adx = Math.abs(dx);
  if (adx < SWIPE_MIN) return;
  if (adx < dy * SWIPE_SLOPE) return;

  if (dx > 0) {
    // swipe w prawo => HIDE
    if (!hidden) {
      setHidden(true, { animate: true });
      await persistState();
    }
  } else {
    // swipe w lewo => OPEN
    if (hidden) {
      setHidden(false, { animate: true });
      await persistState();
    }
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

  // bez parametrów = zasłonięte i puste
  if (!gameId || !key) {
    text = "";
    hidden = true;
    render({ animate: false });
    return;
  }

  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("pointerup", onPointerUp, { passive: true });
  document.addEventListener("pointercancel", () => (swDown = false), { passive: true });

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
