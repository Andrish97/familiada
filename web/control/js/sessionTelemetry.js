// Wyniki zapisuje baza przy zmianach game_state. Front zgłasza tylko
// aktywność i lokalne obserwacje; telemetryka nie blokuje akcji gry.
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-22T20295";


export function createSessionTelemetry(gameId, getState, subscribe = () => () => {}) {
  const pendingVisibility = [];
  let visibilityFlush = null;
  let visibilityRetryTimer = null;
  let visibilityRetryIndex = 0;
  let visibilityActive = false;
  let previousActive = false;
  const eventId = () => globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function isVisibilityActive(state = getState()) {
    return !!state.locks.gameStarted && !state.locks.gameEnded;
  }

  function queueVisibility(reason) {
    if (!visibilityActive) return;
    pendingVisibility.push({
      event_id: eventId(),
      reason,
      visibility: document.visibilityState || "unknown",
      focused: !!document.hasFocus?.(),
      was_discarded: !!document.wasDiscarded,
      online: navigator.onLine !== false,
    });
    void flushVisibility();
  }

  function scheduleVisibilityRetry() {
    if (!visibilityActive || !pendingVisibility.length || visibilityRetryTimer) return;
    // The first visibility snapshot can race the database trigger that creates
    // game_session_active. Retry quickly when the RPC returns false or fails;
    // waiting for the five-minute heartbeat could outlast a short game.
    const delays = [250, 1000, 3000, 10000];
    const delay = delays[Math.min(visibilityRetryIndex, delays.length - 1)];
    visibilityRetryIndex = Math.min(visibilityRetryIndex + 1, delays.length - 1);
    visibilityRetryTimer = setTimeout(() => {
      visibilityRetryTimer = null;
      void flushVisibility();
    }, delay);
  }

  async function flushVisibility() {
    if (visibilityFlush || !visibilityActive || !pendingVisibility.length) return;
    visibilityFlush = (async () => {
      while (pendingVisibility.length && visibilityActive) {
        const event = pendingVisibility[0];
        try {
          const { data, error } = await sb().rpc("control2_control_visibility_event", {
            p_game_id: gameId, p_event: event,
          });
          if (error || data !== true) {
            scheduleVisibilityRetry();
            break;
          }
          if (pendingVisibility[0]?.event_id === event.event_id) pendingVisibility.shift();
          visibilityRetryIndex = 0;
        } catch { break; }
      }
    })().finally(() => { visibilityFlush = null; });
    await visibilityFlush;
    if (pendingVisibility.length) scheduleVisibilityRetry();
    else {
      clearTimeout(visibilityRetryTimer);
      visibilityRetryTimer = null;
      visibilityRetryIndex = 0;
    }
  }

  function syncVisibilityActive(state = getState()) {
    const next = isVisibilityActive(state);
    visibilityActive = next;
    if (next && !previousActive) queueVisibility("initial");
    if (!next) {
      pendingVisibility.length = 0;
      clearTimeout(visibilityRetryTimer);
      visibilityRetryTimer = null;
      visibilityRetryIndex = 0;
    }
    previousActive = next;
  }

  async function report(event = null) {
    const state = getState();
    syncVisibilityActive(state);
    void flushVisibility();
    if (!state.locks.gameStarted || (state.locks.gameEnded && event?.kind !== "diagnostic") || (state.step === "r_intro" && event?.kind !== "diagnostic")) return;
    try {
      await sb().rpc("control2_session_ping", {
        p_game_id: gameId, p_event: event,
      });
    } catch { /* Auxiliary diagnostics never interrupt gameplay or flood console. */ }
  }
  const timer = setInterval(() => { void report(); }, 5 * 60 * 1000);
  syncVisibilityActive();
  const unsubscribe = subscribe(state => syncVisibilityActive(state));
  function visibilityChanged() {
    if (visibilityActive) queueVisibility("visibilitychange");
    if (!document.hidden) void report();
  }
  document.addEventListener("visibilitychange", visibilityChanged);
  return {
    report,
    stop() {
      clearInterval(timer);
      clearTimeout(visibilityRetryTimer);
      unsubscribe?.();
      document.removeEventListener("visibilitychange", visibilityChanged);
      visibilityActive = false;
      pendingVisibility.length = 0;
    },
  };
}
