// control2/js/persist.js
// Cienka warstwa nad RPC public.game_state_write / game_state_undo
// (supabase/migrations/2026-09-03_260_game_state_rpcs.sql). Jedyne miejsce
// w control2, które zna nazwy RPC i kształt ich argumentów — store.js woła
// tylko write()/undo(), nie buduje samodzielnie zapytań do Supabase.
//
// Zasada z planu, sekcja 4: żaden zapis nie jest "cichy" — sukces zwraca
// pełny nowy wiersz, błąd zawsze rzuca (z rozróżnieniem stale_write, żeby
// UI mogło pokazać "gra sterowana z innej zakładki" zamiast zgadywać).

import { sb } from "../../js/core/supabase.js";

export class StaleWriteError extends Error {
  constructor() {
    super("stale_write");
    this.name = "StaleWriteError";
  }
}

export function createPersist(gameId) {
  async function write({ step, topCard, phase, controlTeam, detail, soundCueKey, expectedRev }) {
    const { data, error } = await sb().rpc("game_state_write", {
      p_game_id: gameId,
      p_step: step,
      p_top_card: topCard,
      p_phase: phase ?? null,
      p_control_team: controlTeam ?? null,
      p_detail: detail ?? null,
      p_sound_cue_key: soundCueKey ?? null,
      p_expected_rev: expectedRev ?? null,
    });
    if (error) {
      if (String(error.message || "").includes("stale_write")) {
        throw new StaleWriteError();
      }
      throw error;
    }
    return data;
  }

  async function undo() {
    const { data, error } = await sb().rpc("game_state_undo", { p_game_id: gameId });
    if (error) throw error;
    return data;
  }

  return { write, undo };
}
