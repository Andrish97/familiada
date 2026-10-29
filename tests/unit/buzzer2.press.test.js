import { test } from "node:test";
import assert from "node:assert/strict";
import { createPressController } from "../../web/control/buzzer/js/press.js";

function setup() {
  let row = { rev: 1, step: "r_duel", top_card: "rounds", detail: { settings: {}, rounds: { duel: { enabled: true, lastPressed: null } } } };
  const paints = [], sends = [];
  let resolve;
  const response = new Promise((done) => { resolve = done; });
  const controller = createPressController({
    getRow: () => row,
    render: (value, team) => paints.push({ value, team }),
    send: (team) => { sends.push(team); assert.equal(paints.at(-1).team, team); return response; },
    applyRow: (value) => { if (value.rev > row.rev) row = value; },
    refetch: async () => { row = { ...row, rev: 2, detail: { ...row.detail, rounds: { duel: { enabled: true, lastPressed: "B" } } } }; },
  });
  return { controller, paints, sends, resolve, getRow: () => row };
}

test("Buzzer lights before sending and rejects a second press while awaiting RPC", async () => {
  const { controller, paints, sends, resolve, getRow } = setup();
  const pending = controller.press("A");
  assert.equal(paints[0].team, "A");
  controller.render(getRow()); // An old heartbeat/refetch must not extinguish it.
  assert.equal(paints.at(-1).team, "A");
  await controller.press("B");
  assert.deepEqual(sends, ["A"]);
  resolve({ data: { ...getRow(), rev: 2, detail: { settings: {}, rounds: { duel: { enabled: true, lastPressed: "A" } } } } });
  await pending;
  assert.equal(paints.at(-1).value.detail.rounds.duel.lastPressed, "A");
  assert.equal(paints.at(-1).team, null);
});

test("A losing press replaces the provisional light with the server winner", async () => {
  const { controller, paints, resolve } = setup();
  const pending = controller.press("A");
  resolve({ error: { message: "already_pressed" } });
  await pending;
  assert.equal(paints.at(-1).value.detail.rounds.duel.lastPressed, "B");
  assert.equal(paints.at(-1).team, null);
});

test("Network failure rolls back the provisional light and permits a retry", async () => {
  const { controller, paints, sends, resolve } = setup();
  const pending = controller.press("A");
  resolve({ error: { message: "network" } });
  await pending;
  assert.equal(paints.at(-1).team, null);
  assert.equal(paints.at(-1).value.detail.rounds.duel.lastPressed, null);
  await controller.press("B");
  assert.deepEqual(sends, ["A", "B"]);
});
