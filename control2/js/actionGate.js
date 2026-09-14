// control2/js/actionGate.js
//
// JEDEN silnik blokady operatora względem dźwięku/animacji — zastępuje
// dawny zestaw ręcznie wywoływanych armRevealCooldown()/armBoardTransition()
// rozsianych po control2/js/ui.js (zgłoszone: "blokowanie akcji względem
// dźwięku animacji... wszędzie" — kilka konkretnych miejsc, np. ADD_X czy
// ACCEPT_BUZZ, zostało znalezionych i załatanych pojedynczo w tej sesji, co
// dowiodło, że ręczne pamiętanie o wywołaniu odpowiedniej blokady przy
// KAŻDYM nowym onclick w ui.js jest z natury zawodne — łatwo o kolejny,
// jeszcze nieznaleziony przypadek).
//
// Nowe podejście: control2/js/app.js's handle("game.dispatch") jest JEDYNYM
// miejscem w całej appce, które w ogóle woła engine.dispatch() — więc
// blokada żyje TAM, raz, automatycznie dla KAŻDEJ akcji (patrz app.js),
// zamiast wymagać pamiętania osobno przy każdym przycisku. Kafle w ui.js
// tylko CZYTAJĄ wynik (przekazany przez ctx.busy w render()) — nie
// zarządzają już żadnym własnym zegarkiem.
//
// Gate = max(czas dźwięku, czas animacji Wyświetlacza) — zgłoszone wprost:
// "prosiłem liczyć max (czas trwania dźwięku, czas animacji)". Wcześniejsza
// wersja liczyła WYŁĄCZNIE z dźwięku (z jednym "na oko" ustawionym floorem
// 2s dla kombinacji dwóch dźwięków) — porównanie 1:1 z display2/js/render.js
// wykazało realne dziury: START_ROUND niedoszacowany o 500ms (prawdziwa
// animacja planszy to 2500ms, nie 2000ms), END_ROUND/NEXT_AFTER_REVEAL do
// r_gameEnd/f_start w ogóle nie liczył animOut/animIn (do 2500ms luki), a
// START_P2_ROUND (F7->F8) nie miał ŻADNEJ blokady mimo 1500ms animacji
// odsłaniania planszy — ta akcja nie ustawia żadnego soundCueKey, więc
// dawny "gate z dźwięku" był tam zawsze zerem. Czasy animacji importowane z
// shared/displayAnim.js — DOKŁADNIE te same stałe, których używa
// display2/js/render.js do faktycznego rysowania — żeby to było jedno
// źródło prawdy, nie dwie osobno utrzymywane liczby, które mogą się
// rozjechać przy przyszłej zmianie animacji.
//
// Dźwięk: cztery miejsca nakładają DWA dźwięki na jedną zmianę zamiast
// jednego bare cue (shared/soundCueEngine.js, sprawdzone 1:1 w kodzie):
//   - START_ROUND i NEXT_QUESTION->f_p2_start: "round_transition"+"reveal"
//     ZSYNCHRONIZOWANE na koniec (oba kończą się razem) — blokujący czas to
//     max(obu).
//   - END_ROUND/NEXT_AFTER_REVEAL: "reveal" najpierw (blokujący), POTEM
//     "round_transition" (już nad nowym, interaktywnym ekranem —
//     nieblokujący).
//   - START_FINAL: "final_theme" najpierw (blokujący), POTEM "reveal"
//     (nieblokujący, gra nad ekranem wpisywania).
//   - FINISH_FINAL: synced("round_transition","reveal"), a PO CAŁEJ tej
//     parze dodatkowo "show_intro" — jedyne miejsce, gdzie kolejny człon
//     TEŻ się liczy do blokady (to już ekran końcowy, nic po nim, więc nie
//     ma czego traktować jako "nieblokujące tło").
// Każda inna akcja: gate to czas trwania tego, co faktycznie zagrało w TYM
// konkretnym zapisie (wykryte przez zmianę sound_cue_seq — bez tego dwie
// różne akcje z rzędu, z których druga nic nie odtwarza, np. samo
// wpisywanie tekstu w finale, błędnie dziedziczyłyby zablokowanie po
// STARYM, nieaktualnym już sound_cue_key sprzed kilku zapisów), zestawiony
// z max() z ANSWER_ANIM (500ms) — najmniejszej animacji w całej appce,
// towarzyszącej każdemu odsłonięciu odpowiedzi/punktów.

import {
  ROUND_INTRO_ANIM,
  ROUND_OUT_ANIM,
  ANSWER_ANIM,
  FINAL_BOARD_ANIM,
  FINAL_OUT_ANIM,
  LOGO_IN_ANIM,
  LOGO_OUT_ANIM,
} from "../../shared/displayAnim.js?v=v2026-09-14T14581";

const FALLBACK_S = 2; // metadane audio (jeszcze) niedostępne — bezpieczny domysł

// display2/js/render.js's paintRoundsBoard(): animOut (1000ms, logo lub stara
// plansza — obie wartości równe) sekwencyjnie PRZED animIn (1500ms, nowa
// plansza) — `await` w obu miejscach, nigdy równolegle.
const START_ROUND_ANIM_MS = Math.max(LOGO_OUT_ANIM.ms, ROUND_OUT_ANIM.ms) + ROUND_INTRO_ANIM.ms;
// display2/js/render.js's showEndScreen() dla top_card "final": animOut
// planszy finału (1000ms) sekwencyjnie PRZED animIn logo/WIN (1000ms).
const FINAL_END_SCREEN_ANIM_MS = ROUND_OUT_ANIM.ms + LOGO_IN_ANIM.ms;

export function createActionGate({ getSfxDuration }) {
  async function dur(key) {
    if (!key) return 0;
    try {
      const d = await getSfxDuration(key);
      return d > 0 ? d * 1000 : FALLBACK_S * 1000;
    } catch {
      return FALLBACK_S * 1000;
    }
  }

  // Synced combo: oba dźwięki kończą się razem, blokujący czas = dłuższy z
  // dwóch (control/js/gameRounds.js's startRound(): identyczna reguła).
  async function syncedSoundMs() {
    const [rt, rv] = await Promise.all([dur("round_transition"), dur("reveal")]);
    return Math.max(rt, rv);
  }

  const SPECIAL = {
    // R1->R2: animIn/animOut planszy rund (2500ms — patrz komentarz przy
    // START_ROUND_ANIM_MS) razem z synced round_transition+reveal.
    START_ROUND: async () => Math.max(await syncedSoundMs(), START_ROUND_ANIM_MS),
    // F7: ta sama synced kombinacja dźwięku co START_ROUND, ale INNA
    // animacja — tylko animOut maski odpowiedzi gracza 1 (FINAL_OUT_ANIM,
    // 1000ms), bez animIn (ten leci dopiero przy START_P2_ROUND niżej).
    // Zwykłe "kolejne pytanie w bloku" (nextRow.step != f_p2_start): 0,
    // ani dźwięku, ani animacji.
    NEXT_QUESTION: async (prevRow, nextRow) =>
      nextRow?.step === "f_p2_start" ? Math.max(await syncedSoundMs(), FINAL_OUT_ANIM.ms) : 0,
    // R6-R7/R8-R9: "reveal" gra najpierw, operator dostaje z powrotem
    // kontrolę gdy TYLKO "reveal" dograło — "round_transition" leci POTEM,
    // już nad nowym, już interaktywnym ekranem (nieblokujący, patrz nagłówek
    // pliku). Animacja zależy od TEGO, dokąd faktycznie prowadzi ta
    // konkretna runda (r.roundEndDestination z engine.js's finalizeRound()):
    //   - r_roundStart (kolejna runda): plansza zostaje bez zmian, animOut
    //     dopiero przy następnym START_ROUND — 0ms tutaj.
    //   - r_gameEnd (koniec gry bez finału): animOut planszy rund od razu
    //     (ROUND_OUT_ANIM, 1000ms).
    //   - f_start (próg finału osiągnięty): animOut + animIn planszy finału,
    //     sekwencyjnie (ROUND_OUT_ANIM + FINAL_BOARD_ANIM, 2500ms).
    END_ROUND: async (prevRow, nextRow) => roundEndGate(nextRow),
    NEXT_AFTER_REVEAL: async (prevRow, nextRow) => roundEndGate(nextRow),
    // F0 (f_start -> f_p1_entry): "final_theme" najpierw (blokujący),
    // "reveal" (drugi człon kombinacji) leci POTEM, już nad ekranem
    // wpisywania. Plansza finału jest namalowana WCZEŚNIEJ (przy wejściu w
    // f_start, patrz END_ROUND/NEXT_AFTER_REVEAL wyżej) — ten konkretny
    // krok (f_start->f_p1_entry) sam nie rusza dużego płótna, więc 0ms
    // animacji tutaj.
    START_FINAL: async () => dur("final_theme"),
    // F7->F8: JEDYNA akcja w całej appce, gdzie operator dostaje blokadę
    // WYŁĄCZNIE z powodu animacji — engine.js's START_P2_ROUND nie ustawia
    // żadnego soundCueKey (Host odsłania się w ciszy, bez dźwięku), ale
    // Display w tym samym momencie odtwarza pełne animIn (FINAL_BOARD_ANIM,
    // 1500ms) odsłaniające z powrotem odpowiedzi gracza 1. Dawny gate
    // (liczony wyłącznie z dźwięku) był tu zawsze zerem — operator mógł
    // klikać dalej W TRAKCIE tej animacji.
    START_P2_ROUND: async () => FINAL_BOARD_ANIM.ms,
    // R10 ("Pokaż koniec gry"): dźwięk "show_intro" + animIn logo/WIN
    // (LOGO_IN_ANIM, 1000ms) — animOut planszy rund już się wydarzył
    // wcześniej, przy samym końcu rundy (patrz roundEndGate niżej), więc tu
    // liczy się tylko animIn.
    GAME_END_SHOW: async () => Math.max(await dur("show_intro"), LOGO_IN_ANIM.ms),
    // F14: synced(round_transition,reveal) + PO CAŁOŚCI tej pary
    // sekwencyjnie "show_intro" — jedyne miejsce, gdzie kolejny człon TEŻ
    // się liczy do blokady (to już ekran końcowy). Animacja: animOut+animIn
    // ekranu końcowego finału (FINAL_END_SCREEN_ANIM_MS, 2000ms),
    // zestawione max()-em z synced częścią dźwięku, a DOPIERO PO tym doliczony
    // show_intro w całości.
    FINISH_FINAL: async () => Math.max(await syncedSoundMs(), FINAL_END_SCREEN_ANIM_MS) + (await dur("show_intro")),
  };

  function roundEndGate(nextRow) {
    const revealMs = dur("reveal");
    const animMs =
      nextRow?.step === "f_start" ? ROUND_OUT_ANIM.ms + FINAL_BOARD_ANIM.ms
      : nextRow?.step === "r_gameEnd" ? ROUND_OUT_ANIM.ms
      : 0; // r_roundStart (kolejna runda) — plansza zostaje, bez animacji tutaj
    return revealMs.then((ms) => Math.max(ms, animMs));
  }

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
    // Każde odsłonięcie (odpowiedź/punkty rund lub finału) niesie ANSWER_ANIM
    // (500ms) na Display — najmniejsza animacja w appce, ale wciąż realna;
    // max() z nią gwarantuje, że gate nigdy nie jest krótszy niż to, co
    // faktycznie widać, nawet gdyby jakiś wariant dźwięku był krótszy niż
    // 500ms.
    return Math.max(await dur(nextRow.sound_cue_key), ANSWER_ANIM.ms);
  }

  return { computeGateMs };
}
