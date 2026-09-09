// Pokrywa control2/js/store.js's expiredTimerOnHydrate() — wykrywanie
// timerów zastanych już wygasłych w chwili wznowienia Control (karta była
// zamknięta/przeładowana, gdy endsAt minęło). Czysta funkcja, testowalna
// bez atrapy Supabase — samo połączenie z game_state_write jest osobne od
// tej logiki decyzyjnej. Zgłoszone: "chodzi o to, żeby wrócić o krok, a nie
// pójść dalej w takich sytuacjach" — final.timer i rounds.timer3 mają
// UMYŚLNIE różną odpowiedź (patrz control2/js/app.js's
// applyExpiredTimersOnResume), więc ta funkcja musi zwracać obie flagi
// niezależnie, nie tylko "czy COŚ wygasło".

import { test } from "node:test";
import assert from "node:assert/strict";
import { expiredTimerOnHydrate } from "../../control2/js/timerResume.js";

function baseState() {
  return {
    final: { runtime: { timer: { running: false, phase: null, endsAt: 0, usedP1: false, usedP2: false } } },
    rounds: { timer3: { running: false, endsAt: 0, resolved: null } },
  };
}

test("expiredTimerOnHydrate: null, gdy nic nie odlicza", () => {
  assert.equal(expiredTimerOnHydrate(baseState()), null);
});

test("expiredTimerOnHydrate: null, gdy timer działa, ale endsAt jeszcze w przyszłości", () => {
  const s = baseState();
  s.final.runtime.timer = { ...s.final.runtime.timer, running: true, phase: "P1", endsAt: Date.now() + 60_000 };
  s.rounds.timer3 = { running: true, endsAt: Date.now() + 60_000, resolved: null };
  assert.equal(expiredTimerOnHydrate(s), null);
});

test("expiredTimerOnHydrate: wykrywa final.timer wygasły, timer3 nienaruszony", () => {
  const s = baseState();
  s.final.runtime.timer = { ...s.final.runtime.timer, running: true, phase: "P1", endsAt: Date.now() - 5000 };
  const result = expiredTimerOnHydrate(s);
  assert.deepEqual(result, { final: true, timer3: false });
});

test("expiredTimerOnHydrate: wykrywa timer3 wygasły, final.timer nienaruszony", () => {
  const s = baseState();
  s.rounds.timer3 = { running: true, endsAt: Date.now() - 1000, resolved: null };
  const result = expiredTimerOnHydrate(s);
  assert.deepEqual(result, { final: false, timer3: true });
});

test("expiredTimerOnHydrate: wykrywa OBA naraz (final.timer i timer3 wygasłe równocześnie)", () => {
  const s = baseState();
  s.final.runtime.timer = { ...s.final.runtime.timer, running: true, phase: "P2", endsAt: Date.now() - 5000 };
  s.rounds.timer3 = { running: true, endsAt: Date.now() - 1000, resolved: null };
  const result = expiredTimerOnHydrate(s);
  assert.deepEqual(result, { final: true, timer3: true });
});
