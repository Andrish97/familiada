import { test } from "node:test";
import assert from "node:assert/strict";
import { createDirectRetryBackoff, createDirectRetryScheduler } from "../../web/shared/js/core/direct-retry-backoff.js";

test("direct Realtime retry grows to a bounded delay and resets after recovery", () => {
  const retry = createDirectRetryBackoff({ initialMs: 1_000, maxMs: 8_000 });
  assert.deepEqual(Array.from({ length: 6 }, () => retry.nextDelay()), [1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  retry.reset();
  assert.equal(retry.nextDelay(), 1_000);
});

test("direct Realtime retry schedules one reconnect at a time and cancels after success", () => {
  const timers = [];
  const cleared = new Set();
  let connected = false;
  let reconnects = 0;
  const retry = createDirectRetryScheduler({
    run: () => { reconnects++; },
    isConnected: () => connected,
    setTimer: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimer: timer => { cleared.add(timer); },
  });

  assert.equal(retry.schedule(), 1_000);
  assert.equal(retry.schedule(), null);
  assert.equal(timers[0].delay, 1_000);
  timers[0].callback();
  assert.equal(reconnects, 1);

  assert.equal(retry.schedule(), 2_000);
  assert.equal(timers[1].delay, 2_000);
  connected = true;
  retry.reset();
  assert.equal(cleared.has(timers[1]), true);
  connected = false;
  assert.equal(retry.schedule(), 1_000);
  assert.equal(timers[2].delay, 1_000);
});
