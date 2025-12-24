// control/js/gameRounds.js
import { playSfx } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export function createRounds({ ui, store, devices, display, loadQuestions, loadAnswers }) {
  let allQuestions = [];
  const usedQ = new Set();

  // round-local
  let stealTeam = null; // "A"|"B" when steal is active
  let stealResolved = false; // after click/miss
  let timerRAF = null;

  function setStep(step) {
    store.state.rounds.step = step;
    ui.showRoundsStep(step);
  }

  function stopTimer3() {
    const r = store.state.rounds;
    r.timer3.running = false;
    r.timer3.endsAt = 0;
    if (timerRAF) cancelAnimationFrame(timerRAF);
    timerRAF = null;
  }

  function otherTeam(t) {
    return t === "A" ? "B" : "A";
  }

  function resetQuestionState() {
    const r = store.state.rounds;
    r.controlTeam = null;
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;

    r.question = null;
    r.answers = [];
    r.revealed = new Set();

    r.duel.enabled = false;
    r.duel.lastPressed = null;

    r.allowPass = false;
    r.passUsed = false;

    r.steal.active = false;
    r.steal.used = false;

    stopTimer3();
    stealTeam = null;
    stealResolved = false;
  }

  async function ensureQuestionsLoaded() {
    if (allQuestions.length > 0) return;
    allQuestions = await loadQuestions();
  }

  async function pickQuestion() {
    await ensureQuestionsLoaded();
    const pool = allQuestions.filter((q) => !usedQ.has(q.id));
    const pick = (pool.length ? pool : allQuestions)[Math.floor(Math.random() * Math.max(1, (pool.length ? pool : allQuestions).length))];
    usedQ.add(pick.id);
    return pick;
  }

  async function loadQuestionAndAnswers() {
    const r = store.state.rounds;
    const q = await pickQuestion();
    const ans = await loadAnswers(q.id);

    r.question = q;
    r.answers = (ans || [])
      .map((a) => ({
        id: a.id,
        ord: a.ord,
        text: a.text,
        fixed_points: nInt(a.fixed_points, 0),
      }))
      .sort((a, b) => (a.ord || 0) - (b.ord || 0));
  }

  // ------- UI render helpers -------
  function updateHud() {
    ui.setRoundsHud(store.state.rounds);
  }

  function renderAnswers() {
    const r = store.state.rounds;
    ui.renderRoundAnswers(r.answers, r.revealed, "roundAnswers");
    ui.renderRoundAnswers(r.answers, r.revealed, "roundStealAnswers");
  }

  function refresh() {
    updateHud();
    const r = store.state.rounds;
    ui.setRoundQuestion(r.question?.text || "—");
    renderAnswers();

    // enable buttons depending on step/state
    const step = r.step;

    // duel
    ui.setEnabled("btnBuzzEnable", step === "r_duel");
    ui.setEnabled("btnBuzzRetry", step === "r_duel" && r.duel.enabled === true);

    ui.setEnabled("btnBuzzAcceptA", step === "r_duel" && r.duel.enabled === true && r.duel.lastPressed != null);
    ui.setEnabled("btnBuzzAcceptB", step === "r_duel" && r.duel.enabled === true && r.duel.lastPressed != null);

    // play
    ui.setEnabled("btnStartTimer3", step === "r_play" && !!r.controlTeam && !r.timer3.running && !r.steal.active);
    ui.setEnabled("btnAddX", step === "r_play" && !!r.controlTeam && !r.steal.active);
    ui.setEnabled("btnPassQuestion", step === "r_play" && r.allowPass === true && r.passUsed === false && !!r.controlTeam && !r.steal.active);

    ui.setEnabled("btnGoSteal", step === "r_play" && r.steal.active === true);
    ui.setEnabled("btnGoEndRound", step === "r_play" && (r.steal.active === false) && canEndQuestion());

    // steal
    ui.setEnabled("btnGoEndRoundFromSteal", step === "r_steal" && stealResolved === true);

    // end
    ui.setEnabled("btnEndRound", step === "r_end");
  }

  function canEndQuestion() {
    const r = store.state.rounds;
    const allRevealed = r.answers.length > 0 && r.revealed.size >= r.answers.length;
    return allRevealed;
  }

  // ------- Steps / actions -------
  async function stateGameReady() {
    // game is ready: display state + lock setup changes
    const { teamA, teamB } = store.state.teams;
    await display.stateGameReady(teamA, teamB);

    store.state.locks.gameStarted = true; // blokuj zmiany ustawień po “gra gotowa”
    ui.setMsg("msgRounds", "Ustawiono stan: gra gotowa.");
    setStep("r_intro");
    refresh();
  }

  async function stateStartGameIntro() {
    const r = store.state.rounds;
  
    if (r.step !== "r_intro") {
      ui.setMsg("msgRounds", "Intro można włączyć tylko z ekranu „Start gry”.");
      return;
    }
  
    ui.setMsg("msgRounds", "Intro gry — poczekaj na zakończenie, potem pojawi się logo.");
    
    // flaga, żeby nie odpalać intro kilka razy
    if (r.introStarted) return;
    r.introStarted = true;
  
    // 1. pierwsze intro
    playSfx("show_intro");
  
    // 2. drugie intro po ~7s
    setTimeout(() => {
      playSfx("show_intro");
    }, 7000);
  
    // 3. po 14s od pierwszego:
    //    - pokazujemy logo z nazwami drużyn
    //    - przechodzimy do ekranu startu rundy
    setTimeout(async () => {
      await display.stateIntroLogo(store.state.teams.teamA, store.state.teams.teamB);
      setStep("r_roundStart");
      ui.setMsg("msgRounds", "Intro skończone — możesz rozpocząć rundę.");
      refresh();
    }, 14000);
  }


  async function startRound() {
    const r = store.state.rounds;
    resetQuestionState();

    // sound for round start
    playSfx("round_transition");

    // przygotuj pytanie i odpowiedzi
    await loadQuestionAndAnswers();

    // po dźwięku: wjedź planszą rundy
    // (tu nie mamy dokładnego czasu pliku; robimy prosty fallback: 900ms.
    // jeśli chcesz “na końcu pliku”, to podepniemy mixer w sfx.js – niżej w checklist.)
    setTimeout(async () => {
      try {
        await display.hideLogo();
        await display.roundsBoardPlaceholders(Math.max(1, Math.min(6, r.answers.length || 6)));

        await display.setBankTriplet(0);
        await display.setTotalsTriplets(r.totals);
        await display.setIndicator(null);

        // host dostaje pytanie
        // (jeśli masz osobny moduł hosta z komendami, podepniemy to tam – tu nie wysyłam HOST_CMD,
        // bo w createRounds nie masz chHost. Jeśli chcesz, dodamy.)
      } catch {}

      // pojedynek gotowy
      setStep("r_duel");
      ui.setMsg("msgRoundsDuel", "Aktywuj pojedynek.");
      refresh();
    }, 900);

    ui.setMsg("msgRoundsRoundStart", "Start rundy…");
    refresh();
  }

  function backTo(step) {
    // celowo proste cofanie tylko między “bezpiecznymi” krokami (bez niszczenia stanu)
    setStep(step);
    refresh();
  }

  function enableBuzzerDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;

    // tu w przyszłości: nasłuch na BUZZER_EVT żeby ustawić lastPressed.
    // na razie operator zatwierdza ręcznie, więc od razu pozwalamy “ponów” i czekamy na wybór.
    ui.setMsg("msgRoundsDuel", "Pojedynek aktywny. Zatwierdź drużynę.");
    refresh();
  }

  function retryDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;
    ui.setMsg("msgRoundsDuel", "Pojedynek ponowiony.");
    refresh();
  }

  function acceptBuzz(team) {
    const r = store.state.rounds;
    if (!r.duel.enabled) return;

    r.controlTeam = team;
    r.duel.enabled = false;

    display.setIndicator(team).catch(() => {});
    playSfx("buzzer_press");

    // wejście do gry
    setStep("r_play");
    ui.setMsg("msgRoundsPlay", `Kontrola: ${team}.`);
    refresh();
  }

  function passQuestion() {
    const r = store.state.rounds;
    if (!r.controlTeam) return;
    if (!r.allowPass || r.passUsed) return;

    const next = otherTeam(r.controlTeam);
    r.controlTeam = next;
    r.passUsed = true;

    display.setIndicator(next).catch(() => {});
    ui.setMsg("msgRoundsPlay", `Pytanie oddane. Kontrola: ${next}.`);
    refresh();
  }

  function startTimer3() {
    const r = store.state.rounds;
    if (!r.controlTeam || r.timer3.running) return;

    r.timer3.running = true;
    r.timer3.endsAt = Date.now() + 3000;
    ui.setText("t3", "3s");
    refresh();

    const tick = () => {
      if (!r.timer3.running) return;
      const left = Math.max(0, r.timer3.endsAt - Date.now());
      const s = Math.ceil(left / 1000);
      ui.setText("t3", `${s}s`);

      if (left <= 0) {
        stopTimer3();
        // timeout = błędna odpowiedź (ten sam dźwięk)
        addX(true);
        return;
      }
      timerRAF = requestAnimationFrame(tick);
    };
    timerRAF = requestAnimationFrame(tick);
  }

  async function revealAnswerByOrd(ord, opts = {}) {
    const r = store.state.rounds;
    if (!r.controlTeam) return;

    // w kradzieży: tylko jedno trafienie
    if (r.steal.active && stealResolved) return;

    stopTimer3();

    const a = r.answers.find((x) => Number(x.ord) === Number(ord));
    if (!a) return;

    // nie odsłaniaj ponownie
    if (r.revealed.has(a.ord)) return;

    r.revealed.add(a.ord);

    const pts = nInt(a.fixed_points, 0);
    r.bankPts += pts;

    // po pierwszej poprawnej: wolno oddać pytanie (jednorazowo)
    if (!r.allowPass && r.revealed.size === 1) {
      r.allowPass = true;
      r.passUsed = false;
    }

    // wyświetl
    await display.roundsRevealRow(a.ord, a.text, String(pts).padStart(2, "0").slice(-2));
    await display.roundsSetSuma(r.bankPts);
    await display.setBankTriplet(r.bankPts);

    playSfx("answer_correct");

    if (r.steal.active) {
      // kradzież trafiona => bank przechodzi do stealTeam
      store.state.rounds.stealWon = true;
      stealResolved = true;
      ui.setMsg("msgRoundsSteal", "Trafiona! Bank przejdzie do przeciwników.");
      ui.setEnabled("btnGoEndRoundFromSteal", true);
      refresh();
      return;
    }

    // jeśli wszystkie odpowiedzi odkryte -> można kończyć
    if (canEndQuestion()) {
      ui.setEnabled("btnGoEndRound", true);
      ui.setMsg("msgRoundsPlay", "Wszystkie odpowiedzi odsłonięte. Koniec rundy.");
    }

    refresh();
  }

  function addX(fromTimeout = false) {
    const r = store.state.rounds;
    if (!r.controlTeam) return;

    stopTimer3();

    if (r.controlTeam === "A") r.xA = Math.min(3, r.xA + 1);
    if (r.controlTeam === "B") r.xB = Math.min(3, r.xB + 1);

    playSfx("answer_wrong");

    const xNow = r.controlTeam === "A" ? r.xA : r.xB;

    // po 3 X => kradzież
    if (xNow >= 3) {
      r.steal.active = true;
      store.state.rounds.stealWon = false;
      stealTeam = otherTeam(r.controlTeam);
      stealResolved = false;

      // indicator na kradnących
      display.setIndicator(stealTeam).catch(() => {});

      ui.setMsg("msgRoundsPlay", "3 X. Szansa przeciwników.");
      ui.setEnabled("btnGoSteal", true);
      refresh();
    }
  }

  function goSteal() {
    const r = store.state.rounds;
    if (!r.steal.active) return;
    setStep("r_steal");
    ui.setMsg("msgRoundsSteal", "Wybierz jedną odpowiedź albo kliknij Nietrafiona.");
    refresh();
  }

  function stealMiss() {
    if (!store.state.rounds.steal.active) return;
    store.state.rounds.stealWon = true;
    stealResolved = true;
    playSfx("answer_wrong");
    ui.setMsg("msgRoundsSteal", "Nietrafiona. Bank zostaje u grających.");
    ui.setEnabled("btnGoEndRoundFromSteal", true);
    refresh();
  }

  function goEndRound() {
    setStep("r_end");
    ui.setMsg("msgRoundsEnd", "Gotowe do transferu banku.");
    refresh();
  }

  async function endRound() {
    const r = store.state.rounds;

    // kto dostaje bank?
    // - jeśli była kradzież i trafiona: stealTeam
    // - jeśli kradzież i nietrafiona: drużyna, która miała kontrolę przed kradzieżą
    // - jeśli bez kradzieży: aktualna controlTeam
    let winner = r.controlTeam;

    if (r.steal.active) {
      if (stealResolved) {
        // jeśli trafiona, to w revealAnswerByOrd ustawiamy stealResolved=true.
        // ale musimy rozróżnić trafiona vs nietrafiona:
        // - trafiona: bank “należy” kradnącym (stealTeam)
        // - nietrafiona: bank zostaje przy controlTeam
        // W praktyce: jeśli kradzież trafiona -> UI msg mówi “Trafiona!”
        // więc sprawdzamy: czy odsłonięto jakąś odpowiedź po wejściu w steal?
        // najprościej: jeśli stealResolved==true i msg zawiera “Trafiona” to… (brzydkie).
        // Zrobimy prościej: ustawiamy flagę:
      }
    }

    // lepiej: jawna flaga
    const stealWon = store.state.rounds.stealWon === true;
    if (r.steal.active && stealTeam) {
      winner = stealWon ? stealTeam : r.controlTeam;
    }

    // transfer banku -> konto (tu dźwięk bells)
    if (winner) {
      // bells może zagrać równolegle
      playSfx("bells");
      r.totals[winner] += r.bankPts;
    }

    // koniec rundy dźwięk round_transition
    playSfx("round_transition");

    // update display totals, reset bank
    await display.setTotalsTriplets(r.totals);
    r.bankPts = 0;
    await display.setBankTriplet(0);
    await display.roundsSetSuma(0);
    await display.setIndicator(null);

    // next round
    r.roundNo += 1;

    // reset stanu pytania (zachowaj totals + roundNo)
    const totalsKeep = structuredClone(r.totals);
    const roundNoKeep = r.roundNo;
    resetQuestionState();
    r.totals = totalsKeep;
    r.roundNo = roundNoKeep;

    ui.setMsg("msgRoundsEnd", "Runda zakończona.");
    setStep("r_roundStart");
    refresh();
  }

  // ------- public API -------
  function bootIfNeeded() {
    const r = store.state.rounds;
    if (!r.step) r.step = "r_ready";
    ui.showRoundsStep(r.step);
    refresh();
  }

  return {
    bootIfNeeded,

    stateGameReady,
    stateStartGameIntro,
    startRound,

    backTo,

    enableBuzzerDuel,
    retryDuel,
    acceptBuzz,

    passQuestion,
    startTimer3,

    revealAnswerByOrd,
    addX,

    goSteal,
    stealMiss,
    goEndRound,
    endRound,
  };
}
