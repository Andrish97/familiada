// /familiada/control/js/gameRounds.js
import { playSfx, createSfxMixer } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export function createRounds({ ui, store, devices, display, loadQuestions, loadAnswers }) {
  let timerRAF = null;
  const introMixer = createSfxMixer?.();

  function getR() {
    return store.state.rounds;
  }

  function setStep(step) {
    const r = getR();
    r.step = step;
    store.setRoundsState({ step });
    ui.showRoundsStep(step);
  }

  function clearTimer3() {
    const r = getR();
    if (!r.timer3) r.timer3 = { running: false, endsAt: 0, secLeft: 3 };
    r.timer3.running = false;
    r.timer3.endsAt = 0;
    r.timer3.secLeft = 3;
    if (timerRAF) cancelAnimationFrame(timerRAF);
    timerRAF = null;
    ui.setRoundsHud(r);
  }

  function startTimer3Internal() {
    const r = getR();
    clearTimer3();

    r.timer3.running = true;
    r.timer3.endsAt = Date.now() + 3000;
    r.timer3.secLeft = 3;
    ui.setRoundsHud(r);

    const tick = () => {
      const rr = getR();
      if (!rr.timer3.running) return;

      const left = Math.max(0, rr.timer3.endsAt - Date.now());
      const s = Math.ceil(left / 1000);
      rr.timer3.secLeft = s;
      ui.setRoundsHud(rr);

      if (left <= 0) {
        rr.timer3.running = false;
        rr.timer3.secLeft = 0;
        ui.setRoundsHud(rr);
        playSfx("answer_wrong");
        return;
      }
      timerRAF = requestAnimationFrame(tick);
    };

    timerRAF = requestAnimationFrame(tick);
  }

  async function pickQuestionsForRounds(gameId) {
    const all = await loadQuestions(gameId);
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

  function ensureRoundsState() {
    const r = getR();
    if (!r._loadedRounds) r._loadedRounds = [];
    if (!r.totals) r.totals = { A: 0, B: 0 };
    if (!r.steal) r.steal = { active: false, used: false, wonBy: null };
    if (!r.timer3) r.timer3 = { running: false, endsAt: 0, secLeft: 3 };
  }

  async function loadRoundsIfNeeded() {
    ensureRoundsState();
    const r = getR();

    if (!r._loadedRounds || !r._loadedRounds.length) {
      const gid = store.state.gameId;
      if (!gid) throw new Error("Brak gameId w store.state.gameId.");
      const rounds = await pickQuestionsForRounds(gid);
      r._loadedRounds = rounds;
      r.roundNo = 1;
      store.setRoundsState({ _loadedRounds: rounds, roundNo: 1 });
    }
  }

  function currentRoundObj() {
    const r = getR();
    if (!r._loadedRounds || !r._loadedRounds.length) return null;
    return r._loadedRounds[r.roundNo - 1] || null;
  }

  function refresh() {
    const r = getR();
    ui.setRoundsHud(r);
    ui.showRoundsStep(r.step || "r_ready");
  }

  async function stateGameReady() {
    ensureRoundsState();
    const r = getR();
    const { teamA, teamB } = store.state.teams;

    store.completeCard("devices");
    store.completeCard("setup");
    store.setActiveCard("rounds");

    r.phase = "READY";
    r.step = "r_ready";
    r.roundNo = r.roundNo || 1;
    r.bankPts = 0;
    r.controlTeam = null;
    r.xA = 0;
    r.xB = 0;
    r.steal = { active: false, used: false, wonBy: null };
    r.allowPass = false;
    clearTimer3();

    await display.stateGameReady(teamA, teamB);

    ui.setRoundsHud(r);
    ui.showRoundsStep("r_intro");
    r.step = "r_intro";
    store.setRoundsState({ phase: "READY", step: "r_intro" });
    ui.setMsg("msgRounds", "Gra gotowa. Możesz rozpocząć intro.");
  }

  async function stateStartGameIntro() {
    const r = getR();
    const { teamA, teamB } = store.state.teams;

    r.phase = "INTRO";
    r.step = "r_intro";
    store.setRoundsState({ phase: "INTRO", step: "r_intro" });

    await display.stateIntroLogo(teamA, teamB);

    if (!introMixer) {
      await display.showLogo();
      ui.setMsg("msgRoundsIntro", "Intro bez dźwięku (brak miksera).");
      setStep("r_roundStart");
      return;
    }

    introMixer.stop();

    // uproszczony algorytm: 2 pętle, logo po ~14s lub po 70% długości
    await new Promise((resolve) => {
      let loop = 0;
      let logoShown = false;

      const off = introMixer.onTime((t, d) => {
        const dur = d || 20;
        const logoAt = Math.min(14, dur * 0.7);

        if (!logoShown && t >= logoAt) {
          logoShown = true;
          display.showLogo().catch(() => {});
        }

        if (d > 0 && t >= d - 0.05) {
          loop++;
          if (loop === 1) {
            introMixer.play("show_intro");
          } else {
            off();
            introMixer.stop();
            resolve();
          }
        }
      });

      introMixer.play("show_intro");
    });

    setStep("r_roundStart");
    ui.setMsg("msgRoundsIntro", "Intro zakończone. Możesz rozpocząć rundę.");
  }

  async function startRound() {
    await loadRoundsIfNeeded();
    ensureRoundsState();
    const r = getR();
    const obj = currentRoundObj();
    if (!obj) {
      ui.setMsg("msgRoundsRoundStart", "Brak zdefiniowanych rund.");
      return;
    }

    r.phase = "ROUND_ACTIVE";
    r.step = "r_duel";
    r.passUsed = false;
    r.steal = { active: false, used: false, wonBy: null };
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
    await display.roundsSetSum(0);
    await display.roundsSetX("A", 0);
    await display.roundsSetX("B", 0);
    await display.setIndicator(null);

    ui.showRoundsStep("r_duel");
    ui.setMsg("msgRoundsRoundStart", `Runda ${r.roundNo} przygotowana. Możesz odpalić pojedynek.`);
    ui.setRoundsHud(r);

    store.setRoundsState({
      phase: "ROUND_ACTIVE",
      step: "r_duel",
      bankPts: 0,
      xA: 0,
      xB: 0,
      controlTeam: null,
      steal: r.steal,
      allowPass: false,
      question: r.question,
      answers: r.answers,
      duel: r.duel,
    });
  }

  function backTo(step) {
    const r = getR();
    r.step = step;
    store.setRoundsState({ step });
    ui.showRoundsStep(step);
    ui.setRoundsHud(r);
  }

  function enableBuzzerDuel() {
    const r = getR();
    if (r.step !== "r_duel") {
      ui.setMsg("msgRoundsDuel", "Najpierw przejdź do kroku pojedynku.");
      return;
    }

    r.duel = r.duel || {};
    r.duel.enabled = true;
    r.duel.lastPressed = null;

    devices.sendBuzzerCmd("MODE DUEL").catch(() => {});
    ui.setMsg("msgRoundsDuel", "Pojedynek: czekam na przycisk.");
    ui.setRoundsHud(r);
  }

  function retryDuel() {
    const r = getR();
    r.duel = r.duel || {};
    r.duel.enabled = true;
    r.duel.lastPressed = null;
    devices.sendBuzzerCmd("MODE DUEL").catch(() => {});
    ui.setMsg("msgRoundsDuel", "Powtórka pojedynku.");
    ui.setRoundsHud(r);
  }

  function acceptBuzz(team) {
    const r = getR();
    if (!r.duel || !r.duel.enabled) {
      ui.setMsg("msgRoundsDuel", "Pojedynek nie jest aktywny.");
      return;
    }
    r.duel.enabled = false;
    r.controlTeam = team;
    store.setRoundsState({ controlTeam: team, duel: r.duel });

    ui.setMsg("msgRoundsDuel", `Pierwsza odpowiedź: drużyna ${team}.`);
    ui.setRoundsHud(r);

    setStep("r_play");
  }

  function passQuestion() {
    const r = getR();
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
    store.setRoundsState({ controlTeam: other, allowPass: false });

    ui.setMsg("msgRoundsPlay", `Pytanie oddane. Teraz odpowiada drużyna ${other}.`);
    ui.setRoundsHud(r);
  }

  function startTimer3() {
    startTimer3Internal();
  }

  async function revealAnswerByOrd(ord) {
    const r = getR();
    const ans = r.answers.find((a) => a.ord === ord);
    if (!ans) return;

    if (!r.revealed) r.revealed = new Set();
    if (r.revealed.has(ord)) return;

    r.revealed.add(ord);
    ui.renderRoundAnswers(r.answers, r.revealed);

    const pts = nInt(ans.fixed_points, 0);
    r.bankPts = nInt(r.bankPts, 0) + pts;
    store.setRoundsState({ bankPts: r.bankPts, revealed: Array.from(r.revealed) });

    ui.setRoundsHud(r);

    await display.roundsRevealRow(ord, ans.text, pts);
    await display.roundsSetSum(r.bankPts);

    if (!r.allowPass) r.allowPass = true;

    playSfx("answer_correct");
  }

  async function addX() {
    const r = getR();
    if (!r.controlTeam) {
      ui.setMsg("msgRoundsPlay", "Najpierw drużyna musi mieć kontrolę.");
      return;
    }

    const key = r.controlTeam === "A" ? "xA" : "xB";
    r[key] = (r[key] || 0) + 1;
    if (r[key] > 3) r[key] = 3;

    await display.roundsSetX(r.controlTeam, r[key]);
    store.setRoundsState({ xA: r.xA, xB: r.xB });

    ui.setRoundsHud(r);
    playSfx("answer_wrong");
  }

  function goSteal() {
    const r = getR();
    if (!r.controlTeam) {
      ui.setMsg("msgRoundsPlay", "Najpierw musi być drużyna z kontrolą.");
      return;
    }

    r.steal = {
      active: true,
      used: false,
      wonBy: null,
    };
    store.setRoundsState({ steal: r.steal });

    ui.setMsg("msgRoundsSteal", "Kradzież: druga drużyna odpowiada.");
    ui.setRoundsHud(r);

    const other = r.controlTeam === "A" ? "B" : "A";
    display.setIndicator(other);
    setStep("r_steal");
  }

  function stealMiss() {
    const r = getR();
    if (!r.steal || !r.steal.active || r.steal.used) return;

    r.steal.used = true;
    r.steal.active = false;
    r.steal.wonBy = null;
    store.setRoundsState({ steal: r.steal });

    ui.setMsg("msgRoundsSteal", "Kradzież nieudana. Bank zostaje u drużyny z kontrolą.");
    ui.setRoundsHud(r);

    display.setIndicator(null);

    const btn = document.getElementById("btnGoEndRoundFromSteal");
    if (btn) btn.disabled = false;
  }

  async function goEndRound() {
    const r = getR();
    const bank = nInt(r.bankPts, 0);

    if (!r.controlTeam) {
      ui.setMsg("msgRoundsPlay", "Brak drużyny z kontrolą – nie mogę przyznać banku.");
      return;
    }

    if (r.steal && r.steal.active && !r.steal.used) {
      ui.setMsg("msgRoundsPlay", "Najpierw rozstrzygnij kradzież.");
      return;
    }

    let winner = r.controlTeam;
    if (r.steal && r.steal.used && r.steal.wonBy) {
      winner = r.steal.wonBy;
    }

    r.totals[winner] = nInt(r.totals[winner], 0) + bank;
    await display.roundsSetTotals(r.totals);
    store.setRoundsState({ totals: r.totals });

    ui.setRoundsHud(r);
    ui.setMsg("msgRoundsEnd", `Koniec rundy. Bank ${bank} pkt dla drużyny ${winner}.`);

    display.setIndicator(null);
    setStep("r_end");
  }

  function endRound() {
    const r = getR();
    r.roundNo = nInt(r.roundNo, 1) + 1;
    if (r.roundNo > 6) r.roundNo = 6;

    r.question = null;
    r.answers = [];
    r.revealed = new Set();
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.controlTeam = null;
    r.steal = { active: false, used: false, wonBy: null };
    r.allowPass = false;

    clearTimer3();

    store.setRoundsState({
      roundNo: r.roundNo,
      question: null,
      answers: [],
      bankPts: 0,
      xA: 0,
      xB: 0,
      controlTeam: null,
      steal: r.steal,
      allowPass: false,
      phase: "READY",
      step: "r_ready",
    });

    ui.setRoundsHud(r);
    ui.showRoundsStep("r_ready");
    ui.setMsg("msgRounds", "Przejdź do kolejnej rundy.");
  }

  function bootIfNeeded() {
    ensureRoundsState();
    refresh();
  }

  store.subscribe(() => {
    ui.setRoundsHud(store.state.rounds);
  });

  return {
    bootIfNeeded,
    refresh,

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
