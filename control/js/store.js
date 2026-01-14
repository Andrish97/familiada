export function createStore(gameId) {
  const KEY = `familiada:control:v5:${gameId}`;
  const listeners = new Set();
  const FINAL_MIN_POINTS = 300; // domyślny próg do finału

  const DEFAULT_ADVANCED = {
    // mnożniki dla kolejnych rund; ostatnia wartość powtarza się dla dalszych rund
    roundMultipliers: [1, 1, 1, 2, 3],
    // próg wejścia do finału (ktoś musi tyle zdobyć w sumie)
    finalMinPoints: 300,
    // cel w finale (domyślne 200)
    finalTarget: 200,
    // czy na końcu gry wyświetlamy ekran „wygrana” (true) czy samo logo (false)
    endScreenMode: "logo", // "logo" | "points" | "money"
    
  };

  function makeDefaultState() {
    return {
      gameId,
      activeCard: "devices",
  
      steps: {
        devices: "devices_display",
        setup: "setup_names",
      },
  
      completed: {
        devices: false,
        setup: false,
      },
  
      locks: {
        gameStarted: false,
        finalActive: false,
      },
  
      teams: {
        teamA: "",
        teamB: "",
      },
  
      hasFinal: null,
  
      final: {
        picked: [],
        confirmed: false,
        runtime: {
          phase: "IDLE",
          sum: 0,
          winSide: "A",
          timer: { running: false, secLeft: 0, phase: "P1" },
          mapIndex: 0,
          p1List: null,
          p2List: null,
          mapP1: null,
          mapP2: null,
          reached200: false,
        },
        step: "f_start",
      },
  
      flags: {
        displayOnline: false,
        hostOnline: false,
        buzzerOnline: false,
        audioUnlocked: false,
        qrOnDisplay: false,
      },
  
      rounds: {
        phase: "IDLE",
        roundNo: 1,
        controlTeam: null,
        bankPts: 0,
        xA: 0,
        xB: 0,
        totals: { A: 0, B: 0 },
        step: "r_ready",
        passUsed: false,
        stealWon: false,
  
        question: null,
        answers: [],
        revealed: new Set(),
  
        duel: {
          enabled: false,
          lastPressed: null,
        },
  
        timer3: {
          running: false,
          endsAt: 0,
        },
  
        steal: {
          active: false,
          used: false,
        },
  
        allowPass: false,
      },
  
      advanced: { ...DEFAULT_ADVANCED },
    };
  }
  
  const state = makeDefaultState();

  function emit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(serialize(state)));
    } catch {}
    for (const fn of listeners) fn(state);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function serialize(s) {
    const out = structuredClone(s);
    out.rounds.revealed = Array.from(s.rounds.revealed);
    return out;
  }

  // Stare isFinalActive – zostawione tylko jako pomocnicze (gdyby coś jeszcze wołało po kroku)
  function isFinalActiveLegacy() {
    const step = state.final?.step || "f_start";
    return step !== "f_start";
  }

  function teamsOk() {
    return state.teams.teamA.trim().length > 0 && state.teams.teamB.trim().length > 0;
  }

  function canFinishSetup() {
    if (!teamsOk()) return false;
    if (state.hasFinal === false) return true;
    if (state.hasFinal === true) {
      return state.final.confirmed === true && state.final.picked.length === 5;
    }
    return false;
  }

  function allDevicesOnline() {
    return state.flags.displayOnline && state.flags.hostOnline && state.flags.buzzerOnline;
  }

  function canStartRounds() {
    return allDevicesOnline() && state.flags.audioUnlocked && canFinishSetup();
  }

  // Właściwa funkcja – logika przełączona na locka
  function isFinalActive() {
    return state.locks.finalActive === true;
  }

  function canEnterCard(card) {
    const totals = state.rounds?.totals || { A: 0, B: 0 };
    const adv = state.advanced || {};
    const threshold =
      typeof adv.finalMinPoints === "number" ? adv.finalMinPoints : FINAL_MIN_POINTS;
    const hasFinalPoints =
      (totals.A || 0) >= threshold || (totals.B || 0) >= threshold;

    // URZĄDZENIA – dostępne tylko do momentu "Gra gotowa"
    if (card === "devices") {
      return !state.locks.gameStarted;
    }

    // USTAWIENIA – po urządzeniach, też tylko do "Gra gotowa"
    if (card === "setup") {
      return state.completed.devices && !state.locks.gameStarted;
    }

    // ROUNDS – dostępne po Urządzeniach, ale tylko dopóki finał się nie zaczął
    if (card === "rounds") {
      return state.completed.devices && !state.locks.finalActive;
    }


    // FINAŁ – tylko jeśli:
    // - gra ma finał,
    // - ustawienia są poprawne (w tym wybrane pytania finału),
    // - któraś drużyna osiągnęła wymagany próg punktów
    if (card === "final") {
      return state.hasFinal === true && canFinishSetup() && hasFinalPoints;
    }

    return false;
  }

  function setActiveCard(card) {
    if (!canEnterCard(card)) return;
    state.activeCard = card;
    emit();
  }

  function setDevicesStep(step) {
    state.steps.devices = step;
    emit();
  }

  function setSetupStep(step) {
    state.steps.setup = step;
    emit();
  }

  function completeCard(card) {
    state.completed[card] = true;
    emit();
  }

  function setTeams(a, b) {
    state.teams.teamA = String(a ?? "");
    state.teams.teamB = String(b ?? "");
    emit();
  }

  function setGameStarted(v) {
    state.locks.gameStarted = !!v;
    emit();
  }

  function setHasFinal(v) {
    state.hasFinal = v;
    if (v === false) {
      state.final.picked = [];
      state.final.confirmed = false;
    }
    emit();
  }

  function setFinalActive(v) {
    state.locks.finalActive = !!v;
    emit();
  }

  function confirmFinalQuestions(ids) {
    state.final.picked = Array.isArray(ids) ? ids.slice(0, 5) : [];
    state.final.confirmed = true;
    emit();
  }

  function unconfirmFinalQuestions() {
    state.final.confirmed = false;
    emit();
  }

  function setOnlineFlags({ display, host, buzzer }) {
    state.flags.displayOnline = !!display;
    state.flags.hostOnline = !!host;
    state.flags.buzzerOnline = !!buzzer;
    emit();
  }

  function setAudioUnlocked(v) {
    state.flags.audioUnlocked = !!v;
    emit();
  }

  function setQrOnDisplay(v) {
    state.flags.qrOnDisplay = !!v;
    emit();
  }

  // ---- obsługa typu wejścia na stronę (odświeżenie vs. nowa nawigacja) ----

  function hydrate() {
    // Nie przywracamy progresu — nigdy.
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }

  function setAdvanced(partial) {
    const cur = state.advanced || { ...DEFAULT_ADVANCED };
    const next = { ...cur };

    if (partial.roundMultipliers && Array.isArray(partial.roundMultipliers)) {
      next.roundMultipliers = partial.roundMultipliers
        .map((x) => {
          const n = Number.parseInt(String(x), 10);
          return Number.isFinite(n) && n > 0 ? n : 1;
        });
      if (!next.roundMultipliers.length) {
        next.roundMultipliers = [...DEFAULT_ADVANCED.roundMultipliers];
      }
    }

    if (typeof partial.finalMinPoints === "number") {
      next.finalMinPoints = partial.finalMinPoints;
    }

    if (typeof partial.finalTarget === "number") {
      next.finalTarget = partial.finalTarget;
    }
  
    // nowy klucz: tryb ekranu końcowego
    if (typeof partial.endScreenMode === "string") {
      const m = partial.endScreenMode;
      if (m === "logo" || m === "points" || m === "money") {
        next.endScreenMode = m;
      }
    }
  
    // stary klucz (kompatybilność)
    if (typeof partial.winEnabled === "boolean") {
      next.winEnabled = partial.winEnabled;
    }
  
    state.advanced = next;
    emit();
  }

  function resetAdvanced() {
    state.advanced = { ...DEFAULT_ADVANCED };
    emit();
  }

  function resetProgress({ keepAdvanced = true } = {}) {
    const adv = keepAdvanced ? structuredClone(state.advanced) : { ...DEFAULT_ADVANCED };
    const fresh = makeDefaultState();
    fresh.advanced = adv;
  
    // zachowujemy stałe pola
    fresh.gameId = state.gameId;
  
    // podmień stan “w miejscu” (żeby referencje do `state` nie padły)
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, fresh);
  
    emit();
  }


  return {
    state,
    hydrate,
    subscribe,

    setActiveCard,
    setDevicesStep,
    setSetupStep,

    completeCard,
    setTeams,
    setHasFinal,
    confirmFinalQuestions,
    unconfirmFinalQuestions,

    setOnlineFlags,
    setAudioUnlocked,
    setQrOnDisplay,
    setFinalActive,
    setGameStarted,

    teamsOk,
    canFinishSetup,
    canStartRounds,
    canEnterCard,

    setAdvanced,
    resetAdvanced,
    resetProgress,
  };
}
