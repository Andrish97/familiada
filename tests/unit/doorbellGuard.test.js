import { test } from "node:test";
import assert from "node:assert/strict";
import { createDoorbellGuard } from "../../web/shared/js/core/doorbell-guard.js";

function setup({ direct = true, received = 10 } = {}) {
  const env = { direct, received, fetches: 0, missed: [], stale: 0, timers: [] };
  const guard = createDoorbellGuard({
    graceMs: 400,
    getReceivedRev: () => env.received,
    isDirectConnected: () => env.direct,
    fetchNow: () => { env.fetches += 1; },
    onMissed: (m) => env.missed.push(m),
    onStale: () => { env.stale += 1; },
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; env.timers.push(t); return t; },
    clearTimer: (t) => { if (t) t.cleared = true; },
  });
  env.fire = () => { const t = env.timers.filter(x => !x.cleared).pop(); t.cleared = true; t.fn(); };
  return { guard, env };
}

test("bez kanału bezpośredniego dzwonek od razu dociąga stan", () => {
  const { guard, env } = setup({ direct: false });
  guard.ring(11);
  assert.equal(env.fetches, 1);
  assert.equal(env.timers.length, 0);
});

test("starszy lub znany rev nic nie robi", () => {
  const { guard, env } = setup();
  guard.ring(10); guard.ring(9); guard.ring("11");
  assert.equal(env.fetches, 0);
  assert.equal(env.timers.length, 0);
});

test("kanał dostarczył rewizję w czasie — bez odczytu", () => {
  const { guard, env } = setup();
  guard.ring(11);
  assert.equal(env.timers[0].ms, 400);
  env.received = 11;
  env.fire();
  assert.equal(env.fetches, 0);
  assert.equal(env.missed.length, 0);
});

test("zgubiona zmiana: odczyt RPC po 400 ms zamiast heartbeatu, diagnostyka z liczbą rewizji", () => {
  const { guard, env } = setup();
  guard.ring(12);
  env.fire();
  assert.equal(env.fetches, 1);
  assert.deepEqual(env.missed, [{ latest_revision: 12, missed_revisions: 2 }]);
  assert.equal(env.stale, 0);
});

test("dwie wpadki z rzędu = kanał nieświeży (odbudowa), dostarczenie zeruje licznik", () => {
  const { guard, env } = setup();
  guard.ring(11); env.fire();
  env.received = 11;
  guard.ring(12); env.received = 12; env.fire();
  guard.ring(13); env.fire();
  assert.equal(env.stale, 0, "wpadki przedzielone dostarczeniem");
  guard.ring(14); env.fire();
  assert.equal(env.stale, 1);
  assert.equal(env.fetches, 2);
});

test("stop anuluje oczekujące sprawdzenie", () => {
  const { guard, env } = setup();
  guard.ring(11);
  guard.stop();
  assert.equal(env.timers[0].cleared, true);
});
