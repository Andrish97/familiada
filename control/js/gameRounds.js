import { playSfx, createSfxMixer, getSfxDuration } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export function createRounds({ ui, store, devices, display, loadQuestions, loadAnswers }) {
  let timerRAF = null;
  const introMixer = createSfxMixer?.();

  function getRoundMultiplier(roundNo) {
    const n = nInt(roundNo, 1);
    if (n <= 3) return 1;
    if (n === 4) return 2;
    return 3;
  }

  function emit() {
    try {
      for (const fn of (store._roundsListeners || [])) fn(store.state.rounds);
    } catch {}
  }

  function setStep(step) {
    const r = store.state.rounds;
    r.step = step;
    ui.showRoundsStep(step);

    const canStartRoundNow =
      typeof store.canStartRounds === "function"
        ? store.canStartRounds() && r.step === "r_roundStart"
        : r.step === "r_roundStart";

    ui.setEnabled("btnStartRound", canStartRoundNow);
  }

  function clearTimer3() {
    const r = store.state.rounds;
    r.timer3.running = false;
    r.timer3.endsAt = 0;
    r.timer3.secLeft = 0;
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

        // timeout = pudło + brak możliwości oddania pytania
        r.allowPass = false;
        addX(); // async; ignorujemy promisa

        return;
      }
      timerRAF = requestAnimationFrame(tick);
    };

    timerRAF = requestAnimationFrame(tick);
  }

  // === PULA PYTAŃ / LOSOWANIE RUND ===

  async function pickQuestionsForRounds(gameId) {
    const all = await loadQuestions(gameId);
    const withAnswers = [];

    for (const q of all) {
      const ans = await loadAnswers(q.id);
      if (!ans || !ans.length) continue;
      withAnswers.push({ ...q, answers: ans });
    }

    const finalPicked = Array.isArray(store.state.final?.picked)
      ? new Set(store.state.final.picked)
      : null;

    let pool = withAnswers;
    if (finalPicked && finalPicked.size > 0) {
      pool = withAnswers.filter((q) => !finalPicked.has(q.id));
    }

    // shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool;
  }

  function ensureRoundsState() {
    const r = store.state.rounds;
    if (!r._questionPool) r._questionPool = [];
    if (!r._usedQuestionIds) r._usedQuestionIds = [];
    if (!r.totals) r.totals = { A: 0, B: 0 };
    if (!r.revealed) r.revealed = new Set();
  }

  async function loadRoundsIfNeeded() {
    ensureRoundsState();
    const r = store.state.rounds;

    if (!r._questionPool || !r._questionPool.length) {
      const rounds = await pickQuestionsForRounds(store.state.gameId || store.state.id || "");
      r._questionPool = rounds || [];
      r._usedQuestionIds = [];
      r.roundNo = 1;
      emit();
    }
  }

  function pickNextQuestionObj() {
    const r = store.state.rounds;
    ensureRoundsState();

    if (!r._questionPool || !r._questionPool.length) return null;

    const obj = r._questionPool.shift();
    if (obj && obj.id) {
      r._usedQuestionIds.push(obj.id);
    }

    r.roundNo = r._usedQuestionIds.length || 1;
    emit();
    return obj || null;
  }

  function hasMoreQuestions() {
    const r = store.state.rounds;
    return !!(r._questionPool && r._questionPool.length);
  }

  function currentRoundObj() {
    const r = store.state.rounds;
    if (!r.question || !r.answers || !r.answers.length) return null;
    return {
      id: r.question.id,
      ord: r.question.ord,
      text: r.question.text,
      answers: r.answers,
    };
  }

  // === Główne stany gry ===

  async function stateGameReady() {
    const { teamA, teamB } = store.state.teams;
    ensureRoundsState();

    store.state.rounds.phase = "READY";
    setStep("r_ready");

    await display.stateGameReady(teamA, teamB);

    ui.setMsg("msgRoundsIntro", "Gra gotowa. Ekran oczekuje na start.");
    ui.setRoundsHud(store.state.rounds);

    setStep("r_intro");
  }

  async function stateStartGameIntro() {
    const { teamA, teamB } = store.state.teams;
    ensureRoundsState();
    const r = store.state.rounds;

    if (r._introPlayed) {
      ui.setMsg("msgRoundsIntro", "Intro gry zostało już odegrane.");
      return;
    }
    r._introPlayed = true;

    setStep("r_intro");
    ui.setRoundsHud(r);

    ui.setEnabled("btnStartShowIntro", false);

    await display.stateIntroLogo(teamA, teamB);
    ui.setMsg("msgRoundsIntro", "Intro uruchomione.");

    if (!introMixer) {
      playSfx("show_intro");

      setTimeout(() => {
        display.showLogo().catch(() => {});
      }, 14000);

      try {
        const dur = await getSfxDuration("show_intro");
        if (dur > 0) {
          await new Promise((res) => setTimeout(res, dur * 1000));
        }
      } catch {
        // brak dokładnej długości – trudno
      }
    } else {
      introMixer.stop();

      await new Promise((resolve) => {
        let logoShown = false;

        const off = introMixer.onTime((current, duration) => {
          const d = duration || 0;

          if (!logoShown && current >= 14) {
            logoShown = true;
            display.showLogo().catch(() => {});
          }

          if (d > 0 && current >= d - 0.05) {
            off();
            resolve();
          }
        });

        introMixer.play("show_intro");
      });
    }

    setStep("r_roundStart");
    ui.setMsg("msgRoundsIntro", "Intro zakończone. Możesz rozpocząć rundę.");
    ui.setRoundsHud(store.state.rounds);
  }

  async function startRound() {
    await loadRoundsIfNeeded();
    ensureRoundsState();

    const r = store.state.rounds;

    const obj = pickNextQuestionObj();
    if (!obj) {
      ui.setMsg(
        "msgRoundsRoundStart",
        "Brak dostępnych pytań dla kolejnych rund (wszystkie zużyte)."
      );
      return;
    }

    // reset runtime
    r.phase = "DUEL";
    r.passUsed = false;
    r.steal = r.steal || { active: false, used: false };
    r.steal.active = false;
    r.steal.used = false;
    r.stealWon = false;
    r.allowPass = false;

    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.controlTeam = null;
    r.revealed = new Set();

    r.question = { id: obj.id, ord: obj.ord, text: obj.text };
    r.answers = (obj.answers || []).slice().sort(
      (a, b) => nInt(a.ord, 0) - nInt(b.ord, 0)
    );

    r.duel = r.duel || { enabled: false, lastPressed: null };
    r.duel.enabled = false;
    r.duel.lastPressed = null;

    clearTimer3();

    // Control
    ui.setRoundQuestion(obj.text || "—");
    ui.renderRoundAnswers(r.answers, r.revealed);
    ui.setMsg("msgRoundsRoundStart", "Startuję rundę – leci dźwięk przejścia.");
    ui.setRoundsHud(r);

    ui.setEnabled("btnStartRound", false);

    // dźwięk przejścia rundy
    let dur = 0;
    try {
      dur = await getSfxDuration("round_transition");
    } catch (e) {
      console.warn("getSfxDuration(round_transition) error", e);
    }

    const totalMs = typeof dur === "number" && dur > 0 ? dur * 1000 : 3000;
    const boardLeadMs = 800;
    const boardDelay = Math.max(0, totalMs - boardLeadMs);

    playSfx("round_transition");

    // logo znika NA POCZĄTKU round_transition (pierwsza runda)
    if (!r._boardShown && typeof display.hideLogo === "function") {
      display.hideLogo().catch((e) => console.error("hideLogo error", e));
    }

    setTimeout(() => {
      const rowsCount = Math.max(1, Math.min(6, r.answers.length || 6));

      (async () => {
        try {
          if (!r._boardShown) {
            if (typeof display.roundsBoardPlaceholders === "function") {
              await display.roundsBoardPlaceholders(rowsCount);
            }
            r._boardShown = true;
          } else if (typeof display.roundsBoardPlaceholdersNewRound === "function") {
            await display.roundsBoardPlaceholdersNewRound(rowsCount);
          } else if (typeof display.roundsBoardPlaceholders === "function") {
            await display.roundsBoardPlaceholders(rowsCount);
          }

          await display.roundsSetX("A", 0);
          await display.roundsSetX("B", 0);
          if (display.setIndicator) await display.setIndicator(null);

          if (display.setBankTriplet) {
            await display.setBankTriplet(0);
          }
          if (display.setTotalsTriplets) {
            await display.setTotalsTriplets(r.totals || { A: 0, B: 0 });
          }
        } catch (e) {
          console.error("display setup for round (delayed) failed", e);
        }
      })();
    }, boardDelay);

    if (totalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, totalMs));
    }

    // pytanie na HOST
    const qText = (obj.text || "").trim();
    if (qText) {
      const safe = qText.replace(/"/g, '\\"');
      try {
        await devices.sendHostCmd(`SET "${safe}"`);
        await devices.sendHostCmd("OPEN");
      } catch (e) {
        console.error("sendHostCmd error", e);
      }
    }

    // pojedynek
    setStep("r_duel");
    ui.setMsg("msgRounds", `Runda ${r.roundNo} – pojedynek.`);
    ui.setRoundsHud(r);

    enableBuzzerDuel();
  }

  // === Buzzer / pojedynek ===

  function enableBuzzerDuel() {
    const r = store.state.rounds;
    r.duel = r.duel || {};
    r.duel.enabled = true;
    r.duel.lastPressed = null;

    ui.setMsg("msgDuel", "Pojedynek: czekam na przycisk.");
    ui.setRoundsHud(r);

    ui.setEnabled("btnBuzzAcceptA", false);
    ui.setEnabled("btnBuzzAcceptB", false);
    ui.setEnabled("btnBuzzRetry", false);

    devices.sendBuzzerCmd("ON").catch(() => {});
  }

  function retryDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;

    ui.setMsg("msgDuel", "Powtórka pojedynku.");
    ui.setRoundsHud(r);

    ui.setEnabled("btnBuzzAcceptA", false);
    ui.setEnabled("btnBuzzAcceptB", false);
    ui.setEnabled("btnBuzzRetry", false);

    devices.sendBuzzerCmd("RESET").catch(() => {});
  }

  function handleBuzzerClick(team) {
    const r = store.state.rounds;

    // dźwięk zawsze
    playSfx("buzzer_press");

    if (!r.duel.enabled) return;

    if (!r.duel.lastPressed) {
      r.duel.lastPressed = team;

      ui.setMsg(
        "msgDuel",
        `Pierwszy klik: drużyna ${team}. Zatwierdź A/B albo powtórz pojedynek.`
      );
      ui.setRoundsHud(r);

      ui.setEnabled("btnBuzzAcceptA", team === "A");
      ui.setEnabled("btnBuzzAcceptB", team === "B");
      ui.setEnabled("btnBuzzRetry", true);
    }
    // buzzer zostaje "wciśnięty" – nie wysyłamy OFF/RESET
  }

  function acceptBuzz(team) {
    const r = store.state.rounds;
    if (!r.duel.enabled) return;

    r.duel.enabled = false;
    r.controlTeam = team;

    setStep("r_play");
    r.phase = "DUEL";

    ui.setMsg("msgDuel", `Pierwsza odpowiedź: drużyna ${team}.`);
    ui.setMsg("msgRoundsPlay", `Kontrolę ma drużyna ${team}.`);
    ui.setRoundsHud(r);

    // kto aktualnie odpowiada → INDICATOR
    if (display.setIndicator) {
      display.setIndicator(team).catch?.(() => {});
    }

    ui.setEnabled("btnPassQuestion", false);
    ui.setEnabled("btnStartTimer3", true);
    ui.setEnabled("btnAddX", true);
    ui.setEnabled("btnGoSteal", false);
    ui.setEnabled("btnGoEndRound", false);

    ui.setEnabled("btnBuzzAcceptA", false);
    ui.setEnabled("btnBuzzAcceptB", false);
    ui.setEnabled("btnBuzzRetry", false);
  }

  // === Gra właściwa w rundzie ===

  function passQuestion() {
    const r = store.state.rounds;

    if (!r.allowPass) {
      ui.setMsg(
        "msgRounds",
        "Nie możesz już oddać pytania – decyzja tylko po pierwszej trafionej odpowiedzi."
      );
      return;
    }
    if (!r.controlTeam) {
      ui.setMsg("msgRounds", "Brak drużyny z kontrolą.");
      return;
    }

    const other = r.controlTeam === "A" ? "B" : "A";
    r.controlTeam = other;
    r.allowPass = false;

    ui.setMsg("msgRounds", `Pytanie oddane. Teraz odpowiada drużyna ${other}.`);
    ui.setRoundsHud(r);

    if (display.setIndicator) {
      display.setIndicator(other).catch?.(() => {});
    }
  }

  function startTimer3() {
    startTimer3Internal();
  }

  async function revealAnswerByOrd(ord) {
    const r = store.state.rounds;
    const ans = (r.answers || []).find((a) => a.ord === ord);
    if (!ans) return;
  
    if (!r.revealed) r.revealed = new Set();
    if (r.revealed.has(ord)) return;
  
    r.revealed.add(ord);
    // odświeżamy główną siatkę odpowiedzi
    ui.renderRoundAnswers(r.answers, r.revealed);
  
    const pts = nInt(ans.fixed_points ?? ans.points, 0);
    r.bankPts = nInt(r.bankPts, 0) + pts;
  
    // po pierwszej poprawnej odpowiedzi można oddać pytanie
    // po drugiej i kolejnych już NIE
    if (r.revealed.size === 1) {
      r.allowPass = true;
    } else {
      r.allowPass = false;
    }
  
    ui.setRoundsHud(r);
  
    // DISPLAY: odsłonięcie wiersza + suma banku + triplet banku
    await display.roundsRevealRow(ord, ans.text, pts);
    await display.roundsSetSum(r.bankPts);
    if (display.setBankTriplet) {
      await display.setBankTriplet(r.bankPts);
    }
  
    playSfx("answer_correct");
  }

  async function addX() {
    const r = store.state.rounds;
  
    if (!r.controlTeam) {
      ui.setMsg("msgRoundsPlay", "Najpierw jakaś drużyna musi mieć kontrolę.");
      return;
    }
  
    // po jakimkolwiek pudle nie można już oddać pytania
    r.allowPass = false;
  
    const key = r.controlTeam === "A" ? "xA" : "xB";
    r[key] = (r[key] || 0) + 1;
    if (r[key] > 3) r[key] = 3;
  
    await display.roundsSetX(r.controlTeam, r[key]);
    ui.setRoundsHud(r);
  
    playSfx("answer_wrong");
  
    // Właściwa gra: po 3 X przechodzimy do kradzieży (ale tylko,
    // jeśli są jeszcze nieodkryte odpowiedzi).
    if (r.phase !== "STEAL" && r[key] >= 3) {
      const hasHidden = (r.answers || []).some((a) => !r.revealed?.has(a.ord));
      if (!hasHidden) {
        // wszystko odkryte mimo 3 X – po prostu koniec rundy
        await goEndRound();
        return;
      }
  
      const other = r.controlTeam === "A" ? "B" : "A";
      r.phase = "STEAL";
      r.steal = r.steal || {};
      r.steal.active = true;
      r.steal.used = false;
      r.stealWon = false;
  
      ui.setMsg("msgSteal", `Szansa na kradzież. Odpowiada drużyna ${other}.`);
      ui.showRoundsStep("r_steal");
      ui.setRoundsHud(r);
  
      if (display.setIndicator) {
        await display.setIndicator(other);
      }
    }
  }


  // === Kradzież / koniec rundy ===

  function goSteal() {
    const r = store.state.rounds;

    if (!r.controlTeam) {
      ui.setMsg("msgSteal", "Brak drużyny, która grała pytanie – nie mogę uruchomić kradzieży.");
      return;
    }

    if (r.steal.active) {
      return; // już jesteśmy w kradzieży
    }

    const stealingTeam = r.controlTeam === "A" ? "B" : "A";

    r.phase = "STEAL";
    r.steal.active = true;
    r.steal.used = false;
    r.stealWon = false;
    r.steal.team = stealingTeam;

    ui.showRoundsStep("r_steal");
    ui.setMsg(
      "msgSteal",
      `Kradzież: odpowiada drużyna ${stealingTeam}. ` +
        `Kliknij odpowiedź kapitana na planszy albo przycisk „Nietrafiona”.`
    );
    ui.setRoundsHud(r);

    if (display.setIndicator) {
      display.setIndicator(stealingTeam).catch?.(() => {});
    }

    // siatka odpowiedzi do kradzieży (kliknięcie = stealTry)
    if (ui.renderRoundStealAnswers) {
      ui.renderRoundStealAnswers(r.answers || [], r.revealed || new Set());
    }
  }
  
  async function stealMiss() {
    const r = store.state.rounds;
    if (!r.steal || !r.steal.active || r.steal.used) return;
  
    r.steal.used = true;
    r.stealWon = false;
    r.steal.active = false;
  
    ui.setMsg("msgSteal", "Kradzież nieudana – bank zostaje u drużyny grającej planszę.");
    ui.setRoundsHud(r);
  
    if (display.setIndicator) {
      await display.setIndicator(null);
    }
  }


  async function stealTry(ord) {
    const r = store.state.rounds;
    if (!r.steal || !r.steal.active || r.steal.used) return;
  
    const ans = (r.answers || []).find((a) => a.ord === ord);
    if (!ans) {
      // operator kliknął coś dziwnego – traktuj jak pudło tylko jeśli chcesz
      return;
    }
  
    const alreadyRevealed = r.revealed && r.revealed.has(ord);
  
    if (!r.revealed) r.revealed = new Set();
    if (!alreadyRevealed) {
      r.revealed.add(ord);
  
      // odświeżamy dwie siatki: główna + steal
      ui.renderRoundAnswers(r.answers, r.revealed);
      if (ui.renderRoundStealAnswers) {
        ui.renderRoundStealAnswers(r.answers, r.revealed);
      }
  
      const pts = nInt(ans.fixed_points ?? ans.points, 0);
      r.bankPts = nInt(r.bankPts, 0) + pts;
  
      await display.roundsRevealRow(ord, ans.text, pts);
      await display.roundsSetSum(r.bankPts);
      if (display.setBankTriplet) {
        await display.setBankTriplet(r.bankPts);
      }
    }
  
    // kradzież udana: bank przechodzi na przeciwnika w goEndRound()
    r.steal.used = true;
    r.stealWon = true;
    r.steal.active = false;
  
    ui.setMsg("msgSteal", "Kradzież udana – bank trafi do drużyny kradnącej.");
    ui.setRoundsHud(r);
  
    if (display.setIndicator) {
      await display.setIndicator(null);
    }
  }

  async function goEndRound() {
    const r = store.state.rounds;
  
    const bank = nInt(r.bankPts, 0);
    if (!r.controlTeam) {
      ui.setMsg("msgRoundsEnd", "Brak drużyny z kontrolą – nie mogę przyznać banku.");
      return;
    }
  
    // kradnąca drużyna to ZAWSZE przeciwna do controlTeam
    const other = r.controlTeam === "A" ? "B" : "A";
  
    let winner = r.controlTeam;
  
    // jeśli kradzież była rozstrzygnięta
    if (r.steal && r.steal.used) {
      if (r.stealWon) {
        winner = other;      // udana kradzież
      } else {
        winner = r.controlTeam; // nieudana – pozostaje kontrolujący
      }
    }
  
    r.totals[winner] = nInt(r.totals[winner], 0) + bank;
  
    ui.setRoundsHud(r);
  
    try {
      if (display.roundsSetTotals) {
        await display.roundsSetTotals(r.totals);
      }
      if (display.setTotalsTriplets) {
        await display.setTotalsTriplets(r.totals);
      }
      if (display.setBankTriplet) {
        await display.setBankTriplet(0);
      }
    } catch (e) {
      console.warn("[rounds] update totals failed", e);
    }
  
    // dźwięk końca rundy ZAWSZE
    playSfx("round_transition");
  
    ui.setMsg("msgRoundsEnd", `Koniec rundy. Bank ${bank} pkt dla drużyny ${winner}.`);
  
    r.phase = "END";
    ui.showRoundsStep("r_end");
  }

  function endRound() {
    const r = store.state.rounds;
  
    r.roundNo = nInt(r.roundNo, 1) + 1;
  
    r.question = null;
    r.answers = [];
    r.revealed = new Set();
  
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.controlTeam = null;
  
    r.steal = { active: false, used: false };
    r.stealWon = false;
    r.allowPass = false;
  
    r.phase = "READY";
  
    clearTimer3();
    ui.setRoundsHud(r);
  
    // po rundzie ZAWSZE wracamy do „Rozpocznij rundę”
    setStep("r_roundStart");
    ui.setMsg("msgRoundsEnd", "Runda zakończona. Możesz rozpocząć kolejną rundę.");
  }


  function showRevealLeft() {
    const r = store.state.rounds;
  
    if (!r.answers || !r.answers.length) {
      ui.showRoundsStep("r_reveal");
      ui.setMsg("msgRoundsReveal", "Brak odpowiedzi do odsłonięcia.");
      return;
    }
  
    if (!r.revealed) r.revealed = new Set();
  
    ui.showRoundsStep("r_reveal");
    if (ui.renderRoundRevealAnswers) {
      ui.renderRoundRevealAnswers(r.answers, r.revealed);
    }
    ui.setMsg(
      "msgRoundsReveal",
      "Klikaj brakujące odpowiedzi, żeby pokazać je na wyświetlaczu (bez zmiany punktów)."
    );
  }
  
  async function revealLeftByOrd(ord) {
    const r = store.state.rounds;
    if (!r.answers || !r.answers.length) return;
  
    const ans = r.answers.find((a) => a.ord === ord);
    if (!ans) return;
  
    if (!r.revealed) r.revealed = new Set();
    if (r.revealed.has(ord)) return; // już odsłonięta w trakcie rundy
  
    r.revealed.add(ord);
  
    if (ui.renderRoundRevealAnswers) {
      ui.renderRoundRevealAnswers(r.answers, r.revealed);
    }
  
    try {
      const pts = nInt(ans.fixed_points, 0);
      await display.roundsRevealRow(ord, ans.text, pts);
      // UWAGA: celowo NIE zmieniamy r.bankPts ani sum drużyn
    } catch (e) {
      console.warn("[rounds] revealLeftByOrd display error", e);
    }
  }
  
  function revealDone() {
    // wracamy do ekranu końca rundy (tam nadal jest „Zakończ rundę”)
    ui.showRoundsStep("r_end");
    ui.setMsg("msgRoundsReveal", "");
    ui.setRoundsHud(store.state.rounds);
  }

  function bootIfNeeded() {
    ensureRoundsState();
    ui.setRoundsHud(store.state.rounds);
    ui.showRoundsStep(store.state.rounds.step || "r_ready");
  }

  // subskrypcja HUD
  store._roundsListeners = store._roundsListeners || [];
  store._roundsListeners.push((r) => {
    ui.setRoundsHud(r);
  });

  return {
    bootIfNeeded,
    stateGameReady,
    stateStartGameIntro,
    startRound,

    enableBuzzerDuel,
    retryDuel,
    acceptBuzz,
    handleBuzzerClick,

    passQuestion,
    startTimer3,
    revealAnswerByOrd,
    addX,

    goSteal,
    stealMiss,
    stealTry,
    goEndRound,
    endRound,

    showRevealLeft,
    revealLeftByOrd,
    revealDone,
  };
}
