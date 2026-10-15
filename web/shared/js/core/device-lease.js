import { sb } from "./supabase.js?v=v2026-10-15T20253";
import { t } from "../../translation/translation.js?v=v2026-10-15T20253";

const HEARTBEAT_MS = 3_000;
const makeConnectionId = () => globalThis.crypto?.randomUUID?.()
  || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });

export function updateDeviceLeaseOverlay(state, mode = "lease") {
  const overlay = document.getElementById("deviceLeaseOverlay");
  if (!overlay) return;
  overlay.dataset.leaseState = mode === "legacy" ? "primary" : (state || "starting");
  if (mode === "legacy" || state === "primary") {
    overlay.hidden = true;
    return;
  }
  const waiting = state === "waiting";
  const title = document.getElementById("deviceLeaseTitle");
  const text = document.getElementById("deviceLeaseText");
  if (title) title.textContent = t(waiting ? "deviceLease.waitingTitle" : "deviceLease.reconnectingTitle");
  if (text) text.textContent = t(waiting ? "deviceLease.waitingText" : "deviceLease.reconnectingText");
  overlay.hidden = false;
}

export function createDeviceLease({ gameId, deviceType, key, onState }) {
  const connectionId = makeConnectionId();
  let mode = "starting";
  let state = "starting";
  let epoch = null;
  let inFlight = false;
  let timer = null;
  let stopped = false;

  const meta = () => ({
    visibility: document.visibilityState || "unknown",
    focused: !!document.hasFocus?.(),
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
      const params = {
        p_game_id: gameId, p_device_type: deviceType, p_key: key,
        p_connection_id: connectionId, p_meta: meta(),
      };
      const data = await call(register ? "control_device_instance_register" : "control_device_instance_heartbeat",
        register ? params : { ...params, p_epoch: epoch });
      if (data?.mode === "legacy") {
        mode = "legacy";
        state = "primary";
        epoch = null;
        clearInterval(timer);
        timer = null;
        onState?.({ mode, state, epoch, queuePosition: null, waitingCount: 0 });
        return data;
      }
      publish(data || {});
      return data;
    } catch (error) {
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
    if (mode !== "legacy") timer = setInterval(() => void heartbeat(mode !== "lease"), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide, { once: true });
    return { mode, state, epoch };
  }

  function stop() {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
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
    actionArgs() { return mode === "lease" && state === "primary" ? { p_connection_id: connectionId, p_epoch: epoch } : {}; },
  };
}
