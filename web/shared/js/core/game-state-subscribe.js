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

import { sb, SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase.js?v=v2026-10-26T01354";
import { createNetworkMonitor, measureNetwork } from "./network-probe.js?v=v2026-10-26T01354";
import { rt } from "./realtime.js?v=v2026-10-26T01354";
import { doorbellTopic } from "./game-state-doorbell.js?v=v2026-10-26T01354";
import { createRowSync } from "./game-state-sync.js?v=v2026-10-26T01354";
import { createDirectReadiness, postgresSystemStatus, realtimeSocketCloseDetails, observeRealtimeSocketClose } from "./direct-channel-ready.js?v=v2026-10-26T01354";
import { createDoorbellGuard } from "./doorbell-guard.js?v=v2026-10-26T01354";
import { createFallbackRevisionTracker } from "./fallback-revision-tracker.js?v=v2026-10-26T01354";
import { createRevisionWatchdog } from "./revision-watchdog.js?v=v2026-10-26T01354";
import { createDirectRetryScheduler } from "./direct-retry-backoff.js?v=v2026-10-26T01354";

const HEARTBEAT_REV_GRACE_MS = 700;

export function createSubscription({ gameId, deviceType, key, onRow, onError, onBroadcast = {}, onDirectTables = {}, pollMs = 1500, sameRevChanged = null, getLeaseArgs = () => ({}), beforeResync = null, log = () => {} }) {
  let active = false;
  let pollTimer = null;
  let directChannel = null;
  let directConnected = false;
  const directTableChannels = new Map();
  const directTableConnected = new Map();
  let tokenTimer = null;
  const directRetry = createDirectRetryScheduler({
    run: () => { void startDirect(); },
    isActive: () => active,
    isConnected: () => directConnected,
  });
  // Po wybudzeniu telefonu sieć wraca po chwili: pierwsze pobranie tokenu
  // zwykle się nie udaje. Krótkie, rosnące odstępy skracają czas bez
  // bezpośredniego kanału z 15 s do 1–3 s.
  let tokenRetryMs = 1_000;
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
  let lastRenderedRev = -1;
  let sync;
  const fallbackRevisionTracker = createFallbackRevisionTracker();
  const revisionWatchdog = createRevisionWatchdog({
    getReceivedRev: () => sync?.receivedRev ?? -1,
    graceMs: HEARTBEAT_REV_GRACE_MS,
    onMissed: ({ latest_revision, missed_revisions }) => {
      fallbackRevisionTracker.noteFallback(latest_revision, "lease_heartbeat");
      sendDiagnostic("state_sync", "fallback_catchup", "rpc_fallback", {
        trigger: "lease_heartbeat", latest_revision, missed_revisions, grace_ms: HEARTBEAT_REV_GRACE_MS,
      });
      // Heartbeat potwierdził nowszy stan. Jeśli 700 ms później kanał nadal
      // go nie dostarczył, pobierz stan i odbuduj cichy lub stary kanał.
      if (directConnected) {
        noteDirectFailure("STALE");
        resync();
      } else void fetchGuarded("rpc_fallback");
    },
  });
  // Pomiar łącza w trakcie gry (migracja 466): tylko start, spowolnienie
  // i powrót do normy; zapis jak diagnostyka — nigdy nie blokuje gry.
  const network = createNetworkMonitor({
    probe: () => measureNetwork({
      pingUrl: `${SUPABASE_URL}/_ping`,
      rpc: (signal) => sb().rpc("control2_net_ping").abortSignal(signal),
    }),
    send: (phase, data) => {
      if (!active || !sessionStarted) return;
      log({ event_type: "network_state", source: "probe", phase, visibility: document.visibilityState === "hidden" ? "hidden" : "visible", ...data });
    },
  });

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
  // Zapis przez dziennik sesji urządzenia (session-log.js, control2_device_log).
  function sendDiagnostic(eventType, phase, transport, metrics = {}) {
    if (!active || !sessionStarted) return;
    log({ event_type: eventType, phase, transport, client_time_ms: Date.now(), ...transportContext(), ...metrics });
  }
  function noteDirectRevision(revision) {
    for (const metrics of fallbackRevisionTracker.noteDirect(revision)) {
      sendDiagnostic("state_sync", "direct_after_fallback", "postgres_changes", metrics);
    }
  }
  function noteReadStatus(result) {
    if (!sessionStarted) return;
    if (!result.ok) {
      network.probeNow();
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
  function noteRowProgress({ row, source, previousRev, fetchMs, receivedMs, renderMs, renderError }) {
    const started = row?.detail?.locks?.gameStarted === true && row?.detail?.locks?.gameEnded !== true;
    if (started && !sessionStarted) {
      sessionStarted = true;
      network.start();
      // Bez kanału na starcie stan transportu zapisze onDirectReady.
      transportSnapshotLogged = directConnected;
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
          socketClose: recentSocketClose(),
        };
      }
    } else if (!started && sessionStarted) {
      sessionStarted = false;
      network.stop();
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
    if (source !== "postgres_changes" && previousRev >= 0 && Number(row.rev) > previousRev) {
      if (directIncident) {
        directIncident.catchupCount += 1;
        directIncident.latestRevision = Number(row.rev);
        directIncident.missedRevisions += previousRev >= 0 ? Math.max(1, Number(row.rev) - previousRev) : 0;
        directIncident.maxFetchMs = Math.max(directIncident.maxFetchMs, fetchMs || 0);
        directIncident.maxRenderMs = Math.max(directIncident.maxRenderMs, renderMs || 0);
        directIncident.lastTrigger = source;
      }
      sendDiagnostic("state_sync", "fallback_applied", "rpc_fallback", {
        trigger: source, revision: Number(row.rev), previous_revision: previousRev >= 0 ? previousRev : null,
        fetch_ms: fetchMs, received_ms: receivedMs, render_ms: renderMs,
      });
    }
    if (source === "postgres_changes" && (receivedMs >= 250 || renderMs >= 500)) {
      sendDiagnostic("state_sync", "postgres_changes_slow", "postgres_changes", {
        revision: Number(row.rev), previous_revision: previousRev >= 0 ? previousRev : null,
        received_ms: receivedMs, render_ms: renderMs,
      });
    }
  }
  function noteDirectFailure(status, error = null) {
    directStatus = status;
    directConnected = false;
    // Kolejny kanał jest nową generacją transportu. Jeśli jego przerwa okaże
    // się krótsza niż próg logowania `recovered`, onDirectReady zapisze mimo
    // to świeże `connected`; nie polegaj na wpisie starego połączenia.
    transportSnapshotLogged = false;
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
        socketClose: recentSocketClose(),
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

  // Dzwonek Control jest sprawdzany także przy połączonym kanale
  // bezpośrednim (doorbell-guard.js): zgubiona przez postgres_changes zmiana
  // nie czeka już na heartbeat lease.
  const doorbell = createDoorbellGuard({
    getReceivedRev: () => sync.receivedRev,
    isDirectConnected: () => active && directConnected,
    fetchNow: () => { if (active) void fetchGuarded(directConnected ? "rpc_doorbell" : "rpc_broadcast"); },
    onMissed: (metrics) => {
      fallbackRevisionTracker.noteFallback(metrics.latest_revision, "doorbell");
      sendDiagnostic("state_sync", "fallback_catchup", "rpc_fallback", { trigger: "doorbell", ...metrics });
    },
    onStale: () => { if (!active) return; noteDirectFailure("STALE"); resync(); },
  });
  function subscribeDoorbell() {
    const channel = rt(doorbellTopic(gameId));
    channel.onBroadcast("rev", (msg) => doorbell.ring(msg?.payload?.rev));
    for (const [event, handler] of Object.entries(onBroadcast)) {
      if (typeof handler === "function") channel.onBroadcast(event, handler);
    }
  }

  // Osobny klient tylko dla kanału bezpośredniego (diagnoza 2026-10-23):
  // claims subskrypcji postgres_changes ustala token z dołączenia do kanału.
  // Na wspólnym kliencie realtime-js po dołączeniu podmieniał token urządzenia
  // na token sesji (anon), więc każde ponowne dołączenie (zerwane łącze,
  // uśpienie) szło jako anon: kanał SUBSCRIBED, a RLS odrzucał każdy wiersz.
  // Tu accessToken zawsze zwraca token urządzenia.
  let directToken = null;
  let directClient = null;
  let lastSocketClose = null;
  let ignoreCleanSocketCloseUntil = 0;
  const recentSocketClose = () => lastSocketClose && performance.now() - lastSocketClose.at <= 5_000
    ? { ...lastSocketClose.details } : {};
  // Lease, dla którego wystawiono token kanału (claims: połączenie + epoka).
  let directLeaseKey = null;
  const leaseKey = (lease) => `${lease?.p_connection_id || ""}:${lease?.p_epoch || ""}`;
  function realtimeClient() {
    if (!directClient) {
      directClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        accessToken: async () => directToken || SUPABASE_ANON_KEY,
      });
      const closeObserverAttached = observeRealtimeSocketClose(directClient.realtime, (event) => {
        // Zapisuj także zamknięcia wywołane przez klienta. Flaga pozwala je
        // odróżnić od serwerowych, zamiast po cichu wyrzucać kod 1000.
        const expected = event?.code === 1000 && event?.wasClean
          && performance.now() <= ignoreCleanSocketCloseUntil;
        const details = { ...realtimeSocketCloseDetails(event), socket_close_expected: expected };
        lastSocketClose = { at: performance.now(), details };
        // Debugger aid paired with __sbDeviceRealtime; only sanitized fields.
        globalThis.__sbDeviceRealtimeLastClose = details;
        if (directIncident) Object.assign(directIncident.socketClose, details);
        sendDiagnostic("transport_state", "socket_closed", "postgres_changes", {
          status: directStatus, ...details,
        });
      });
      globalThis.__sbDeviceRealtimeCloseObserverAttached = closeObserverAttached;
      // debug helper (jak globalThis.__sbClient w supabase.js)
      globalThis.__sbDeviceRealtime = directClient;
    }
    return directClient;
  }

  function onDirectReady() {
    if (!active) return;
    directRetry.reset();
    const recoveredAt = directIncidentAt;
    const incident = directIncident;
    const incidentMetrics = recoveredAt != null && incident ? {
      reconnect_ms: Math.max(0, Math.round(performance.now() - recoveredAt)),
      previous_status: incident.firstStatus,
      transition_count: incident.transitionCount,
      catchup_count: incident.catchupCount,
      missed_revisions: incident.missedRevisions,
      ...incident.socketClose,
    } : {};
    directConnected = true;
    directIncidentAt = null;
    if (sessionStarted) {
      if (recoveredAt != null) {
        const durationMs = incidentMetrics.reconnect_ms;
        if (incident && (durationMs >= 2000 || incident.catchupCount > 0 || incident.firstStatus === "TOKEN_ERROR")) {
          sendDiagnostic("transport_state", "recovered", "postgres_changes", {
            status: "SUBSCRIBED", duration_ms: durationMs, first_status: incident.firstStatus,
            transition_count: incident.transitionCount, catchup_count: incident.catchupCount,
            missed_revisions: incident.missedRevisions, latest_revision: incident.latestRevision || null,
            max_fetch_ms: incident.maxFetchMs, max_render_ms: incident.maxRenderMs,
            start_visibility: incident.startVisibility, start_online: incident.startOnline,
            hidden_duration_ms: incident.hiddenDurationMs + (hiddenAt == null ? 0 : Math.max(0, Math.round(performance.now() - Math.max(hiddenAt, incident.startedAt)))),
            was_discarded: incident.wasDiscarded,
            error_class: incident.errorClass,
            ...incident.socketClose,
          });
          transportSnapshotLogged = true;
        }
        directIncident = null;
      }
      // Kanał gotowy chwilę po starcie gry (krótka przerwa bez nadrabiania)
      // też musi zostawić ślad, że urządzenie jedzie na postgres_changes.
      if (!transportSnapshotLogged) {
        transportSnapshotLogged = true;
        // Krótkie zerwanie nie dostaje osobnego phase=recovered (żeby nie
        // mnożyć wpisów przy szybkiej rotacji kanału), ale wpis connected
        // musi zachować kontekst przerwy i kod zamknięcia gniazda.
        sendDiagnostic("transport_state", "connected", "postgres_changes", {
          status: "SUBSCRIBED", ...incidentMetrics,
        });
      }
    }
    // Close the bootstrap/subscription race, then let direct row events
    // carry subsequent state without an additional RPC per event.
    fetchGuarded("rpc_channel_recovery");
  }

  function scheduleDirectRetry() {
    const retryMs = directRetry.schedule();
    if (retryMs !== null) {
      sendDiagnostic("transport_state", "reconnect_scheduled", "postgres_changes", {
        status: directStatus, retry_ms: retryMs,
      });
    }
  }

  function onDirectFailure(status, error = null) {
    noteDirectFailure(status, error);
    if (active) fetchGuarded("rpc_channel_failure");
    scheduleDirectRetry();
    console.warn(`[device-realtime] ${status}; działa transport awaryjny`);
  }

  async function startDirect() {
    if (!active) return;
    directRetry.cancel();
    const lease = getLeaseArgs();
    if (!lease?.p_connection_id || !lease?.p_epoch) return;
    directLeaseKey = leaseKey(lease);
    try {
      const { data, error } = await sb().functions.invoke("device-realtime-token", {
        body: { game_id: gameId, device_type: deviceType, key,
          connection_id: lease.p_connection_id, epoch: lease.p_epoch },
      });
      if (error || !data?.token || !active) throw error || new Error("Brak tokenu Realtime");
      tokenAuthIncidentOpen = false;
      directToken = data.token;
      const client = realtimeClient();
      // Token musi być ustawiony przed subscribe(): dołączenie bez niego
      // zakłada subskrypcję z claims anon (późniejszy access_token ich nie zmienia).
      await client.realtime.setAuth();
      if (!active) { directToken = null; return; }
      directUnavailableLogged = false;
      if (directChannel || directTableChannels.size) ignoreCleanSocketCloseUntil = performance.now() + 5_000;
      if (directChannel) await client.removeChannel(directChannel);
      for (const channel of directTableChannels.values()) await client.removeChannel(channel).catch(() => {});
      directTableChannels.clear();
      directTableConnected.clear();
      const channel = client.channel(`game-state-direct:${gameId}:${deviceType}:${lease.p_connection_id}`);
      directChannel = channel;
      const readiness = createDirectReadiness(() => {
        if (channel !== directChannel) return;
        console.info("[device-realtime] kanał gotowy (SUBSCRIBED + PostgreSQL)");
        onDirectReady();
      });
      channel.on("system", {}, (payload) => {
        if (channel !== directChannel) return;
        const status = postgresSystemStatus(payload);
        console.info(`[device-realtime] system ${payload?.extension || "-"} ${payload?.status || "-"}: ${String(payload?.message || "").slice(0, 80)}`);
        readiness.postgres(status);
        if (status === "error") onDirectFailure("POSTGRES_ERROR");
      }).on("postgres_changes", {
        event: "*", schema: "public", table: "game_state", filter: `game_id=eq.${gameId}`,
      }, (payload) => {
        const row = payload?.new;
        const rev = Number(row?.rev);
        if (row && Number.isFinite(rev)) {
          doorbell.noteReceived(rev);
          noteDirectRevision(rev);
          sync.applyRow({ ...row, rev }, "postgres_changes");
          revisionWatchdog.observeReceivedRevision();
        }
        else if (payload?.eventType === "DELETE") fetchGuarded("rpc_delete_recovery");
      }).subscribe((status, error) => {
        if (channel !== directChannel) return;
        directStatus = status;
        if (status === "SUBSCRIBED" && active) {
          console.info("[device-realtime] SUBSCRIBED");
          // Ponowne dołączenie: do potwierdzenia PostgreSQL działa odpytywanie.
          if (readiness.ready) directConnected = false;
          readiness.joined();
          setTimeout(() => {
            if (channel === directChannel && active && !readiness.ready) {
              console.warn("[device-realtime] brak potwierdzenia PostgreSQL po 10 s; działa transport awaryjny");
              onDirectFailure("POSTGRES_TIMEOUT");
            }
          }, 10_000);
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          readiness.reset();
          onDirectFailure(status, error);
        }
      });
      for (const [table, handler] of Object.entries(onDirectTables)) {
        if (typeof handler !== "function" || !/^[a-z_]+$/.test(table)) continue;
        const tableChannel = client.channel(`game-state-direct:${gameId}:${deviceType}:${lease.p_connection_id}:${table}`);
        directTableChannels.set(table, tableChannel);
        const tableReadiness = createDirectReadiness(() => {
          directTableConnected.set(table, true);
          handler({ status: "SUBSCRIBED", payload: null });
        });
        tableChannel.on("system", {}, (payload) => tableReadiness.postgres(postgresSystemStatus(payload)))
          .on("postgres_changes", {
            event: "*", schema: "public", table, filter: `game_id=eq.${gameId}`,
          }, (payload) => handler({ status: "CHANGE", payload }))
          .subscribe((status) => {
            if (status === "SUBSCRIBED") { tableReadiness.joined(); return; }
            tableReadiness.reset();
            directTableConnected.set(table, false);
            handler({ status, payload: null });
          });
      }
      clearTimeout(tokenTimer);
      tokenRetryMs = 1_000;
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
        tokenTimer = setTimeout(() => { if (active) void startDirect(); }, tokenRetryMs);
        tokenRetryMs = Math.min(15_000, tokenRetryMs * 2);
      }
    }
  }

  async function stopDirect() {
    directConnected = false;
    directRetry.cancel();
    clearTimeout(tokenTimer);
    tokenTimer = null;
    const client = directClient;
    if (directChannel || directTableChannels.size) ignoreCleanSocketCloseUntil = performance.now() + 5_000;
    if (directChannel) {
      const channel = directChannel;
      directChannel = null;
      await client?.removeChannel(channel).catch(() => {});
    }
    for (const [table, channel] of directTableChannels) {
      directTableConnected.set(table, false);
      await client?.removeChannel(channel).catch(() => {});
    }
    directTableChannels.clear();
    directToken = null;
  }

  function resync() {
    if (!active) return;
    // Rewizja odebrana dopiero po odbudowie kanału nie dowodzi, że poprzedni
    // kanał dostarczył zdarzenie z opóźnieniem. Zamknij korelacje starej
    // generacji przed pobraniem RPC i ponownym SUBSCRIBE.
    fallbackRevisionTracker.clear();
    revisionWatchdog.clear();
    fetchGuarded("rpc_resume");
    rt(doorbellTopic(gameId)).reset();
    subscribeDoorbell();
    void stopDirect().finally(() => { if (active) void startDirect(); });
  }

  async function start() {
    // Ta sama karta wróciła jako główna z nową epoką (np. po uśpieniu dłuższym
    // niż lease): token kanału ma starą epokę i RLS odrzuca wiersze, więc
    // kanał trzeba odbudować od razu, zamiast czekać na nadrabianie z heartbeatu.
    if (active) {
      if (directLeaseKey && leaseKey(getLeaseArgs()) !== directLeaseKey) resync();
      return;
    }
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
    window.addEventListener("pageshow", resyncAfterLease);
    window.addEventListener("online", resyncAfterLease);
    // Siatka bezpieczeństwa na zgubiony dzwonek. Działa tylko, gdy kanał
    // bezpośredni leży — co 1,5 s, bo przy 5 s Wyświetlacz dostał START_ROUND
    // z 4,4 s opóźnieniem po CHANNEL_ERROR (test produkcyjny 2026-10-22).
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
    resyncAfterLease();
  }
  // Po powrocie karty najpierw potwierdzenie roli (lease może mieć nową
  // epokę albo przejść w oczekiwanie — wtedy właściciel subskrypcji ją
  // zatrzyma lub uruchomi od nowa), dopiero potem odczyt i kanał.
  function resyncAfterLease() {
    if (!active) return;
    if (!beforeResync) { resync(); return; }
    void Promise.resolve().then(beforeResync).catch(() => {}).then(() => { if (active) resync(); });
  }

  function stop() {
    if (!active) return;
    active = false;
    doorbell.stop();
    fallbackRevisionTracker.clear();
    revisionWatchdog.clear();
    sessionStarted = false;
    network.stop();
    directIncidentAt = null;
    directIncident = null;
    readIncidentOpen = false;
    renderIncidentOpen = false;
    tokenAuthIncidentOpen = false;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    directRetry.cancel();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", resyncAfterLease);
    window.removeEventListener("online", resyncAfterLease);
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

  // Heartbeat jest niezależnym od Realtime potwierdzeniem rewizji z serwera.
  // Po krótkim oknie na dostarczenie wiersza przez kanał watchdog nadrabia
  // stan, zamiast czekać na kolejny heartbeat.
  function noteServerRevision(revision) {
    // Gdy kanał nie jest jeszcze potwierdzony, działa poller awaryjny.
    // Watchdog ma pilnować kanału, który zgłasza gotowość, a po cichu gubi
    // zmiany — nie może ścigać się z początkowym bootstrapem/subskrypcją.
    if (active && directConnected) revisionWatchdog.noteServerRevision(revision);
  }

    return { start, stop, applyRow, refetchNow, noteServerRevision,
    isDirectConnected() { return directConnected; },
    isDirectTableConnected(table) { return directTableConnected.get(table) === true; } };
}
