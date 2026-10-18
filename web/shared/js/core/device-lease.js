import { sb } from "./supabase.js?v=v2026-10-18T06505";
import { t } from "../../translation/translation.js?v=v2026-10-18T06505";
import { icon } from "./icons.js?v=v2026-10-18T06505";

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
  if (state === "primary") {
    overlay.hidden = true;
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
}

export function createDeviceLease({ gameId, deviceType, key, onState }) {
  let connectionId = makeConnectionId();
  let mode = "starting";
  let state = "starting";
  let epoch = null;
  let registerNext = true;
  let inFlight = false;
  let timer = null;
  let stopped = false;
  const progress = { received_rev: 0, rendered_rev: 0, started_sound_cue_seq: 0 };

  const meta = () => ({
    visibility: document.visibilityState || "unknown",
    focused: !!document.hasFocus?.(),
    ...progress,
  });

  function publish(data = {}) {
    mode = data.mode || mode;
    const previous = `${state}:${epoch}`;
    state = data.state || state;
    epoch = state === "primary" ? Number(data.epoch) : null;
    if (`${state}:${epoch}` !== previous) onState?.({ mode, state, epoch, queuePosition: data.queue_position ?? null, waitingCount: data.waiting_count ?? 0 });
  }

  async function call(name, params) {
    const { data, error } = await sb().rpc(name, params).abortSignal(AbortSignal.timeout(6500));
    if (error) throw error;
    return data;
  }

  async function heartbeat(register = false) {
    if (stopped || inFlight) return null;
    inFlight = true;
    try {
      let shouldRegister = register || registerNext || mode !== "lease";
      const params = () => ({
        p_game_id: gameId, p_device_type: deviceType, p_key: key,
        p_connection_id: connectionId, p_meta: meta(),
      });
      let data = await call(shouldRegister ? "control_device_instance_register" : "control_device_instance_heartbeat",
        shouldRegister ? params() : { ...params(), p_epoch: epoch });
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
      return data;
    } catch (error) {
      if (register || registerNext || mode !== "lease") registerNext = true;
      if (mode === "lease") {
        state = "unavailable";
        onState?.({ mode, state, epoch, queuePosition: null, waitingCount: 0, error });
      }
      return null;
    } finally { inFlight = false; }
  }

  function onVisibility() {
    void heartbeat();
  }
  function onResume() {
    void heartbeat();
  }
  function onPageShow() { void heartbeat(mode !== "lease"); }
  function onPageHide(event) {
    if (event?.persisted) return;
    stopped = true;
    clearInterval(timer);
    if (mode === "lease") {
      void call("control_device_instance_release", {
        p_game_id: gameId, p_device_type: deviceType, p_key: key,
        p_connection_id: connectionId, p_epoch: epoch,
      }).catch(() => {});
    }
  }

  async function start() {
    await heartbeat(true);
    timer = setInterval(() => void heartbeat(false), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide, { once: true });
    return { mode, state, epoch };
  }

  function stop() {
    stopped = true;
    clearInterval(timer);
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
  };
}
