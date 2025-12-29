// /familiada/control/js/store.js

const FIVE_MIN = 5 * 60 * 1000;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function freshState(gameId) {
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
      rounds: false,
      final: false,
    },

    flags: {
      displayOnline: false,
      hostOnline: false,
      buzzerOnline: false,
      audioUnlocked: false,
      qrOnDisplay: false,
      sentBlackAfterDisplayOnline: false,
    },

    teams: {
      teamA: "",
      teamB: "",
    },

    hasFinal: null, // true / false
    final: {
      picked: [],
      confirmed: false,
      step: "f_start",
      sum: 0,
      timer: {
        running: false,
        endsAt: 0,
        secLeft: 0,
      },
      p1: {
        answers: ["", "", "", "", ""],
        points: [0, 0, 0, 0, 0],
      },
      p2: {
        answers: ["", "", "", "", ""],
        points: [0, 0, 0, 0, 0],
        repeats: [false, false, false, false, false],
      },
    },

    rounds: {
      phase: "IDLE", // IDLE | READY | INTRO | ROUND_ACTIVE
      step: "r_ready",
      roundNo: 1,
      totals: { A: 0, B: 0 },
      question: null,
      answers: [],
      revealed: [],
      bankPts: 0,
      xA: 0,
      xB: 0,
      controlTeam: null,
      allowPass: false,
      steal: {
        active: false,
        used: false,
        wonBy: null, // "A" | "B" | null
      },
      timer3: {
        running: false,
        endsAt: 0,
        secLeft: 3,
      },
      _loadedRounds: [],
    },

    presence: {
      available: false,
    },

    _meta: {
      createdAt: Date.now(),
    },
  };
}

export function createStore(gameId) {
  const KEY = `familiada:control:${gameId || "unknown"}`;

  let state = null;
  const listeners = new Set();

  function loadFromStorage() {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed._meta) return null;
      const age = Date.now() - (parsed._meta.createdAt || 0);
      if (age > FIVE_MIN) return null; // po 5 minutach – nowy stan
      return parsed;
    } catch {
      return null;
    }
  }

  function saveToStorage() {
    try {
      const copy = clone(state);
      copy._meta = { createdAt: Date.now() };
      sessionStorage.setItem(KEY, JSON.stringify(copy));
    } catch {
      // nic
    }
  }

  function emit() {
    saveToStorage();
    for (const fn of listeners) {
      try { fn(state); } catch {}
    }
  }

  function reset() {
    state = freshState(gameId);
    emit();
  }

  state = loadFromStorage() || freshState(gameId);

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function setActiveCard(card) {
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
    if (state.completed[card] === true) return;
    state.completed[card] = true;
    emit();
  }

  function setTeams(teamA, teamB) {
    state.teams.teamA = String(teamA || "").trim();
    state.teams.teamB = String(teamB || "").trim();
    emit();
  }

  function teamsOk() {
    return !!state.teams.teamA && !!state.teams.teamB;
  }

  function setHasFinal(on) {
    state.hasFinal = !!on;
    emit();
  }

  function confirmFinalQuestions(ids) {
    state.final.picked = (ids || []).slice(0, 5);
    state.final.confirmed = true;
    emit();
  }

  function unconfirmFinalQuestions() {
    state.final.confirmed = false;
    emit();
  }

  function setAudioUnlocked(on) {
    state.flags.audioUnlocked = !!on;
    emit();
  }

  function setQrOnDisplay(on) {
    state.flags.qrOnDisplay = !!on;
    emit();
  }

  function setOnlineFlags(flags) {
    state.flags.displayOnline = !!flags.display;
    state.flags.hostOnline = !!flags.host;
    state.flags.buzzerOnline = !!flags.buzzer;
    state.presence.available = true;
    emit();
  }

  function setPresenceUnavailable() {
    state.presence.available = false;
    state.flags.displayOnline = false;
    state.flags.hostOnline = false;
    state.flags.buzzerOnline = false;
    emit();
  }

  function markSentBlackAfterDisplayOnline() {
    state.flags.sentBlackAfterDisplayOnline = true;
    emit();
  }

  // rounds
  function setRoundsState(patch) {
    Object.assign(state.rounds, patch);
    emit();
  }

  // final
  function setFinalState(patch) {
    Object.assign(state.final, patch);
    emit();
  }

  function canEnterCard(card) {
    if (card === "devices") return true;

    if (card === "setup") {
      return state.completed.devices;
    }

    if (card === "rounds") {
      return state.completed.setup;
    }

    if (card === "final") {
      return state.completed.setup && state.hasFinal === true;
    }

    return false;
  }

  function canFinishSetup() {
    if (!teamsOk()) return false;
    if (state.hasFinal === null) return false;
    if (state.hasFinal === true && state.final.confirmed !== true) return false;
    return true;
  }

  function canStartRounds() {
    return state.completed.devices && state.completed.setup;
  }

  return {
    state,
    subscribe,
    reset,

    setActiveCard,
    setDevicesStep,
    setSetupStep,
    completeCard,

    setTeams,
    teamsOk,

    setHasFinal,
    confirmFinalQuestions,
    unconfirmFinalQuestions,

    setAudioUnlocked,
    setQrOnDisplay,

    setOnlineFlags,
    setPresenceUnavailable,
    markSentBlackAfterDisplayOnline,

    setRoundsState,
    setFinalState,

    canEnterCard,
    canFinishSetup,
    canStartRounds,
  };
}
