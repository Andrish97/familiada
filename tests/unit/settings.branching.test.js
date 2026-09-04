// Testy rozgałęzień sterowanych ustawieniami (detail.settings) — patrz plan
// przebudowy, sekcja 2 "Rozgałęzienie" w tabelach A/B: ustawienia to część
// tego samego wiersza stanu, nie osobny byt, więc te testy idą przez pełne
// przejścia silnika (dispatch), nie przez wyimaginowane gettery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../../control2/js/engine.js";
import { createFakeStore } from "./helpers/fakeStore.js";
import { DEFAULT_SETTINGS } from "../../shared/gameStateShape.js";
import { resolveRoundsEndScreen, resolveEndScreenMode } from "../../shared/endScreen.js";

function questionPool(n = 1) {
  return Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}`, ord: i + 1, text: `Pytanie ${i + 1}` }));
}
function answersFor(questionId) {
  return [{ id: `${questionId}-a1`, ord: 1, text: "Odp", fixed_points: 100 }];
}

function makeEngine(settingsOverrides) {
  const store = createFakeStore("g1", {
    step: "r_roundStart",
    topCard: "rounds",
    phase: "READY",
    settings: { ...DEFAULT_SETTINGS, ...settingsOverrides },
  });
  const pool = questionPool();
  const engine = createEngine({
    store,
    loadQuestionPool: async () => pool.slice(),
    loadAnswers: async (qid) => answersFor(qid),
  });
  return { store, dispatch: engine.dispatch };
}

async function playOneRoundHittingThreshold(dispatch) {
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" }); // trafienie w jedyną (najwyżej punktowaną) odpowiedź -> WIN natychmiast
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  await dispatch({ type: "END_ROUND" });
}

test("hasFinal=null: próg osiągnięty, ale brak finału -> r_gameEnd", async () => {
  const { store, dispatch } = makeEngine({ hasFinal: null, finalMinPoints: 50 });
  await playOneRoundHittingThreshold(dispatch);
  assert.equal(store.state.step, "r_gameEnd");
  assert.equal(store.state.topCard, "rounds");
});

test("hasFinal=false: identycznie jak null -> r_gameEnd", async () => {
  const { store, dispatch } = makeEngine({ hasFinal: false, finalMinPoints: 50 });
  await playOneRoundHittingThreshold(dispatch);
  assert.equal(store.state.step, "r_gameEnd");
});

test("hasFinal=true + finalQuestionsMode='random': próg osiągnięty -> od razu wchodzi do finału, bez wymogu potwierdzenia", async () => {
  const { store, dispatch } = makeEngine({ hasFinal: true, finalQuestionsMode: "random", finalMinPoints: 50 });
  await playOneRoundHittingThreshold(dispatch);
  assert.equal(store.state.step, "f_start");
  assert.equal(store.state.topCard, "final");
});

test("hasFinal=true + finalQuestionsMode='pick' + NIE potwierdzone -> blokada, r_gameEnd zamiast finału", async () => {
  const { store, dispatch } = makeEngine({ hasFinal: true, finalQuestionsMode: "pick", finalMinPoints: 50 });
  store.state.final.confirmed = false;
  store.state.final.picked = [];
  await playOneRoundHittingThreshold(dispatch);
  assert.equal(store.state.step, "r_gameEnd", "5 niepotwierdzonych pytań finału blokuje wejście");
});

test("hasFinal=true + finalQuestionsMode='pick' + potwierdzone 5 pytań -> wchodzi do finału", async () => {
  const { store, dispatch } = makeEngine({ hasFinal: true, finalQuestionsMode: "pick", finalMinPoints: 50 });
  store.state.final.confirmed = true;
  store.state.final.picked = ["a", "b", "c", "d", "e"];
  await playOneRoundHittingThreshold(dispatch);
  assert.equal(store.state.step, "f_start");
});

test("hasFinal=true + finalQuestionsMode='pick' + potwierdzone ale niepełne (4/5) -> nadal zablokowane", async () => {
  const { store, dispatch } = makeEngine({ hasFinal: true, finalQuestionsMode: "pick", finalMinPoints: 50 });
  store.state.final.confirmed = true;
  store.state.final.picked = ["a", "b", "c", "d"];
  await playOneRoundHittingThreshold(dispatch);
  assert.equal(store.state.step, "r_gameEnd");
});

test("resolveEndScreenMode: rozpoznaje logo/points/money, fallback na winEnabled dla starych gier", () => {
  assert.equal(resolveEndScreenMode({ endScreenMode: "logo" }), "logo");
  assert.equal(resolveEndScreenMode({ endScreenMode: "points" }), "points");
  assert.equal(resolveEndScreenMode({ endScreenMode: "money" }), "money");
  assert.equal(resolveEndScreenMode({ winEnabled: true }), "points");
  assert.equal(resolveEndScreenMode({}), "logo");
});

test("resolveRoundsEndScreen: remis zawsze pokazuje logo, niezależnie od endScreenMode", () => {
  const screen = resolveRoundsEndScreen({ endScreenMode: "money" }, { isDraw: true, totals: { A: 500, B: 500 } });
  assert.deepEqual(screen, { kind: "logo" });
});

test("resolveRoundsEndScreen: 'money' bez finału traktowane identycznie jak 'points' (brak realnej kwoty do policzenia)", () => {
  const points = resolveRoundsEndScreen({ endScreenMode: "points" }, { isDraw: false, totals: { A: 500, B: 300 } });
  const money = resolveRoundsEndScreen({ endScreenMode: "money" }, { isDraw: false, totals: { A: 500, B: 300 } });
  assert.deepEqual(points, { kind: "win", amount: 500 });
  assert.deepEqual(money, { kind: "win", amount: 500 }, "w przeciwieństwie do finału, tu money===points");
});
