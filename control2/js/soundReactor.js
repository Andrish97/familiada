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

import { deriveEvents } from "../../shared/deriveEvents.js?v=v2026-09-05T07292";
import { playSfx, getSfxDuration } from "../../js/core/sfx.js?v=v2026-09-05T07292";

const MUTE_KEY = "familiada_control2_muted";

// Start rundy dziś nakłada "reveal" i "round_transition" zsynchronizowane
// na KONIEC (control/js/gameRounds.js's startRound(): krótszy z dwóch
// startuje z opóźnieniem, tak żeby oba skończyły się razem) — a nie jeden
// bare "round_transition" jak w pierwszym przebiegu control2.
async function playRoundStartCombo() {
  let rtDur = 0, revealDur = 0;
  try {
    [rtDur, revealDur] = await Promise.all([getSfxDuration("round_transition"), getSfxDuration("reveal")]);
  } catch {}
  if (rtDur >= revealDur) {
    playSfx("round_transition");
    setTimeout(() => playSfx("reveal"), Math.max(0, (rtDur - revealDur) * 1000));
  } else {
    playSfx("reveal");
    setTimeout(() => playSfx("round_transition"), Math.max(0, (revealDur - rtDur) * 1000));
  }
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
      for (const ev of events) {
        if (ev.kind === "SOUND_CUE" && ev.key && !muted) {
          if (ev.key === "round_transition" && isRoundStart) playRoundStartCombo();
          else playSfx(ev.key);
        }
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
