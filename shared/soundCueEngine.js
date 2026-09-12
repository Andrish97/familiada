// shared/soundCueEngine.js
// Reguły "który SOUND_CUE gra jaką kombinację" — wyciągnięte z
// control2/js/soundReactor.js, żeby to samo mogło reużyć display2/js/
// soundReactor.js (zgłoszone: dźwięk ma móc grać z Wyświetlacza zamiast
// Control, sterowany WYŁĄCZNIE odczytem stanu z bazy, nie sekwencją
// wywołań z jednego konkretnego urządzenia — patrz komentarz w
// control2/js/soundReactor.js). Reużywa też deriveEvents.js, więc jest
// zero importów przeglądarkowych POZA `playSfx`/`getSfxDuration`
// wstrzykiwanymi przez wywołującego — testowalne bez window/document,
// tak jak deriveEvents.js.
//
// Cztery miejsca w control/js/gameRounds.js i gameFinal.js nakładają DWA
// dźwięki na jedną zmianę zamiast jednego bare cue — sprawdzone linia po
// linii, żeby nie zgadywać (patrz oryginalny komentarz w
// control2/js/soundReactor.js, historia niezmieniona):
//   - R1->R2 (startRound) i F7 (toP2Start): "round_transition"+"reveal"
//     ZSYNCHRONIZOWANE na koniec.
//   - R6-R7 (goEndRound): "reveal" najpierw, "round_transition" po nim.
//   - F0 (startFinal): "final_theme" najpierw, "reveal" po nim.
//   - F14 (finishFinal): synced "round_transition"+"reveal", a PO całej
//     tej parze dodatkowo "show_intro".

import { deriveEvents } from "./deriveEvents.js?v=v2026-09-12T20092";

export function createSoundCueEngine({ playSfx, getSfxDuration }) {
  async function durationOf(key) {
    try { return (await getSfxDuration(key)) || 0; } catch { return 0; }
  }

  async function playSyncedCombo(keyA, keyB) {
    const [durA, durB] = await Promise.all([durationOf(keyA), durationOf(keyB)]);
    if (durA >= durB) {
      playSfx(keyA);
      setTimeout(() => playSfx(keyB), Math.max(0, (durA - durB) * 1000));
    } else {
      playSfx(keyB);
      setTimeout(() => playSfx(keyA), Math.max(0, (durB - durA) * 1000));
    }
    return Math.max(durA, durB);
  }

  async function playSequentialCombo(keyA, keyB) {
    playSfx(keyA);
    const durA = await durationOf(keyA);
    setTimeout(() => playSfx(keyB), Math.max(0, durA * 1000));
  }

  async function playFinalEndCombo() {
    const totalS = await playSyncedCombo("round_transition", "reveal");
    setTimeout(() => playSfx("show_intro"), Math.max(0, totalS * 1000));
  }

  // Wołane raz na KAŻDĄ zmianę wiersza (prevRow -> nextRow). `prevRow===null`
  // (pierwszy wiersz po (re)connect) celowo nic nie odtwarza — patrz
  // deriveEvents.js's SNAPSHOT_RENDER.
  function handleTransition(prevRow, nextRow) {
    if (!prevRow || !nextRow) return;
    const events = deriveEvents(prevRow, nextRow);
    const isRoundStart = nextRow.step === "r_duel" && nextRow.phase === "DUEL" && prevRow.step === "r_roundStart";
    // END_ROUND jest zawsze dispatchowany z step="r_play", phase PLAY lub
    // STEAL (rozstrzygnięta kradzież zostaje w fazie STEAL aż do końca
    // rundy) — to jedyne miejsce, gdzie "round_transition" oznacza koniec
    // rundy, nie jej start ani przejście do 2. rundy finału.
    const isRoundEnd = prevRow.step === "r_play" && (prevRow.phase === "PLAY" || prevRow.phase === "STEAL");
    // F7: NEXT_QUESTION -> f_p2_start niesie ten sam klucz "round_transition",
    // ale to synced-combo jak start rundy, nie koniec.
    const isFinalP2Start = nextRow.step === "f_p2_start";
    for (const ev of events) {
      if (ev.kind !== "SOUND_CUE" || !ev.key) continue;
      if (ev.key === "round_transition" && (isRoundStart || isFinalP2Start)) playSyncedCombo("round_transition", "reveal");
      else if (ev.key === "round_transition" && isRoundEnd) playSequentialCombo("reveal", "round_transition");
      else if (ev.key === "final_theme") playSequentialCombo("final_theme", "reveal");
      else if (ev.key === "final_end") playFinalEndCombo();
      else playSfx(ev.key);
    }
  }

  return { handleTransition };
}
