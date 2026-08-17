// Śledzenie realnych rozgrywek (public.game_sessions) — czysto dodatkowe,
// nie wpływa na przebieg gry. Każda funkcja połyka własne błędy: awaria
// zapisu statystyk nigdy nie ma przerywać ani spowalniać rozgrywki.
import { sb } from "../../js/core/supabase.js?v=v2026-07-17T17520";

let currentSessionId = null;
let roundsPlayedCount = 0;

export async function sessionStart(gameId, meta = {}) {
  try {
    const { data, error } = await sb().rpc("game_session_start", {
      p_game_id: gameId,
      p_client_meta: meta,
    });
    if (error) throw error;
    currentSessionId = data || null;
    roundsPlayedCount = 0;
  } catch (e) {
    console.warn("[sessionTracking] start failed:", e);
  }
}

export async function sessionRoundCompleted() {
  if (!currentSessionId) return;
  roundsPlayedCount += 1;
  try {
    const { error } = await sb().rpc("game_session_update", {
      p_session_id: currentSessionId,
      p_status: "playing",
      p_rounds_played: roundsPlayedCount,
      p_client_meta_patch: null,
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[sessionTracking] round update failed:", e);
  }
}

export async function sessionLogError(message) {
  if (!currentSessionId) return;
  try {
    const { error } = await sb().rpc("game_session_update", {
      p_session_id: currentSessionId,
      p_status: null,
      p_rounds_played: null,
      p_client_meta_patch: { last_error: String(message ?? ""), last_error_at: new Date().toISOString() },
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[sessionTracking] error log failed:", e);
  }
}

export async function sessionEnd(status, errorMessage = null) {
  if (!currentSessionId) return;
  const id = currentSessionId;
  currentSessionId = null;
  try {
    const { error } = await sb().rpc("game_session_end", {
      p_session_id: id,
      p_status: status,
      p_error_message: errorMessage,
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[sessionTracking] end failed:", e);
  }
}
