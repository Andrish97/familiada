// js/core/game-state-sync.js
// Logika "dociągnij stan, gdy dzwonek mówi, że jest nowszy" — bez zależności od
// Supabase/DOM, żeby dało się ją sprawdzić testem jednostkowym. Używane przez
// game-state-subscribe.js (Display/Host/Buzzer).
//
// Dzwonek (broadcast {rev}) jest tylko podpowiedzią i bywa gubiony: błąd
// sieciowy w trakcie game_state_get, zawieszone żądanie albo przerwa w
// kanale. Gdy po zmianie stanu nie ma już żadnej kolejnej zmiany (np. po
// "Rozpocznij rundę" Buzzer czeka na pierwsze naciśnięcie), urządzenie
// zostawało na starym stanie — Buzzer pokazywał zapalony przycisk
// poprzedniej rundy. Dlatego: (1) błąd/wyjątek planuje ponowną próbę,
// (2) zawieszone żądanie jest przerywane limitem czasu (po stronie
// fetchRow), (3) wołający może okresowo wywoływać fetchGuarded() jako siatkę
// bezpieczeństwa (tani no-op, gdy rev się nie zmienił).

export function createRowSync({ fetchRow, onRow, onError, retryMs = 2000, sameRevChanged = null, setTimer = setTimeout }) {
  let lastRev = -1;
  let lastRow = null;
  let fetching = false;
  let pendingRefetch = false;
  let retryScheduled = false;

  function isNewer(data) {
    if (data.rev > lastRev) return true;
    // Opcjonalnie: ten sam rev, ale zmieniło się pole zapisywane bez podbicia
    // rev (game_state_set_lock zmienia tylko locked_until).
    return data.rev === lastRev && !!lastRow && !!sameRevChanged && sameRevChanged(lastRow, data);
  }

  function scheduleRetry() {
    if (retryScheduled) return;
    retryScheduled = true;
    setTimer(() => { retryScheduled = false; fetchGuarded(); }, retryMs);
  }

  async function fetchOnce() {
    let data;
    try {
      const res = await fetchRow();
      if (res.error) { onError?.(res.error); scheduleRetry(); return; }
      data = res.data;
    } catch (error) {
      onError?.(error);
      scheduleRetry();
      return;
    }
    if (!data) return; // Control jeszcze nigdy nic nie zapisał dla tej gry
    if (!isNewer(data)) return; // dzwonek spóźniony/zdublowany — nic nowego
    lastRev = data.rev;
    lastRow = data;
    // await: patrz komentarz w game-state-subscribe.js (render Display jest
    // asynchroniczny; kolejny odczyt nie może się z nim nakładać).
    try {
      await onRow(data);
    } catch (error) {
      // Błąd renderu to nie błąd odczytu (onError czerni Display) — tylko log.
      console.warn("[game-state-sync] onRow rzucił wyjątek:", error);
    }
  }

  async function fetchGuarded() {
    if (fetching) { pendingRefetch = true; return; }
    fetching = true;
    try {
      await fetchOnce();
    } finally {
      fetching = false;
      if (pendingRefetch) { pendingRefetch = false; fetchGuarded(); }
    }
  }

  // Wiersz z innego źródła niż odczyt (odpowiedź game_state_buzzer_press).
  function applyRow(row) {
    if (!row || row.rev <= lastRev) return;
    lastRev = row.rev;
    lastRow = row;
    onRow(row);
  }

  return { fetchGuarded, applyRow, get lastRev() { return lastRev; } };
}
