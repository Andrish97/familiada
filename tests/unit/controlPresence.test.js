import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../web/control/js/presence.js", import.meta.url), "utf8")
  .replace(/^import .*;$/m, "").replace("export function", "function");

test("błąd metadanych nie blokuje lease; błąd lease blokuje do skutecznej weryfikacji", async () => {
  let now = Date.now();
  let pendingResolve;
  let pending = false;
  const changes = [];
  const timers = new Map();
  const fresh = () => ["display", "host", "buzzer"].map(device_type => ({ device_type, last_seen_at: new Date(now).toISOString() }));
  let rows = fresh();
  let leaseRows = ["display", "host", "buzzer"].map(device_type => ({ device_type, primary_online: true }));
  let leaseError = null;
  const promiseLike = promise => ({ then: (resolve, reject) => promise.then(resolve, reject) });
  const client = { from(table) {
    const query = {
      select() { return this; }, eq() { return this; }, maybeSingle() { return this; },
      abortSignal() {
        if (table === "display_audio_unlock") return promiseLike(Promise.resolve({ data: null }));
        if (pending) return promiseLike(new Promise(resolve => { pendingResolve = resolve; }));
        return promiseLike(Promise.resolve({ data: rows, error: table === "device_presence" ? null : undefined }));
      },
    };
    return query;
  }, rpc(name, params) {
    assert.equal(name, "control_device_slots_for_owner");
    assert.equal(params.p_game_id, "test");
    return { abortSignal: async () => ({ data: leaseRows, error: leaseError }) };
  } };
  const context = {
    sb: () => client, AbortSignal,
    Date: class extends Date { static now() { return now; } },
    setInterval: (fn, ms) => { timers.set(ms, fn); return ms; },
    clearInterval: ms => timers.delete(ms),
  };
  const create = vm.runInNewContext(`${source}; createPresence;`, context);
  const presence = create({ gameId: "test", onChange: event => changes.push(JSON.parse(JSON.stringify(event))) });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  presence.start();
  await settle();
  assert.deepEqual(changes.at(-1).flags, { display: true, host: true, buzzer: true }, JSON.stringify(changes));
  assert.equal(changes.at(-1).deviceDiagnostics.display.ageMs, 0);
  assert.equal(changes.at(-1).deviceDiagnostics.display.visibility, null);

  now += 7_760;
  rows = fresh().map(row => ({ ...row, last_seen_at: new Date(now - 7_760).toISOString() }));
  await presence.refresh();
  assert.deepEqual(changes.at(-1).flags, { display: true, host: true, buzzer: true },
    "stary wpis presence nie powinien oznaczać offline, gdy lease primary nadal jest ważny");

  rows = fresh();
  leaseRows = [];
  await presence.refresh();
  assert.deepEqual(changes.at(-1).flags, { display: false, host: false, buzzer: false },
    "świeży wpis waiting w device_presence nie powinien wyglądać jak aktywny primary");
  leaseRows = ["display", "host", "buzzer"].map(device_type => ({ device_type, primary_online: true }));
  await presence.refresh();
  assert.deepEqual(changes.at(-1).flags, { display: true, host: true, buzzer: true });

  const beforePending = changes.length;
  pending = true;
  timers.get(750)();
  now += 7500;
  timers.get(250)();
  assert.equal(changes.length, beforePending, "oczekiwanie na odczyt nie zgłasza fałszywego rozłączenia");
  pendingResolve({ error: { message: "HTTP 503" } });
  await settle();
  assert.equal(changes.at(-1).error.message, "HTTP 503");
  assert.equal(changes.at(-1).errorSource, "device_presence");
  assert.equal(changes.at(-1).errorSource === "lease_status", false,
    "awaria metadanych obecności nie powinna blokować lease ani akcji gry");
  assert.deepEqual(changes.at(-1).flags, { display: true, host: true, buzzer: true });
  timers.get(250)();
  assert.equal(changes.length, beforePending + 1, "TTL nie kasuje informacji o błędzie");

  pending = false;
  rows = fresh();
  leaseRows = ["display", "host", "buzzer"].map(device_type => ({ device_type, primary_online: true }));
  await presence.refresh();
  assert.equal(changes.at(-1).error, null);
  assert.deepEqual(changes.at(-1).flags, { display: true, host: true, buzzer: true });
  leaseError = { code: "57014", message: "lease timeout" };
  await presence.refresh();
  assert.equal(changes.at(-1).errorSource, "lease_status");
  assert.deepEqual(changes.at(-1).flags, { display: true, host: true, buzzer: true },
    "przy awarii autorytatywnego odczytu zachowujemy ostatni stan i wymagamy ponownej weryfikacji");
  leaseError = null;
  await presence.refresh();
  rows = [];
  leaseRows = [];
  await presence.refresh();
  assert.deepEqual(changes.at(-1).flags, { display: false, host: false, buzzer: false });
  presence.stop();
  assert.equal(timers.size, 0);
});
