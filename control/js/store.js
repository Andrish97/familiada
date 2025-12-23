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
        phase: "IDLE", // IDLE | P1_ENTRY | P2_ENTRY | MAPPING | REVEAL | DONE
        sum: 0,
        timer: { running:false, secLeft:0, teamSide:"A" }, // timer on winning side only (display)
        p1: {}, // qid -> {text, status}
        p2: {}, // qid -> {text, status}
        map: {}, // qid -> {choice:"MATCH"|"MISS"|"SKIP"|"REPEAT", matchId?, outText, pts}
      },
    },

    flags: {
      displayOnline: false,
      hostOnline: false,
      buzzerOnline: false,
      sentBlackAfterDisplayOnline: false,
      audioUnlocked: false,
      qrOnDisplay: false,
    },

    rounds: {
      roundNo: 1,
      controlTeam: null, // "A"|"B"
      bankPts: 0,
      xA: 0,
      xB: 0,
      totals: { A: 0, B: 0 },

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
    },
  };

  function emit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(serialize(state)));
    } catch {}
    for (const fn of listeners) fn(state);
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function hydrate() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const p = JSON.parse(raw);

      // minimal safe hydrate
      if (p?.activeCard) state.activeCard = p.activeCard;

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
      }

      if (p?.rounds) {
        // keep totals & roundNo
        state.rounds.roundNo = Number(p.rounds.roundNo || 1);
        state.rounds.totals = p.rounds.totals || state.rounds.totals;
      }
    } catch {}
  }

  function serialize(s) {
    // convert Sets
    const out = structuredClone(s);
    out.rounds.revealed = Array.from(s.rounds.revealed);
    return out;
  }

  function setActiveCard(card) {
    if (!canEnterCard(card)) return;
    state.activeCard = card;
    emit();
  }

  function setDevicesStep(step) { state.steps.devices = step; emit(); }
  function setSetupStep(step) { state.steps.setup = step; emit(); }

  function completeCard(card) { state.completed[card] = true; emit(); }

  function setTeams(a, b) { state.teams.teamA = String(a ?? ""); state.teams.teamB = String(b ?? ""); emit(); }
  function setHasFinal(v) { state.hasFinal = v; if (v === false) { state.final.picked = []; state.final.confirmed = false; } emit(); }

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

  function markSentBlackAfterDisplayOnline() { state.flags.sentBlackAfterDisplayOnline = true; emit(); }
  function setAudioUnlocked(v) { state.flags.audioUnlocked = !!v; emit(); }
  function setQrOnDisplay(v) { state.flags.qrOnDisplay = !!v; emit(); }

  function teamsOk() {
    return state.teams.teamA.trim().length > 0 || state.teams.teamB.trim().length > 0;
  }

  function canFinishSetup() {
    if (!teamsOk()) return false;
    if (state.hasFinal === false) return true;
    if (state.hasFinal === true) return state.final.confirmed === true && state.final.picked.length === 5;
    return false;
  }

  function allDevicesOnline() {
    return state.flags.displayOnline && state.flags.hostOnline && state.flags.buzzerOnline;
  }

  function canStartRounds() {
    return allDevicesOnline() && state.flags.audioUnlocked && canFinishSetup();
  }

  function canEnterCard(card) {
    if (card === "devices") return !state.completed.devices;
    if (card === "setup") return state.completed.devices && allDevicesOnline() && state.flags.audioUnlocked && !state.completed.setup && !state.locks.gameStarted;
    if (card === "rounds") return state.completed.devices && canFinishSetup();
    if (card === "final") return state.hasFinal === true && canFinishSetup();
    return false;
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
    markSentBlackAfterDisplayOnline,
    setAudioUnlocked,
    setQrOnDisplay,

    teamsOk,
    canFinishSetup,
    canStartRounds,
    canEnterCard,
  };
}
