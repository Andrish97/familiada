import { playSfx } from "../../js/core/sfx.js";

const $ = (id) => document.getElementById(id);

function setMsg(el, text) { if (el) el.textContent = text || ""; }

function badge(el, status, text) {
  if (!el) return;
  el.classList.remove("ok", "bad", "mid");
  if (status) el.classList.add(status);
  el.textContent = text;
}

function nInt(v, def = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : def;
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function escapeForQuotedCommand(raw) {
  return String(raw ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\r\n", "\n");
}

/* =========================================
   DISPLAY PLACEHOLDERS
   =========================================
   UWAGA: "…" musi być zgodne z Twoim fontem.
   Jeśli w Twoim foncie to inny znak, zmień PLACE.ELLIPSIS.
*/
const PLACE = {
  ELLIPSIS: "…",             // <- jeśli nie działa, podmień na znak z Twojego json
  ROUNDS_TEXT_LEN: 17,
  FINAL_TEXT_LEN: 11,

  roundsPts: "——",           // U+2014 x2 (masz w foncie)
  finalPts: "▒▒",            // (masz w foncie)
};

function repeatChar(ch, n) {
  let out = "";
  for (let i = 0; i < n; i++) out += ch;
  return out;
}

function roundsTextPlaceholder() {
  return repeatChar(PLACE.ELLIPSIS, PLACE.ROUNDS_TEXT_LEN);
}

function finalTextPlaceholder() {
  return repeatChar("—", PLACE.FINAL_TEXT_LEN);
}

/* =========================================
   FORMAT: punkty vs sekundy
   ========================================= */
function fmtTripletPoints(val) {
  const x = Math.max(0, nInt(val, 0));
  return String(x).slice(0, 3).padStart(3, "0");
}
function fmtTripletSeconds(val) {
  const x = Math.max(0, nInt(val, 0));
  return String(x);
}
function fmtBigPoints(val) {
  const x = Math.max(0, nInt(val, 0));
  return String(x);
}
function fmtRoundsSuma(val, { isStart = false } = {}) {
  const x = Math.max(0, nInt(val, 0));
  if (isStart) return "00";
  return String(x);
}

/* =========================================
   STATES
   ========================================= */
const STATES = {
  TOOLS_SETUP: "TOOLS_SETUP",
  TOOLS_LINKS: "TOOLS_LINKS",

  TEAM_NAMES: "TEAM_NAMES",
  GAME_READY: "GAME_READY",
  GAME_INTRO: "GAME_INTRO",

  ROUND_READY: "ROUND_READY",
  ROUND_TRANSITION_IN: "ROUND_TRANSITION_IN",
  ROUND_BUZZ: "ROUND_BUZZ",
  BUZZ_CONFIRM: "BUZZ_CONFIRM",
  ROUND_PLAY: "ROUND_PLAY",
  ROUND_STEAL: "ROUND_STEAL",
  ROUND_END: "ROUND_END",

  FINAL_PREP: "FINAL_PREP",
  FINAL_P1_INPUT: "FINAL_P1_INPUT",
  FINAL_P1_REVEAL: "FINAL_P1_REVEAL",
  FINAL_HIDE_FOR_P2: "FINAL_HIDE_FOR_P2",
  FINAL_P2_INPUT: "FINAL_P2_INPUT",
  FINAL_P2_REVEAL: "FINAL_P2_REVEAL",
  FINAL_WIN: "FINAL_WIN",
  FINAL_LOSE: "FINAL_LOSE",
};

const DEFAULT_ROUNDS = [
  { key: "R1", label: "Runda 1", ansCount: 6, mult: 1 },
  { key: "R2", label: "Runda 2", ansCount: 6, mult: 1 },
  { key: "R3", label: "Runda 3", ansCount: 6, mult: 1 },
];

function nowIso() { return new Date().toISOString(); }

function mkUndoEntry(snapshot) {
  return { t: nowIso(), snapshot };
}

export function createGameController({ game, devices, questions }) {
  const msgGame = $("msgGame");

  // state pill
  const pillState = $("pillState");
  const uiRound = $("uiRound");
  const uiQuestion = $("uiQuestion");
  const uiBuzz = $("uiBuzz");
  const uiPtsA = $("uiPtsA");
  const uiPtsB = $("uiPtsB");
  const uiRoundWin = $("uiRoundWin");
  const uiRoundAnsCount = $("uiRoundAnsCount");
  const uiXCount = $("uiXCount");
  const uiTopSum = $("uiTopSum");

  const pillRoundMode = $("pillRoundMode");
  const pillFinal = $("pillFinal");

  // teams
  const teamA = $("teamA");
  const teamB = $("teamB");
  const btnTeamsSave = $("btnTeamsSave");
  const btnResetGame = $("btnResetGame");

  // tools flow buttons
  const btnToToolsSetup = $("btnToToolsSetup");
  const btnToToolsLinks = $("btnToToolsLinks");

  // pregame
  const btnToTeamNames = $("btnToTeamNames");
  const btnToGameReady = $("btnToGameReady");
  const btnToGameIntro = $("btnToGameIntro");

  // round flow
  const btnToRoundReady = $("btnToRoundReady");
  const btnRoundStart = $("btnRoundStart");
  const pickRound = $("pickRound");
  const btnPickRoundApply = $("btnPickRoundApply");

  // question
  const btnSendQuestionToHost = $("btnSendQuestionToHost");
  const btnHostClear = $("btnHostClear");

  // buzzer
  const btnBuzzOn = $("btnBuzzOn");
  const btnBuzzOff = $("btnBuzzOff");
  const btnBuzzConfirm = $("btnBuzzConfirm");
  const btnBuzzRepeat = $("btnBuzzRepeat");

  // round play actions
  const roundAnswers = $("roundAnswers");
  const btnAddX = $("btnAddX");
  const btnUndoLast = $("btnUndoLast");
  const btnForceSteal = $("btnForceSteal");
  const btnEndRound = $("btnEndRound");
  const pickRoundWinner = $("pickRoundWinner");
  const stealInput = $("stealInput");
  const btnStealAccept = $("btnStealAccept");
  const btnStealFail = $("btnStealFail");

  // final controls
  const btnFinalPrep = $("btnFinalPrep");
  const btnFinalP1 = $("btnFinalP1");
  const btnFinalP1Stop = $("btnFinalP1Stop");
  const btnFinalP2 = $("btnFinalP2");
  const btnFinalP2Stop = $("btnFinalP2Stop");
  const btnFinalHide = $("btnFinalHide");
  const btnFinalRevealAll = $("btnFinalRevealAll");
  const btnFinalWin = $("btnFinalWin");
  const btnFinalLose = $("btnFinalLose");

  // storage
  const LS = {
    key: `familiada:control:gameState:${game.id}`,
  };

  // runtime
  let st = {
    state: STATES.TOOLS_SETUP,

    teams: { A: "", B: "" },

    // global scores
    scoreA: 0,
    scoreB: 0,

    // rounds
    rounds: DEFAULT_ROUNDS,
    roundIndex: 0,
    qidByRoundKey: {},

    // current round answers reveal state
    round: {
      qid: null,
      questionText: "",
      answers: [],       // from DB
      revealed: [],      // bool per answer
      xCount: 0,
      sum: 0,            // big+top triplet sum
      buzz: { on: false, last: "" },
      phase: "idle",     // idle|buzz|confirm|play|steal|end
      winner: "",        // A|B
      undo: [],
    },

    // final
    final: {
      enabled: true,
      winnerTeam: "A",       // who reached threshold / who is playing final
      timerSec: 0,
      timerRunning: false,
      timerOnSide: "A",      // A|B
      p1: { qids: [], answers: [], sum: 0 },
      p2: { answers: [], sum: 0 },
    },
  };

  let finalTimer = null;

  function save() {
    try { localStorage.setItem(LS.key, JSON.stringify(st)); } catch {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS.key);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return false;
      st = obj;
      return true;
    } catch {
      return false;
    }
  }

  function hardResetLocal() {
    try { localStorage.removeItem(LS.key); } catch {}
    st = JSON.parse(JSON.stringify({
      state: STATES.TOOLS_SETUP,
      teams: { A: "", B: "" },
      scoreA: 0,
      scoreB: 0,
      rounds: DEFAULT_ROUNDS,
      roundIndex: 0,
      qidByRoundKey: {},
      round: {
        qid: null,
        questionText: "",
        answers: [],
        revealed: [],
        xCount: 0,
        sum: 0,
        buzz: { on: false, last: "" },
        phase: "idle",
        winner: "",
        undo: [],
      },
      final: {
        enabled: true,
        winnerTeam: "A",
        timerSec: 0,
        timerRunning: false,
        timerOnSide: "A",
        p1: { qids: [], answers: [], sum: 0 },
        p2: { answers: [], sum: 0 },
      },
    }));
    stopFinalTimer();
    renderAll();
    // Nie wysyłam tu automatycznie nic na urządzenia – kliknij stan z UI (świadomie)
  }

  /* =========================================
     DEVICE DRIVERS
     ========================================= */

  async function disp(line) { await devices.sendCmd("display", line); }
  async function host(line) { await devices.sendCmd("host", line); }
  async function buz(line) { await devices.sendCmd("buzzer", line); }

  async function setTeamsToDisplay() {
    const a = escapeForQuotedCommand(st.teams.A || "");
    const b = escapeForQuotedCommand(st.teams.B || "");
    // Twoje założenie: longi przez całą grę w READY..END
    await disp(`LONG1 "${a}"`);
    await disp(`LONG2 "${b}"`);
  }

  async function setTripletsEmpty() {
    await disp(`TOP ""`);
    await disp(`LEFT ""`);
    await disp(`RIGHT ""`);
  }

  async function setTripletsPoints({ top, left, right }) {
    await disp(`TOP "${fmtTripletPoints(top)}"`);
    await disp(`LEFT "${fmtTripletPoints(left)}"`);
    await disp(`RIGHT "${fmtTripletPoints(right)}"`);
  }

  async function setSideTimer(team, sec) {
    const s = fmtTripletSeconds(sec);
    if (team === "A") await disp(`LEFT "${s}"`);
    else await disp(`RIGHT "${s}"`);
  }

  async function clearSide(team) {
    if (team === "A") await disp(`LEFT ""`);
    else await disp(`RIGHT ""`);
  }

  async function setTopSumPoints(sum) {
    await disp(`TOP "${fmtTripletPoints(sum)}"`);
  }

  async function showBlackOrQR(mode) {
    // 1) To zależy: może być BLACK albo QR
    if (mode === "QR") await disp("MODE QR");
    else await disp("MODE BLACK");
  }

  async function showQrLinks() {
    // zakładam, że display ma QR HOST/BUZZER komendę w Twoim routerze
    // Jeśli nie masz: usuń i po prostu MODE QR (a QR ustawia display we własnym kodzie).
    const hostUrl = new URL("/familiada/host.html", location.origin);
    hostUrl.searchParams.set("id", game.id);
    hostUrl.searchParams.set("key", game.share_key_host);

    const buzUrl = new URL("/familiada/buzzer.html", location.origin);
    buzUrl.searchParams.set("id", game.id);
    buzUrl.searchParams.set("key", game.share_key_buzzer || "");

    await disp(`QR HOST "${hostUrl.toString()}" BUZZER "${buzUrl.toString()}"`);
  }

  async function displayGameReady() {
    await disp("MODE GRA");
    await disp("MODE BLANK"); // pusty big
    await setTeamsToDisplay();
    await setTripletsEmpty(); // żadnych zer
    // buzzer OFF, host OFF
    await buz("OFF");
    await host("OFF");
  }

  async function displayIntroLogoIn() {
    // "Logo nie zadziałało" -> tu zawsze wymuszamy MODE GRA
    await disp("MODE GRA");
    await setTeamsToDisplay();
    // LOGO wjeżdża
    await disp("MODE LOGO");
    await disp("LOGO ANIMIN rain right 80");
  }

  async function displayHideRainLeft() {
    // "Jeśli ma zniknąć, najpierw HIDE z animacją"
    await disp("HIDE ANIMOUT rain left 80");
  }

  function currentRoundDef() {
    return st.rounds[clamp(st.roundIndex, 0, st.rounds.length - 1)] || st.rounds[0];
  }

  async function displayRoundTransitionIn() {
    const rd = currentRoundDef();
    const ansCount = clamp(nInt(rd.ansCount, 6), 1, 6);

    // logo znika ładnie
    await displayHideRainLeft();

    // przejście do ROUNDS i placeholdery tylko dla istniejących odpowiedzi
    await disp("MODE ROUNDS");
    await disp(`RSUMA ${fmtRoundsSuma(0, { isStart: true })}`);

    // triplets: 000, 000, 000 (punkty)
    await setTripletsPoints({ top: 0, left: 0, right: 0 });

    // placeholdery:
    // - dla tekstu: 17× “…” (wielokropek)
    // - dla punktów: "——"
    // - dla nieistniejących odpowiedzi: NIE WYSYŁAMY NIC (twoje: "nie wysyłaj '', wysyłaj nic")
    const phTxt = roundsTextPlaceholder();
    for (let i = 1; i <= ansCount; i++) {
      await disp(`RTXT ${i} "${escapeForQuotedCommand(phTxt)}"`);
      await disp(`RPTS ${i} ${PLACE.roundsPts}`);
    }

    // animacja wjazdu całej planszy: edge top
    // (jeśli masz tylko w batch/animIn: możesz to mieć w MODE ROUNDS animIn; tu zakładam, że komendy per pole rysują od razu,
    // a animację robisz przez to, co masz po stronie display. Jeśli masz komendę SHOW/ANIMIN dla big, użyj jej.)
    // Minimalnie: możesz dodać dodatkową komendę "ANIMIN edge top 20" jeśli router ją wspiera.
    // Jeśli NIE wspiera: usuń.
    try { await disp("ANIMIN edge top 20"); } catch {}
  }

  async function displayRoundRevealAnswer(idx, text, pts) {
    const i = idx + 1;
    await disp(`RTXT ${i} "${escapeForQuotedCommand(text)}"`);
    await disp(`RPTS ${i} ${fmtBigPoints(pts)}`);
  }

  async function displayRoundSuma(sum) {
    await disp(`RSUMA ${fmtRoundsSuma(sum)}`);
    await setTopSumPoints(sum);
  }

  async function displayFinalPrep() {
    await disp("MODE GRA");
    await setTeamsToDisplay();

    await disp("MODE FINAL");
    // placeholdery 5 zawsze
    for (let i = 1; i <= 5; i++) {
      await disp(`FL ${i} "${escapeForQuotedCommand(finalTextPlaceholder())}"`);
      await disp(`FA ${i} ${PLACE.finalPts}`);
      await disp(`FB ${i} ${PLACE.finalPts}`);
      await disp(`FR ${i} "${escapeForQuotedCommand(finalTextPlaceholder())}"`);
    }
    await disp(`FSUMA ${PLACE.finalPts}`); // suma zakryta
    await disp(`LONG2 "SUMA"`); // w trybie round/final zawsze jest słowo suma – jeśli u ciebie LONG2 ma inną rolę, usuń
    await setTopSumPoints(0); // top suma (punkty) – na początku 000
  }

  async function displayFinalHideForP2() {
    // wracamy do placeholderów bez blank; najpierw HIDE planszy, potem odtwórz placeholdery
    await displayHideRainLeft();
    await displayFinalPrep();
  }

  async function displayFinalWin(points) {
    // najpierw znika plansza, pojawia się wynik pieniędzy (ui_tick), a w trakcie gra dźwięk finału (dźwięk i tak nie tutaj)
    await displayHideRainLeft();
    await disp("MODE WIN");
    await disp(`WIN ${fmtBigPoints(points)} ANIMIN matrix right 20`);
  }

  /* =========================================
     HOST UI TEXTS
     ========================================= */
  async function hostShowText(text) {
    const payload = escapeForQuotedCommand(text);
    await host(`SET "${payload}"`);
  }

  function hostRoundQuestionText() {
    const rd = currentRoundDef();
    const q = questions.getActiveQuestion();
    const qText = q?.text || st.round.questionText || "";
    return `RUNDA: ${rd.label}\n\n${qText}`;
  }

  function hostBuzzPromptText(who) {
    return `BUZZER:\n\n${who}\n\nZatwierdź / Powtórz`;
  }

  function hostRoundPlayText() {
    return `GRYWKA:\n\nKlikaj odpowiedzi / X.\nX: ${st.round.xCount}/3\nSuma: ${st.round.sum}`;
  }

  function hostStealText() {
    return `STEAL:\n\nDruga drużyna odpowiada.\nWpisz odpowiedź i zatwierdź.\n(0 pkt możliwe)`;
  }

  /* =========================================
     BUZZER EVENTS (log już masz w devices)
   ========================================= */
  function parseBuzzEvt(line) {
    // spodziewamy się np: "CLICK A" / "CLICK B" albo "A" / "B" – zależnie od buzzer.js
    const s = String(line || "").toUpperCase();
    if (s.includes("A")) return "A";
    if (s.includes("B")) return "B";
    return "";
  }

  // Uwaga: nie mam tutaj bezpośredniego event hooka z devices,
  // bo devices loguje BUZZER_EVT w UI. Ty możesz chcieć, żeby gra reagowała.
  // Najprościej: w tym pierwszym wydaniu grę “reaktywnie” obsługujesz przyciskiem Zatwierdź/Powtórz.
  // Ale dodajemy też nasłuch, żeby automatycznie przejść do BUZZ_CONFIRM.
  function attachBuzzEvtAuto() {
    // łapiemy z DOM (devices.js ustawia buzzEvtLast), a my co 200ms sprawdzimy czy się zmienił
    const buzzEvtLastEl = $("buzzEvtLast");
    let lastSeen = "";
    setInterval(() => {
      const cur = String(buzzEvtLastEl?.textContent || "").trim();
      if (!cur || cur === "—" || cur === lastSeen) return;
      lastSeen = cur;

      const who = parseBuzzEvt(cur);
      st.round.buzz.last = cur;

      if (st.state === STATES.ROUND_BUZZ) {
        // automatycznie przechodzimy do BUZZ_CONFIRM i buzzer OFF
        transitionTo(STATES.BUZZ_CONFIRM, { auto: true, who });
      }
    }, 200);
  }

  /* =========================================
     ROUND MODEL
     ========================================= */
  async function loadRoundQAFromSelectedQuestion() {
    const q = questions.getActiveQuestion();
    if (!q?.id) throw new Error("Brak wybranego pytania.");
    const ans = await questions.getActiveAnswers();

    st.round.qid = q.id;
    st.round.questionText = q.text || "";
    st.round.answers = (ans || []).map((a) => ({
      id: a.id,
      ord: a.ord,
      text: a.text || "",
      fixed_points: Number.isFinite(Number(a.fixed_points)) ? Number(a.fixed_points) : 0,
    }));

    st.round.revealed = st.round.answers.map(() => false);
    st.round.xCount = 0;
    st.round.sum = 0;
    st.round.phase = "idle";
    st.round.winner = "";
    st.round.undo = [];
    save();
  }

  function pushUndo() {
    const snapshot = JSON.parse(JSON.stringify(st));
    st.round.undo.unshift(mkUndoEntry(snapshot));
    if (st.round.undo.length > 30) st.round.undo.length = 30;
    save();
  }

  function undoLast() {
    const u = st.round.undo?.shift?.();
    if (!u?.snapshot) return false;
    st = u.snapshot;
    stopFinalTimer();
    renderAll();
    // Po undo trzeba dosłać stan na DISPLAY/HOST/BUZZER:
    // robimy “re-apply” bez zmian fazy.
    applyStateToDevices().catch(() => {});
    save();
    return true;
  }

  function roundAnsCount() {
    const rd = currentRoundDef();
    return clamp(nInt(rd.ansCount, 6), 1, 6);
  }

  function currentRoundAnswersTrimmed() {
    // w rundzie liczy się ansCount, ale w DB może być więcej/mniej.
    const n = roundAnsCount();
    return (st.round.answers || []).slice(0, n);
  }

  function roundAllRevealed() {
    const n = roundAnsCount();
    for (let i = 0; i < n; i++) if (!st.round.revealed[i]) return false;
    return true;
  }

  function roundSumFromRevealed() {
    const ans = currentRoundAnswersTrimmed();
    let sum = 0;
    for (let i = 0; i < ans.length; i++) {
      if (st.round.revealed[i]) sum += Number(ans[i].fixed_points || 0);
    }
    return sum;
  }

  /* =========================================
     STATE MACHINE
     ========================================= */

  async function transitionTo(next, opts = {}) {
    const prev = st.state;
    st.state = next;

    // phases
    if (next === STATES.ROUND_READY) st.round.phase = "idle";
    if (next === STATES.ROUND_BUZZ) st.round.phase = "buzz";
    if (next === STATES.BUZZ_CONFIRM) st.round.phase = "confirm";
    if (next === STATES.ROUND_PLAY) st.round.phase = "play";
    if (next === STATES.ROUND_STEAL) st.round.phase = "steal";
    if (next === STATES.ROUND_END) st.round.phase = "end";

    if (next.startsWith("FINAL_")) {
      // nic
    }

    save();
    renderAll();

    try {
      await applyTransition(prev, next, opts);
    } catch (e) {
      setMsg(msgGame, e?.message || String(e));
      console.warn(e);
    }
  }

  async function applyTransition(prev, next, opts = {}) {
    // ważna zasada: urządzenia już umieją “snap” po refresh, ale Control też musi nadawać zgodnie ze stanem.

    if (next === STATES.TOOLS_SETUP) {
      await showBlackOrQR("BLACK");
      await buz("OFF");
      await host("OFF");
      return;
    }

    if (next === STATES.TOOLS_LINKS) {
      await showBlackOrQR("QR");
      try { await showQrLinks(); } catch {}
      await buz("OFF");
      await host("OFF");
      return;
    }

    if (next === STATES.TEAM_NAMES) {
      // display czarny, buzzer OFF
      await showBlackOrQR("BLACK");
      await buz("OFF");
      await host("OFF");
      return;
    }

    if (next === STATES.GAME_READY) {
      await displayGameReady();
      return;
    }

    if (next === STATES.GAME_INTRO) {
      await displayIntroLogoIn();
      return;
    }

    if (next === STATES.ROUND_READY) {
      // logo zostaje. buzzer OFF. host pytanie gotowe.
      await buz("OFF");
      await host("ON");
      await hostShowText(hostRoundQuestionText());
      return;
    }

    if (next === STATES.ROUND_TRANSITION_IN) {
      // start rundy:
      // - logo znika
      // - wjeżdża plansza rundy z placeholderami + suma 00 + triplet 000
      // - buzzer ON
      await displayRoundTransitionIn();
      await buz("ON");
      st.round.buzz.on = true;

      // ui_tick: tylko gdy wyświetlamy rbatch/round (tu plansza rundy)
      playSfx("ui_tick");
      return;
    }

    if (next === STATES.ROUND_BUZZ) {
      await buz("ON");
      st.round.buzz.on = true;
      await hostShowText(hostRoundQuestionText() + "\n\nBUZZER: czekam…");
      return;
    }

    if (next === STATES.BUZZ_CONFIRM) {
      await buz("OFF");
      st.round.buzz.on = false;
      const who = opts.who ? `Klik: ${opts.who}` : (st.round.buzz.last || "—");
      await hostShowText(hostBuzzPromptText(who));
      return;
    }

    if (next === STATES.ROUND_PLAY) {
      await buz("OFF");
      st.round.buzz.on = false;
      await hostShowText(hostRoundPlayText());
      // triplet top pokazuje sumę rundy
      await setTopSumPoints(st.round.sum);
      return;
    }

    if (next === STATES.ROUND_STEAL) {
      await buz("OFF");
      st.round.buzz.on = false;
      await hostShowText(hostStealText());
      return;
    }

    if (next === STATES.ROUND_END) {
      // na zakończenie rundy: dźwięk rundy (tu tylko SFX tick jako placeholder — docelowo round_transition)
      // punkty “przeskok”: UI_tick
      playSfx("ui_tick");

      // przerzucamy sumę rundy do zwycięzcy
      if (st.round.winner === "A") st.scoreA += st.round.sum;
      if (st.round.winner === "B") st.scoreB += st.round.sum;

      // triplets: lewy/prawy = punkty drużyn, top = 000 (lub możesz trzymać top jako sumę ogólną)
      await setTripletsPoints({ top: 0, left: st.scoreA, right: st.scoreB });

      // host info
      await hostShowText(`KONIEC RUNDA\n\nSuma rundy: ${st.round.sum}\nZwycięzca: ${st.round.winner || "—"}\n\nA: ${st.scoreA}\nB: ${st.scoreB}`);

      save();
      renderAll();
      return;
    }

    if (next === STATES.FINAL_PREP) {
      await displayFinalPrep();
      // timer na bocznym zwycięzców 15s w intro finalu wg twojego opisu – tu tylko przygotowanie
      return;
    }

    if (next === STATES.FINAL_P1_INPUT) {
      st.final.timerOnSide = st.final.winnerTeam || "A";
      await setTopSumPoints(0);
      await setSideTimer(st.final.timerOnSide, st.final.timerSec);
      await hostShowText("FINAŁ — GRACZ 1\n\nWpisuj odpowiedzi.\nCzas leci.");
      return;
    }

    if (next === STATES.FINAL_P2_INPUT) {
      st.final.timerOnSide = st.final.winnerTeam || "A";
      await setTopSumPoints(st.final.p1.sum || 0);
      await setSideTimer(st.final.timerOnSide, st.final.timerSec);
      await hostShowText("FINAŁ — GRACZ 2\n\nWidzisz odpowiedzi P1.\nCzas leci.");
      return;
    }

    if (next === STATES.FINAL_WIN) {
      await displayFinalWin(25000);
      return;
    }

    if (next === STATES.FINAL_LOSE) {
      const money = Math.max(0, (st.final.p2.sum || 0) * 3);
      await displayFinalWin(money);
      return;
    }
  }

  async function applyStateToDevices() {
    // używane po refresh Control: odtwarzamy ekran “zgodnie z logiką”
    const s = st.state;

    if (s === STATES.TOOLS_SETUP) return applyTransition(s, s);
    if (s === STATES.TOOLS_LINKS) return applyTransition(s, s);
    if (s === STATES.TEAM_NAMES) return applyTransition(s, s);

    if (s === STATES.GAME_READY) return displayGameReady();
    if (s === STATES.GAME_INTRO) return displayIntroLogoIn();

    if (s === STATES.ROUND_READY) {
      await displayIntroLogoIn(); // logo powinno być
      await setTripletsPoints({ top: 0, left: st.scoreA, right: st.scoreB }); // możesz chcieć 000/000/000 lub same punkty
      await hostShowText(hostRoundQuestionText());
      await buz("OFF");
      return;
    }

    if ([STATES.ROUND_TRANSITION_IN, STATES.ROUND_BUZZ, STATES.BUZZ_CONFIRM, STATES.ROUND_PLAY, STATES.ROUND_STEAL, STATES.ROUND_END].includes(s)) {
      // przywróć planszę rundy
      await disp("MODE GRA");
      await setTeamsToDisplay();
      await disp("MODE ROUNDS");

      // placeholdery (tylko do ansCount)
      const n = roundAnsCount();
      const phTxt = roundsTextPlaceholder();
      for (let i = 1; i <= n; i++) {
        if (!st.round.revealed[i - 1]) {
          await disp(`RTXT ${i} "${escapeForQuotedCommand(phTxt)}"`);
          await disp(`RPTS ${i} ${PLACE.roundsPts}`);
        } else {
          const a = currentRoundAnswersTrimmed()[i - 1];
          await displayRoundRevealAnswer(i - 1, a?.text || "", a?.fixed_points || 0);
        }
      }

      // suma
      await displayRoundSuma(st.round.sum || roundSumFromRevealed());

      // triplets: top suma rundy, boczne punkty drużyn
      await disp(`LEFT "${fmtTripletPoints(st.scoreA)}"`);
      await disp(`RIGHT "${fmtTripletPoints(st.scoreB)}"`);
      await disp(`TOP "${fmtTripletPoints(st.round.sum || 0)}"`);

      // buzzer
      await buz(st.round.buzz.on ? "ON" : "OFF");
      return;
    }

    if (s.startsWith("FINAL_")) {
      await displayFinalPrep();
      // timers
      if (st.final.timerRunning) {
        await setSideTimer(st.final.timerOnSide, st.final.timerSec);
      } else {
        await clearSide("A");
        await clearSide("B");
      }
      await setTopSumPoints(st.final.p2.sum || st.final.p1.sum || 0);
      return;
    }
  }

  /* =========================================
     ROUND UI RENDER
     ========================================= */
  function renderRoundAnswers() {
    if (!roundAnswers) return;

    const ans = currentRoundAnswersTrimmed();
    roundAnswers.innerHTML = ans.map((a, idx) => {
      const rev = !!st.round.revealed[idx];
      const pts = Number(a.fixed_points || 0);
      return `
        <div class="qItem">
          <div class="qTxt">${rev ? a.text : "<b>(ukryte)</b>"}</div>
          <div class="qPts">${rev ? String(pts) : "—"}</div>
          <div style="margin-left:auto; display:flex; gap:8px; align-items:center;">
            <button class="btn xs ${rev ? "" : "gold"}" data-act="reveal" data-i="${idx}">${rev ? "Odsłonięte" : "Odsłoń"}</button>
          </div>
        </div>
      `;
    }).join("");

    roundAnswers.querySelectorAll("[data-act='reveal']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const i = nInt(btn.getAttribute("data-i"), -1);
        if (i < 0) return;
        await revealAnswer(i);
      });
    });
  }

  function renderRoundPick() {
    if (!pickRound) return;
    pickRound.innerHTML = st.rounds.map((r, i) => `<option value="${i}">${r.label} (${r.ansCount} odp.)</option>`).join("");
    pickRound.value = String(clamp(st.roundIndex, 0, st.rounds.length - 1));
  }

  function renderAll() {
    badge(pillState, "mid", st.state);

    if (uiRound) uiRound.textContent = currentRoundDef()?.label || "—";
    if (uiQuestion) uiQuestion.textContent = st.round.questionText ? st.round.questionText.slice(0, 60) + (st.round.questionText.length > 60 ? "…" : "") : "—";
    if (uiBuzz) uiBuzz.textContent = st.round.buzz.on ? "ON" : "OFF";

    if (uiPtsA) uiPtsA.textContent = fmtTripletPoints(st.scoreA);
    if (uiPtsB) uiPtsB.textContent = fmtTripletPoints(st.scoreB);
    if (uiRoundWin) uiRoundWin.textContent = st.round.winner || "—";
    if (uiRoundAnsCount) uiRoundAnsCount.textContent = String(roundAnsCount());

    if (uiXCount) uiXCount.textContent = String(st.round.xCount || 0);
    if (uiTopSum) uiTopSum.textContent = fmtTripletPoints(st.round.sum || 0);

    badge(pillRoundMode, st.round.phase === "play" ? "ok" : "mid", st.round.phase || "—");
    badge(pillFinal, st.state.startsWith("FINAL_") ? "ok" : "mid", st.state.startsWith("FINAL_") ? st.state : "—");

    if (teamA) teamA.value = st.teams.A || "";
    if (teamB) teamB.value = st.teams.B || "";

    renderRoundPick();
    renderRoundAnswers();
  }

  /* =========================================
     ROUND ACTIONS
     ========================================= */
  async function ensureRoundLoaded() {
    if (!st.round.qid) {
      await loadRoundQAFromSelectedQuestion();
      renderAll();
    }
  }

  async function revealAnswer(idx) {
    await ensureRoundLoaded();
    const ans = currentRoundAnswersTrimmed();
    const a = ans[idx];
    if (!a) return;

    if (st.round.revealed[idx]) return;

    pushUndo();

    st.round.revealed[idx] = true;
    st.round.sum = roundSumFromRevealed();

    // display update
    await displayRoundRevealAnswer(idx, a.text || "", a.fixed_points || 0);
    await displayRoundSuma(st.round.sum);

    // host update
    await hostShowText(hostRoundPlayText());

    save();
    renderAll();

    // jeśli wszystkie odkryte -> możesz automatycznie kończyć rundę, ale zostawiam ręcznie
  }

  async function addX() {
    pushUndo();
    st.round.xCount = clamp((st.round.xCount || 0) + 1, 0, 3);
    save();
    renderAll();
    await hostShowText(hostRoundPlayText());

    if (st.round.xCount >= 3) {
      await transitionTo(STATES.ROUND_STEAL);
    }
  }

  async function forceSteal() {
    await transitionTo(STATES.ROUND_STEAL);
  }

  async function endRound() {
    const w = String(pickRoundWinner?.value || "").toUpperCase();
    st.round.winner = (w === "A" || w === "B") ? w : "";
    if (!st.round.winner) {
      setMsg(msgGame, "Wybierz zwycięzcę rundy (A/B) przed zakończeniem.");
      return;
    }
    await transitionTo(STATES.ROUND_END);
  }

  async function stealAccept(text) {
    // W twoich zasadach STEAL: zatwierdzamy odpowiedź (może dać punkty lub 0)
    // Tu robimy prostą wersję: jeśli tekst pasuje do którejś nieodsłoniętej odpowiedzi (case-insensitive, trim),
    // to odsłaniamy ją i liczymy sumę. Jeśli nie pasuje -> 0 pkt.
    await ensureRoundLoaded();
    pushUndo();

    const input = String(text || "").trim();
    if (!input) return;

    const ans = currentRoundAnswersTrimmed();
    const norm = (s) => String(s || "").trim().toUpperCase();

    let matchedIdx = -1;
    for (let i = 0; i < ans.length; i++) {
      if (st.round.revealed[i]) continue;
      if (norm(ans[i].text) === norm(input)) {
        matchedIdx = i;
        break;
      }
    }

    if (matchedIdx >= 0) {
      st.round.revealed[matchedIdx] = true;
      st.round.sum = roundSumFromRevealed();
      await displayRoundRevealAnswer(matchedIdx, ans[matchedIdx].text, ans[matchedIdx].fixed_points);
      await displayRoundSuma(st.round.sum);
      await hostShowText(`STEAL: POPRAWNA\n\n${ans[matchedIdx].text}\n+${ans[matchedIdx].fixed_points}\n\nSuma: ${st.round.sum}`);
    } else {
      await hostShowText(`STEAL: 0 pkt\n\nWpisano: ${input}`);
    }

    save();
    renderAll();
  }

  async function stealFail(text) {
    const input = String(text || "").trim();
    await hostShowText(`STEAL: 0 pkt\n\nWpisano: ${input || "(pusto)"}`);
  }

  /* =========================================
     FINAL TIMER
     ========================================= */
  function stopFinalTimer() {
    if (finalTimer) clearInterval(finalTimer);
    finalTimer = null;
    st.final.timerRunning = false;
    save();
  }

  async function tickFinalTimer() {
    if (!st.final.timerRunning) return;
    st.final.timerSec = Math.max(0, nInt(st.final.timerSec, 0) - 1);
    save();
    renderAll();
    await setSideTimer(st.final.timerOnSide, st.final.timerSec);

    if (st.final.timerSec <= 0) {
      stopFinalTimer();
      // automatyczny stop: przejście do reveal (ty i tak odsłaniasz)
    }
  }

  function startFinalTimer(sec, sideTeam) {
    stopFinalTimer();
    st.final.timerRunning = true;
    st.final.timerSec = Math.max(0, nInt(sec, 0));
    st.final.timerOnSide = sideTeam || st.final.winnerTeam || "A";
    save();
    renderAll();
    finalTimer = setInterval(() => tickFinalTimer().catch(() => {}), 1000);
  }

  /* =========================================
     HOOK UI
     ========================================= */

  function hookButtons() {
    btnTeamsSave?.addEventListener("click", async () => {
      st.teams.A = String(teamA?.value || "").trim().slice(0, 16);
      st.teams.B = String(teamB?.value || "").trim().slice(0, 16);
      save();
      renderAll();
      // longi mają działać “cały czas”, więc od razu wysyłamy na display (jeśli jest w GRA)
      try { await setTeamsToDisplay(); } catch {}
      setMsg(msgGame, "Zapisano nazwy drużyn.");
    });

    btnResetGame?.addEventListener("click", () => {
      hardResetLocal();
      setMsg(msgGame, "Zresetowano local state.");
    });

    // tools
    btnToToolsSetup?.addEventListener("click", () => transitionTo(STATES.TOOLS_SETUP));
    btnToToolsLinks?.addEventListener("click", () => transitionTo(STATES.TOOLS_LINKS));

    // pregame
    btnToTeamNames?.addEventListener("click", () => transitionTo(STATES.TEAM_NAMES));
    btnToGameReady?.addEventListener("click", () => transitionTo(STATES.GAME_READY));
    btnToGameIntro?.addEventListener("click", () => transitionTo(STATES.GAME_INTRO));

    // round flow
    btnToRoundReady?.addEventListener("click", async () => {
      await ensureRoundLoaded().catch(() => {});
      await transitionTo(STATES.ROUND_READY);
    });

    btnRoundStart?.addEventListener("click", async () => {
      await ensureRoundLoaded();
      await transitionTo(STATES.ROUND_TRANSITION_IN);
      // po wejściu: przechodzimy do ROUND_BUZZ
      await transitionTo(STATES.ROUND_BUZZ);
    });

    btnPickRoundApply?.addEventListener("click", async () => {
      st.roundIndex = clamp(nInt(pickRound?.value, 0), 0, st.rounds.length - 1);
      // zmiana rundy: reset rundy (bez psucia global score)
      st.round.qid = null;
      st.round.questionText = "";
      st.round.answers = [];
      st.round.revealed = [];
      st.round.xCount = 0;
      st.round.sum = 0;
      st.round.phase = "idle";
      st.round.winner = "";
      st.round.undo = [];
      save();
      renderAll();
      setMsg(msgGame, "Ustawiono rundę. Wybierz pytanie i wyślij na host.");
    });

    // question to host
    btnSendQuestionToHost?.addEventListener("click", async () => {
      const q = questions.getActiveQuestion();
      if (!q?.id) return setMsg(msgGame, "Wybierz pytanie.");
      await host("ON");
      await hostShowText(hostRoundQuestionText());
      // zapis QID dla rundy
      st.qidByRoundKey[currentRoundDef().key] = q.id;
      save();
      setMsg(msgGame, "Wysłano pytanie na HOST.");
    });

    btnHostClear?.addEventListener("click", async () => {
      await host("CLEAR");
    });

    // buzzer controls
    btnBuzzOn?.addEventListener("click", async () => {
      st.round.buzz.on = true;
      save(); renderAll();
      await transitionTo(STATES.ROUND_BUZZ);
    });

    btnBuzzOff?.addEventListener("click", async () => {
      st.round.buzz.on = false;
      save(); renderAll();
      await buz("OFF");
    });

    btnBuzzConfirm?.addEventListener("click", async () => {
      await transitionTo(STATES.ROUND_PLAY);
    });

    btnBuzzRepeat?.addEventListener("click", async () => {
      await transitionTo(STATES.ROUND_BUZZ);
    });

    // round play actions
    btnAddX?.addEventListener("click", () => addX().catch(console.error));
    btnUndoLast?.addEventListener("click", () => {
      if (!undoLast()) setMsg(msgGame, "Brak cofania.");
    });
    btnForceSteal?.addEventListener("click", () => forceSteal().catch(console.error));
    btnEndRound?.addEventListener("click", () => endRound().catch(console.error));

    btnStealAccept?.addEventListener("click", async () => {
      await stealAccept(stealInput?.value || "");
    });
    btnStealFail?.addEventListener("click", async () => {
      await stealFail(stealInput?.value || "");
    });

    // final
    btnFinalPrep?.addEventListener("click", async () => {
      // zwycięzca do finału: na razie wybierz kto ma więcej
      st.final.winnerTeam = (st.scoreA >= st.scoreB) ? "A" : "B";
      save(); renderAll();
      await transitionTo(STATES.FINAL_PREP);
    });

    btnFinalP1?.addEventListener("click", async () => {
      st.final.timerSec = 15;
      startFinalTimer(15, st.final.winnerTeam);
      await transitionTo(STATES.FINAL_P1_INPUT);
    });

    btnFinalP1Stop?.addEventListener("click", () => stopFinalTimer());

    btnFinalP2?.addEventListener("click", async () => {
      st.final.timerSec = 20;
      startFinalTimer(20, st.final.winnerTeam);
      await transitionTo(STATES.FINAL_P2_INPUT);
    });

    btnFinalP2Stop?.addEventListener("click", () => stopFinalTimer());

    btnFinalHide?.addEventListener("click", async () => {
      await transitionTo(STATES.FINAL_HIDE_FOR_P2);
    });

    btnFinalRevealAll?.addEventListener("click", async () => {
      // tu zostawiamy sterowanie ręczne (odsłanianie finału z logiką odpowiedzi w kolejnych iteracjach)
      setMsg(msgGame, "Reveal finału: do dopięcia (na razie ręcznie WIN/LOSE).");
    });

    btnFinalWin?.addEventListener("click", async () => transitionTo(STATES.FINAL_WIN));
    btnFinalLose?.addEventListener("click", async () => transitionTo(STATES.FINAL_LOSE));
  }

  /* =========================================
     START
     ========================================= */
  async function start() {
    // restore
    load();
    renderAll();

    // build round pick
    renderRoundPick();

    // auto buzz event integration
    attachBuzzEvtAuto();

    // hook UI
    hookButtons();

    // odtwórz ekran zgodnie ze stanem (po refresh)
    await applyStateToDevices().catch(() => {});

    // presence gating hint (opcjonalnie)
    // np. jeśli display offline – komunikat
    if (!devices.presence.displayOnline) {
      setMsg(msgGame, "Uwaga: DISPLAY offline — część stanów nie zadziała.");
    }
  }

  return {
    start,
    transitionTo,
    applyStateToDevices,
    get state() { return st; },
  };
}
