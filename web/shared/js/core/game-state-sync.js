// js/core/game-state-sync.js
// Monotoniczny, serializowany odbiór wierszy dla Broadcast/poll fallbacku
// oraz bezpośrednich zdarzeń postgres_changes.
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
  let pendingRow = null;
  let retryScheduled = false;

  function isNewer(data, baseRev = lastRev, baseRow = lastRow) {
    if (data.rev > baseRev) return true;
    // Opcjonalnie: ten sam rev, ale zmieniło się pole zapisywane bez podbicia
    // rev (game_state_set_lock zmienia tylko locked_until).
    return data.rev === baseRev && !!baseRow && !!sameRevChanged && sameRevChanged(baseRow, data);
  }

  function newerThanPending(data) {
    return !pendingRow || isNewer(data, pendingRow.rev, pendingRow);
  }

  async function acceptRow(data) {
    if (!data || !isNewer(data)) return;
    lastRev = data.rev;
    lastRow = data;
    try {
      await onRow(data);
    } catch (error) {
      console.warn("[game-state-sync] onRow rzucił wyjątek:", error);
    }
  }

  function drainPending() {
    if (fetching) return;
    if (pendingRow) {
      const row = pendingRow;
      pendingRow = null;
      fetching = true;
      void acceptRow(row).finally(() => {
        fetching = false;
        drainPending();
      });
      return;
    }
    if (pendingRefetch) {
      pendingRefetch = false;
      void fetchGuarded();
    }
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
    await acceptRow(data); // stary Broadcast / polling może przynieść spóźniony rev
  }

  async function fetchGuarded() {
    if (fetching) { pendingRefetch = true; return; }
    fetching = true;
    try {
      await fetchOnce();
    } finally {
      fetching = false;
      drainPending();
    }
  }

  // Wiersz z Realtime lub odpowiedzi game_state_buzzer_press. Render jest
  // serializowany tak samo jak odpowiedź RPC; podczas animacji zachowujemy
  // tylko najnowszą odebraną rewizję.
  function applyRow(row) {
    if (!row || !isNewer(row)) return;
    if (fetching) {
      if (newerThanPending(row)) pendingRow = row;
      return;
    }
    pendingRow = row;
    drainPending();
  }

  function reset() {
    lastRev = -1;
    lastRow = null;
    pendingRow = null;
    pendingRefetch = false;
  }

  return { fetchGuarded, applyRow, reset, get lastRev() { return lastRev; } };
}
