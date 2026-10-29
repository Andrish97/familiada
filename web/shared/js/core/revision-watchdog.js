// Gdy heartbeat potwierdza nowszą rewizję niż kanał Realtime, daj kanałowi
// do 700 ms na dostarczenie wiersza. Nie czekaj na następny heartbeat (3 s):
// po tym oknie pobierz stan i odbuduj kanał. Krótszy próg 250 ms powodował
// fałszywe odbudowy przy zmierzonym opóźnieniu Postgres Changes 180–350 ms.
export function createRevisionWatchdog({
  getReceivedRev,
  graceMs = 700,
  onMissed = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timer = null;
  let pendingRev = null;

  function clear() {
    if (timer != null) clearTimer(timer);
    timer = null;
    pendingRev = null;
  }

  function observeReceivedRevision() {
    if (pendingRev != null && getReceivedRev() >= pendingRev) clear();
  }

  function noteServerRevision(revision) {
    if (!Number.isSafeInteger(revision)) return;
    if (revision <= getReceivedRev()) { observeReceivedRevision(); return; }
    pendingRev = Math.max(pendingRev ?? revision, revision);
    if (timer != null) return;
    timer = setTimer(() => {
      timer = null;
      const missedRevision = pendingRev;
      pendingRev = null;
      if (missedRevision == null || missedRevision <= getReceivedRev()) return;
      onMissed({
        latest_revision: missedRevision,
        missed_revisions: missedRevision - Math.max(0, getReceivedRev()),
        grace_ms: graceMs,
      });
    }, graceMs);
  }

  return { noteServerRevision, observeReceivedRevision, clear };
}
