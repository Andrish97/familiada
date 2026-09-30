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
// Zgloszone na zywo: "dzwiek konca rundy gra i przed i po odslanianiu, a
// przycisk >rozpocznij runde< moze przerwac odtwarzanie" i "dzwiek konca
// rundy i dzwiek rozpoczecia finalu sie nakladaja, przyciski nie sa
// blokowane poprawnie" -- poprzednia wersja blokowala TYLKO "reveal",
// zostawiajac "round_transition" (ktory gra PO nim, sekwencyjnie) grac
// nad juz odblokowanym, klikalnym ekranem: operator mogl zdazyc kliknac
// kolejna duza akcje (Rozpocznij runde/Rozpocznij final), ktora wywoluje
// TEN SAM cache'owany <audio> dla "round_transition" (js/core/sfx.js's
// playSfx()) i restartuje go w polowie -- slyszalne jako uciecie. Poprawka:
// blokada END_ROUND obejmuje CALA sekwencje reveal+round_transition (suma
// sekwencyjna, nie tylko pierwszy czlon) -- nic juz nie moze wystartowac,
// zanim oba dzwieki sie nie skoncza. NEXT_AFTER_REVEAL nie gra juz
// zadnego dzwieku wcale (patrz engine.js) -- nie ma go w SPECIAL, domyslna
// sciezka (sound_cue_seq sie nie zmienia) poprawnie daje 0.
//
// Pozostale miejsca nakladajace DWA dzwieki na jedna zmiane (shared/
// soundCueEngine.js, sprawdzone 1:1 w kodzie):
//   - START_ROUND, NEXT_QUESTION->f_p2_start i START_P2_ROUND
//     (F7->F8, "Start rundy 2"): "round_transition"+"reveal" ZSYNCHRONIZOWANE
//     na koniec -- blokujacy czas to max(obu). Zgloszone wprost dla F7->F8:
//     "dzwiek przejscia rundy plus odslonięcie" -- to DOSLOWNIE przejscie do
//     kolejnej rundy finalu, ta sama kombinacja co pozostale dwa.
//   - START_FINAL: "final_theme" najpierw, POTEM "reveal" -- oba teraz
//     policzone RAZEM (suma sekwencyjna), z tego samego powodu co
//     END_ROUND wyzej (zgloszone: nakladanie sie na START_ROUND kolejnej
//     akcji).
//   - FINISH_FINAL: synced("round_transition","reveal"), a PO CALEJ tej
//     parze dodatkowo "show_intro" -- jedyne miejsce, gdzie kolejny czlon
//     TEZ sie liczy do blokady (to juz ekran koncowy, nic po nim).
// Kazda inna akcja: gate to czas trwania tego, co faktycznie zagralo w TYM
// konkretnym zapisie (wykryte przez zmiane sound_cue_seq).

import { createTransitionTiming } from "../../shared/transitionTiming.js?v=v2026-09-30T21413";

export function createActionGate({ getSfxDuration }) {
  const timing = createTransitionTiming({ getSfxDuration });

  // R6-R7: blokujący czas to CAŁA sekwencja "reveal" -> "round_transition"
  // (suma obu, nie tylko pierwszy człon — patrz nagłówek pliku). NEXT_AFTER_
  // REVEAL (R8->R9) nie gra już żadnego dźwięku (engine.js) — celowo BRAK w
  // tej tabeli, spada do domyślnej ścieżki (sound_cue_seq się nie zmienia
  // -> 0). START_FINAL analogicznie: "final_theme" -> "reveal" liczone
  // razem, z tego samego powodu (operator mógłby zdążyć kliknąć dalej,
  // zanim "reveal" nad ekranem wpisywania się skończy, i przerwać go kolejną
  // akcją współdzielącą ten sam klucz).
  async function sequentialMs(keyA, keyB) {
    return (await timing.dur(keyA)) + (await timing.dur(keyB));
  }
  const SPECIAL = {
    START_ROUND: () => timing.syncedMs("round_transition", "reveal"),
    NEXT_QUESTION: async (prevRow, nextRow) =>
      nextRow?.step === "f_p2_start" ? timing.syncedMs("round_transition", "reveal") : 0,
    START_P2_ROUND: () => timing.syncedMs("round_transition", "reveal"),
    END_ROUND: () => sequentialMs("reveal", "round_transition"),
    START_FINAL: () => sequentialMs("final_theme", "reveal"),
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
