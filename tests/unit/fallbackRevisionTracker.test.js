import { test } from "node:test";
import assert from "node:assert/strict";
import { createFallbackRevisionTracker } from "../../web/shared/js/core/fallback-revision-tracker.js";

test("fallback rewizji jest skorelowany z późniejszym Postgres Changes", () => {
  let now = 100;
  const tracker = createFallbackRevisionTracker({ now: () => now });
  tracker.noteFallback(9, "lease_heartbeat");
  now = 735;
  assert.deepEqual(tracker.noteDirect(9), [{
    trigger: "lease_heartbeat", fallback_revision: 9, direct_revision: 9, fallback_to_direct_ms: 635,
  }]);
  assert.deepEqual(tracker.noteDirect(10), []);
});

test("nowsza bezpośrednia rewizja potwierdza nadrobienie wcześniejszego fallbacku", () => {
  let now = 10;
  const tracker = createFallbackRevisionTracker({ now: () => now });
  tracker.noteFallback(8, "doorbell");
  tracker.noteFallback(9, "lease_heartbeat");
  now = 520;
  assert.deepEqual(tracker.noteDirect(10), [
    { trigger: "doorbell", fallback_revision: 8, direct_revision: 10, fallback_to_direct_ms: 510 },
    { trigger: "lease_heartbeat", fallback_revision: 9, direct_revision: 10, fallback_to_direct_ms: 510 },
  ]);
});

test("rewizja odebrana po odbudowie kanału nie jest liczona jako spóźniona dostawa starego kanału", () => {
  let now = 10;
  const tracker = createFallbackRevisionTracker({ now: () => now });
  tracker.noteFallback(8, "lease_heartbeat");
  tracker.clear(); // resync: poprzedni kanał został zamknięty przed RPC resume
  now = 520;
  assert.deepEqual(tracker.noteDirect(9), []);
});
