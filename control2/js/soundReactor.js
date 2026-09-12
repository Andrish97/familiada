// control2/js/soundReactor.js
// Dźwięk zostaje częścią Control (plan, decyzja z negocjacji), ale
// "sterowany stanem" zamiast wywoływany wprost z logiki gry (silnik/engine.js
// nigdy nie woła playSfx() bezpośrednio — tylko zapisuje sound_cue_key do
// wiersza, dokładnie jak każdą inną zmianę stanu).
//
// Subskrybuje WŁASNY, świeży stan Control (store.subscribe), nie odczyt z
// bazy — zero opóźnienia względem tego, co operator właśnie zrobił. Reguły
// "który SOUND_CUE gra jaką kombinację" żyją teraz w shared/soundCueEngine.js
// (reużyte też przez display2/js/soundReactor.js — zgłoszone: dźwięk ma móc
// grać z Wyświetlacza zamiast Control).
//
// Źródło dźwięku (`settings.soundSource`, "control"/"display") i wyciszenie
// (`settings.soundMuted`) są teraz częścią WSPÓLNEGO game_state, nie
// lokalnego localStorage jak wcześniej — mute musi działać niezależnie od
// tego, które urządzenie faktycznie odtwarza (zgłoszone), więc nie może
// żyć tylko w tej karcie. Ten reaktor gra WYŁĄCZNIE gdy soundSource==="control"
// (domyślnie) — gdy operator przełączy na "display", ten sam mechanizm w
// display2/js/soundReactor.js przejmuje odtwarzanie, a ten tutaj po prostu
// nic nie robi (zero podwójnego odtwarzania).

import { playSfx, getSfxDuration } from "../../js/core/sfx.js?v=v2026-09-12T20092";
import { createSoundCueEngine } from "../../shared/soundCueEngine.js?v=v2026-09-12T20092";

export function createSoundReactor(store) {
  const engine = createSoundCueEngine({ playSfx, getSfxDuration });
  let prevRow = null;

  function onStateChange(state) {
    const nextRow = state.__row;
    if (!nextRow) return;
    // Pierwsze wywołanie po hydrate()/pierwszym commit() — brak
    // poprzedniego wiersza daje tylko SNAPSHOT_RENDER (patrz deriveEvents),
    // co tu jednoznacznie oznacza "nic nie graj" (nie chcemy dźwięku samego
    // wznowienia/odczytu, tylko realnych zmian).
    if (prevRow) {
      const settings = state.settings || {};
      const isControlSource = (settings.soundSource || "control") === "control";
      if (isControlSource && !settings.soundMuted) {
        engine.handleTransition(prevRow, nextRow);
      }
    }
    prevRow = nextRow;
  }

  const unsubscribe = store.subscribe(onStateChange);
  // Stan mógł już być załadowany (hydrate()) zanim ten reaktor powstał —
  // złap go od razu, żeby prevRow nie zostało puste do pierwszej zmiany.
  if (store.state.__row) prevRow = store.state.__row;

  return { destroy: unsubscribe };
}
