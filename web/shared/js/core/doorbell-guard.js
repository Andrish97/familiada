// js/core/doorbell-guard.js
// Dzwonek Control ({rev} po każdym potwierdzonym zapisie). Najpierw odczyt:
// urządzenie od razu pobiera stan RPC (70–400 ms), a kanał bezpośredni
// (postgres_changes) jedzie równolegle — wygrywa szybszy, duplikaty odrzuca
// rewizja. Wcześniej urządzenie czekało do 600 ms na Realtime; eksport 29.10:
// Wyświetlacz w prawdziwej grze nie dostał w tym czasie co drugiej zmiany
// (35 nadrobień), więc plansza startowała ~0,8 s po zapisie.
// Zdrowie kanału liczy się osobno — po `graceMs` sprawdzamy, czy SAM kanał
// dostarczył tę rewizję; dwie wpadki z rzędu = kanał nieświeży (odbudowa).

export function createDoorbellGuard({ graceMs = 600, getReceivedRev, getDirectRev = getReceivedRev, isDirectConnected, fetchNow, onMissed = () => {}, onStale = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  let misses = 0;
  let latestMissedRev = null;

  function check(rev) {
    timer = null;
    if (getDirectRev() >= rev) { misses = 0; latestMissedRev = null; return; }
    const missedRevisions = rev - Math.max(0, getDirectRev());
    onMissed({ latest_revision: rev, missed_revisions: missedRevisions, grace_ms: graceMs });
    misses += 1;
    latestMissedRev = Math.max(latestMissedRev ?? rev, rev);
    if (misses >= 2 && isDirectConnected()) {
      misses = 0;
      onStale();
    }
  }

  function ring(rev) {
    if (typeof rev !== "number" || rev <= getReceivedRev()) return;
    fetchNow();
    if (!isDirectConnected()) return;
    clearTimer(timer);
    timer = setTimer(() => check(rev), graceMs);
  }

  function stop() {
    clearTimer(timer);
    timer = null;
    misses = 0;
    latestMissedRev = null;
  }

  // Wiersz Realtime dotarł po progu: nie traktuj tej wpadki jako kolejnej
  // awarii kanału.
  function noteReceived(revision) {
    if (Number.isSafeInteger(revision) && latestMissedRev != null && revision >= latestMissedRev) {
      misses = 0;
      latestMissedRev = null;
    }
  }

  return { ring, noteReceived, stop };
}
