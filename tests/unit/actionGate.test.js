// Testy control2/js/actionGate.js — JEDEN silnik liczący czas blokady
// operatora, zastępujący dawny zestaw ręcznie wywoływanych
// armRevealCooldown()/armBoardTransition() rozsianych po ui.js. getSfxDuration
// jest tu atrapą (sekundy, nie ms) — sam moduł nie dotyka window/Audio.
//
// Formuły korzystają z web/shared/js/gameplay/transitionTiming.js — TEGO SAMEGO modułu,
// którego display2/js/render.js używa do liczenia czasu animacji, więc
// gate tutaj z definicji zgadza się z tym, co faktycznie maluje Display
// (zgłoszone: "Animacja... zawsze = dźwięki" — zero osobno dobranych liczb).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createActionGate } from "../../web/control2/js/actionGate.js";

function row(overrides = {}) {
  return { sound_cue_key: null, sound_cue_seq: 0, ...overrides };
}

function makeGate(durations = {}) {
  const getSfxDuration = async (key) => durations[key] ?? 0;
  return createActionGate({ getSfxDuration });
}

test("SHOW_INTRO blocks through both the intro and the logo reveal", async () => {
  const gate = makeGate({ show_intro: 3, reveal: 4 });
  assert.equal(await gate.computeGateMs("SHOW_INTRO", row(), row({ sound_cue_seq: 1 })), 4000);
});

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

test("domyślnie: sound_cue_seq wzrósł => gate to realny czas trwania potwierdzonego klucza", async () => {
  const gate = makeGate({ answer_wrong: 1.25 });
  const prev = row({ sound_cue_key: "answer_correct", sound_cue_seq: 2 });
  const next = row({ sound_cue_key: "answer_wrong", sound_cue_seq: 3 });
  const ms = await gate.computeGateMs("ADD_X", prev, next);
  assert.equal(ms, 1250);
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

test("START_P2_ROUND: teraz synced(round_transition,reveal) — 'dźwięk przejścia rundy plus odsłonięcie', nie samo 'reveal'", async () => {
  const gate = makeGate({ round_transition: 0.4, reveal: 1.5 });
  const prev = row({ step: "f_p2_start", sound_cue_seq: 3 });
  const next = row({ step: "f_p2_entry", sound_cue_key: "round_transition", sound_cue_seq: 4 });
  const ms = await gate.computeGateMs("START_P2_ROUND", prev, next);
  assert.equal(ms, 1500, "max(round_transition,reveal) — ta sama liczba, którą display2/js/render.js liczy dla animIn tej samej akcji");
});

test("START_P2_ROUND: round_transition dłuższy niż reveal", async () => {
  const gate = makeGate({ round_transition: 2.2, reveal: 0.5 });
  const prev = row({ step: "f_p2_start", sound_cue_seq: 3 });
  const next = row({ step: "f_p2_entry", sound_cue_key: "round_transition", sound_cue_seq: 4 });
  const ms = await gate.computeGateMs("START_P2_ROUND", prev, next);
  assert.equal(ms, 2200);
});

test("GAME_END_SHOW: only outro plays after the result is visible", async () => {
  const gate = makeGate({ round_transition: 0.4, reveal: 0.2, show_outro: 60 });
  const prev = row({ sound_cue_seq: 0 });
  const next = row({ sound_cue_key: "show_intro", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("GAME_END_SHOW", prev, next);
  assert.equal(ms, 60000);
});

test("START_ROUND: synced combo round_transition+reveal, gate = max(obu) — ta sama liczba co animacja planszy na Displayu", async () => {
  const gate = makeGate({ round_transition: 0.3, reveal: 0.6 });
  const next = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("START_ROUND", row(), next);
  assert.equal(ms, 600);
});

test("START_ROUND: round_transition dłuższy niż reveal", async () => {
  const gate = makeGate({ round_transition: 3, reveal: 1 });
  const next = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("START_ROUND", row(), next);
  assert.equal(ms, 3000);
});

test("NEXT_QUESTION do f_p2_start: ta sama synced combo co START_ROUND", async () => {
  const gate = makeGate({ round_transition: 2.5, reveal: 1 });
  const next = row({ step: "f_p2_start", sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("NEXT_QUESTION", row(), next);
  assert.equal(ms, 2500);
});

test("NEXT_QUESTION NIE do f_p2_start (zwykłe pytanie w bloku): 0, nawet jeśli klucz jest ustawiony gdzieś w tle", async () => {
  const gate = makeGate({ round_transition: 2.5 });
  const next = row({ step: "f_p1_map_q2", sound_cue_key: "round_transition", sound_cue_seq: 5 }); // stary klucz sprzed paru zapisów
  const ms = await gate.computeGateMs("NEXT_QUESTION", row({ sound_cue_seq: 5 }), next);
  assert.equal(ms, 0);
});

// Zgłoszone na żywo: "dźwięk końca rundy gra i przed i po odsłanianiu, a
// przycisk >rozpocznij rundę< może przerwać odtwarzanie" i "dźwięk końca
// rundy i dźwięk rozpoczęcia finału się nakładają" — END_ROUND blokuje
// teraz równoległe reveal+round_transition (maksimum obu czasów), nie tylko pierwszy
// człon, żeby żadna kolejna akcja (Rozpocznij rundę/Rozpocznij finał) nie
// mogła wystartować i przerwać jeszcze grającego round_transition.
test("END_ROUND: gate to max(reveal, round_transition) — żadna kolejna akcja nie przerwie jeszcze grającego round_transition", async () => {
  const gate = makeGate({ reveal: 0.9, round_transition: 5 });
  const next = row({ step: "r_roundStart", sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("END_ROUND", row(), next);
  assert.equal(ms, 5000);
});

test("END_ROUND -> f_start: ta sama formuła max(reveal, round_transition), niezależnie od docelowego kroku", async () => {
  const gate = makeGate({ reveal: 0.9, round_transition: 5 });
  const next = row({ step: "f_start", sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("END_ROUND", row(), next);
  assert.equal(ms, 5000);
});

// NEXT_AFTER_REVEAL nie gra już żadnego dźwięku (engine.js) — zgłoszone:
// "dźwięk przejścia rundy gra i przed i po odsłanianiu" — round_transition
// już zagrało RAZ w END_ROUND, zanim weszliśmy w R8; R8 samo (REVEAL_LEFT)
// gra tylko "answer_correct" per klik, więc tu nie ma już SPECIAL wpisu —
// domyślna ścieżka (sound_cue_seq się nie zmienia) poprawnie daje 0.
test("NEXT_AFTER_REVEAL: nie gra już round_transition (usunięty duplikat) — domyślna ścieżka, sound_cue_seq bez zmian => 0", async () => {
  const gate = makeGate({ reveal: 0.4 });
  const prev = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const next = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("NEXT_AFTER_REVEAL", prev, next);
  assert.equal(ms, 0);
});

test("START_FINAL: gate to SUMA final_theme+reveal — żadna kolejna akcja nie przerwie jeszcze grającego reveal", async () => {
  const gate = makeGate({ final_theme: 1.6, reveal: 9 });
  const next = row({ sound_cue_key: "final_theme", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("START_FINAL", row(), next);
  assert.equal(ms, 1600 + 9000);
});

test("FINISH_FINAL: allows a two-minute outro after the board transition", async () => {
  const gate = makeGate({ round_transition: 0.5, reveal: 0.3, show_outro: 120 });
  const next = row({ sound_cue_key: "final_end", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("FINISH_FINAL", row(), next);
  assert.equal(ms, 120000);
});

test("Reaching final target waits only for scoring until the operator finishes the final", async () => {
  const gate = makeGate({ answer_correct: 0.4, round_transition: 1.2, reveal: 0.8 });
  assert.equal(await gate.computeGateMs("REVEAL_POINTS", row({ step: "f_p1_map_q1" }), row({ step: "f_end", sound_cue_key: "answer_correct", sound_cue_seq: 1 })), 400);
});


test("zakończenie finału czeka na dłuższy reveal lub muzykę finału", async () => {
  const gate = makeGate({ final_theme: 2, reveal: 5 });
  assert.equal(await gate.computeGateMs("NEXT_QUESTION", row(), row({ step: "f_end" })), 5000);
});
