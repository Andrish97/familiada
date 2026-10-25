// js/core/doorbell-guard.js
// Dzwonek Control ({rev} po każdym potwierdzonym zapisie) jako siatka
// bezpieczeństwa dla kanału bezpośredniego (postgres_changes). Gdy kanał
// leży — od razu odczyt. Gdy działa — ma `graceMs` na dostarczenie tej
// rewizji; jeśli nie zdąży, odczyt RPC zamiast czekania na heartbeat lease
// (3–6 s; eksport 25.10). Dwie wpadki z rzędu = kanał nieświeży.

export function createDoorbellGuard({ graceMs = 400, getReceivedRev, isDirectConnected, fetchNow, onMissed = () => {}, onStale = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  let misses = 0;

  function check(rev) {
    timer = null;
    if (getReceivedRev() >= rev) { misses = 0; return; }
    onMissed({ latest_revision: rev, missed_revisions: rev - Math.max(0, getReceivedRev()) });
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

  function stop() {
    clearTimer(timer);
    timer = null;
    misses = 0;
  }

  return { ring, stop };
}
