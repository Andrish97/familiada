// js/pages/control.js
import { sb } from "../core/supabase.js";
import * as SFX from "../core/sfx.js";
import { rt } from "../core/realtime.js";
import { requireAuth, signOut } from "../core/auth.js";

import {
  validateGameReadyToPlay,
  loadGameBasic,
  loadQuestions,
  loadAnswers,
} from "../core/game-validate.js";

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

/* ===== DOM ===== */
const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");

const gameLabel = $("gameLabel");
const gameMeta = $("gameMeta");

const msgDevices = $("msgDevices");
const msgCmd = $("msgCmd");

// device cards
const displayLink = $("displayLink");
const hostLink = $("hostLink");
const buzzerLink = $("buzzerLink");

const pillDisplay = $("pillDisplay");
const pillHost = $("pillHost");
const pillBuzzer = $("pillBuzzer");

const seenDisplay = $("seenDisplay");
const seenHost = $("seenHost");
const seenBuzzer = $("seenBuzzer");

const lastCmdDisplay = $("lastCmdDisplay");
const lastCmdHost = $("lastCmdHost");
const lastCmdBuzzer = $("lastCmdBuzzer");

const btnCopyDisplay = $("btnCopyDisplay");
const btnCopyHost = $("btnCopyHost");
const btnCopyBuzzer = $("btnCopyBuzzer");

const btnOpenDisplay = $("btnOpenDisplay");
const btnOpenHost = $("btnOpenHost");
const btnOpenBuzzer = $("btnOpenBuzzer");

const btnResendDisplay = $("btnResendDisplay");
const btnResendHost = $("btnResendHost");
const btnResendBuzzer = $("btnResendBuzzer");

// manual
const manualTarget = $("manualTarget");
const manualLine = $("manualLine");
const btnManualSend = $("btnManualSend");

// host card
const hostText = $("hostText");
const btnHostSend = $("btnHostSend");
const btnHostOn = $("btnHostOn");
const btnHostOff = $("btnHostOff");
const btnHostClear = $("btnHostClear");

// buzzer state buttons
const btnBuzzOff = $("btnBuzzOff");
const btnBuzzOn = $("btnBuzzOn");
const btnBuzzReset = $("btnBuzzReset");
const btnBuzzPA = $("btnBuzzPA");
const btnBuzzPB = $("btnBuzzPB");

// display test buttons
const btnDispBlack = $("btnDispBlack");
const btnDispQR = $("btnDispQR");
const btnDispGRA = $("btnDispGRA");
const btnDispLogo = $("btnDispLogo");
const btnDispRounds = $("btnDispRounds");
const btnDispFinal = $("btnDispFinal");
const btnDispWin = $("btnDispWin");
const btnDispDemoRounds = $("btnDispDemoRounds");
const btnDispDemoFinal = $("btnDispDemoFinal");

// buzzer check/log
const btnBuzzCheck = $("btnBuzzCheck");
const buzzCheckStatus = $("buzzCheckStatus");
const buzzPresence = $("buzzPresence");
const buzzEvtLast = $("buzzEvtLast");
const buzzLog = $("buzzLog");
const btnBuzzLogClear = $("btnBuzzLogClear");

// audio unlock (opcjonalne)
const btnUnlockAudio = $("btnUnlockAudio");
const audioStatus = $("audioStatus");

// questions
const qList = $("qList");
const aList = $("aList");
const qPick = $("qPick");
const btnQReload = $("btnQReload");

/* ===== tabs ===== */
document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");

    const tab = b.dataset.tab;
    document.querySelectorAll("[data-panel]").forEach((p) => (p.style.display = "none"));
    const panel = document.querySelector(`[data-panel="${tab}"]`);
    if (panel) panel.style.display = "";
  });
});

/* ===== state ===== */
let game = null;

const ONLINE_MS = 12_000;
const LS_KEY = (kind) => `familiada:lastcmd:${gameId}:${kind}`;
const lastCmd = { display: null, host: null, buzzer: null };

// presence cache – JEDYNE źródło statusu urządzeń i buzz-check
let presenceRows = [];

// realtime managers (persistent)
let rtDisplay = null;
let rtHost = null;
let rtBuzzer = null;
let rtControl = null;

/* ===== helpers ===== */
function setMsg(el, text) {
  if (el) el.textContent = text || "";
}

function badge(el, status, text) {
  if (!el) return;
  el.classList.remove("ok", "bad", "mid");
  if (status) el.classList.add(status);
  el.textContent = text;
}

function fmtSince(ts) {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return `${s}s temu`;
}

function makeUrl(path, id, key) {
  const u = new URL(path, location.origin);
  u.searchParams.set("id", id);
  u.searchParams.set("key", key);
  return u.toString();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    SFX.playSfx?.("ui_tick"); // zamierzone 😄
    return true;
  } catch {
    return false;
  }
}

function loadLastCmdFromStorage() {
  lastCmd.display = localStorage.getItem(LS_KEY("display"));
  lastCmd.host = localStorage.getItem(LS_KEY("host"));
  lastCmd.buzzer = localStorage.getItem(LS_KEY("buzzer"));
}

function saveLastCmdToStorage(kind, line) {
  try { localStorage.setItem(LS_KEY(kind), String(line)); } catch {}
}

function refreshLastCmdUI() {
  if (lastCmdDisplay) lastCmdDisplay.textContent = lastCmd.display || "—";
  if (lastCmdHost) lastCmdHost.textContent = lastCmd.host || "—";
  if (lastCmdBuzzer) lastCmdBuzzer.textContent = lastCmd.buzzer || "—";
}

async function ensureAuthOrRedirect() {
  const user = await requireAuth("/familiada/index.html");
  if (who) who.textContent = user?.email || user?.id || "—";
  return user;
}

function setBuzzStatus(kind, text) {
  if (!buzzCheckStatus) return;
  buzzCheckStatus.textContent = text;
  buzzCheckStatus.classList.remove("ok", "bad", "mid");
  buzzCheckStatus.classList.add(kind);
}

function logBuzz(line) {
  if (!buzzLog) return;
  const ts = new Date().toLocaleTimeString();
  buzzLog.textContent = `[${ts}] ${line}\n` + buzzLog.textContent;
}

function newestPresenceRow(type) {
  const t = String(type || "").toLowerCase();
  return (
    (presenceRows || [])
      .filter((r) => String(r.device_type || "").toLowerCase() === t)
      .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0] || null
  );
}

function isOnline(row) {
  if (!row?.last_seen_at) return false;
  const age = Date.now() - new Date(row.last_seen_at).getTime();
  return age < ONLINE_MS;
}

/* ===== game load + validate ===== */
async function loadGameOrThrow() {
  if (!gameId) throw new Error("Brak ?id w URL.");

  const basic = await loadGameBasic(gameId);

  const v = await validateGameReadyToPlay(gameId);
  if (!v.ok) throw new Error(`Ta gra nie jest gotowa do PLAY: ${v.reason}`);

  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_display,share_key_host,share_key_buzzer")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  if (data.id !== basic.id) throw new Error("Rozjazd danych gry (validate vs games).");

  return data;
}

/* ===== presence ===== */
async function fetchPresenceSafe() {
  const { data, error } = await sb()
    .from("device_presence")
    .select("device_type,device_id,last_seen_at")
    .eq("game_id", game.id);

  if (error) return { ok: false, rows: [], error };
  return { ok: true, rows: data || [], error: null };
}

function applyPresence(rows) {
  presenceRows = rows || [];

  const d = newestPresenceRow("display");
  const h = newestPresenceRow("host");
  const b = newestPresenceRow("buzzer");

  badge(pillDisplay, isOnline(d) ? "ok" : "bad", isOnline(d) ? "OK" : "OFFLINE");
  badge(pillHost, isOnline(h) ? "ok" : "bad", isOnline(h) ? "OK" : "OFFLINE");
  badge(pillBuzzer, isOnline(b) ? "ok" : "bad", isOnline(b) ? "OK" : "OFFLINE");

  if (seenDisplay) seenDisplay.textContent = fmtSince(d?.last_seen_at);
  if (seenHost) seenHost.textContent = fmtSince(h?.last_seen_at);
  if (seenBuzzer) seenBuzzer.textContent = fmtSince(b?.last_seen_at);

  // buzz-check UI też z tego samego źródła (bez query drugi raz)
  if (buzzPresence) {
    if (!b) buzzPresence.textContent = "—";
    else buzzPresence.textContent = `${b.device_id || "?"} — ${fmtSince(b.last_seen_at)}`;
  }
}

function applyPresenceUnavailable() {
  presenceRows = [];
  badge(pillDisplay, "mid", "—");
  badge(pillHost, "mid", "—");
  badge(pillBuzzer, "mid", "—");
  if (seenDisplay) seenDisplay.textContent = "brak tabeli";
  if (seenHost) seenHost.textContent = "brak tabeli";
  if (seenBuzzer) seenBuzzer.textContent = "brak tabeli";
}

/* ===== realtime (rt manager) ===== */
function topicFor(target) {
  if (target === "display") return `familiada-display:${game.id}`;
  if (target === "host") return `familiada-host:${game.id}`;
  return `familiada-buzzer:${game.id}`;
}

function eventFor(target) {
  if (target === "display") return "DISPLAY_CMD";
  if (target === "host") return "HOST_CMD";
  return "BUZZER_CMD";
}

async function ensureRealtime() {
  rtDisplay ??= rt(topicFor("display"));
  rtHost ??= rt(topicFor("host"));
  rtBuzzer ??= rt(topicFor("buzzer"));
  rtControl ??= rt(`familiada-control:${game.id}`);

  // podnieś WS wcześniej
  await Promise.all([
    rtDisplay.whenReady().catch(() => false),
    rtHost.whenReady().catch(() => false),
    rtBuzzer.whenReady().catch(() => false),
    rtControl.whenReady().catch(() => false),
  ]);
}

async function sendCmd(target, line) {
  const t = String(target || "").toLowerCase();
  const l = String(line ?? "").trim();
  if (!l) return;

  await ensureRealtime();
  await rt(topicFor(t)).sendBroadcast(eventFor(t), { line: l });

  lastCmd[t] = l;
  saveLastCmdToStorage(t, l);
  refreshLastCmdUI();
  SFX.playSfx?.("ui_tick");
}

/* ===== links ===== */
function fillLinks() {
  const displayUrl = makeUrl("/familiada/display/index.html", game.id, game.share_key_display);
  const hostUrl = makeUrl("/familiada/host.html", game.id, game.share_key_host);

  const buzKey = game.share_key_buzzer;
  const buzzerUrl = makeUrl("/familiada/buzzer.html", game.id, buzKey || "");

  displayLink && (displayLink.value = displayUrl);
  hostLink && (hostLink.value = hostUrl);
  buzzerLink && (buzzerLink.value = buzzerUrl);

  btnOpenDisplay && (btnOpenDisplay.onclick = () => window.open(displayUrl, "_blank"));
  btnOpenHost && (btnOpenHost.onclick = () => window.open(hostUrl, "_blank"));
  btnOpenBuzzer && (btnOpenBuzzer.onclick = () => {
    if (!buzKey) return setMsg(msgDevices, "Brak share_key_buzzer w tej grze.");
    window.open(buzzerUrl, "_blank");
  });

  btnCopyDisplay && (btnCopyDisplay.onclick = async () =>
    setMsg(msgDevices, (await copyToClipboard(displayUrl)) ? "Skopiowano link display." : "Nie mogę skopiować.")
  );
  btnCopyHost && (btnCopyHost.onclick = async () =>
    setMsg(msgDevices, (await copyToClipboard(hostUrl)) ? "Skopiowano link host." : "Nie mogę skopiować.")
  );
  btnCopyBuzzer && (btnCopyBuzzer.onclick = async () => {
    if (!buzKey) return setMsg(msgDevices, "Brak share_key_buzzer w tej grze.");
    setMsg(msgDevices, (await copyToClipboard(buzzerUrl)) ? "Skopiowano link buzzer." : "Nie mogę skopiować.");
  });
}

/* ===== resend ===== */
btnResendDisplay && (btnResendDisplay.onclick = async () => {
  if (!lastCmd.display) return setMsg(msgCmd, "Brak last dla display.");
  await sendCmd("display", lastCmd.display);
  setMsg(msgCmd, `display <= ${lastCmd.display}`);
});
btnResendHost && (btnResendHost.onclick = async () => {
  if (!lastCmd.host) return setMsg(msgCmd, "Brak last dla host.");
  await sendCmd("host", lastCmd.host);
  setMsg(msgCmd, `host <= ${lastCmd.host}`);
});
btnResendBuzzer && (btnResendBuzzer.onclick = async () => {
  if (!lastCmd.buzzer) return setMsg(msgCmd, "Brak last dla buzzer.");
  await sendCmd("buzzer", lastCmd.buzzer);
  setMsg(msgCmd, `buzzer <= ${lastCmd.buzzer}`);
});

/* ===== manual ===== */
btnManualSend && (btnManualSend.onclick = async () => {
  try {
    await sendCmd(manualTarget?.value, manualLine?.value);
    setMsg(msgCmd, `${manualTarget?.value} <= ${manualLine?.value}`);
    if (manualLine) manualLine.value = "";
  } catch (err) {
    setMsg(msgCmd, `Błąd: ${err?.message || String(err)}`);
  }
});

/* ===== host card ===== */
btnHostSend && (btnHostSend.onclick = async () => {
  const t = String(hostText?.value ?? "");
  // minimalne “bezpieczne” cytowanie: \ i "
  const payload = t.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\r\n", "\n");
  await sendCmd("host", `SET "${payload}"`);
  setMsg(msgCmd, `host <= SET (${t.length} znaków)`);
});
btnHostOn && (btnHostOn.onclick = async () => sendCmd("host", "ON"));
btnHostOff && (btnHostOff.onclick = async () => sendCmd("host", "OFF"));
btnHostClear && (btnHostClear.onclick = async () => sendCmd("host", "CLEAR"));

/* ===== buzzer state buttons ===== */
btnBuzzOff && (btnBuzzOff.onclick = async () => sendCmd("buzzer", "OFF"));
btnBuzzOn && (btnBuzzOn.onclick = async () => sendCmd("buzzer", "ON"));
btnBuzzReset && (btnBuzzReset.onclick = async () => sendCmd("buzzer", "RESET"));
btnBuzzPA && (btnBuzzPA.onclick = async () => sendCmd("buzzer", "PUSHED A"));
btnBuzzPB && (btnBuzzPB.onclick = async () => sendCmd("buzzer", "PUSHED B"));

/* ===== display tests (Guide API) ===== */
btnDispBlack && (btnDispBlack.onclick = async () => sendCmd("display", "MODE BLACK"));
btnDispQR && (btnDispQR.onclick = async () => sendCmd("display", "MODE QR"));
btnDispGRA && (btnDispGRA.onclick = async () => sendCmd("display", "MODE GRA"));

btnDispLogo && (btnDispLogo.onclick = async () => sendCmd("display", "MODE LOGO"));
btnDispRounds && (btnDispRounds.onclick = async () => sendCmd("display", "MODE ROUNDS"));
btnDispFinal && (btnDispFinal.onclick = async () => sendCmd("display", "MODE FINAL"));
btnDispWin && (btnDispWin.onclick = async () => sendCmd("display", "MODE WIN"));

btnDispDemoRounds && (btnDispDemoRounds.onclick = async () =>
  sendCmd(
    "display",
    'RBATCH SUMA 120 R1 "PIERWSZA" 10 R2 "DRUGA" 25 R3 "TRZECIA" 05 R4 "" 00 R5 "PIATA" 30 R6 "SZOSTA" 15 ANIMOUT edge right 18 ANIMIN rain down 22'
  )
);
btnDispDemoFinal && (btnDispDemoFinal.onclick = async () =>
  sendCmd(
    "display",
    'FBATCH SUMA 999 F1 "ALFA" 12 34 "BETA" F2 "GAMMA" 01 99 "DELTA" ANIMOUT matrix right 20 ANIMIN rain down 22'
  )
);

/* ===== BUZZER EVT listener ===== */
function attachBuzzerEvt() {
  rtControl.onBroadcast("BUZZER_EVT", (msg) => {
    const line = String(msg?.payload?.line ?? "").trim();
    if (!line) return;
    if (buzzEvtLast) buzzEvtLast.textContent = line;
    logBuzz(`BUZZER_EVT: ${line}`);
  });
}

/* ===== buzz check: NO DB query, uses presence cache ===== */
btnBuzzCheck?.addEventListener("click", async () => {
  try {
    setBuzzStatus("mid", "SPRAWDZAM…");
    await ensureRealtime();

    const b = newestPresenceRow("buzzer");
    if (!b) {
      setBuzzStatus("bad", "BRAK");
      logBuzz("Brak rekordu presence dla buzzera (jeszcze nie pingował).");
      return;
    }

    if (!isOnline(b)) {
      setBuzzStatus("bad", "OFFLINE");
      logBuzz(`Presence: OFFLINE (${fmtSince(b.last_seen_at)}).`);
      return;
    }

    setBuzzStatus("ok", "ONLINE");
    logBuzz("Presence: ONLINE. Kliknij A/B na buzzerze — powinno wpaść BUZZER_EVT.");
  } catch (e) {
    setBuzzStatus("bad", "BŁĄD");
    logBuzz(`Błąd: ${e?.message || String(e)}`);
  }
});

btnBuzzLogClear?.addEventListener("click", () => {
  if (buzzLog) buzzLog.textContent = "";
  if (buzzEvtLast) buzzEvtLast.textContent = "—";
});

/* ===== questions ===== */
let questions = [];
let answersByQ = new Map();
let activeQid = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderQuestions() {
  if (!qList || !qPick) return;

  qList.innerHTML = questions
    .map((q) => {
      const active = q.id === activeQid ? " style='border-color: rgba(255,234,166,.35)'" : "";
      return `<button class="aBtn" data-qid="${q.id}"${active}>
        <div class="aTop"><span>#${q.ord}</span><span>${q.id.slice(0, 6)}…</span></div>
        <div class="aText">${escapeHtml(q.text || "")}</div>
      </button>`;
    })
    .join("");

  qPick.innerHTML = questions
    .map((q) => `<option value="${q.id}">#${q.ord} — ${escapeHtml(q.text || "")}</option>`)
    .join("");

  if (activeQid) qPick.value = activeQid;
}

function renderAnswers() {
  if (!aList) return;
  const ans = answersByQ.get(activeQid) || [];
  aList.innerHTML = ans
    .map((a) => {
      const pts = Number.isFinite(Number(a.fixed_points)) ? Number(a.fixed_points) : 0;
      return `<div class="card" style="padding:12px;">
        <div class="head">
          <div class="name">${escapeHtml(a.text || "")}</div>
          <div class="badge ok">${String(pts)}</div>
        </div>
        <div class="hint">ord: ${a.ord} • id: ${a.id}</div>
      </div>`;
    })
    .join("");
}

async function reloadQA() {
  setMsg(msgCmd, "Ładuję pytania…");
  questions = await loadQuestions(game.id);
  answersByQ = new Map();
  for (const q of questions) {
    answersByQ.set(q.id, await loadAnswers(q.id));
  }
  activeQid ||= questions[0]?.id || null;
  renderQuestions();
  renderAnswers();
  setMsg(msgCmd, `Załadowano: ${questions.length} pytań.`);
}

qList?.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-qid]");
  if (!b) return;
  activeQid = b.dataset.qid || null;
  renderQuestions();
  renderAnswers();
});

qPick?.addEventListener("change", () => {
  activeQid = qPick.value || null;
  renderQuestions();
  renderAnswers();
});

btnQReload && (btnQReload.onclick = () => reloadQA().catch((e) => setMsg(msgCmd, e?.message || String(e))));

/* ===== audio unlock UI (opcjonalne, tylko jeśli masz to w sfx.js) ===== */
function refreshAudioStatus() {
  if (!audioStatus) return;
  const ok = typeof SFX.isAudioUnlocked === "function" ? !!SFX.isAudioUnlocked() : false;
  audioStatus.textContent = ok ? "OK" : "ZABLOKOWANE";
  audioStatus.className = "badge " + (ok ? "ok" : "bad");
}

btnUnlockAudio?.addEventListener("click", async () => {
  try {
    if (typeof SFX.unlockAudio === "function") await SFX.unlockAudio();
    SFX.playSfx?.("ui_tick");
  } catch {}
  refreshAudioStatus();
});

/* ===== topbar ===== */
btnBack && (btnBack.onclick = () => (location.href = "/familiada/builder.html"));
btnLogout && (btnLogout.onclick = async () => {
  await signOut().catch(() => {});
  location.href = "/familiada/index.html";
});

/* ===== boot ===== */
async function main() {
  setMsg(msgDevices, "");
  setMsg(msgCmd, "");

  await ensureAuthOrRedirect();
  game = await loadGameOrThrow();

  if (gameLabel) gameLabel.textContent = `Control — ${game.name}`;
  if (gameMeta) gameMeta.textContent = `${game.type} / ${game.status} / ${game.id}`;

  loadLastCmdFromStorage();
  refreshLastCmdUI();
  fillLinks();

  await ensureRealtime();
  attachBuzzerEvt();

  refreshAudioStatus();

  await reloadQA().catch(() => {});

  const tick = async () => {
    const res = await fetchPresenceSafe();
    if (!res.ok) {
      applyPresenceUnavailable();
      setMsg(msgDevices, "Brak tabeli device_presence (status = —).");
      return;
    }
    applyPresence(res.rows);
    setMsg(msgDevices, "");
  };

  await tick();
  setInterval(tick, 1500);
}

main().catch((e) => setMsg(msgDevices, e?.message || String(e)));
