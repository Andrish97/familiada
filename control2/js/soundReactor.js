// control2/js/soundReactor.js
// Dźwięk zostaje częścią Control (plan, decyzja z negocjacji), ale
// "sterowany stanem" zamiast wywoływany wprost z logiki gry (silnik/engine.js
// nigdy nie woła playSfx() bezpośrednio — tylko zapisuje sound_cue_key do
// wiersza, dokładnie jak każdą inną zmianę stanu).
//
// Subskrybuje WŁASNY, świeży stan Control (store.subscribe), nie odczyt z
// bazy — zero opóźnienia względem tego, co operator właśnie zrobił.
// Przepuszcza kolejne surowe wiersze (state.__row, patrz store.js) przez
// shared/deriveEvents.js i na zdarzeniu SOUND_CUE woła istniejący,
// niezmieniony playSfx() z js/core/sfx.js.
//
// Wyciszenie (przycisk w topbarze, sekcja 3a pkt 6) jest czysto lokalnym
// przełącznikiem po stronie Control — dźwięk i tak gra wyłącznie tutaj, więc
// wystarczy nie wołać playSfx() gdy wyciszone; nie trafia do game_state ani
// nie jest widoczne dla innych urządzeń.
//
// Cztery miejsca w control/js/gameRounds.js i gameFinal.js nakładają DWA
// dźwięki na jedną zmianę zamiast jednego bare cue — sprawdzone linia po
// linii, żeby nie zgadywać:
//   - R1->R2 (startRound) i F7 (toP2Start): "round_transition"+"reveal"
//     ZSYNCHRONIZOWANE na koniec (krótszy czeka, żeby oba skończyły się
//     razem) — ta sama para w obu miejscach, ten sam kod.
//   - R6-R7 (goEndRound): "reveal" najpierw, "round_transition" dopiero PO
//     jego długości (sekwencyjnie, ODWROTNA kolejność niż wyżej).
//   - F0 (startFinal): "final_theme" najpierw, "reveal" dopiero po nim.
//   - F14 (finishFinal): synced "round_transition"+"reveal" jak przy
//     starcie rundy, a PO całej tej parze dodatkowo "show_intro".

import { deriveEvents } from "../../shared/deriveEvents.js?v=v2026-09-05T19503";
import { playSfx, getSfxDuration } from "../../js/core/sfx.js?v=v2026-09-05T19503";

const MUTE_KEY = "familiada_control2_muted";

async function durationOf(key) {
  try { return (await getSfxDuration(key)) || 0; } catch { return 0; }
}

// Dwa dźwięki zsynchronizowane na KONIEC — krótszy startuje z opóźnieniem,
// tak żeby oba skończyły się razem. Zwraca całkowity czas (s) do użycia
// przez wywołującego (np. F14 czeka na to przed show_intro).
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

// Dwa dźwięki SEKWENCYJNIE — keyA gra od razu, keyB dopiero po jego długości.
async function playSequentialCombo(keyA, keyB) {
  playSfx(keyA);
  const durA = await durationOf(keyA);
  setTimeout(() => playSfx(keyB), Math.max(0, durA * 1000));
}

// F14 (finishFinal): synced round_transition+reveal, a PO całej tej parze
// dodatkowo show_intro.
async function playFinalEndCombo() {
  const totalS = await playSyncedCombo("round_transition", "reveal");
  setTimeout(() => playSfx("show_intro"), Math.max(0, totalS * 1000));
}

export function createSoundReactor(store) {
  let prevRow = null;
  let muted = localStorage.getItem(MUTE_KEY) === "1";

  function onStateChange(state) {
    const nextRow = state.__row;
    if (!nextRow) return;
    // Pierwsze wywołanie po hydrate()/pierwszym commit() — brak
    // poprzedniego wiersza daje tylko SNAPSHOT_RENDER (patrz deriveEvents),
    // co tu jednoznacznie oznacza "nic nie graj" (nie chcemy dźwięku samego
    // wznowienia/odczytu, tylko realnych zmian).
    if (prevRow) {
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
        if (ev.kind !== "SOUND_CUE" || !ev.key || muted) continue;
        if (ev.key === "round_transition" && (isRoundStart || isFinalP2Start)) playSyncedCombo("round_transition", "reveal");
        else if (ev.key === "round_transition" && isRoundEnd) playSequentialCombo("reveal", "round_transition");
        else if (ev.key === "final_theme") playSequentialCombo("final_theme", "reveal");
        else if (ev.key === "final_end") playFinalEndCombo();
        else playSfx(ev.key);
      }
    }
    prevRow = nextRow;
  }

  const unsubscribe = store.subscribe(onStateChange);
  // Stan mógł już być załadowany (hydrate()) zanim ten reaktor powstał —
  // złap go od razu, żeby prevRow nie zostało puste do pierwszej zmiany.
  if (store.state.__row) prevRow = store.state.__row;

  function isMuted() { return muted; }
  function setMuted(next) {
    muted = !!next;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  }
  function toggleMuted() { setMuted(!muted); return muted; }

  return { isMuted, setMuted, toggleMuted, destroy: unsubscribe };
}
