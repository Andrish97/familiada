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
// Pięć miejsc w control/js/gameRounds.js i gameFinal.js nakłada DWA
// dźwięki na jedną zmianę zamiast jednego bare cue — sprawdzone linia po
// linii, żeby nie zgadywać (patrz oryginalny komentarz w
// control2/js/soundReactor.js, historia niezmieniona):
//   - R1->R2 (startRound), F7-wejście (toP2Start, NEXT_QUESTION -> f_p2_start)
//     i F7->F8 (START_P2_ROUND, "Start rundy 2"): "round_transition"+"reveal"
//     ZSYNCHRONIZOWANE na koniec — to samo "przejście rundy + odsłonięcie",
//     zgłoszone wprost dla F7->F8 (wcześniej ta akcja niesłusznie grała samo
//     "reveal", bez "round_transition").
//   - R6-R7 (goEndRound): "reveal" najpierw, "round_transition" po nim.
//   - F0 (startFinal): "final_theme" najpierw, "reveal" po nim.
//   - Koniec rundy finału: scoring, potem round_transition (lub samo
//     round_transition po ostatnim Dalej). FINISH_FINAL gra później
//     show_intro+reveal zsynchronizowane na koniec, bez powtarzania fanfary.

import { deriveEvents } from "./deriveEvents.js?v=v2026-10-04T15084";

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
    return playSyncedCombo("show_intro", "reveal");
  }

  // Wołane raz na KAŻDĄ zmianę wiersza (prevRow -> nextRow). `prevRow===null`
  // (pierwszy wiersz po (re)connect) celowo nic nie odtwarza — patrz
  // deriveEvents.js's SNAPSHOT_RENDER.
  function handleTransition(prevRow, nextRow) {
    if (!prevRow || !nextRow) return;
    const events = deriveEvents(prevRow, nextRow);
    // The device RPC records the winning press before operator acceptance.
    // Use that confirmed change, so the losing simultaneous press stays silent.
    const pressed = nextRow.detail?.rounds?.duel?.lastPressed;
    if (nextRow.step === "r_duel" && pressed && !prevRow.detail?.rounds?.duel?.lastPressed && !nextRow.detail?.settings?.physicalBuzzer) {
      playSfx("buzzer_press");
    }
    const isRoundStart = nextRow.step === "r_duel" && nextRow.phase === "DUEL" && prevRow.step === "r_roundStart";
    // END_ROUND jest zawsze dispatchowany z step="r_play", phase PLAY lub
    // STEAL (rozstrzygnięta kradzież zostaje w fazie STEAL aż do końca
    // rundy) — to jedno miejsce, gdzie "round_transition" oznacza koniec
    // rundy. Drugie: NEXT_AFTER_REVEAL (engine.js), operator ręcznie
    // potwierdzający koniec R8 (odkrywanie reszty, phase REVEAL) — ten sam
    // "koniec rundy" fanfar ma zagrać niezależnie od tego, czy było coś do
    // odsłonięcia (END_ROUND, prevRow.phase PLAY/STEAL) czy nie (R8 ->
    // NEXT_AFTER_REVEAL, prevRow.phase REVEAL) — zgłoszone: przejście ma
    // wyglądać identycznie w obu przypadkach, nie tylko gdy nic nie było do
    // odsłonięcia.
    const isRoundEnd = prevRow.step === "r_play" && (prevRow.phase === "PLAY" || prevRow.phase === "STEAL" || prevRow.phase === "REVEAL");
    // F7-wejście: NEXT_QUESTION -> f_p2_start niesie ten sam klucz
    // "round_transition", ale to synced-combo jak start rundy, nie koniec.
    const isFinalP2Start = nextRow.step === "f_p2_start";
    // F7->F8: START_P2_ROUND ("Start rundy 2") — DOSŁOWNIE przejście do
    // kolejnej rundy finału, ta sama synced-combo co R1->R2/F7-wejście
    // (zgłoszone: "między F7 i F8 miał być dźwięk przejścia rundy plus
    // odsłonięcie" — nie samo "reveal").
    const isP2RoundReveal = prevRow.step === "f_p2_start" && nextRow.step === "f_p2_entry";
    for (const ev of events) {
      if (ev.kind !== "SOUND_CUE" || !ev.key) continue;
      if (nextRow.step === "f_end" && prevRow.step !== "f_end" && (ev.key === "answer_correct" || ev.key === "answer_wrong")) playSequentialCombo(ev.key, "round_transition");
      else if (ev.key === "round_transition" && (isRoundStart || isFinalP2Start || isP2RoundReveal)) playSyncedCombo("round_transition", "reveal");
      else if (ev.key === "round_transition" && isRoundEnd) playSequentialCombo("reveal", "round_transition");
      else if (ev.key === "show_intro" && ((prevRow.step === "r_intro" && nextRow.step === "r_roundStart") || (!prevRow.detail?.locks?.gameEnded && nextRow.detail?.locks?.gameEnded))) playSyncedCombo("show_intro", "reveal");
      else if (ev.key === "final_theme") playSequentialCombo("final_theme", "reveal");
      else if (ev.key === "final_end") playFinalEndCombo();
      else playSfx(ev.key);
    }
  }

  return { handleTransition };
}
