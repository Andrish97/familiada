// js/core/doorbell-guard.js
// Dzwonek Control ({rev} po każdym potwierdzonym zapisie) jako siatka
// bezpieczeństwa dla kanału bezpośredniego (postgres_changes). Gdy kanał
// leży — od razu odczyt. Gdy działa — ma 600 ms na dostarczenie rewizji;
// pomiary E2E wykazały typowe opóźnienie 180–350 ms i pojedynczy wspólny
// przypadek 444–458 ms na trzech urządzeniach oraz 534 ms na Buzzerze.
// Próg 500 ms uruchomił w tym ostatnim przebiegu zbędny RPC 34 ms przed
// dostarczeniem tej samej rewizji. Próg 600 ms obejmuje zmierzony ogon, a
// nadal uruchamia fallback przed heartbeatowym watchdogiem 700 ms.
// Dwie wpadki z rzędu = kanał nieświeży.

export function createDoorbellGuard({ graceMs = 600, getReceivedRev, isDirectConnected, fetchNow, onMissed = () => {}, onStale = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  let misses = 0;
  let latestMissedRev = null;

  function check(rev) {
    timer = null;
    if (getReceivedRev() >= rev) { misses = 0; latestMissedRev = null; return; }
    const missedRevisions = rev - Math.max(0, getReceivedRev());
    onMissed({ latest_revision: rev, missed_revisions: missedRevisions, grace_ms: graceMs });
    misses += 1;
    latestMissedRev = Math.max(latestMissedRev ?? rev, rev);
    if (misses >= 2 && isDirectConnected()) {
      misses = 0;
      onStale();
      return;
    }
    fetchNow();
  }

  function ring(rev) {
    if (typeof rev !== "number" || rev <= getReceivedRev()) return;
    if (!isDirectConnected()) { fetchNow(); return; }
    clearTimer(timer);
    timer = setTimer(() => check(rev), graceMs);
  }

  function stop() {
    clearTimer(timer);
    timer = null;
    misses = 0;
    latestMissedRev = null;
  }

  // Próg RPC może minąć tuż przed Realtime. Gdy spóźniony wiersz jednak
  // dotrze, nie traktuj wcześniejszego fallbacku jako kolejnej awarii kanału.
  function noteReceived(revision) {
    if (Number.isSafeInteger(revision) && latestMissedRev != null && revision >= latestMissedRev) {
      misses = 0;
      latestMissedRev = null;
    }
  }

  return { ring, noteReceived, stop };
}
