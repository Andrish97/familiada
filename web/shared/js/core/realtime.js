// js/core/realtime.js
import { sb, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase.js?v=v2026-10-18T07075";

// ch.httpSend() używa nowego URL /realtime/v1/api/broadcast/{topic}/events/{event}
// który zwraca 404 na tym serwerze. Używamy starego stabilnego endpointu z body { messages }.
async function restBroadcast(topic, event, payload) {
  const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ messages: [{ topic, event, payload }] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`broadcast ${res.status}: ${text}`);
  }
}

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
  const statusListeners = new Set();

  function publishStatus(nextStatus) {
    status = nextStatus;
    for (const listener of statusListeners) {
      try { listener(status); } catch (error) { console.warn("[realtime] status listener failed", error); }
    }
  }

  function ensureChannel() {
    if (ch) return ch;

    ch = sb().channel(topic);

    // subscribe + status tracking
    readyPromise = new Promise((resolve, reject) => {
      ch.subscribe((st) => {
        publishStatus(st);
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
      await restBroadcast(topic, event, safe);
      return true;
    }

    // auto: jeśli nie jesteśmy SUBSCRIBED, nie próbujemy WS → idziemy od razu HTTP
    if (mode === "auto" && status !== "SUBSCRIBED") {
      await restBroadcast(topic, event, safe);
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
      await restBroadcast(topic, event, safe);
      return true;
    }

    // UWAGA: tu Supabase potrafi robić "silent REST fallback" → unikamy go
    // przez przechwycenie błędu i w auto robimy jawny httpSend.
    const { error } = await ch.send({ type: "broadcast", event, payload: safe });
    if (!error) return true;

    reset();
    if (mode === "ws") throw error;

    // auto: jawny fallback
    await restBroadcast(topic, event, safe);
    return true;
  }


  function onBroadcast(event, handler) {
    ensureChannel();
    ch.on("broadcast", { event }, (msg) => handler(msg));
    return ch;
  }

  function onStatus(handler) {
    if (typeof handler !== "function") return () => {};
    statusListeners.add(handler);
    if (status !== "IDLE") {
      try { handler(status); } catch (error) { console.warn("[realtime] status listener failed", error); }
    }
    return () => statusListeners.delete(handler);
  }

  return {
    topic,
    get status() {
      return status;
    },
    whenReady,
    sendBroadcast,
    onBroadcast,
    onStatus,
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
