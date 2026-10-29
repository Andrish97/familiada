import { test } from "node:test";
import assert from "node:assert/strict";
import { missingDevices } from "../../web/control/js/deviceGate.js";

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

test("blockingDevices: Wyświetlacz zawsze, Przycisk tylko w pojedynku, Prowadzący nigdy (decyzja 2026-10-29)", async () => {
  const { blockingDevices } = await import("../../web/control/js/deviceGate.js");
  const base = { locks: { gameStarted: true, gameEnded: false }, settings: { noHostTablet: false, physicalBuzzer: false } };
  assert.deepEqual(blockingDevices({ ...base, step: "r_play" }, { display: true }), [], "uśpiony Prowadzący i Przycisk poza pojedynkiem nie wstrzymują gry");
  assert.deepEqual(blockingDevices({ ...base, step: "r_duel" }, { display: true, host: false, buzzer: false }), ["buzzer"]);
  assert.deepEqual(blockingDevices({ ...base, step: "r_play" }, { host: true, buzzer: true }), ["display"]);
  const physical = { ...base, step: "r_duel", settings: { noHostTablet: false, physicalBuzzer: true } };
  assert.deepEqual(blockingDevices(physical, { display: true }), [], "z fizycznym przyciskiem pojedynek nie czeka na telefon");
  assert.deepEqual(blockingDevices({ locks: { gameStarted: false }, step: "r_duel", settings: {} }, {}), []);
});

test("absenceCause: uśpione, gdy strona zgłosiła tło przed zniknięciem", async () => {
  const { absenceCause } = await import("../../web/control/js/deviceGate.js");
  assert.equal(absenceCause({ visibility: "hidden" }), "asleep");
  assert.equal(absenceCause({ visibility: "visible" }), "offline");
  assert.equal(absenceCause(null), "offline");
});
