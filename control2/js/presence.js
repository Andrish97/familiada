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

import { sb } from "../../js/core/supabase.js?v=v2026-09-21T17315";

const ONLINE_MS = 15_000;
const POLL_MS = 1_500;

export function createPresence({ gameId, onChange }) {
  let timer = null;
  let flags = { display: false, host: false, buzzer: false };
  let lastSeenAt = { display: null, host: null, buzzer: null };
  // Zgłoszone: "cały panel jest zlagowany, przewijanie też" — onChange()
  // (control2/js/app.js's renderCurrent(), pełny root.innerHTML="" +
  // odbudowa dla większości ekranów) leciał na KAŻDY tick (co 1.5s), NAWET
  // gdy obecność faktycznie się nie zmieniła — czyli cały panel przebudowywał
  // się destrukcyjnie co 1.5s bez przerwy przez całą grę, niezależnie od
  // tego, co operator akurat robił (w tym w trakcie przewijania). Odcisk
  // palca ostatnio zgłoszonego stanu — ten sam wzorzec co ui.js's
  // renderSetupFinish() już stosuje dla podglądu Wyświetlacza — ogranicza
  // onChange() wyłącznie do realnych zmian obecności.
  let lastReported = null;

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
      reportIfChanged({ flags, lastSeenAt, error });
      return;
    }

    const rows = data || [];
    const d = pickNewest(rows, "display");
    const h = pickNewest(rows, "host");
    const b = pickNewest(rows, "buzzer");

    lastSeenAt = { display: d?.last_seen_at ?? null, host: h?.last_seen_at ?? null, buzzer: b?.last_seen_at ?? null };
    // isOnline() liczy się od Date.now() — flags może się zmienić (online
    // -> offline) samym upływem czasu, BEZ żadnej zmiany w bazie, więc
    // porównanie musi patrzeć na WYLICZONE flags, nie na surowe lastSeenAt.
    flags = { display: isOnline(lastSeenAt.display), host: isOnline(lastSeenAt.host), buzzer: isOnline(lastSeenAt.buzzer) };

    reportIfChanged({ flags, lastSeenAt, error: null });
  }

  // App.js's onChange tylko destrukturyzuje `flags` (renderCurrent() go
  // zapisuje i przerysowuje cały panel) — reszta payloadu (lastSeenAt/error)
  // nie wpływa na to, czy warto zawiadamiać. Wywołanie tylko przy realnej
  // zmianie flags.
  function reportIfChanged(payload) {
    const fp = JSON.stringify(payload.flags);
    if (fp === lastReported) return;
    lastReported = fp;
    onChange?.(payload);
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
