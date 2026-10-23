import { sb } from "./supabase.js?v=v2026-10-23T01502";
import { t } from "../../translation/translation.js?v=v2026-10-23T01502";
import { getDevicePresenceMeta } from "./device-context.js?v=v2026-10-23T01502";
import { startTicker } from "./background-ticker.js?v=v2026-10-23T01502";
import { icon } from "./icons.js?v=v2026-10-23T01502";
import { collectDeviceInfo, createSessionLog, watchPageLifecycle } from "./session-log.js?v=v2026-10-23T01502";
import { onWakeLockChange } from "./keep-alive.js?v=v2026-10-23T01502";


const HEARTBEAT_MS = 3_000;
const makeConnectionId = () => globalThis.crypto?.randomUUID?.()
  || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });

export function updateDeviceLeaseOverlay(state) {
  const overlay = document.getElementById("deviceLeaseOverlay");
  if (!overlay) return;
  overlay.dataset.leaseState = state || "starting";
  // .blocking-overlay jest domyślnie display:none (wspólny styl nakładek),
  // więc samo zdjęcie `hidden` nie pokazuje komunikatu.
  if (state === "primary") {
    overlay.hidden = true;
    overlay.style.display = "none";
    return;
  }
  const waiting = state === "waiting";
  const iconEl = document.getElementById("deviceLeaseIcon");
  const title = document.getElementById("deviceLeaseTitle");
  const text = document.getElementById("deviceLeaseText");
  if (iconEl) iconEl.innerHTML = icon(waiting ? "hourglass" : "refresh");
  if (title) title.textContent = t(waiting ? "deviceLease.waitingTitle" : "deviceLease.reconnectingTitle");
  if (text) text.textContent = t(waiting ? "deviceLease.waitingText" : "deviceLease.reconnectingText");
  overlay.hidden = false;
  overlay.style.display = "flex";
}

export function createDeviceLease({ gameId, deviceType, key, onState, onGameRev }) {
  let connectionId = makeConnectionId();
  let mode = "starting";
  let state = "starting";
  let epoch = null;
  let registerNext = true;
  // Pierwsza rejestracja tej strony może przejąć rolę główną od karty tej
  // samej przeglądarki (migracja 423). Ponowne rejestracje — np. po
  // wybudzeniu karty — już nie, żeby dwie karty nie przerzucały się rolą.
  let firstRegistration = true;
  let inFlight = false;
  let stopped = false;
  let heartbeatAgain = false;
  let stopTicker = null;
  // Metadane strony (diagnostyka, odblokowanie dźwięku Wyświetlacza) jadą
  // tym samym heartbeatem co lease — jeden zapis, jedna transakcja w bazie.
  let extraMeta = {};
  let audioUnlockedOnServer = false;
  let lastHeartbeatOkAt = null;
  let hiddenAt = document.visibilityState === "hidden" ? Date.now() : null;
  let loggedConnection = null;
  const progress = { received_rev: 0, rendered_rev: 0, started_sound_cue_seq: 0 };

  const meta = () => ({
    ...getDevicePresenceMeta(gameId, extraMeta),
    visibility: document.visibilityState || "unknown",
    focused: !!document.hasFocus?.(),
    ...progress,
  });

  function publish(data = {}) {
    const wasPrimary = state === "primary";
    if (typeof data.audio_unlocked === "boolean") audioUnlockedOnServer = data.audio_unlocked;
    mode = data.mode || mode;
    const previous = `${state}:${epoch}`;
    state = data.state || state;
    epoch = state === "primary" ? Number(data.epoch) : null;
    if (`${state}:${epoch}` !== previous) onState?.({ mode, state, epoch, queuePosition: data.queue_position ?? null, waitingCount: data.waiting_count ?? 0 });
    if (!wasPrimary && state === "primary") logConnectionStart();
    // Heartbeat niesie bieżącą rewizję gry (migracja 424): urządzenie, które
    // zgubiło zmianę z kanału na żywo, może ją dociągnąć samo.
    const gameRev = Number(data.game_rev);
    if (state === "primary" && Number.isSafeInteger(gameRev)) onGameRev?.(gameRev);
  }

  async function call(name, params) {
    const { data, error } = await sb().rpc(name, params).abortSignal(AbortSignal.timeout(6500));
    if (error) throw error;
    return data;
  }

  // Ramki trybu testowego leżą w karcie Control: ich widoczność jest
  // widocznością Control (zapisywaną przez Control), więc tylko by ją
  // czterokrotnie dublowały w statystykach.
  const insideControlTestFrame = (() => {
    try { return window.parent !== window && window.frameElement?.dataset?.controlTestMode === "true"; }
    catch { return false; }
  })();

  // Diagnostyka sesji (migracje 468–469): zapis od chwili, gdy ta instancja
  // jest główna — także przed startem gry (krok Urządzenia).
  const log = createSessionLog({
    rpc: "control2_device_log",
    params: () => ({ p_game_id: gameId, p_device_type: deviceType, p_key: key, p_connection_id: connectionId, p_epoch: epoch }),
    canSend: () => !insideControlTestFrame && mode === "lease" && state === "primary" && Number.isFinite(epoch),
  });
  const logEvent = (event) => { if (!insideControlTestFrame) log.push(event); };

  function queuePageState(reason) {
    if (stopped) return;
    const visible = document.visibilityState === "visible";
    const event = {
      event_type: "page_state",
      reason,
      visibility: document.visibilityState || "unknown",
      focused: !!document.hasFocus?.(),
      was_discarded: !!document.wasDiscarded,
      online: navigator.onLine !== false,
    };
    // Zapis „w tle” często nie wychodzi przed zamrożeniem strony — czas
    // w tle i od ostatniego sygnału życia niesie zapis powrotu.
    if (visible && hiddenAt != null) event.hidden_duration_ms = Math.max(0, Date.now() - hiddenAt);
    if (visible && lastHeartbeatOkAt != null) event.since_heartbeat_ms = Math.max(0, Date.now() - lastHeartbeatOkAt);
    hiddenAt = visible ? null : (hiddenAt ?? Date.now());
    logEvent(event);
  }

  function logConnectionStart() {
    if (loggedConnection === connectionId) return;
    loggedConnection = connectionId;
    queuePageState("initial");
    void collectDeviceInfo().then(logEvent, () => {});
  }

  async function heartbeat(register = false) {
    if (stopped) return null;
    if (inFlight) {
      // Nowsze metadane (np. odblokowanie dźwięku) nie mogą czekać na
      // kolejny takt — wyślij je zaraz po bieżącym żądaniu.
      heartbeatAgain = true;
      return null;
    }
    inFlight = true;
    try {
      let shouldRegister = register || registerNext || mode !== "lease";
      const params = () => ({
        p_game_id: gameId, p_device_type: deviceType, p_key: key,
        p_connection_id: connectionId, p_meta: meta(),
      });
      const registerParams = () => {
        const base = params();
        return firstRegistration ? { ...base, p_meta: { ...base.p_meta, takeover: true } } : base;
      };
      let data = await call(shouldRegister ? "control_device_instance_register" : "control_device_instance_heartbeat",
        shouldRegister ? registerParams() : { ...params(), p_epoch: epoch });
      if (shouldRegister) firstRegistration = false;
      if (!shouldRegister && data?.mode === "lease" && data?.state === "expired") {
        // Another connection may have promoted while this tab was suspended.
        // An expired connection can never heartbeat back into the queue, so
        // register a fresh instance instead of leaving this tab stuck forever.
        publish(data);
        connectionId = makeConnectionId();
        registerNext = true;
        shouldRegister = true;
        data = await call("control_device_instance_register", params());
      }
      publish(data || {});
      registerNext = false;
      lastHeartbeatOkAt = Date.now();
      void log.flush();
      return data;
    } catch (error) {
      if (register || registerNext || mode !== "lease") registerNext = true;
      if (mode === "lease") {
        state = "unavailable";
        onState?.({ mode, state, epoch, queuePosition: null, waitingCount: 0, error });
      }
      return null;
    } finally {
      inFlight = false;
      if (heartbeatAgain && !stopped) {
        heartbeatAgain = false;
        void heartbeat(false);
      }
    }
  }

  function onVisibility() {
    queuePageState("visibilitychange");
    void heartbeat();
  }
  function onResume() {
    void heartbeat();
  }
  function onPageShow() { void heartbeat(mode !== "lease"); }
  function onPageHide(event) {
    if (event?.persisted) return;
    stopped = true;
    stopTicker?.();
    if (mode === "lease") {
      void call("control_device_instance_release", {
        p_game_id: gameId, p_device_type: deviceType, p_key: key,
        p_connection_id: connectionId, p_epoch: epoch,
      }).catch(() => {});
    }
  }

  let stopLifecycle = null;
  let stopWakeLock = null;
  async function start() {
    stopLifecycle = watchPageLifecycle(logEvent, { onExit: () => log.flushOnExit() });
    stopWakeLock = onWakeLockChange(({ phase, error_name: errorName }) => logEvent({ event_type: "wake_lock", phase, error_name: errorName }));
    await heartbeat(true);
    stopTicker = startTicker(() => void heartbeat(false), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide, { once: true });
    return { mode, state, epoch };
  }

  function stop() {
    stopped = true;
    stopTicker?.();
    stopLifecycle?.();
    stopWakeLock?.();
    log.stop();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onResume);
    window.removeEventListener("online", onResume);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("pagehide", onPageHide);
    if (mode === "lease") void call("control_device_instance_release", {
      p_game_id: gameId, p_device_type: deviceType, p_key: key,
      p_connection_id: connectionId, p_epoch: epoch,
    }).catch(() => {});
  }

  return {
    start, stop,
    /** Zdarzenie diagnostyki sesji (control2_device_log). */
    log: logEvent,
    get mode() { return mode; },
    get state() { return state; },
    get epoch() { return epoch; },
    get connectionId() { return connectionId; },
    setProgress({ receivedRev, renderedRev, startedSoundCueSeq } = {}) {
      if (Number.isSafeInteger(receivedRev) && receivedRev >= 0) progress.received_rev = Math.max(progress.received_rev, receivedRev);
      if (Number.isSafeInteger(renderedRev) && renderedRev >= 0) progress.rendered_rev = Math.max(progress.rendered_rev, renderedRev);
      if (Number.isSafeInteger(startedSoundCueSeq) && startedSoundCueSeq >= 0) progress.started_sound_cue_seq = Math.max(progress.started_sound_cue_seq, startedSoundCueSeq);
    },
    actionArgs() { return state === "primary" ? { p_connection_id: connectionId, p_epoch: epoch } : {}; },
    /** Zmienia metadane strony i od razu wysyła heartbeat z nimi. */
    setMeta(patch) {
      extraMeta = { ...extraMeta, ...patch };
      void heartbeat(false);
    },
    /** Czy baza ma odblokowanie dźwięku dla tej instancji (Wyświetlacz). */
    get audioUnlockedOnServer() { return state === "primary" && audioUnlockedOnServer; },
  };
}
