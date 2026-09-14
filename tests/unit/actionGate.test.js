// Testy control2/js/actionGate.js — JEDEN silnik liczący czas blokady
// operatora, zastępujący dawny zestaw ręcznie wywoływanych
// armRevealCooldown()/armBoardTransition() rozsianych po ui.js. getSfxDuration
// jest tu atrapą (sekundy, nie ms) — sam moduł nie dotyka window/Audio.
//
// Gate = max(czas dźwięku, czas animacji Wyświetlacza) — animacje to
// dokładnie te same stałe z shared/displayAnim.js, których używa
// display2/js/render.js (ROUND_INTRO_ANIM=1500, ROUND_OUT_ANIM=1000,
// ANSWER_ANIM=500, FINAL_BOARD_ANIM=1500, FINAL_OUT_ANIM=1000,
// LOGO_IN_ANIM=1000, LOGO_OUT_ANIM=1000).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createActionGate } from "../../control2/js/actionGate.js";

function row(overrides = {}) {
  return { sound_cue_key: null, sound_cue_seq: 0, ...overrides };
}

function makeGate(durations = {}) {
  const getSfxDuration = async (key) => durations[key] ?? 0;
  return createActionGate({ getSfxDuration });
}

test("brak nextRow (świadomy no-op) => 0, bez wyjątku", async () => {
  const gate = makeGate();
  const ms = await gate.computeGateMs("ADD_X", row({ sound_cue_seq: 3 }), null);
  assert.equal(ms, 0);
});

test("domyślnie: sound_cue_seq się nie zmienił (ta sama akcja nie zagrała nowego dźwięku) => 0", async () => {
  const gate = makeGate({ answer_correct: 1 });
  const prev = row({ sound_cue_key: "answer_correct", sound_cue_seq: 2 });
  const next = row({ sound_cue_key: "answer_correct", sound_cue_seq: 2 }); // np. SET_ENTRY_TEXT — dziedziczy stary klucz, ale nic nowego nie zagrało
  const ms = await gate.computeGateMs("SET_ENTRY_TEXT", prev, next);
  assert.equal(ms, 0);
});

test("domyślnie: sound_cue_seq wzrósł => gate to max(dźwięk, ANSWER_ANIM 500ms)", async () => {
  const gate = makeGate({ answer_wrong: 1.25 });
  const prev = row({ sound_cue_key: "answer_correct", sound_cue_seq: 2 });
  const next = row({ sound_cue_key: "answer_wrong", sound_cue_seq: 3 });
  const ms = await gate.computeGateMs("ADD_X", prev, next);
  assert.equal(ms, 1250, "dźwięk (1250ms) dłuższy niż animacja (500ms) -> dźwięk wygrywa");
});

test("domyślnie: krótki dźwięk -> ANSWER_ANIM (500ms) jako podłoga animacji", async () => {
  const gate = makeGate({ answer_correct: 0.2 });
  const prev = row({ sound_cue_seq: 0 });
  const next = row({ sound_cue_key: "answer_correct", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("REVEAL_ANSWER", prev, next);
  assert.equal(ms, 500, "dźwięk (200ms) krótszy niż animacja odsłonięcia (500ms) -> animacja wygrywa");
});

test("brak prevRow (pierwszy dispatch sesji) => wciąż liczy z potwierdzonego klucza", async () => {
  const gate = makeGate({ answer_correct: 0.8 });
  const next = row({ sound_cue_key: "answer_correct", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("ADD_X", null, next);
  assert.equal(ms, 800);
});

test("nieznany czas trwania (0/niezaładowane metadane) => bezpieczny fallback, nie 0", async () => {
  const gate = makeGate({}); // brak wpisu => getSfxDuration zwraca 0
  const prev = row({ sound_cue_seq: 0 });
  const next = row({ sound_cue_key: "buzzer_press", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("ACCEPT_BUZZ", prev, next);
  assert.equal(ms, 2000, "FALLBACK_S=2s, żeby nigdy nie zablokować na 0ms z powodu brakujących metadanych");
});

test("START_ROUND: synced combo round_transition+reveal, max z animacją planszy (2500ms)", async () => {
  const gate = makeGate({ round_transition: 0.3, reveal: 0.6 });
  const next = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("START_ROUND", row(), next);
  assert.equal(ms, 2500, "oba dźwięki krótsze niż animacja (animOut 1000 + animIn 1500 sekwencyjnie) -> animacja wygrywa");
});

test("START_ROUND: dźwięk przegrywa animację, gdy realny dźwięk dłuższy niż 2500ms", async () => {
  const gate = makeGate({ round_transition: 3, reveal: 1 });
  const next = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("START_ROUND", row(), next);
  assert.equal(ms, 3000);
});

test("NEXT_QUESTION do f_p2_start: synced dźwięk vs animOut maski (1000ms) — różna animacja niż START_ROUND", async () => {
  const gate = makeGate({ round_transition: 2.5, reveal: 1 });
  const next = row({ step: "f_p2_start", sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("NEXT_QUESTION", row(), next);
  assert.equal(ms, 2500, "dźwięk (2500ms) dłuższy niż animOut maski (1000ms) -> dźwięk wygrywa");
});

test("NEXT_QUESTION do f_p2_start: krótki dźwięk -> animOut maski (1000ms) jako podłoga", async () => {
  const gate = makeGate({ round_transition: 0.2, reveal: 0.1 });
  const next = row({ step: "f_p2_start", sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("NEXT_QUESTION", row(), next);
  assert.equal(ms, 1000);
});

test("NEXT_QUESTION NIE do f_p2_start (zwykłe pytanie w bloku): 0, nawet jeśli klucz jest ustawiony gdzieś w tle", async () => {
  const gate = makeGate({ round_transition: 2.5 });
  const next = row({ step: "f_p1_map_q2", sound_cue_key: "round_transition", sound_cue_seq: 5 }); // stary klucz sprzed paru zapisów
  const ms = await gate.computeGateMs("NEXT_QUESTION", row({ sound_cue_seq: 5 }), next);
  assert.equal(ms, 0);
});

test("END_ROUND -> r_roundStart (kolejna runda): gate to WYŁĄCZNIE czas 'reveal', plansza zostaje bez animacji tutaj", async () => {
  const gate = makeGate({ reveal: 0.9, round_transition: 5 });
  const next = row({ step: "r_roundStart", sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("END_ROUND", row(), next);
  assert.equal(ms, 900, "round_transition gra POTEM, nad już interaktywnym ekranem — nie ma czekać na nie; animOut dopiero przy następnym START_ROUND");
});

test("END_ROUND -> r_gameEnd: max(reveal, animOut planszy rund 1000ms) — wcześniej całkiem pominięte", async () => {
  const gate = makeGate({ reveal: 0.3 });
  const next = row({ step: "r_gameEnd", sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("END_ROUND", row(), next);
  assert.equal(ms, 1000, "reveal (300ms) krótszy niż animOut (1000ms) -> animacja wygrywa");
});

test("END_ROUND -> f_start: max(reveal, animOut+animIn planszy finału 2500ms) — wcześniej całkiem pominięte", async () => {
  const gate = makeGate({ reveal: 0.3 });
  const next = row({ step: "f_start", sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("END_ROUND", row(), next);
  assert.equal(ms, 2500);
});

test("NEXT_AFTER_REVEAL: ta sama formuła co END_ROUND (zależna od nextRow.step)", async () => {
  const gate = makeGate({ reveal: 0.4 });
  const next = row({ step: "r_gameEnd", sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("NEXT_AFTER_REVEAL", row(), next);
  assert.equal(ms, 1000, "reveal (400ms) krótszy niż animOut (1000ms) -> animacja wygrywa");
});

test("START_FINAL: gate to WYŁĄCZNIE czas 'final_theme' (bez animacji na tym kroku, plansza już namalowana wcześniej)", async () => {
  const gate = makeGate({ final_theme: 1.6, reveal: 9 });
  const next = row({ sound_cue_key: "final_theme", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("START_FINAL", row(), next);
  assert.equal(ms, 1600);
});

test("START_P2_ROUND: BEZ dźwięku (żadnego soundCueKey), ale ma 1500ms animIn — wcześniej gate zawsze był 0", async () => {
  const gate = makeGate({});
  const prev = row({ step: "f_p2_start", sound_cue_seq: 3 });
  const next = row({ step: "f_p2_entry", sound_cue_seq: 3 }); // bez zmiany sound_cue_seq — brak dźwięku
  const ms = await gate.computeGateMs("START_P2_ROUND", prev, next);
  assert.equal(ms, 1500, "czysto animacyjna blokada, niezależna od sound_cue_seq");
});

test("GAME_END_SHOW: max(show_intro, animIn logo/WIN 1000ms)", async () => {
  const gate = makeGate({ show_intro: 0.4 });
  const prev = row({ sound_cue_seq: 0 });
  const next = row({ sound_cue_key: "show_intro", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("GAME_END_SHOW", prev, next);
  assert.equal(ms, 1000, "show_intro (400ms) krótszy niż animIn (1000ms) -> animacja wygrywa");
});

test("FINISH_FINAL: max(synced dźwięk, animacja ekranu końcowego 2000ms) + sequential show_intro W CAŁOŚCI", async () => {
  const gate = makeGate({ round_transition: 0.5, reveal: 0.3, show_intro: 1.2 });
  const next = row({ sound_cue_key: "final_end", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("FINISH_FINAL", row(), next);
  assert.equal(ms, 2000 + 1200, "animacja ekranu końcowego (2000ms) wygrywa z krótkim synced dźwiękiem, + show_intro w pełni doliczone");
});

test("FINISH_FINAL: dźwięk przegrywa animację, gdy realny dźwięk dłuższy niż 2000ms", async () => {
  const gate = makeGate({ round_transition: 3, reveal: 1, show_intro: 0.5 });
  const next = row({ sound_cue_key: "final_end", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("FINISH_FINAL", row(), next);
  assert.equal(ms, 3000 + 500);
});
