// js/core/direct-channel-ready.js
// Gotowość kanału postgres_changes urządzenia (diagnoza 2026-10-23,
// docs/diagnostyka-sesji-plan.md „Realtime”). SUBSCRIBED oznacza tylko
// dołączenie do kanału; subskrypcję w bazie Realtime zakłada chwilę później
// i potwierdza komunikatem systemowym „Subscribed to PostgreSQL”. Zmiany
// z tej przerwy przepadały, a urządzenie wyłączało już transport zapasowy.
// Kanał jest gotowy dopiero po obu sygnałach (w dowolnej kolejności).

// Komunikat systemowy kanału dotyczący postgres_changes: "ok", "error" albo null.
export function postgresSystemStatus(payload) {
  const isPostgres = payload?.extension === "postgres_changes"
    || /PostgreSQL/i.test(String(payload?.message || ""));
  if (!isPostgres) return null;
  return payload?.status === "ok" ? "ok" : "error";
}

// Zachowujemy wyłącznie techniczne, krótkie metadane zamknięcia gniazda.
// Nie zapisujemy surowego komunikatu z serwera ani payloadu, który mógłby
// zawierać dane sesji.
export function realtimeSocketCloseDetails(event) {
  const details = {};
  const code = Number(event?.code);
  if (Number.isInteger(code) && code >= 1000 && code <= 4999) details.socket_close_code = code;
  if (typeof event?.wasClean === "boolean") details.socket_close_clean = event.wasClean;
  if (typeof event?.reason === "string" && event.reason) {
    const reason = event.reason
      .replace(/eyJ[A-Za-z0-9._-]+/g, "redacted")
      .replace(/[^A-Za-z0-9_.:/+-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);
    if (reason) details.socket_close_reason = reason;
  }
  return details;
}

export function createDirectReadiness(onReady) {
  let joined = false;
  let postgresReady = false;
  let fired = false;
  function check() {
    if (joined && postgresReady && !fired) {
      fired = true;
      onReady();
    }
  }
  return {
    joined() {
      // Kolejne SUBSCRIBED po gotowym kanale to ponowne dołączenie: serwer
      // zakłada subskrypcję od nowa i znów ją potwierdza.
      if (fired) { postgresReady = false; fired = false; }
      joined = true;
      check();
    },
    postgres(status) {
      if (status === "ok") { postgresReady = true; check(); }
      else if (status === "error") { postgresReady = false; fired = false; }
    },
    reset() { joined = false; postgresReady = false; fired = false; },
    get ready() { return fired; },
  };
}
