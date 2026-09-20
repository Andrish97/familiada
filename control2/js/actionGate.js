// control2/js/actionGate.js
//
// JEDEN silnik blokady operatora względem dźwięku/animacji — zastępuje
// dawny zestaw ręcznie wywoływanych armRevealCooldown()/armBoardTransition()
// rozsianych po control2/js/ui.js. Blokada żyje w control2/js/app.js's
// dispatchGated(), raz, automatycznie dla KAŻDEJ akcji — kafle w ui.js
// tylko CZYTAJĄ wynik (ctx.busy), nie zarządzają już żadnym własnym
// zegarkiem.
//
// Liczby TUTAJ i te, które faktycznie steruję animacją na Displayu
// (display2/js/render.js), pochodzą z JEDNEGO wspólnego miejsca —
// shared/transitionTiming.js — więc nie ma już mowy o osobno "na oko"
// dobranej liczbie dla animacji i osobnej dla dźwięku: to zawsze ten sam,
// raz policzony czas (zgłoszone wprost: "Pozbądźmy się sztywnych
// zapisanych ram czasowych... Animacja... zawsze = dźwięki"). Gate poniżej
// to więc dokładnie tyle, ile realnie trwa to, co Display w tym samym
// momencie maluje.
//
// Pięć miejsc nakłada DWA dźwięki na jedną zmianę (shared/
// soundCueEngine.js, sprawdzone 1:1 w kodzie):
//   - START_ROUND, NEXT_QUESTION->f_p2_start i START_P2_ROUND
//     (F7->F8, "Start rundy 2"): "round_transition"+"reveal" ZSYNCHRONIZOWANE
//     na koniec — blokujący czas to max(obu). Zgłoszone wprost dla F7->F8:
//     "dźwięk przejścia rundy plus odsłonięcie" — to DOSŁOWNIE przejście do
//     kolejnej rundy finału, ta sama kombinacja co pozostałe dwa.
//   - END_ROUND/NEXT_AFTER_REVEAL: "reveal" najpierw (blokujący), POTEM
//     "round_transition" (już nad nowym, interaktywnym ekranem —
//     nieblokujący).
//   - START_FINAL: "final_theme" najpierw (blokujący), POTEM "reveal"
//     (nieblokujący, gra nad ekranem wpisywania).
//   - FINISH_FINAL: synced("round_transition","reveal"), a PO CAŁEJ tej
//     parze dodatkowo "show_intro" — jedyne miejsce, gdzie kolejny człon
//     TEŻ się liczy do blokady (to już ekran końcowy, nic po nim).
// Każda inna akcja: gate to czas trwania tego, co faktycznie zagrało w TYM
// konkretnym zapisie (wykryte przez zmianę sound_cue_seq).

import { createTransitionTiming } from "../../shared/transitionTiming.js?v=v2026-09-20T07514";

export function createActionGate({ getSfxDuration }) {
  const timing = createTransitionTiming({ getSfxDuration });

  // R6-R7/R8-R9: blokujący czas to WYŁĄCZNIE "reveal" — "round_transition"
  // gra POTEM, już nad nowym, interaktywnym ekranem (patrz nagłówek pliku).
  // Ta sama liczba steruje animacją Displaya dla tej samej akcji (patrz
  // display2/js/render.js's STEP_CHANGE do r_gameEnd/f_start) — nie ma
  // więc potrzeby rozróżniać docelowy krok tutaj, w odróżnieniu od
  // wcześniejszej wersji, która dorzucała osobno dobrane "ile trwa
  // animacja" per-cel.
  const SPECIAL = {
    START_ROUND: () => timing.syncedMs("round_transition", "reveal"),
    NEXT_QUESTION: async (prevRow, nextRow) =>
      nextRow?.step === "f_p2_start" ? timing.syncedMs("round_transition", "reveal") : 0,
    START_P2_ROUND: () => timing.syncedMs("round_transition", "reveal"),
    END_ROUND: () => timing.dur("reveal"),
    NEXT_AFTER_REVEAL: () => timing.dur("reveal"),
    START_FINAL: () => timing.dur("final_theme"),
    FINISH_FINAL: async () => (await timing.syncedMs("round_transition", "reveal")) + (await timing.dur("show_intro")),
  };

  // actionType: action.type z payloadu dispatchu (control2/js/app.js's
  // handle("game.dispatch")). prevRow/nextRow: wiersz game_state PRZED i PO
  // (nextRow === wynik zwrócony przez engine.dispatch(), null przy
  // świadomym no-opie — wtedy 0, nic się nie zmieniło, nic do zablokowania).
  async function computeGateMs(actionType, prevRow, nextRow) {
    if (!nextRow) return 0;
    const special = SPECIAL[actionType];
    if (special) return special(prevRow, nextRow);
    const soundFired = !prevRow || nextRow.sound_cue_seq !== prevRow.sound_cue_seq;
    if (!soundFired) return 0;
    return timing.dur(nextRow.sound_cue_key);
  }

  // `timing` wystawione też wprost -- control2/js/app.js's advance() (proste
  // przejścia UI-nawigacyjne, z pominięciem dispatchGated/computeGateMs)
  // liczy nim własną blokadę z soundCueKey, którą samo dostaje jako
  // argument, zamiast tworzyć drugą, osobną instancję createTransitionTiming.
  return { computeGateMs, timing };
}
