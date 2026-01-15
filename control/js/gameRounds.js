import { playSfx, createSfxMixer, getSfxDuration } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

// Wszystkie teksty w jednym miejscu – łatwo edytować
const ROUNDS_MSG = {
  // --- STANY OGÓLNE ---
  GAME_READY: "Gra gotowa. Ekran oczekuje na start.",
  INTRO_ALREADY: "Intro gry zostało już odtworzone.",
  INTRO_RUNNING: "Intro uruchomione.",
  INTRO_DONE: "Intro zakończone. Możesz rozpocząć rundę.",
  NO_MORE_QUESTIONS:
    "Brak dostępnych pytań dla kolejnych rund (wszystkie zużyte).",

  // --- POJEDYNEK ---
  DUEL_WAIT: "Czekam na przycisk.",
  DUEL_RETRY: "Powtórzenie naciśnięcia.",
  DUEL_FIRST_CLICK: (team) =>
    `Pierwsza: drużyna ${team}. Zatwierdź albo powtórz.`,
  DUEL_FIRST_ANSWER: (team) =>
    `Pojedynek – pierwsza odpowiada: drużyna ${team}.`,
  DUEL_NEXT_TEAM: (team) => `Teraz odpowiada drużyna ${team}.`,
  DUEL_RESET: (team) =>
    `Obie odpowiedzi pudło – nowy cykl. Zaczyna drużyna ${team}.`,
  DUEL_RESULT_WIN: (team) => `Pojedynek wygrywa drużyna ${team}.`,

  // --- ROZGRYWKA / KONTROLA ---
  PLAY_CONTROL: (team) => `Gra drużyna ${team}.`,
  PLAY_NO_CONTROL: "Brak drużyny grającej.",
  PLAY_PASS_ONLY_DURING: "Pytanie można oddać tylko podczas rozgrywki.",
  PLAY_NO_MORE_PASS: "Nie możesz już oddać pytania w tej rundzie.",
  PLAY_PASSED: (team) => `Pytanie oddane. Teraz gra drużyna ${team}.`,

  // --- KRADZIEŻ ---
  STEAL_NO_CONTROL:
    "Nie mogę uruchomić kradzieży – brak drużyny grającej.",
  STEAL_PROMPT: (team) =>
    `Kradzież: odpowiada drużyna ${team}. Kliknij odpowiedź lub „X (pudło)”.`,
  STEAL_CHANCE: (team) => `Szansa na kradzież. Odpowiada drużyna ${team}.`,
  STEAL_SUCCESS: "Kradzież udana – bank przechodzi do drużyny kradnącej.",
  STEAL_FAIL: "Kradzież nietrafiona – bank zostaje przy drużynie grającej.",

  // --- ODSŁANIANIE PO RUNDZIE ---
  REVEAL_NONE: "Brak odpowiedzi do odsłonięcia.",
  REVEAL_INFO:
    "Klikaj brakujące odpowiedzi, żeby pokazać je na wyświetlaczu (bez zmiany punktów).",
  REVEAL_DONE: "Wszystkie odpowiedzi odsłonięte. Koniec rundy.",

  // --- KONIEC RUNDY ---
  ROUND_NO_CONTROL_BANK:
    "Brak drużyny grającej – nie mogę przyznać banku.",
  ROUND_BANK: (bank, team) =>
    `Koniec rundy. ${bank} pkt dla drużyny ${team}.`,
  ROUND_BANK_MULT: (bank, team, mult, awarded) =>
    `Koniec rundy. ${bank} pkt dla drużyny ${team} (x${mult} = ${awarded} pkt).`,
  ROUND_TO_FINAL: "Rundy zakończone. Przechodzimy do finału.",
  ROUND_NEXT: "Runda zakończona. Możesz rozpocząć kolejną rundę.",
  ROUND_LAST: "To była ostatnia runda. Przejdź do zakończenia gry.",

  // --- TIMER ---
  TIMER_TIMEOUT_X: "Czas minął – pudło.",

  // --- KONIEC GRY ---
  GAME_END_DRAW: (a, b) => `Koniec gry. Remis ${a}:${b}.`,
  GAME_END_WIN: (team, pts) =>
    `Koniec gry. Wygrywa drużyna ${team} z wynikiem ${pts} pkt.`,
};

export function createRounds({ ui, store, devices, display, loadQuestions, loadAnswers }) {
  let timerRAF = null;
  const introMixer = createSfxMixer?.();

 
// ================== HOST (ROUNDS) ==================
function hostTag(style, text) {
  return `[${style}]${String(text ?? "")}[/]`;
}

function hostTitleForRounds() {
  const r = store.state.rounds || {};
  const rn = nInt(r.roundNo, 1);

  if (r.phase === "DUEL" && r.duel?.enabled) return `RUNDA ${rn} — PRZYCISK`;
  if (r.phase === "DUEL" && !r.duel?.enabled) return `RUNDA ${rn} — POJEDYNEK`;
  if (r.phase === "PLAY") return `RUNDA ${rn} — ROZGRYWKA`;
  if (r.phase === "STEAL") return `RUNDA ${rn} — KRADZIEŻ`;
  if (r.phase === "REVEAL") return `RUNDA ${rn} — ODSŁANIANIE`;
  return `RUNDA ${rn}`;
}

function hostBodyQuestion() {
  const q = store.state.rounds?.question?.text || "";
  return String(q).replace(/\s+/g, " ").trim();
}

function hostAnswersLines() {
  const r = store.state.rounds || {};
  const answers = Array.isArray(r.answers) ? r.answers : [];
  const revealed = r.revealed instanceof Set ? r.revealed : new Set();

  return answers
    .slice()
    .sort((a, b) => nInt(a.ord, 0) - nInt(b.ord, 0))
    .map((a) => {
      const ord = nInt(a.ord, 0);
      const pts = nInt(a.fixed_points ?? a.points, 0);
      const txt = String(a.text || "").replace(/\s+/g, " ").trim();

      const line = `${ord}) ${txt} (${pts})`;
      return revealed.has(ord) ? hostTag("#2ecc71", line) : line;
    });
}

async function hostSetLeft(lines) {
  const txt = String((lines || []).join("\n")).replace(/"/g, '\\"');
  try { await devices.sendHostCmd(`SET1 "${txt}"`); } catch {}
}

async function hostSetRight(lines) {
  const txt = String((lines || []).join("\n")).replace(/"/g, '\\"');
  try { await devices.sendHostCmd(`SET2 "${txt}"`); } catch {}
}

async function hostClearAll() {
  try { await devices.sendHostCmd("CLEAR"); } catch {}
}

function hostUpdate() {
  const title = hostTitleForRounds();
  const q = hostBodyQuestion();

  // lewa: nagłówek + pytanie
  const left = [hostTag("b", title), "", q || "—"];

  // prawa: odpowiedzi
  const right = hostAnswersLines();
  // jak nie ma odpowiedzi, prawa może być pusta (wpisywanie itp.)
  // więc nie dokładamy tam nic na siłę

  hostSetLeft(left).catch(() => {});
  hostSetRight(right).catch(() => {});
}
// ==================================================


  function emit() {
    try {
      for (const fn of store._roundsListeners || []) fn(store.state.rounds);
    } catch {}
  }

  function ensureRoundsState() {
    const r = store.state.rounds;
    if (!r.timer3) r.timer3 = { running: false, endsAt: 0, secLeft: 0 };
    if (!("resolved" in r.timer3)) r.timer3.resolved = null;
    if (!r._questionPool) r._questionPool = [];
    if (!r._usedQuestionIds) r._usedQuestionIds = [];
    if (!r.totals) r.totals = { A: 0, B: 0 };
    if (!r.revealed) r.revealed = new Set();
    if (typeof r.canEndRound !== "boolean") r.canEndRound = false;
  }

  function getRoundMultiplier() {
    const rn = nInt(store.state.rounds?.roundNo, 1);
    const adv = store.state.advanced || {};
    const arr = Array.isArray(adv.roundMultipliers)
      ? adv.roundMultipliers
      : [1];

    if (!arr.length) return 1;

    const idx = Math.max(0, Math.min(arr.length - 1, rn - 1));
    const m = nInt(arr[idx], 1);
    return m > 0 ? m : 1;
  }

  // Tryb końcówki gry (bez finału) – wspólny z finałem:
  //  "logo"   → logo
  //  "points" → WIN z punktami
  //  "money"  → tu traktujemy jak "points" (bez finału nie ma kwoty)
  function getEndScreenMode() {
    const adv = store.state?.advanced || {};
    const mode = adv.endScreenMode;

    if (mode === "logo" || mode === "points" || mode === "money") {
      return mode;
    }

    if (adv.winEnabled === true) return "points";
    return "logo";
  }

  // --- KOMUNIKATY ---

  function clearPlayMsgs() {
    ui.setMsg("msgRoundsPlay", "");
    ui.setMsg("msgSteal", "");
    ui.setMsg("msgRoundsReveal", "");
    ui.setMsg("msgRoundsEnd", "");
  }

  function clearAllRoundMsgs() {
    ui.setMsg("msgRoundsReady", "");
    ui.setMsg("msgRoundsIntro", "");
    ui.setMsg("msgRoundsRoundStart", "");
    ui.setMsg("msgDuel", "");
    clearPlayMsgs();
  }

  function setDuelMsg(text) {
    ui.setMsg("msgDuel", text || "");
    clearPlayMsgs();
  }

  function setPlayMsg(text) {
    ui.setMsg("msgRoundsPlay", text || "");
    ui.setMsg("msgSteal", "");
    ui.setMsg("msgRoundsReveal", "");
    ui.setMsg("msgRoundsEnd", "");
  }

  function setStealMsg(text) {
    ui.setMsg("msgSteal", text || "");
    ui.setMsg("msgRoundsPlay", "");
    ui.setMsg("msgRoundsReveal", "");
    ui.setMsg("msgRoundsEnd", "");
  }

  function setRevealMsg(text) {
    ui.setMsg("msgRoundsReveal", text || "");
    ui.setMsg("msgRoundsPlay", "");
    ui.setMsg("msgSteal", "");
    ui.setMsg("msgRoundsEnd", "");
  }

  function setEndMsg(text) {
    ui.setMsg("msgRoundsEnd", text || "");
    ui.setMsg("msgRoundsPlay", "");
    ui.setMsg("msgSteal", "");
    ui.setMsg("msgRoundsReveal", "");
  }

  // --- KROKI WIDOKU ---

  function setStep(step) {
    ensureRoundsState();
    const r = store.state.rounds;
    r.step = step;
    ui.showRoundsStep(step);
  
    ui.setEnabled("btnStartRound", r.step === "r_roundStart");
  
    hostUpdate();
  }

  // --- TIMER 3s ---

  function clearTimer3() {
    ensureRoundsState();
    const r = store.state.rounds;
    r.timer3.running = false;
    r.timer3.endsAt = 0;
    r.timer3.secLeft = 0;
    r.timer3.resolved = null;
    if (timerRAF) cancelAnimationFrame(timerRAF);
    timerRAF = null;
    ui.setRoundsHud(r);
    updatePlayControls();
  }

  function startTimer3Internal() {
    ensureRoundsState();
    const r = store.state.rounds;
    clearTimer3();
    r.timer3.resolved = null; // <-- upewniamy się
    r.timer3.running = true;
    r.timer3.endsAt = Date.now() + 3000;
    updatePlayControls();

    const tick = () => {
      if (!r.timer3.running) return;
      const left = Math.max(0, r.timer3.endsAt - Date.now());
      const s = Math.ceil(left / 1000);
      r.timer3.secLeft = s;
      ui.setRoundsHud(r);

      if (left <= 0) {
      
        if (r.timer3.resolved) return;
      
        r.timer3.resolved = "X";
        r.timer3.running = false;
        r.timer3.secLeft = 0;
        ui.setRoundsHud(r);
      
        r.allowPass = false;
      
        if (r.phase === "PLAY" || r.phase === "STEAL") {
          setPlayMsg(ROUNDS_MSG.TIMER_TIMEOUT_X);
        }
      
        addX();
        return;
      }

      timerRAF = requestAnimationFrame(tick);
    };

    timerRAF = requestAnimationFrame(tick);
  }

  // --- PRZYCISKI "PLAY" (oddaj / X / timer / zakończ rundę) ---

  function updatePlayControls() {
    const r = store.state.rounds;

    // HARD LOCK (np. po "Zakończ rundę")
    if (r.lockPlayControls) {
      ui.setEnabled("btnStartTimer3", false);
      ui.setEnabled("btnAddX", false);
      ui.setEnabled("btnPassQuestion", false);
      ui.setEnabled("btnGoEndRound", false);
      return;
    }

    const inDuel = r.phase === "DUEL";
    const inPlay = r.phase === "PLAY";
    const inSteal = r.phase === "STEAL";
    const inReveal = r.phase === "REVEAL";

    const endAvailable = !inDuel && !inReveal && !!r.canEndRound;
    ui.setEnabled("btnGoEndRound", endAvailable);

    const canPass = inPlay && r.allowPass && !r.canEndRound;
    ui.setEnabled("btnPassQuestion", canPass);

    const playingNow =
      (inDuel || inPlay || inSteal) && !r.canEndRound && !inReveal;

    ui.setEnabled("btnStartTimer3", playingNow && !r.timer3?.running);
    ui.setEnabled("btnAddX", playingNow);
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

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool;
  }

  async function loadRoundsIfNeeded() {
    ensureRoundsState();
    const r = store.state.rounds;

    if (!r._questionPool || !r._questionPool.length) {
      const rounds = await pickQuestionsForRounds(
        store.state.gameId || store.state.id || ""
      );
      r._questionPool = rounds || [];
      r._usedQuestionIds = [];
      r.roundNo = 1;
      emit();
    }
  }

  function pickNextQuestionObj() {
    ensureRoundsState();
    const r = store.state.rounds;

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
    ensureRoundsState();
    const r = store.state.rounds;
    return !!(r._questionPool && r._questionPool.length);
  }

  function currentRoundObj() {
    ensureRoundsState();
    const r = store.state.rounds;
    if (!r.question || !r.answers || !r.answers.length) return null;
    return {
      id: r.question.id,
      ord: r.question.ord,
      text: r.question.text,
      answers: r.answers,
    };
  }

  function getFinalMinPoints() {
    const adv = store.state.advanced || {};
    return nInt(adv.finalMinPoints, 0);
  }
  
  function isThresholdHit() {
    const r = store.state.rounds || {};
    const t = r.totals || { A: 0, B: 0 };
    const thr = getFinalMinPoints();
    if (thr <= 0) return false;
    return nInt(t.A, 0) >= thr || nInt(t.B, 0) >= thr;
  }

  // === Główne stany gry ===

  async function stateGameReady() {
    ensureRoundsState();
    const r = store.state.rounds;
    const { teamA, teamB } = store.state.teams;

    clearAllRoundMsgs();

    r.phase = "READY";
    setStep("r_ready");
    updatePlayControls();

    await display.stateGameReady(teamA, teamB);

    ui.setMsg("msgRoundsIntro", ROUNDS_MSG.GAME_READY);
    ui.setRoundsHud(r);

    setStep("r_intro");
  }

  async function stateStartGameIntro() {
    ensureRoundsState();
    const r = store.state.rounds;
    const { teamA, teamB } = store.state.teams;

    clearAllRoundMsgs();

    if (r._introPlayed) {
      ui.setMsg("msgRoundsIntro", ROUNDS_MSG.INTRO_ALREADY);
      return;
    }
    r._introPlayed = true;

    setStep("r_intro");
    ui.setRoundsHud(r);

    ui.setEnabled("btnStartShowIntro", false);

    await display.stateIntroLogo(teamA, teamB);
    ui.setMsg("msgRoundsIntro", ROUNDS_MSG.INTRO_RUNNING);

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
      } catch {}
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
    ui.setMsg("msgRoundsIntro", ROUNDS_MSG.INTRO_DONE);
    ui.setRoundsHud(r);

    updatePlayControls();
  }

  async function startRound() {
    await loadRoundsIfNeeded();
    ensureRoundsState();
    
    const r = store.state.rounds;

    if (isThresholdHit()) {
      const canFinal =
        typeof store.canEnterCard === "function" && store.canEnterCard("final");
    
      if (canFinal) {
        store.setFinalActive?.(true);
        store.setActiveCard?.("final");
        ui.showCard?.("final");
        ui.showFinalStep?.("f_start");
        setEndMsg(ROUNDS_MSG.ROUND_TO_FINAL);
      } else {
        ui.showRoundsStep?.("r_gameEnd");
        ui.setEnabled?.("btnShowGameEnd", true);
        setEndMsg(ROUNDS_MSG.ROUND_LAST);
      }
      return;
    }
        
    r.question = null;
    r.answers = [];
    r.revealed = new Set();
    ui.setRoundQuestion("—");
    ui.renderRoundAnswers?.([], r.revealed);
    hostUpdate();
    
    ui.setEnabled("btnStartRound", false);
    
    clearAllRoundMsgs();

    const obj = pickNextQuestionObj();
    if (!obj) {
      ui.setMsg("msgRoundsRoundStart", ROUNDS_MSG.NO_MORE_QUESTIONS);
      ui.setEnabled("btnStartRound", true); // <- ważne
      return;
    }
    
    r.phase = "DUEL";
    r.passUsed = false;
    r.steal = { active: false, used: false, won: false, team: null };
    r.canEndRound = false;

    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.controlTeam = null;
    r.revealed = new Set();

    r.question = { id: obj.id, ord: obj.ord, text: obj.text };
    r.answers = (obj.answers || []).slice().sort(
      (a, b) => nInt(a.ord, 0) - nInt(b.ord, 0)
    );

    r.duel = {
      enabled: false,
      lastPressed: null,
      firstTeam: null,
      secondTeam: null,
      currentTeam: null,
      cycleFirstAnswered: false,
      cycleSecondAnswered: false,
      cycleFirstPts: 0,
      cycleSecondPts: 0,
      cycleFirstIsX: false,
      cycleSecondIsX: false,
    };

    clearTimer3();

    ui.setRoundQuestion(obj.text || "—");
    ui.renderRoundAnswers(r.answers, r.revealed);
    ui.setMsg("msgRoundsRoundStart", "Startuję rundę – leci dźwięk przejścia.");
    ui.setRoundsHud(r);

    updatePlayControls();

    let dur = 0;
    try {
      dur = await getSfxDuration("round_transition");
    } catch (e) {
      console.warn("getSfxDuration(round_transition) error", e);
    }

    const totalMs = typeof dur === "number" && dur > 0 ? dur * 1000 : 2000;
    const transitionAnchorMs = 920;

    playSfx("round_transition");

    setTimeout(() => {
      const rowsCount = Math.max(1, Math.min(6, r.answers.length || 6));

      (async () => {
        try {
          if (!r._boardShown) {
            if (typeof display.hideLogo === "function") {
              try {
                await display.hideLogo();
              } catch (e) {
                console.error("hideLogo error", e);
              }
            }

            if (typeof display.roundsBoardPlaceholders === "function") {
              await display.roundsBoardPlaceholders(rowsCount);
            }
            r._boardShown = true;
          } else if (
            typeof display.roundsBoardPlaceholdersNewRound === "function"
          ) {
            await display.roundsBoardPlaceholdersNewRound(rowsCount);
          } else if (typeof display.roundsBoardPlaceholders === "function") {
            await display.roundsBoardPlaceholders(rowsCount);
          }

          await display.roundsClearAllX?.();

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
    }, transitionAnchorMs);

    if (totalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, totalMs));
    }
    setStep("r_duel");
    ui.setRoundsHud(r);

    enableBuzzerDuel();
  }

  // === Buzzer / pojedynek ===

  function duelResetCycle() {
    ensureRoundsState();
    const r = store.state.rounds;
    const d = r.duel || {};
    d.cycleFirstAnswered = false;
    d.cycleSecondAnswered = false;
    d.cycleFirstPts = 0;
    d.cycleSecondPts = 0;
    d.cycleFirstIsX = false;
    d.cycleSecondIsX = false;
    d.currentTeam = d.firstTeam || null;
    r.duel = d;
  }

  function enableBuzzerDuel() {
    ensureRoundsState();
    const r = store.state.rounds;
    r.duel = r.duel || {};
    r.duel.enabled = true;
    r.duel.lastPressed = null;
    r.duel.firstTeam = null;
    r.duel.secondTeam = null;
    r.duel.currentTeam = null;
    duelResetCycle();

    setDuelMsg(ROUNDS_MSG.DUEL_WAIT);
    ui.setRoundsHud(r);

    ui.setEnabled("btnBuzzAcceptA", false);
    ui.setEnabled("btnBuzzAcceptB", false);
    ui.setEnabled("btnBuzzRetry", false);

    updatePlayControls();

    devices.sendBuzzerCmd("ON").catch(() => {});

    hostUpdate();
  }

  function retryDuel() {
    ensureRoundsState();
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;
    r.duel.firstTeam = null;
    r.duel.secondTeam = null;
    r.duel.currentTeam = null;
    duelResetCycle();

    setDuelMsg(ROUNDS_MSG.DUEL_RETRY);
    ui.setRoundsHud(r);

    ui.setEnabled("btnBuzzAcceptA", false);
    ui.setEnabled("btnBuzzAcceptB", false);
    ui.setEnabled("btnBuzzRetry", false);

    updatePlayControls();

    devices.sendBuzzerCmd("RESET").catch(() => {});
    devices.sendBuzzerCmd("ON").catch(() => {});
  }

  function duelRegisterResult(team, { pts, isX, isTop }) {
    ensureRoundsState();
    const r = store.state.rounds;
    const d = r.duel || {};
    const firstTeam = d.firstTeam;
    const secondTeam = d.secondTeam;

    if (!d.cycleFirstAnswered) {
      d.cycleFirstAnswered = true;
      d.cycleFirstPts = pts;
      d.cycleFirstIsX = !!isX;
      r.duel = d;

      if (!isX && isTop) {
        return { type: "WIN", winner: team };
      }

      d.currentTeam = team === firstTeam ? secondTeam : firstTeam;
      r.duel = d;
      return { type: "CONTINUE_SECOND", nextTeam: d.currentTeam };
    }

    if (!d.cycleSecondAnswered) {
      d.cycleSecondAnswered = true;
      d.cycleSecondPts = pts;
      d.cycleSecondIsX = !!isX;
      r.duel = d;

      const firstPts = d.cycleFirstIsX ? 0 : d.cycleFirstPts;
      const secondPts = d.cycleSecondIsX ? 0 : d.cycleSecondPts;

      if (firstPts <= 0 && secondPts <= 0) {
        duelResetCycle();
        return { type: "RESET" };
      }

      if (firstPts > 0 && secondPts <= 0) {
        return { type: "WIN", winner: firstTeam };
      }

      if (secondPts > 0 && firstPts <= 0) {
        return { type: "WIN", winner: secondTeam };
      }

      if (secondPts > firstPts) {
        return { type: "WIN", winner: secondTeam };
      }
      return { type: "WIN", winner: firstTeam };
    }

    return { type: "NONE" };
  }

  async function beginPlayAfterDuel(winner) {
    ensureRoundsState();
    const r = store.state.rounds;

    r.phase = "PLAY";
    r.controlTeam = winner;
    r.allowPass = true;

    setDuelMsg(ROUNDS_MSG.DUEL_RESULT_WIN(winner));
    setPlayMsg(ROUNDS_MSG.PLAY_CONTROL(winner));
    ui.setRoundsHud(r);

    if (display.setIndicator) {
      await display.setIndicator(winner).catch?.(() => {});
    }

    updatePlayControls();
    hostUpdate();
  }

  function handleBuzzerClick(team) {
    ensureRoundsState();
    const r = store.state.rounds;

    playSfx("buzzer_press");

    if (!r.duel.enabled) return;

    if (!r.duel.lastPressed) {
      r.duel.lastPressed = team;

      setDuelMsg(ROUNDS_MSG.DUEL_FIRST_CLICK(team));
      ui.setRoundsHud(r);

      ui.setEnabled("btnBuzzAcceptA", team === "A");
      ui.setEnabled("btnBuzzAcceptB", team === "B");
      ui.setEnabled("btnBuzzRetry", true);
    }
  }

  function acceptBuzz(team) {
    ensureRoundsState();
    const r = store.state.rounds;
    if (!r.duel.enabled) return;

    r.duel.enabled = false;

    const other = team === "A" ? "B" : "A";
    r.duel.firstTeam = team;
    r.duel.secondTeam = other;
    r.duel.currentTeam = team;
    duelResetCycle();

    setStep("r_play");
    r.phase = "DUEL";

    setDuelMsg(ROUNDS_MSG.DUEL_FIRST_ANSWER(team));
    setPlayMsg("");
    ui.setRoundsHud(r);

    if (display.setIndicator) {
      display.setIndicator(team).catch?.(() => {});
    }

    updatePlayControls();

    ui.setEnabled("btnBuzzAcceptA", false);
    ui.setEnabled("btnBuzzAcceptB", false);
    ui.setEnabled("btnBuzzRetry", false);

    hostUpdate();
  }

  // === Gra właściwa w rundzie ===

  function passQuestion() {
    ensureRoundsState();
    const r = store.state.rounds;

    if (r.phase !== "PLAY") {
      setPlayMsg(ROUNDS_MSG.PLAY_PASS_ONLY_DURING);
      return;
    }

    if (!r.allowPass) {
      setPlayMsg(ROUNDS_MSG.PLAY_NO_MORE_PASS);
      return;
    }
    if (!r.controlTeam) {
      setPlayMsg(ROUNDS_MSG.PLAY_NO_CONTROL);
      return;
    }

    const other = r.controlTeam === "A" ? "B" : "A";

    r.controlTeam = other;
    r.allowPass = false;

    setPlayMsg(ROUNDS_MSG.PLAY_PASSED(other));
    ui.setRoundsHud(r);

    if (display.setIndicator) {
      display.setIndicator(other).catch?.(() => {});
    }
    updatePlayControls();
  }

  function startTimer3() {
    const r = store.state.rounds;
    if (r.timer3?.running) return;
    startTimer3Internal();
  }


  // === Odsłanianie odpowiedzi (pojedunek / gra / kradzież / reveal) ===

  async function revealAnswerByOrd(ord) {
    ensureRoundsState();
    // jeśli timer w tym cyklu już rozstrzygnięty jako X, to nie odsłaniamy odpowiedzi
    if (r.timer3 && r.timer3.resolved === "X") {
      return;
    }
    
    // jeśli timer jeszcze leci, to odpowiedź wygrywa z X (rezerwacja cyklu)
    if (r.timer3 && r.timer3.running) {
      r.timer3.resolved = "ANSWER";
    }

    const r = store.state.rounds;

    if (r.canEndRound && r.phase !== "REVEAL") {
      return;
    }

    clearTimer3();

    const ans = (r.answers || []).find((a) => a.ord === ord);
    if (!ans) return;

    if (!r.revealed) r.revealed = new Set();

    if (r.phase === "REVEAL") {
      return await revealLeftByOrd(ord);
    }

    // --- DUEL ---
    if (r.phase === "DUEL") {
      if (r.revealed.has(ord)) return;
      r.revealed.add(ord);

      ui.renderRoundAnswers?.(r.answers, r.revealed);
      hostUpdate();

      const pts = nInt(ans.fixed_points ?? ans.points, 0);
      r.bankPts = nInt(r.bankPts, 0) + pts;
      ui.setRoundsHud(r);

      await display.roundsRevealRow(ord, ans.text, pts);
      await display.roundsSetSum(r.bankPts);
      if (display.setBankTriplet) {
        await display.setBankTriplet(r.bankPts);
      }

      playSfx("answer_correct");

      const d = r.duel || {};
      const team = d.currentTeam || d.firstTeam || d.lastPressed || "A";
      const isTop = nInt(ans.ord, 0) === 1;
      const result = duelRegisterResult(team, { pts, isX: false, isTop });

      if (result.type === "WIN") {
        await beginPlayAfterDuel(result.winner);
      } else if (result.type === "CONTINUE_SECOND") {
        setDuelMsg(ROUNDS_MSG.DUEL_NEXT_TEAM(result.nextTeam));
        ui.setRoundsHud(r);
        if (display.setIndicator) {
          display.setIndicator(result.nextTeam).catch?.(() => {});
        }
      } else if (result.type === "RESET") {
        setDuelMsg(ROUNDS_MSG.DUEL_RESET(d.firstTeam));
        ui.setRoundsHud(r);
        if (display.setIndicator && d.firstTeam) {
          display.setIndicator(d.firstTeam).catch?.(() => {});
        }
      }

      return;
    }

    // --- PLAY / STEAL ---

    if (r.revealed.has(ord)) return;
    r.revealed.add(ord);
    
    ui.renderRoundAnswers?.(r.answers, r.revealed);
    hostUpdate(); 
    const pts = nInt(ans.fixed_points ?? ans.points, 0);
    r.bankPts = nInt(r.bankPts, 0) + pts;
    ui.setRoundsHud(r);

    await display.roundsRevealRow(ord, ans.text, pts);
    await display.roundsSetSum(r.bankPts);
    if (display.setBankTriplet) {
      await display.setBankTriplet(r.bankPts);
    }

    playSfx("answer_correct");

    if (r.phase === "PLAY") {
      r.allowPass = false;

      const hasHidden = (r.answers || []).some(
        (a) => !r.revealed?.has(a.ord)
      );
      if (!hasHidden) {
        r.canEndRound = true;
      }
      updatePlayControls();
    }

    if (r.phase === "STEAL") {
      if (!r.steal || !r.steal.active || r.steal.used) return;

      r.steal.used = true;
      r.stealWon = true;
      r.steal.active = false;

      setStealMsg(ROUNDS_MSG.STEAL_SUCCESS);
      ui.setRoundsHud(r);

      r.canEndRound = true;
      updatePlayControls();

      if (display.setIndicator) {
        await display.setIndicator(null);
      }

      return;
    }
  }

  // === X / pudło ===

  async function addX() {
    ensureRoundsState();
    const r = store.state.rounds;

    clearTimer3();

    // DUEL
    if (r.phase === "DUEL") {
      const d = r.duel || {};

      let team = d.currentTeam || d.firstTeam || d.lastPressed;
      if (!team) team = "A";

      if (display.roundsFlashDuelX) {
        try {
          await display.roundsFlashDuelX(team);
        } catch (e) {
          console.warn("[rounds] roundsFlashDuelX error", e);
        }
      }
      playSfx("answer_wrong");

      const result = duelRegisterResult(team, {
        pts: 0,
        isX: true,
        isTop: false,
      });

      if (result.type === "WIN") {
        await beginPlayAfterDuel(result.winner);
      } else if (result.type === "CONTINUE_SECOND") {
        setDuelMsg(ROUNDS_MSG.DUEL_NEXT_TEAM(result.nextTeam));
        ui.setRoundsHud(r);
        if (display.setIndicator) {
          display.setIndicator(result.nextTeam).catch?.(() => {});
        }
      } else if (result.type === "RESET") {
        setDuelMsg(ROUNDS_MSG.DUEL_RESET(d.firstTeam));
        ui.setRoundsHud(r);
        if (display.setIndicator && d.firstTeam) {
          display.setIndicator(d.firstTeam).catch?.(() => {});
        }
      }

      return;
    }

    // STEAL
    if (r.phase === "STEAL") {
      await stealMiss();
      updatePlayControls();
      hostUpdate();
      return;
    }

    // PLAY
    if (!r.controlTeam) {
      setPlayMsg(ROUNDS_MSG.PLAY_NO_CONTROL);
      return;
    }

    r.allowPass = false;
    updatePlayControls();

    const key = r.controlTeam === "A" ? "xA" : "xB";
    r[key] = (r[key] || 0) + 1;
    if (r[key] > 3) r[key] = 3;

    await display.roundsSetX(r.controlTeam, r[key]);
    ui.setRoundsHud(r);

    playSfx("answer_wrong");

    if (r[key] >= 3) {
      const hasHidden = (r.answers || []).some(
        (a) => !r.revealed?.has(a.ord)
      );

      if (!hasHidden) {
        updatePlayControls();
        return;
      }

      const other = r.controlTeam === "A" ? "B" : "A";
      r.phase = "STEAL";
      r.steal = { active: true, used: false, won: false, team: other };

      setStealMsg(ROUNDS_MSG.STEAL_CHANCE(other));
      ui.setRoundsHud(r);

      if (display.setIndicator) {
        display.setIndicator(other).catch?.(() => {});
      }
    }
    updatePlayControls();
  }

  // === Kradzież / koniec rundy ===

  function goSteal() {
    const r = store.state.rounds;

    if (!r.controlTeam) {
      setStealMsg(ROUNDS_MSG.STEAL_NO_CONTROL);
      return;
    }

    if (r.steal.active) {
      return;
    }

    const stealingTeam = r.controlTeam === "A" ? "B" : "A";

    r.phase = "STEAL";
    r.steal.active = true;
    r.steal.used = false;
    r.stealWon = false;
    r.steal.team = stealingTeam;

    setStealMsg(ROUNDS_MSG.STEAL_PROMPT(stealingTeam));
    ui.setRoundsHud(r);

    if (display.setIndicator) {
      display.setIndicator(stealingTeam).catch?.(() => {});
    }
    hostUpdate();
  }

  async function stealMiss() {
    const r = store.state.rounds;
    if (!r.steal || !r.steal.active || r.steal.used) return;
  
    r.steal.used = true;
    r.stealWon = false;
    r.steal.active = false;
  
    setStealMsg(ROUNDS_MSG.STEAL_FAIL);
    ui.setRoundsHud(r);
    r.canEndRound = true;
    updatePlayControls();
  
    if (display.setIndicator) {
      await display.setIndicator(null);
    }
  
    // NOWE: duży X (idx 4) po stronie kradnącej
    try {
      const stealingTeam = r.steal.team; // "A" albo "B"
      if (display.roundsSetXOne && stealingTeam) {
        await display.roundsSetXOne(stealingTeam, 4, true);
      }
    } catch (e) {
      console.warn("[rounds] roundsSetXOne(steal miss) failed", e);
    }
  
    playSfx("answer_wrong");
  }

  async function stealTry(ord) {
    const r = store.state.rounds;
    if (!r.steal || !r.steal.active || r.steal.used) return;

    await revealAnswerByOrd(ord);
  }

  async function goEndRound() {
    const r = store.state.rounds;
    
    // NOWE: blokada + wyłącz wszystko “bojowe”
    r.lockPlayControls = true;
    clearTimer3();          // zatrzymaj 3s żeby nie dobił X
    r.allowPass = false;    // żeby logika nie próbowała włączać "oddaj"
    r.canEndRound = false;  // już kliknięte — nie ma wracać
    updatePlayControls();

    const bank = nInt(r.bankPts, 0);
    if (!r.controlTeam) {
      setEndMsg(ROUNDS_MSG.ROUND_NO_CONTROL_BANK);
      return;
    }

    const other = r.controlTeam === "A" ? "B" : "A";
    let winner = r.controlTeam;

    if (r.steal && r.steal.used) {
      if (r.stealWon) {
        winner = other;
      } else {
        winner = r.controlTeam;
      }
    }

    const mult = getRoundMultiplier();
    const awarded = bank * mult;

    r.totals[winner] = nInt(r.totals[winner], 0) + awarded;

    ui.setRoundsHud(r);

    let bellsDur = 0;
    try {
      bellsDur = await getSfxDuration("bells");
    } catch (e) {
      console.warn("getSfxDuration(bells) error", e);
    }

    playSfx("bells");

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

    if (bellsDur > 0) {
      await new Promise((resolve) => setTimeout(resolve, bellsDur * 1000));
    }

    playSfx("round_transition2");

    const msg =
      mult === 1
        ? ROUNDS_MSG.ROUND_BANK(bank, winner)
        : ROUNDS_MSG.ROUND_BANK_MULT(bank, winner, mult, awarded);

    setEndMsg(msg);

    const hasHidden = (r.answers || []).some(
      (a) => !r.revealed?.has(a.ord)
    );
    if (!hasHidden) {
      endRound();
    } else {
      showRevealLeft();
    }
  }

  function endRound() {
    const r = store.state.rounds;
  
    r.roundNo = nInt(r.roundNo, 1) + 1;
  
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.controlTeam = null;
  
    r.steal = { active: false, used: false, team: null };
    r.stealWon = false;
    r.allowPass = false;
  
    r.phase = "READY";
  
    clearTimer3();
    ui.setRoundsHud(r);
  
    const moreQuestions = hasMoreQuestions();
    const thresholdHit = isThresholdHit();
  
    // jeżeli próg osiągnięty ALBO nie ma pytań -> kończymy flow rund
    if (thresholdHit || !moreQuestions) {
      const canFinal =
        typeof store.canEnterCard === "function" && store.canEnterCard("final");
  
      if (canFinal) {
        store.setFinalActive?.(true);
        store.setActiveCard?.("final");
        ui.showCard?.("final");
        ui.showFinalStep?.("f_start");
        setEndMsg(ROUNDS_MSG.ROUND_TO_FINAL);
        return;
      }
  
      ui.showRoundsStep?.("r_gameEnd");
      ui.setEnabled?.("btnShowGameEnd", true);
      setEndMsg(ROUNDS_MSG.ROUND_LAST);
      return;
    }
  
    // normalnie: są pytania i próg nie trafiony
    setStep("r_roundStart");
    r.lockPlayControls = false;
    setEndMsg(ROUNDS_MSG.ROUND_NEXT);
  }

  function showRevealLeft() {
    const r = store.state.rounds;

    if (!r.answers || !r.answers.length) {
      setRevealMsg(ROUNDS_MSG.REVEAL_NONE);
      return;
    }

    if (!r.revealed) r.revealed = new Set();

    r.phase = "REVEAL";

    updatePlayControls();

    ui.setRoundsHud(r);
    ui.renderRoundAnswers(r.answers, r.revealed);

    setRevealMsg(ROUNDS_MSG.REVEAL_INFO);
  }

  async function revealLeftByOrd(ord) {
    const r = store.state.rounds;
    if (!r.answers || !r.answers.length) return;

    const ans = r.answers.find((a) => a.ord === ord);
    if (!ans) return;

    if (!r.revealed) r.revealed = new Set();
    if (r.revealed.has(ord)) return;

    r.revealed.add(ord);
    ui.renderRoundAnswers(r.answers, r.revealed);
    hostUpdate();

    try {
      const pts = nInt(ans.fixed_points ?? ans.points, 0);
      await display.roundsRevealRow(ord, ans.text, pts);
    } catch (e) {
      console.warn("[rounds] revealLeftByOrd display error", e);
    }

    playSfx("answer_correct");

    const hasHidden = (r.answers || []).some(
      (a) => !r.revealed?.has(a.ord)
    );
    if (!hasHidden) {
      setRevealMsg(ROUNDS_MSG.REVEAL_DONE);
      endRound();
    }
    ui.setRoundsHud(r);
    updatePlayControls();
  }

  function revealDone() {
    setRevealMsg("");
    endRound();
  }

  // === ZAKOŃCZ GRĘ (bez finału) – 3 tryby końca ===

  async function gameEndShow() {
    const locks = (store.state.locks = store.state.locks || {});
    if (locks.gameEnded) return;
    locks.gameEnded = true;
  
    ui.setEnabled?.("btnShowGameEnd", false);
  
    try {
      const r = store.state.rounds || {};
      const totals = r.totals || { A: 0, B: 0 };
      const a = nInt(totals.A, 0);
      const b = nInt(totals.B, 0);
  
      const mode = getEndScreenMode();
      const isDraw = a === b;
      const winnerTeam = isDraw ? null : (a > b ? "A" : "B");
      const winnerPts = isDraw ? 0 : Math.max(a, b);
  
      const msg = isDraw
        ? ROUNDS_MSG.GAME_END_DRAW(a, b)
        : ROUNDS_MSG.GAME_END_WIN(winnerTeam, winnerPts);
  
      ui.setMsg("msgGameEnd", msg);
  
      // 1) EKRAN NAJPIERW (logo / punkty)
      const showEndScreen = async () => {
        try {
          await display.roundsHideBoard?.();
        } catch {}
  
        try {
          if (isDraw) {
            await display.showLogo?.();
            return;
          }
  
          if (mode === "logo" || !display.showWin) {
            await display.showLogo?.();
            return;
          }
  
          // mode: "points" (albo "money" traktujemy jak points bez finału)
          await display.showWin?.(winnerPts);
        } catch {}
      };
  
      await showEndScreen();
  
      // 2) DŹWIĘK POTEM
      if (!introMixer) {
        playSfx("show_intro");
        try {
          const dur = await getSfxDuration("show_intro");
          if (dur > 0) await new Promise((res) => setTimeout(res, dur * 1000));
        } catch {}
      } else {
        introMixer.stop();
  
        await new Promise((resolve) => {
          const off = introMixer.onTime((current, duration) => {
            const d = duration || 0;
            if (d > 0 && current >= d - 0.05) {
              off();
              resolve();
            }
          });
  
          introMixer.play("show_intro");
        });
      }
    } catch (e) {
      console.warn("[rounds] gameEndShow error", e);
      store.state.locks.gameEnded = false;
      ui.setEnabled?.("btnShowGameEnd", true);
    }
  }


  // === BOOT / ODTWORZENIE STANU ===

  function bootIfNeeded() {
    ensureRoundsState();
    const r = store.state.rounds;

    ui.setRoundsHud(r);
    ui.showRoundsStep(r.step || "r_ready");

    if (r.question && Array.isArray(r.answers) && r.answers.length > 0) {
      ui.setRoundQuestion(r.question.text || "—");
      ui.renderRoundAnswers?.(r.answers, r.revealed);
    }

    updatePlayControls();
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

    gameEndShow,
  };
}
