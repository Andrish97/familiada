// js/core/game-state-subscribe.js
// Devices use a short-lived, lease-scoped JWT for direct postgres_changes.
// Realtime rows are applied directly; RPC bootstrap, Broadcast and polling
// recover missed events whenever the direct channel is unavailable.
//
// Mechanizm: (1) bootstrap — jedno wywołanie RPC przy starcie strony;
// (2) "dzwonek" — Control po każdym zapisie wysyła malutki, nieautorytatywny
// broadcast {rev} (control/js/store.js's ringDoorbell()) na kanale
// `familiada-state:<gameId>`, reużywając już sprawdzony js/core/realtime.js
// bez żadnej zmiany. Na każdy dzwonek z rev > ostatnio znanym — ponowne
// wywołanie tego samego RPC. Zgubiony dzwonek nie jest problemem: kolejna
// prawdziwa zmiana (wyższy rev) i tak dogoni stan; jedyny scenariusz "utknął
// na starym stanie na zawsze" to brak JAKIEJKOLWIEK kolejnej zmiany w grze,
// co i tak nie ma znaczenia (nic nowego do pokazania).

import { sb, SUPABASE_ANON_KEY } from "./supabase.js?v=v2026-10-19T13371";
import { rt } from "./realtime.js?v=v2026-10-19T13371";
import { doorbellTopic } from "./game-state-doorbell.js?v=v2026-10-19T13371";
import { createRowSync } from "./game-state-sync.js?v=v2026-10-19T13371";


export function createSubscription({ gameId, deviceType, key, onRow, onError, onBroadcast = {}, onDirectTables = {}, pollMs = 5000, sameRevChanged = null, getLeaseArgs = () => ({}) }) {
  let active = false;
  let pollTimer = null;
  let directChannel = null;
  let directConnected = false;
  const directTableChannels = new Map();
  const directTableConnected = new Map();
  let tokenTimer = null;
  let directUnavailableLogged = false;
  let directStatus = "IDLE";
  let directIncidentAt = null;
  let directIncident = null;
  let tokenAuthIncidentOpen = false;
  let transportSnapshotLogged = false;
  let sessionStarted = false;
  let readIncidentOpen = false;
  let renderIncidentOpen = false;
  let hiddenAt = document.visibilityState === "hidden" ? performance.now() : null;
  let diagnosticWriteFailed = false;
  let diagnosticQueue = Promise.resolve();
  let lastRenderedRev = -1;
  let sync;

  function transportContext() {
    return {
      visibility: document.visibilityState === "hidden" ? "hidden" : "visible",
      focused: !!document.hasFocus?.(),
      online: navigator.onLine !== false,
      was_discarded: !!document.wasDiscarded,
      revision: sync?.lastRev >= 0 ? sync.lastRev : null,
      rendered_revision: lastRenderedRev >= 0 ? lastRenderedRev : null,
    };
  }
  function sendDiagnostic(eventType, phase, transport, metrics = {}) {
    if (!active || !sessionStarted) return;
    const eventId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const event = { event_id: eventId, event_type: eventType, phase, transport, ...transportContext(), ...metrics };
    diagnosticQueue = diagnosticQueue.catch(() => {}).then(async () => {
      let saved = false;
      for (const delayMs of [0, 700]) {
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
        try {
          const { error } = await sb().rpc("control2_device_transport_event", {
            p_game_id: gameId, p_device_type: deviceType, p_key: key, p_event: event,
            ...getLeaseArgs(),
          }).abortSignal(AbortSignal.timeout(4000));
          if (!error) { saved = true; break; }
        } catch { /* Diagnostic retries must never delay or block gameplay. */ }
      }
      if (!saved && !diagnosticWriteFailed) {
        diagnosticWriteFailed = true;
        console.info("[device-diagnostics] zapis diagnostyki transportu chwilowo niedostępny");
      } else if (saved) diagnosticWriteFailed = false;
    }).catch(() => {});
  }
  function noteReadStatus(result) {
    if (!sessionStarted) return;
    if (!result.ok) {
      if (readIncidentOpen) return;
      readIncidentOpen = true;
      sendDiagnostic("state_sync", "read_error", "rpc_fallback", {
        status: "FETCH_ERROR", error_class: String(result.error?.name || "Error").slice(0, 80),
        fetch_ms: result.fetchMs,
      });
    } else if (readIncidentOpen) {
      readIncidentOpen = false;
      renderIncidentOpen = false;
      sendDiagnostic("state_sync", "read_recovered", "rpc_fallback", {
        revision: Number.isSafeInteger(result.revision) ? result.revision : sync.lastRev,
        fetch_ms: result.fetchMs,
      });
    }
  }
  function noteRowProgress({ row, source, previousRev, fetchMs, renderMs, renderError }) {
    const started = row?.detail?.locks?.gameStarted === true && row?.detail?.locks?.gameEnded !== true;
    if (started && !sessionStarted) {
      sessionStarted = true;
      transportSnapshotLogged = true;
      if (directConnected) {
        sendDiagnostic("transport_state", "connected", "postgres_changes", { status: "SUBSCRIBED" });
      } else {
        directIncidentAt = performance.now();
        directIncident = {
          startedAt: directIncidentAt, firstStatus: directStatus === "IDLE" ? null : directStatus,
          transitionCount: 0, catchupCount: 0, missedRevisions: 0, maxFetchMs: 0,
          maxRenderMs: 0, startVisibility: document.visibilityState === "hidden" ? "hidden" : "visible",
          startOnline: navigator.onLine !== false,
          hiddenDurationMs: 0,
          wasDiscarded: !!document.wasDiscarded, errorClass: null,
        };
      }
    } else if (!started && sessionStarted) {
      sessionStarted = false;
      transportSnapshotLogged = false;
      directIncidentAt = null;
      directIncident = null;
      readIncidentOpen = false;
      renderIncidentOpen = false;
    }
    if (!sessionStarted) return;

    if (renderError) {
      if (!renderIncidentOpen) {
        renderIncidentOpen = true;
        sendDiagnostic("state_sync", "render_error", source === "postgres_changes" ? "postgres_changes" : "rpc_fallback", {
          revision: Number(row.rev) || null, previous_revision: previousRev >= 0 ? previousRev : null,
          fetch_ms: fetchMs, render_ms: renderMs,
          error_class: String(renderError?.name || "Error").slice(0, 80),
        });
      }
      return;
    }
    if (renderIncidentOpen) {
      renderIncidentOpen = false;
      sendDiagnostic("state_sync", "render_recovered", source === "postgres_changes" ? "postgres_changes" : "rpc_fallback", {
        revision: Number(row.rev) || null, render_ms: renderMs,
      });
    }
    lastRenderedRev = Math.max(lastRenderedRev, Number(row.rev) || 0);
    if (source !== "postgres_changes" && Number(row.rev) > previousRev && directIncident) {
      directIncident.catchupCount += 1;
      directIncident.latestRevision = Number(row.rev);
      directIncident.missedRevisions += previousRev >= 0 ? Math.max(1, Number(row.rev) - previousRev) : 0;
      directIncident.maxFetchMs = Math.max(directIncident.maxFetchMs, fetchMs || 0);
      directIncident.maxRenderMs = Math.max(directIncident.maxRenderMs, renderMs || 0);
      directIncident.lastTrigger = source;
    }
  }
  function noteDirectFailure(status, error = null) {
    directStatus = status;
    directConnected = false;
    if (directIncidentAt == null) {
      directIncidentAt = performance.now();
      directIncident = {
        startedAt: directIncidentAt, firstStatus: status, transitionCount: 1,
        catchupCount: 0, missedRevisions: 0, maxFetchMs: 0, maxRenderMs: 0,
        startVisibility: document.visibilityState === "hidden" ? "hidden" : "visible",
        startOnline: navigator.onLine !== false,
        hiddenDurationMs: 0,
        wasDiscarded: !!document.wasDiscarded,
        errorClass: error ? String(error.name || "Error").slice(0, 80) : null,
      };
    } else if (directIncident) {
      directIncident.transitionCount += 1;
      if (!directIncident.errorClass && error) directIncident.errorClass = String(error.name || "Error").slice(0, 80);
    }
  }
  // Limit czasu: zawieszone żądanie trzymało `fetching` na zawsze i wszystkie
  // kolejne dzwonki tylko zaznaczały pendingRefetch (urządzenie zostawało na
  // starym stanie). Szczegóły: game-state-sync.js.
  sync = createRowSync({
    fetchRow: () => sb().rpc("game_state_get", {
      p_game_id: gameId,
      p_device_type: deviceType,
      p_key: key,
      ...getLeaseArgs(),
    }).abortSignal(AbortSignal.timeout(8000)),
    // await onRow: control/display/js/render.js's renderSnapshot()/renderDiff() mają
    // realne animacje trwające setki ms-kilka s — kolejny odczyt nie może się
    // z nimi nakładać (dwa renderDiff() na tym samym płótnie SVG, podwójny
    // dźwięk przy odsłanianiu). Dla urządzeń bez animacji (buzzer, host)
    // onRow zwraca od razu.
    onRow: (...args) => { if (active) return onRow?.(...args); },
    onError: (...args) => { if (active) return onError?.(...args); },
    onReadStatus: noteReadStatus,
    onProgress: noteRowProgress,
    sameRevChanged,
  });
  const fetchGuarded = sync.fetchGuarded;

  function subscribeDoorbell() {
    const channel = rt(doorbellTopic(gameId));
    channel.onBroadcast("rev", (msg) => {
      const rev = msg?.payload?.rev;
      if (!directConnected && typeof rev === "number" && rev > sync.lastRev) fetchGuarded("rpc_broadcast");
    });
    for (const [event, handler] of Object.entries(onBroadcast)) {
      if (typeof handler === "function") channel.onBroadcast(event, handler);
    }
  }

  async function startDirect() {
    if (!active) return;
    const lease = getLeaseArgs();
    if (!lease?.p_connection_id || !lease?.p_epoch) return;
    try {
      const { data, error } = await sb().functions.invoke("device-realtime-token", {
        body: { game_id: gameId, device_type: deviceType, key,
          connection_id: lease.p_connection_id, epoch: lease.p_epoch },
      });
      if (error || !data?.token || !active) throw error || new Error("Brak tokenu Realtime");
      tokenAuthIncidentOpen = false;
      await sb().realtime.setAuth(data.token);
      if (!active) { try { await sb().realtime.setAuth(SUPABASE_ANON_KEY); } catch {} return; }
      directUnavailableLogged = false;
      if (directChannel) await sb().removeChannel(directChannel);
      for (const channel of directTableChannels.values()) await sb().removeChannel(channel).catch(() => {});
      directTableChannels.clear();
      directTableConnected.clear();
      const channel = sb().channel(`game-state-direct:${gameId}:${deviceType}:${lease.p_connection_id}`);
      directChannel = channel;
      channel.on("postgres_changes", {
        event: "*", schema: "public", table: "game_state", filter: `game_id=eq.${gameId}`,
      }, (payload) => {
        const row = payload?.new;
        const rev = Number(row?.rev);
        if (row && Number.isFinite(rev)) sync.applyRow({ ...row, rev }, "postgres_changes");
        else if (payload?.eventType === "DELETE") fetchGuarded("rpc_delete_recovery");
      }).subscribe((status) => {
        if (channel !== directChannel) return;
        directStatus = status;
        if (status === "SUBSCRIBED" && active) {
          const recoveredAt = directIncidentAt;
          directConnected = true;
          directIncidentAt = null;
          if (sessionStarted) {
            if (recoveredAt != null) {
              const incident = directIncident;
              const durationMs = Math.round(performance.now() - recoveredAt);
              if (incident && (durationMs >= 2000 || incident.catchupCount > 0 || incident.firstStatus === "TOKEN_ERROR")) {
                sendDiagnostic("transport_state", "recovered", "postgres_changes", {
                  status, duration_ms: durationMs, first_status: incident.firstStatus,
                  transition_count: incident.transitionCount, catchup_count: incident.catchupCount,
                  missed_revisions: incident.missedRevisions, latest_revision: incident.latestRevision || null,
                  max_fetch_ms: incident.maxFetchMs, max_render_ms: incident.maxRenderMs,
                  start_visibility: incident.startVisibility, start_online: incident.startOnline,
                  hidden_duration_ms: incident.hiddenDurationMs + (hiddenAt == null ? 0 : Math.max(0, Math.round(performance.now() - Math.max(hiddenAt, incident.startedAt)))),
                  was_discarded: incident.wasDiscarded,
                  error_class: incident.errorClass,
                });
              }
              directIncident = null;
            } else if (!transportSnapshotLogged) {
              transportSnapshotLogged = true;
              sendDiagnostic("transport_state", "connected", "postgres_changes", { status });
            }
          }
          // Close the bootstrap/subscription race, then let direct row events
          // carry subsequent state without an additional RPC per event.
          fetchGuarded("rpc_channel_recovery");
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          noteDirectFailure(status);
          if (active) fetchGuarded("rpc_channel_failure");
          console.warn(`[device-realtime] ${status}; działa transport awaryjny`);
        }
      });
      for (const [table, handler] of Object.entries(onDirectTables)) {
        if (typeof handler !== "function" || !/^[a-z_]+$/.test(table)) continue;
        const channel = sb().channel(`game-state-direct:${gameId}:${deviceType}:${lease.p_connection_id}:${table}`);
        directTableChannels.set(table, channel);
        channel.on("postgres_changes", {
          event: "*", schema: "public", table, filter: `game_id=eq.${gameId}`,
        }, (payload) => handler({ status: "CHANGE", payload }));
        channel.subscribe((status) => {
          directTableConnected.set(table, status === "SUBSCRIBED");
          handler({ status, payload: null });
        });
      }
      clearTimeout(tokenTimer);
      tokenTimer = setTimeout(() => { if (active) void startDirect(); }, 240_000);
    } catch (error) {
      // No token/config or temporary Realtime failure: RPC + doorbell + poll
      // remain active, so the current transport continues to work.
      if (active) {
        directStatus = "TOKEN_ERROR";
        if (directConnected) {
          if (!tokenAuthIncidentOpen) {
            tokenAuthIncidentOpen = true;
            sendDiagnostic("transport_state", "auth_error", "postgres_changes", {
              status: "TOKEN_ERROR", error_class: String(error?.name || "Error").slice(0, 80),
            });
          }
        } else noteDirectFailure("TOKEN_ERROR", error);
        if (!directUnavailableLogged) {
          console.info("[device-realtime] bezpośredni kanał niedostępny; działa transport awaryjny", error);
          directUnavailableLogged = true;
        }
        clearTimeout(tokenTimer);
        tokenTimer = setTimeout(() => { if (active) void startDirect(); }, 15_000);
      }
    }
  }

  async function stopDirect() {
    directConnected = false;
    clearTimeout(tokenTimer);
    tokenTimer = null;
    if (directChannel) {
      const channel = directChannel;
      directChannel = null;
      await sb().removeChannel(channel).catch(() => {});
    }
    for (const [table, channel] of directTableChannels) {
      directTableConnected.set(table, false);
      await sb().removeChannel(channel).catch(() => {});
    }
    directTableChannels.clear();
    try { await sb().realtime.setAuth(SUPABASE_ANON_KEY); } catch {}
  }

  function resync() {
    if (!active) return;
    fetchGuarded("rpc_resume");
    rt(doorbellTopic(gameId)).reset();
    subscribeDoorbell();
    void stopDirect().finally(() => { if (active) void startDirect(); });
  }

  async function start() {
    if (active) return;
    active = true;
    sync.reset();
    await fetchGuarded("rpc_bootstrap");
    if (!active) return;
    subscribeDoorbell();
    void startDirect();
    // Dzwonek wysłany między bootstrapem a dołączeniem do kanału przepada
    // (broadcast nie ma historii), a bez kolejnego zapisu urządzenie zostałoby
    // na starym stanie. Po SUBSCRIBED dociągnij stan jeszcze raz (tani no-op,
    // gdy rev się nie zmienił).
    rt(doorbellTopic(gameId)).whenReady().then((ok) => { if (ok) fetchGuarded("rpc_doorbell_ready"); }).catch(() => {});

    // Karta mogła zostać zamrożona przez przeglądarkę. Po powrocie na ekran
    // odbuduj kanał i pobierz stan, bo sam status WebSocketu może być nieaktualny.
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", resync);
    window.addEventListener("online", resync);
    // Siatka bezpieczeństwa na zgubiony dzwonek.
    if (pollMs > 0) pollTimer = setInterval(() => {
      if (active && !directConnected) fetchGuarded("rpc_poll");
    }, pollMs);
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") {
      hiddenAt = performance.now();
      return;
    }
    if (document.visibilityState !== "visible") return;
    if (hiddenAt != null && directIncident) {
      directIncident.hiddenDurationMs += Math.max(0, Math.round(performance.now() - Math.max(hiddenAt, directIncident.startedAt)));
    }
    hiddenAt = null;
    resync();
  }

  function stop() {
    if (!active) return;
    active = false;
    sessionStarted = false;
    directIncidentAt = null;
    directIncident = null;
    readIncidentOpen = false;
    renderIncidentOpen = false;
    tokenAuthIncidentOpen = false;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", resync);
    window.removeEventListener("online", resync);
    rt(doorbellTopic(gameId)).reset();
    void stopDirect();
  }

  // Dla Buzzera: game_state_buzzer_press zwraca już świeży wiersz w tej
  // samej odpowiedzi RPC, więc nie ma sensu czekać na własny dzwonek, żeby
  // zobaczyć efekt własnego kliknięcia — ale trzeba to nakarmić do tego
  // samego licznika lastRev, żeby późniejszy (spóźniony) dzwonek z niższym
  // rev nie próbował go nadpisać wstecz.
  const applyRow = sync.applyRow;

  // Wywoływane wprost po błędzie already_pressed z game_state_buzzer_press —
  // ktoś inny właśnie wygrał, więc autorytatywny wiersz już to pokazuje;
  // nie czekamy na własny dzwonek, tylko dociągamy od razu.
  function refetchNow() { return fetchGuarded(); }

    return { start, stop, applyRow, refetchNow,
    isDirectConnected() { return directConnected; },
    isDirectTableConnected(table) { return directTableConnected.get(table) === true; } };
}
