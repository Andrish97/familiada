import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../web/shared/js/core/device-lease.js", import.meta.url), "utf8")
  .replace(/^import .*;$/gm, "")
  .replace(/export function/g, "function");

test("lease wygasły po wznowieniu karty rejestruje nową instancję i odzyskuje primary", async () => {
  const calls = [];
  const listeners = new Map();
  const timers = new Map();
  let nextId = 0;
  let nextHeartbeat = null;
  const responses = {
    control_device_instance_register: { mode: "lease", state: "primary", epoch: 1 },
  };
  const client = {
    rpc(name, params) {
      calls.push({ name, params });
      const response = name === "control_device_instance_heartbeat"
        ? nextHeartbeat
        : responses[name];
      return { abortSignal: async () => ({ data: response, error: null }) };
    },
  };
  const context = {
    sb: () => client,
    t: key => key,
    document: {
      visibilityState: "visible", hasFocus: () => true,
      addEventListener() {}, removeEventListener() {}, getElementById: () => null,
    },
    window: {
      addEventListener(name, fn) { listeners.set(name, fn); },
      removeEventListener(name) { listeners.delete(name); },
    },
    crypto: { randomUUID: () => `connection-${++nextId}` },
    AbortSignal,
    setInterval(fn, ms) { timers.set(ms, fn); return ms; },
    clearInterval(ms) { timers.delete(ms); },
  };
  const create = vm.runInNewContext(`${source}; createDeviceLease;`, context);
  const lease = create({ gameId: "game", deviceType: "host", key: "key" });
  await lease.start();
  const originalId = lease.connectionId;

  nextHeartbeat = { mode: "lease", state: "expired", epoch: null };
  responses.control_device_instance_register = { mode: "lease", state: "primary", epoch: 3 };
  listeners.get("focus")();
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(calls.map(call => call.name), [
    "control_device_instance_register",
    "control_device_instance_heartbeat",
    "control_device_instance_register",
  ]);
  assert.notEqual(lease.connectionId, originalId);
  assert.equal(calls[1].params.p_connection_id, originalId);
  assert.equal(calls[2].params.p_connection_id, lease.connectionId);
  assert.equal(lease.actionArgs().p_connection_id, lease.connectionId);
  assert.equal(lease.actionArgs().p_epoch, 3);
  lease.stop();
  assert.equal(listeners.has("focus"), false);
  assert.equal(listeners.has("online"), false);
  assert.equal(timers.size, 0);
});
