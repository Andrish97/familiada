// /familiada/control/js/main.js
import { requireAuth, signOut } from "/familiada/js/core/auth.js";
import { sb } from "/familiada/js/core/supabase.js";
import { rt } from "/familiada/js/core/realtime.js";

import { fetchPresence, presenceSnapshot, fmtSince } from "./devices.js";
import { loadRuntime, saveRuntime, setStep } from "./runtime.js";
import { createDisplayDriver } from "./display.js";
import { canAdvance, pickFinalQuestionsUI } from "./game.js";

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const gameId = qs.get("id");

const who = $("who");
const btnBack = $("btnBack");
const btnLogout = $("btnLogout");

const gameLabel = $("gameLabel");
const gameMeta = $("gameMeta");

const msgDevices = $("msgDevices");
const msgGame = $("msgGame");

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

function setMsg(el, text) { if (el) el.textContent = text || ""; }

function badge(el, status, text) {
  if (!el) return;
  el.classList.remove("ok", "bad", "mid");
  if (status) el.classList.add(status);
  el.textContent = text;
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
    return true;
  } catch {
    return false;
  }
}

async function loadGameOrThrow() {
  if (!gameId) throw new Error("Brak ?id w URL.");

  const { data, error } = await sb()
    .from("games")
    .select("id,name,type,status,share_key_display,share_key_host,share_key_buzzer")
    .eq("id", gameId)
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Nie znaleziono gry.");
  return data;
}

/* ===== DOM: device cards ===== */
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

const btnQrDisplay = $("btnQrDisplay");
const btnQrHost = $("btnQrHost");
const btnQrBuzzer = $("btnQrBuzzer");

/* ===== QR modal ===== */
const qrModal = $("qrModal");
const btnQrClose = $("btnQrClose");
const qrTitle = $("qrTitle");
const qrHint = $("qrHint");
const qrUrl = $("qrUrl");

function openQr(title, hint, url) {
  if (!qrModal) return;
  if (qrTitle) qrTitle.textContent = title;
  if (qrHint) qrHint.textContent = hint;
  if (qrUrl) qrUrl.textContent = url;
  qrModal.style.display = "";
}
function closeQr() {
  if (!qrModal) return;
  qrModal.style.display = "none";
}
btnQrClose?.addEventListener("click", closeQr);
qrModal?.addEventListener("click", (e) => {
  if (e.target === qrModal) closeQr();
});

/* ===== Game wkładki DOM ===== */
const stepCardDisplay = document.querySelector('[data-step="TOOLS_DISPLAY"]');
const stepCardLinks = document.querySelector('[data-step="TOOLS_LINKS"]');
const stepCardFinal = document.querySelector('[data-step="FINAL_SETUP"]');
const stepCardTeams = document.querySelector('[data-step="TEAM_NAMES"]');
const stepCardReady = document.querySelector('[data-step="GAME_READY"]');
const stepCardStart = document.querySelector('[data-step="GAME_START"]');
const stepCardRound = document.querySelector('[data-step="ROUND_START"]');

const stepPill_DISPLAY = $("stepPill_DISPLAY");
const stepPill_LINKS = $("stepPill_LINKS");
const stepPill_FINAL = $("stepPill_FINAL");
const stepPill_TEAMS = $("stepPill_TEAMS");
const stepPill_READY = $("stepPill_READY");
const stepPill_START = $("stepPill_START");
const stepPill_ROUND = $("stepPill_ROUND");

const btnStepDisplayOk = $("btnStepDisplayOk");
const btnStepLinksOk = $("btnStepLinksOk");
const btnFinalSetupOk = $("btnFinalSetupOk");
const btnTeamsOk = $("btnTeamsOk");
const btnGameReady = $("btnGameReady");
const btnGameStart = $("btnGameStart");
const btnRoundStart = $("btnRoundStart");

const chkFinal = $("chkFinal");
const btnPickFinalQuestions = $("btnPickFinalQuestions");
const finalPickSummary = $("finalPickSummary");

const teamA = $("teamA");
const teamB = $("teamB");
const btnAdv = $("btnAdv");

/* ===== Local “last cmd” (tylko do podglądu na kartach urządzeń) ===== */
const LS_KEY = (kind) => `familiada:lastcmd:${gameId}:${kind}`;
const lastCmd = { display: null, host: null, buzzer: null };

function loadLastCmd() {
  lastCmd.display = localStorage.getItem(LS_KEY("display"));
  lastCmd.host = localStorage.getItem(LS_KEY("host"));
  lastCmd.buzzer = localStorage.getItem(LS_KEY("buzzer"));
}
function saveLastCmd(kind, line) {
  try { localStorage.setItem(LS_KEY(kind), String(line)); } catch {}
}
function refreshLastCmdUI() {
  if (lastCmdDisplay) lastCmdDisplay.textContent = lastCmd.display || "—";
  if (lastCmdHost) lastCmdHost.textContent = lastCmd.host || "—";
  if (lastCmdBuzzer) lastCmdBuzzer.textContent = lastCmd.buzzer || "—";
}

/* ===== RT send (managed) ===== */
function createDeviceSenders(gameId) {
  const chHost = rt(`familiada-host:${gameId}`);
  const chBuzzer = rt(`familiada-buzzer:${gameId}`);

  async function sendHost(line) {
    const l = String(line ?? "").trim();
    if (!l) return;
    await chHost.sendBroadcast("HOST_CMD", { line: l });
    lastCmd.host = l; saveLastCmd("host", l); refreshLastCmdUI();
  }

  async function sendBuzzer(line) {
    const l = String(line ?? "").trim();
    if (!l) return;
    await chBuzzer.sendBroadcast("BUZZER_CMD", { line: l });
    lastCmd.buzzer = l; saveLastCmd("buzzer", l); refreshLastCmdUI();
  }

  return { sendHost, sendBuzzer };
}

function updateStepLocks(runtime, ctx) {
  const order = ["TOOLS_DISPLAY","TOOLS_LINKS","FINAL_SETUP","TEAM_NAMES","GAME_READY","GAME_START","ROUND_START"];
  const idx = order.indexOf(runtime.step);

  const cards = [
    { key:"TOOLS_DISPLAY", el: stepCardDisplay, pill: stepPill_DISPLAY },
    { key:"TOOLS_LINKS", el: stepCardLinks, pill: stepPill_LINKS },
    { key:"FINAL_SETUP", el: stepCardFinal, pill: stepPill_FINAL },
    { key:"TEAM_NAMES", el: stepCardTeams, pill: stepPill_TEAMS },
    { key:"GAME_READY", el: stepCardReady, pill: stepPill_READY },
    { key:"GAME_START", el: stepCardStart, pill: stepPill_START },
    { key:"ROUND_START", el: stepCardRound, pill: stepPill_ROUND },
  ];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (!c.el) continue;

    // odblokowane: wszystko do aktualnego kroku włącznie
    const unlocked = i <= idx;
    c.el.classList.toggle("locked", !unlocked);

    const ok = canAdvance(c.key, ctx);
    if (c.pill) {
      badge(c.pill, ok ? "ok" : "mid", ok ? "OK" : "—");
    }
  }

  // UI finału
  if (chkFinal) chkFinal.checked = !!runtime.finalEnabled;
  if (btnPickFinalQuestions) btnPickFinalQuestions.disabled = !runtime.finalEnabled;

  if (finalPickSummary) {
    const on = runtime.finalEnabled;
    const picked = Array.isArray(runtime.finalQuestionIds) ? runtime.finalQuestionIds.length : 0;
    finalPickSummary.style.display = on ? "" : "none";
    finalPickSummary.innerHTML = on
      ? `<div>Wybrane pytania finału: <b>${picked}/5</b></div>`
      : "";
  }

  // wpisy teamów
  if (teamA && runtime.teamA != null) teamA.value = runtime.teamA;
  if (teamB && runtime.teamB != null) teamB.value = runtime.teamB;
}

async function main() {
  setMsg(msgDevices, "");
  setMsg(msgGame, "");

  const user = await requireAuth("/familiada/index.html");
  if (who) who.textContent = user?.email || user?.id || "—";

  const game = await loadGameOrThrow();
  if (gameLabel) gameLabel.textContent = `Control — ${game.name}`;
  if (gameMeta) gameMeta.textContent = `${game.type} / ${game.status} / ${game.id}`;

  loadLastCmd();
  refreshLastCmdUI();

  const display = createDisplayDriver(game.id);
  const dev = createDeviceSenders(game.id);

  // linki
  const displayUrl = makeUrl("/familiada/display/index.html", game.id, game.share_key_display);
  const hostUrl = makeUrl("/familiada/host.html", game.id, game.share_key_host);
  const buzKey = game.share_key_buzzer;
  const buzzerUrl = makeUrl("/familiada/buzzer.html", game.id, buzKey || "");

  if (displayLink) displayLink.value = displayUrl;
  if (hostLink) hostLink.value = hostUrl;
  if (buzzerLink) buzzerLink.value = buzzerUrl;

  btnOpenDisplay?.addEventListener("click", () => window.open(displayUrl, "_blank"));
  btnOpenHost?.addEventListener("click", () => window.open(hostUrl, "_blank"));
  btnOpenBuzzer?.addEventListener("click", () => {
    if (!buzKey) return setMsg(msgDevices, "Brak klucza dla przycisku w tej grze.");
    window.open(buzzerUrl, "_blank");
  });

  btnCopyDisplay?.addEventListener("click", async () => setMsg(msgDevices, (await copyToClipboard(displayUrl)) ? "Skopiowano link." : "Nie mogę skopiować."));
  btnCopyHost?.addEventListener("click", async () => setMsg(msgDevices, (await copyToClipboard(hostUrl)) ? "Skopiowano link." : "Nie mogę skopiować."));
  btnCopyBuzzer?.addEventListener("click", async () => {
    if (!buzKey) return setMsg(msgDevices, "Brak klucza dla przycisku w tej grze.");
    setMsg(msgDevices, (await copyToClipboard(buzzerUrl)) ? "Skopiowano link." : "Nie mogę skopiować.");
  });

  btnQrDisplay?.addEventListener("click", () => openQr("QR — Wyświetlacz", "To jest QR tylko w Control (okienko).", displayUrl));
  btnQrHost?.addEventListener("click", () => openQr("QR — Prowadzący", "To jest QR tylko w Control (okienko).", hostUrl));
  btnQrBuzzer?.addEventListener("click", () => {
    if (!buzKey) return setMsg(msgDevices, "Brak klucza dla przycisku w tej grze.");
    openQr("QR — Przycisk", "To jest QR tylko w Control (okienko).", buzzerUrl);
  });

  // runtime + render
  let runtime = loadRuntime(game.id);
  let presence = { display:{on:false,last:null}, host:{on:false,last:null}, buzzer:{on:false,last:null} };

  function persist(next) {
    runtime = next;
    saveRuntime(game.id, runtime);
    updateStepLocks(runtime, { runtime, presence });
  }

  // UI: finał checkbox + picker
  chkFinal?.addEventListener("change", () => {
    persist({ ...runtime, finalEnabled: !!chkFinal.checked, finalQuestionIds: chkFinal.checked ? runtime.finalQuestionIds : [] });
  });

  btnPickFinalQuestions?.addEventListener("click", async () => {
    try {
      const ids = await pickFinalQuestionsUI(game.id);
      persist({ ...runtime, finalQuestionIds: ids });
      setMsg(msgGame, `Wybrano pytania finału: ${ids.length}/5`);
    } catch (e) {
      setMsg(msgGame, e?.message || String(e));
    }
  });

  // UI: team names
  btnTeamsOk?.addEventListener("click", () => {
    const a = String(teamA?.value ?? "").trim();
    const b = String(teamB?.value ?? "").trim();
    persist({ ...runtime, teamA: a, teamB: b });
    setMsg(msgGame, "Zapisano nazwy drużyn.");
  });

  btnAdv?.addEventListener("click", () => {
    alert("Ustawienia zaawansowane: będzie osobne ukryte okienko (zrobimy w następnym kroku).");
  });

  // WKŁADKI: przejścia
  btnStepDisplayOk?.addEventListener("click", () => {
    if (!canAdvance("TOOLS_DISPLAY", { runtime, presence })) return;
    persist(setStep(runtime, "TOOLS_LINKS"));
  });

  btnStepLinksOk?.addEventListener("click", () => {
    if (!canAdvance("TOOLS_LINKS", { runtime, presence })) return;
    persist(setStep(runtime, "FINAL_SETUP"));
  });

  btnFinalSetupOk?.addEventListener("click", () => {
    if (!canAdvance("FINAL_SETUP", { runtime, presence })) {
      setMsg(msgGame, "Jeśli gramy finał: wybierz dokładnie 5 pytań.");
      return;
    }
    persist(setStep(runtime, "TEAM_NAMES"));
  });

  btnTeamsOk?.addEventListener("click", () => {
    const a = String(teamA?.value ?? "").trim();
    const b = String(teamB?.value ?? "").trim();
    persist({ ...runtime, teamA: a, teamB: b });
    if (!canAdvance("TEAM_NAMES", { runtime: { ...runtime, teamA:a, teamB:b }, presence })) return;
    persist(setStep({ ...runtime, teamA:a, teamB:b }, "GAME_READY"));
  });

  // GAME_READY: tylko nazwy drużyn, nic więcej
  btnGameReady?.addEventListener("click", async () => {
    try {
      await display.gameReady(runtime.teamA, runtime.teamB);
      setMsg(msgGame, "Ustawiono stan: gra gotowa.");
      persist(setStep(runtime, "GAME_START"));
    } catch (e) {
      setMsg(msgGame, e?.message || String(e));
    }
  });

  // GAME_START: logo + intro (audio ogarniamy później – teraz display)
  btnGameStart?.addEventListener("click", async () => {
    try {
      await display.setTeams(runtime.teamA, runtime.teamB);
      await display.showLogoIntro();
      setMsg(msgGame, "Start gry: logo wysłane.");
      persist(setStep(runtime, "ROUND_START"));
    } catch (e) {
      setMsg(msgGame, e?.message || String(e));
    }
  });

  // ROUND_START: start rundy -> plansza rundy + przycisk OPEN automatycznie
  btnRoundStart?.addEventListener("click", async () => {
    try {
      // tutaj na razie: answersCount=6 (podpniemy wybór pytania + ilość odpowiedzi z DB)
      await display.setTeams(runtime.teamA, runtime.teamB);
      await display.roundStartBoard({ answersCount: 6, scoreA: runtime.scoreA, scoreB: runtime.scoreB });

      // przycisk aktywny automatycznie po rozpoczęciu rundy
      await dev.sendBuzzer("OPEN");

      setMsg(msgGame, "Runda: plansza ustawiona, przycisk aktywny (OPEN).");
    } catch (e) {
      setMsg(msgGame, e?.message || String(e));
    }
  });

  // topbar
  btnBack?.addEventListener("click", () => (location.href = "/familiada/builder.html"));
  btnLogout?.addEventListener("click", async () => {
    await signOut().catch(() => {});
    location.href = "/familiada/index.html";
  });

  // presence loop
  async function tick() {
    const res = await fetchPresence(game.id);
    if (!res.ok) {
      badge(pillDisplay, "mid", "—");
      badge(pillHost, "mid", "—");
      badge(pillBuzzer, "mid", "—");
      if (seenDisplay) seenDisplay.textContent = "brak tabeli";
      if (seenHost) seenHost.textContent = "brak tabeli";
      if (seenBuzzer) seenBuzzer.textContent = "brak tabeli";
      setMsg(msgDevices, "Brak tabeli device_presence.");
      return;
    }

    presence = presenceSnapshot(res.rows);

    badge(pillDisplay, presence.display.on ? "ok" : "bad", presence.display.on ? "OK" : "OFFLINE");
    badge(pillHost, presence.host.on ? "ok" : "bad", presence.host.on ? "OK" : "OFFLINE");
    badge(pillBuzzer, presence.buzzer.on ? "ok" : "bad", presence.buzzer.on ? "OK" : "OFFLINE");

    if (seenDisplay) seenDisplay.textContent = fmtSince(presence.display.last);
    if (seenHost) seenHost.textContent = fmtSince(presence.host.last);
    if (seenBuzzer) seenBuzzer.textContent = fmtSince(presence.buzzer.last);

    // zapamiętaj snapshot (przydatne do debug i w przyszłości)
    runtime = { ...runtime, lastSeenPresence: {
      displayOnline: presence.display.on,
      hostOnline: presence.host.on,
      buzzerOnline: presence.buzzer.on,
    }};
    saveRuntime(game.id, runtime);

    setMsg(msgDevices, "");
    updateStepLocks(runtime, { runtime, presence });
  }

  // start render
  updateStepLocks(runtime, { runtime, presence });
  await tick();
  setInterval(tick, 1500);
}

main().catch((e) => {
  console.error(e);
  const msgDevices = document.getElementById("msgDevices");
  if (msgDevices) msgDevices.textContent = e?.message || String(e);
});
