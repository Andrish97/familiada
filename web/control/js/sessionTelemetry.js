// Wyniki zapisuje baza przy zmianach game_state. Front zgłasza tylko
// aktywność i lokalne obserwacje; telemetryka nie blokuje akcji gry.
import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-09T12304";

export function createSessionTelemetry(gameId, getState) {
  async function report(event = null) {
    const state = getState();
    if (!state.locks.gameStarted || state.locks.gameEnded || state.step === "r_intro") return;
    try {
      const { error } = await sb().rpc("control2_session_ping", {
        p_game_id: gameId, p_event: event,
      });
      if (error) console.warn("[control2 statistics]", error.message);
    } catch (error) {
      console.warn("[control2 statistics]", error?.message);
    }
  }
  const timer = setInterval(() => { void report(); }, 5 * 60 * 1000);
  function visible() { if (!document.hidden) void report(); }
  document.addEventListener("visibilitychange", visible);
  return {
    report,
    stop() {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    },
  };
}
