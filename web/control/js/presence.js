// control/js/presence.js
// Status dozwolonego urządzenia pochodzi z serwerowego lease primary.
// device_presence pozostaje osobną telemetrią stanu karty i dźwięku; nie
// rozstrzyga, czy urządzenie może brać udział w grze.
//
// W odróżnieniu od control/js/presence.js: brak jakiegokolwiek wysyłania
// komend przy przejściu offline->online ("okno inicjalizacji" dzisiejszego
// presence.js istniało wyłącznie po to, żeby ustawić urządzenie w znany
// stan komendami — w v2 urządzenie samo wie, co pokazać, bo czyta
// game_state przy każdym (re)connect). Ten moduł robi wyłącznie to, co jest
// realnie faktem obecności: kto jest online, od kiedy.

import { sb } from "../../shared/js/core/supabase.js?v=v2026-10-19T11085";


const STATUS_READ_TIMEOUT_MS = 6_500;
const POLL_MS = 750;

export function createPresence({ gameId, onChange }) {
  let timer = null;
  let expiryTimer = null;
  let inFlight = false;
  let flags = { display: false, host: false, buzzer: false };
  let displayAudioUnlocked = null;
  let displayAudioUnlockNonce = null;
  let displayAudioUnlockStatus = { requestNonce: null, acknowledgedNonce: null };
  let lastSeenAt = { display: null, host: null, buzzer: null };
  let deviceMeta = { display: {}, host: {}, buzzer: {} };
  let lastPageVisibility = { display: null, host: null, buzzer: null };
  let pageVisibilityChangedAt = { display: null, host: null, buzzer: null };
  let readUnavailable = false;
  let metadataReadUnavailable = false;
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

  function pickNewest(rows, deviceType) {
    return rows
      .filter((r) => String(r.device_type || "").toLowerCase() === deviceType)
      .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0] || null;
  }

  async function tick() {
    if (inFlight) return;
    inFlight = true;
    try {
    const asResult = (promise) => Promise.resolve(promise).then(
      (result) => result,
      (error) => ({ data: null, error }),
    );
    const [presenceResult, unlockResult, leaseResult] = await Promise.all([
      asResult(sb().from("device_presence")
        .select("device_type,last_seen_at,meta")
        .eq("game_id", gameId)
        .abortSignal(AbortSignal.timeout(STATUS_READ_TIMEOUT_MS))),
      asResult(sb().from("display_audio_unlock")
        .select("request_nonce,acknowledged_nonce")
        .eq("game_id", gameId)
        .maybeSingle()
        .abortSignal(AbortSignal.timeout(STATUS_READ_TIMEOUT_MS))),
      asResult(sb().rpc("control_device_slots_for_owner", { p_game_id: gameId })
        .abortSignal(AbortSignal.timeout(STATUS_READ_TIMEOUT_MS))),
    ]);
    const { data, error } = presenceResult;
    const { data: leaseRows, error: leaseError } = leaseResult;

    if (leaseError) {
      // The lease RPC is authoritative for game actions. If it fails, keep the
      // last flags and block actions until primary ownership can be verified.
      readUnavailable = true;
      reportIfChanged({
        flags, lastSeenAt, displayAudioUnlocked, displayAudioUnlockNonce,
        error: leaseError,
        errorSource: "lease_status",
      });
      return;
    }

    readUnavailable = false;
    metadataReadUnavailable = !!error;

    // device_presence is supplemental UI metadata. A failure there must not
    // block game actions when the authoritative lease read succeeded.
    const rows = error ? [] : (data || []);
    const d = pickNewest(rows, "display");
    const h = pickNewest(rows, "host");
    const b = pickNewest(rows, "buzzer");
    // The database row is authoritative. Heartbeat metadata remains a
    // compatibility fallback while deployments apply migration 312.
    if (!unlockResult.error && unlockResult.data) {
      displayAudioUnlockStatus = {
        requestNonce: unlockResult.data.request_nonce || null,
        acknowledgedNonce: unlockResult.data.acknowledged_nonce || null,
      };
      displayAudioUnlockNonce = displayAudioUnlockStatus.requestNonce;
      displayAudioUnlocked = !!displayAudioUnlockNonce
        && displayAudioUnlockStatus.acknowledgedNonce === displayAudioUnlockNonce;
    } else if (!error) {
      displayAudioUnlockStatus = { requestNonce: null, acknowledgedNonce: null };
      displayAudioUnlocked = d?.meta?.audio_unlocked === true;
      displayAudioUnlockNonce = typeof d?.meta?.audio_unlock_nonce === "string" ? d.meta.audio_unlock_nonce : null;
    }

    if (!error) {
      lastSeenAt = { display: d?.last_seen_at ?? null, host: h?.last_seen_at ?? null, buzzer: b?.last_seen_at ?? null };
      deviceMeta = { display: d?.meta || {}, host: h?.meta || {}, buzzer: b?.meta || {} };
    }
    for (const kind of ["display", "host", "buzzer"]) {
      const visibility = deviceMeta[kind]?.page_visibility || null;
      if (lastPageVisibility[kind] != null && visibility != null && visibility !== lastPageVisibility[kind]) {
        pageVisibilityChangedAt[kind] = Date.now();
      }
      if (visibility != null) lastPageVisibility[kind] = visibility;
    }
    // Lease RPC jest źródłem prawdy: obecność transportowa karty nie oznacza,
    // że dana instancja ma prawo obsługiwać grę.
    const primaryByType = Object.fromEntries((leaseRows || []).map(row => [row.device_type, row.primary_online === true]));
    flags = { display: !!primaryByType.display, host: !!primaryByType.host, buzzer: !!primaryByType.buzzer };

    reportIfChanged({
      flags, lastSeenAt, displayAudioUnlocked, displayAudioUnlockNonce, displayAudioUnlockStatus,
      error: error || null, errorSource: error ? "device_presence" : null,
    });
    } catch (error) {
      readUnavailable = true;
      reportIfChanged({ flags, lastSeenAt, displayAudioUnlocked, displayAudioUnlockNonce, error, errorSource: "status_read" });
    } finally {
      inFlight = false;
    }
  }

  // App.js's onChange tylko destrukturyzuje `flags` (renderCurrent() go
  // zapisuje i przerysowuje cały panel) — reszta payloadu (lastSeenAt/error)
  // nie wpływa na to, czy warto zawiadamiać. Wywołanie tylko przy realnej
  // zmianie flags.
  function reportIfChanged(payload) {
    const deviceDiagnostics = Object.fromEntries(["display", "host", "buzzer"].map(kind => {
      const lastSeen = lastSeenAt[kind] ? new Date(lastSeenAt[kind]).getTime() : null;
      return [kind, {
        lastSeenAt: lastSeenAt[kind],
        ageMs: lastSeen == null ? null : Math.max(0, Date.now() - lastSeen),
        browserContextId: deviceMeta[kind]?.browser_context_id || null,
        visibility: deviceMeta[kind]?.page_visibility || null,
        visibilityChangedAt: pageVisibilityChangedAt[kind],
        focused: typeof deviceMeta[kind]?.page_focused === "boolean" ? deviceMeta[kind].page_focused : null,
        audioDiagnostic: deviceMeta[kind]?.audio_diagnostic || null,
        renderDiagnostic: deviceMeta[kind]?.render_diagnostic || null,
      }];
    }));
    const reported = {
      ...payload,
      deviceDiagnostics,
      displayAudioUnlocked: payload.displayAudioUnlocked ?? displayAudioUnlocked,
      displayAudioUnlockNonce: payload.displayAudioUnlockNonce ?? displayAudioUnlockNonce,
      displayAudioUnlockStatus: payload.displayAudioUnlockStatus ?? displayAudioUnlockStatus,
    };
    const fp = JSON.stringify({ flags: reported.flags, readUnavailable, errorSource: reported.errorSource || null, displayAudioUnlocked: reported.displayAudioUnlocked, displayAudioUnlockNonce: reported.displayAudioUnlockNonce, displayAudioUnlockStatus: reported.displayAudioUnlockStatus, deviceVisibility: Object.fromEntries(Object.entries(deviceDiagnostics).map(([kind, item]) => [kind, [item.visibility, item.focused, item.browserContextId]])), displayAudioDiagnosticId: deviceDiagnostics.display.audioDiagnostic?.id || null, displayRenderDiagnosticId: deviceDiagnostics.display.renderDiagnostic?.id || null });
    if (fp === lastReported) return;
    lastReported = fp;
    onChange?.(reported);
  }

  function start() {
    tick();
    timer = setInterval(tick, POLL_MS);
    // Przeliczaj czas tylko przy dostępnym odczycie. W trakcie żądania
    // (także ponowień HTTP) brak świeżego wyniku nie dowodzi rozłączenia.
    expiryTimer = setInterval(() => {
      if (inFlight || readUnavailable || metadataReadUnavailable) return;
      // The lease RPC, not the older device_presence timestamp, decides
      // whether the fenced primary is still valid. Time alone can't recreate
      // that server-side ownership proof.
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

  return { start, stop, getFlags, refresh: tick };
}
