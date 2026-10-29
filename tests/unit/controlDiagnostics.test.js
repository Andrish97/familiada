import { test } from "node:test";
import assert from "node:assert/strict";
import { createConnectivityIncidentTracker } from "../../web/control/js/diagnostics.js";

test("łącze agreguje krótkie nawroty i zapisuje tylko skutek odczuwalny w Control", () => {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const events = [];
  const tracker = createConnectivityIncidentTracker({
    recoveryMs: 10_000,
    now: () => now,
    schedule: fn => { const id = ++nextTimer; timers.set(id, fn); return id; },
    cancel: id => timers.delete(id),
    onIncident: event => events.push(event),
  });

  tracker.update(["display"], { display: { profile: "same_profile", visibility: "hidden" } }, false);
  assert.equal(events.length, 0, "brak urządzenia przy pierwszym odczycie nie udaje zerwania");

  tracker.update(["display"], { display: { profile: "same_profile", visibility: "hidden" } }, true);
  tracker.noteBlockedAction("reveal", ["display"]);
  now = 1_200;
  tracker.update([], {});
  now = 3_000;
  tracker.update(["display"], { display: { profile: "same_profile", visibility: "hidden" } }, true);
  tracker.noteBlockedAction("next", ["display"]);
  now = 3_700;
  tracker.update([], {});
  assert.equal(events.length, 0, "czeka na stabilny powrót, zamiast zapisywać osobny wpis dla flapa");

  const [close] = timers.values();
  close();
  assert.equal(events.length, 1);
  assert.equal(events[0].blocked_duration_ms, 1_900);
  assert.equal(events[0].repeated_drops, 1);
  assert.equal(events[0].blocked_action_attempts, 2);
  assert.deepEqual(events[0].devices, ["display"]);
  assert.equal(events[0].device_context.display.visibility, "hidden");
  tracker.stop();
});

test("otwarty incydent zostaje zapisany przy końcu gry bez czekania na stabilny powrót", () => {
  let now = 0;
  const events = [];
  const tracker = createConnectivityIncidentTracker({
    now: () => now,
    schedule: () => 1,
    cancel() {},
    onIncident: event => events.push(event),
  });
  tracker.update(["display"], { display: { visibility: "hidden" } }, true);
  now = 2_300;
  tracker.noteBlockedAction("reveal", ["display"]);
  tracker.flush();
  assert.equal(events.length, 1);
  assert.equal(events[0].blocked_duration_ms, 2_300);
  assert.equal(events[0].blocked_action_attempts, 1);
  tracker.flush();
  assert.equal(events.length, 1);
});
