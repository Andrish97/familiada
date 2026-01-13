// /familiada/js/pages/host.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const paperText1 = document.getElementById("paperText1");
const paperText2 = document.getElementById("paperText2");
const cover2 = document.getElementById("cover2");
const cover2Swipe = document.getElementById("cover2Swipe");
const p2Hint = document.getElementById("p2Hint");

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

/* ========= ORIENTACJA (bez zmiany HTML poza klasami portrait/landscape) ========= */
function getOrientation() {
  return window.innerHeight >= window.innerWidth ? "portrait" : "landscape";
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
  fsIco.textContent = isReal || pseudoFS ? "⧉" : "▢";
}

async function toggleFullscreen() {
  if (isIOSSafari() && !window.navigator.standalone) {
    // A2HS overlay masz w base.css – nie ruszam HTML
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

/* ========= CSS VARS -> PX ========= */
function pxVar(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/*
  Snapujemy safe-top/bottom do siatki linijek:
  - linijki są full-bleed (tło idzie od 0)
  - tekst ma być przesunięty o safe-top, ALE tak żeby dalej trafiał w linie
  -> dodajemy --snap-top / --snap-bottom (w px) liczone do najbliższej wielokrotności --line
*/
function updateLineSnap() {
  const line = pxVar("--line");
  if (!line) return;

  const safeTop = pxVar("--safe-top");
  const safeBottom = pxVar("--safe-bottom");

  const modTop = safeTop % line;
  const snapTop = modTop === 0 ? 0 : line - modTop;

  const modBottom = safeBottom % line;
  const snapBottom = modBottom === 0 ? 0 : line - modBottom;

  document.documentElement.style.setProperty("--snap-top", `${snapTop}px`);
  document.documentElement.style.setProperty("--snap-bottom", `${snapBottom}px`);
}

/* ========= STYLED TEXT (segmenty) =========
Składnia (bez zagnieżdżania):
  [b]tekst[/]
  [u]tekst[/]
  [s]tekst[/]
  [gold b]tekst[/]
  [#2a62ff u]tekst[/]
  [rebeccapurple b u]tekst[/]
Zamykanie zawsze: [/]
Kolor: dowolny poprawny CSS color.
*/
function parseStyleTokens(tokenStr) {
  const out = { color: null, bold: false, underline: false, strike: false };

  const tokens = String(tokenStr || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  for (const tRaw of tokens) {
    const t = tRaw.toLowerCase();
    if (t === "b") out.bold = true;
    else if (t === "u") out.underline = true;
    else if (t === "s") out.strike = true;
    else out.color = tRaw; // traktujemy jako kolor
  }

  return out;
}

function parseStyledText(input) {
  const s = String(input ?? "");
  const segs = [];

  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("[", i);
    if (open === -1) {
      segs.push({ text: s.slice(i), style: null });
      break;
    }

    if (open > i) segs.push({ text: s.slice(i, open), style: null });

    const close = s.indexOf("]", open + 1);
    if (close === -1) {
      segs.push({ text: s.slice(open), style: null });
      break;
    }

    const tag = s.slice(open + 1, close).trim();
    if (tag === "/") {
      segs.push({ text: s.slice(open, close + 1), style: null });
      i = close + 1;
      continue;
    }

    const endTag = "[/]";
    const end = s.indexOf(endTag, close + 1);
    if (end === -1) {
      segs.push({ text: s.slice(open), style: null });
      break;
    }

    const inner = s.slice(close + 1, end);
    const style = parseStyleTokens(tag);
    segs.push({ text: inner, style });

    i = end + endTag.length;
  }

  // scal plain segmenty
  const merged = [];
  for (const seg of segs) {
    if (!seg.text) continue;
    const last = merged[merged.length - 1];
    if (last && !last.style && !seg.style) last.text += seg.text;
    else merged.push(seg);
  }
  return merged;
}

function renderStyledInto(el, sourceText) {
  if (!el) return;

  const src = String(sourceText ?? "");

  // szybka ścieżka: brak znaczników
  if (!src.includes("[") || !src.includes("]")) {
    el.textContent = src;
    return;
  }

  const segs = parseStyledText(src);
  const hasStyled = segs.some((x) => x.style);

  if (!hasStyled) {
    el.textContent = src;
    return;
  }

  const frag = document.createDocumentFragment();

  for (const seg of segs) {
    if (!seg.style) {
      frag.appendChild(document.createTextNode(seg.text));
      continue;
    }

    const span = document.createElement("span");
    span.textContent = seg.text;

    if (seg.style.color) span.style.color = seg.style.color;
    if (seg.style.bold) span.classList.add("b");

    const deco = [];
    if (seg.style.underline) deco.push("underline");
    if (seg.style.strike) deco.push("line-through");
    if (deco.length) span.style.textDecoration = deco.join(" ");

    frag.appendChild(span);
  }

  el.replaceChildren(frag);
}

/* ========= UI / HINT ========= */
function updateSwipeHint() {
  const o = getOrientation();

  // zasłona (cover) pokazuje oba stany
  const onCover =
    o === "portrait"
      ? p2Covered
        ? "Przesuń w dół, żeby odsłonić"
        : "Przesuń w górę, żeby zasłonić"
      : p2Covered
        ? "Przesuń w prawo, żeby odsłonić"
        : "Przesuń w lewo, żeby zasłonić";

  if (cover2Swipe) cover2Swipe.textContent = onCover;

  // hint na odsłoniętym paśmie 2: tylko “jak zasłonić”
  if (p2Hint) {
    p2Hint.textContent =
      o === "portrait" ? "Przesuń w górę, żeby zasłonić" : "Przesuń w lewo, żeby zasłonić";
  }
}

/* ========= RENDER ========= */
function render() {
  if (paperText1 && lastRendered.t1 !== text1) {
    renderStyledInto(paperText1, text1);
    lastRendered.t1 = text1;
  }

  if (paperText2 && lastRendered.t2 !== text2) {
    renderStyledInto(paperText2, text2);
    lastRendered.t2 = text2;
  }

  if (lastRendered.p2Covered !== p2Covered) {
    lastRendered.p2Covered = p2Covered;

    cover2?.classList.toggle("coverOn", p2Covered);
    cover2?.classList.toggle("coverOff", !p2Covered);

    // hint na odsłoniętym paśmie 2
    document.documentElement.classList.toggle("p2Open", !p2Covered);

    updateSwipeHint();
  }
}

/* ========= TEXT API ========= */
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
  text1 = text1 ? `${text1}\n${s}` : s;
  render();
}
function append2(line) {
  const s = String(line ?? "");
  if (!s) return;
  text2 = text2 ? `${text2}\n${s}` : s;
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
    p2Covered = typeof s.p2Covered === "boolean" ? s.p2Covered : true;

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

/* ========= KOMENDY (tylko nowe) =========
SET1 "..."
SET2 "..."
APPEND1 "..."
APPEND2 "..."
CLEAR1
CLEAR2
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

/* ========= SWIPE GUARD (z CSS -> px) ========= */
let swipeGuardPx = 28;

function cssPxVar(name, fallbackPx) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallbackPx;
}

function refreshCssMetrics() {
  swipeGuardPx = cssPxVar("--swipe-guard-px", 28);
}

/* ========= SWIPE (pasmo2) =========
portrait:  DOWN = odsłoń, UP = zasłoń
landscape: RIGHT = odsłoń, LEFT = zasłoń
*/
const SWIPE_MIN = 70;
const SWIPE_SLOPE = 1.25;

let swDown = false;
let sx = 0, sy = 0, st = 0;

function startAllowed(x, y) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  const g = swipeGuardPx || 28;

  // nie startuj z krawędzi (systemowe gesty)
  if (x < g || x > w - g) return false;
  if (y < g || y > h - g) return false;

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
  updateLineSnap();
  refreshCssMetrics();
  updateSwipeHint();
});

document.addEventListener("DOMContentLoaded", async () => {
  applyOrientationClass();
  updateLineSnap();
  refreshCssMetrics();
  setFullscreenIcon();

  if (window.navigator.standalone) {
    document.documentElement.classList.add("webapp");
  }

  // lokalnie też działa UI i gest
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
