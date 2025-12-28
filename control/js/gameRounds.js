import { playSfx, createSfxMixer } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export function createRounds({ ui, store, devices, display, loadQuestions, loadAnswers, gameId }) {
  let timerRAF = null;
  const introMixer = createSfxMixer?.();

  function setStep(step) {
    const r = store.state.rounds;
    r.step = step;
    ui.showRoundsStep(step);
    ui.setRoundsHud(r);
  }

  function ensureRoundsState() {
    const r = store.state.rounds;
    if (!r._loadedRounds) r._loadedRounds = [];
    if (!r.totals) r.totals = { A: 0, B: 0 };
    if (!r.revealed || !(r.revealed instanceof Set)) r.revealed = new Set();
    if (!r.timer3) r.timer3 = { running: false, endsAt: 0, secLeft: 3 };
    if (!r.duel) r.duel = { enabled: false, lastPressed: null };
    if (!r.steal) r.steal = { active: false, used: false, stealWon: false };
  }

  function clearTimer3() {
    const r = store.state.rounds;
    if (!r.timer3) r.timer3 = { running: false, endsAt: 0, secLeft: 3 };
    r.timer3.running = false;
    r.timer3.endsAt = 0;
    r.timer3.secLeft = 3;
    if (timerRAF) cancelAnimationFrame(timerRAF);
    timerRAF = null;
    ui.setRoundsHud(r);
  }

  function startTimer3Internal() {
    const r = store.state.rounds;
    clearTimer3();

    r.timer3.running = true;
    r.timer3.endsAt = Date.now() + 3000;

    const tick = () => {
      if (!r.timer3.running) return;
      const left = Math.max(0, r.timer3.endsAt - Date.now());
      const s = Math.ceil(left / 1000);
      r.timer3.secLeft = s;
      ui.setRoundsHud(r);

      if (left <= 0) {
        r.timer3.running = false;
        r.timer3.secLeft = 0;
        ui.setRoundsHud(r);
        playSfx("answer_wrong"); // “czas minął”
        return;
      }
      timerRAF = requestAnimationFrame(tick);
    };

    timerRAF = requestAnimationFrame(tick);
  }

  async function pickQuestionsForRounds(gid) {
    const all = await loadQuestions(gid);
    const withAnswers = [];

    for (const q of all) {
      const ans = await loadAnswers(q.id);
      if (!ans || !ans.length) continue;
      withAnswers.push({ ...q, answers: ans });
    }

    const rounds = withAnswers
      .slice()
      .sort((a, b) => (a.ord || 0) - (b.ord || 0))
      .slice(0, 6)
      .map((q, idx) => ({
        id: q.id,
        ord: q.ord,
        text: q.text,
        answers: q.answers,
        roundNo: idx + 1,
      }));

    return rounds;
  }

  async function loadRoundsIfNeeded() {
    ensureRoundsState();
    const r = store.state.rounds;

    if (!r._loadedRounds || !r._loadedRounds.length) {
      const gid = gameId || store.state.id || "";
      if (!gid) throw new Error("Brak ID gry przy ładowaniu rund.");
      const rounds = await pickQuestionsForRounds(gid);
      r._loadedRounds = rounds;
      r.roundNo = 1;
    }
  }

  function currentRoundObj() {
    const r = store.state.rounds;
    if (!r._loadedRounds || !r._loadedRounds.length) return null;
    return r._loadedRounds[r.roundNo - 1] || null;
  }

  function emit() {
    try {
      for (const fn of store._roundsListeners || []) fn(store.state.rounds);
    } catch {
      // nic
    }
  }

  async function stateGameReady() {
    ensureRoundsState();
    const r = store.state.rounds;
    const { teamA, teamB } = store.state.teams;

    r.phase = "READY";
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.controlTeam = null;
    r.revealed = new Set();
    r.steal = { active: false, used: false, stealWon: false };
    r.duel = { enabled: false, lastPressed: null };
    clearTimer3();

    await display.stateGameReady({
      teamA: teamA || "Drużyna A",
      teamB: teamB || "Drużyna B",
      totalsA: nInt(r.totals.A, 0),
      totalsB: nInt(r.totals.B, 0),
    });

    setStep("r_intro");
    ui.setMsg("msgRounds", "Gra gotowa. Intro czeka na start.");
    emit();
  }

  async function stateStartGameIntro() {
    const { teamA, teamB } = store.state.teams;
    ensureRoundsState();

    store.state.rounds.phase = "INTRO";

    await display.stateIntroLogo(teamA, teamB);

    // prosto: jedno odpalenie muzyki, bez kombinowania z pętlami czasu
    try {
      if (introMixer) {
        introMixer.stop();
        introMixer.play("show_intro");
      } else {
        playSfx("show_intro");
      }
    } catch {
      playSfx("show_intro");
    }

    ui.setMsg("msgRoundsIntro", "Intro wystartowało. Gdy będzie po wszystkim, możesz zacząć rundę.");
    setStep("r_roundStart");
    emit();
  }

  async function startRound() {
    await loadRoundsIfNeeded();
    const r = store.state.rounds;
    const obj = currentRoundObj();
    if (!obj) {
      ui.setMsg("msgRoundsRoundStart", "Brak zdefiniowanych rund.");
      return;
    }

    r.phase = "ROUND_ACTIVE";
    r.passUsed = false;
    r.steal = { active: false, used: false, stealWon: false };
    r.allowPass = false;
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.controlTeam = null;
    r.revealed = new Set();
    r.question = { id: obj.id, ord: obj.ord, text: obj.text };
    r.answers = obj.answers.slice().sort((a, b) => (a.ord || 0) - (b.ord || 0));
    r.duel = { enabled: false, lastPressed: null };

    clearTimer3();

    ui.setRoundQuestion(obj.text || "—");
    ui.renderRoundAnswers(r.answers, r.revealed);

    await display.roundsBoardPlaceholders();
    await display.roundsSetSuma(0);
    await display.roundsSetX("A", 0);
    await display.roundsSetX("B", 0);
    await display.setIndicator("OFF");

    ui.showRoundsStep("r_duel");
    ui.setMsg("msgRounds", `Runda ${r.roundNo} przygotowana. Zacznij od pojedynku.`);
    ui.setRoundsHud(r);
    emit();
  }

  function backTo(step) {
    setStep(step);
    ui.setRoundsHud(store.state.rounds);
    emit();
  }

  function enableBuzzerDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;
    ui.setMsg("msgRoundsDuel", "Pojedynek: czekam na przycisk.");
    ui.setRoundsHud(r);

    // jeżeli kiedyś dodamy obsługę po stronie devices, niech to nie wysadza teraz:
    try {
      devices.enableBuzzerForDuel?.();
    } catch {
      // ignore
    }

    emit();
  }

  function retryDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;
    ui.setMsg("msgRoundsDuel", "Powtórka pojedynku.");
    ui.setRoundsHud(r);

    try {
      devices.enableBuzzerForDuel?.();
    } catch {
      // ignore
    }

    emit();
  }

  function acceptBuzz(team) {
    const r = store.state.rounds;
    if (!r.duel.enabled) return;
    r.duel.enabled = false;
    r.controlTeam = team;
    ui.setMsg("msgRoundsDuel", `Pierwsza odpowiedź: drużyna ${team}.`);
    ui.setRoundsHud(r);

    ui.showRoundsStep("r_play");
    emit();
  }

  function passQuestion() {
    const r = store.state.rounds;
    if (!r.allowPass) {
      ui.setMsg("msgRoundsPlay", "Nie możesz jeszcze oddać pytania (najpierw poprawna odpowiedź).");
      return;
    }
    if (!r.controlTeam) {
      ui.setMsg("msgRoundsPlay", "Brak drużyny z kontrolą.");
      return;
    }

    const other = r.controlTeam === "A" ? "B" : "A";
    r.controlTeam = other;
    r.allowPass = false;
    ui.setMsg("msgRoundsPlay", `Pytanie oddane. Teraz odpowiada drużyna ${other}.`);
    ui.setRoundsHud(r);
    emit();
  }

  function startTimer3() {
    startTimer3Internal();
  }

  async function revealAnswerByOrd(ord) {
    const r = store.state.rounds;
    const ans = r.answers.find((a) => a.ord === ord);
    if (!ans) return;

    if (!r.revealed || !(r.revealed instanceof Set)) r.revealed = new Set();
    if (r.revealed.has(ord)) return;

    r.revealed.add(ord);
    ui.renderRoundAnswers(r.answers, r.revealed);

    const pts = nInt(ans.fixed_points, 0);
    r.bankPts = nInt(r.bankPts, 0) + pts;
    ui.setRoundsHud(r);

    await display.roundsRevealRow(ord, ans.text, pts);
    await display.roundsSetSuma(r.bankPts);

    if (!r.allowPass) r.allowPass = true;

    ui.setEnabled?.("btnPassQuestion", true);
    ui.setEnabled?.("btnStartTimer3", true);
    ui.setEnabled?.("btnAddX", true);

    playSfx("answer_correct");
    emit();
  }

  async function addX() {
    const r = store.state.rounds;
    if (!r.controlTeam) {
      ui.setMsg("msgRoundsPlay", "Najpierw drużyna musi mieć kontrolę.");
      return;
    }

    const key = r.controlTeam === "A" ? "xA" : "xB";
    r[key] = (r[key] || 0) + 1;
    if (r[key] > 3) r[key] = 3;

    await display.roundsSetX(r.controlTeam, r[key]);
    ui.setRoundsHud(r);

    playSfx("answer_wrong");
    emit();
  }

  function goSteal() {
    const r = store.state.rounds;
    r.steal.active = true;
    r.steal.used = false;
    r.steal.stealWon = false;
    ui.setMsg("msgRoundsSteal", "Kradzież: druga drużyna odpowiada.");
    ui.setRoundsHud(r);

    const other = r.controlTeam === "A" ? "B" : "A";
    display.setIndicator(other === "A" ? "ON_A" : "ON_B");

    ui.showRoundsStep("r_steal");
    emit();
  }

  function stealMiss() {
    const r = store.state.rounds;
    if (!r.steal.active || r.steal.used) return;
    r.steal.used = true;
    r.steal.active = false;
    r.steal.stealWon = false;

    ui.setMsg("msgRoundsSteal", "Kradzież nieudana.");
    ui.setRoundsHud(r);

    display.setIndicator("OFF");
    ui.setEnabled?.("btnGoEndRoundFromSteal", true);
    emit();
  }

  async function goEndRound() {
    const r = store.state.rounds;

    const bank = nInt(r.bankPts, 0);
    if (!r.controlTeam) {
      ui.setMsg("msgRoundsEnd", "Brak drużyny z kontrolą – nie mogę przyznać banku.");
      return;
    }

    if (r.steal.active && !r.steal.used) {
      ui.setMsg("msgRoundsEnd", "Najpierw rozstrzygnij kradzież.");
      return;
    }

    const winner = r.controlTeam;

    r.totals[winner] = nInt(r.totals[winner], 0) + bank;

    await display.setTotalsTriplets({
      A: nInt(r.totals.A, 0),
      B: nInt(r.totals.B, 0),
    });
    await display.setBankTriplet(0);

    ui.setRoundsHud(r);
    ui.setMsg("msgRoundsEnd", `Koniec rundy. Bank ${bank} pkt dla drużyny ${winner}.`);

    setStep("r_end");
    emit();
  }

  function endRound() {
    const r = store.state.rounds;
    r.roundNo = nInt(r.roundNo, 1) + 1;
    if (r.roundNo > 6) r.roundNo = 6;

    r.question = null;
    r.answers = [];
    r.revealed = new Set();
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.controlTeam = null;
    r.steal = { active: false, used: false, stealWon: false };
    r.allowPass = false;

    clearTimer3();
    ui.setRoundsHud(r);

    setStep("r_ready");
    ui.setMsg("msgRounds", "Przejdź do kolejnej rundy.");
    emit();
  }

  function bootIfNeeded() {
    ensureRoundsState();
    ui.setRoundsHud(store.state.rounds);
    ui.showRoundsStep(store.state.rounds.step || "r_ready");
  }

  store._roundsListeners = store._roundsListeners || [];
  store._roundsListeners.push((r) => {
    ui.setRoundsHud(r);
  });

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
