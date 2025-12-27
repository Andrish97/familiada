export function createStore(gameId) {
  const KEY = `familiada:control:v6:${gameId}`;
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
      gameStarted: false, // po „Gra gotowa” blokujemy powrót do setup
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
        phase: "IDLE", // IDLE lub inny gdy finał trwa
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
      sentBlackAfterDisplayOnline: false,
      audioUnlocked: false,
      qrOnDisplay: false,
    },

    rounds: {
      phase: "IDLE", // IDLE | READY | INTRO | ROUND_ACTIVE
      roundNo: 1,
      controlTeam: null, // "A" | "B"
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
  };

  // --- ZAPIS DO localStorage + TTL 5 minut ---

  function serialize(s) {
    const snap = structuredClone(s);
    snap.rounds.revealed = Array.from(s.rounds.revealed);
    return {
      _v: 1,
      savedAt: Date.now(),
      state: snap,
    };
  }

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

  function isFinalActive() {
    return !!(state.final?.runtime?.phase && state.final.runtime.phase !== "IDLE");
  }

  function hydrate() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);

      // wersja z wrapperem {_v, savedAt, state}
      const savedAt = typeof parsed?.savedAt === "number" ? parsed.savedAt : null;
      const data =
        parsed?.state && typeof parsed.state === "object" ? parsed.state : parsed;

      // TTL: jeśli stan starszy niż 5 minut – ignorujemy i startujemy od zera
      if (savedAt && Date.now() - savedAt > 5 * 60 * 1000) {
        return;
      }

      if (data?.activeCard && typeof data.activeCard === "string") {
        state.activeCard = data.activeCard;
      }

      if (data?.steps?.devices) state.steps.devices = data.steps.devices;
      if (data?.steps?.setup) state.steps.setup = data.steps.setup;

      if (data?.completed) {
        state.completed.devices = !!data.completed.devices;
        state.completed.setup = !!data.completed.setup;
      }

      if (data?.locks) {
        state.locks.gameStarted = !!data.locks.gameStarted;
      }

      if (data?.teams) {
        state.teams.teamA = String(data.teams.teamA ?? "");
        state.teams.teamB = String(data.teams.teamB ?? "");
      }

      if (typeof data?.hasFinal === "boolean") state.hasFinal = data.hasFinal;

      if (data?.final) {
        state.final.picked = Array.isArray(data.final.picked)
          ? data.final.picked.slice(0, 5)
          : [];
        state.final.confirmed = !!data.final.confirmed;
        if (data.final.runtime) {
          state.final.runtime.sum = Number(data.final.runtime.sum || 0);
          state.final.runtime.winSide = data.final.runtime.winSide || "A";
        }
        if (data.final.step) {
          state.final.step = data.final.step;
        }
      }

      if (data?.flags) {
        state.flags.displayOnline = !!data.flags.displayOnline;
        state.flags.hostOnline = !!data.flags.hostOnline;
        state.flags.buzzerOnline = !!data.flags.buzzerOnline;
        state.flags.sentBlackAfterDisplayOnline =
          !!data.flags.sentBlackAfterDisplayOnline;
        state.flags.audioUnlocked = !!data.flags.audioUnlocked;
        state.flags.qrOnDisplay = !!data.flags.qrOnDisplay;
      }

      if (data?.rounds) {
        state.rounds.roundNo = Number(data.rounds.roundNo || 1);
        state.rounds.totals = data.rounds.totals || state.rounds.totals;
      }
    } catch {
      // cokolwiek poszło źle -> start od zera
    }

    if (!canEnterCard(state.activeCard)) {
      setActiveCard("devices");
    }
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

  function setHasFinal(v) {
    state.hasFinal = v;
    if (v === false) {
      state.final.picked = [];
      state.final.confirmed = false;
    }
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

  function teamsOk() {
    return (
      state.teams.teamA.trim().length > 0 ||
      state.teams.teamB.trim().length > 0
    );
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
    return (
      state.flags.displayOnline &&
      state.flags.hostOnline &&
      state.flags.buzzerOnline
    );
  }

  function canStartRounds() {
    return allDevicesOnline() && state.flags.audioUnlocked && canFinishSetup();
  }

  function canEnterCard(card) {
    if (card === "devices") return true;

    if (card === "setup") {
      // Ustawień nie zmieniamy po starcie gry ani w trakcie finału
      return state.completed.devices && !state.locks.gameStarted && !isFinalActive();
    }

    if (card === "rounds") {
      return state.completed.devices && canFinishSetup();
    }

    if (card === "final") {
      // Final odblokowany dopiero gdy gra wystartowała i setup jest skończony
      return (
        state.hasFinal === true &&
        canFinishSetup() &&
        state.locks.gameStarted === true
      );
    }

    return false;
  }

  // Hydratacja na starcie
  hydrate();

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
