// /familiada/js/pages/host.js
import { sb } from "../core/supabase.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

const paper = document.getElementById("paper");
const hint = document.getElementById("hint");

const elText1 = document.getElementById("text1");
const elText2 = document.getElementById("text2");

const cover2 = document.getElementById("cover2");
const cover2Swipe = document.getElementById("cover2Swipe");
const splitLine = document.getElementById("splitLine");

/* ========= DEVICE ID (presence) ========= */
const DEVICE_ID_KEY = "familiada:deviceId:host";
let deviceId = localStorage.getItem(DEVICE_ID_KEY) || null;
if (!deviceId) {
  deviceId = "hst_" + (crypto?.randomUUID?.() || String(Math.random()).slice(2));
  deviceId = deviceId.replace(/-/g, "").slice(0, 24);
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
}

/* ========= STATE ========= */
let text1 = "";
let text2 = "";
let hidden2 = true; // prawa/dolna połówka zakryta

let lastRendered = {
  t1: null,
  t2: null,
  hint: null,
  hidden2: null,
  layout: null,
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

/* ========= STYLED SEGMENTS =========
Wspieramy wcześniejszy format:
  [b] [/], [u] [/], [s] [/], [color b u] [/]
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
    else out.color = tRaw; // dowolny kolor CSS
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
    const endTag = "[/]";
    const end = s.indexOf(endTag, close + 1);
    if (end === -1) {
      segs.push({ text: s.slice(open), style: null });
      break;
    }

    const inner = s.slice(close + 1, end);
    const style = tag === "/" ? null : parseStyleTokens(tag);
    segs.push({ text: inner, style });

    i = end + endTag.length;
  }

  // merge plain
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

/* ========= LAYOUT (portrait/landscape) ========= */
function getLayout() {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  return h >= w ? "portrait" : "landscape";
}

function applyLayout() {
  const layout = getLayout();
  if (lastRendered.layout === layout) return;

  document.documentElement.classList.toggle("portrait", layout === "portrait");
  document.documentElement.classList.toggle("landscape", layout === "landscape");

  // instrukcja na cover2
  if (cover2Swipe) {
    cover2Swipe.textContent =
      layout === "portrait"
        ? "Przesuń w dół, żeby odsłonić"
        : "Przesuń w prawo, żeby odsłonić";
  }

  lastRendered.layout = layout;
}

/* ========= UI ========= */
function setCover2Hidden(on, { animate = true } = {}) {
  hidden2 = !!on;

  // divider tylko gdy odkryte
  if (splitLine) splitLine.style.display = hidden2 ? "none" : "block";

  if (!cover2) return;

  if (!animate) cover2.style.transition = "none";
  cover2.classList.toggle("coverOn", hidden2);
  cover2.classList.toggle("coverOff", !hidden2);

  if (!animate) {
    requestAnimationFrame(() => {
      cover2.style.transition = "";
    });
  }
}

function render() {
  applyLayout();

  const nextHint = hidden2
    ? "Odsłoń pasmo gestem"
    : "Zasłoń pasmo gestem";

  if (hint && lastRendered.hint !== nextHint) {
    hint.textContent = nextHint;
    lastRendered.hint = nextHint;
  }

  if (elText1 && lastRendered.t1 !== text1) {
    renderStyledInto(elText1, text1);
    lastRendered.t1 = text1;
  }

  if (elText2 && lastRendered.t2 !== text2) {
    renderStyledInto(elText2, text2);
    lastRendered.t2 = text2;
  }

  if (lastRendered.hidden2 !== hidden2) {
    setCover2Hidden(hidden2, { animate: true });
    lastRendered.hidden2 = hidden2;
  }
}

function setText1(next) {
  text1 = String(next ?? "");
  render();
}

function clearText1() {
  text1 = "";
  render();
}

function setText2Append(line) {
  const s = String(line ?? "");
  if (!s) return;
  text2 = text2 ? (text2 + "\n" + s) : s;
  render();
}

function clearText2() {
  text2 = "";
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
      p_patch: { hidden2, text1, text2 },
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
    hidden2 = (typeof s.hidden2 === "boolean") ? s.hidden2 : true;

    applyLayout();
    // bez animacji na starcie
    if (splitLine) splitLine.style.display = hidden2 ? "none" : "block";
    if (cover2) {
      cover2.style.transition = "none";
      cover2.classList.toggle("coverOn", hidden2);
      cover2.classList.toggle("coverOff", !hidden2);
      requestAnimationFrame(() => (cover2.style.transition = ""));
    }

    // render tekstów
    renderStyledInto(elText1, text1);
    renderStyledInto(elText2, text2);
    lastRendered.t1 = text1;
    lastRendered.t2 = text2;
    lastRendered.hidden2 = hidden2;
  } catch {
    text1 = "";
    text2 = "";
    hidden2 = true;
    render();
  }
}

/* ========= KOMENDY =========
- SET1 "..."  -> replace text1
- SET2 "..."  -> append do text2 (pasmo)
Dodatkowo (żeby życie miało sens):
- CLEAR / CLEAR1 / CLEAR2
- OFF / ON   -> OFF zakrywa 2, ON odsłania 2
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

  if (up === "OFF") {
    setCover2Hidden(true, { animate: true });
    render();
    await persistState();
    return;
  }

  if (up === "ON") {
    setCover2Hidden(false, { animate: true });
    render();
    await persistState();
    return;
  }

  if (up === "CLEAR") {
    clearText1();
    clearText2();
    await persistState();
    return;
  }

  if (up === "CLEAR1") {
    clearText1();
    await persistState();
    return;
  }

  if (up === "CLEAR2") {
    clearText2();
    await persistState();
    return;
  }

  if (/^SET1\b/i.test(line)) {
    const payload = decodeEscapes(unquotePayload(line, "SET1"));
    setText1(payload);
    await persistState();
    return;
  }

  if (/^SET2\b/i.test(line)) {
    const payload = decodeEscapes(unquotePayload(line, "SET2"));
    setText2Append(payload);
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

/* ========= SWIPE =========
portrait (pion): odsłoń/zahide -> góra/dół
landscape (poziom): odsłoń/zahide -> lewo/prawo
Bezpieczne strefy: nie startuj przy krawędziach.
*/
const EDGE_GUARD = 28;   // px
const SWIPE_MIN = 70;    // px
const SWIPE_SLOPE = 1.25;
const MAX_TIME = 650;    // ms

let swDown = false;
let sx = 0, sy = 0, st = 0;

function startAllowed(x, y) {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;

  // zawsze unikamy bocznych krawędzi (system back)
  if (x < EDGE_GUARD || x > (w - EDGE_GUARD)) return false;

  const layout = getLayout();
  if (layout === "portrait") {
    // gest pionowy: unikaj góry/dół (paski/gesture)
    if (y < EDGE_GUARD || y > (h - EDGE_GUARD)) return false;
    return true;
  } else {
    // gest poziomy: unikaj góry/dół też trochę (żeby nie łapać przypadkiem)
    if (y < EDGE_GUARD * 0.6 || y > (h - EDGE_GUARD * 0.6)) return false;
    return true;
  }
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

  const dt = Date.now() - st;
  if (dt > MAX_TIME) return;

  const x = ev.clientX ?? 0;
  const y = ev.clientY ?? 0;

  const dx = x - sx;
  const dy = y - sy;

  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  const layout = getLayout();

  if (layout === "portrait") {
    // gest pionowy (góra/dół) – filtr na „pionowość”
    if (ady < SWIPE_MIN) return;
    if (ady < adx * SWIPE_SLOPE) return;

    if (dy > 0) {
      // w dół => odsłoń
      if (hidden2) {
        setCover2Hidden(false, { animate: true });
        render();
        await persistState();
      }
    } else {
      // w górę => zasłoń
      if (!hidden2) {
        setCover2Hidden(true, { animate: true });
        render();
        await persistState();
      }
    }
  } else {
    // gest poziomy (lewo/prawo)
    if (adx < SWIPE_MIN) return;
    if (adx < ady * SWIPE_SLOPE) return;

    if (dx > 0) {
      // w prawo => odsłoń
      if (hidden2) {
        setCover2Hidden(false, { animate: true });
        render();
        await persistState();
      }
    } else {
      // w lewo => zasłoń
      if (!hidden2) {
        setCover2Hidden(true, { animate: true });
        render();
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
  applyLayout();
  render();
});

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();
  applyLayout();

  if (window.navigator.standalone) {
    document.documentElement.classList.add("webapp");
  }

  // brak parametrów = lokalny podgląd
  if (!gameId || !key) {
    text1 = "";
    text2 = "";
    hidden2 = true;
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
  handleCmd,
  setText1,
  setText2Append,
  clearText1,
  clearText2,
};
