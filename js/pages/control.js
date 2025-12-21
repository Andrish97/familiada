// /familiada/js/pages/control.js
import { sb } from "../core/supabase.js";
import { playSfx } from "../core/sfx.js";
import { requireAuth, signOut } from "../core/auth.js";

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

/* ===== TOPBAR ===== */
const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");

/* ===== META ===== */
const gameLabel = $("gameLabel");
const gameMeta = $("gameMeta");

/* ===== MESSAGES ===== */
const msgDevices = $("msgDevices");
const msgCmd = $("msgCmd");

/* ===== LINKS ===== */
const displayLink = $("displayLink");
const hostLink = $("hostLink");
const buzzerLink = $("buzzerLink");

const btnCopyDisplay = $("btnCopyDisplay");
const btnCopyHost = $("btnCopyHost");
const btnCopyBuzzer = $("btnCopyBuzzer");

const btnOpenDisplay = $("btnOpenDisplay");
const btnOpenHost = $("btnOpenHost");
const btnOpenBuzzer = $("btnOpenBuzzer");

const btnResendDisplay = $("btnResendDisplay");
const btnResendHost = $("btnResendHost");
const btnResendBuzzer = $("btnResendBuzzer");

/* ===== PRESENCE ===== */
const pillDisplay = $("pillDisplay");
const pillHost = $("pillHost");
const pillBuzzer = $("pillBuzzer");

const seenDisplay = $("seenDisplay");
const seenHost = $("seenHost");
const seenBuzzer = $("seenBuzzer");

const lastCmdDisplay = $("lastCmdDisplay");
const lastCmdHost = $("lastCmdHost");
const lastCmdBuzzer = $("lastCmdBuzzer");

/* ===== MANUAL ===== */
const manualTarget = $("manualTarget");
const manualLine = $("manualLine");
const btnManualSend = $("btnManualSend");

/* ===== NEW: HOST TEXT ===== */
const hostText = $("hostText");
const btnHostSet = $("btnHostSet");
const btnHostAppend = $("btnHostAppend");
const btnHostClear = $("btnHostClear");
const btnHostOn = $("btnHostOn");
const btnHostOff = $("btnHostOff");

/* ===== NEW: BUZZER STATE BUTTONS ===== */
const btnBuzzOn = $("btnBuzzOn");
const btnBuzzOff = $("btnBuzzOff");
const btnBuzzReset = $("btnBuzzReset");
const btnBuzzPA = $("btnBuzzPA");
const btnBuzzPB = $("btnBuzzPB");
const buzzEvtLast = $("buzzEvtLast");

/* ===== NEW: BUZZER EVT LOG ===== */
const buzzLog = $("buzzLog");
const btnBuzzLogClear = $("btnBuzzLogClear");

/* ===== NEW: SFX ===== */
const sfxPick = $("sfxPick");
const btnSfxPlay = $("btnSfxPlay");
const btnSfxStop = $("btnSfxStop");
const sfxTime = $("sfxTime");
const sfxDebug = $("sfxDebug");

/* ===== NEW: QUESTIONS ===== */
const qPick = $("qPick");
const btnQRefresh = $("btnQRefresh");
const qBox = $("qBox");
const msgQuestions = $("msgQuestions");

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
    try { playSfx("ui_tick"); } catch {}
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

function escQuoted(s) {
  // host regex łapie "([\s\S]*)" -> możemy wysłać prawdziwe newline w środku
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

/* ===== auth / game ===== */
async function ensureAuthOrRedirect() {
  const user = await requireAuth("/familiada/login.html");
  if (who) who.textContent = user?.email || user?.id || "—";
  return user;
}

async function loadGameOrThrow() {
  if (!gameId) throw new Error("Brak ?id w URL.");

  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_display,share_key_host,share_key_buzzer,share_key_control,share_key_poll")
    .eq("id", gameId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("Gra nie istnieje albo brak uprawnień.");
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

  const isOn = (row) => row?.last_seen_at && (now - new Date(row.last_seen_at).getTime() < ONLINE_MS);

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

/* ===== realtime channels (STAŁE) ===== */
const channels = new Map(); // key -> { ch, readyPromise }

function channelName(target) {
  if (target === "display") return `familiada-display:${game.id}`;
  if (target === "host") return `familiada-host:${game.id}`;
  if (target === "buzzer") return `familiada-buzzer:${game.id}`;
  // control channel:
  return `familiada-control:${game.id}`;
}

function eventName(target) {
  if (target === "display") return "DISPLAY_CMD";
  if (target === "host") return "HOST_CMD";
  if (target === "buzzer") return "BUZZER_CMD";
  return "BUZZER_EVT";
}

function ensureSendChannel(target) {
  const key = `send:${target}`;
  if (channels.has(key)) return channels.get(key);

  const ch = sb().channel(channelName(target));
  const readyPromise = new Promise((resolve) => {
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve(true);
    });
  });

  const obj = { ch, readyPromise };
  channels.set(key, obj);
  return obj;
}

async function sendCmd(target, line) {
  const t = String(target || "").toLowerCase();
  const l = String(line ?? "");
  const trimmed = l.trim();
  if (!trimmed) return;

  const { ch, readyPromise } = ensureSendChannel(t);
  await readyPromise;

  const { error } = await ch.send({
    type: "broadcast",
    event: eventName(t),
    payload: { line: trimmed },
  });

  if (error) throw error;

  lastCmd[t] = trimmed;
  saveLastCmdToStorage(t, trimmed);
  refreshLastCmdUI();

  try { playSfx("ui_tick"); } catch {}
}

/* ===== links ===== */
function fillLinks() {
  const displayUrl = makeUrl("/familiada/display/index.html", game.id, game.share_key_display);
  const hostUrl    = makeUrl("/familiada/host.html", game.id, game.share_key_host);

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

/* ===== host text actions ===== */
async function hostSendSet(text) {
  const line = `SET "${escQuoted(text)}"`;
  await sendCmd("host", line);
  setMsg(msgCmd, `host <= SET (${text.length} znaków)`);
}

async function hostSendAppend(text) {
  // APPEND: prosta konwencja — host w następnej wersji może to zrozumieć natywnie,
  // a na razie wysyłamy SET z doklejeniem jeśli host ma snapshot (control ogarnie później).
  // DZIŚ: wysyłamy komendę APPEND "..."
  const line = `APPEND "${escQuoted(text)}"`;
  await sendCmd("host", line);
  setMsg(msgCmd, `host <= APPEND (${text.length} znaków)`);
}

btnHostSet && (btnHostSet.onclick = async () => {
  try { await hostSendSet(hostText?.value ?? ""); } catch (e) { setMsg(msgCmd, `Błąd: ${e?.message || e}`); }
});

btnHostAppend && (btnHostAppend.onclick = async () => {
  try { await hostSendAppend(hostText?.value ?? ""); } catch (e) { setMsg(msgCmd, `Błąd: ${e?.message || e}`); }
});

btnHostClear && (btnHostClear.onclick = async () => {
  try { await sendCmd("host", "CLEAR"); setMsg(msgCmd, "host <= CLEAR"); } catch (e) { setMsg(msgCmd, `Błąd: ${e?.message || e}`); }
});

btnHostOn && (btnHostOn.onclick = async () => {
  try { await sendCmd("host", "ON"); setMsg(msgCmd, "host <= ON"); } catch (e) { setMsg(msgCmd, `Błąd: ${e?.message || e}`); }
});

btnHostOff && (btnHostOff.onclick = async () => {
  try { await sendCmd("host", "OFF"); setMsg(msgCmd, "host <= OFF"); } catch (e) { setMsg(msgCmd, `Błąd: ${e?.message || e}`); }
});

/* ===== buzzer state buttons ===== */
btnBuzzOn && (btnBuzzOn.onclick = async () => { try { await sendCmd("buzzer","ON"); setMsg(msgCmd,"buzzer <= ON"); } catch(e){ setMsg(msgCmd,`Błąd: ${e?.message||e}`);} });
btnBuzzOff && (btnBuzzOff.onclick = async () => { try { await sendCmd("buzzer","OFF"); setMsg(msgCmd,"buzzer <= OFF"); } catch(e){ setMsg(msgCmd,`Błąd: ${e?.message||e}`);} });
btnBuzzReset && (btnBuzzReset.onclick = async () => { try { await sendCmd("buzzer","RESET"); setMsg(msgCmd,"buzzer <= RESET"); } catch(e){ setMsg(msgCmd,`Błąd: ${e?.message||e}`);} });
btnBuzzPA && (btnBuzzPA.onclick = async () => { try { await sendCmd("buzzer","PUSHED_A"); setMsg(msgCmd,"buzzer <= PUSHED_A"); } catch(e){ setMsg(msgCmd,`Błąd: ${e?.message||e}`);} });
btnBuzzPB && (btnBuzzPB.onclick = async () => { try { await sendCmd("buzzer","PUSHED_B"); setMsg(msgCmd,"buzzer <= PUSHED_B"); } catch(e){ setMsg(msgCmd,`Błąd: ${e?.message||e}`);} });

/* ===== buzzer evt listener ===== */
let buzzEvtCh = null;
function addBuzzLog(line) {
  if (!buzzLog) return;
  const t = new Date().toLocaleTimeString();
  const div = document.createElement("div");
  div.className = "row";
  div.innerHTML = `<span class="t">${t}</span><span class="v">${escapeHtml(line)}</span>`;
  buzzLog.prepend(div);

  // limit
  while (buzzLog.children.length > 50) buzzLog.removeChild(buzzLog.lastChild);

  if (buzzEvtLast) buzzEvtLast.textContent = line;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function ensureBuzzEvtListener() {
  if (buzzEvtCh) return;

  buzzEvtCh = sb()
    .channel(channelName("control"))
    .on("broadcast", { event: "BUZZER_EVT" }, (msg) => {
      const line = String(msg?.payload?.line ?? "").trim();
      if (!line) return;
      addBuzzLog(line);
    })
    .subscribe();
}

btnBuzzLogClear && (btnBuzzLogClear.onclick = () => {
  if (!buzzLog) return;
  buzzLog.innerHTML = "";
  if (buzzEvtLast) buzzEvtLast.textContent = "—";
});

/* ===== SFX tester =====
   Uwaga: nie znam Twojej listy plików w sfx.js, więc to jest lista TESTOWA.
   Dopisz swoje nazwy (te, które playSfx rozumie).
*/
const SFX_LIST = [
  "ui_tick",
  "correct",
  "wrong",
  "reveal",
  "win",
  "lose",
];

let sfxTimer = null;
let sfxStartedAt = 0;
let sfxAudio = null;

function setSfxTime(v) {
  if (sfxTime) sfxTime.textContent = String(v ?? "0.0");
}

function stopSfxTimer() {
  try { clearInterval(sfxTimer); } catch {}
  sfxTimer = null;
}

function startSfxTimer() {
  stopSfxTimer();
  sfxStartedAt = performance.now();
  sfxTimer = setInterval(() => {
    let t = (performance.now() - sfxStartedAt) / 1000;

    // jeśli playSfx zwraca audio, pokaż prawdziwy czas
    if (sfxAudio && typeof sfxAudio.currentTime === "number") t = sfxAudio.currentTime;

    setSfxTime(t.toFixed(1));
  }, 100);
}

async function sfxPlay(name) {
  // stop poprzednie
  sfxStop();

  setMsg(sfxDebug, "");
  setSfxTime("0.0");
  startSfxTimer();

  let res = null;
  try {
    res = playSfx(name);
    // jeśli jest promise:
    if (res && typeof res.then === "function") res = await res;
  } catch (e) {
    stopSfxTimer();
    setMsg(sfxDebug, `playSfx error: ${e?.message || e}`);
    return;
  }

  // heurystyki: audio albo {audio}
  const audio = (res instanceof HTMLAudioElement) ? res : (res?.audio instanceof HTMLAudioElement ? res.audio : null);
  sfxAudio = audio;

  if (audio) {
    audio.addEventListener("ended", () => {
      stopSfxTimer();
      // zostaw czas końcowy
    }, { once: true });

    // duration info
    const dur = Number.isFinite(audio.duration) ? audio.duration.toFixed(1) : "—";
    setMsg(sfxDebug, `audio: ok, duration: ${dur}s`);
  } else {
    setMsg(sfxDebug, "playSfx: brak audio handle (timer leci z zegara).");
  }
}

function sfxStop() {
  stopSfxTimer();
  setSfxTime("0.0");
  try {
    if (sfxAudio) {
      sfxAudio.pause?.();
      sfxAudio.currentTime = 0;
    }
  } catch {}
  sfxAudio = null;
}

function fillSfxPick() {
  if (!sfxPick) return;
  sfxPick.innerHTML = "";
  for (const n of SFX_LIST) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    sfxPick.appendChild(opt);
  }
}

btnSfxPlay && (btnSfxPlay.onclick = async () => {
  const name = sfxPick?.value || SFX_LIST[0];
  await sfxPlay(name);
});

btnSfxStop && (btnSfxStop.onclick = () => sfxStop());

/* ===== QUESTIONS ===== */
async function fetchQuestionsAndAnswers() {
  // Zakładamy:
  // public.questions: id, game_id, ord, question_text (lub text)
  // public.answers: id, question_id, ord, answer_text (lub text), points (lub score)
  //
  // Jeśli masz inne pola, to i tak zadziała w trybie “best effort”,
  // ale jeśli kompletnie inne tabele — pokaże komunikat.
  const { data: qs, error: qErr } = await sb()
    .from("questions")
    .select("*")
    .eq("game_id", game.id)
    .order("ord", { ascending: true });

  if (qErr) throw qErr;

  const qList = qs || [];
  const qIds = qList.map(q => q.id).filter(Boolean);

  let aList = [];
  if (qIds.length) {
    const { data: as, error: aErr } = await sb()
      .from("answers")
      .select("*")
      .in("question_id", qIds)
      .order("ord", { ascending: true });
    if (aErr) throw aErr;
    aList = as || [];
  }

  // map answers by question_id
  const map = new Map();
  for (const a of aList) {
    const k = a.question_id;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(a);
  }

  return qList.map(q => ({ q, answers: map.get(q.id) || [] }));
}

function qText(q) {
  return q.question_text ?? q.text ?? q.question ?? q.title ?? "";
}
function aText(a) {
  return a.answer_text ?? a.text ?? a.answer ?? a.title ?? "";
}
function aPts(a) {
  const v = a.points ?? a.score ?? a.value ?? null;
  return (v === null || v === undefined) ? "—" : String(v);
}

function renderQuestion(item) {
  if (!qBox) return;
  qBox.innerHTML = "";

  if (!item) {
    qBox.innerHTML = `<div class="hint">Brak danych.</div>`;
    return;
  }

  const title = document.createElement("div");
  title.className = "qTitle";
  title.textContent = qText(item.q) || "(puste pytanie)";
  qBox.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "qAns";

  for (const a of item.answers) {
    const el = document.createElement("div");
    el.className = "qItem";
    el.innerHTML = `<div class="qTxt">${escapeHtml(aText(a) || "(puste)")}</div><div class="qPts"><b>${escapeHtml(aPts(a))}</b> pkt</div>`;
    grid.appendChild(el);
  }

  if (!item.answers.length) {
    const el = document.createElement("div");
    el.className = "hint";
    el.textContent = "Brak odpowiedzi dla tego pytania (albo inna tabela).";
    qBox.appendChild(el);
  } else {
    qBox.appendChild(grid);
  }
}

let qData = [];
function fillQuestionPick() {
  if (!qPick) return;
  qPick.innerHTML = "";
  for (let i = 0; i < qData.length; i++) {
    const { q } = qData[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    const label = qText(q) || "(puste pytanie)";
    const ord = q.ord ?? q.order ?? "";
    opt.textContent = ord !== "" ? `${ord}. ${label}` : label;
    qPick.appendChild(opt);
  }
}

async function refreshQuestions() {
  setMsg(msgQuestions, "");
  try {
    qData = await fetchQuestionsAndAnswers();
    if (!qData.length) {
      fillQuestionPick();
      renderQuestion(null);
      setMsg(msgQuestions, "Brak pytań dla tej gry.");
      return;
    }
    fillQuestionPick();
    renderQuestion(qData[0]);
  } catch (e) {
    qData = [];
    fillQuestionPick();
    renderQuestion(null);
    setMsg(msgQuestions, `Nie mogę pobrać pytań: ${e?.message || String(e)} (sprawdź czy masz tabele questions/answers).`);
  }
}

qPick && qPick.addEventListener("change", () => {
  const idx = Number(qPick.value);
  renderQuestion(Number.isFinite(idx) ? qData[idx] : null);
});

btnQRefresh && (btnQRefresh.onclick = () => refreshQuestions());

/* ===== topbar ===== */
btnBack && (btnBack.onclick = () => (location.href = "/familiada/builder.html"));
btnLogout && (btnLogout.onclick = async () => {
  await signOut().catch(() => {});
  location.href = "/familiada/login.html";
});

/* ===== boot ===== */
async function main() {
  setMsg(msgDevices, "");
  setMsg(msgCmd, "");

  await ensureAuthOrRedirect();

  game = await loadGameOrThrow();
  if (gameLabel) gameLabel.textContent = `Control — ${game.name}`;
  if (gameMeta) gameMeta.textContent = `${game.type} / ${game.status}`;

  loadLastCmdFromStorage();
  refreshLastCmdUI();
  fillLinks();

  // start control listener (BUZZER_EVT)
  ensureBuzzEvtListener();

  // fill sfx
  fillSfxPick();

  // presence loop
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

  // questions (best effort)
  await refreshQuestions();
}

main().catch((e) => setMsg(msgDevices, e?.message || String(e)));
