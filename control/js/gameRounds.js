import { playSfx, createSfxMixer, getSfxDuration } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export function createRounds({ ui, store, devices, display, loadQuestions, loadAnswers }) {
  let raf = null;
  let timerRAF = null;
  const introMixer = createSfxMixer?.();

  function setStep(step) {
    const r = store.state.rounds;
    r.step = step;
    ui.showRoundsStep(step);

    // "Rozpocznij rundę" ma być aktywne TYLKO gdy intro się skończyło
    // i jesteśmy na kroku r_roundStart
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

  // === Załadowanie pytań/odpowiedzi do rund ===

  async function pickQuestionsForRounds(gameId) {
    const all = await loadQuestions(gameId);
    const withAnswers = [];

    for (const q of all) {
      const ans = await loadAnswers(q.id);
      if (!ans || !ans.length) continue;
      withAnswers.push({ ...q, answers: ans });
    }

    // prosto: bierzemy pierwsze 6 z odpowiedziami
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
    const r = store.state.rounds;
    if (!r._loadedRounds) r._loadedRounds = [];
  }

  async function loadRoundsIfNeeded() {
    ensureRoundsState();
    const r = store.state.rounds;

    if (!r._loadedRounds || !r._loadedRounds.length) {
      const rounds = await pickQuestionsForRounds(store.state.gameId || store.state.id || "");
      r._loadedRounds = rounds;
      r.roundNo = 1;
      emit();
    }
  }

  function currentRoundObj() {
    const r = store.state.rounds;
    if (!r._loadedRounds || !r._loadedRounds.length) return null;
    return r._loadedRounds[r.roundNo - 1] || null;
  }

  function emit() {
    try {
      for (const fn of (store._roundsListeners || [])) fn(store.state.rounds);
    } catch {}
  }

  // === Główne stany gry ===

  async function stateGameReady() {
    // przycisk "Gra gotowa"
    const { teamA, teamB } = store.state.teams;
    ensureRoundsState();
  
    // faza READY – przygotowanie ekranu gry
    store.state.rounds.phase = "READY";
    setStep("r_ready");
  
    // ustawiamy stan na wyświetlaczu (APP GAME, BLANK, LONG1/LONG2 itd.)
    await display.stateGameReady(teamA, teamB);
  
    // po ustawieniu wszystkiego, przechodzimy do kolejnego kroku: intro gry
    ui.setMsg("msgRoundsIntro", "Gra gotowa. Ekran oczekuje na start.");
    ui.setRoundsHud(store.state.rounds);
  
    // tu jest kluczowa zmiana: automatycznie przechodzimy na krok "Rozpocznij grę"
    setStep("r_intro");
  }

  async function stateStartGameIntro() {
    const { teamA, teamB } = store.state.teams;
    ensureRoundsState();
    const r = store.state.rounds;

    // jeśli intro już było – drugi raz nic nie rób
    if (r._introPlayed) {
      ui.setMsg("msgRoundsIntro", "Intro gry zostało już odegrane.");
      return;
    }
    r._introPlayed = true;

    setStep("r_intro");
    ui.setRoundsHud(r);

    // zablokuj przycisk "Rozpocznij grę", żeby nie można go było klikać 10 razy
    ui.setEnabled("btnStartShowIntro", false);

    // przygotuj ekran gry (APP GAME, BLANK, LONG1/LONG2 – bez logo)
    await display.stateIntroLogo(teamA, teamB);

    ui.setMsg("msgRoundsIntro", "Intro uruchomione.");

    if (!introMixer) {
      // fallback bez miksera: korzystamy z prawdziwej długości audio jeśli się da
      playSfx("show_intro");

      // logo po 14 sekundach (to jest wymóg gry)
      setTimeout(() => {
        display.showLogo().catch(() => {});
      }, 14000);

      try {
        const dur = await getSfxDuration("show_intro"); // sekundy
        if (dur > 0) {
          await new Promise((res) => setTimeout(res, dur * 1000));
        }
      } catch {
        // jeśli nie umiemy odczytać długości, po prostu nie blokujemy dłużej
      }
    } else {
      // precyzyjna wersja z mikserem – intro tylko raz
      introMixer.stop();

      await new Promise((resolve) => {
        let logoShown = false;

        const off = introMixer.onTime((current, duration) => {
          const d = duration || 0;

          // LOGO dokładnie przy 14 sekundzie
          if (!logoShown && current >= 14) {
            logoShown = true;
            display.showLogo().catch(() => {});
          }

          // koniec intra
          if (d > 0 && current >= d - 0.05) {
            off();
            resolve();
          }
        });

        introMixer.play("show_intro");
      });
    }

    // intro skończone → dopiero teraz możemy przejść do "Rozpocznij rundę"
    setStep("r_roundStart");
    ui.setMsg("msgRoundsIntro", "Intro zakończone. Możesz rozpocząć rundę.");
    ui.setRoundsHud(store.state.rounds);
  }
  
  async function startRound() {
    await loadRoundsIfNeeded();
    ensureRoundsState();
  
    const r = store.state.rounds;
    const obj = currentRoundObj();
  
    if (!obj) {
      ui.setMsg("msgRoundsRoundStart", "Brak zdefiniowanych rund dla tej gry.");
      return;
    }
  
    // reset runtime dla rundy
    r.phase = "ROUND_ACTIVE";
    r.passUsed = false;
    r.steal.active = false;
    r.steal.used = false;
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
  
    r.duel.enabled = false;
    r.duel.lastPressed = null;
  
    clearTimer3();
  
    // ile wierszy pustej planszy – tyle ile odpowiedzi (max 6)
    const rows = Math.max(1, Math.min(6, r.answers.length || 6));
  
    // pytanie + odpowiedzi w Control
    ui.setRoundQuestion(obj.text || "—");
    ui.renderRoundAnswers(r.answers, r.revealed);
    ui.setMsg("msgRoundsRoundStart", "Startuję rundę – leci dźwięk przejścia.");
    ui.setRoundsHud(r);
  
    // blokujemy "Rozpocznij rundę" na czas dźwięku
    ui.setEnabled("btnStartRound", false);
  
    // === DŹWIĘK round_transition ===
    let dur = 0;
    try {
      dur = await getSfxDuration("round_transition");
    } catch (e) {
      console.warn("getSfxDuration(round_transition) error", e);
    }
  
    const waitMs =
      typeof dur === "number" && dur > 0
        ? Math.max(0, (dur - 0.05) * 1000) // mały margines
        : 3000; // awaryjnie ~3s
  
    playSfx("round_transition");
  
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  
    // === PUSTA PLANSZA RUND – po zakończeniu dźwięku ===
    try {
      if (!r._boardShown) {
        // PIERWSZA RUNDA:
        // najpierw zjeżdża logo
        if (display.hideLogo) {
          await display.hideLogo();
        }
  
        // potem wjeżdża pierwsza plansza rund bez RBATCH ANIMOUT
        if (display.roundsBoardPlaceholders) {
          await display.roundsBoardPlaceholders(rows);
        }
  
        r._boardShown = true;
      } else {
        // KOLEJNE RUNDY:
        // RBATCH ANIMOUT edge down 1000 + nowa pustka
        if (display.roundsBoardPlaceholdersNewRound) {
          await display.roundsBoardPlaceholdersNewRound(rows);
        } else if (display.roundsBoardPlaceholders) {
          await display.roundsBoardPlaceholders(rows);
        }
      }
  
      await display.roundsSetSum(0);
      await display.roundsSetX("A", 0);
      await display.roundsSetX("B", 0);
      await display.setIndicator(null);
  
      if (display.setBankTriplet) {
        await display.setBankTriplet(0);
      }
      if (display.setTotalsTriplets) {
        await display.setTotalsTriplets(r.totals || { A: 0, B: 0 });
      }
    } catch (e) {
      console.error("display setup for round failed", e);
    }
  
    // === Pytanie dla prowadzącego (HOST) ===
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
  
    // === Przejście do karty "Pojedynek" w Control ===
    setStep("r_duel");
    ui.setMsg("msgRounds", `Runda ${r.roundNo} – pojedynek.`);
    ui.setRoundsHud(r);
  }


  // === Buzzer / pojedynek ===

  function enableBuzzerDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;
  
    ui.setMsg("msgDuel", "Pojedynek: czekam na przycisk.");
    ui.setRoundsHud(r);
  
    try {
      // RESET w buzzer.js = ustaw OFF→ON i zapis stanu
      devices.sendBuzzerCmd("RESET");
    } catch (e) {
      console.warn("[rounds] sendBuzzerCmd RESET failed", e);
    }
  }
  
  function retryDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;
  
    ui.setMsg("msgDuel", "Powtórka pojedynku.");
    ui.setRoundsHud(r);
  
    try {
      devices.sendBuzzerCmd("RESET");
    } catch (e) {
      console.warn("[rounds] sendBuzzerCmd RESET failed", e);
    }
  }

  function acceptBuzz(team) {
    const r = store.state.rounds;
    if (!r.duel.enabled) return;
    r.duel.enabled = false;
    r.controlTeam = team;
    ui.setMsg("msgRoundsDuel", `Pierwsza odpowiedź: drużyna ${team}.`);
    ui.setRoundsHud(r);
  }

  // === Gra właściwa w rundzie ===

  function passQuestion() {
    const r = store.state.rounds;
    if (!r.allowPass) {
      ui.setMsg("msgRounds", "Nie możesz jeszcze oddać pytania (najpierw poprawna odpowiedź).");
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
  }

  function startTimer3() {
    startTimer3Internal();
  }

  async function revealAnswerByOrd(ord) {
    const r = store.state.rounds;
    const ans = r.answers.find((a) => a.ord === ord);
    if (!ans) return;

    if (!r.revealed) r.revealed = new Set();
    if (r.revealed.has(ord)) return;

    r.revealed.add(ord);
    ui.renderRoundAnswers(r.answers, r.revealed);

    const pts = nInt(ans.fixed_points, 0);
    r.bankPts = nInt(r.bankPts, 0) + pts;
    ui.setRoundsHud(r);

    await display.roundsRevealRow(ord, ans.text, pts);
    await display.roundsSetSum(r.bankPts);

    // po pierwszej poprawnej odpowiedzi można już oddać pytanie
    if (!r.allowPass) r.allowPass = true;

    playSfx("answer_correct");
  }

  async function addX() {
    const r = store.state.rounds;
    if (!r.controlTeam) {
      ui.setMsg("msgRounds", "Najpierw drużyna musi mieć kontrolę.");
      return;
    }

    const key = r.controlTeam === "A" ? "xA" : "xB";
    r[key] = (r[key] || 0) + 1;
    if (r[key] > 3) r[key] = 3;

    await display.roundsSetX(r.controlTeam, r[key]);
    ui.setRoundsHud(r);

    playSfx("answer_wrong");
  }

  // === Kradzież / koniec rundy ===

  function goSteal() {
    const r = store.state.rounds;
    r.steal.active = true;
    r.steal.used = false;
    ui.setMsg("msgSteal", "Kradzież: druga drużyna odpowiada.");
    ui.setRoundsHud(r);

    display.setIndicator(r.controlTeam === "A" ? "B" : "A");
  }

  function stealMiss() {
    const r = store.state.rounds;
    if (!r.steal.active || r.steal.used) return;
    r.steal.used = true;
    r.steal.active = false;
    r.stealWon = false;

    ui.setMsg("msgSteal", "Kradzież nieudana.");
    ui.setRoundsHud(r);

    display.setIndicator(null);
  }

  async function goEndRound() {
    const r = store.state.rounds;

    const bank = nInt(r.bankPts, 0);
    if (!r.controlTeam) {
      ui.setMsg("msgRounds", "Brak drużyny z kontrolą – nie mogę przyznać banku.");
      return;
    }

    // Jeżeli była kradzież i się udała – bank idzie do drużyny kradnącej (czyli odwrotnej)
    let winner = r.controlTeam;
    if (r.steal.active && !r.steal.used) {
      // jeszcze nie rozstrzygnięta – nie kończymy
      ui.setMsg("msgRounds", "Najpierw rozstrzygnij kradzież.");
      return;
    }
    if (r.stealUsed && r.stealWon) {
      winner = r.controlTeam === "A" ? "B" : "A";
    }

    r.totals[winner] = nInt(r.totals[winner], 0) + bank;

    await display.roundsSetTotals(r.totals);
    ui.setRoundsHud(r);

    ui.setMsg("msgRounds", `Koniec rundy. Bank ${bank} pkt dla drużyny ${winner}.`);
    setStep("r_end");
  }

  function endRound() {
    const r = store.state.rounds;
    r.roundNo = nInt(r.roundNo, 1) + 1;
    if (r.roundNo > 6) r.roundNo = 6; // max 6 rund
    r.question = null;
    r.answers = [];
    r.revealed = new Set();
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.controlTeam = null;
    r.steal.active = false;
    r.steal.used = false;
    r.allowPass = false;

    clearTimer3();
    ui.setRoundsHud(r);

    setStep("r_ready");
    ui.setMsg("msgRounds", "Przejdź do kolejnej rundy.");
  }

  function bootIfNeeded() {
    ensureRoundsState();
    ui.setRoundsHud(store.state.rounds);
    ui.showRoundsStep(store.state.rounds.step || "r_ready");
  }

  // subskrypcja (opcjonalnie)
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
