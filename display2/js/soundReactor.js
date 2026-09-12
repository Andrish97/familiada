// display2/js/soundReactor.js
// Odpowiednik control2/js/soundReactor.js, ale czytający WYŁĄCZNIE
// odczytany z bazy wiersz game_state (nie lokalny, świeży stan Control) —
// zgłoszone: dźwięk ma móc grać z Wyświetlacza zamiast Control, sterowany
// stanem z bazy, nie sekwencją wywołań jednego konkretnego urządzenia.
// Reguły "który SOUND_CUE gra jaką kombinację" żyją we wspólnym
// shared/soundCueEngine.js, reużytym 1:1 przez oba reaktory.
//
// Gated na `detail.settings.soundSource==="display"` — gdy operator zostawi
// domyślne "control", ten reaktor po prostu nic nie robi (zero podwójnego
// odtwarzania z dwóch urządzeń naraz).

import { playSfx, getSfxDuration } from "../../js/core/sfx.js?v=v2026-09-12T19345";
import { createSoundCueEngine } from "../../shared/soundCueEngine.js?v=v2026-09-12T19345";

export function createDisplaySoundReactor() {
  const engine = createSoundCueEngine({ playSfx, getSfxDuration });
  let prevRow = null;

  function onRow(row) {
    if (!row) return;
    if (prevRow) {
      const settings = row.detail?.settings || {};
      const isDisplaySource = settings.soundSource === "display";
      if (isDisplaySource && !settings.soundMuted) {
        engine.handleTransition(prevRow, row);
      }
    }
    prevRow = row;
  }

  return { onRow };
}
