// Testy silnika finału control2/js/engine.js (dispatch()) — pokrywają
// tabelę B w planie przebudowy (F0-F14), włącznie z naprawioną luką "Host
// odsłania się razem z Display" (plan, sekcja 2a).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine } from "../../control2/js/engine.js";
import { createFakeStore } from "./helpers/fakeStore.js";
import { DEFAULT_SETTINGS } from "../../shared/gameStateShape.js";
import { resolveFinalEndScreen } from "../../shared/endScreen.js";

const FAKE_PICKED_IDS = ["q1", "q2", "q3", "q4", "q5"];
const FAKE_QUESTIONS = FAKE_PICKED_IDS.map((id, i) => ({ id, ord: i + 1, text: `Pytanie finałowe ${i + 1}` }));
const FAKE_ANSWERS_BY_Q = new Map(
  FAKE_PICKED_IDS.map((id) => [id, [{ id: `${id}-a1`, ord: 1, text: "Odpowiedź A", fixed_points: 40 }]])
);

function makeEngine(settingsOverrides = {}, nowFn) {
  const store = createFakeStore("g1", {
    step: "f_start",
    topCard: "final",
    settings: { ...DEFAULT_SETTINGS, hasFinal: true, ...settingsOverrides },
    rounds: { ...createFakeStore().state.rounds, totals: { A: 350, B: 200 } },
    final: { ...createFakeStore().state.final, picked: FAKE_PICKED_IDS },
  });
  const engine = createEngine({
    store,
    now: nowFn || (() => 1_000_000),
    loadQuestions: async () => FAKE_QUESTIONS,
    loadAnswers: async (id) => FAKE_ANSWERS_BY_Q.get(id) || [],
  });
  return { store, dispatch: engine.dispatch };
}

async function matchAnswer(dispatch, round, idx, pts) {
  await dispatch({ type: "RESOLVE_MAPPING", round, idx, mode: "MANUAL", kind: "MATCH", outText: "Odpowiedź", pts });
  await dispatch({ type: "REVEAL_ANSWER_ONLY", round, idx });
  return dispatch({ type: "REVEAL_POINTS", round, idx });
}

test("START_FINAL: ustawia winnerTeam (wyższy wynik rund), zeruje sumę, zasłania Host, gra final_theme", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_FINAL" });
  assert.equal(store.state.final.winnerTeam, "A", "A ma wyższy totals (350 > 200)");
  assert.equal(store.state.final.runtime.sum, 0);
  assert.equal(store.state.host.covered, true);
  assert.equal(store.state.step, "f_p1_entry");
  assert.equal(store.commits.at(-1).soundCueKey, "final_theme");
});

test("START_FINAL: no-op gdy hasFinal!==true", async () => {
  const { store, dispatch } = makeEngine({ hasFinal: false });
  const result = await dispatch({ type: "START_FINAL" });
  assert.equal(result, null);
  assert.equal(store.state.step, "f_start", "stan bez zmian");
});

test("SET_ENTRY_TEXT/SET_REPEAT: zapisują tekst gracza i flagę powtórzenia (tylko runda 2)", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 0, text: "Mleko" });
  assert.equal(store.state.final.runtime.p1[0].text, "Mleko");

  await dispatch({ type: "SET_ENTRY_TEXT", round: 2, idx: 0, text: "Mleko" });
  await dispatch({ type: "SET_REPEAT", round: 2, idx: 0, repeat: true });
  assert.equal(store.state.final.runtime.p2[0].repeat, true);
  assert.equal(store.state.final.runtime.map2[0].kind, "SKIP", "powtórzenie wymuszone jako SKIP, nie osobny typ");
  assert.equal(store.commits.at(-1).soundCueKey, "answer_repeat");
});

test("SET_REPEAT: nie dotyczy rundy 1 (no-op)", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_FINAL" });
  const revBefore = store.state.rev;
  const result = await dispatch({ type: "SET_REPEAT", round: 1, idx: 0, repeat: true });
  assert.equal(result, null);
  assert.equal(store.state.rev, revBefore);
});

test("timer P1: START_TIMER ustawia endsAt +15s, EXPIRE_TIMER zatrzymuje i gra time_over, bez auto-przejścia", async () => {
  let t = 1_000_000;
  const { store, dispatch } = makeEngine({}, () => t);
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "START_TIMER", phase: "P1" });
  assert.equal(store.state.final.runtime.timer.running, true);
  assert.equal(store.state.final.runtime.timer.endsAt, t + 15_000);

  await dispatch({ type: "EXPIRE_TIMER" });
  assert.equal(store.state.final.runtime.timer.running, false);
  assert.equal(store.commits.at(-1).soundCueKey, "time_over");
  assert.equal(store.state.step, "f_p1_entry", "brak auto-przejścia do mapowania — operator klika ręcznie");
});

test("timer P2: 20s zamiast 15s", async () => {
  let t = 500_000;
  const { store, dispatch } = makeEngine({}, () => t);
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "START_TIMER", phase: "P2" });
  assert.equal(store.state.final.runtime.timer.endsAt, t + 20_000);
});

test("START_MAPPING: czyści timer, jeśli operator kliknął 'Dalej' zanim ten naturalnie wygasł (bez tego running=true zostałoby w zapisanym stanie na zawsze)", async () => {
  let t = 1_000_000;
  const { store, dispatch } = makeEngine({}, () => t);
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "START_TIMER", phase: "P1" });
  assert.equal(store.state.final.runtime.timer.running, true);

  t += 3_000; // operator klika "Dalej" po 3s, timer miał jeszcze 12s
  await dispatch({ type: "START_MAPPING", round: 1 });
  assert.equal(store.state.final.runtime.timer.running, false, "inaczej kolejny hydrate() fałszywie odpali EXPIRE_TIMER poza wpisywaniem");
  assert.equal(store.state.final.runtime.timer.endsAt, 0);
});

test("START_MAPPING: f_p1_entry -> f_p1_map_q1 (dozwolone przejście z tabeli)", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "START_MAPPING", round: 1 });
  assert.equal(store.state.step, "f_p1_map_q1");
});

test("mapowanie: 'pokaż odpowiedź' musi poprzedzać 'pokaż punkty' w danych (revealedAnswer przed revealedPoints)", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "START_MAPPING", round: 1 });
  await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 0, mode: "MANUAL", kind: "MATCH", outText: "Ser", pts: 25 });
  await dispatch({ type: "REVEAL_ANSWER_ONLY", round: 1, idx: 0 });
  assert.equal(store.state.final.runtime.map1[0].revealedAnswer, true);
  assert.equal(store.state.final.runtime.map1[0].revealedPoints, false);
  await dispatch({ type: "REVEAL_POINTS", round: 1, idx: 0 });
  assert.equal(store.state.final.runtime.map1[0].revealedPoints, true);
});

test("mapowanie: MATCH dolicza punkty do sumy raz, MISS dokłada 0 i gra answer_wrong", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "START_MAPPING", round: 1 });

  await matchAnswer(dispatch, 1, 0, 30);
  assert.equal(store.state.final.runtime.sum, 30);
  assert.equal(store.commits.at(-1).soundCueKey, "answer_correct");

  await dispatch({ type: "REVEAL_POINTS", round: 1, idx: 0 }); // ponownie — brak podwójnego liczenia
  assert.equal(store.state.final.runtime.sum, 30);

  await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 1, mode: "MANUAL", kind: "MISS", outText: "coś innego" });
  await dispatch({ type: "REVEAL_ANSWER_ONLY", round: 1, idx: 1 });
  await dispatch({ type: "REVEAL_POINTS", round: 1, idx: 1 });
  assert.equal(store.state.final.runtime.sum, 30, "MISS nie dokłada punktów");
  assert.equal(store.commits.at(-1).soundCueKey, "answer_wrong");
});

test("wcześniejsze wyjście: osiągnięcie finalTarget w trakcie rundy 1 przeskakuje od razu do f_end", async () => {
  const { store, dispatch } = makeEngine({ finalTarget: 50 });
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "START_MAPPING", round: 1 });
  const result = await matchAnswer(dispatch, 1, 0, 60); // 60 >= 50
  assert.ok(result); // commit zwrócony, nie null
  assert.equal(store.state.step, "f_end");
  assert.equal(store.state.final.runtime.reached200, true);
});

test("po f_p1_map_q5 bez wcześniejszego wyjścia -> f_p2_start (round_transition), START_P2_ROUND odsłania Host", async () => {
  const { store, dispatch } = makeEngine({ finalTarget: 999 }); // nigdy nie trafiony
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "START_MAPPING", round: 1 });
  for (let i = 0; i < 5; i++) {
    await matchAnswer(dispatch, 1, i, 5);
    await dispatch({ type: "NEXT_QUESTION", round: 1, idx: i + 1 });
  }
  assert.equal(store.state.step, "f_p2_start");
  assert.equal(store.commits.at(-1).soundCueKey, "round_transition");

  await dispatch({ type: "START_P2_ROUND" });
  assert.equal(store.state.step, "f_p2_entry");
  assert.equal(store.state.host.covered, false, "naprawiona luka: Host odsłania się razem z Display");
});

test("po f_p2_map_q5 bez wcześniejszego wyjścia -> f_end", async () => {
  const { store, dispatch } = makeEngine({ finalTarget: 999 });
  await dispatch({ type: "START_FINAL" });
  await dispatch({ type: "START_MAPPING", round: 1 });
  for (let i = 0; i < 5; i++) {
    await dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: i, mode: "MANUAL", kind: "SKIP" });
    await dispatch({ type: "REVEAL_ANSWER_ONLY", round: 1, idx: i });
    await dispatch({ type: "REVEAL_POINTS", round: 1, idx: i });
    await dispatch({ type: "NEXT_QUESTION", round: 1, idx: i + 1 });
  }
  await dispatch({ type: "START_P2_ROUND" });
  await dispatch({ type: "START_MAPPING", round: 2 });
  for (let i = 0; i < 5; i++) {
    await dispatch({ type: "RESOLVE_MAPPING", round: 2, idx: i, mode: "MANUAL", kind: "SKIP" });
    await dispatch({ type: "REVEAL_ANSWER_ONLY", round: 2, idx: i });
    await dispatch({ type: "REVEAL_POINTS", round: 2, idx: i });
    await dispatch({ type: "NEXT_QUESTION", round: 2, idx: i + 1 });
  }
  assert.equal(store.state.step, "f_end");
});

test("FINISH_FINAL: sumę finału wtapia w totals zwycięzcy, idempotentne", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_FINAL" }); // winner=A, totals.A=350
  await dispatch({ type: "START_MAPPING", round: 1 });
  await matchAnswer(dispatch, 1, 0, 40); // sum=40, finalTarget domyślnie 200 więc bez wcześniejszego wyjścia
  store.state.step = "f_end"; // symulacja dojścia do końca liniową ścieżką (już przetestowane wyżej)
  await dispatch({ type: "FINISH_FINAL" });
  assert.equal(store.state.rounds.totals.A, 390, "350 + 40");
  assert.equal(store.state.locks.gameEnded, true);

  const revAfterFirst = store.state.rev;
  const second = await dispatch({ type: "FINISH_FINAL" });
  assert.equal(second, null);
  assert.equal(store.state.rev, revAfterFirst);
});

test("resolveFinalEndScreen: 'points' i 'money' liczą różne kwoty (w odróżnieniu od rund bez finału)", () => {
  const settings = { endScreenMode: "points" };
  const pointsScreen = resolveFinalEndScreen(settings, { totalPointsAll: 400, hitTarget: true });
  assert.deepEqual(pointsScreen, { kind: "win", amount: 400 });

  const moneySettings = { endScreenMode: "money", finalPrizeMultiplier: 3, mainPrizeAmount: 25000 };
  const moneyScreen = resolveFinalEndScreen(moneySettings, { totalPointsAll: 400, hitTarget: true });
  assert.deepEqual(moneyScreen, { kind: "win", amount: 400 * 3 + 25000 });

  const moneyNoBonus = resolveFinalEndScreen(moneySettings, { totalPointsAll: 400, hitTarget: false });
  assert.deepEqual(moneyNoBonus, { kind: "win", amount: 400 * 3 });
});
