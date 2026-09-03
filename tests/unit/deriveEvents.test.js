// Testy shared/deriveEvents.js — patrz plan przebudowy, sekcja 3.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveEvents } from "../../shared/deriveEvents.js";

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

test("brak poprzedniego wiersza => tylko SNAPSHOT_RENDER (pierwsze renderowanie po (re)connect)", () => {
  const events = deriveEvents(null, row());
  assert.deepEqual(events, [{ kind: "SNAPSHOT_RENDER" }]);
});

test("brak zmian => brak zdarzeń", () => {
  const a = row();
  const b = row();
  assert.deepEqual(deriveEvents(a, b), []);
});

test("zmiana step generuje STEP_CHANGE", () => {
  const events = deriveEvents(row({ step: "r_duel" }), row({ step: "r_play" }));
  assert.ok(events.some((e) => e.kind === "STEP_CHANGE" && e.from === "r_duel" && e.to === "r_play"));
});

test("zmiana control_team generuje CONTROL_CHANGED", () => {
  const events = deriveEvents(row({ control_team: "A" }), row({ control_team: "B" }));
  assert.ok(events.some((e) => e.kind === "CONTROL_CHANGED" && e.team === "B"));
});

test("nowo odkryte odpowiedzi generują ANSWER_REVEALED z listą nowych ord", () => {
  const prev = row({ detail: { rounds: { revealed: [1, 2] } } });
  const next = row({ detail: { rounds: { revealed: [1, 2, 3] } } });
  const events = deriveEvents(prev, next);
  const ev = events.find((e) => e.kind === "ANSWER_REVEALED");
  assert.deepEqual(ev.ords, [3]);
});

test("wzrost xA generuje STRIKE dla drużyny A, spadek/brak zmiany nic nie generuje", () => {
  const events = deriveEvents(row({ detail: { rounds: { xA: 0, xB: 0 } } }), row({ detail: { rounds: { xA: 1, xB: 0 } } }));
  assert.ok(events.some((e) => e.kind === "STRIKE" && e.team === "A" && e.count === 1));
  assert.ok(!events.some((e) => e.kind === "STRIKE" && e.team === "B"));
});

test("steal.used flip na true generuje STEAL_RESOLVED z poprawnym won", () => {
  const prev = row({ detail: { rounds: { steal: { used: false } } } });
  const next = row({ detail: { rounds: { steal: { used: true, won: true } } } });
  const events = deriveEvents(prev, next);
  assert.ok(events.some((e) => e.kind === "STEAL_RESOLVED" && e.won === true));
});

test("odsłonięcie odpowiedzi finału generuje FINAL_ANSWER_REVEALED/FINAL_POINTS_REVEALED z poprawnym indeksem", () => {
  const prev = row({ detail: { final: { runtime: { map1: [{ revealedAnswer: false, revealedPoints: false }] } } } });
  const next = row({ detail: { final: { runtime: { map1: [{ revealedAnswer: true, revealedPoints: false }] } } } });
  const events = deriveEvents(prev, next);
  assert.ok(events.some((e) => e.kind === "FINAL_ANSWER_REVEALED" && e.round === "map1" && e.idx === 0));
  assert.ok(!events.some((e) => e.kind === "FINAL_POINTS_REVEALED"));
});

test("start i stop timera generują TIMER_STARTED/TIMER_STOPPED", () => {
  const idle = row({ detail: { final: { runtime: { timer: { running: false } } } } });
  const running = row({ detail: { final: { runtime: { timer: { running: true, phase: "P1", endsAt: 123 } } } } });
  const startEvents = deriveEvents(idle, running);
  assert.ok(startEvents.some((e) => e.kind === "TIMER_STARTED" && e.phase === "P1" && e.endsAt === 123));

  const stopEvents = deriveEvents(running, idle);
  assert.ok(stopEvents.some((e) => e.kind === "TIMER_STOPPED"));
});

test("zmiana sound_cue_seq generuje SOUND_CUE z aktualnym kluczem (nawet gdy klucz się powtarza)", () => {
  const prev = row({ sound_cue_key: "answer_correct", sound_cue_seq: 3 });
  const next = row({ sound_cue_key: "answer_correct", sound_cue_seq: 4 });
  const events = deriveEvents(prev, next);
  assert.ok(events.some((e) => e.kind === "SOUND_CUE" && e.key === "answer_correct"));
});

test("zmiana display.mode generuje DISPLAY_MODE_CHANGED z qrTarget", () => {
  const prev = row({ detail: { display: { mode: "BLACK" } } });
  const next = row({ detail: { display: { mode: "QR", qrTarget: "host" } } });
  const events = deriveEvents(prev, next);
  assert.ok(events.some((e) => e.kind === "DISPLAY_MODE_CHANGED" && e.mode === "QR" && e.qrTarget === "host"));
});

test("zmiana host.covered generuje HOST_COVER_CHANGED", () => {
  const prev = row({ detail: { host: { covered: true } } });
  const next = row({ detail: { host: { covered: false } } });
  const events = deriveEvents(prev, next);
  assert.ok(events.some((e) => e.kind === "HOST_COVER_CHANGED" && e.covered === false));
});
