// Testy control2/js/actionGate.js — JEDEN silnik liczący czas blokady
// operatora, zastępujący dawny zestaw ręcznie wywoływanych
// armRevealCooldown()/armBoardTransition() rozsianych po ui.js. getSfxDuration
// jest tu atrapą (sekundy, nie ms) — sam moduł nie dotyka window/Audio.

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

test("domyślnie: sound_cue_seq wzrósł => gate to realny czas trwania potwierdzonego klucza", async () => {
  const gate = makeGate({ answer_wrong: 1.25 });
  const prev = row({ sound_cue_key: "answer_correct", sound_cue_seq: 2 });
  const next = row({ sound_cue_key: "answer_wrong", sound_cue_seq: 3 });
  const ms = await gate.computeGateMs("ADD_X", prev, next);
  assert.equal(ms, 1250);
});

test("brak prevRow (pierwszy dispatch sesji) => wciąż liczy z potwierdzonego klucza", async () => {
  const gate = makeGate({ round_transition: 0.8 });
  const next = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("GAME_END_SHOW", null, next);
  assert.equal(ms, 800);
});

test("nieznany czas trwania (0/niezaładowane metadane) => bezpieczny fallback, nie 0", async () => {
  const gate = makeGate({}); // brak wpisu => getSfxDuration zwraca 0
  const prev = row({ sound_cue_seq: 0 });
  const next = row({ sound_cue_key: "show_intro", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("GAME_END_SHOW", prev, next);
  assert.equal(ms, 2000, "FALLBACK_S=2s, żeby nigdy nie zablokować na 0ms z powodu brakujących metadanych");
});

test("START_ROUND: synced combo round_transition+reveal, floor 2s", async () => {
  const gate = makeGate({ round_transition: 0.3, reveal: 0.6 });
  const next = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("START_ROUND", row(), next);
  assert.equal(ms, 2000, "oba dźwięki krótsze niż 2s -> floor wygrywa");
});

test("START_ROUND: floor przegrywa, gdy realny dźwięk dłuższy niż 2s", async () => {
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

test("END_ROUND: gate to WYŁĄCZNIE czas 'reveal', nie suma reveal+round_transition", async () => {
  const gate = makeGate({ reveal: 0.9, round_transition: 5 });
  const next = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("END_ROUND", row(), next);
  assert.equal(ms, 900, "round_transition gra POTEM, nad już interaktywnym ekranem — nie ma czekać na nie");
});

test("NEXT_AFTER_REVEAL: ta sama formuła co END_ROUND", async () => {
  const gate = makeGate({ reveal: 0.4 });
  const next = row({ sound_cue_key: "round_transition", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("NEXT_AFTER_REVEAL", row(), next);
  assert.equal(ms, 400);
});

test("START_FINAL: gate to WYŁĄCZNIE czas 'final_theme', nie final_theme+reveal", async () => {
  const gate = makeGate({ final_theme: 1.6, reveal: 9 });
  const next = row({ sound_cue_key: "final_theme", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("START_FINAL", row(), next);
  assert.equal(ms, 1600);
});

test("FINISH_FINAL: synced(round_transition,reveal,floor2) + sequential show_intro W CAŁOŚCI", async () => {
  const gate = makeGate({ round_transition: 0.5, reveal: 0.3, show_intro: 1.2 });
  const next = row({ sound_cue_key: "final_end", sound_cue_seq: 1 });
  const ms = await gate.computeGateMs("FINISH_FINAL", row(), next);
  assert.equal(ms, 2000 + 1200, "floor 2s (oba krótsze) + show_intro w pełni doliczone, w odróżnieniu od innych sekwencji");
});
