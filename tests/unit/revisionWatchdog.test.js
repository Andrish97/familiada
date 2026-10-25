import { test } from "node:test";
import assert from "node:assert/strict";
import { createRevisionWatchdog } from "../../web/shared/js/core/revision-watchdog.js";

function createTimerHarness() {
  let callback = null;
  let cleared = 0;
  let delay = null;
  return {
    setTimer(fn, ms) { callback = fn; delay = ms; return 1; },
    clearTimer() { cleared++; callback = null; },
    fire() { const fn = callback; callback = null; fn?.(); },
    cleared: () => cleared,
    delay: () => delay,
  };
}

test("heartbeat watchdog: spóźniony wiersz realtime anuluje nadrabianie", () => {
  const timer = createTimerHarness();
  let receivedRev = 5;
  const missed = [];
  const watchdog = createRevisionWatchdog({
    getReceivedRev: () => receivedRev,
    onMissed: event => missed.push(event),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  watchdog.noteServerRevision(6);
  receivedRev = 6;
  watchdog.observeReceivedRevision();
  timer.fire();
  assert.deepEqual(missed, []);
  assert.equal(timer.cleared(), 1);
});

test("heartbeat watchdog: nadrabia po krótkim grace zamiast czekać na kolejny heartbeat", () => {
  const timer = createTimerHarness();
  let receivedRev = 5;
  const missed = [];
  const watchdog = createRevisionWatchdog({
    getReceivedRev: () => receivedRev,
    onMissed: event => missed.push(event),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  watchdog.noteServerRevision(6);
  watchdog.noteServerRevision(7);
  assert.deepEqual(missed, []);
  assert.equal(timer.delay(), 700);
  timer.fire();
  assert.deepEqual(missed, [{ latest_revision: 7, missed_revisions: 2, grace_ms: 700 }]);
});

test("heartbeat watchdog: starszy odczyt heartbeat nie kasuje nowszej oczekującej rewizji", () => {
  const timer = createTimerHarness();
  let receivedRev = 5;
  const missed = [];
  const watchdog = createRevisionWatchdog({
    getReceivedRev: () => receivedRev,
    onMissed: event => missed.push(event),
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  watchdog.noteServerRevision(7);
  watchdog.noteServerRevision(6);
  timer.fire();
  assert.deepEqual(missed, [{ latest_revision: 7, missed_revisions: 2, grace_ms: 700 }]);
});
