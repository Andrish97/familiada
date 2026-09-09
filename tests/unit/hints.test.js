// Testy shared/hints.js — czysta funkcja stanu, bez DOM. Chodzi o to samo
// zachowanie co dawne ROUNDS_MSG/FINAL_MSG w control/js/gameRounds.js i
// gameFinal.js, tylko wyprowadzone z bieżącego game_state, nie z
// imperatywnych setXMsg() wołanych przy każdym zdarzeniu.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getRoundsHint, getFinalHint } from "../../shared/hints.js";
import { createEngine } from "../../control2/js/engine.js";
import { createFakeStore } from "./helpers/fakeStore.js";
import { DEFAULT_SETTINGS } from "../../shared/gameStateShape.js";

function questionPool(n = 3) {
  return Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}`, ord: i + 1, text: `Pytanie ${i + 1}` }));
}
function answersFor(questionId) {
  return [
    { id: `${questionId}-a1`, ord: 1, text: "Najlepsza", fixed_points: 40 },
    { id: `${questionId}-a2`, ord: 2, text: "Druga", fixed_points: 30 },
    { id: `${questionId}-a3`, ord: 3, text: "Trzecia", fixed_points: 20 },
    { id: `${questionId}-a4`, ord: 4, text: "Czwarta", fixed_points: 10 },
  ];
}
function makeEngine(overrides = {}) {
  const store = createFakeStore("g1", { step: "r_roundStart", topCard: "rounds", phase: "READY", ...overrides });
  const pool = questionPool();
  const engine = createEngine({
    store,
    loadQuestionPool: async () => pool.slice(),
    loadAnswers: async (qid) => answersFor(qid),
  });
  return { store, dispatch: engine.dispatch };
}

test("getRoundsHint: r_intro/r_roundStart pokazują statyczne podpowiedzi", () => {
  const { store } = makeEngine();
  store.state.step = "r_intro";
  assert.match(getRoundsHint(store.state), /Gra gotowa/);
  store.state.step = "r_roundStart";
  assert.match(getRoundsHint(store.state), /Runda 1 gotowa/);
});

test("getRoundsHint: r_duel przed zgłoszeniem — inny tekst dla physicalBuzzer i normalnego trybu", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  assert.match(getRoundsHint(store.state), /Czekam na zgłoszenie/);

  const phys = makeEngine({ settings: { ...DEFAULT_SETTINGS, physicalBuzzer: true } });
  await phys.dispatch({ type: "START_ROUND" });
  assert.match(getRoundsHint(phys.store.state), /Obserwuj, kto nacisnął/);
});

test("getRoundsHint: r_duel po zgłoszeniu (przed przyjęciem) pokazuje kto się zgłosił", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  store.state.rounds.duel.lastPressed = "A";
  assert.match(getRoundsHint(store.state), /Pierwsza: Drużyna A/);
});

test("getRoundsHint: faza DUEL po ACCEPT_BUZZ — pierwsza i druga próba mają różny tekst", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  assert.match(getRoundsHint(store.state), /Pojedynek — odpowiada: Drużyna A/);

  await dispatch({ type: "REVEAL_ANSWER", ord: 3 }); // nie-topowa -> CONTINUE_SECOND
  assert.match(getRoundsHint(store.state), /Teraz odpowiada: Drużyna B/);
});

// Hinty celowo NIE powtarzają, kto ma kontrolę/ile jest w banku — to już
// pokazuje pasek statusu pod siatką (control2/js/ui.js) — tylko podpowiadają
// kolejny krok operatora.
test("getRoundsHint: faza PLAY — z opcją oddania pytania vs bez", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 }); // WIN -> PLAY, allowPass=true
  assert.match(getRoundsHint(store.state), /Może zagrać dalej albo oddać kontrolę/);

  await dispatch({ type: "REVEAL_ANSWER", ord: 2 }); // allowPass -> false
  assert.equal(getRoundsHint(store.state), "Wskaż trafioną odpowiedź albo kliknij X (pudło).");
});

test("getRoundsHint: faza STEAL — przed i po rozstrzygnięciu", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" }); // STEAL, drużyna B
  assert.match(getRoundsHint(store.state), /Szansa na kradzież. Kliknij trafioną odpowiedź/);

  await dispatch({ type: "ADD_X" }); // B pudłuje kradzież
  assert.match(getRoundsHint(store.state), /Kradzież nietrafiona/);
});

test("getFinalHint: f_start i etap wpisywania (zegarek jeszcze nieużyty / w trakcie / wykorzystany)", async () => {
  let t = 1_000_000;
  const store = createFakeStore("g1", { settings: { ...DEFAULT_SETTINGS, hasFinal: true }, final: { picked: ["q1", "q2", "q3", "q4", "q5"], confirmed: true, winnerTeam: null, questions: [], runtime: {} }, rounds: { totals: { A: 300, B: 0 } }, step: "f_start", topCard: "final" });
  const engine = createEngine({
    store,
    loadQuestions: async () => Array.from({ length: 5 }, (_, i) => ({ id: `q${i + 1}`, text: `Pytanie ${i + 1}` })),
    loadAnswers: async () => [{ id: "a1", text: "Odp", fixed_points: 10 }],
    now: () => t,
  });

  assert.match(getFinalHint(store.state), /Start finału/);

  await engine.dispatch({ type: "START_FINAL" });
  assert.match(getFinalHint(store.state), /Wpisz odpowiedzi gracza 1.*15s/);

  // Hint zostaje ten sam podczas odliczania — nie chowamy go (zgłoszone).
  await engine.dispatch({ type: "START_TIMER", phase: "P1" });
  assert.match(getFinalHint(store.state), /Wpisz odpowiedzi gracza 1.*15s/);

  await engine.dispatch({ type: "EXPIRE_TIMER" });
  assert.match(getFinalHint(store.state), /Czas wykorzystany/);
});

test("getFinalHint: mapowanie pytania — puste, wpisane, odsłonięte, z punktami; powtórzenie u gracza 2", async () => {
  let t = 1_000_000;
  const store = createFakeStore("g1", { settings: { ...DEFAULT_SETTINGS, hasFinal: true }, final: { picked: ["q1", "q2", "q3", "q4", "q5"], confirmed: true, winnerTeam: null, questions: [], runtime: {} }, rounds: { totals: { A: 300, B: 0 } }, step: "f_start", topCard: "final" });
  const engine = createEngine({
    store,
    loadQuestions: async () => Array.from({ length: 5 }, (_, i) => ({ id: `q${i + 1}`, text: `Pytanie ${i + 1}` })),
    loadAnswers: async () => [{ id: "a1", text: "Mleko", fixed_points: 10 }],
    now: () => t,
  });
  await engine.dispatch({ type: "START_FINAL" });
  await engine.dispatch({ type: "START_MAPPING", round: 1 });

  // Rozstrzygnięcie jest zawsze już jakieś (domyślne MISS/SKIP) — hint nie
  // różnicuje już puste/wpisane, tylko mówi "potwierdź, żeby odsłonić".
  assert.match(getFinalHint(store.state), /potwierdź „Pokaż odpowiedź”/);

  await engine.dispatch({ type: "SET_ENTRY_TEXT", round: 1, idx: 0, text: "Mleko" });
  assert.match(getFinalHint(store.state), /potwierdź „Pokaż odpowiedź”/);

  await engine.dispatch({ type: "RESOLVE_MAPPING", round: 1, idx: 0, mode: "MANUAL", kind: "MATCH", matchId: "a1", outText: "Mleko", pts: 10 });
  await engine.dispatch({ type: "REVEAL_ANSWER_ONLY", round: 1, idx: 0 });
  assert.match(getFinalHint(store.state), /„Pokaż punkty”/);

  await engine.dispatch({ type: "REVEAL_POINTS", round: 1, idx: 0 });
  assert.match(getFinalHint(store.state), /Punkty odsłonięte/);
});

test("getFinalHint: powtórzenie u gracza 2 nadpisuje zwykłą podpowiedź mapowania", async () => {
  let t = 1_000_000;
  const store = createFakeStore("g1", { settings: { ...DEFAULT_SETTINGS, hasFinal: true, finalTarget: 999 }, final: { picked: ["q1", "q2", "q3", "q4", "q5"], confirmed: true, winnerTeam: null, questions: [], runtime: {} }, rounds: { totals: { A: 300, B: 0 } }, step: "f_start", topCard: "final" });
  const engine = createEngine({
    store,
    loadQuestions: async () => Array.from({ length: 5 }, (_, i) => ({ id: `q${i + 1}`, text: `Pytanie ${i + 1}` })),
    loadAnswers: async () => [{ id: "a1", text: "Mleko", fixed_points: 10 }],
    now: () => t,
  });
  await engine.dispatch({ type: "START_FINAL" });
  await engine.dispatch({ type: "START_MAPPING", round: 1 });
  for (let i = 0; i < 5; i++) await engine.dispatch({ type: "NEXT_QUESTION", round: 1, idx: i + 1 });
  await engine.dispatch({ type: "START_P2_ROUND" });
  await engine.dispatch({ type: "START_MAPPING", round: 2 });

  assert.match(getFinalHint(store.state), /potwierdź „Pokaż odpowiedź”/);

  await engine.dispatch({ type: "SET_REPEAT", round: 2, idx: 0, repeat: true });
  assert.match(getFinalHint(store.state), /Oznaczone jako powtórzenie/);
});
