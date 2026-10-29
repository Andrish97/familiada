import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAndConfirm } from "../../web/shared/js/gameplay/renderCompletion.js";
test("parallel point and total animations send exactly one completion after both finish", async () => {
 let finishPoints, finishTotal, confirmations = 0;
 const points = new Promise(resolve => finishPoints = resolve);
 const total = new Promise(resolve => finishTotal = resolve);
 const pending = renderAndConfirm(() => Promise.all([points, total]), () => { confirmations++; });
 finishPoints(); await new Promise(resolve => setImmediate(resolve));
 assert.equal(confirmations, 0);
 finishTotal(); await pending;
 assert.equal(confirmations, 1);
});
test("failed or cancelled rendering is not acknowledged", async () => {
 let confirmations = 0;
 await assert.rejects(renderAndConfirm(async () => { throw new Error("render failed"); }, () => { confirmations++; }));
 await renderAndConfirm(async () => {}, () => { confirmations++; }, () => false);
 assert.equal(confirmations, 0);
});

test("an older completion cannot unlock a newer requested transition", async () => {
 const { createRenderCompletionGate } = await import("../../web/shared/js/gameplay/renderCompletion.js");
 const gate = createRenderCompletionGate(10);
 assert.equal(gate.pending, true);
 gate.acknowledge(10);
 assert.equal(gate.pending, false);
 gate.request(11);
 gate.acknowledge(10);
 assert.equal(gate.pending, true);
 gate.acknowledge(11);
 assert.equal(gate.pending, false);
 gate.acknowledge(9);
 assert.equal(gate.completedRevision, 11);
});
