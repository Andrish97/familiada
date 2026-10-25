// js/core/doorbell-guard.js
// Dzwonek Control ({rev} po każdym potwierdzonym zapisie) jako siatka
// bezpieczeństwa dla kanału bezpośredniego (postgres_changes). Gdy kanał
// leży — od razu odczyt. Gdy działa — ma `graceMs` na dostarczenie tej
// rewizji; jeśli nie zdąży, odczyt RPC zamiast czekania na heartbeat lease
// (3–6 s; eksport 25.10). Dwie wpadki z rzędu = kanał nieświeży.

export function createDoorbellGuard({ graceMs = 400, getReceivedRev, isDirectConnected, fetchNow, onMissed = () => {}, onLate = () => {}, onStale = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, now = () => globalThis.performance?.now?.() ?? Date.now() }) {
  let timer = null;
  let misses = 0;
  const fallbackRevisions = new Map();

  function check(rev) {
    timer = null;
    if (getReceivedRev() >= rev) { misses = 0; return; }
    const missedRevisions = rev - Math.max(0, getReceivedRev());
    fallbackRevisions.set(rev, now());
    while (fallbackRevisions.size > 20) fallbackRevisions.delete(fallbackRevisions.keys().next().value);
    onMissed({ latest_revision: rev, missed_revisions: missedRevisions, grace_ms: graceMs });
    misses += 1;
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

  // A direct event can arrive just after the 400 ms safety fallback. Record
  // that race so we can distinguish a late Realtime delivery from a lost one.
  function observeRevision(rev) {
    if (!Number.isSafeInteger(rev)) return;
    for (const [fallbackRevision, fallbackAt] of fallbackRevisions) {
      if (fallbackRevision > rev) continue;
      fallbackRevisions.delete(fallbackRevision);
      onLate({
        fallback_revision: fallbackRevision,
        direct_revision: rev,
        fallback_to_direct_ms: Math.max(0, Math.round(now() - fallbackAt)),
      });
    }
  }

  function stop() {
    clearTimer(timer);
    timer = null;
    misses = 0;
    fallbackRevisions.clear();
  }

  return { ring, observeRevision, stop };
}
