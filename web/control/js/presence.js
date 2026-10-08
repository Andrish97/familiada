// control/js/presence.js
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

import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-08T18212";

const ONLINE_MS = 6_500; // Two missed 3s heartbeats, with a small margin.
const POLL_MS = 750;

export function createPresence({ gameId, onChange }) {
  let timer = null;
  let expiryTimer = null;
  let inFlight = false;
  let flags = { display: false, host: false, buzzer: false };
  let displayAudioUnlocked = null;
  let displayAudioUnlockNonce = null;
  let lastSeenAt = { display: null, host: null, buzzer: null };
  // Zgłoszone: "cały panel jest zlagowany, przewijanie też" — onChange()
  // (control/js/app.js's renderCurrent(), pełny root.innerHTML="" +
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
    if (inFlight) return;
    inFlight = true;
    try {
    const { data, error } = await sb()
      .from("device_presence")
      .select("device_type,last_seen_at,meta")
      .eq("game_id", gameId)
      .abortSignal(AbortSignal.timeout(ONLINE_MS));

    if (error) {
      lastSeenAt = { display: null, host: null, buzzer: null };
      flags = { display: false, host: false, buzzer: false };
      displayAudioUnlocked = null;
      displayAudioUnlockNonce = null;
      reportIfChanged({ flags, lastSeenAt, displayAudioUnlocked, displayAudioUnlockNonce, error });
      return;
    }

    const rows = data || [];
    const d = pickNewest(rows, "display");
    const h = pickNewest(rows, "host");
    const b = pickNewest(rows, "buzzer");
    displayAudioUnlocked = d?.meta?.audio_unlocked === true;
    displayAudioUnlockNonce = typeof d?.meta?.audio_unlock_nonce === "string" ? d.meta.audio_unlock_nonce : null;

    lastSeenAt = { display: d?.last_seen_at ?? null, host: h?.last_seen_at ?? null, buzzer: b?.last_seen_at ?? null };
    // isOnline() liczy się od Date.now() — flags może się zmienić (online
    // -> offline) samym upływem czasu, BEZ żadnej zmiany w bazie, więc
    // porównanie musi patrzeć na WYLICZONE flags, nie na surowe lastSeenAt.
    flags = { display: isOnline(lastSeenAt.display), host: isOnline(lastSeenAt.host), buzzer: isOnline(lastSeenAt.buzzer) };

    reportIfChanged({ flags, lastSeenAt, displayAudioUnlocked, displayAudioUnlockNonce, error: null });
    } catch (error) {
      lastSeenAt = { display: null, host: null, buzzer: null };
      flags = { display: false, host: false, buzzer: false };
      displayAudioUnlocked = null;
      displayAudioUnlockNonce = null;
      reportIfChanged({ flags, lastSeenAt, displayAudioUnlocked, displayAudioUnlockNonce, error });
    } finally {
      inFlight = false;
    }
  }

  // App.js's onChange tylko destrukturyzuje `flags` (renderCurrent() go
  // zapisuje i przerysowuje cały panel) — reszta payloadu (lastSeenAt/error)
  // nie wpływa na to, czy warto zawiadamiać. Wywołanie tylko przy realnej
  // zmianie flags.
  function reportIfChanged(payload) {
    const reported = {
      ...payload,
      displayAudioUnlocked: payload.displayAudioUnlocked ?? displayAudioUnlocked,
      displayAudioUnlockNonce: payload.displayAudioUnlockNonce ?? displayAudioUnlockNonce,
    };
    const fp = JSON.stringify({ flags: reported.flags, displayAudioUnlocked: reported.displayAudioUnlocked, displayAudioUnlockNonce: reported.displayAudioUnlockNonce });
    if (fp === lastReported) return;
    lastReported = fp;
    onChange?.(reported);
  }

  function start() {
    tick();
    timer = setInterval(tick, POLL_MS);
    // Expire locally even when a presence query is still waiting for the network.
    expiryTimer = setInterval(() => {
      flags = Object.fromEntries(Object.entries(lastSeenAt).map(([kind, at]) => [kind, isOnline(at)]));
      reportIfChanged({ flags, lastSeenAt, error: null });
    }, 250);
  }

  function stop() {
    if (timer) clearInterval(timer);
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = null;
    timer = null;
  }

  function getFlags() { return { ...flags }; }

  return { start, stop, getFlags };
}
