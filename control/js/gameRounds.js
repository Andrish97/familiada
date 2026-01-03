import { playSfx, createSfxMixer, getSfxDuration } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export function createRounds({ ui, store, devices, display, loadQuestions, loadAnswers }) {
  let raf = null;
  let timerRAF = null;
  const introMixer = createSfxMixer?.();

  function getRoundMultiplier(roundNo) {
    const n = nInt(roundNo, 1);
    // zgodnie z opisem: pierwsze pytania normalnie,
    // potem podwójne, po czwartym – potrójne
    if (n <= 3) return 1;
    if (n === 4) return 2;
    return 3;
  }

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

        // po przekroczeniu czasu:
        // - tracimy możliwość oddania pytania
        // - liczymy to jak normalne pudło (X)
        r.allowPass = false;
        addX(); // async, nie czekamy – X + dźwięk

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
      if (!ans || !ans.length) continue; // tylko pytania z odpowiedziami
      withAnswers.push({ ...q, answers: ans });
    }
  
    // ID pytań zarezerwowanych do finału – nie mogą trafić do rund
    const finalPicked = Array.isArray(store.state.final?.picked)
      ? new Set(store.state.final.picked)
      : null;
  
    let pool = withAnswers;
  
    if (finalPicked && finalPicked.size > 0) {
      pool = withAnswers.filter((q) => !finalPicked.has(q.id));
    }
  
    // losowa kolejność pytań do rund (Fisher–Yates)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  
    // NIE przycinamy do 6 – rund może być tyle, ile pytań
    const rounds = pool.map((q, idx) => ({
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

    const totals = r.totals || { A: 0, B: 0 };
    const ptsA = nInt(totals.A, 0);
    const ptsB = nInt(totals.B, 0);
    const FINAL_MIN_POINTS = 300; // później idzie do ustawień zaawansowanych
  
    if (ptsA >= FINAL_MIN_POINTS || ptsB >= FINAL_MIN_POINTS) {
      ui.setMsg(
        "msgRoundsRoundStart",
        `Próg ${FINAL_MIN_POINTS} pkt został już osiągnięty. Nie można zaczynać kolejnej rundy.`
      );
      ui.setRoundsHud(r);
      return;
    }
    
    const obj = currentRoundObj();
  
    if (!obj) {
      const totals = r.totals || { A: 0, B: 0 };
      const ptsA = nInt(totals.A, 0);
      const ptsB = nInt(totals.B, 0);
  
      let msg;
      if (ptsA > ptsB) {
        msg = `Brak kolejnych pytań. Wygrywa drużyna A (${ptsA} : ${ptsB}).`;
      } else if (ptsB > ptsA) {
        msg = `Brak kolejnych pytań. Wygrywa drużyna B (${ptsB} : ${ptsA}).`;
      } else {
        msg = `Brak kolejnych pytań. Remis (${ptsA} : ${ptsB}).`;
      }
  
      ui.setMsg("msgRoundsRoundStart", msg);
      ui.setRoundsHud(r);
  
      try {
        await display.setIndicator(null);
        await display.showLogo?.();
      } catch {}
  
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
  
      await display.roundsSetX("A", 0);
      await display.roundsSetX("B", 0);
      await display.setIndicator("OFF");
  
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
    enableBuzzerDuel()
  }


  // === Buzzer / pojedynek ===

  function enableBuzzerDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;

    ui.setMsg("msgDuel", "Pojedynek: czekam na przycisk.");
    ui.setRoundsHud(r);

    // przygotuj przycisk
    ui.setEnabled("btnBuzzAcceptA", false);
    ui.setEnabled("btnBuzzAcceptB", false);
    ui.setEnabled("btnBuzzRetry", false);

    // BUZZER: włącz tryb aktywny
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

    // fizyczny reset przycisku – znowu można naciskać
    devices.sendBuzzerCmd("RESET").catch(() => {});
  }


  // to jest wołane, gdy CONTROL dostanie BUZZER_EVT z Supabase
  function handleBuzzerClick(team) {
    const r = store.state.rounds;

    // 1) ZAWSZE dźwięk po kliknięciu (z control, nie z urządzenia)
    playSfx("buzzer_press");

    // 2) Logika gry tylko, jeśli pojedynek jest aktywny
    if (!r.duel.enabled) return;

    // tylko pierwsze kliknięcie ustala "kto był pierwszy"
    if (!r.duel.lastPressed) {
      r.duel.lastPressed = team;

      ui.setMsg(
        "msgDuel",
        `Pierwszy klik: drużyna ${team}. Zatwierdź A/B albo powtórz pojedynek.`
      );
      ui.setRoundsHud(r);

      // AKTYWNA tylko właściwa strona:
      ui.setEnabled("btnBuzzAcceptA", team === "A");
      ui.setEnabled("btnBuzzAcceptB", team === "B");
      ui.setEnabled("btnBuzzRetry", true);
    }

    // UWAGA: NIE wysyłamy tutaj RESET/ON.
    // Buzzer fizycznie zostaje "zablokowany" na A/B,
    // dopóki operator nie kliknie „Ponów pojedynek”.
  }

  function acceptBuzz(team) {
    const r = store.state.rounds;
    if (!r.duel.enabled) return;

    r.duel.enabled = false;
    r.controlTeam = team;

    // buzzer zostaje w stanie PUSHED – nie wysyłamy OFF/RESET
    // nowe kliknięcia i tak nie są możliwe po stronie urządzenia

    // przechodzimy do kroku „Pytanie”
    setStep("r_play");

    ui.setMsg("msgDuel", `Pierwsza odpowiedź: drużyna ${team}.`);
    ui.setMsg("msgRoundsPlay", `Kontrolę ma drużyna ${team}.`);
    ui.setRoundsHud(r);

    // odblokowanie przycisków gry
    ui.setEnabled("btnPassQuestion", true);
    ui.setEnabled("btnStartTimer3", true);
    ui.setEnabled("btnAddX", true);
    ui.setEnabled("btnGoSteal", true);
    ui.setEnabled("btnGoEndRound", true);

    // przyciski z kroku pojedynku nie są już potrzebne
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
        "Nie możesz już oddać pytania – ta decyzja jest tylko po pierwszej trafionej odpowiedzi."
      );
      return;
    }
    if (!r.controlTeam) {
      ui.setMsg("msgRounds", "Brak drużyny z kontrolą.");
      return;
    }

    const other = r.controlTeam === "A" ? "B" : "A";
    r.controlTeam = other;
    r.allowPass = false; // decyzja zapadła – dalej już grają oni

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

    // LOGIKA “GRAMY / ODDAJEMY”:
    // - po ODWIECIE pierwszej poprawnej odpowiedzi okno jest aktywne,
    // - jeśli odsłonimy więcej niż jedną odpowiedź -> okno się zamyka.
    if (r.revealed.size === 1) {
      r.allowPass = true;
    } else {
      r.allowPass = false;
    }

    ui.setRoundsHud(r);

    // display: linijka + suma banku
    await display.roundsRevealRow(ord, ans.text, pts);
    await display.roundsSetSum(r.bankPts);

    playSfx("answer_correct");
  }

  async function addX() {
    const r = store.state.rounds;
    if (!r.controlTeam) {
      ui.setMsg("msgRounds", "Najpierw drużyna musi mieć kontrolę.");
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

    // jeśli kradzież jest aktywna i nierozstrzygnięta – najpierw ją dokończ
    if (r.steal && r.steal.active && !r.steal.used) {
      ui.setMsg("msgRounds", "Najpierw rozstrzygnij kradzież (trafiona / nietrafiona).");
      return;
    }

    // domyślnie bank idzie do drużyny z kontrolą
    let winner = r.controlTeam;

    // jeśli kradzież była i się udała – bank idzie do przeciwników
    if (r.steal && r.steal.used && r.stealWon) {
      winner = r.controlTeam === "A" ? "B" : "A";
    }

    r.totals[winner] = nInt(r.totals[winner], 0) + bank;
    ui.setRoundsHud(r);

    try {
      await display.roundsSetTotals(r.totals);
      if (display.setTotalsTriplets) {
        await display.setTotalsTriplets(r.totals);
      }
      if (display.setBankTriplet) {
        await display.setBankTriplet(0);
      }
    } catch (e) {
      console.warn("[rounds] update totals failed", e);
    }

    // ZAWSZE: dźwięk końca rundy
    playSfx("round_transition");

    ui.setMsg("msgRounds", `Koniec rundy. Bank ${bank} pkt dla drużyny ${winner}.`);

    // Przejście na kartę “Koniec rundy” – stąd można przejść dalej,
    // a osobna karta/etap do odsłaniania reszty odpowiedzi
    setStep("r_end");
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
    r.steal.active = false;
    r.steal.used = false;
    r.allowPass = false;
  
    clearTimer3();
    ui.setRoundsHud(r);
  
    setStep("r_ready");
    ui.setMsg("msgRounds", "Przejdź do kolejnej rundy.");
  }
  
    function showRevealLeft() {
    const r = store.state.rounds;

    // jeśli nie ma pytań/odpowiedzi – nic do odsłaniania
    if (!r.answers || !r.answers.length) {
      setStep("r_reveal");
      ui.setMsg("msgRoundsReveal", "Brak odpowiedzi do odsłonięcia.");
      return;
    }

    if (!r.revealed) r.revealed = new Set();

    setStep("r_reveal");
    ui.renderRoundRevealAnswers(r.answers, r.revealed);
    ui.setMsg("msgRoundsReveal", "Klikaj brakujące odpowiedzi, żeby pokazać je na wyświetlaczu.");
  }

  async function revealLeftByOrd(ord) {
    const r = store.state.rounds;
    if (!r.answers || !r.answers.length) return;

    const ans = r.answers.find((a) => a.ord === ord);
    if (!ans) return;

    if (!r.revealed) r.revealed = new Set();
    if (r.revealed.has(ord)) return; // już odsłonięta w trakcie rundy

    r.revealed.add(ord);
    ui.renderRoundRevealAnswers(r.answers, r.revealed);

    try {
      const pts = nInt(ans.fixed_points, 0);
      // Display: pokaż odpowiedź i punkty, ale NIE ruszaj banku ani sum
      await display.roundsRevealRow(ord, ans.text, pts);
      // celowo: brak roundsSetSum, brak modyfikacji r.bankPts / totals
    } catch (e) {
      console.warn("[rounds] revealLeftByOrd failed", e);
    }
  }

  function revealDone() {
    // Wracamy do ekranu końca rundy (tam nadal jest przycisk "Zakończ rundę")
    setStep("r_end");
    ui.setMsg("msgRoundsReveal", "");
    ui.setRoundsHud(store.state.rounds);
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
    goEndRound,
    endRound,

    showRevealLeft,
    revealLeftByOrd,
    revealDone,
  };
}
