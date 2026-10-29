// js/core/realtime-socket-close.js
// Diagnostyka zamknięć gniazda Realtime urządzenia (transport_state socket_closed).

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

// Supabase JS 2.118 exposes close callbacks on its Realtime transport adapter
// (`client.realtime.socketAdapter`), not on RealtimeClient itself. Prefer a
// public method if a later SDK version adds one, then use the pinned adapter
// API. A missing observer must never prevent channel subscription.
export function observeRealtimeSocketClose(realtime, callback) {
  const targets = [realtime, realtime?.socketAdapter];
  const target = targets.find(candidate => typeof candidate?.onClose === "function");
  if (!target) return false;
  try {
    target.onClose(callback);
    return true;
  } catch {
    return false;
  }
}
