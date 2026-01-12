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

/* ========= DEVICE ID (presence) ========= */
const DEVICE_ID_KEY = "familiada:deviceId:host";
let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
if (!deviceId) {
  deviceId = "hst_" + (crypto?.randomUUID?.() || String(Math.random()).slice(2));
  deviceId = deviceId.replace(/-/g, "").slice(0, 24);
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
}

/* ========= STATE ========= */
let hidden = false;
let text = "";

/* cache (żeby nie przepisywać identycznego = brak migotania) */
let lastRendered = {
  paper: null,
  hint: null,
};

/* ========= iOS / FULLSCREEN ========= */
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
    // Safari iOS: brak prawdziwego fullscreen w przeglądarce → instrukcja webapp
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
      setFullscreenIcon();
      return;
    }

    // wejście: spróbuj prawdziwego fullscreen
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) throw new Error("Fullscreen API not available");
    await req.call(el, { navigationUI: "hide" });

    setFullscreenIcon();
  } catch (e) {
    // fallback: pseudo-fullscreen
    setPseudoFS(true);
    console.warn("[host] fullscreen fallback:", e);
    setFullscreenIcon();
  }
}

/* ========= AUDIO =========
Usunięte: symulacja "szurania kartki" była zbugowana.
*/
function playRustle() {}

/* ========= STYLED TEXT (segmenty) =========
Składnia (bez zagnieżdżania, świadomie):
  [b]tekst[/]
  [u]tekst[/]
  [s]tekst[/]
  [gold b]tekst[/]
  [#2a62ff u]tekst[/]
  [rebeccapurple b u]tekst[/]
Zamykanie zawsze: [/]
Kolory: dowolny kolor CSS (nazwany / rgb() / hsl() / var(...) / #rrggbb).
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
    else {
      // kolor CSS: pozwalamy na nazwy HTML/CSS i inne formy
      out.color = tRaw;
    }
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
      // samotne [/] → plain text
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

  // scal plain segments
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

  // podmiana „na raz” = brak migotania
  el.replaceChildren(frag);
}

/* ========= UI/ANIM (blank) ========= */
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
    renderStyledInto(paperText, nextPaper);
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
  } catch {
    text = "";
    hidden = false;
    render({ animate: false });
  }
}

/* ========= KOMENDY Z CONTROLA =========
Obsługujemy:
- OFF / ON   (OFF=HIDE, ON=OPEN)
- HIDE / OPEN
- SET "..."
- APPEND "..."
- CLEAR
W SET/APPEND wspieramy \n \t \"
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

function vminPx(v) {
  const minSide = Math.min(window.innerWidth, window.innerHeight);
  return minSide * v / 100;
}

function startAllowed(x) {
  const left = vminPx(18);   // --margin-x
  const right = vminPx(16);  // --text-right
  const w = window.innerWidth || 1;
  return x > left && x < (w - right);
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
    if (!hidden) {
      setHidden(true, { animate: true });
      await persistState();
    }
  } else {
    if (hidden) {
      setHidden(false, { animate: true });
      await persistState();
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

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();

  if (window.navigator.standalone) {
    document.documentElement.classList.add("webapp");
  }

  // brak parametrów = zasłonięte i puste
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

/* debug */
window.__host = {
  setHidden,
  setText,
  clearText,
  appendLine,
  handleCmd,
  ping,
};
