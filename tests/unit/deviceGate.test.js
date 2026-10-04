import { test } from "node:test";
import assert from "node:assert/strict";
import { missingDevices } from "../../control2/js/deviceGate.js";

test("Disconnect blocks only required devices during an active game", () => {
  const state = { locks: { gameStarted: true }, settings: {} };
  assert.deepEqual(missingDevices(state, { display: true, host: true, buzzer: true }), []);
  assert.deepEqual(missingDevices(state, { display: false, host: true, buzzer: true }), ["display"]);
  assert.deepEqual(missingDevices(state, {}), ["display", "host", "buzzer"]);
  state.settings = { noHostTablet: true, physicalBuzzer: true };
  assert.deepEqual(missingDevices(state, { display: true }), []);
  state.locks.gameStarted = false;
  assert.deepEqual(missingDevices(state, {}), []);
  state.locks = { gameStarted: true, gameEnded: true };
  assert.deepEqual(missingDevices(state, {}), []);
});
