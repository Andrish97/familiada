import { test } from "node:test";
import assert from "node:assert/strict";
import { createDoorbellGuard } from "../../web/shared/js/core/doorbell-guard.js";

test("dzwonek: brak rewizji po grace uruchamia awaryjne pobranie", () => {
  let receivedRev = 3;
  let timerCallback = null;
  let fetches = 0;
  const missed = [];
  const guard = createDoorbellGuard({
    graceMs: 400,
    getReceivedRev: () => receivedRev,
    isDirectConnected: () => true,
    fetchNow: () => { fetches++; },
    onMissed: (event) => missed.push(event),
    setTimer: (callback) => { timerCallback = callback; return 1; },
    clearTimer: () => {},
  });

  guard.ring(4);
  timerCallback();
  assert.equal(fetches, 1);
  assert.deepEqual(missed, [{ latest_revision: 4, missed_revisions: 1, grace_ms: 400 }]);
  guard.stop();
});

test("dzwonek: rewizja odebrana w czasie grace nie uruchamia fallbacku", () => {
  let receivedRev = 3;
  let timerCallback = null;
  let fetches = 0;
  const missed = [];
  const guard = createDoorbellGuard({
    graceMs: 400,
    getReceivedRev: () => receivedRev,
    isDirectConnected: () => true,
    fetchNow: () => { fetches++; },
    onMissed: (event) => missed.push(event),
    setTimer: (callback) => { timerCallback = callback; return 1; },
    clearTimer: () => {},
  });

  guard.ring(4);
  receivedRev = 4;
  timerCallback();
  assert.equal(fetches, 0);
  assert.deepEqual(missed, []);
  guard.stop();
});
