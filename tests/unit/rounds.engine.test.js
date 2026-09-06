// Testy silnika rund control2/js/engine.js (dispatch()) — pokrywają
// rozgałęzienia z tabeli stanów A w planie przebudowy (R0-R10). Każda
// akcja idzie przez jeden generyczny dispatch(), który sam egzekwuje
// shared/gameStateMachine.js (assertTransition) — jeśli reducer kiedyś
// zaproponuje nielegalny skok, te testy i tak by to złapały (dispatch by
// rzucił), więc nie trzeba tego osobno asercjonować w każdym teście.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine, getRoundMultiplier, isThresholdHit } from "../../control2/js/engine.js";
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

function makeEngine(overrides = {}, nowFn) {
  // Testy silnika zaczynają od stanu "gotowe do pierwszej rundy" (po
  // przejściu przez pre-grę devices_display->...->r_intro, celowo poza
  // zakresem tego silnika — patrz komentarz w control2/js/engine.js).
  const store = createFakeStore("g1", { step: "r_roundStart", topCard: "rounds", phase: "READY", ...overrides });
  const pool = questionPool();
  const engine = createEngine({
    store,
    loadQuestionPool: async () => pool.slice(),
    loadAnswers: async (qid) => answersFor(qid),
    now: nowFn,
  });
  return { store, dispatch: engine.dispatch };
}

test("getRoundMultiplier: czyta z tablicy, powtarza ostatnią wartość po wyczerpaniu", () => {
  const settings = { roundMultipliers: [1, 1, 1, 2, 3] };
  assert.equal(getRoundMultiplier(settings, 1), 1);
  assert.equal(getRoundMultiplier(settings, 3), 1);
  assert.equal(getRoundMultiplier(settings, 4), 2);
  assert.equal(getRoundMultiplier(settings, 5), 3);
  assert.equal(getRoundMultiplier(settings, 99), 3, "runda poza tablicą powtarza ostatnią wartość");
});

test("getRoundMultiplier: pusta/dziwna tablica nie wywala się, wraca 1", () => {
  assert.equal(getRoundMultiplier({ roundMultipliers: [] }, 1), 1);
  assert.equal(getRoundMultiplier({}, 1), 1);
});

test("isThresholdHit: prawda gdy którakolwiek drużyna osiągnęła finalMinPoints", () => {
  const state = { rounds: { totals: { A: 300, B: 0 } }, settings: { finalMinPoints: 300 } };
  assert.equal(isThresholdHit(state), true);
  state.rounds.totals = { A: 299, B: 299 };
  assert.equal(isThresholdHit(state), false);
});

test("dispatch: nieznana akcja rzuca (literówka w type nie ginie po cichu)", async () => {
  const { dispatch } = makeEngine();
  await assert.rejects(() => dispatch({ type: "COS_NIEISTNIEJACEGO" }), /Nieznana akcja/);
});

test("START_ROUND: ustawia pytanie/odpowiedzi, step->r_duel, phase->DUEL (przez assertTransition)", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  assert.equal(store.state.phase, "DUEL");
  assert.equal(store.state.step, "r_duel");
  assert.ok(store.state.rounds.question);
  assert.equal(store.state.rounds.answers.length, 4);
  assert.deepEqual(store.state.rounds.revealed, []);
  assert.equal(store.state.rounds.bankPts, 0);
  assert.equal(store.state.controlTeam, null);
  assert.equal(store.commits.at(-1).soundCueKey, "round_transition");
});

test("pojedynek: trafienie w odpowiedź #1 przy pierwszej próbie -> WIN, phase=PLAY, controlTeam ustawiony", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  assert.equal(store.state.step, "r_play");
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 }); // #1 = najwyżej punktowana (40 pkt)
  assert.equal(store.state.phase, "PLAY");
  assert.equal(store.state.controlTeam, "A");
  assert.ok(store.state.rounds.revealed.includes(1));
  assert.equal(store.state.rounds.bankPts, 40);
});

test("pojedynek: REVEAL_ANSWER na nie-topowej odpowiedzi w DUEL NIE wygrywa od razu — oddaje głos drugiej drużynie, punkty i tak trafiają do banku", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 2 }); // A trafia w #2 (30 pkt), ale to nie #1
  assert.equal(store.state.phase, "DUEL", "wciąż trwa rozstrzyganie pojedynku");
  assert.equal(store.state.rounds.duel.currentTeam, "B");
  assert.ok(store.state.rounds.revealed.includes(2));
  assert.equal(store.state.rounds.bankPts, 30, "punkty trafiają do banku niezależnie od wyniku pojedynku");
});

test("pojedynek: obie drużyny trafiają nie-topowe odpowiedzi — wyższe punkty wygrywają (bez względu na #1)", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 3 }); // A: 20 pkt, nie-topowa -> CONTINUE_SECOND (B)
  await dispatch({ type: "REVEAL_ANSWER", ord: 2 }); // B: 30 pkt > 20 -> WIN dla B
  assert.equal(store.state.phase, "PLAY");
  assert.equal(store.state.controlTeam, "B");
  assert.equal(store.state.rounds.bankPts, 50);
});

test("pojedynek: remis punktowy w drugiej próbie idzie do pierwszej drużyny cyklu", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 2 }); // A: 30 pkt -> CONTINUE_SECOND (B)
  await dispatch({ type: "ADD_X" }); // B pudłuje po trafieniu A -> ale to nie remis, sprawdzone osobno
  assert.equal(store.state.phase, "PLAY", "A miał punkty (30), B spudłował (0) -> WIN dla A");
  assert.equal(store.state.controlTeam, "A");
});

test("pojedynek: trafienie w #1 przez drugą drużynę po nie-topowej pierwszej próbie -> WIN dla drugiej", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 4 }); // A: 10 pkt, nie-topowa -> CONTINUE_SECOND (B)
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 }); // B: 40 pkt > 10 -> WIN dla B
  assert.equal(store.state.controlTeam, "B");
  assert.equal(store.state.rounds.bankPts, 50);
});

test("pojedynek: pierwsza drużyna pudłuje (ADD_X), druga trafia -> WIN dla drugiej", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "ADD_X" }); // A pudłuje -> currentTeam przechodzi na B
  assert.equal(store.state.rounds.duel.currentTeam, "B");
  assert.equal(store.state.phase, "DUEL", "wciąż trwa rozstrzyganie pojedynku");
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  assert.equal(store.state.phase, "PLAY");
  assert.equal(store.state.controlTeam, "B");
});

test("pojedynek: obie drużyny pudłują -> RESET cyklu, BEZ ponownego buzzera — firstTeam/secondTeam zostają, kolej wraca do firstTeam", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "ADD_X" }); // A pudłuje
  await dispatch({ type: "ADD_X" }); // B też pudłuje -> RESET cyklu (nie pełny reset pojedynku)
  assert.equal(store.state.step, "r_play", "nie ma czegoś takiego jak ponowny buzer");
  assert.equal(store.state.phase, "DUEL");
  assert.equal(store.state.rounds.duel.firstTeam, "A", "firstTeam/secondTeam nie są czyszczone przy RESET");
  assert.equal(store.state.rounds.duel.secondTeam, "B");
  assert.equal(store.state.rounds.duel.currentTeam, "A", "kolej wraca do firstTeam");

  // ta sama runda, bez nowego buzzera, toczy się dalej: A trafia w #1 -> WIN
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  assert.equal(store.state.phase, "PLAY");
  assert.equal(store.state.controlTeam, "A");
});

test("ACCEPT_BUZZ: gra buzzer_press w trybie normalnym, ale NIE gra żadnego dźwięku w trybie physicalBuzzer", async () => {
  const normal = makeEngine();
  await normal.dispatch({ type: "START_ROUND" });
  await normal.dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  assert.equal(normal.store.commits.at(-1).soundCueKey, "buzzer_press");

  const physical = makeEngine({ settings: { ...DEFAULT_SETTINGS, physicalBuzzer: true } });
  await physical.dispatch({ type: "START_ROUND" });
  await physical.dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  assert.equal(physical.store.commits.at(-1).soundCueKey, null, "physicalBuzzer: zatwierdzamy kto kliknął pierwszy, bez dźwięku");
});

test("PLAY: trafienia dokładają do banku, X poniżej progu nie wywołuje STEAL", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 }); // WIN -> PLAY, controlTeam=A, bank=40
  await dispatch({ type: "REVEAL_ANSWER", ord: 2 }); // bank+=30
  assert.equal(store.state.rounds.bankPts, 70);
  await dispatch({ type: "ADD_X" }); // 1. X drużyny A
  assert.equal(store.state.rounds.xA, 1);
  assert.equal(store.state.phase, "PLAY", "1 X to za mało na kradzież");
});

test("PLAY: 3. X (z pozostałymi nieodkrytymi odpowiedziami) auto-przechodzi w STEAL na przeciwną drużynę", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 }); // WIN -> PLAY, controlTeam=A
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" }); // 3. X -> STEAL
  assert.equal(store.state.phase, "STEAL");
  assert.equal(store.state.rounds.steal.active, true);
  assert.equal(store.state.rounds.steal.team, "B", "przeciwna drużyna dostaje kradzież");
});

test("STEAL: udana kradzież -> steal.won=true, canEndRound=true", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" }); // STEAL, drużyna B
  await dispatch({ type: "REVEAL_ANSWER", ord: 2 }); // B trafia w kradzieży
  assert.equal(store.state.rounds.steal.used, true);
  assert.equal(store.state.rounds.steal.won, true);
  assert.equal(store.state.rounds.canEndRound, true);
});

test("STEAL: nieudana kradzież -> steal.won=false, canEndRound=true, bank zostaje przy pierwotnej drużynie", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" }); // STEAL, drużyna B
  await dispatch({ type: "ADD_X" }); // B też pudłuje kradzież
  assert.equal(store.state.rounds.steal.used, true);
  assert.equal(store.state.rounds.steal.won, false);
  assert.equal(store.state.rounds.canEndRound, true);
});

test("timer3 (3s decyzja): START_TIMER3 ustawia endsAt +3s, EXPIRE_TIMER3 dolicza X dokładnie jak ręczne ADD_X", async () => {
  let t = 2_000_000;
  const { store, dispatch } = makeEngine({}, () => t);
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 }); // WIN -> PLAY, controlTeam=A

  await dispatch({ type: "START_TIMER3" });
  assert.equal(store.state.rounds.timer3.running, true);
  assert.equal(store.state.rounds.timer3.endsAt, t + 3000);

  await dispatch({ type: "EXPIRE_TIMER3" });
  assert.equal(store.state.rounds.timer3.running, false);
  assert.equal(store.state.rounds.xA, 1, "auto-wygaśnięcie liczy się jak pudło drużyny z kontrolą");
});

test("timer3: EXPIRE_TIMER3 jest no-opem, jeśli operator sam rozstrzygnął wcześniej (timer już wyczyszczony)", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  await dispatch({ type: "START_TIMER3" });

  await dispatch({ type: "REVEAL_ANSWER", ord: 2 }); // rozstrzygnięcie ręczne PRZED wygaśnięciem
  assert.equal(store.state.rounds.timer3.running, false, "REVEAL_ANSWER czyści timer3");

  const revBefore = store.state.rev;
  const result = await dispatch({ type: "EXPIRE_TIMER3" });
  assert.equal(result, null, "spóźniony zegarek nie dokłada drugiego X");
  assert.equal(store.state.rev, revBefore);
});

test("timer3: ADD_X/PASS/GO_STEAL/END_ROUND ręcznie też czyszczą aktywny zegarek", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 });

  await dispatch({ type: "START_TIMER3" });
  await dispatch({ type: "PASS" });
  assert.equal(store.state.rounds.timer3.running, false, "PASS czyści timer3");

  await dispatch({ type: "START_TIMER3" });
  await dispatch({ type: "GO_STEAL" });
  assert.equal(store.state.rounds.timer3.running, false, "GO_STEAL czyści timer3");
});

test("timer3: niedostępny w fazie REVEAL ani po ustawieniu canEndRound", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 });
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" });
  await dispatch({ type: "ADD_X" }); // STEAL
  await dispatch({ type: "ADD_X" }); // przegrana kradzież -> canEndRound=true
  assert.equal(store.state.rounds.canEndRound, true);

  const result = await dispatch({ type: "START_TIMER3" });
  assert.equal(result, null, "nie ma już czego rozstrzygać w tej rundzie");
});

test("PASS: dozwolony raz, tylko w PLAY, tylko przed pierwszym trafieniem — przełącza controlTeam", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 }); // WIN -> PLAY, controlTeam=A, allowPass=true
  assert.equal(store.state.rounds.allowPass, true);
  await dispatch({ type: "PASS" });
  assert.equal(store.state.controlTeam, "B");
  assert.equal(store.state.rounds.passUsed, true);
  const revBefore = store.state.rev;
  const second = await dispatch({ type: "PASS" }); // drugi pass w tej samej rundzie = no-op
  assert.equal(second, null);
  assert.equal(store.state.rev, revBefore);
});

test("END_ROUND: mnożnik z settings.roundMultipliers stosowany do banku, wynik dopisany do totals zwycięzcy", async () => {
  const { store, dispatch } = makeEngine({ settings: { ...DEFAULT_SETTINGS, roundMultipliers: [2] } });
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  for (const ord of [1, 2, 3, 4]) await dispatch({ type: "REVEAL_ANSWER", ord }); // bank=100
  await dispatch({ type: "END_ROUND" });
  assert.equal(store.state.rounds.totals.A, 200, "bank 100 x mnożnik 2 = 200");
  assert.equal(store.state.rounds.bankPts, 0);
});

test("END_ROUND: niepełny bank przechodzi w REVEAL i wymaga REVEAL_LEFT, dopiero ostatnia odpowiedź finalizuje rundę", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  await dispatch({ type: "REVEAL_ANSWER", ord: 1 }); // tylko jedna odpowiedź odkryta
  await dispatch({ type: "END_ROUND" });
  assert.equal(store.state.phase, "REVEAL");
  await dispatch({ type: "REVEAL_ANSWER", ord: 2 }); // REVEAL_ANSWER w fazie REVEAL deleguje do REVEAL_LEFT
  await dispatch({ type: "REVEAL_ANSWER", ord: 3 });
  const roundNoBefore = store.state.rounds.roundNo;
  await dispatch({ type: "REVEAL_ANSWER", ord: 4 }); // ostatnia -> finalizacja rundy
  assert.equal(store.state.rounds.roundNo, roundNoBefore + 1);
  assert.equal(store.state.phase, "READY");
});

test("finalizacja rundy: próg NIE osiągnięty i pula pytań niewyczerpana -> pętla do r_roundStart", async () => {
  const { store, dispatch } = makeEngine();
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  for (const ord of [1, 2, 3, 4]) await dispatch({ type: "REVEAL_ANSWER", ord });
  await dispatch({ type: "END_ROUND" });
  assert.equal(store.state.step, "r_roundStart");
});

test("finalizacja rundy: próg osiągnięty i hasFinal=true -> automatyczne wejście do finału (F0)", async () => {
  const { store, dispatch } = makeEngine({
    settings: { ...DEFAULT_SETTINGS, hasFinal: true, finalMinPoints: 50, roundMultipliers: [1] },
  });
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  for (const ord of [1, 2, 3, 4]) await dispatch({ type: "REVEAL_ANSWER", ord }); // bank=100 >= próg 50
  await dispatch({ type: "END_ROUND" });
  assert.equal(store.state.topCard, "final");
  assert.equal(store.state.step, "f_start");
  assert.equal(store.state.locks.finalActive, true);
});

test("finalizacja rundy: próg osiągnięty ale hasFinal!==true -> r_gameEnd zamiast finału", async () => {
  const { store, dispatch } = makeEngine({
    settings: { ...DEFAULT_SETTINGS, hasFinal: false, finalMinPoints: 50, roundMultipliers: [1] },
  });
  await dispatch({ type: "START_ROUND" });
  await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
  for (const ord of [1, 2, 3, 4]) await dispatch({ type: "REVEAL_ANSWER", ord });
  await dispatch({ type: "END_ROUND" });
  assert.equal(store.state.step, "r_gameEnd");
});

test("finalizacja rundy: pula pytań wyczerpana -> r_gameEnd nawet bez osiągniętego progu", async () => {
  const { store, dispatch } = makeEngine();
  // pula ma 3 pytania — rozgrywamy wszystkie bez osiągania progu (domyślny finalMinPoints=300)
  for (let i = 0; i < 3; i++) {
    await dispatch({ type: "START_ROUND" });
    await dispatch({ type: "ACCEPT_BUZZ", team: "A" });
    for (const ord of [1, 2, 3, 4]) await dispatch({ type: "REVEAL_ANSWER", ord });
    await dispatch({ type: "END_ROUND" });
  }
  assert.equal(store.state.step, "r_gameEnd");
});

test("GAME_END_SHOW: idempotentne — drugie wywołanie jest no-opem", async () => {
  const { store, dispatch } = makeEngine();
  store.state.step = "r_gameEnd";
  await dispatch({ type: "GAME_END_SHOW" });
  assert.equal(store.state.locks.gameEnded, true);
  const revAfterFirst = store.state.rev;
  const second = await dispatch({ type: "GAME_END_SHOW" });
  assert.equal(second, null);
  assert.equal(store.state.rev, revAfterFirst);
});
