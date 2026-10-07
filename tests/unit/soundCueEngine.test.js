// Testy web/shared/js/gameplay/soundCueEngine.js — reguły "który SOUND_CUE gra jaką
// kombinację", wyciągnięte z control/js/soundReactor.js tak, żeby
// display/js/soundReactor.js mogło je reużyć 1:1 (zgłoszone: dźwięk ma móc
// grać z Wyświetlacza zamiast Control). playSfx/getSfxDuration są tu
// atrapami (bez js/core/sfx.js — ten moduł dotyka window/Audio już na
// etapie importu) — testujemy WYŁĄCZNIE logikę sekwencjonowania.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSoundCueEngine } from "../../web/shared/js/gameplay/soundCueEngine.js";

function row(overrides = {}) {
  return {
    step: "r_play",
    phase: "PLAY",
    control_team: "A",
    sound_cue_key: null,
    sound_cue_seq: 0,
    detail: { rounds: { revealed: [], xA: 0, xB: 0, steal: {} }, final: { runtime: {} }, display: {}, host: {} },
    ...overrides,
  };
}

function makeEngine(durations = {}) {
  const played = [];
  const playSfx = (key) => played.push(key);
  const getSfxDuration = async (key) => durations[key] ?? 0.001;
  const engine = createSoundCueEngine({ playSfx, getSfxDuration });
  return { engine, played };
}

// setTimeout(..., 0) w playSyncedCombo/playSequentialCombo nadal idzie przez
// prawdziwą kolejkę zdarzeń — mała, realna pauza wystarcza z zerowymi
// (atrapowymi) czasami trwania, bez potrzeby fake timerów.
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

test("Intro reveal starts toward the end of show_intro", async () => {
  const { engine, played } = makeEngine({ show_intro: 0.05, reveal: 0.02 });
  engine.handleTransition(row({ step: "r_intro" }), row({ step: "r_roundStart", sound_cue_seq: 1, sound_cue_key: "show_intro" }));
  await flush();
  assert.deepEqual(played, ["show_intro"]);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(played, ["show_intro", "reveal"]);
});

test("Winning buzzer press plays its existing sound before operator acceptance", () => {
  const { engine, played } = makeEngine();
  const prev = row({ step: "r_duel" });
  const next = row({ step: "r_duel", detail: { rounds: { duel: { lastPressed: "A" } } } });
  engine.handleTransition(prev, next);
  assert.deepEqual(played, ["buzzer_press"]);
  engine.handleTransition(next, next);
  assert.deepEqual(played, ["buzzer_press"]);
});

test("buzzer RPC cue and operator acceptance do not replay the press", () => {
  const { engine, played } = makeEngine();
  const previous = row({ step: "r_duel" });
  const pressed = row({ step: "r_duel", sound_cue_seq: 1, sound_cue_key: "buzzer_press", detail: { rounds: { duel: { lastPressed: "A" } } } });
  engine.handleTransition(previous, pressed);
  engine.handleTransition(pressed, { ...pressed, sound_cue_seq: 2 });
  assert.deepEqual(played, ["buzzer_press"]);
});

test("brak poprzedniego wiersza => nic nie gra (SNAPSHOT_RENDER, nie realna zmiana)", async () => {
  const { engine, played } = makeEngine();
  engine.handleTransition(null, row({ sound_cue_seq: 1, sound_cue_key: "reveal" }));
  await flush();
  assert.deepEqual(played, []);
});

test("prosty cue (bez specjalnego kontekstu) gra bare, bez kombinacji", async () => {
  const { engine, played } = makeEngine();
  const a = row({ sound_cue_seq: 0 });
  const b = row({ sound_cue_seq: 1, sound_cue_key: "answer_correct" });
  engine.handleTransition(a, b);
  await flush();
  assert.deepEqual(played, ["answer_correct"]);
});

test("start rundy (r_roundStart -> r_duel/DUEL) z cue round_transition gra synced combo z reveal", async () => {
  const { engine, played } = makeEngine();
  const a = row({ step: "r_roundStart", phase: "READY", sound_cue_seq: 0 });
  const b = row({ step: "r_duel", phase: "DUEL", sound_cue_seq: 1, sound_cue_key: "round_transition" });
  engine.handleTransition(a, b);
  await flush();
  assert.deepEqual(played.slice().sort(), ["reveal", "round_transition"].sort());
});

test("start rundy 2 finału (f_p2_start) z cue round_transition też gra synced combo z reveal", async () => {
  const { engine, played } = makeEngine();
  const a = row({ step: "f_p2_start", sound_cue_seq: 0 });
  const b = row({ step: "f_p2_start", sound_cue_seq: 1, sound_cue_key: "round_transition" });
  // f_p2_start -> f_p2_start (prawdziwa gra zmienia inne pole tej samej
  // zmiany naraz z cue) — isFinalP2Start patrzy na nextRow.step, nie na
  // zmianę stepu, więc to samo w sobie wystarcza.
  engine.handleTransition(a, b);
  await flush();
  assert.deepEqual(played.slice().sort(), ["reveal", "round_transition"].sort());
});

test("F7->F8 (START_P2_ROUND, f_p2_start -> f_p2_entry) z cue round_transition gra synced combo z reveal — zgłoszone: 'dźwięk przejścia rundy plus odsłonięcie'", async () => {
  const { engine, played } = makeEngine();
  const a = row({ step: "f_p2_start", sound_cue_seq: 0 });
  const b = row({ step: "f_p2_entry", sound_cue_seq: 1, sound_cue_key: "round_transition" });
  engine.handleTransition(a, b);
  await flush();
  assert.deepEqual(played.slice().sort(), ["reveal", "round_transition"].sort());
});

test("koniec rundy (step r_play, phase PLAY -> dowolny) z cue round_transition gra równolegle: reveal i round_transition kończą się razem", async () => {
  const { engine, played } = makeEngine({ reveal: 0.05 });
  const a = row({ step: "r_play", phase: "PLAY", sound_cue_seq: 0 });
  const b = row({ step: "r_gameEnd", phase: null, sound_cue_seq: 1, sound_cue_key: "round_transition" });
  engine.handleTransition(a, b);
  await flush();
  assert.deepEqual(played, ["reveal"]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(played, ["reveal", "round_transition"]);
});

test("koniec rundy z fazy STEAL (rozstrzygnięta kradzież) liczy się tak samo jak PLAY", async () => {
  const { engine, played } = makeEngine();
  const a = row({ step: "r_play", phase: "STEAL", sound_cue_seq: 0 });
  const b = row({ step: "r_gameEnd", phase: null, sound_cue_seq: 1, sound_cue_key: "round_transition" });
  engine.handleTransition(a, b);
  await flush();
  assert.deepEqual(played.slice().sort(), ["reveal", "round_transition"].sort());
});

test("koniec rundy z fazy REVEAL (R8, po NEXT_AFTER_REVEAL) liczy się tak samo jak PLAY/STEAL", async () => {
  // control/js/engine.js's NEXT_AFTER_REVEAL — operator ręcznie potwierdza
  // koniec rundy PO odsłonięciu reszty odpowiedzi (zgłoszone: ekran kolejnej
  // rundy nie ma się już odpalać sam, tylko po jawnym kliknięciu) — ten sam
  // "koniec rundy" fanfar ma zagrać jak przy END_ROUND bez nic do odsłonięcia.
  const { engine, played } = makeEngine({ reveal: 0.05 });
  const a = row({ step: "r_play", phase: "REVEAL", sound_cue_seq: 0 });
  const b = row({ step: "r_roundStart", phase: "READY", sound_cue_seq: 1, sound_cue_key: "round_transition" });
  engine.handleTransition(a, b);
  await flush();
  assert.deepEqual(played, ["reveal"]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(played, ["reveal", "round_transition"]);
});

test("start finału: final_theme, potem round_transition i reveal", async () => {
  const { engine, played } = makeEngine({ final_theme: 0.05 });
  const a = row({ step: "f_start", sound_cue_seq: 0 });
  const b = row({ step: "f_p1_entry", sound_cue_seq: 1, sound_cue_key: "final_theme" });
  engine.handleTransition(a, b);
  assert.deepEqual(played, ["final_theme"]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(played, ["final_theme", "round_transition", "reveal"]);
});

test("final_end plays only outro without another board change", async () => {
  const { engine, played } = makeEngine({ round_transition: 0.05, reveal: 0.05 });
  const a = row({ sound_cue_seq: 0 });
  const b = row({ sound_cue_seq: 1, sound_cue_key: "final_end" });
  engine.handleTransition(a, b);
  assert.deepEqual(played, ["show_outro"]);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(played, ["show_outro"]);
});

test("FINISH_FINAL plays only outro because the final result is already visible", () => {
  const { engine, played } = makeEngine();
  engine.handleTransition(row({ step: "f_end", top_card: "final" }), row({ step: "f_end", top_card: "final", sound_cue_seq: 1, sound_cue_key: "final_end" }));
  assert.deepEqual(played, ["show_outro"]);
});

test("Reaching final target plays scoring and awaits manual final completion", async () => {
  const { engine, played } = makeEngine({ answer_correct: 0.03 });
  engine.handleTransition(row({ step: "f_p1_map_q1" }), row({ step: "f_end", sound_cue_seq: 1, sound_cue_key: "answer_correct" }));
  assert.deepEqual(played, ["answer_correct"]);
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.deepEqual(played, ["answer_correct"]);
});

test("brak zmiany sound_cue_seq => nic nie gra", async () => {
  const { engine, played } = makeEngine();
  const a = row({ sound_cue_seq: 3, sound_cue_key: "reveal" });
  const b = row({ sound_cue_seq: 3, sound_cue_key: "reveal", step: "r_play", phase: "STEAL" }); // inna zmiana, ten sam seq
  engine.handleTransition(a, b);
  await flush();
  assert.deepEqual(played, []);
});


test("restart cancels sounds waiting for the end of the final theme", async () => {
  const { engine, played } = makeEngine({ final_theme: 0.08 });
  engine.handleTransition(row({ step: "f_start" }), row({ step: "f_p1_entry", sound_cue_seq: 1, sound_cue_key: "final_theme" }));
  await flush();
  engine.handleTransition(row({ step: "f_p1_entry" }), row({ step: "devices_display", top_card: "devices" }));
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.deepEqual(played, ["final_theme"]);
});


test("wynik finału: dłuższy reveal zaczyna pierwszy, muzyka kończy się razem z nim", async () => {
  const { engine, played } = makeEngine({ final_theme: 0.02, reveal: 0.08 });
  engine.handleTransition(row({ step: "f_p2_map_q5" }), row({ step: "f_end", sound_cue_seq: 1, sound_cue_key: "final_theme" }));
  await flush();
  assert.deepEqual(played, ["reveal"]);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.deepEqual(played, ["reveal", "final_theme"]);
});
