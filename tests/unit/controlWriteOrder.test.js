import { test } from "node:test";
import assert from "node:assert/strict";
import { createWriteOrder, confirmedRevisionOnly } from "../../web/control/js/writeOrder.js";

test("nowszy zapis w kolejce jest widoczny tylko, gdy czeka coś poza bieżącym", () => {
  const order = createWriteOrder();
  order.enqueue();
  assert.equal(order.newerQueued(), false);
  order.enqueue();
  assert.equal(order.newerQueued(), true);
  order.settle();
  assert.equal(order.newerQueued(), false);
  order.settle(); order.settle();
  order.enqueue();
  assert.equal(order.newerQueued(), false, "licznik nie schodzi poniżej zera");
});

test("potwierdzenie starszego zapisu bierze z serwera tylko rewizję i blokadę", () => {
  const local = { rev: 3, step: "setup_finish", top_card: "devices", detail: { a: 1 } };
  const server = { rev: 4, step: "devices_display", top_card: "devices", locked_until: "2026-10-23T14:00:00Z", detail: { a: 0 } };
  assert.deepEqual(confirmedRevisionOnly(local, server), {
    rev: 4, step: "setup_finish", top_card: "devices", detail: { a: 1 }, locked_until: "2026-10-23T14:00:00Z",
  });
});
