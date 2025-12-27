export function createStore(gameId) {
  const KEY = `familiada:control:v5:${gameId}`;
  const listeners = new Set();

  const state = {
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

  function isFinalActive() {
    const step = state.final?.step || "f_start";
    // wszystko poza ekranem startowym traktujemy jako "finał aktywny"
    return step !== "f_start";
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
      // ustawienia:
      // - wymagają ukończenia devices
      // - NIE wolno tam wracać po "Gra gotowa"
      if (!state.completed.devices) return false;
      if (state.locks.gameStarted) return false;
      return true;
    }
  
    if (card === "rounds") {
      // rozgrywka dopiero, gdy:
      // - devices ukończone
      // - setup ukończony (drużyny + ewentualny finał)
      return state.completed.devices && canFinishSetup();
    }
  
    if (card === "final") {
      // finał dostępny dopiero gdy:
      // - gra ma finał
      // - setup jest poprawnie zakończony
      // - i FINAŁ został odblokowany po dojściu do 300 pkt
      //   albo finał jest już w trakcie (powrót do karty)
      const finalActive = isFinalActive();
      return (
        state.hasFinal === true &&
        canFinishSetup() &&
        (state.flags.finalUnlocked || finalActive)
      );
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

      if (p?.activeCard && typeof p.activeCard === "string") {
        state.activeCard = p.activeCard;
      }

      if (p?.steps?.devices) state.steps.devices = p.steps.devices;
      if (p?.steps?.setup) state.steps.setup = p.steps.setup;

      if (p?.completed) {
        state.completed.devices = !!p.completed.devices;
        state.completed.setup = !!p.completed.setup;
      }

      if (p?.locks) state.locks.gameStarted = !!p.locks.gameStarted;

      if (p?.teams) {
        state.teams.teamA = String(p.teams.teamA ?? "");
        state.teams.teamB = String(p.teams.teamB ?? "");
      }

      if (typeof p?.hasFinal === "boolean") state.hasFinal = p.hasFinal;

      if (p?.final) {
        state.final.picked = Array.isArray(p.final.picked) ? p.final.picked.slice(0, 5) : [];
        state.final.confirmed = !!p.final.confirmed;
      }

      if (p?.flags) {
        state.flags.displayOnline = !!p.flags.displayOnline;
        state.flags.hostOnline = !!p.flags.hostOnline;
        state.flags.buzzerOnline = !!p.flags.buzzerOnline;
        state.flags.sentBlackAfterDisplayOnline = !!p.flags.sentBlackAfterDisplayOnline;
        state.flags.audioUnlocked = !!p.flags.audioUnlocked;
        state.flags.qrOnDisplay = !!p.flags.qrOnDisplay;
        state.flags.finalUnlocked = !!p.flags.finalUnlocked;
      }

      if (p?.rounds) {
        state.rounds.roundNo = Number(p.rounds.roundNo || 1);
        state.rounds.totals = p.rounds.totals || state.rounds.totals;
      }

      if (typeof p?.winnerTeam === "string") {
        state.winnerTeam = p.winnerTeam;
      }
    } catch {}

    // sanity po hydracji
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
