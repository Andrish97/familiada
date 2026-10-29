import { test } from "node:test";
import assert from "node:assert/strict";
import { createDirectReadiness, observeRealtimeSocketClose, postgresSystemStatus, realtimeSocketCloseDetails } from "../../web/shared/js/core/direct-channel-ready.js";

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

test("komunikat systemowy postgres_changes: ok, błąd albo obcy", () => {
  assert.equal(postgresSystemStatus({ extension: "postgres_changes", status: "ok", message: "Subscribed to PostgreSQL" }), "ok");
  assert.equal(postgresSystemStatus({ status: "ok", message: "Subscribed to PostgreSQL" }), "ok");
  assert.equal(postgresSystemStatus({ extension: "postgres_changes", status: "error", message: "Error subscribing to PostgreSQL" }), "error");
  assert.equal(postgresSystemStatus({ extension: "broadcast", status: "ok", message: "ok" }), null);
  assert.equal(postgresSystemStatus(null), null);
});

test("kanał gotowy dopiero po SUBSCRIBED i potwierdzeniu PostgreSQL, w dowolnej kolejności", () => {
  let n = 0;
  const a = createDirectReadiness(() => n++);
  a.joined();
  assert.equal(n, 0);
  a.postgres("ok");
  assert.equal(n, 1);
  a.postgres("ok");
  assert.equal(n, 1, "jedno zgłoszenie gotowości");

  const b = createDirectReadiness(() => n++);
  b.postgres("ok");
  assert.equal(b.ready, false);
  b.joined();
  assert.equal(b.ready, true);
  assert.equal(n, 2);
});

test("błąd subskrypcji i ponowne dołączenie wymagają nowego potwierdzenia", () => {
  let n = 0;
  const r = createDirectReadiness(() => n++);
  r.joined(); r.postgres("ok");
  r.postgres("error");
  assert.equal(r.ready, false);
  r.postgres("ok");
  assert.equal(n, 2);
  r.reset();
  r.joined();
  assert.equal(n, 2, "po rejoin bez potwierdzenia PostgreSQL kanał nie jest gotowy");
  r.postgres("ok");
  assert.equal(n, 3);
});

test("ponowne SUBSCRIBED bez statusu błędu czeka na nowe potwierdzenie PostgreSQL", () => {
  let n = 0;
  const r = createDirectReadiness(() => n++);
  r.joined(); r.postgres("ok");
  r.joined();
  assert.equal(r.ready, false);
  r.postgres("ok");
  assert.equal(n, 2);
});
