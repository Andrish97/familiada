// control/js/store.js
export function createStore(gameId) {
  const KEY = `familiada:control:v4:${gameId}`;
  const listeners = new Set();

  const state = {
    activeCard: "devices",

    steps: {
      devices: "devices_display", // devices_display | devices_hostbuzzer | devices_audio
      setup: "setup_names",
    },

    completed: {
      devices: false,
      setup: false,
      game: false,
      final: false,
    },

    teams: {
      teamA: "",
      teamB: "",
    },

    hasFinal: null,
    finalQuestionIds: [],

    flags: {
      displayOnline: false,
      hostOnline: false,
      buzzerOnline: false,
      sentBlackAfterDisplayOnline: false,
      audioUnlocked: false,
    },
  };

  function emit() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    for (const fn of listeners) fn(state);
  }

  function hydrate() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const p = JSON.parse(raw);

      if (p?.activeCard) state.activeCard = p.activeCard;
      if (p?.steps?.devices) state.steps.devices = p.steps.devices;
      if (p?.steps?.setup) state.steps.setup = p.steps.setup;

      if (p?.completed) {
        state.completed.devices = !!p.completed.devices;
        state.completed.setup = !!p.completed.setup;
        state.completed.game = !!p.completed.game;
        state.completed.final = !!p.completed.final;
      }

      if (p?.teams?.teamA != null) state.teams.teamA = String(p.teams.teamA);
      if (p?.teams?.teamB != null) state.teams.teamB = String(p.teams.teamB);

      if (typeof p?.hasFinal === "boolean") state.hasFinal = p.hasFinal;
      if (Array.isArray(p?.finalQuestionIds)) state.finalQuestionIds = p.finalQuestionIds.slice(0, 5);

      if (p?.flags) {
        state.flags.displayOnline = !!p.flags.displayOnline;
        state.flags.hostOnline = !!p.flags.hostOnline;
        state.flags.buzzerOnline = !!p.flags.buzzerOnline;
        state.flags.sentBlackAfterDisplayOnline = !!p.flags.sentBlackAfterDisplayOnline;
        state.flags.audioUnlocked = !!p.flags.audioUnlocked;
      }
    } catch {}
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function setActiveCard(card) { if (!canEnterCard(card)) return; state.activeCard = card; emit(); }
  function setDevicesStep(step) { state.steps.devices = step; emit(); }
  function setSetupStep(step) { state.steps.setup = step; emit(); }
  function completeCard(card) { if (state.completed[card] != null) state.completed[card] = true; emit(); }

  function setTeams(a, b) { state.teams.teamA = String(a ?? ""); state.teams.teamB = String(b ?? ""); emit(); }
  function setHasFinal(v) { state.hasFinal = v; if (v === false) state.finalQuestionIds = []; emit(); }
  function setFinalQuestionIds(ids) { state.finalQuestionIds = Array.isArray(ids) ? ids.slice(0, 5) : []; emit(); }

  function setOnlineFlags({ display, host, buzzer }) {
    state.flags.displayOnline = !!display;
    state.flags.hostOnline = !!host;
    state.flags.buzzerOnline = !!buzzer;
    emit();
  }

  function markSentBlackAfterDisplayOnline() { state.flags.sentBlackAfterDisplayOnline = true; emit(); }
  function setAudioUnlocked(v) { state.flags.audioUnlocked = !!v; emit(); }

  function allDevicesOnline() { return state.flags.displayOnline && state.flags.hostOnline && state.flags.buzzerOnline; }

  function canFinishSetup() {
    const namesOk = state.teams.teamA.trim().length > 0 || state.teams.teamB.trim().length > 0;
    if (!namesOk) return false;
    if (state.hasFinal === false) return true;
    if (state.hasFinal === true) return state.finalQuestionIds.length === 5;
    return false;
  }

  function canEnterCard(card) {
    if (state.completed[card]) return false;

    if (card === "devices") return !state.completed.devices;
    if (card === "setup") return allDevicesOnline() && state.flags.audioUnlocked && !state.completed.setup;
    if (card === "game") return allDevicesOnline() && state.flags.audioUnlocked && canFinishSetup() && !state.completed.game;
    if (card === "final") return allDevicesOnline() && state.flags.audioUnlocked && canFinishSetup() && state.hasFinal === true && !state.completed.final;

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
    setFinalQuestionIds,

    setOnlineFlags,
    markSentBlackAfterDisplayOnline,
    setAudioUnlocked,

    canFinishSetup,
    canEnterCard,
  };
}
