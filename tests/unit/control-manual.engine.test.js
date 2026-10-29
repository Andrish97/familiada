// Podręcznik 17.3–17.4 (prowadzenie rund i finału) — czynności operatora
// w wariancie „źle albo podejrzanie”: drugie kliknięcie, akcja nie w porę,
// akcja z kolejki po zmianie stanu. Silnik control/js/engine.js ma wtedy
// nic nie zmieniać (no-op), a stan gry zostaje taki, jak opisuje podręcznik.
// Szczęśliwe ścieżki: rounds.engine.test.js i final.engine.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../../web/control/js/engine.js";
import { createFakeStore } from "./helpers/fakeStore.js";
import { DEFAULT_SETTINGS } from "../../web/shared/js/gameplay/gameStateShape.js";

function roundsEngine(overrides = {}, now = () => 1_000_000) {
  const store = createFakeStore("g1", { step: "r_roundStart", topCard: "rounds", phase: "READY", ...overrides });
  const pool = Array.from({ length: 3 }, (_, i) => ({ id: `q${i + 1}`, ord: i + 1, text: `Pytanie ${i + 1}` }));
  const engine = createEngine({
    store,
    now,
    loadQuestionPool: async () => pool.slice(),
    loadAnswers: async (qid) => [
      { id: `${qid}-a1`, ord: 1, text: "Najlepsza", fixed_points: 40 },
      { id: `${qid}-a2`, ord: 2, text: "Druga", fixed_points: 30 },
      { id: `${qid}-a3`, ord: 3, text: "Trzecia", fixed_points: 20 },
      { id: `${qid}-a4`, ord: 4, text: "Czwarta", fixed_points: 10 },
    ],
  });
  return { store, dispatch: engine.dispatch };
}

// Runda po wygranym pojedynku drużyny A (A trafiła #1 = 40 pkt), faza PLAY.
async function playAfterDuel(opts) {
  const e = roundsEngine(opts);
  await e.dispatch({ type: "START_ROUND" });
  await e.dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await e.dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  return e;
}

async function threeStrikes(dispatch) {
  for (let i = 0; i < 3; i++) await dispatch({ type: "ADD_X" });
}

const snapshot = (store) => JSON.stringify({ ...store.state, rev: 0 });

test("17.3 Oddaj kontrolę: niedostępne w pojedynku, po pierwszym X drużyny i drugi raz w rundzie", async () => {
  const duel = roundsEngine();
  await duel.dispatch({ type: "START_ROUND" });
  await duel.dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  assert.equal(await duel.dispatch({ type: "PASS" }), null, "w pojedynku nikt jeszcze nie ma kontroli");

  const afterX = await playAfterDuel();
  assert.equal(afterX.store.state.rounds.allowPass, true);
  await afterX.dispatch({ type: "ADD_X" }); // pierwsza odpowiedź drużyny to pudło
  assert.equal(afterX.store.state.rounds.allowPass, false);
  assert.equal(await afterX.dispatch({ type: "PASS" }), null);
  assert.equal(afterX.store.state.controlTeam, "A", "kontrola zostaje przy drużynie, która wygrała pojedynek");

  const afterHit = await playAfterDuel();
  await afterHit.dispatch({ type: "REVEAL_ANSWER", ord: 2 }); // pierwsza odpowiedź drużyny trafiona
  assert.equal(await afterHit.dispatch({ type: "PASS" }), null);
  assert.equal(afterHit.store.state.controlTeam, "A");
});

test("17.3 odsłonięcie: ta sama odpowiedź drugi raz i numer spoza tablicy nie zmieniają puli", async () => {
  const { store, dispatch } = await playAfterDuel();
  const before = snapshot(store);
  assert.equal(await dispatch({ type: "REVEAL_ANSWER", ord: 1 }), null, "odpowiedź #1 jest już odsłonięta");
  assert.equal(await dispatch({ type: "REVEAL_ANSWER", ord: 7 }), null, "skrót 7 nie istnieje na tablicy");
  assert.equal(await dispatch({ type: "REVEAL_ANSWER", ord: 0 }), null);
  assert.equal(snapshot(store), before);
  assert.equal(store.state.rounds.bankPts, 40);
});

test("17.3 X: licznik kończy się na 3 / 3 i trzeci X oddaje kradzież, a nie czwarty błąd", async () => {
  const { store, dispatch } = await playAfterDuel();
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" });
  assert.equal(store.state.rounds.xA, 2);
  assert.equal(store.state.phase, "PLAY");
  await dispatch({ type: "ADD_X" });
  assert.equal(store.state.rounds.xA, 3);
  assert.equal(store.state.phase, "STEAL");
  assert.equal(store.state.rounds.xB, 0, "kradzież nie dolicza X przeciwnikom");
});

test("17.3 kradzież rozstrzygnięta: spóźnione odsłonięcie nie dokłada punktów do puli", async () => {
  // Podręcznik: przeciwnicy podają JEDNĄ odpowiedź. Po rozstrzygnięciu
  // zostaje tylko [Zakończ rundę]; pozostałe odpowiedzi odsłania się dopiero
  // po końcu rundy i nie dają punktów.
  for (const resolve of [{ type: "REVEAL_ANSWER", ord: 2 }, { type: "ADD_X" }]) {
    const { store, dispatch } = await playAfterDuel();
    await threeStrikes(dispatch);
    await dispatch(resolve);
    assert.equal(store.state.rounds.canEndRound, true);
    const bank = store.state.rounds.bankPts;
    const won = store.state.rounds.steal.won;
    assert.equal(await dispatch({ type: "REVEAL_ANSWER", ord: 3 }), null, `${resolve.type}: drugie odsłonięcie w kradzieży`);
    assert.equal(store.state.rounds.bankPts, bank);
    assert.ok(!store.state.rounds.revealed.includes(3), "odpowiedź zostaje do odsłonięcia po końcu rundy");
    assert.equal(await dispatch({ type: "ADD_X" }), null, `${resolve.type}: X po rozstrzygnięciu kradzieży`);
    assert.equal(store.state.rounds.steal.won, won, "wynik kradzieży się nie odwraca");
  }
});

test("17.3 kradzież: pudło zostawia pulę drużynie grającej, trafienie przenosi ją do przeciwników", async () => {
  const lost = await playAfterDuel();
  await threeStrikes(lost.dispatch);
  await lost.dispatch({ type: "ADD_X" });
  await lost.dispatch({ type: "END_ROUND" });
  assert.deepEqual(lost.store.state.rounds.totals, { A: 40, B: 0 });

  const won = await playAfterDuel();
  await threeStrikes(won.dispatch);
  await won.dispatch({ type: "REVEAL_ANSWER", ord: 2 });
  await won.dispatch({ type: "END_ROUND" });
  assert.deepEqual(won.store.state.rounds.totals, { A: 0, B: 70 });
});

test("17.3 odliczanie 3 s: drugi start w trakcie odliczania nie przedłuża czasu", async () => {
  let now = 1_000_000;
  const { store, dispatch } = await playAfterDuel({}, () => now);
  await dispatch({ type: "START_TIMER3" });
  const endsAt = store.state.rounds.timer3.endsAt;
  now += 2000;
  assert.equal(await dispatch({ type: "START_TIMER3" }), null);
  assert.equal(store.state.rounds.timer3.endsAt, endsAt);
  await dispatch({ type: "CANCEL_TIMER3" }); // ponowne kliknięcie kafla zegarka
  assert.equal(store.state.rounds.timer3.running, false);
  assert.equal(store.state.rounds.xA, 0, "wyłączenie odliczania nie daje X");
  assert.equal(await dispatch({ type: "EXPIRE_TIMER3" }), null, "spóźniony koniec czasu po wyłączeniu nie daje X");
  assert.equal(store.state.rounds.xA, 0);
});

test("17.3 odsłanianie po końcu rundy nie zmienia wyników drużyn", async () => {
  const { store, dispatch } = await playAfterDuel();
  await threeStrikes(dispatch);
  await dispatch({ type: "ADD_X" }); // kradzież nieudana
  await dispatch({ type: "END_ROUND" });
  assert.equal(store.state.phase, "REVEAL");
  const totals = { ...store.state.rounds.totals };
  for (const ord of [2, 3, 4]) await dispatch({ type: "REVEAL_ANSWER", ord });
  assert.deepEqual(store.state.rounds.totals, totals);
  assert.equal(store.state.rounds.bankPts, 0);
  assert.equal(await dispatch({ type: "REVEAL_ANSWER", ord: 2 }), null, "drugie odsłonięcie tej samej odpowiedzi");
  await dispatch({ type: "END_ROUND" }); // drugie kliknięcie: pula jest już rozdana
  assert.deepEqual(store.state.rounds.totals, totals);
});

test("17.3 Ponów naciśnięcie i Zatwierdź po rozpoczęciu rozgrywki nic nie cofają", async () => {
  const { store, dispatch } = await playAfterDuel();
  const before = snapshot(store);
  assert.equal(await dispatch({ type: "RETRY_DUEL" }), null);
  assert.equal(await dispatch({ type: "ACCEPT_BUZZ", team: "B" }), null, "spóźnione zatwierdzenie zgłoszenia");
  assert.equal(snapshot(store), before);
  assert.equal(store.state.controlTeam, "A");
  assert.equal(store.state.phase, "PLAY");
});

// ---- Finał ----

const PICKED = ["q1", "q2", "q3", "q4", "q5"];
function finalEngine(settings = {}, { picked = PICKED, now = () => 1_000_000 } = {}) {
  const store = createFakeStore("g1", {
    step: "f_start",
    topCard: "final",
    settings: { ...DEFAULT_SETTINGS, hasFinal: true, ...settings },
    rounds: { ...createFakeStore().state.rounds, totals: { A: 350, B: 200 } },
    final: { ...createFakeStore().state.final, picked },
  });
  const engine = createEngine({
    store,
    now,
    loadQuestions: async () => PICKED.map((id, i) => ({ id, ord: i + 1, text: `Pytanie finałowe ${i + 1}` })),
    loadAnswers: async (id) => [
      { id: `${id}-a1`, ord: 1, text: "Pierwsza", fixed_points: 40 },
      { id: `${id}-a2`, ord: 2, text: "Druga", fixed_points: 20 },
    ],
  });
  return { store, dispatch: engine.dispatch };
}

test("17.2/17.4 finał bez 5 pytań nie startuje", async () => {
  const { store, dispatch } = finalEngine({}, { picked: PICKED.slice(0, 4) });
  assert.equal(await dispatch({ type: "START_FINAL" }), null);
  assert.equal(store.state.step, "f_start");
});

test("17.4 wpisywanie: zegar nie rusza sam, drugi start gracza 1 jest niemożliwy, poprawka wpisu po czasie działa", async () => {
  let now = 1_000_000;
  const { store, dispatch } = finalEngine({}, { now: () => now });
  await dispatch({ type: "START_FINAL" });
  assert.equal(store.state.final.runtime.timer.running, false, "zegar czeka na operatora");
  assert.equal(await dispatch({ type: "START_MAPPING", round: 1 }), null, "bez wykorzystania zegara nie ma oceny");
  await dispatch({ type: "START_TIMER", phase: "P1" });
  await dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 0, text: "Kawa" });
  assert.equal(await dispatch({ type: "EXPIRE_TIMER" }), null, "przed upływem czasu i bez pięciu odpowiedzi zegar biegnie");
  now += 15_000;
  await dispatch({ type: "EXPIRE_TIMER" });
  assert.equal(store.state.final.runtime.timer.running, false);
  assert.equal(await dispatch({ type: "START_TIMER", phase: "P1" }), null, "gracz 1 nie dostaje drugiego zegara");
  await dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 0, text: "Kawka" });
  assert.equal(store.state.final.runtime.p1[0].text, "Kawka", "literówkę można poprawić po czasie");
  await dispatch({ type: "START_MAPPING", round: 1 });
  assert.equal(store.state.step, "f_p1_map_q1", "po upływie czasu przechodzimy dalej także z brakami");
});

test("17.4 ocena: po [Pokaż odpowiedź] nie zmienisz ani wpisu, ani dopasowania", async () => {
  const { store, dispatch } = finalEngine();
  await dispatch({ type: "START_FINAL" });
  store.state.final.runtime.timer.usedP1 = true;
  await dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 0, text: "Pierwsza" });
  await dispatch({ type: "START_MAPPING", round: 1 });
  await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 0, mode: "MANUAL", kind: "MATCH", outText: "Pierwsza", pts: 40 });
  await dispatch({ type: "REVEAL_ANSWER_ONLY", round: 1, idx: 0 });
  const row = JSON.stringify(store.state.final.runtime.map1[0]);
  assert.equal(await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 0, mode: "MANUAL", kind: "MATCH", outText: "Druga", pts: 20 }), null);
  assert.equal(await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 0, mode: "MANUAL", kind: "MISS", outText: "Pierwsza" }), null);
  assert.equal(await dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 0, text: "Inna" }), null);
  assert.equal(JSON.stringify(store.state.final.runtime.map1[0]), row);
  assert.equal(store.state.final.runtime.sum, 0, "suma rośnie dopiero przy [Pokaż punkty]");
  await dispatch({ type: "REVEAL_POINTS", round: 1, idx: 0 });
  await dispatch({ type: "REVEAL_POINTS", round: 1, idx: 0 });
  assert.equal(store.state.final.runtime.sum, 40, "drugie [Pokaż punkty] nie dolicza ponownie");
});

test("17.4 ocena: pusty wpis nie może być „z listy” ani „nie ma na liście”, tekst nie może być „brak odpowiedzi”", async () => {
  const { store, dispatch } = finalEngine();
  await dispatch({ type: "START_FINAL" });
  store.state.final.runtime.timer.usedP1 = true;
  await dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 1, text: "Coś" });
  await dispatch({ type: "START_MAPPING", round: 1 });
  assert.equal(await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 0, mode: "MANUAL", kind: "MATCH", outText: "Pierwsza", pts: 40 }), null);
  assert.equal(await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 0, mode: "MANUAL", kind: "MISS", outText: "" }), null);
  assert.equal(await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 1, mode: "MANUAL", kind: "SKIP" }), null);
  assert.equal(store.state.final.runtime.map1[0].kind, null);
  assert.equal(store.state.final.runtime.map1[1].kind, null);
});

test("17.4 gracz 1 nie ma [Powtórzenie]; u gracza 2 tylko w pustym polu", async () => {
  const { store, dispatch } = finalEngine();
  await dispatch({ type: "START_FINAL" });
  assert.equal(await dispatch({ type: "SET_REPEAT", round: 1, idx: 0, repeat: true }), null);
  assert.equal(store.state.final.runtime.p1[0], null);
});

test("17.4 cel osiągnięty: dalsza ocena zablokowana, zostaje tylko [Zakończ finał]", async () => {
  const { store, dispatch } = finalEngine({ finalTarget: 40 });
  await dispatch({ type: "START_FINAL" });
  store.state.final.runtime.timer.usedP1 = true;
  await dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 0, text: "Pierwsza" });
  await dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 1, text: "Pierwsza" });
  await dispatch({ type: "START_MAPPING", round: 1 });
  await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 0, mode: "MANUAL", kind: "MATCH", outText: "Pierwsza", pts: 40 });
  await dispatch({ type: "REVEAL_ANSWER_ONLY", round: 1, idx: 0 });
  await dispatch({ type: "REVEAL_POINTS", round: 1, idx: 0 });
  assert.equal(store.state.final.runtime.reached200, true);
  const before = snapshot(store);
  assert.equal(await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 1, mode: "MANUAL", kind: "MATCH", outText: "Pierwsza", pts: 40 }), null);
  assert.equal(await dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 1, text: "Zmiana" }), null);
  assert.equal(snapshot(store), before);
  await dispatch({ type: "NEXT_QUESTION", round: 1, idx: 1 });
  assert.equal(store.state.step, "f_end", "[Zakończ finał] prowadzi do końca finału, nie do gracza 2");
  await dispatch({ type: "FINISH_FINAL" });
  assert.equal(store.state.rounds.totals.A, 390);
  assert.equal(await dispatch({ type: "FINISH_FINAL" }), null, "drugie [Zakończ finał] nie dolicza sumy ponownie");
  assert.equal(store.state.rounds.totals.A, 390);
});
