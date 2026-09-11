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

import { sb } from "../../js/core/supabase.js?v=v2026-09-11T18130";
import { ringDoorbell } from "../../js/core/game-state-doorbell.js?v=v2026-09-11T18130";
import { createPersist, StaleWriteError } from "./persist.js?v=v2026-09-11T18130";
import { makeDefaultState, DEFAULT_SETTINGS, PERSISTED_KEYS } from "../../shared/gameStateShape.js?v=v2026-09-11T18130";
import { expiredTimerOnHydrate } from "./timerResume.js?v=v2026-09-11T18130";

// Kanał broadcastowy "dzwonek" (plan, sekcja 1 — decyzja końcowa: anon nie
// ma bezpośredniego dostępu do odczytu game_state wcale, więc postgres_changes
// nigdy nie zadziała dla Display/Host/Buzzer, i to jest świadome, nie
// fallback). Niesie WYŁĄCZNIE {rev} — nieautorytatywne, samo w sobie nic nie
// znaczy poza "coś się zmieniło, dogoń przez game_state_get". Nazwa kanału +
// wysyłka wydzielone do js/core/game-state-doorbell.js, bo dzwonić musi
// KAŻDY zapis do game_state, nie tylko te stąd — patrz buzzer2/js/main.js
// (game_state_buzzer_press idzie z pominięciem tego store).

export { StaleWriteError, makeDefaultState, DEFAULT_SETTINGS };

function buildDetail(state) {
  const detail = {};
  for (const key of PERSISTED_KEYS) detail[key] = state[key];
  return detail;
}

export { expiredTimerOnHydrate };

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
    // Surowy wiersz z bazy (rev/step/phase/... w snake_case), obok stanu
    // camelCase powyżej — soundReactor.js diffuje TO pole przez
    // shared/deriveEvents.js (które oczekuje kształtu wiersza game_state,
    // nie zrzutowanego camelCase stanu). Prywatne, nie część PERSISTED_KEYS.
    state.__row = row;
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

  // ---- zapis: pełny wiersz, synchronicznie potwierdzony (plan, sekcja 4) ----
  async function commit({ soundCueKey } = {}) {
    // Zamrożone TERAZ, przed jakimkolwiek hydrate() — to jest zamierzona
    // zmiana operatora, niezależna od tego, co hydrate() potem nadpisze w
    // state (patrz retry niżej).
    const payload = {
      step: state.step,
      topCard: state.topCard,
      phase: state.phase,
      controlTeam: state.controlTeam,
      soundCueKey: soundCueKey ?? null,
      detail: buildDetail(state),
    };

    async function attempt() {
      const row = await persist.write({ ...payload, expectedRev: state.rev });
      applyRow(row);
      emit();
      ringDoorbell(gameId, row.rev);
      return row;
    }

    try {
      return await attempt();
    } catch (e) {
      if (!(e instanceof StaleWriteError)) throw e;
      // Warstwa 2 (docs/plan-testy-i-poprawki.md) zrobiła dokładnie to, co
      // powinna — ktoś inny zdążył podbić rev pierwszy, zanim nasz zapis
      // dotarł. Odkąd control2/js/engine.js's dispatch() serializuje własne
      // wywołania, jedyny realny "ktoś inny" to Buzzer
      // (game_state_buzzer_press, zapis z pominięciem tego store'a — patrz
      // plan, sekcja 1/4). Zamiast twardego błędu operatorowi: doczytaj
      // świeży wiersz (hydrate aktualizuje state.rev, w tym wszystko inne co
      // się zmieniło) i spróbuj RAZ jeszcze DOKŁADNIE tę samą, zamierzoną
      // zmianę z nowym rev — dokładnie ten "bezpieczny retry" z planu,
      // wcześniej opisany ale nigdy nie zaimplementowany.
      await hydrate();
      return await attempt();
    }
  }

  return { state, subscribe, emit, hydrate, commit, applyRow };
}
