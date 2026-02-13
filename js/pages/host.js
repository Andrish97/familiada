// /familiada/js/pages/host.js
import { initI18n, setUiLang, t } from "../../translation/translation.js";
import { sb } from "../core/supabase.js";

/* ========= PARAMS ========= */
const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

initI18n({ withSwitcher: false });

/* ========= DOM ========= */
const paperText1 = document.getElementById("paperText1");
const paperText2 = document.getElementById("paperText2");
const cover2 = document.getElementById("cover2");
const cover2Swipe = document.getElementById("cover2Swipe");
const p2Hint = document.getElementById("p2Hint");

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

// sekcje (nie zmieniamy HTML — bierzemy po klasach)
const pane1 = document.querySelector(".pane1");
const pane2 = document.querySelector(".pane2");

window.addEventListener("i18n:lang", () => {
  updateSwipeHint();
});

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

/* ========= COLORS (A/B) ========= */
const DEFAULT_A = "#c4002f";
const DEFAULT_B = "#2a62ff";

let coverA = DEFAULT_A;
let coverB = DEFAULT_B;

function normColorToken(raw) {
  return String(raw ?? "").trim();
}

function cssSupportsColor(value) {
  if (!value) return false;
  if (window.CSS?.supports) return CSS.supports("color", value);
  return true; // fallback
}

function applyCoverColors() {
  const root = document.documentElement;
  root.style.setProperty("--cover-grad-a", coverA);
  root.style.setProperty("--cover-grad-b", coverB);
}

function resetCoverColors() {
  coverA = DEFAULT_A;
  coverB = DEFAULT_B;
  applyCoverColors();
}

/* ========= ORIENTATION (tylko klasy portrait/landscape na <html>) ========= */
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
  // iOS: próba schowania paska
  setTimeout(() => window.scrollTo(0, 1), 50);
}

function setFullscreenIcon() {
  if (!fsIco) return;
  const isReal = !!document.fullscreenElement;
  fsIco.textContent = isReal || pseudoFS ? "⧉" : "▢";
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
    if (!req) throw new Error(t("common.fullscreenUnavailable"));
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

function markIOS() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  document.documentElement.classList.toggle("ios", isIOS);
}


function updateOuterInsets() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const o = getOrientation();

  const safeL = parseFloat(cs.getPropertyValue("--safe-left")) || 0;
  const safeR = parseFloat(cs.getPropertyValue("--safe-right")) || 0;

  if (o === "landscape") {
    root.style.setProperty("--outer-left", `${safeL}px`);
    root.style.setProperty("--outer-right", `${safeR}px`);
  } else {
    root.style.setProperty("--outer-left", `0px`);
    root.style.setProperty("--outer-right", `0px`);
  }
}

function updateLinePx() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);

  // bierzemy obliczone --line (już po clamp), zamieniamy na px i ZAOKRĄGLAMY
  const raw = parseFloat(cs.getPropertyValue("--line").trim()) || 0;
  if (!raw) return;

  // 0.5px też bywa OK, ale najstabilniej jest pełny px
  const snapped = Math.round(raw);

  root.style.setProperty("--line-px", `${snapped}px`);
}

function updateLineSnap() {
  const line = pxVar("--line-px");
  if (!line) return;

  const vpadTop1 = pxVar("--vpad-top-1");
  const vpadTop2 = pxVar("--vpad-top-2");

  const topPad1 = pxVar("--top-pad-1");
  const topPad2 = pxVar("--top-pad-2");

  const p1Top = pane1?.getBoundingClientRect().top ?? 0;
  const p2Top = pane2?.getBoundingClientRect().top ?? 0;

  const snapFor = (base) => {
    const mod = ((base % line) + line) % line;
    return mod === 0 ? 0 : (line - mod);
  };

  // realny start tekstu = top panelu + vpad-top (per panel!) + top-pad
  const base1 = p1Top + vpadTop1 + topPad1;
  const base2 = p2Top + vpadTop2 + topPad2;

  document.documentElement.style.setProperty("--snap-top-1", `${snapFor(base1)}px`);
  document.documentElement.style.setProperty("--snap-top-2", `${snapFor(base2)}px`);
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
  const tokens = String(tokenStr || "").trim().split(/\s+/).filter(Boolean);

  for (const tRaw of tokens) {
    const t = tRaw.toLowerCase();
    if (t === "b") out.bold = true;
    else if (t === "u") out.underline = true;
    else if (t === "s") out.strike = true;
    else out.color = tRaw;
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
    segs.push({ text: inner, style: parseStyleTokens(tag) });
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

  const onCover =
    o === "portrait"
      ? (p2Covered ? t("host.swipeRevealDown") : t("host.swipeCoverUp"))
      : (p2Covered ? t("host.swipeRevealRight") : t("host.swipeCoverLeft"));

  if (cover2Swipe) cover2Swipe.textContent = onCover;

  if (p2Hint) {
    p2Hint.textContent = o === "portrait" ? t("host.swipeCoverUp") : t("host.swipeCoverLeft");
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

    document.documentElement.classList.toggle("p2Open", !p2Covered);
    updateSwipeHint();
  }

  // po zmianach UI/layoutu — przelicz snap
  updateLineSnap();
}

/* ========= TEXT API ========= */
function setText1(next) { text1 = String(next ?? ""); render(); }
function setText2(next) { text2 = String(next ?? ""); render(); }

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

function clear1() { text1 = ""; render(); }
function clear2() { text2 = ""; render(); }

function coverP2(on) { p2Covered = !!on; render(); }

/* ========= SNAPSHOT (device_state) ========= */
async function persistState() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_device_type: "host",
      p_key: key,
      p_patch: { text1, text2, p2Covered, coverA, coverB },
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
    const a = data?.coverA;
    const b = data?.coverB;
    
    if (typeof a === "string" && cssSupportsColor(a)) coverA = a;
    if (typeof b === "string" && cssSupportsColor(b)) coverB = b;
    
    applyCoverColors();
    
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
  return String(s).replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
}

async function handleCommand(lineRaw) {
  const line = String(lineRaw ?? "").trim();
  if (!line) return;
  const up = line.toUpperCase();

  if (up.startsWith("LANG")) {
    const lang = line.slice("LANG".length).trim();
    await setUiLang(lang, { persist: true, updateUrl: true, apply: true });
    return;
  }

  // COLOR_A <color>
  if (up.startsWith("COLOR_A")) {
    const value = normColorToken(line.slice("COLOR_A".length));
    if (cssSupportsColor(value)) {
      coverA = value;
      applyCoverColors();
      await persistState();
    }
    return;
  }
  
  // COLOR_B <color>
  if (up.startsWith("COLOR_B")) {
    const value = normColorToken(line.slice("COLOR_B".length));
    if (cssSupportsColor(value)) {
      coverB = value;
      applyCoverColors();
      await persistState();
    }
    return;
  }
  
  // COLOR_RESET
  if (up === "COLOR_RESET") {
    resetCoverColors();
    await persistState();
    return;
  }

  // ===== NOWE: zasłona pasma 2 =====
  if (up === "COVER") {
    coverP2(true);
    await persistState();
    return;
  }
  if (up === "UNCOVER") {
    coverP2(false);
    await persistState();
    return;
  }

  // ===== NOWE: ogólny CLEAR (czyści oba) =====
  if (up === "CLEAR") {
    clear1();
    clear2();
    await persistState();
    return;
  }

  // ===== dotychczasowe =====
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
let pingTimer = null;
function ensureChannel() {
  if (ch) return ch;
  ch = sb()
    .channel(`familiada-host:${gameId}`)
    .on("broadcast", { event: "HOST_CMD" }, (msg) => {
      handleCommand(msg?.payload?.line);
    })
    .subscribe();
  return ch;
}

/* ========= PRESENCE ========= */
async function ping() {
  if (!gameId || !key) return;
  if (document.visibilityState !== "visible") return;
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
      if (p2Covered) {
        coverP2(false);
        await persistState();
      }
    } else {
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
      if (p2Covered) {
        coverP2(false);
        await persistState();
      }
    } else {
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
  updateOuterInsets();
  updateLinePx();
  refreshCssMetrics();
  updateSwipeHint();
  updateLineSnap();
});

document.addEventListener("DOMContentLoaded", async () => {
  applyCoverColors();
  applyOrientationClass();
  updateOuterInsets();
  updateLinePx();
  refreshCssMetrics();
  setFullscreenIcon();

  // ważne: po pierwszym layoucie (grid/panele) – wtedy rect.top ma sens
  requestAnimationFrame(() => updateLineSnap());

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

  const startPingLoop = () => {
    if (pingTimer) return;
    ping();
    pingTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void ping();
    }, 5000);
  };

  const stopPingLoop = () => {
    if (!pingTimer) return;
    clearInterval(pingTimer);
    pingTimer = null;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      startPingLoop();
      void ping();
      return;
    }
    stopPingLoop();
  });

  startPingLoop();
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
  handleCommand,
  ping,
};
