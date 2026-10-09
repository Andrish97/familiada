import { test } from "node:test";
import assert from "node:assert/strict";
import { createRowSync } from "../../web/shared/js/core/game-state-sync.js";

const row = (rev, extra = {}) => ({ rev, locked_until: null, ...extra });
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test("błąd odczytu planuje ponowną próbę, więc urządzenie dogania stan bez kolejnego dzwonka", async () => {
  const seen = [], errors = [];
  let calls = 0;
  const sync = createRowSync({
    fetchRow: async () => (++calls === 1 ? { error: new Error("net") } : { data: row(7) }),
    onRow: (r) => seen.push(r.rev),
    onError: (e) => errors.push(e),
    retryMs: 1,
  });
  await sync.fetchGuarded();
  assert.equal(errors.length, 1);
  await tick(20);
  assert.deepEqual(seen, [7]);
});

test("wyjątek z fetchRow (np. przerwane żądanie) też jest ponawiany", async () => {
  const seen = [];
  let calls = 0;
  const sync = createRowSync({
    fetchRow: async () => { if (++calls === 1) throw new Error("abort"); return { data: row(3) }; },
    onRow: (r) => seen.push(r.rev),
    retryMs: 1,
  });
  await sync.fetchGuarded();
  await tick(20);
  assert.deepEqual(seen, [3]);
});

test("po przerwanym odczycie okresowy odczyt nie czeka na retry i dostaje świeży wiersz", async () => {
  const seen = [];
  let calls = 0;
  const sync = createRowSync({
    fetchRow: () => (++calls === 1 ? Promise.reject(new Error("timeout")) : Promise.resolve({ data: row(9) })),
    onRow: (r) => seen.push(r.rev),
    retryMs: 100000,
  });
  await sync.fetchGuarded();
  await sync.fetchGuarded();
  assert.deepEqual(seen, [9]);
});

test("starszy lub ten sam rev jest pomijany, nowszy stosowany", async () => {
  const seen = [];
  const queue = [row(5), row(4), row(5), row(6)];
  const sync = createRowSync({ fetchRow: async () => ({ data: queue.shift() }), onRow: (r) => seen.push(r.rev) });
  for (let i = 0; i < 4; i++) await sync.fetchGuarded();
  assert.deepEqual(seen, [5, 6]);
});

test("ten sam rev ze zmienioną blokadą (game_state_set_lock) jest stosowany, gdy wołający o to prosi", async () => {
  const seen = [];
  const queue = [row(5, { locked_until: "A" }), row(5, { locked_until: "A" }), row(5, { locked_until: "B" })];
  const sync = createRowSync({
    fetchRow: async () => ({ data: queue.shift() }),
    onRow: (r) => seen.push(r.locked_until),
    sameRevChanged: (a, b) => a.locked_until !== b.locked_until,
  });
  for (let i = 0; i < 3; i++) await sync.fetchGuarded();
  assert.deepEqual(seen, ["A", "B"]);
});

test("wyjątek z onRow nie zatrzymuje kolejnych odczytów", async () => {
  const seen = [];
  const queue = [row(1), row(2)];
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const sync = createRowSync({
      fetchRow: async () => ({ data: queue.shift() }),
      onRow: (r) => { seen.push(r.rev); if (r.rev === 1) throw new Error("render"); },
    });
    await sync.fetchGuarded();
    await sync.fetchGuarded();
  } finally { console.warn = origWarn; }
  assert.deepEqual(seen, [1, 2]);
});
