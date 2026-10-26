// js/core/doorbell-guard.js
// Dzwonek Control ({rev} po każdym potwierdzonym zapisie) jako siatka
// bezpieczeństwa dla kanału bezpośredniego (postgres_changes). Gdy kanał
// leży — od razu odczyt. Gdy działa — ma 500 ms na dostarczenie rewizji;
// pomiary E2E wykazały typowe opóźnienie 180–350 ms i pojedynczy wspólny
// przypadek 444–458 ms na trzech urządzeniach. Próg 400 ms uruchomił wtedy
// zbędne odczyty RPC tuż przed dostarczeniem tych samych wierszy. Przy
// dłuższym opóźnieniu RPC nadal nadrabia szybciej niż heartbeat urządzenia.
// Dwie wpadki z rzędu = kanał nieświeży.

export function createDoorbellGuard({ graceMs = 500, getReceivedRev, isDirectConnected, fetchNow, onMissed = () => {}, onStale = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
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
