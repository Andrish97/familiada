// control2/js/store.js
// Ten sam kształt co dzisiejszy control/js/store.js (state + emit()/
// subscribe()), ale hydrate() NAPRAWDĘ wznawia stan z public.game_state
// zamiast bezwarunkowo go kasować (control/js/store.js:338-343 — "Stan gry
// nie jest przywracany między sesjami"). To jest dokładnie ta luka, którą
// cała przebudowa ma zamknąć.
//
// Obecność urządzeń (kto jest online) celowo NIE wchodzi do tego stanu —
// zostaje w public.device_presence (osobny, częsty polling), reużyty bez
// zmian przez control2/js/presence.js. Ten store trzyma wyłącznie to, co
// jest decyzją/faktem o samej grze (plan, sekcja 2 "0.").
//
// gameRounds.js/gameFinal.js NIE importują tego pliku — dostają store przez
// wstrzyknięcie zależności (ten sam wzorzec co dzisiejsze createRounds/
// createFinal), więc dają się testować w gołym Node z atrapą store.

import { sb } from "../../js/core/supabase.js?v=v2026-09-04T18491";
import { createPersist, StaleWriteError } from "./persist.js?v=v2026-09-04T18491";
import { makeDefaultState, DEFAULT_SETTINGS, PERSISTED_KEYS } from "../../shared/gameStateShape.js?v=v2026-09-04T18491";

export { StaleWriteError, makeDefaultState, DEFAULT_SETTINGS };

function buildDetail(state) {
  const detail = {};
  for (const key of PERSISTED_KEYS) detail[key] = state[key];
  return detail;
}

export function createStore(gameId) {
  const listeners = new Set();
  const state = makeDefaultState(gameId);
  const persist = createPersist(gameId);

  function emit() {
    for (const fn of listeners) fn(state);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function applyRow(row) {
    if (!row) return;
    state.rev = row.rev ?? 0;
    state.topCard = row.top_card;
    state.step = row.step;
    state.phase = row.phase ?? null;
    state.controlTeam = row.control_team ?? null;
    state.soundCueKey = row.sound_cue_key ?? null;
    state.soundCueSeq = row.sound_cue_seq ?? 0;

    const d = row.detail || {};
    for (const key of PERSISTED_KEYS) {
      if (d[key] !== undefined) state[key] = d[key];
    }
  }

  // ---- prawdziwe wznowienie ----
  async function hydrate() {
    const { data, error } = await sb()
      .from("game_state")
      .select("*")
      .eq("game_id", gameId)
      .maybeSingle();
    if (error) {
      console.warn("[store] hydrate: nie udało się odczytać game_state", error);
      return null;
    }
    if (!data) return null; // nowa gra, Control jeszcze nigdy nic nie zapisał
    applyRow(data);
    emit();
    return expiredTimerOnHydrate(state);
  }

  // Zwraca opis wygasłego (w trakcie nieobecności Control) timera finału, do
  // natychmiastowej obsługi przez gameFinal.js — patrz plan, sekcja 4
  // ("dogonienie" wygasłego timera przy hydrate(), zanim cokolwiek się
  // wyrenderuje operatorowi).
  function expiredTimerOnHydrate(s) {
    const t = s.final?.runtime?.timer;
    if (t?.running && typeof t.endsAt === "number" && t.endsAt <= Date.now()) {
      return { phase: t.phase, endsAt: t.endsAt };
    }
    return null;
  }

  // ---- zapis: pełny wiersz, synchronicznie potwierdzony (plan, sekcja 4) ----
  async function commit({ soundCueKey } = {}) {
    const row = await persist.write({
      step: state.step,
      topCard: state.topCard,
      phase: state.phase,
      controlTeam: state.controlTeam,
      soundCueKey: soundCueKey ?? null,
      expectedRev: state.rev,
      detail: buildDetail(state),
    });
    applyRow(row);
    emit();
    return row;
  }

  async function undo() {
    const row = await persist.undo();
    applyRow(row);
    emit();
    return row;
  }

  return { state, subscribe, emit, hydrate, commit, undo, applyRow };
}
