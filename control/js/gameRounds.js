import { playSfx, createSfxMixer } from "/familiada/js/core/sfx.js";

function nInt(v, d = 0) {
  const x = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : d;
}

export function createRounds({ ui, store, devices, display, loadQuestions, loadAnswers }) {
  let raf = null;
  let timerRAF = null;
  const introMixer = createSfxMixer?.();

  function setStep(step) {
    store.state.rounds.step = step;
    ui.showRoundsStep(step);
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

  // DODAJ TO:
  function refresh() {
    const r = store.state.rounds;
    ui.setRoundsHud(r);
    ui.showRoundsStep(r.step || "r_ready");
  }
  
  // === Główne stany gry ===

  async function stateGameReady() {
    const r = store.state.rounds;
  
    r.phase = "READY";
    r.step = "r_intro";
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.passUsed = false;
    r.stealWon = false;
    r.question = null;
    r.answers = [];
    r.revealed = new Set();
    r.duel = { enabled: false, lastPressed: null };
    r.timer3 = { running: false, endsAt: 0 };
    r.steal = { active: false, used: false };
    r.allowPass = false;
  
    // DISPLAY: APP GAME + BLANK + czyścimy tryplety
    const { teamA, teamB } = store.state.teams;
    await display.stateGameReady(teamA || "", teamB || "");
  
    // blokada ustawień
    store.state.locks.gameStarted = true;
  
    ui.setMsg("msgRounds", "Ustawiono stan: gra gotowa. Ekran czeka na start gry.");
  
    // --- TU zamiast refresh() ---
    ui.setRoundsHud(store.state.rounds);
    ui.showRoundsStep("r_intro");
  }

  async function stateStartGameIntro() {
    const { teamA, teamB } = store.state.teams;

    setStep("r_intro");
    ui.setRoundsHud(store.state.rounds);

    // przygotuj wyświetlacz (tryb gry, blank, zera / puste triplety, nazwy drużyn – BEZ logo)
    await display.stateIntroLogo(teamA, teamB);

    ui.setMsg("msgRoundsIntro", "Intro uruchomione.");

    // Intro: gra dwa razy, logo pojawia się w 14 sekundzie pierwszego odtworzenia.
    if (!introMixer) {
      // Proste przybliżenie bez mierzenia długości pliku
      playSfx("show_intro");

      // logo po 14s
      setTimeout(() => {
        display.showLogo().catch(() => {});
      }, 14000);

      // drugi raz po ~15s od startu
      setTimeout(() => {
        playSfx("show_intro");
      }, 15000);

      // całość ok. 30s
      await new Promise((res) => setTimeout(res, 30000));
    } else {
      introMixer.stop();
      await new Promise((resolve) => {
        let playCount = 0;
        let logoShown = false;

        const stop = introMixer.onTime((current, duration) => {
          const d = duration || 0;

          // logo w 14 sekundzie pierwszego intra
          if (!logoShown && current >= 14) {
            logoShown = true;
            display.showLogo().catch(() => {});
          }

          if (d > 0 && current >= d - 0.05) {
            playCount += 1;
            if (playCount === 1) {
              // koniec pierwszej pętli -> start drugiej
              playSfx("show_intro");
            } else {
              stop();
              resolve();
            }
          }
        });

        // start pierwszej pętli
        playSfx("show_intro");
      });
    }

    // Po dwóch pętlach intra przechodzimy do ekranu startu rundy
    setStep("r_roundStart");
    ui.setMsg("msgRoundsIntro", "Intro zakończone. Możesz rozpocząć rundę.");
    ui.setRoundsHud(store.state.rounds);
  }

  async function startRound() {
    await loadRoundsIfNeeded();
    const r = store.state.rounds;
    const obj = currentRoundObj();
    if (!obj) {
      ui.setMsg("msgRounds", "Brak zdefiniowanych rund.");
      return;
    }

    r.phase = "ROUND_ACTIVE";
    r.step = "r_duel";
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
    r.answers = obj.answers.slice().sort((a, b) => (a.ord || 0) - (b.ord || 0));
    r.duel.enabled = false;
    r.duel.lastPressed = null;

    clearTimer3();

    ui.setRoundQuestion(obj.text || "—");
    ui.renderRoundAnswers(r.answers, r.revealed);

    await display.roundsBoardPlaceholders(); // pusta plansza rundy
    await display.roundsSetSum(0);
    await display.roundsSetX("A", 0);
    await display.roundsSetX("B", 0);
    await display.setIndicator(null);

    ui.showRoundsStep("r_roundStart");
    ui.setMsg("msgRounds", `Runda ${r.roundNo} przygotowana.`);
    ui.setRoundsHud(r);
  }

  function backTo(step) {
    setStep(step);
    ui.setRoundsHud(store.state.rounds);
  }

  // === Buzzer / pojedynek ===

  function enableBuzzerDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;
    ui.setMsg("msgDuel", "Pojedynek: czekam na przycisk.");
    ui.setRoundsHud(r);

    devices.enableBuzzerForDuel();
  }

  function retryDuel() {
    const r = store.state.rounds;
    r.duel.enabled = true;
    r.duel.lastPressed = null;
    ui.setMsg("msgDuel", "Powtórka pojedynku.");
    ui.setRoundsHud(r);

    devices.enableBuzzerForDuel();
  }

  function acceptBuzz(team) {
    const r = store.state.rounds;
    if (!r.duel.enabled) return;
    r.duel.enabled = false;
    r.controlTeam = team;
    ui.setMsg("msgDuel", `Pierwsza odpowiedź: drużyna ${team}.`);
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
  
    // Jeżeli kradzież jest aktywna, ale jeszcze nie rozstrzygnięta – nie kończymy
    if (r.steal.active && !r.steal.used) {
      ui.setMsg("msgRounds", "Najpierw rozstrzygnij kradzież.");
      return;
    }
  
    // Domyślnie bank dostaje drużyna z kontrolą
    let winner = r.controlTeam;
  
    // (na razie zakładamy, że jeśli kradzież była, to rozstrzygnięcie
    //  kto wygrał, robisz w innym miejscu – tu tylko przyznajemy bank)
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
