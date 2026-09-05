// control2/js/presence.js
// Obecność urządzeń (kto jest online) — fakt, nie stan gry (plan, sekcja 2
// punkt "0."), więc zostaje CAŁKOWICIE poza public.game_state, dokładnie
// jak dziś: tabela public.device_presence, reużyta bez zmian, pollowana
// przez Control.
//
// W odróżnieniu od control/js/presence.js: brak jakiegokolwiek wysyłania
// komend przy przejściu offline->online ("okno inicjalizacji" dzisiejszego
// presence.js istniało wyłącznie po to, żeby ustawić urządzenie w znany
// stan komendami — w v2 urządzenie samo wie, co pokazać, bo czyta
// game_state przy każdym (re)connect). Ten moduł robi wyłącznie to, co jest
// realnie faktem obecności: kto jest online, od kiedy.

import { sb } from "../../js/core/supabase.js?v=v2026-09-05T19011";

const ONLINE_MS = 15_000;
const POLL_MS = 1_500;

export function createPresence({ gameId, onChange }) {
  let timer = null;
  let flags = { display: false, host: false, buzzer: false };
  let lastSeenAt = { display: null, host: null, buzzer: null };

  function isOnline(lastSeen) {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_MS;
  }

  function pickNewest(rows, deviceType) {
    return rows
      .filter((r) => String(r.device_type || "").toLowerCase() === deviceType)
      .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0] || null;
  }

  async function tick() {
    const { data, error } = await sb()
      .from("device_presence")
      .select("device_type,last_seen_at")
      .eq("game_id", gameId);

    if (error) {
      flags = { display: false, host: false, buzzer: false };
      onChange?.({ flags, lastSeenAt, error });
      return;
    }

    const rows = data || [];
    const d = pickNewest(rows, "display");
    const h = pickNewest(rows, "host");
    const b = pickNewest(rows, "buzzer");

    lastSeenAt = { display: d?.last_seen_at ?? null, host: h?.last_seen_at ?? null, buzzer: b?.last_seen_at ?? null };
    flags = { display: isOnline(lastSeenAt.display), host: isOnline(lastSeenAt.host), buzzer: isOnline(lastSeenAt.buzzer) };

    onChange?.({ flags, lastSeenAt, error: null });
  }

  function start() {
    tick();
    timer = setInterval(tick, POLL_MS);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function getFlags() { return { ...flags }; }

  return { start, stop, getFlags };
}
