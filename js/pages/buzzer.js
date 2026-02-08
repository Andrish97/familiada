// js/pages/buzzer.js
import { initI18n, setUiLang, t } from "../../translation/translation.js";
import { sb } from "../core/supabase.js";
import { rt } from "../core/realtime.js";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");
const key = qs.get("key");

initI18n({ withSwitcher: true });

const btnFS = document.getElementById("btnFS");
const fsIco = document.getElementById("fsIco");

const offScreen = document.getElementById("offScreen");
const arena = document.getElementById("arena");
const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");

const DEVICE_ID_KEY = "familiada:deviceId:buzzer";
let deviceId = localStorage.getItem(DEVICE_ID_KEY);

if (!deviceId) {
  deviceId = "buz_" + (crypto?.randomUUID?.() || String(Math.random()).slice(2));
  deviceId = deviceId.replace(/-/g, "").slice(0, 24);
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
}

const STATE = {
  OFF: "OFF",
  ON: "ON",
  PUSHED_A: "PUSHED_A",
  PUSHED_B: "PUSHED_B",
};

let cur = STATE.OFF;

/* ========= FULLSCREEN (+ iOS fallback) ========= */
let pseudoFS = false;

function isIOSSafari() {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

function setFullscreenIcon() {
  if (!fsIco) return;
  const isReal = !!document.fullscreenElement;
  fsIco.textContent = (isReal || pseudoFS) ? "⧉" : "▢";
}

function setPseudoFS(on) {
  pseudoFS = !!on;
  document.documentElement.classList.toggle("pseudoFS", pseudoFS);
  // iOS: próba schowania paska adresu
  setTimeout(() => window.scrollTo(0, 1), 50);
  setFullscreenIcon();
}

async function toggleFullscreen() {
  
  if (isIOSSafari() && !window.navigator.standalone) {
    // w Safari nie zrobimy prawdziwego FS; pokaż instrukcję webapp
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
      return;
    }

    // wejście (spróbuj prawdziwego fullscreen)
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) throw new Error(t("common.fullscreenUnavailable"));
    await req.call(el, { navigationUI: "hide" });

    setFullscreenIcon();
  } catch (e) {
    // iOS / blokady / iframe => pseudo-fullscreen
    setPseudoFS(true);
    console.warn("[buzzer] fullscreen fallback:", e);
  }
}

/* ========= UI ========= */
function show(state) {
  cur = state;

  const isOff = state === STATE.OFF;

  offScreen && (offScreen.hidden = !isOff);
  arena && (arena.hidden = isOff);

  btnA?.classList.remove("lit", "dim");
  btnB?.classList.remove("lit", "dim");

  btnA && (btnA.disabled = true);
  btnB && (btnB.disabled = true);

  if (isOff) return;

  if (state === STATE.ON) {
    btnA.disabled = false;
    btnB.disabled = false;
    btnA.classList.add("dim");
    btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_A) {
    btnA.classList.add("lit");
    btnB.classList.add("dim");
    return;
  }

  if (state === STATE.PUSHED_B) {
    btnB.classList.add("lit");
    btnA.classList.add("dim");
  }
}

/* ========= SNAPSHOT ========= */
async function persistState() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
      p_patch: { state: cur, teamA, teamB },
    });
  } catch (e) {
    console.warn("[buzzer] persist failed", e);
  }
}

async function restoreState() {
  if (!gameId || !key) return;
  try {
    const { data, error } = await sb().rpc("device_state_get", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
    });
    if (error) throw error;

    const st = String(data?.state || "OFF").toUpperCase();

    const a = data?.teamA;
    const b = data?.teamB;
    
    if (typeof a === "string" && cssSupportsColor(a)) teamA = a;
    if (typeof b === "string" && cssSupportsColor(b)) teamB = b;
    
    applyTeamColors();
    
    show(STATE[st] ?? STATE.OFF);
  } catch {
    show(STATE.OFF);
  }
}

/* ========= COLORS (A/B) ========= */
const DEFAULT_A = "#c4002f";
const DEFAULT_B = "#2a62ff";

let teamA = DEFAULT_A;
let teamB = DEFAULT_B;

function normColorToken(raw) {
  // przyjmujemy: "rebeccapurple" albo "#c4002f"
  const s = String(raw ?? "").trim();
  return s;
}

function cssSupportsColor(value) {
  if (!value) return false;
  // CSS.supports jest wspierane w nowoczesnych, a iOS Safari też ogarnia
  if (window.CSS?.supports) return CSS.supports("color", value);
  return true; // fallback: dopuść, najwyżej nie zadziała wizualnie
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function parseHexToRgb(hex) {
  let h = String(hex).trim();
  if (!h.startsWith("#")) return null;

  h = h.slice(1);
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function rgbToHex({ r, g, b }) {
  const to2 = (n) => n.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function mixRgb(a, b, t) {
  t = clamp01(t);
  const lerp = (x, y) => Math.round(x + (y - x) * t);
  return {
    r: lerp(a.r, b.r),
    g: lerp(a.g, b.g),
    b: lerp(a.b, b.b),
  };
}

function derivePalette(baseColor) {
  // Jeśli to HEX -> liczymy sensowne hi/lo i glow.
  // Jeśli nazwa koloru -> też zadziała, ale hi/lo weźmiemy fallbackami.
  const rgb = parseHexToRgb(baseColor);

  if (!rgb) {
    // fallback: zostaw “hi/lo” na bazie domyślnych, ale glow ustawimy po prostu na kolor bazowy (o ile wspiera)
    return {
      hi: baseColor,
      lo: baseColor,
      glow: baseColor, // użyjemy z alpha niżej przez color-mix? nie wszędzie działa, więc damy rgba fallback w apply
      glowRgba: "rgba(255,255,255,.35)",
    };
  }

  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };

  const hi = rgbToHex(mixRgb(rgb, white, 0.25)); // jaśniej o ~25%
  const lo = rgbToHex(mixRgb(rgb, black, 0.45)); // ciemniej o ~45%

  const glowRgba = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .35)`;

  return { hi, lo, glowRgba };
}

function applyTeamColors() {
  const root = document.documentElement;

  root.style.setProperty("--team-a", teamA);
  root.style.setProperty("--team-b", teamB);

  const pa = derivePalette(teamA);
  const pb = derivePalette(teamB);

  root.style.setProperty("--team-a-hi", pa.hi);
  root.style.setProperty("--team-a-lo", pa.lo);
  root.style.setProperty("--glow-a", pa.glowRgba);

  root.style.setProperty("--team-b-hi", pb.hi);
  root.style.setProperty("--team-b-lo", pb.lo);
  root.style.setProperty("--glow-b", pb.glowRgba);
}

async function persistColorsOnly() {
  if (!gameId || !key) return;
  try {
    await sb().rpc("device_state_set_public", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
      p_patch: { teamA, teamB },
    });
  } catch (e) {
    console.warn("[buzzer] persist colors failed", e);
  }
}


/* ========= REALTIME ========= */
let ch = null;

async function handleCommand(lineRaw) {
  const raw = String(lineRaw || "").trim();
  const up = raw.toUpperCase();

  if (up.startsWith("LANG")) {
    const lang = raw.slice("LANG".length).trim();
    await setUiLang(lang, { persist: true, updateUrl: true, apply: true });
    return;
  }

  // ===== KOLORY (niezależne od stanu) =====
  if (up === "COLOR_RESET") {
    teamA = DEFAULT_A;
    teamB = DEFAULT_B;
    applyTeamColors();
    await persistColorsOnly();
    return;
  }

  if (up.startsWith("COLOR_A")) {
    const value = normColorToken(raw.slice("COLOR_A".length));
    if (cssSupportsColor(value)) {
      teamA = value;
      applyTeamColors();
      await persistColorsOnly();
    }
    return;
  }

  if (up.startsWith("COLOR_B")) {
    const value = normColorToken(raw.slice("COLOR_B".length));
    if (cssSupportsColor(value)) {
      teamB = value;
      applyTeamColors();
      await persistColorsOnly();
    }
    return;
  }

  // ===== STANY =====
  if (up === "OFF")   { show(STATE.OFF);   await persistState(); return; }
  if (up === "ON")    { show(STATE.ON);    await persistState(); return; }
  if (up === "RESET") { show(STATE.ON);    await persistState(); return; }

  if (up === "PUSHED A" || up === "PUSHED_A") {
    show(STATE.PUSHED_A);
    await persistState();
    return;
  }

  if (up === "PUSHED B" || up === "PUSHED_B") {
    show(STATE.PUSHED_B);
    await persistState();
    return;
  }

  console.warn("[buzzer] unknown command:", raw);
}

function ensureChannel() {
  if (ch) return ch;

  ch = sb()
    .channel(`familiada-buzzer:${gameId}`)
    .on("broadcast", { event: "BUZZER_CMD" }, (msg) => {
      // async nie musi być awaitowane, ale dobrze logować błędy
      handleCommand(msg?.payload?.line).catch((e) =>
        console.warn("[buzzer] handleCommand failed", e)
      );
    })
    .subscribe();

  return ch;
}

/* ========= CLICK -> CONTROL ========= */
async function sendClick(team) {
  try {
    await rt(`familiada-control:${gameId}`)
      .sendBroadcast("BUZZER_EVT", { line: `CLICK ${team}` }, { mode: "http" });
  } catch (e) {
    console.warn("[buzzer] click failed", e);
  }
}

async function press(team, ev) {
  ev?.preventDefault?.();
  if (cur !== STATE.ON) return;

  show(team === "A" ? STATE.PUSHED_A : STATE.PUSHED_B);
  await persistState();
  await sendClick(team);
}

/* ========= PRESENCE ========= */
async function ping() {
  if (!gameId || !key) return;

  const { data, error } = await sb().rpc("device_ping", {
      p_game_id: gameId,
      p_device_type: "buzzer",
      p_key: key,
      p_device_id: deviceId,
      p_meta: {},
  });

  if (error) {
    console.warn("[buzzer] device_ping error:", error);
    return;
  }

  // jeśli funkcja zwraca device_id (u Ciebie tak robi dla display), utrzymaj spójność
  if (data?.device_id && data.device_id !== deviceId) {
    deviceId = data.device_id;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
}

/* ========= BOOT ========= */
btnFS?.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", setFullscreenIcon);

btnA?.addEventListener("touchstart", (e) => press("A", e), { passive: false });
btnB?.addEventListener("touchstart", (e) => press("B", e), { passive: false });
btnA?.addEventListener("click", (e) => press("A", e));
btnB?.addEventListener("click", (e) => press("B", e));

document.addEventListener("DOMContentLoaded", async () => {
  setFullscreenIcon();
  applyTeamColors();

  if (window.navigator.standalone) {
    document.documentElement.classList.add("webapp");
  }

  // tryb totalnie lokalny (bez gameId) – nie ma czego słuchać
  if (!gameId) {
    show(STATE.OFF);
    return;
  }

  // KLUCZ: odbiór komend działa nawet bez key
  ensureChannel();

  // bez key nie robimy RPC/presence, ale komendy od operatora mają działać
  if (!key) {
    show(STATE.OFF);
    return;
  }

  await restoreState();

  ping();
  setInterval(ping, 5000);
});

window.__buzzer = {
  show,
  STATE,
  handleCommand,
};
