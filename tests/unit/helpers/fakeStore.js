// Atrapa store.js do testów jednostkowych silników control2 — bez żadnego
// dostępu do sieci/Supabase. commit() tylko notuje wywołanie i powiadamia
// subskrybentów; state jest tym samym mutowalnym obiektem co w prawdziwym
// store (silniki mutują go bezpośrednio, tak jak dzisiejszy control/js).

import { makeDefaultState } from "../../../shared/gameStateShape.js";

export function createFakeStore(gameId = "test-game", overrides = {}) {
  const state = { ...makeDefaultState(gameId), ...overrides };
  const commits = [];
  const listeners = new Set();

  async function commit(opts = {}) {
    state.rev += 1;
    commits.push({ soundCueKey: opts.soundCueKey ?? null, snapshot: JSON.parse(JSON.stringify(state)) });
    for (const fn of listeners) fn(state);
    return state;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return { state, commit, subscribe, commits };
}
