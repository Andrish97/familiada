// /familiada/control/js/runtime.js

const KEY = (gameId) => `familiada:control:runtime:${gameId}`;

export function defaultRuntime() {
  return {
    version: 1,

    // wkładki / flow
    step: "TOOLS_DISPLAY", // TOOLS_DISPLAY -> TOOLS_LINKS -> FINAL_SETUP -> TEAM_NAMES -> GAME_READY -> GAME_START -> ROUND_START ...

    // setup
    finalEnabled: false,
    finalQuestionIds: [],

    teamA: "",
    teamB: "",

    // scoring (konto drużyn w tripletach)
    scoreA: 0,
    scoreB: 0,

    // used questions in rounds
    usedRoundQuestionIds: [],

    // bookkeeping
    lastSeenPresence: {
      displayOnline: false,
      hostOnline: false,
      buzzerOnline: false,
    },
  };
}

export function loadRuntime(gameId) {
  try {
    const raw = localStorage.getItem(KEY(gameId));
    if (!raw) return defaultRuntime();
    const parsed = JSON.parse(raw);
    return { ...defaultRuntime(), ...parsed };
  } catch {
    return defaultRuntime();
  }
}

export function saveRuntime(gameId, rt) {
  try {
    localStorage.setItem(KEY(gameId), JSON.stringify(rt));
  } catch {}
}

export function setStep(rt, step) {
  return { ...rt, step };
}
