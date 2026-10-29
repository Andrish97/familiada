import { test } from "node:test";
import assert from "node:assert/strict";
import { observeRealtimeSocketClose, realtimeSocketCloseDetails } from "../../web/shared/js/core/realtime-socket-close.js";

test("metadane zamknięcia WebSocket są ograniczone i oczyszczone", () => {
  assert.deepEqual(realtimeSocketCloseDetails({ code: 1006, wasClean: false, reason: "network unavailable" }), {
    socket_close_code: 1006, socket_close_clean: false, socket_close_reason: "network-unavailable",
  });
  assert.equal(realtimeSocketCloseDetails({ code: 1000, wasClean: true, reason: "eyJhbGciOi.token" }).socket_close_reason, "redacted");
  assert.deepEqual(realtimeSocketCloseDetails({ code: 42, wasClean: "yes", reason: "" }), {});
});

test("obserwator zamknięcia podpina się do adaptera Realtime bez blokowania klienta", () => {
  let received;
  const handler = event => { received = event; };
  const realtime = { socketAdapter: { onClose: callback => { realtime.callback = callback; } } };
  assert.equal(observeRealtimeSocketClose(realtime, handler), true);
  const close = { code: 1006, wasClean: false };
  realtime.callback(close);
  assert.equal(received, close);
  assert.equal(observeRealtimeSocketClose({}, handler), false);
  assert.equal(observeRealtimeSocketClose({ socketAdapter: { onClose() { throw new Error("unsupported"); } } }, handler), false);
});
