// Menedżer bazy: historia cofania i ponawiania (web/bases/explorer/js/history.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "../../web/bases/explorer/js/history.js";

function entry(log, name, extra = {}) {
  return {
    labelKey: name,
    undo: async () => { log.push(`undo:${name}`); },
    redo: async () => { log.push(`redo:${name}`); },
    ...extra,
  };
}

test("cofnij i ponów idą w odwrotnej kolejności, info mówi, co jest dostępne", async () => {
  const log = [];
  const h = createHistory();
  assert.deepEqual(h.info(), { canUndo: false, canRedo: false, undoLabelKey: null, redoLabelKey: null });
  h.push(entry(log, "a"));
  h.push(entry(log, "b"));
  await h.undo();
  await h.undo();
  await h.redo();
  assert.deepEqual(log, ["undo:b", "undo:a", "redo:a"]);
  assert.equal(h.info().undoLabelKey, "a");
  assert.equal(h.info().redoLabelKey, "b");
});

test("nowa akcja po cofnięciu kasuje ponowienia i woła drop('redo')", async () => {
  const log = [];
  const dropped = [];
  const h = createHistory();
  h.push(entry(log, "a", { drop: (where) => dropped.push(`a:${where}`) }));
  await h.undo();
  h.push(entry(log, "b"));
  assert.deepEqual(dropped, ["a:redo"]);
  assert.equal(h.info().canRedo, false);
});

test("nieudany krok czyści całą historię", async () => {
  const h = createHistory();
  h.push(entry([], "a"));
  h.push({ labelKey: "zły", undo: async () => { throw new Error("gone"); }, redo: async () => {} });
  await assert.rejects(() => h.undo());
  assert.deepEqual(h.info(), { canUndo: false, canRedo: false, undoLabelKey: null, redoLabelKey: null });
});

test("limit kroków: najstarsze wypadają", async () => {
  const log = [];
  const h = createHistory({ limit: 2 });
  h.push(entry(log, "a"));
  h.push(entry(log, "b"));
  h.push(entry(log, "c"));
  await h.undo();
  await h.undo();
  assert.equal(await h.undo(), null);
  assert.deepEqual(log, ["undo:c", "undo:b"]);
});

test("onChange po każdej zmianie", async () => {
  let n = 0;
  const h = createHistory({ onChange: () => { n += 1; } });
  h.push(entry([], "a"));
  await h.undo();
  assert.ok(n >= 3); // push + start kroku + koniec kroku
});

test("element zajęty (keepHistory): krok wraca na miejsce, historia zostaje", async () => {
  const h = createHistory();
  let busy = true;
  const log = [];
  h.push({ labelKey: "a", undo: async () => { if (busy) { const e = new Error("locked"); e.keepHistory = true; throw e; } log.push("undo"); }, redo: async () => {} });
  await assert.rejects(() => h.undo());
  assert.equal(h.info().canUndo, true);
  busy = false;
  await h.undo();
  assert.deepEqual(log, ["undo"]);
  assert.equal(h.info().canRedo, true);
});
