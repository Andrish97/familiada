export function createStore(gameId) {
  const KEY = `familiada:control:v5:${gameId}`;
  const listeners = new Set();
  const STALE_MS = 5 * 60 * 1000; // 5 minut

  const state = {
    gameId,
    meta: {
      savedAt: Date.now(),
    ,}
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
      gameStarted: false,     // po „Start gry” blokujemy powrót do setup (tak jak ustaliliście)
      finalActive: false    
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
        phase: "IDLE", // IDLE | P1_ENTRY | P1_MAP | ROUND2_START | P2_ENTRY | P2_MAP | FINISH
        sum: 0,
        winSide: "A",            // "A"|"B" (strona timera)
        timer: { running:false, secLeft:0, phase:"P1" }, // P1=15, P2=20
        mapIndex: 0,             // 0..4
        p1List: null,            // [{text,status}] len 5, status: EMPTY|FILLED
        p2List: null,            // [{text,status}] len 5, status: EMPTY|FILLED|REPEAT
        mapP1: null,             // [{choice, matchId, outText, pts}] len 5
        mapP2: null,             // [{choice, matchId, outText, pts}] len 5
        reached200: false,
      },
      step: "f_start",
    },

    flags: {
      displayOnline: false,
      hostOnline: false,
      buzzerOnline: false,
      sentBlackAfterDisplayOnline: false,
      audioUnlocked: false,
      qrOnDisplay: false,
      finalUnlocked: false,
    },

    rounds: {
      phase: "IDLE", // IDLE | READY | INTRO | ROUND_ACTIVE
      roundNo: 1,
      controlTeam: null, // "A"|"B"
      bankPts: 0,
      xA: 0,
      xB: 0,
      totals: { A: 0, B: 0 },
      step: "r_ready",
      passUsed: false,
      stealWon: false,
      winnerTeam: null,  // "A" | "B" po dojściu do finału


      question: null, // {id, ord, text}
      answers: [],    // [{id, ord, text, fixed_points}]
      revealed: new Set(), // ord set

      duel: {
        enabled: false,
        lastPressed: null, // "A"|"B"
      },

      timer3: {
        running: false,
        endsAt: 0,
      },

      steal: {
        active: false,
        used: false, // single steal attempt
      },

      allowPass: false, // after first correct answer
      canEnterFinal: false,
    },
  };

  function emit() {
    // aktualizuj timestamp przed zapisaniem
    state.meta = state.meta || {};
    state.meta.savedAt = Date.now();

    try {
      localStorage.setItem(KEY, JSON.stringify(serialize(state)));
    } catch {}

    for (const fn of listeners) fn(state);
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function serialize(s) {
    // convert Sets
    const out = structuredClone(s);
    out.rounds.revealed = Array.from(s.rounds.revealed);
    return out;
  }

  function teamsOk() {
    return state.teams.teamA.trim().length > 0 || state.teams.teamB.trim().length > 0;
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

  function isFinalActive() {
    // zamiast patrzeć na runtime.phase (którego nie ustawiamy),
    // korzystamy z locka
    return state.locks.finalActive === true;
  }

  function canEnterCard(card) {
    if (card === "devices") return true;

    if (card === "setup") {
      // ustawień nie zmieniamy podczas gry ani finału
      return state.completed.devices && canFinishSetup() && !isFinalActive() && !state.locks.gameStarted;
    }

    if (card === "rounds") {
      return state.completed.devices && canFinishSetup();
    }

    if (card === "final") {
      // finał tylko jeśli:
      // - jest włączony
      // - setup gotowy
      // - ktoś dobił do 300 (lub masz tu osobny warunek/flagę)
      const tot = state.rounds.totals || { A: 0, B: 0 };
      const unlocked = (tot.A >= 300 || tot.B >= 300);
      return state.hasFinal === true && canFinishSetup() && unlocked;
    }

    return false;
  }

  function setActiveCard(card) {
    if (!canEnterCard(card)) return;
    state.activeCard = card;
    emit();
  }

  function setDevicesStep(step) { state.steps.devices = step; emit(); }
  function setSetupStep(step) { state.steps.setup = step; emit(); }

  function completeCard(card) { state.completed[card] = true; emit(); }

  function setTeams(a, b) {
    state.teams.teamA = String(a ?? "");
    state.teams.teamB = String(b ?? "");
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

  function markSentBlackAfterDisplayOnline() {
    state.flags.sentBlackAfterDisplayOnline = true;
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

  function hydrate() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;

      const p = JSON.parse(raw);

      // --- sprawdzamy „wiek” zapisanego stanu ---
      const now = Date.now();
      const savedAt = (p.meta && typeof p.meta.savedAt === "number")
        ? p.meta.savedAt
        : null;

      if (savedAt && now - savedAt > STALE_MS) {
        // zapis jest za stary -> traktujemy jakby go nie było
        localStorage.removeItem(KEY);
        return;
      }

      // --- dalej już Twoje dotychczasowe przepisywanie wartości ---
      if (p?.activeCard && typeof p.activeCard === "string") {
        state.activeCard = p.activeCard;
      }

      if (p?.steps?.devices) state.steps.devices = p.steps.devices;
      if (p?.steps?.setup) state.steps.setup = p.steps.setup;

      if (p?.completed) {
        state.completed.devices = !!p.completed.devices;
        state.completed.setup = !!p.completed.setup;
      }

      if (p?.locks) {
        state.locks.gameStarted = !!p.locks.gameStarted;
        state.locks.finalActive = !!p.locks.finalActive;
      }

      if (p?.teams) {
        state.teams.teamA = String(p.teams.teamA ?? "");
        state.teams.teamB = String(p.teams.teamB ?? "");
      }

      if (typeof p?.hasFinal === "boolean") state.hasFinal = p.hasFinal;

      if (p?.final) {
        state.final.picked = Array.isArray(p.final.picked) ? p.final.picked.slice(0, 5) : [];
        state.final.confirmed = !!p.final.confirmed;
        if (p.final.step) state.final.step = p.final.step;
        if (p.final.runtime) {
          state.final.runtime = {
            ...state.final.runtime,
            ...p.final.runtime,
          };
        }
      }

      if (p?.flags) {
        state.flags.displayOnline = !!p.flags.displayOnline;
        state.flags.hostOnline = !!p.flags.hostOnline;
        state.flags.buzzerOnline = !!p.flags.buzzerOnline;
        state.flags.sentBlackAfterDisplayOnline = !!p.flags.sentBlackAfterDisplayOnline;
        state.flags.audioUnlocked = !!p.flags.audioUnlocked;
        state.flags.qrOnDisplay = !!p.flags.qrOnDisplay;
      }

      if (p?.rounds) {
        state.rounds.roundNo = Number(p.rounds.roundNo || 1);
        state.rounds.totals = p.rounds.totals || state.rounds.totals;
        // resztę, jeśli chcesz, możesz też przepisać, ale
        // nie musisz odtwarzać całego środka rundy po odświeżeniu
      }
    } catch {
      // przy błędzie po prostu startujemy od stanu domyślnego
    }

    // sanity po hydracji – jak wcześniej:
    if (!canEnterCard(state.activeCard)) {
      const order = ["rounds", "final", "setup", "devices"];
      state.activeCard = order.find((c) => canEnterCard(c)) || "devices";
    }
  }

  // po .hydrate(); – startowo upewnij się, że jesteśmy co najmniej na devices
  if (!canEnterCard(state.activeCard)) setActiveCard("devices");

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
    markSentBlackAfterDisplayOnline,
    setAudioUnlocked,
    setQrOnDisplay,
    setFinalActive,

    teamsOk,
    canFinishSetup,
    canStartRounds,
    canEnterCard,
  };
}
