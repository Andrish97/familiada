// js/core/realtime.js
import { sb } from "./supabase.js";

const channels = new Map();

/**
 * RealtimeManager:
 * - singleton kanałów per topic
 * - send dopiero po SUBSCRIBED
 * - prosta autoreanimacja po błędach
 */
function createManagedChannel(topic) {
  let ch = null;
  let status = "IDLE"; // IDLE | SUBSCRIBING | SUBSCRIBED | ERROR | CLOSED
  let readyPromise = null;

  function ensureChannel() {
    if (ch) return ch;

    ch = sb().channel(topic);

    // subscribe + status tracking
    readyPromise = new Promise((resolve, reject) => {
      ch.subscribe((st) => {
        status = st;
        if (st === "SUBSCRIBED") resolve(true);
        if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") reject(new Error(st));
        if (st === "CLOSED") reject(new Error("CLOSED"));
      });
    }).catch(() => false);

    // phoenix low-level events (Supabase v2 channel wrapper)
    // Nie zawsze są dostępne, ale jak są – to pomagają.
    try {
      ch.on("phx_error", () => (status = "ERROR"));
      ch.on("phx_close", () => (status = "CLOSED"));
    } catch {}

    return ch;
  }

  async function whenReady({ timeoutMs = 7000 } = {}) {
    ensureChannel();

    // szybka ścieżka
    if (status === "SUBSCRIBED") return true;

    // timeout wrapper
    const t = new Promise((res) => setTimeout(() => res(false), timeoutMs));
    const ok = await Promise.race([readyPromise, t]);
    return !!ok;
  }

  function reset() {
    // twarde odpięcie (gdy kanał padł/zwariował)
    try {
      if (ch) sb().removeChannel(ch);
    } catch {}
    ch = null;
    status = "IDLE";
    readyPromise = null;
  }

  async function sendBroadcast(event, payload = {}, opts = {}) {
    const mode = opts.mode || "ws"; // "ws" | "http"
    ensureChannel();
  
    // REST: nie zależy od WS; payload musi być obiektem
    if (mode === "http") {
      const safe = (payload && typeof payload === "object") ? payload : { value: payload };
      const { error } = await ch.httpSend(event, safe);
      if (error) throw error;
      return true;
    }
  
    // WS: czekamy na SUBSCRIBED
    const ok = await whenReady(opts);
    if (!ok) {
      reset();
      const ok2 = await whenReady(opts);
      if (!ok2) throw new Error(`Realtime not ready for topic ${topic}`);
    }
  
    const safe = (payload && typeof payload === "object") ? payload : { value: payload };
    const { error } = await ch.send({
      type: "broadcast",
      event,
      payload: safe,
    });
  
    if (error) {
      reset();
      throw error;
    }
    return true;
  }

  function onBroadcast(event, handler) {
    ensureChannel();
    ch.on("broadcast", { event }, (msg) => handler(msg));
    return ch;
  }

  return {
    topic,
    get status() {
      return status;
    },
    whenReady,
    sendBroadcast,
    onBroadcast,
    reset,
  };
}

export function rt(topic) {
  const key = String(topic);
  if (!channels.has(key)) channels.set(key, createManagedChannel(key));
  return channels.get(key);
}

// opcjonalnie: wyczyść wszystko (np. przy wylogowaniu)
export function rtResetAll() {
  for (const m of channels.values()) m.reset();
  channels.clear();
}
