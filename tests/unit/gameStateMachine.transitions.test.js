// Testy grafu przejść Control v2 — patrz shared/gameStateMachine.js oraz
// plan przebudowy, sekcja 2/2b. Uruchamiane przez `npm run test:unit`
// (tests/package.json) → `node --test unit`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { STEPS, TRANSITIONS, assertTransition, isValidStep } from "../../shared/gameStateMachine.js";

test("każdy krok w STEPS ma tylko dozwolone kolejne kroki (albo pustą listę terminalną)", () => {
  for (const [step, def] of Object.entries(STEPS)) {
    assert.ok(Array.isArray(def.next), `${step}.next musi być tablicą`);
    for (const nextStep of def.next) {
      assert.ok(
        isValidStep(nextStep),
        `${step} wskazuje na nieznany krok docelowy: ${nextStep}`
      );
    }
  }
});

test("assertTransition przepuszcza każdą krawędź zadeklarowaną w TRANSITIONS", () => {
  for (const [step, nexts] of Object.entries(TRANSITIONS)) {
    for (const nextStep of nexts) {
      assert.doesNotThrow(() => assertTransition(step, nextStep), `${step} -> ${nextStep} powinno być dozwolone`);
    }
  }
});

test("assertTransition rzuca na nielegalny skok", () => {
  assert.throws(() => assertTransition("f_p1_entry", "f_p2_entry"), /Niedozwolone przejście/);
  assert.throws(() => assertTransition("devices_display", "f_end"), /Niedozwolone przejście/);
});

test("assertTransition przepuszcza pierwsze renderowanie (brak poprzedniego kroku)", () => {
  assert.doesNotThrow(() => assertTransition(null, "r_play"));
  assert.doesNotThrow(() => assertTransition(undefined, "devices_display"));
});

test("assertTransition rzuca na nieznany krok (literówka)", () => {
  assert.throws(() => assertTransition("r_intro", "r_introo"), /Nieznany krok/);
  assert.throws(() => assertTransition(null, "r_introo"), /Nieznany krok/);
});

test("assertTransition dopuszcza pozostanie w tym samym kroku (self-loop, np. r_play/PLAY->STEAL wewnętrznie)", () => {
  assert.doesNotThrow(() => assertTransition("r_play", "r_play"));
});

test("pełna liniowa ścieżka od urządzeń do końca gry bez finału jest osiągalna", () => {
  const path = [
    "devices_display",
    "devices_hostbuzzer",
    "setup_finish",
    "r_intro",
    "r_roundStart",
    "r_duel",
    "r_play",
    "r_gameEnd",
  ];
  for (let i = 1; i < path.length; i++) {
    assert.doesNotThrow(() => assertTransition(path[i - 1], path[i]), `${path[i - 1]} -> ${path[i]}`);
  }
});

test("pełna liniowa ścieżka finału (p1 wszystkie 5 pytań -> p2 wszystkie 5 pytań -> koniec) jest osiągalna", () => {
  const path = [
    "r_play",
    "f_start",
    "f_p1_entry",
    "f_p1_map_q1",
    "f_p1_map_q2",
    "f_p1_map_q3",
    "f_p1_map_q4",
    "f_p1_map_q5",
    "f_p2_start",
    "f_p2_entry",
    "f_p2_map_q1",
    "f_p2_map_q2",
    "f_p2_map_q3",
    "f_p2_map_q4",
    "f_p2_map_q5",
    "f_end",
  ];
  for (let i = 1; i < path.length; i++) {
    assert.doesNotThrow(() => assertTransition(path[i - 1], path[i]), `${path[i - 1]} -> ${path[i]}`);
  }
});

test("każdy krok mapowania finału (obu rund) może wcześnie wyjść na f_end (osiągnięty finalTarget)", () => {
  const mapSteps = Object.keys(STEPS).filter((s) => s.includes("_map_q"));
  assert.ok(mapSteps.length === 10, "oczekiwano 5+5 kroków mapowania");
  for (const step of mapSteps) {
    assert.ok(STEPS[step].next.includes("f_end"), `${step} powinien mieć f_end jako możliwe wyjście`);
  }
});

test("r_play dopuszcza pętlę powrotną do r_duel (pełny RESET pojedynku)", () => {
  assert.ok(STEPS.r_play.next.includes("r_duel"));
});

test("terminalne kroki (r_gameEnd, f_end) nie mają dalszych przejść", () => {
  assert.deepEqual(STEPS.r_gameEnd.next, []);
  assert.deepEqual(STEPS.f_end.next, []);
});
