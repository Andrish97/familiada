// control2/js/engine.js
// Silnik rozgrywki Control v2 — JEDEN generyczny punkt wejścia:
// dispatch(action). Zero funkcji-per-akcja jak w starym gameRounds.js/
// gameFinal.js (acceptBuzz/addX/goSteal/goEndRound...) — to był stary
// kształt, tylko bez komend do urządzeń, nie prawdziwe odwzorowanie tabeli
// stanów. Tutaj tabela (shared/gameStateMachine.js) jest MECHANIZMEM, nie
// dokumentacją obok: każdy reducer proponuje `step`, a dispatch() woła
// assertTransition(aktualny_step, proponowany_step) i dopiero po tej
// weryfikacji zapisuje. Nielegalny skok (błąd w reducerze, literówka w
// akcji) rzuca wyjątek zamiast po cichu zepsuć stan gry.
//
// Zakres celowo NIE obejmuje nawigacji przedmeczowej (devices_display →
// devices_hostbuzzer → setup_finish → r_intro → r_roundStart) — to liniowe
// przechodzenie bez żadnych reguł/rozgałęzień, obsługiwane wprost w
// control2.html (app-level), a nie w silniku reguł gry. Ten plik odpowiada
// za wszystko, co ma realną logikę: R2-R10 (rundy) i F0-F14 (finał).
//
// Zero importów przeglądarkowych — testowalne w gołym Node.

import { assertTransition } from "../../shared/gameStateMachine.js?v=v2026-09-05T07201";

const STRIKE_LIMIT = 3;
const TIMER_SECONDS = { P1: 15, P2: 20 };
const FINAL_BLANK = "————";

function topAnswer(answers) {
  return answers.reduce((best, a) => (!best || a.fixed_points > best.fixed_points ? a : best), null);
}
function mapKey(round) {
  return round === 1 ? "map1" : "map2";
}
function entryKey(round) {
  return round === 1 ? "p1" : "p2";
}
function emptyMapRows() {
  return Array.from({ length: 5 }, () => ({
    mode: "AUTO",
    kind: null,
    matchId: null,
    outText: "",
    pts: 0,
    revealedAnswer: false,
    revealedPoints: false,
    locked: false,
    repeat: false,
    _addedToSum: false,
  }));
}
function shownText(row) {
  if (!row || row.kind === "SKIP" || row.kind == null) return FINAL_BLANK;
  return row.outText && row.outText.trim() ? row.outText : FINAL_BLANK;
}

export function getRoundMultiplier(settings, roundNo) {
  const arr = settings?.roundMultipliers?.length ? settings.roundMultipliers : [1];
  const idx = Math.min(roundNo - 1, arr.length - 1);
  const n = Number.parseInt(String(arr[Math.max(idx, 0)]), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function isThresholdHit(state) {
  const totals = state.rounds.totals || { A: 0, B: 0 };
  const threshold = state.settings.finalMinPoints;
  return (totals.A || 0) >= threshold || (totals.B || 0) >= threshold;
}

function canEnterFinal(state) {
  if (state.settings.hasFinal !== true) return false;
  if (state.settings.finalQuestionsMode === "pick") {
    return state.final.confirmed === true && state.final.picked.length === 5;
  }
  return true;
}

function computeWinnerTeam(state) {
  const totals = state.rounds.totals || { A: 0, B: 0 };
  return (totals.A || 0) >= (totals.B || 0) ? "A" : "B";
}

function sameStep(state) {
  return { step: state.step, phase: state.phase, controlTeam: state.controlTeam, topCard: state.topCard };
}

function gotoEnd(state) {
  state.final.runtime.timer = { running: false, phase: null, endsAt: 0 };
  return { step: "f_end", phase: null, controlTeam: null, topCard: "final" };
}

// R9: koniec rundy — jedyny punkt, gdzie decyduje się co dalej (kolejna
// runda / finał / koniec gry). Wywoływany z END_ROUND i REVEAL_LEFT (gdy
// to była ostatnia nieodkryta odpowiedź) — patrz plan, tabela A, R9.
function finalizeRound(state) {
  const r = state.rounds;
  r.roundNo += 1;
  r.bankPts = 0;
  r.xA = 0;
  r.xB = 0;
  r.passUsed = false;
  r.allowPass = false;
  r.canEndRound = false;
  r.lockPlayControls = false;

  if (isThresholdHit(state)) {
    if (canEnterFinal(state)) {
      state.locks.finalActive = true;
      return { step: "f_start", phase: null, controlTeam: null, topCard: "final" };
    }
    return { step: "r_gameEnd", phase: null, controlTeam: null, topCard: "rounds" };
  }
  if (!r._questionPool.length) {
    return { step: "r_gameEnd", phase: null, controlTeam: null, topCard: "rounds" };
  }
  return { step: "r_roundStart", phase: "READY", controlTeam: null, topCard: "rounds" };
}

// Każdy reducer: (state, action, deps) -> Promise<null | {step, phase, controlTeam, topCard, soundCueKey?}>
// null = akcja świadomie nie ma zastosowania w bieżącym stanie (no-op) —
// nigdy cichy wyjątek, dispatch() po prostu nic nie commituje.
const REDUCERS = {
  // ---- rundy: R1->R2 ----
  async START_ROUND(state, action, deps) {
    const r = state.rounds;
    if (!r._questionPool.length) r._questionPool = await deps.loadQuestionPool();
    if (!r._questionPool.length) {
      return { step: "r_gameEnd", phase: null, controlTeam: null, topCard: "rounds" };
    }
    const q = r._questionPool.shift();
    const answers = (await deps.loadAnswers(q.id)).slice().sort((a, b) => a.ord - b.ord);

    r.question = { id: q.id, ord: q.ord, text: q.text };
    r.answers = answers;
    r.revealed = [];
    r.bankPts = 0;
    r.xA = 0;
    r.xB = 0;
    r.passUsed = false;
    r.allowPass = false;
    r.canEndRound = false;
    r.lockPlayControls = false;
    r.stealWon = false;
    r.steal = { active: false, used: false, team: null, won: null };
    r.duel = { enabled: true, lastPressed: null, firstTeam: null, secondTeam: null, currentTeam: null };

    return { step: "r_duel", phase: "DUEL", controlTeam: null, topCard: "rounds", soundCueKey: "round_transition" };
  },

  // ---- R2->R3: przyjęcie bzyczenia (lastPressed już w state — zapisane
  // bezpośrednio przez Buzzer przez game_state_buzzer_press) ----
  async ACCEPT_BUZZ(state, action) {
    const r = state.rounds;
    const other = action.team === "A" ? "B" : "A";
    r.duel.firstTeam = action.team;
    r.duel.secondTeam = other;
    r.duel.currentTeam = action.team;
    return { step: "r_play", phase: "DUEL", controlTeam: null, topCard: "rounds", soundCueKey: "buzzer_press" };
  },

  // ---- R3/R4/R5/R8: odsłonięcie odpowiedzi — jeden reducer, gałąź wg
  // aktualnej fazy (DUEL/PLAY/STEAL/REVEAL), dokładnie jak w tabeli A ----
  async REVEAL_ANSWER(state, action) {
    const r = state.rounds;
    if (state.phase === "REVEAL") return REDUCERS.REVEAL_LEFT(state, action);

    const ans = r.answers.find((a) => a.ord === action.ord);
    if (!ans || r.revealed.includes(action.ord)) return null;

    if (state.phase === "DUEL") {
      const top = topAnswer(r.answers);
      if (!top || action.ord !== top.ord) return null; // pudło w DUEL idzie przez ADD_X
      r.revealed.push(action.ord);
      r.bankPts += ans.fixed_points;
      r.allowPass = true;
      return {
        step: "r_play",
        phase: "PLAY",
        controlTeam: r.duel.currentTeam,
        topCard: "rounds",
        soundCueKey: "answer_correct",
      };
    }

    r.revealed.push(action.ord);
    r.bankPts += ans.fixed_points;
    r.allowPass = false;

    if (state.phase === "STEAL" && r.steal.active && !r.steal.used) {
      r.steal.used = true;
      r.steal.won = true;
      r.stealWon = true;
      r.steal.active = false;
      r.canEndRound = true;
      return { step: "r_play", phase: "STEAL", controlTeam: state.controlTeam, topCard: "rounds", soundCueKey: "answer_correct" };
    }

    if (r.revealed.length >= r.answers.length) r.canEndRound = true;
    return { step: "r_play", phase: state.phase, controlTeam: state.controlTeam, topCard: "rounds", soundCueKey: "answer_correct" };
  },

  // ---- R4: pass (raz na rundę, tylko PLAY, tylko przed 1. trafieniem) ----
  async PASS(state) {
    const r = state.rounds;
    if (state.phase !== "PLAY" || !r.allowPass || r.passUsed) return null;
    r.passUsed = true;
    r.allowPass = false;
    const nextControl = state.controlTeam === "A" ? "B" : "A";
    return { step: "r_play", phase: "PLAY", controlTeam: nextControl, topCard: "rounds" };
  },

  // ---- R3/R4/R5: pudło — gałąź wg fazy ----
  async ADD_X(state) {
    const r = state.rounds;

    if (state.phase === "DUEL") {
      if (r.duel.currentTeam === r.duel.firstTeam) {
        r.duel.currentTeam = r.duel.secondTeam;
        return { step: "r_play", phase: "DUEL", controlTeam: null, topCard: "rounds", soundCueKey: "answer_wrong" };
      }
      // obie drużyny spudłowały -> pełny RESET, powrót do r_duel
      r.duel = { enabled: true, lastPressed: null, firstTeam: null, secondTeam: null, currentTeam: null };
      return { step: "r_duel", phase: "DUEL", controlTeam: null, topCard: "rounds" };
    }

    if (state.phase === "STEAL") {
      r.steal.used = true;
      r.steal.won = false;
      r.stealWon = false;
      r.steal.active = false;
      r.canEndRound = true;
      return { step: "r_play", phase: "STEAL", controlTeam: state.controlTeam, topCard: "rounds", soundCueKey: "answer_wrong" };
    }

    if (state.phase === "PLAY") {
      if (!state.controlTeam) return null;
      const key = state.controlTeam === "A" ? "xA" : "xB";
      r[key] = Math.min((r[key] || 0) + 1, STRIKE_LIMIT);
      r.allowPass = false;

      if (r[key] >= STRIKE_LIMIT && r.revealed.length < r.answers.length) {
        const other = state.controlTeam === "A" ? "B" : "A";
        r.steal = { active: true, used: false, team: other, won: null };
        return { step: "r_play", phase: "STEAL", controlTeam: state.controlTeam, topCard: "rounds", soundCueKey: "answer_wrong" };
      }
      if (r[key] >= STRIKE_LIMIT) r.canEndRound = true;
      return { step: "r_play", phase: "PLAY", controlTeam: state.controlTeam, topCard: "rounds", soundCueKey: "answer_wrong" };
    }
    return null;
  },

  // ---- R5: ręczna kradzież (bez czekania na 3. X) ----
  async GO_STEAL(state) {
    const r = state.rounds;
    if (state.phase !== "PLAY" || !state.controlTeam) return null;
    const other = state.controlTeam === "A" ? "B" : "A";
    r.steal = { active: true, used: false, team: other, won: null };
    return { step: "r_play", phase: "STEAL", controlTeam: state.controlTeam, topCard: "rounds" };
  },

  // ---- R6-R7: koniec rundy ----
  async END_ROUND(state) {
    const r = state.rounds;
    if (!state.controlTeam) return null;
    r.lockPlayControls = true;

    const winner = r.steal.used && r.steal.won ? r.steal.team : state.controlTeam;
    const multiplier = getRoundMultiplier(state.settings, r.roundNo);
    r.totals[winner] = (r.totals[winner] || 0) + r.bankPts * multiplier;
    r.bankPts = 0;

    if (r.revealed.length < r.answers.length) {
      return { step: "r_play", phase: "REVEAL", controlTeam: state.controlTeam, topCard: "rounds", soundCueKey: "round_transition" };
    }
    return finalizeRound(state);
  },

  // ---- R8: odkrywanie reszty (czysto pokazowe, nie dolicza do banku) ----
  async REVEAL_LEFT(state, action) {
    const r = state.rounds;
    if (r.revealed.includes(action.ord)) return null;
    r.revealed.push(action.ord);
    if (r.revealed.length >= r.answers.length) {
      return { ...finalizeRound(state), soundCueKey: "answer_correct" };
    }
    return { step: "r_play", phase: "REVEAL", controlTeam: state.controlTeam, topCard: "rounds", soundCueKey: "answer_correct" };
  },

  // ---- R10: ekran końca gry bez finału ----
  async GAME_END_SHOW(state) {
    if (state.locks.gameEnded) return null;
    state.locks.gameEnded = true;
    return { step: "r_gameEnd", phase: null, controlTeam: null, topCard: "rounds", soundCueKey: "show_intro" };
  },

  // ---- F0: start finału ----
  async START_FINAL(state) {
    if (state.settings.hasFinal !== true) return null;
    const f = state.final;
    f.winnerTeam = computeWinnerTeam(state);
    f.runtime = {
      sum: 0,
      timer: { running: false, phase: null, endsAt: 0 },
      map1: emptyMapRows(),
      map2: emptyMapRows(),
      p1: new Array(5).fill(null),
      p2: new Array(5).fill(null),
      reached200: false,
    };
    state.locks.finalActive = true;
    state.host.covered = true;
    return { step: "f_p1_entry", phase: null, controlTeam: null, topCard: "final", soundCueKey: "final_theme" };
  },

  // ---- F1/F8: wpisywanie odpowiedzi + flaga powtórzenia ----
  async SET_ENTRY_TEXT(state, action) {
    const key = entryKey(action.round);
    const prev = state.final.runtime[key][action.idx] || {};
    state.final.runtime[key][action.idx] = { ...prev, text: action.text };
    return sameStep(state);
  },

  async SET_REPEAT(state, action) {
    if (action.round !== 2) return null;
    const row = state.final.runtime.map2[action.idx];
    row.mode = "MANUAL";
    row.kind = "SKIP";
    row.matchId = null;
    row.outText = "";
    row.pts = 0;
    const prevEntry = state.final.runtime.p2[action.idx] || {};
    state.final.runtime.p2[action.idx] = { ...prevEntry, repeat: !!action.repeat };
    return { ...sameStep(state), soundCueKey: action.repeat ? "answer_repeat" : undefined };
  },

  async START_TIMER(state, action, deps) {
    const seconds = TIMER_SECONDS[action.phase];
    state.final.runtime.timer = { running: true, phase: action.phase, endsAt: deps.now() + seconds * 1000 };
    return sameStep(state);
  },

  // Wywoływane zarówno na żywo, jak i przy "dogonieniu" timera, który
  // wygasł podczas nieobecności Control (store.hydrate(), plan sekcja 4).
  async EXPIRE_TIMER(state) {
    const t = state.final.runtime.timer;
    if (!t.running) return null;
    state.final.runtime.timer = { running: false, phase: t.phase, endsAt: 0 };
    return { ...sameStep(state), soundCueKey: "time_over" };
    // Brak auto-przejścia do mapowania — operator klika "dalej" ręcznie
    // (START_MAPPING/NEXT_QUESTION), dokładnie jak w oryginale.
  },

  // ---- F2-F6/F9-F13: rozstrzygnięcie dopasowania + dwuetapowe odsłonięcie ----
  async RESOLVE_MAPPING(state, action) {
    const row = state.final.runtime[mapKey(action.round)][action.idx];
    if (action.mode) row.mode = action.mode;
    if (action.kind) row.kind = action.kind;
    if (action.matchId !== undefined) row.matchId = action.matchId;
    if (action.outText !== undefined) row.outText = action.outText;
    if (action.pts !== undefined) row.pts = action.pts;
    return sameStep(state);
  },

  async REVEAL_ANSWER_ONLY(state, action) {
    const row = state.final.runtime[mapKey(action.round)][action.idx];
    row.outText = shownText(row);
    row.revealedAnswer = true;
    row.revealedPoints = false;
    return { ...sameStep(state), soundCueKey: "reveal" };
  },

  async REVEAL_POINTS(state, action) {
    const f = state.final;
    const row = f.runtime[mapKey(action.round)][action.idx];
    const pts = row.kind === "MATCH" ? row.pts || 0 : 0;
    row.pts = pts;
    row.revealedPoints = true;
    if (!row._addedToSum) {
      f.runtime.sum += pts;
      row._addedToSum = true;
    }
    const soundCueKey = row.kind === "MATCH" ? "answer_correct" : "answer_wrong";
    const hitTarget = f.runtime.sum >= state.settings.finalTarget;
    if (hitTarget) {
      f.runtime.reached200 = true;
      return { ...gotoEnd(state), soundCueKey };
    }
    return { ...sameStep(state), soundCueKey };
  },

  // ---- F1->F2 / F8->F9: pierwsze wejście w mapowanie danej rundy ----
  async START_MAPPING(state, action) {
    return { step: `f_p${action.round}_map_q1`, phase: null, controlTeam: null, topCard: "final" };
  },

  // ---- kolejne pytanie / koniec bloku rundy ----
  async NEXT_QUESTION(state, action) {
    const nextIdx = action.idx + 1;
    if (action.round === 1) {
      if (nextIdx > 5) {
        return { step: "f_p2_start", phase: null, controlTeam: null, topCard: "final", soundCueKey: "round_transition" };
      }
      return { step: `f_p1_map_q${nextIdx}`, phase: null, controlTeam: null, topCard: "final" };
    }
    if (nextIdx > 5) return gotoEnd(state);
    return { step: `f_p2_map_q${nextIdx}`, phase: null, controlTeam: null, topCard: "final" };
  },

  // ---- F7->F8: start rundy 2 ----
  async START_P2_ROUND(state) {
    // Naprawiona luka (uzgodniona z Tobą): Host odsłania się razem z
    // Display, zamiast zostawać zasłonięty do końca gry jak dziś.
    state.host.covered = false;
    return { step: "f_p2_entry", phase: null, controlTeam: null, topCard: "final" };
  },

  // ---- F14: koniec finału ----
  async FINISH_FINAL(state) {
    if (state.locks.gameEnded) return null;
    const f = state.final;
    state.rounds.totals[f.winnerTeam] = (state.rounds.totals[f.winnerTeam] || 0) + f.runtime.sum;
    state.locks.gameEnded = true;
    return sameStep(state);
  },
};

export function createEngine({ store, loadQuestionPool, loadAnswers, now = Date.now }) {
  const deps = { loadQuestionPool, loadAnswers, now };

  async function dispatch(action) {
    const reducer = REDUCERS[action.type];
    if (!reducer) throw new Error(`Nieznana akcja: ${action.type}`);

    const result = await reducer(store.state, action, deps);
    if (!result) return null; // no-op, świadomie — akcja nie miała zastosowania

    // Tabela stanów jest tu MECHANIZMEM, nie dokumentacją: nielegalny skok
    // (błąd w reducerze, nieuwzględniona gałąź) rzuca zamiast po cichu
    // zepsuć stan gry.
    assertTransition(store.state.step, result.step);

    store.state.step = result.step;
    store.state.phase = result.phase ?? null;
    store.state.controlTeam = result.controlTeam ?? null;
    store.state.topCard = result.topCard ?? store.state.topCard;

    return store.commit({ soundCueKey: result.soundCueKey });
  }

  return { dispatch };
}
