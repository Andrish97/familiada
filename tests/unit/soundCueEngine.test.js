// Testy shared/soundCueEngine.js — reguły "który SOUND_CUE gra jaką
// kombinację", wyciągnięte z control2/js/soundReactor.js tak, żeby
// display2/js/soundReactor.js mogło je reużyć 1:1 (zgłoszone: dźwięk ma móc
// grać z Wyświetlacza zamiast Control). playSfx/getSfxDuration są tu
// atrapami (bez js/core/sfx.js — ten moduł dotyka window/Audio już na
// etapie importu) — testujemy WYŁĄCZNIE logikę sekwencjonowania.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSoundCueEngine } from "../../shared/soundCueEngine.js";

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
  const getSfxDuration = async (key) => durations[key] ?? 0;
  const engine = createSoundCueEngine({ playSfx, getSfxDuration });
  return { engine, played };
}

// setTimeout(..., 0) w playSyncedCombo/playSequentialCombo nadal idzie przez
// prawdziwą kolejkę zdarzeń — mała, realna pauza wystarcza z zerowymi
// (atrapowymi) czasami trwania, bez potrzeby fake timerów.
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

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

test("koniec rundy (step r_play, phase PLAY -> dowolny) z cue round_transition gra SEKWENCYJNIE: reveal, potem round_transition", async () => {
  const { engine, played } = makeEngine({ reveal: 0.05 });
  const a = row({ step: "r_play", phase: "PLAY", sound_cue_seq: 0 });
  const b = row({ step: "r_gameEnd", phase: null, sound_cue_seq: 1, sound_cue_key: "round_transition" });
  engine.handleTransition(a, b);
  assert.deepEqual(played, ["reveal"]); // od razu, bez czekania na drugi
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

test("final_theme gra SEKWENCYJNIE: final_theme, potem reveal", async () => {
  const { engine, played } = makeEngine({ final_theme: 0.05 });
  const a = row({ sound_cue_seq: 0 });
  const b = row({ sound_cue_seq: 1, sound_cue_key: "final_theme" });
  engine.handleTransition(a, b);
  assert.deepEqual(played, ["final_theme"]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(played, ["final_theme", "reveal"]);
});

test("final_end gra synced round_transition+reveal, a PO nich show_intro", async () => {
  const { engine, played } = makeEngine({ round_transition: 0.05, reveal: 0.05 });
  const a = row({ sound_cue_seq: 0 });
  const b = row({ sound_cue_seq: 1, sound_cue_key: "final_end" });
  engine.handleTransition(a, b);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(played.includes("round_transition"));
  assert.ok(played.includes("reveal"));
  assert.ok(played.includes("show_intro"));
  assert.equal(played[played.length - 1], "show_intro"); // zawsze ostatni
});

test("brak zmiany sound_cue_seq => nic nie gra", async () => {
  const { engine, played } = makeEngine();
  const a = row({ sound_cue_seq: 3, sound_cue_key: "reveal" });
  const b = row({ sound_cue_seq: 3, sound_cue_key: "reveal", step: "r_play", phase: "STEAL" }); // inna zmiana, ten sam seq
  engine.handleTransition(a, b);
  await flush();
  assert.deepEqual(played, []);
});
