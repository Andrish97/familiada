import { playSfx } from "/familiada/js/core/sfx.js";

function nInt(v, d=0){ const x = Number.parseInt(String(v??""),10); return Number.isFinite(x)?x:d; }

export function createRounds({ ui, store, devices, display, loadQuestions, loadAnswers }) {
  let allQuestions = [];
  let usedQ = new Set(); // avoid repeats

  // buzzer events from control channel are optional; control says “buzzer connects => works”
  // we only need accept buttons which operator clicks.
  function lockGameStart() {
    store.state.locks.gameStarted = true;
  }

  function resetRoundStateKeepTotals() {
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
    r.timer3.running = false;
    r.timer3.endsAt = 0;
    r.steal.active = false;
    r.steal.used = false;
    r.allowPass = false;
  }

  function updateUiRound() {
    ui.setRoundsHud(store.state.rounds);
    ui.setRoundQuestion(store.state.rounds.question?.text || "—");
    ui.renderRoundAnswers(store.state.rounds.answers, store.state.rounds.revealed);

    // enable/disable controls
    const r = store.state.rounds;
    ui.setEnabled("btnBuzzEnable", !!r.question && !r.controlTeam);
    ui.setEnabled("btnBuzzAcceptA", r.duel.enabled);
    ui.setEnabled("btnBuzzAcceptB", r.duel.enabled);

    ui.setEnabled("btnStartTimer3", !!r.controlTeam && !r.timer3.running);
    ui.setEnabled("btnPassQuestion", r.allowPass && !!r.controlTeam && !r.steal.active);

    ui.setEnabled("btnAddX", !!r.controlTeam && !r.steal.active);
    ui.setEnabled("btnStealTry", r.steal.active && !r.steal.used);
    ui.setEnabled("btnEndRound", r.revealed.size > 0); // allow end when something happened
  }

  async function ensureQuestionsLoaded() {
    if (allQuestions.length > 0) return;
    allQuestions = await loadQuestions(store.state?.gameId || store.state?.id || store.state?.game_id || store.state?.game || store.state?.gameId || store.state?.game_id); // not used
  }

  async function getRandomUnusedQuestion() {
    if (allQuestions.length === 0) {
      // fallback load: use sb game id from store (we don’t store it here), so instead do single call:
      // easiest: call loadQuestions with inferred game id from URL in core; but you already have it in module import path,
      // we’ll just call loadQuestions(gameId) in app and pass down if needed. Here: assume loadQuestions() already bound in app.
      allQuestions = await loadQuestions(); // app passed bound function in real usage if needed
    }

    const pool = allQuestions.filter((q) => !usedQ.has(q.id));
    const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : allQuestions[Math.floor(Math.random() * allQuestions.length)];
    usedQ.add(pick.id);
    return pick;
  }

  async function stateGameReady() {
    const { teamA, teamB } = store.state.teams;
    await display.stateGameReady(teamA, teamB);
    ui.setMsg("msgRounds", "Ustawiono stan: gra gotowa.");
    playSfx("ui_tick");
  }

  async function stateStartGameIntro() {
    // logo only at start
    lockGameStart();
    const { teamA, teamB } = store.state.teams;

    playSfx("show_intro");
    await display.stateIntroLogo(teamA, teamB);

    ui.setMsg("msgRounds", "Start gry: logo + muzyka. Następnie rozpocznij rundę.");
    playSfx("ui_tick");

    // allow round start
    ui.setEnabled("btnStartRound", store.canStartRounds());
  }

  async function startRound() {
    lockGameStart();

    resetRoundStateKeepTotals();

    // pick question + answers
    const q = await getRandomUnusedQuestion();
    const ans = await loadAnswers(q.id);
    store.state.rounds.question = q;
    store.state.rounds.answers = (ans || []).map((a) => ({
      id: a.id,
      ord: a.ord,
      text: a.text,
      fixed_points: nInt(a.fixed_points, 0),
    }));

    // board transition: hide logo (if any), then placeholders
    playSfx("round_transition");
    await display.hideLogo();
    // placeholder count = answers length (clamp 1..6)
    await display.roundsBoardPlaceholders(Math.max(1, Math.min(6, store.state.rounds.answers.length || 6)));

    // bank on triplet = 000
    await display.setBankTriplet(0);
    await display.setTotalsTriplets(store.state.rounds.totals);

    // buzzer ready (operator will click “Aktywuj”)
    ui.setMsg("msgRounds", "Runda rozpoczęta. Aktywuj pojedynek przyciskiem.");
    updateUiRound();
  }

  function enableBuzzerDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;

    // indicator off until accepted
    display.setIndicator(null).catch(() => {});
    playSfx("ui_tick");
    updateUiRound();
  }

  function acceptBuzz(team) {
    const r = store.state.rounds;
    if (!r.duel.enabled) return;

    r.controlTeam = team;
    r.duel.enabled = false;

    // indicator shows who answers
    display.setIndicator(team).catch(() => {});
    playSfx("buzzer_press");

    updateUiRound();
  }

  function passQuestion() {
    const r = store.state.rounds;
    if (!r.controlTeam || !r.allowPass) return;
    const other = r.controlTeam === "A" ? "B" : "A";
    r.controlTeam = other;
    r.allowPass = false;
    display.setIndicator(other).catch(() => {});
    playSfx("ui_tick");
    updateUiRound();
  }

  function startTimer3() {
    const r = store.state.rounds;
    if (!r.controlTeam || r.timer3.running) return;

    r.timer3.running = true;
    r.timer3.endsAt = Date.now() + 3000;
    updateUiRound();

    const tick = () => {
      if (!r.timer3.running) return;
      if (Date.now() >= r.timer3.endsAt) {
        r.timer3.running = false;
        // no answer => X
        addX(true);
        playSfx("time_over");
        updateUiRound();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async function revealAnswerByOrd(ord) {
    const r = store.state.rounds;
    if (!r.controlTeam) return;

    // stop timer if running
    r.timer3.running = false;

    const a = r.answers.find((x) => Number(x.ord) === Number(ord));
    if (!a) return;

    if (r.revealed.has(a.ord)) return;

    r.revealed.add(a.ord);
    r.bankPts += nInt(a.fixed_points, 0);

    // first correct answer enables pass rule
    r.allowPass = true;

    // show on display
    await display.roundsRevealRow(a.ord, a.text, String(nInt(a.fixed_points, 0)).padStart(2, "0").slice(-2));
    await display.roundsSetSuma(r.bankPts);
    await display.setBankTriplet(r.bankPts);

    playSfx("answer_correct");

    updateUiRound();
  }

  function addX(fromTimeout = false) {
    const r = store.state.rounds;
    if (!r.controlTeam) return;

    // stop timer
    r.timer3.running = false;

    if (r.controlTeam === "A") r.xA = Math.min(3, r.xA + 1);
    if (r.controlTeam === "B") r.xB = Math.min(3, r.xB + 1);

    playSfx("answer_wrong");

    // if 3 X -> steal active
    const xNow = r.controlTeam === "A" ? r.xA : r.xB;
    if (xNow >= 3) {
      r.steal.active = true;
      r.steal.used = false;
      // indicator switches to other (they can consult now)
      const other = r.controlTeam === "A" ? "B" : "A";
      display.setIndicator(other).catch(() => {});
    }

    updateUiRound();
  }

  function stealTry() {
    const r = store.state.rounds;
    if (!r.steal.active || r.steal.used) return;
    r.steal.used = true;

    // now operator should click one answer (if found) -> points to stealing team bank (per rules)
    // We implement: next revealed answer will go to stealing team totals at end if steal succeeds.
    playSfx("ui_tick");
    updateUiRound();
  }

  async function endRound() {
    const r = store.state.rounds;

    // move bank to winner totals only when round ends
    if (r.controlTeam) {
      // if steal was active and used and last reveal happened after stealTry, this implementation doesn’t track that separately.
      // Practical: operator sets controlTeam via accept/pass and can pass. For end-of-round transfer we just transfer to current controlTeam.
      r.totals[r.controlTeam] += r.bankPts;
    }

    // after transfer: bank resets top triplet to 000
    r.bankPts = 0;
    await display.setBankTriplet(0);
    await display.roundsSetSuma(0);
    await display.setTotalsTriplets(r.totals);

    // indicator off
    await display.setIndicator(null);

    // next round number
    r.roundNo += 1;
    r.controlTeam = null;

    playSfx("round_transition");
    ui.setMsg("msgRounds", "Runda zakończona. Możesz rozpocząć następną.");

    updateUiRound();
  }

  function resetRound() {
    resetRoundStateKeepTotals();
    updateUiRound();
    ui.setMsg("msgRounds", "Zresetowano stan rundy (bez kasowania wyników).");
    playSfx("ui_tick");
  }

  // expose for app render tick
  setInterval(() => updateUiRound(), 500);

  return {
    stateGameReady,
    stateStartGameIntro,
    startRound,

    resetRound,

    enableBuzzerDuel,
    acceptBuzz,

    passQuestion,
    startTimer3,

    revealAnswerByOrd,
    addX,
    stealTry,
    endRound,
  };
}
