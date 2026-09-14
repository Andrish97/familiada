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
// Czas blokady liczony z RZECZYWISTEGO, POTWIERDZONEGO sound_cue_key
// (wiersz zwrócony przez engine.dispatch() PO zapisie) — nie zgadywany z
// wyprzedzeniem jak w starym, ręcznym mechanizmie (który wymagał, żeby
// każdy onclick z góry znał dokładny klucz dźwięku dla swojej akcji).
//
// Pięć akcji (START_ROUND, END_ROUND/NEXT_AFTER_REVEAL, START_FINAL,
// FINISH_FINAL, oraz NEXT_QUESTION gdy kończy blok gracza 1 finału) ma
// własną formułę, bo sam potwierdzony sound_cue_key nie wystarcza — te same
// cztery miejsca, które shared/soundCueEngine.js opisuje jako nakładające
// DWA dźwięki na jedną zmianę zamiast jednego bare cue (ta sama logika,
// tylko licząca czas blokady zamiast realnie odtwarzać dźwięk — sprawdzone
// 1:1 przeciwko dawnemu control2/js/transitionGate.js, które to zastępuje).
// Każda inna akcja: gate to po prostu czas trwania tego, co faktycznie
// zagrało w TYM konkretnym zapisie (wykryte przez zmianę sound_cue_seq,
// dokładnie jak shared/deriveEvents.js's SOUND_CUE — bez tego dwie różne
// akcje z rzędu, z których druga nic nie odtwarza, np. samo wpisywanie
// tekstu w finale, błędnie dziedziczyłyby zablokowanie po STARYM,
// nieaktualnym już sound_cue_key sprzed kilku zapisów).

const FALLBACK_S = 2; // metadane audio (jeszcze) niedostępne — bezpieczny domysł

export function createActionGate({ getSfxDuration }) {
  async function dur(key) {
    if (!key) return 0;
    try {
      const d = await getSfxDuration(key);
      return d > 0 ? d : FALLBACK_S;
    } catch {
      return FALLBACK_S;
    }
  }

  // control/js/gameRounds.js's startRound(): "round_transition"+"reveal"
  // zsynchronizowane na koniec, totalMs = Math.max(rtDur, revealDur, 2)*1000
  // — "2" to NIE domysł na czas nieznanych metadanych (dur() już to
  // załatwia wyżej), tylko realny, zweryfikowany w starym kodzie dolny próg
  // samej animacji planszy (wjazd/wyjazd trwa ~2s niezależnie od długości
  // nagrania) — reużyte też przez F7 (NEXT_QUESTION -> f_p2_start), które
  // gra dokładnie tę samą, zsynchronizowaną kombinację.
  async function syncedFloor2() {
    const [rt, rv] = await Promise.all([dur("round_transition"), dur("reveal")]);
    return Math.max(rt, rv, 2) * 1000;
  }

  const SPECIAL = {
    START_ROUND: () => syncedFloor2(),
    NEXT_QUESTION: async (prevRow, nextRow) => (nextRow?.step === "f_p2_start" ? syncedFloor2() : 0),
    // R6-R7: "reveal" gra najpierw, operator dostaje z powrotem kontrolę
    // gdy TYLKO "reveal" dograło — "round_transition" leci POTEM, już nad
    // nowym, już interaktywnym ekranem (control/js/gameRounds.js's
    // goEndRound() — 1:1). END_ROUND (bez R8) i NEXT_AFTER_REVEAL (po R8)
    // grają ten sam dźwięk w tym samym miejscu tabeli stanów (R9) — ta sama
    // formuła.
    END_ROUND: async () => (await dur("reveal")) * 1000,
    NEXT_AFTER_REVEAL: async () => (await dur("reveal")) * 1000,
    // F0: "final_theme" gra najpierw, operator dostaje ekran wpisywania
    // dopiero po nim — "reveal" (drugi dźwięk kombinacji) leci już nad tym
    // ekranem (control/js/gameFinal.js's startFinal()).
    START_FINAL: async () => (await dur("final_theme")) * 1000,
    // F14: zsynchronizowane round_transition+reveal (floor 2s jak wyżej), a
    // DOPIERO PO CAŁEJ tej parze — sekwencyjnie — "show_intro". Jedyne
    // miejsce, gdzie blokada czeka na WSZYSTKO na raz (stare
    // gameFinal.js's sessionEnd() czekało na obie części pod rząd).
    FINISH_FINAL: async () => (await syncedFloor2()) + (await dur("show_intro")) * 1000,
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
    return (await dur(nextRow.sound_cue_key)) * 1000;
  }

  return { computeGateMs };
}
