// js/pages/control.js
import { sb } from "../core/supabase.js";
import { playSfx, createSfxMixer, listSfx, unlockAudio, isAudioUnlocked } from "../core/sfx.js";
import { requireAuth, signOut } from "../core/auth.js";
import { validateGameReadyToPlay, loadGameBasic, loadQuestions, loadAnswers } from "../core/game-validate.js";

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

// tabs
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

// manual
const manualTarget = $("manualTarget");
const manualLine = $("manualLine");
const btnManualSend = $("btnManualSend");

// audio
const btnUnlockAudio = $("btnUnlockAudio");
const audioStatus = $("audioStatus");

// host text
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

// sfx test
const sfxSelect = $("sfxSelect");
const btnSfxPlay = $("btnSfxPlay");
const btnSfxStop = $("btnSfxStop");
const sfxClock = $("sfxClock");
const sfxAtSec = $("sfxAtSec");
const sfxAtName = $("sfxAtName");
const btnSfxAtArm = $("btnSfxAtArm");
const btnSfxAtClear = $("btnSfxAtClear");

// questions
const qList = $("qList");
const aList = $("aList");
const qPick = $("qPick");
const btnQReload = $("btnQReload");

// buzzer log
const buzzEvtLast = $("buzzEvtLast");
const buzzLog = $("buzzLog");
const btnBuzzLogClear = $("btnBuzzLogClear");

/* ===== state ===== */
let game = null;

const ONLINE_MS = 12_000;
const LS_KEY = (kind) => `familiada:lastcmd:${gameId}:${kind}`;
const lastCmd = { display: null, host: null, buzzer: null };

// realtime channels (persistent)
let chDisplay = null;
let chHost = null;
let chBuzzer = null;
let ctlCh = null;

/* ===== helpers ===== */
function setMsg(el, text) { if (el) el.textContent = text || ""; }

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
    playSfx("ui_tick");
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

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logBuzz(line) {
  if (!buzzLog) return;
  const ts = new Date().toLocaleTimeString();
  buzzLog.textContent = `[${ts}] ${line}\n` + (buzzLog.textContent || "");
}

/* ===== auth ===== */
async function ensureAuthOrRedirect() {
  const user = await requireAuth("/familiada/index.html");
  if (who) who.textContent = user?.email || user?.id || "—";
  return user;
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
  if (data?.id !== basic.id) throw new Error("Rozjazd danych gry (validate vs games).");
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
  const now = Date.now();

  const pickNewest = (t) =>
    rows
      .filter((r) => String(r.device_type || "").toLowerCase() === t)
      .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0] || null;

  const d = pickNewest("display");
  const h = pickNewest("host");
  const b = pickNewest("buzzer");

  const isOn = (row) => row?.last_seen_at && now - new Date(row.last_seen_at).getTime() < ONLINE_MS;

  badge(pillDisplay, isOn(d) ? "ok" : "bad", isOn(d) ? "OK" : "OFFLINE");
  badge(pillHost, isOn(h) ? "ok" : "bad", isOn(h) ? "OK" : "OFFLINE");
  badge(pillBuzzer, isOn(b) ? "ok" : "bad", isOn(b) ? "OK" : "OFFLINE");

  if (seenDisplay) seenDisplay.textContent = fmtSince(d?.last_seen_at);
  if (seenHost) seenHost.textContent = fmtSince(h?.last_seen_at);
  if (seenBuzzer) seenBuzzer.textContent = fmtSince(b?.last_seen_at);
}

function applyPresenceUnavailable() {
  badge(pillDisplay, "mid", "—");
  badge(pillHost, "mid", "—");
  badge(pillBuzzer, "mid", "—");
  if (seenDisplay) seenDisplay.textContent = "brak tabeli";
  if (seenHost) seenHost.textContent = "brak tabeli";
  if (seenBuzzer) seenBuzzer.textContent = "brak tabeli";
}

/* ===== realtime send (persistent) ===== */
function ensureChannels() {
  if (!chDisplay) chDisplay = sb().channel(`familiada-display:${game.id}`).subscribe();
  if (!chHost) chHost = sb().channel(`familiada-host:${game.id}`).subscribe();
  if (!chBuzzer) chBuzzer = sb().channel(`familiada-buzzer:${game.id}`).subscribe();
}

function chFor(target) {
  if (target === "display") return chDisplay;
  if (target === "host") return chHost;
  return chBuzzer;
}

function eventName(target) {
  if (target === "display") return "DISPLAY_CMD";
  if (target === "host") return "HOST_CMD";
  return "BUZZER_CMD";
}

async function sendCmd(target, line) {
  const t = String(target || "").toLowerCase();
  const l = String(line ?? "").trim();
  if (!l) return;

  ensureChannels();

  const ch = chFor(t);
  const { error } = await ch.send({
    type: "broadcast",
    event: eventName(t),
    payload: { line: l },
  });

  if (error) throw error;

  lastCmd[t] = l;
  saveLastCmdToStorage(t, l);
  refreshLastCmdUI();
  playSfx("ui_tick");
}

/* ===== control channel: BUZZER_EVT log ===== */
function ensureControlChannel() {
  if (ctlCh) return ctlCh;

  ctlCh = sb()
    .channel(`familiada-control:${game.id}`)
    .on("broadcast", { event: "BUZZER_EVT" }, (msg) => {
      const line = String(msg?.payload?.line ?? "").trim();
      if (!line) return;
      if (buzzEvtLast) buzzEvtLast.textContent = line;
      logBuzz(`BUZZER_EVT: ${line}`);
    })
    .subscribe();

  return ctlCh;
}

/* ===== links ===== */
function fillLinks() {
  const displayUrl = makeUrl("/familiada/display/index.html", game.id, game.share_key_display);
  const hostUrl = makeUrl("/familiada/host.html", game.id, game.share_key_host);
  const buzKey = game.share_key_buzzer;
  const buzzerUrl = makeUrl("/familiada/buzzer.html", game.id, buzKey || "");

  if (displayLink) displayLink.value = displayUrl;
  if (hostLink) hostLink.value = hostUrl;
  if (buzzerLink) buzzerLink.value = buzzerUrl;

  if (btnOpenDisplay) btnOpenDisplay.onclick = () => window.open(displayUrl, "_blank");
  if (btnOpenHost) btnOpenHost.onclick = () => window.open(hostUrl, "_blank");
  if (btnOpenBuzzer) btnOpenBuzzer.onclick = () => {
    if (!buzKey) return setMsg(msgDevices, "Brak share_key_buzzer w tej grze.");
    window.open(buzzerUrl, "_blank");
  };

  if (btnCopyDisplay) btnCopyDisplay.onclick = async () =>
    setMsg(msgDevices, (await copyToClipboard(displayUrl)) ? "Skopiowano link display." : "Nie mogę skopiować.");

  if (btnCopyHost) btnCopyHost.onclick = async () =>
    setMsg(msgDevices, (await copyToClipboard(hostUrl)) ? "Skopiowano link host." : "Nie mogę skopiować.");

  if (btnCopyBuzzer) btnCopyBuzzer.onclick = async () => {
    if (!buzKey) return setMsg(msgDevices, "Brak share_key_buzzer w tej grze.");
    setMsg(msgDevices, (await copyToClipboard(buzzerUrl)) ? "Skopiowano link buzzer." : "Nie mogę skopiować.");
  };
}

/* ===== resend ===== */
if (btnResendDisplay) btnResendDisplay.onclick = async () => {
  if (!lastCmd.display) return setMsg(msgCmd, "Brak last dla display.");
  await sendCmd("display", lastCmd.display);
  setMsg(msgCmd, `display <= ${lastCmd.display}`);
};

if (btnResendHost) btnResendHost.onclick = async () => {
  if (!lastCmd.host) return setMsg(msgCmd, "Brak last dla host.");
  await sendCmd("host", lastCmd.host);
  setMsg(msgCmd, `host <= ${lastCmd.host}`);
};

if (btnResendBuzzer) btnResendBuzzer.onclick = async () => {
  if (!lastCmd.buzzer) return setMsg(msgCmd, "Brak last dla buzzer.");
  await sendCmd("buzzer", lastCmd.buzzer);
  setMsg(msgCmd, `buzzer <= ${lastCmd.buzzer}`);
};

/* ===== manual send ===== */
if (btnManualSend) btnManualSend.onclick = async () => {
  try {
    await sendCmd(manualTarget?.value, manualLine?.value);
    setMsg(msgCmd, `${manualTarget?.value} <= ${manualLine?.value}`);
    if (manualLine) manualLine.value = "";
  } catch (err) {
    setMsg(msgCmd, `Błąd: ${err?.message || String(err)}`);
  }
};

/* ===== audio unlock ===== */
function refreshAudioStatus() {
  if (!audioStatus) return;
  const ok = !!isAudioUnlocked?.();
  audioStatus.textContent = ok ? "OK" : "ZABLOKOWANE";
  audioStatus.className = "badge " + (ok ? "ok" : "bad");
}

btnUnlockAudio?.addEventListener("click", () => {
  unlockAudio?.();
  playSfx("ui_tick");
  refreshAudioStatus();
});

/* ===== host: SET/CLEAR/ON/OFF ===== */
function escapeForQuotedCommand(raw) {
  return String(raw ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r\n", "\n");
}

btnHostSend?.addEventListener("click", async () => {
  const t = String(hostText?.value ?? "");
  const payload = escapeForQuotedCommand(t);
  await sendCmd("host", `SET "${payload}"`);
  setMsg(msgCmd, `host <= SET (${t.length} znaków)`);
});

btnHostOn?.addEventListener("click", async () => sendCmd("host", "ON"));
btnHostOff?.addEventListener("click", async () => sendCmd("host", "OFF"));
btnHostClear?.addEventListener("click", async () => sendCmd("host", "CLEAR"));

/* ===== buzzer: state buttons ===== */
btnBuzzOff?.addEventListener("click", async () => sendCmd("buzzer", "OFF"));
btnBuzzOn?.addEventListener("click", async () => sendCmd("buzzer", "ON"));
btnBuzzReset?.addEventListener("click", async () => sendCmd("buzzer", "RESET"));
btnBuzzPA?.addEventListener("click", async () => sendCmd("buzzer", "PUSHED A"));
btnBuzzPB?.addEventListener("click", async () => sendCmd("buzzer", "PUSHED B"));

/* ===== display: test pack ===== */
btnDispBlack?.addEventListener("click", async () => sendCmd("display", "MODE BLACK"));
btnDispQR?.addEventListener("click", async () => sendCmd("display", "MODE QR"));
btnDispGRA?.addEventListener("click", async () => sendCmd("display", "MODE GRA"));

btnDispLogo?.addEventListener("click", async () => sendCmd("display", "MODE LOGO"));
btnDispRounds?.addEventListener("click", async () => sendCmd("display", "MODE ROUNDS"));
btnDispFinal?.addEventListener("click", async () => sendCmd("display", "MODE FINAL"));
btnDispWin?.addEventListener("click", async () => sendCmd("display", "MODE WIN"));

btnDispDemoRounds?.addEventListener("click", async () =>
  sendCmd(
    "display",
    'RBATCH SUMA 120 R1 "PIERWSZA" 10 R2 "DRUGA" 25 R3 "TRZECIA" 05 R4 "" 00 R5 "PIATA" 30 R6 "SZOSTA" 15 ANIMOUT edge right 18 ANIMIN rain down 22'
  )
);

btnDispDemoFinal?.addEventListener("click", async () =>
  sendCmd(
    "display",
    'FBATCH SUMA 999 F1 "ALFA" 12 34 "BETA" F2 "GAMMA" 01 99 "DELTA" ANIMOUT matrix right 20 ANIMIN rain down 22'
  )
);

/* ===== SFX: mixer + clock + arm ===== */
let mixer = null;
let sfxTimer = null;
let sfxT0 = 0;
let armed = null; // {sec:number, name:string, fired:boolean}

function setClock() {
  if (!sfxClock) return;
  if (!sfxTimer) { sfxClock.textContent = "0.0s"; return; }

  const t = (performance.now() - sfxT0) / 1000;
  sfxClock.textContent = `${t.toFixed(1)}s`;

  if (armed && !armed.fired && t >= armed.sec) {
    armed.fired = true;
    mixer?.play?.(armed.name).catch?.(() => {});
  }
}

function sfxStopAll() {
  try { mixer?.stopAll?.(); } catch {}
  if (sfxTimer) clearInterval(sfxTimer);
  sfxTimer = null;
  sfxT0 = 0;
  armed = null;
  setClock();
}

function fillSfxList() {
  if (!sfxSelect) return;

  let names = [];
  try { names = listSfx?.() || []; } catch { names = []; }

  if (!Array.isArray(names) || names.length === 0) {
    sfxSelect.innerHTML = `<option value="">(brak dźwięków)</option>`;
    if (sfxAtName) sfxAtName.innerHTML = `<option value="">(brak dźwięków)</option>`;
    setMsg(msgCmd, "SFX: listSfx() zwróciło pustą listę — sprawdź export/registry w core/sfx.js");
    return;
  }

  sfxSelect.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join("");
  if (sfxAtName) sfxAtName.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join("");
}

btnSfxPlay?.addEventListener("click", async () => {
  const name = sfxSelect?.value;
  if (!name) return;

  mixer ??= createSfxMixer();
  await mixer.play(name);

  if (!sfxTimer) {
    sfxT0 = performance.now();
    sfxTimer = setInterval(setClock, 100);
  }
  setClock();
});

btnSfxStop?.addEventListener("click", () => sfxStopAll());

btnSfxAtArm?.addEventListener("click", () => {
  const sec = Number(sfxAtSec?.value ?? "");
  const nm = String(sfxAtName?.value ?? "");
  if (!Number.isFinite(sec) || sec < 0 || !nm) return;
  armed = { sec, name: nm, fired: false };
  setMsg(msgCmd, `SFX armed: at ${sec}s => ${nm}`);
});

btnSfxAtClear?.addEventListener("click", () => {
  armed = null;
  setMsg(msgCmd, "SFX armed: cleared");
});

/* ===== QUESTIONS: load + render ===== */
let questions = [];
let answersByQ = new Map();
let activeQid = null;

function renderQuestions() {
  if (!qList || !qPick) return;

  qList.innerHTML = questions
    .map((q) => {
      const active = q.id === activeQid ? ` style="border-color: rgba(255,234,166,.35)"` : "";
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
    const a = await loadAnswers(q.id);
    answersByQ.set(q.id, a);
  }
  activeQid ||= questions[0]?.id || null;
  renderQuestions();
  renderAnswers();
  setMsg(msgCmd, `Załadowano: ${questions.length} pytań.`);
}

qList?.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-qid]");
  if (!b) return;
  const id = b.dataset.qid;
  if (!id) return;
  activeQid = id;
  renderQuestions();
  renderAnswers();
});

qPick?.addEventListener("change", () => {
  activeQid = qPick.value || null;
  renderQuestions();
  renderAnswers();
});

btnQReload?.addEventListener("click", () => reloadQA().catch((e) => setMsg(msgCmd, e?.message || String(e))));

/* ===== buzzer log UI ===== */
btnBuzzLogClear?.addEventListener("click", () => {
  if (buzzLog) buzzLog.textContent = "";
  if (buzzEvtLast) buzzEvtLast.textContent = "—";
});

/* ===== topbar ===== */
btnBack?.addEventListener("click", () => (location.href = "/familiada/builder.html"));
btnLogout?.addEventListener("click", async () => {
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

  ensureChannels();        // trzy kanały na urządzenia
  ensureControlChannel();  // log BUZZER_EVT

  fillSfxList();
  refreshAudioStatus();
  setClock();

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
