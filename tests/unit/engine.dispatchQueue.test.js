// Pokrywa control2/js/engine.js's dispatch()-owa kolejka — regresja na
// realny bug znaleziony na żywo w control2.spec.js's "pełna runda"
// (2026-09-11): test klikał kolejne kafle odsłaniania bez czekania na
// zapis (Playwright's .click() wraca, zanim async handler w app.js w ogóle
// zacznie czekać na sieć), więc dwa (czasem trzy) dispatch() nachodziły na
// siebie nad tym samym store.state — potwierdzone na żywo w logu CI
// (`[store] commit() NAKŁADA SIĘ — 3 równocześnie w locie`). Reducer ADD_X
// robi klasyczny odczyt-potem-zapis (`r.xA = (r.xA||0)+1`), więc dwa
// nakładające się dispatch("ADD_X") bez kolejki gubią jedną z dwóch zmian
// (drugi reducer czyta xA=0 sprzed zmiany pierwszego, zanim ten zdąży
// zmutować state) — dokładnie ten "lost update", który kolejka ma
// wykluczyć, nie tylko race w samym zapisie do bazy (to osobna warstwa,
// store.js's retry na stale_write).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../../control2/js/engine.js";
import { makeDefaultState } from "../../shared/gameStateShape.js";

// Atrapa store z KONTROLOWANYM opóźnieniem w commit() — żeby zamodelować
// dokładnie ten scenariusz z na żywo: drugi dispatch() startuje, zanim
// pierwszy zdążył dokończyć swój (asynchroniczny) zapis.
function createDelayedFakeStore(overrides = {}) {
  const state = { ...makeDefaultState("g1"), ...overrides };
  const commits = [];
  let inFlight = 0;
  let maxConcurrent = 0;

  async function commit(opts = {}) {
    inFlight++;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    await new Promise((r) => setTimeout(r, 15)); // symuluje realny round-trip do bazy
    inFlight--;
    state.rev += 1;
    commits.push({ soundCueKey: opts.soundCueKey ?? null, xA: state.rounds.xA, xB: state.rounds.xB });
    return state;
  }

  return { state, commit, commits, getMaxConcurrent: () => maxConcurrent };
}

test("dispatch: dwa nakładające się ADD_X (bez await między nimi) NIE gubią żadnej zmiany — kolejka serializuje reducer+commit", async () => {
  const store = createDelayedFakeStore({
    step: "r_play", topCard: "rounds", phase: "PLAY", controlTeam: "A",
    rounds: { xA: 0, xB: 0, answers: [{ ord: 1 }, { ord: 2 }, { ord: 3 }, { ord: 4 }], revealed: [], allowPass: true, duel: {}, steal: { active: false } },
  });
  const engine = createEngine({ store, loadQuestionPool: async () => [], loadAnswers: async () => [] });

  // Zgłoszone na żywo: BEZ await między dwoma dispatch() — dokładnie tak,
  // jak Playwright's .click() x2 robi w armAndConfirm() (drugi start, zanim
  // pierwszy zdąży dotrzeć do sieci).
  const p1 = engine.dispatch({ type: "ADD_X" });
  const p2 = engine.dispatch({ type: "ADD_X" });
  await Promise.all([p1, p2]);

  assert.equal(store.state.rounds.xA, 2, "obie zmiany muszą się policzyć, nie tylko jedna (lost update)");
  assert.equal(store.commits.length, 2, "dwa osobne, potwierdzone zapisy");
  assert.equal(store.getMaxConcurrent(), 1, "commit() nigdy nie miał więcej niż 1 w locie naraz — brak nakładania się");
  // Kolejność: pierwszy zapis widzi xA=1 (tylko swoją zmianę), drugi już
  // widzi skumulowane xA=2 — dowód, że #2 wystartował PO tym, jak #1 w
  // pełni osiadł (reducer #2 czytał już zmutowany przez #1 stan), a nie
  // równolegle z nim.
  assert.deepEqual(store.commits.map((c) => c.xA), [1, 2]);
});

test("dispatch: trzy nakładające się ADD_X — wszystkie trzy liczą się po kolei", async () => {
  const store = createDelayedFakeStore({
    step: "r_play", topCard: "rounds", phase: "PLAY", controlTeam: "B",
    rounds: { xA: 0, xB: 0, answers: [{ ord: 1 }, { ord: 2 }, { ord: 3 }, { ord: 4 }], revealed: [], allowPass: true, duel: {}, steal: { active: false } },
  });
  const engine = createEngine({ store, loadQuestionPool: async () => [], loadAnswers: async () => [] });

  const results = await Promise.all([
    engine.dispatch({ type: "ADD_X" }),
    engine.dispatch({ type: "ADD_X" }),
    engine.dispatch({ type: "ADD_X" }),
  ]);

  assert.equal(store.state.rounds.xB, 3);
  assert.equal(store.commits.length, 3);
  assert.equal(store.getMaxConcurrent(), 1);
  assert.deepEqual(store.commits.map((c) => c.xB), [1, 2, 3]);
  assert.equal(results.filter(Boolean).length, 3, "żaden dispatch nie zwrócił null/no-op");
});
