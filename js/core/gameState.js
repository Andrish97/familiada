// js/core/gameState.js
// Jedno źródło prawdy: tabela game_state (1 wiersz na grę)
// - odczyt: wszyscy
// - zapis: tylko operator (RLS zrobimy później, na razie rozwijamy funkcjonalność)

import { getSupabase } from "./supabase.js";

function nowIso() {
  return new Date().toISOString();
}

export const DEFAULT_STATE = {
  phase: "idle", // idle | round | final | ended
  roundNo: 1,
  multiplier: 1,

  teams: {
    A: { name: "DRUŻYNA A", score: 0 },
    B: { name: "DRUŻYNA B", score: 0 },
  },

  currentQuestionId: null,
  revealedAnswerIds: [],

  strikes: 0,
  roundSum: 0,

  buzzer: {
    enabled: false,
    winner: null, // "A" | "B" | null
  },

  // setup wymagany przed startem sterowania
  setup: {
    hostOpened: false,
    buzzerOpened: false,
  },

  // timer orientacyjny (rundy) i właściwy (finał)
  timer: {
    kind: "none", // none | soft | final
    secondsLeft: 0,
    running: false,
    updatedAt: null,
  },

  // debug / synchronizacja
  updatedAt: null,
};

export async function loadState(gameId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("game_state")
    .select("state")
    .eq("game_id", gameId)
    .single();

  if (error) throw error;
  return data?.state || null;
}

export async function ensureState(gameId) {
  const sb = getSupabase();

  // spróbuj pobrać
  const { data, error } = await sb
    .from("game_state")
    .select("game_id,state")
    .eq("game_id", gameId)
    .maybeSingle();

  if (!error && data?.state) return data.state;

  // jeśli nie ma – utwórz
  const initial = { ...DEFAULT_STATE, updatedAt: nowIso() };
  const ins = await sb.from("game_state").insert({
    game_id: gameId,
    state: initial,
  });

  if (ins.error) throw ins.error;
  return initial;
}

export async function updateState(gameId, patch) {
  // patch może być obiektem częściowym, który scalimy płytko
  // UWAGA: to jest uproszczone; później damy głębsze merge’y gdzie trzeba
  const sb = getSupabase();
  const current = await loadState(gameId);
  const next = {
    ...(current || DEFAULT_STATE),
    ...(patch || {}),
    updatedAt: nowIso(),
  };

  const { error } = await sb
    .from("game_state")
    .update({ state: next })
    .eq("game_id", gameId);

  if (error) throw error;
  return next;
}

export function subscribeState(gameId, onChange) {
  const sb = getSupabase();

  const channel = sb
    .channel(`game_state:${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_state", filter: `game_id=eq.${gameId}` },
      (payload) => {
        const newRow = payload?.new;
        const state = newRow?.state || null;
        try {
          onChange(state, payload);
        } catch (e) {
          console.error("[subscribeState] onChange error:", e);
        }
      }
    )
    .subscribe();

  return () => {
    try {
      sb.removeChannel(channel);
    } catch (e) {
      console.warn("[subscribeState] removeChannel error:", e);
    }
  };
}
