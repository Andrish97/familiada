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

export function createRowSync({ fetchRow, onRow, onError, onProgress = null, onReadStatus = null, retryMs = 2000, sameRevChanged = null, setTimer = setTimeout, now = () => globalThis.performance?.now?.() ?? Date.now() }) {
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
    return !pendingRow || isNewer(data, pendingRow.row.rev, pendingRow.row);
  }

  async function acceptRow(data, source = "rpc", receivedAt = now(), fetchMs = 0) {
    if (!data || !isNewer(data)) return false;
    const previousRev = lastRev;
    lastRev = data.rev;
    lastRow = data;
    let renderError = null;
    const appliedAt = now();
    try {
      await onRow(data);
    } catch (error) {
      renderError = error;
      console.warn("[game-state-sync] onRow rzucił wyjątek:", error);
    }
    try {
      onProgress?.({
        row: data, source, previousRev, receivedMs: Math.max(0, Math.round(appliedAt - receivedAt)),
        fetchMs: Math.max(0, Math.round(fetchMs)), renderMs: Math.max(0, Math.round(now() - appliedAt)),
        renderError,
      });
    } catch (error) { console.warn("[game-state-sync] progress listener failed:", error); }
    return true;
  }

  function drainPending() {
    if (fetching) return;
    if (pendingRow) {
      const pending = pendingRow;
      pendingRow = null;
      fetching = true;
      void acceptRow(pending.row, pending.source, pending.receivedAt, 0).finally(() => {
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

  async function fetchOnce(source = "rpc") {
    const startedAt = now();
    let data;
    try {
      const res = await fetchRow();
      if (res.error) {
        onReadStatus?.({ ok: false, source, error: res.error, fetchMs: Math.max(0, Math.round(now() - startedAt)) });
        onError?.(res.error); scheduleRetry(); return;
      }
      data = res.data;
    } catch (error) {
      onReadStatus?.({ ok: false, source, error, fetchMs: Math.max(0, Math.round(now() - startedAt)) });
      onError?.(error);
      scheduleRetry();
      return;
    }
    onReadStatus?.({ ok: true, source, revision: Number(data?.rev), fetchMs: Math.max(0, Math.round(now() - startedAt)) });
    if (!data) return; // Control jeszcze nigdy nic nie zapisał dla tej gry
    await acceptRow(data, source, now(), Math.max(0, now() - startedAt)); // polling/bootstrap może nadrobić pominięty wiersz
  }

  async function fetchGuarded(source = "rpc") {
    if (fetching) { pendingRefetch = true; return; }
    fetching = true;
    try {
      await fetchOnce(source);
    } finally {
      fetching = false;
      drainPending();
    }
  }

  // Wiersz z Realtime lub odpowiedzi game_state_buzzer_press. Render jest
  // serializowany tak samo jak odpowiedź RPC; podczas animacji zachowujemy
  // tylko najnowszą odebraną rewizję.
  function applyRow(row, source = "postgres_changes") {
    if (!row || !isNewer(row)) return;
    const pending = { row, source, receivedAt: now() };
    if (fetching) {
      if (newerThanPending(row)) pendingRow = pending;
      return;
    }
    pendingRow = pending;
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
