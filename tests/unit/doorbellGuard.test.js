import { test } from "node:test";
import assert from "node:assert/strict";
import { createDoorbellGuard } from "../../web/shared/js/core/doorbell-guard.js";

function setup({ direct = true, received = 3, directRev = 3, graceMs } = {}) {
  const env = { received, directRev, direct, fetches: 0, missed: [], stale: 0, timer: null };
  const guard = createDoorbellGuard({
    ...(graceMs ? { graceMs } : {}),
    getReceivedRev: () => env.received,
    getDirectRev: () => env.directRev,
    isDirectConnected: () => env.direct,
    fetchNow: () => { env.fetches += 1; },
    onMissed: (event) => env.missed.push(event),
    onStale: () => { env.stale += 1; },
    setTimer: (callback, ms) => { env.timer = { callback, ms }; return env.timer; },
    clearTimer: () => {},
  });
  env.fire = () => { const t = env.timer; env.timer = null; t.callback(); };
  return { guard, env };
}

test("dzwonek: odczyt od razu, bez czekania na Realtime (także przy połączonym kanale)", () => {
  const { guard, env } = setup();
  guard.ring(4);
  assert.equal(env.fetches, 1);
  assert.equal(env.timer.ms, 600, "kanał oceniany po progu");
});

test("dzwonek bez kanału bezpośredniego: odczyt i brak oceny kanału", () => {
  const { guard, env } = setup({ direct: false });
  guard.ring(4);
  assert.equal(env.fetches, 1);
  assert.equal(env.timer, null);
});

test("znana rewizja (odczyt już ją dostarczył) nic nie robi", () => {
  const { guard, env } = setup({ received: 4 });
  guard.ring(4); guard.ring(3); guard.ring("5");
  assert.equal(env.fetches, 0);
});

test("kanał dostarczył rewizję w progu — zdrowy, bez diagnostyki", () => {
  const { guard, env } = setup();
  guard.ring(4);
  env.received = 4;
  env.directRev = 4;
  env.fire();
  assert.deepEqual(env.missed, []);
});

test("odczyt wygrał, ale kanał nie dostarczył w progu — diagnostyka; dwie wpadki z rzędu = odbudowa", () => {
  const { guard, env } = setup();
  guard.ring(4);
  env.received = 4;
  env.fire();
  assert.deepEqual(env.missed, [{ latest_revision: 4, missed_revisions: 1, grace_ms: 600 }]);
  assert.equal(env.stale, 0);
  guard.ring(5);
  env.received = 5;
  env.fire();
  assert.equal(env.stale, 1);
  assert.equal(env.fetches, 2, "odczyt tylko po dzwonku, nie drugi raz po progu");
});

test("spóźniony wiersz Realtime czyści serię wpadek przed odbudową kanału", () => {
  const { guard, env } = setup();
  guard.ring(4);
  env.fire();
  env.directRev = 4;
  guard.noteReceived(4);
  guard.ring(5);
  env.fire();
  assert.equal(env.stale, 0);
});
