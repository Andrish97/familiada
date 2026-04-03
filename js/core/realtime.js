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
    const mode = opts.mode || "auto"; // "auto" | "ws" | "http"
    ensureChannel();

    const safe = (payload && typeof payload === "object") ? payload : { value: payload };

    // jawny REST
    if (mode === "http") {
      const { error } = await ch.httpSend(event, safe);
      if (error) throw error;
      return true;
    }

    // auto: jeśli nie jesteśmy SUBSCRIBED, nie próbujemy WS → idziemy od razu HTTP
    if (mode === "auto" && status !== "SUBSCRIBED") {
      const { error } = await ch.httpSend(event, safe);
      if (error) throw error;
      return true;
    }

    // WS (albo auto + jesteśmy SUBSCRIBED)
    const ok = await whenReady(opts);
    if (!ok) {
      if (mode === "ws") {
        reset();
        throw new Error(`Realtime not ready for topic ${topic}`);
      }
      // auto: jak nie gotowe, lecimy HTTP
      const { error } = await ch.httpSend(event, safe);
      if (error) throw error;
      return true;
    }

    // UWAGA: tu Supabase potrafi robić "silent REST fallback" → unikamy go
    // przez przechwycenie błędu i w auto robimy jawny httpSend.
    const { error } = await ch.send({ type: "broadcast", event, payload: safe });
    if (!error) return true;

    reset();
    if (mode === "ws") throw error;

    // auto: jawny fallback
    const { error: e2 } = await ch.httpSend(event, safe);
    if (e2) throw e2;
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
