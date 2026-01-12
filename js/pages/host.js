// /familiada/js/pages/host.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paperText1 = document.getElementById("paperText1");
const paperText2 = document.getElementById("paperText2");
const cover2 = document.getElementById("cover2");
const cover2Swipe = document.getElementById("cover2Swipe");
const splitLine = document.getElementById("splitLine");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

/* ========= DEVICE ID (presence) ========= */
const DEVICE_ID_KEY = "familiada:deviceId:host";
let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
if (!deviceId) {
  deviceId = "hst_" + (crypto?.randomUUID?.() || String(Math.random()).slice(2));
  deviceId = deviceId.replace(/-/g, "").slice(0, 24);
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
}

/* ========= STATE =========
p2Covered=true => pasmo 2 zasłonięte (overlay ON)
*/
let text1 = "";
let text2 = "";
let p2Covered = true;

/* cache: żeby nie przebudowywać DOM bez potrzeby */
const lastRendered = {
  t1: null,
  t2: null,
  p2Covered: null,
  orientation: null,
};

/* ========= ORIENTACJA ========= */
function getOrientation() {
  // portrait jeśli wysokość >= szerokość
  return (window.innerHeight >= window.innerWidth) ? "portrait" : "landscape";
}

function applyOrientationClass() {
  const o = getOrientation();
  if (lastRendered.orientation === o) return;

  lastRendered.orientation = o;
  document.documentElement.classList.toggle("portrait", o === "portrait");
  document.documentElement.classList.toggle("landscape", o === "landscape");
  updateSwipeHint();
}

/* ========= FULLSCREEN (+ iOS pseudo) ========= */
let pseudoFS = false;

function isIOSSafari() {
  const ua = navigator.userAgent || "";
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

function setPseudoFS(on) {
  pseudoFS = !!on;
  document.documentElement.classList.toggle("pseudoFS", pseudoFS);
  setTimeout(() => window.scrollTo(0, 1), 50);
}

function setFullscreenIcon() {
  if (!fsIco) return;
  const isReal = !!document.fullscreenElement;
  fsIco.textContent = (isReal || pseudoFS) ? "⧉" : "▢";
}

async function toggleFullscreen() {
  if (isIOSSafari() && !window.navigator.standalone) {
    document.documentElement.classList.toggle("showA2HS");
    return;
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
      setFullscreenIcon();
      return;
    }
    if (pseudoFS) {
      setPseudoFS(false);
      setFullscreenIcon();
      return;
    }

    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) throw new Error("Fullscreen API not available");
    await req.call(el, { navigationUI: "hide" });

    setFullscreenIcon();
  } catch (e) {
    setPseudoFS(true);
    console.warn("[host] fullscreen fallback:", e);
    setFullscreenIcon();
  }
}

/* ========= UI ========= */
function updateSwipeHint() {
  const o = getOrientation();
  if (!cover2Swipe) return;

  // pasmo2 zasłonięte => pokaż jak odsłonić
  // pasmo2 odsłonięte => pokaż jak zasłonić
  if (o === "portrait") {
    cover2Swipe.textContent = p2Covered
      ? "Przesuń w dół, żeby odsłonić"
      : "Przesuń w górę, żeby zasłonić";
  } else {
    cover2Swipe.textContent = p2Covered
      ? "Przesuń w prawo, żeby odsłonić"
      : "Przesuń w lewo, żeby zasłonić";
  }
}

function render() {
  // tekst 1
  if (paperText1 && lastRendered.t1 !== text1) {
    paperText1.textContent = text1;
    lastRendered.t1 = text1;
  }

  // tekst 2
  if (paperText2 && lastRendered.t2 !== text2) {
    paperText2.textContent = text2;
    lastRendered.t2 = text2;
  }

  // overlay pasma 2 + linia
  if (lastRendered.p2Covered !== p2Covered) {
    lastRendered.p2Covered = p2Covered;

    // p2Covered=true => overlay ON
    cover2?.classList.toggle("coverOn", p2Covered);
    cover2?.classList.toggle("coverOff", !p2Covered);

    // linia widoczna tylko gdy pasmo2 odsłonięte
    document.documentElement.classList.toggle("p2Open", !p2Covered);

    updateSwipeHint();
  }
}

function setText1(next) {
  text1 = String(next ?? "");
  render();
}

function setText2(next) {
  text2 = String(next ?? "");
  render();
}

function append1(line) {
  const s = String(line ?? "");
  if (!s) return;
  text1 = text1 ? (text1 + "\n" + s) : s;
  render();
}

function append2(line) {
  const s = String(line ?? "");
  if (!s) return;
  text2 = text2 ? (text2 + "\n" + s) : s;
  render();
}

function clear1() {
  text1 = "";
  render();
}

function clear2() {
  text2 = "";
  render();
}

function coverP2(on) {
  p2Covered = !!on;
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
      p_patch: { text1, text2, p2Covered },
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
    text1 = typeof s.text1 === "string" ? s.text1 : "";
    text2 = typeof s.text2 === "string" ? s.text2 : "";
    p2Covered = (typeof s.p2Covered === "boolean") ? s.p2Covered : true;

    // pełny render
    lastRendered.t1 = null;
    lastRendered.t2 = null;
    lastRendered.p2Covered = null;
    render();
  } catch {
    text1 = "";
    text2 = "";
    p2Covered = true;
    lastRendered.t1 = null;
    lastRendered.t2 = null;
    lastRendered.p2Covered = null;
    render();
  }
}

/* ========= KOMENDY =========
SET1 "..."
SET2 "..."
APPEND1 "..."
APPEND2 "..."
CLEAR1
CLEAR2
CLEAR          (opcjonalnie: czyści oba)
OPEN2 / HIDE2  (opcjonalnie: sterowanie pasmem 2) – możesz wywalić jeśli nie chcesz
Wspiera \n \t \"
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
  if (!line) return;

  const up = line.toUpperCase();

  // === SET1/SET2 ===
  if (/^SET1\b/i.test(line)) {
    setText1(decodeEscapes(unquotePayload(line, "SET1")));
    await persistState();
    return;
  }
  if (/^SET2\b/i.test(line)) {
    setText2(decodeEscapes(unquotePayload(line, "SET2")));
    await persistState();
    return;
  }

  // === APPEND1/APPEND2 ===
  if (/^APPEND1\b/i.test(line)) {
    append1(decodeEscapes(unquotePayload(line, "APPEND1")));
    await persistState();
    return;
  }
  if (/^APPEND2\b/i.test(line)) {
    append2(decodeEscapes(unquotePayload(line, "APPEND2")));
    await persistState();
    return;
  }

  // === CLEAR1/CLEAR2 ===
  if (up === "CLEAR1") {
    clear1();
    await persistState();
    return;
  }
  if (up === "CLEAR2") {
    clear2();
    await persistState();
    return;
  }

  // opcjonalnie (wygodne)
  if (up === "CLEAR") {
    clear1();
    clear2();
    await persistState();
    return;
  }

  // opcjonalnie: zdalne sterowanie pasmem 2 (jeśli nie chcesz – usuń)
  if (up === "OPEN2") {
    coverP2(false);
    await persistState();
    return;
  }
  if (up === "HIDE2") {
    coverP2(true);
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

    const nextId = data?.device_id;
    if (nextId && nextId !== deviceId) {
      deviceId = nextId;
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch (e) {
    console.warn("[host] device_ping failed", e);
  }
}

/* ========= SWIPE (pasmo2) =========
- portrait:  DOWN = odsłoń, UP = zasłoń
- landscape: RIGHT = odsłoń, LEFT = zasłoń
Z bezpiecznymi strefami (nie zaczynaj z krawędzi).
*/
const SWIPE_MIN = 70;
const SWIPE_SLOPE = 1.25;
const EDGE_GUARD = 28;

let swDown = false;
let sx = 0, sy = 0, st = 0;

function startAllowed(x, y) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;

  // nie z krawędzi (systemowe gesty)
  if (x < EDGE_GUARD || x > (w - EDGE_GUARD)) return false;
  if (y < EDGE_GUARD || y > (h - EDGE_GUARD)) return false;

  return true;
}

function onPointerDown(ev) {
  if (ev.pointerType === "touch" && ev.isPrimary === false) return;

  const x = ev.clientX ?? 0;
  const y = ev.clientY ?? 0;
  if (!startAllowed(x, y)) return;

  swDown = true;
  sx = x;
  sy = y;
  st = Date.now();
}

async function onPointerUp(ev) {
  if (!swDown) return;
  swDown = false;

  const dx = (ev.clientX ?? 0) - sx;
  const dy = (ev.clientY ?? 0) - sy;

  if (Date.now() - st > 650) return;

  const o = getOrientation();

  if (o === "portrait") {
    // oczekujemy ruchu pionowego
    const ady = Math.abs(dy);
    const adx = Math.abs(dx);
    if (ady < SWIPE_MIN) return;
    if (ady < adx * SWIPE_SLOPE) return;

    if (dy > 0) {
      // DOWN = odsłoń
      if (p2Covered) {
        coverP2(false);
        await persistState();
      }
    } else {
      // UP = zasłoń
      if (!p2Covered) {
        coverP2(true);
        await persistState();
      }
    }
  } else {
    // landscape: oczekujemy ruchu poziomego
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < SWIPE_MIN) return;
    if (adx < ady * SWIPE_SLOPE) return;

    if (dx > 0) {
      // RIGHT = odsłoń
      if (p2Covered) {
        coverP2(false);
        await persistState();
      }
    } else {
      // LEFT = zasłoń
      if (!p2Covered) {
        coverP2(true);
        await persistState();
      }
    }
  }
}

/* blokuj ctrl+scroll zoom (desktop) */
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

window.addEventListener("resize", () => {
  applyOrientationClass();
  updateSwipeHint();
});

document.addEventListener("DOMContentLoaded", async () => {
  applyOrientationClass();
  setFullscreenIcon();

  if (window.navigator.standalone) {
    document.documentElement.classList.add("webapp");
  }

  // brak parametrów = tylko lokalnie, ale działa UI i gest
  if (!gameId || !key) {
    text1 = "";
    text2 = "";
    p2Covered = true;
    render();
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

/* debug */
window.__host = {
  setText1,
  setText2,
  append1,
  append2,
  clear1,
  clear2,
  coverP2,
  handleCmd,
  ping,
};
