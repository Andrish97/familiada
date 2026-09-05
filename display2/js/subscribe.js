// display2/js/subscribe.js
// Odczyt stanu gry dla Display v2 — WYŁĄCZNIE przez game_state_get (RPC,
// SECURITY DEFINER, sprawdza share_key wewnątrz siebie), nigdy przez
// bezpośredni SELECT ani postgres_changes (świadomie zablokowane dla anon,
// patrz plan sekcja 1 — decyzja końcowa, nie tymczasowy fallback).
//
// Mechanizm: (1) bootstrap — jedno wywołanie RPC przy starcie strony;
// (2) "dzwonek" — Control po każdym zapisie wysyła malutki, nieautorytatywny
// broadcast {rev} (control2/js/store.js's ringDoorbell()) na kanale
// `familiada-state:<gameId>`, reużywając już sprawdzony js/core/realtime.js
// bez żadnej zmiany. Na każdy dzwonek z rev > ostatnio znanym — ponowne
// wywołanie tego samego RPC. Zgubiony dzwonek nie jest problemem: kolejna
// prawdziwa zmiana (wyższy rev) i tak dogoni stan; jedyny scenariusz "utknął
// na starym stanie na zawsze" to brak JAKIEJKOLWIEK kolejnej zmiany w grze,
// co i tak nie ma znaczenia (nic nowego do pokazania).

import { sb } from "../../js/core/supabase.js?v=v2026-09-05T00001";
import { rt } from "../../js/core/realtime.js?v=v2026-09-05T00001";

function doorbellTopic(gameId) {
  return `familiada-state:${gameId}`;
}

export function createSubscription({ gameId, deviceType, key, onRow, onError }) {
  let lastRev = -1;
  let fetching = false;
  let pendingRefetch = false;

  async function fetchOnce() {
    const { data, error } = await sb().rpc("game_state_get", {
      p_game_id: gameId,
      p_device_type: deviceType,
      p_key: key,
    });
    if (error) { onError?.(error); return; }
    if (!data) return; // Control jeszcze nigdy nic nie zapisał dla tej gry
    if (data.rev <= lastRev) return; // dzwonek spóźniony/zdublowany — nic nowego
    lastRev = data.rev;
    onRow(data);
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

  async function start() {
    await fetchGuarded();
    rt(doorbellTopic(gameId)).onBroadcast("rev", (msg) => {
      const rev = msg?.payload?.rev;
      if (typeof rev === "number" && rev > lastRev) fetchGuarded();
    });
  }

  return { start };
}
