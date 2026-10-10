import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../web/control/js/presence.js", import.meta.url), "utf8")
  .replace(/^import .*;$/m, "").replace("export function", "function");

test("odczyt w toku i jego awaria nie zmieniają urządzeń na offline; poprawny odczyt wykrywa rozłączenie", async () => {
  let now = Date.now();
  let pendingResolve;
  let pending = false;
  const changes = [];
  const timers = new Map();
  const fresh = () => ["display", "host", "buzzer"].map(device_type => ({ device_type, last_seen_at: new Date(now).toISOString() }));
  let rows = fresh();
  const client = { from(table) {
    const query = {
      select() { return this; }, eq() { return this; }, maybeSingle() { return this; },
      abortSignal() {
        if (table === "display_audio_unlock") return Promise.resolve({ data: null });
        if (pending) return new Promise(resolve => { pendingResolve = resolve; });
        return Promise.resolve({ data: rows });
      },
    };
    return query;
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
  assert.deepEqual(changes.at(-1).flags, { display: true, host: true, buzzer: true });

  pending = true;
  timers.get(750)();
  now += 7500;
  timers.get(250)();
  assert.equal(changes.length, 1, "oczekiwanie na odczyt nie zgłasza fałszywego rozłączenia");
  pendingResolve({ error: { message: "HTTP 503" } });
  await settle();
  assert.equal(changes.at(-1).error.message, "HTTP 503");
  assert.deepEqual(changes.at(-1).flags, { display: true, host: true, buzzer: true });
  timers.get(250)();
  assert.equal(changes.length, 2, "TTL nie kasuje informacji o błędzie");

  pending = false;
  rows = fresh();
  await presence.refresh();
  assert.equal(changes.at(-1).error, null);
  assert.deepEqual(changes.at(-1).flags, { display: true, host: true, buzzer: true });
  rows = [];
  await presence.refresh();
  assert.deepEqual(changes.at(-1).flags, { display: false, host: false, buzzer: false });
  presence.stop();
  assert.equal(timers.size, 0);
});
