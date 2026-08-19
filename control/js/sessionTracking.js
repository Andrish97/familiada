// Śledzenie realnych rozgrywek (public.game_sessions) — czysto dodatkowe,
// nie wpływa na przebieg gry. Każda funkcja połyka własne błędy: awaria
// zapisu statystyk nigdy nie ma przerywać ani spowalniać rozgrywki.
import { sb } from "../../js/core/supabase.js?v=v2026-08-19T16195";

let currentSessionId = null;
let roundsPlayedCount = 0;
let errors = [];
let heartbeatTimer = null;

const MAX_TRACKED_ERRORS = 20;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// Odświeża last_seen_at bez czekania na koniec rundy — żeby długa runda
// (przerwa, dyskusja, awaria) nie wyglądała w panelu admina jak porzucona
// sesja, dopóki karta gry faktycznie jest otwarta.
async function sessionHeartbeat() {
  if (!currentSessionId) return;
  try {
    const { error } = await sb().rpc("game_session_update", {
      p_session_id: currentSessionId,
      p_status: null,
      p_rounds_played: null,
      p_client_meta_patch: null,
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[sessionTracking] heartbeat failed:", e);
  }
}

export async function sessionStart(gameId, meta = {}) {
  try {
    const { data, error } = await sb().rpc("game_session_start", {
      p_game_id: gameId,
      p_client_meta: meta,
    });
    if (error) throw error;
    currentSessionId = data || null;
    roundsPlayedCount = 0;
    errors = [];
    stopHeartbeat();
    if (currentSessionId) {
      heartbeatTimer = setInterval(sessionHeartbeat, HEARTBEAT_INTERVAL_MS);
    }
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

// Odnotowuje, że rozgrywka dotarła do konkretnego kroku finału
// (np. "final_start", "p1_q3", "p2_q5") — bez zmiany statusu sesji,
// tylko jako historia postępu w client_meta.
export async function sessionFinalStep(step) {
  if (!currentSessionId) return;
  try {
    const { error } = await sb().rpc("game_session_update", {
      p_session_id: currentSessionId,
      p_status: null,
      p_rounds_played: null,
      p_client_meta_patch: { final_step: String(step ?? "") },
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[sessionTracking] final step update failed:", e);
  }
}

// Nie zamyka sesji — błąd może być błahy, a gra i tak dokończyć się
// normalnie. Zbieramy wszystkie błędy z sesji (do limitu), żeby admin
// mógł ocenić powagę po treści i liczbie, a nie po sztucznej etykiecie.
export async function sessionLogError(message) {
  if (!currentSessionId) return;
  errors.push({ message: String(message ?? ""), at: new Date().toISOString() });
  if (errors.length > MAX_TRACKED_ERRORS) errors = errors.slice(-MAX_TRACKED_ERRORS);
  try {
    const { error } = await sb().rpc("game_session_update", {
      p_session_id: currentSessionId,
      p_status: null,
      p_rounds_played: null,
      p_client_meta_patch: { errors, error_count: errors.length },
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[sessionTracking] error log failed:", e);
  }
}

export async function sessionEnd(status, { errorMessage = null, winnerTeam = null, teamAScore = null, teamBScore = null, roundsScoreA = null, roundsScoreB = null, finalPoints = null } = {}) {
  stopHeartbeat();
  if (!currentSessionId) return;
  const id = currentSessionId;
  currentSessionId = null;
  try {
    const { error } = await sb().rpc("game_session_end", {
      p_session_id: id,
      p_status: status,
      p_error_message: errorMessage,
      p_winner_team: winnerTeam,
      p_team_a_score: teamAScore,
      p_team_b_score: teamBScore,
      p_rounds_score_a: roundsScoreA,
      p_rounds_score_b: roundsScoreB,
      p_final_points: finalPoints,
    });
    if (error) throw error;
  } catch (e) {
    console.warn("[sessionTracking] end failed:", e);
  }
}
