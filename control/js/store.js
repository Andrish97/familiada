// control/js/store.js
export function createStore(gameId) {
  const KEY = `familiada:control:v2:${gameId}`;

  const listeners = new Set();

  const state = {
    activeCard: "devices",

    steps: {
      devices: "devices_display",
      setup: "setup_names",
    },

    teams: {
      teamA: "",
      teamB: "",
    },

    hasFinal: null, // null | true | false
    finalQuestionIds: [], // exactly 5 when set

    flags: {
      displayOnline: false,
      hostOnline: false,
      buzzerOnline: false,
      sentBlackAfterDisplayOnline: false,
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
      const parsed = JSON.parse(raw);

      // merge shallowly but safely
      if (parsed?.activeCard) state.activeCard = parsed.activeCard;

      if (parsed?.steps?.devices) state.steps.devices = parsed.steps.devices;
      if (parsed?.steps?.setup) state.steps.setup = parsed.steps.setup;

      if (parsed?.teams?.teamA != null) state.teams.teamA = String(parsed.teams.teamA);
      if (parsed?.teams?.teamB != null) state.teams.teamB = String(parsed.teams.teamB);

      if (typeof parsed?.hasFinal === "boolean") state.hasFinal = parsed.hasFinal;
      if (Array.isArray(parsed?.finalQuestionIds)) state.finalQuestionIds = parsed.finalQuestionIds.slice(0, 5);

      if (parsed?.flags) {
        state.flags.displayOnline = !!parsed.flags.displayOnline;
        state.flags.hostOnline = !!parsed.flags.hostOnline;
        state.flags.buzzerOnline = !!parsed.flags.buzzerOnline;
        state.flags.sentBlackAfterDisplayOnline = !!parsed.flags.sentBlackAfterDisplayOnline;
      }
    } catch {}
  }

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

  function setTeams(a, b) {
    state.teams.teamA = String(a ?? "");
    state.teams.teamB = String(b ?? "");
    emit();
  }

  function setHasFinal(v) {
    state.hasFinal = v;
    if (v === false) state.finalQuestionIds = [];
    emit();
  }

  function setFinalQuestionIds(ids) {
    state.finalQuestionIds = Array.isArray(ids) ? ids.slice(0, 5) : [];
    emit();
  }

  function setOnlineFlags({ display, host, buzzer }) {
    state.flags.displayOnline = !!display;
    state.flags.hostOnline = !!host;
    state.flags.buzzerOnline = !!buzzer;

    // unlock devices step 2 when display is online
    if (state.flags.displayOnline && state.steps.devices === "devices_display") {
      // only enable “Dalej” (user clicks) — we do not auto-advance
    }

    emit();
  }

  function markSentBlackAfterDisplayOnline() {
    state.flags.sentBlackAfterDisplayOnline = true;
    emit();
  }

  // --- unlocking rules ---
  function isCardUnlocked(card) {
    if (card === "devices") return true;

    const allDevicesOnline = state.flags.displayOnline && state.flags.hostOnline && state.flags.buzzerOnline;
    if (card === "setup") return allDevicesOnline;

    const setupDone = canFinishSetup();
    if (card === "game") return allDevicesOnline && setupDone;

    // final is only meaningful if hasFinal === true
    if (card === "final") return allDevicesOnline && setupDone && state.hasFinal === true;

    return false;
  }

  function canFinishSetup() {
    const namesOk = (state.teams.teamA.trim().length > 0) || (state.teams.teamB.trim().length > 0);

    if (!namesOk) return false;
    if (state.hasFinal === false) return true;
    if (state.hasFinal === true) return state.finalQuestionIds.length === 5;
    return false;
  }

  return {
    state,
    hydrate,
    subscribe,
    emit,

    setActiveCard,
    setDevicesStep,
    setSetupStep,

    setTeams,
    setHasFinal,
    setFinalQuestionIds,

    setOnlineFlags,
    markSentBlackAfterDisplayOnline,

    isCardUnlocked,
    canFinishSetup,
  };
}
