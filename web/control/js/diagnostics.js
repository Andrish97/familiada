export function createConnectivityIncidentTracker({ onIncident, recoveryMs = 10_000, now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout }) {
  let incident = null;
  let recoveryTimer = null;

  function update(missing, deviceContext = {}, wasOnline = false) {
    if (missing.length) {
      if (!incident) {
        if (!wasOnline) return;
        incident = { offlineMs: 0, currentDropAt: now(), flaps: 0, blockedActions: 0, actionTypes: new Set(), devices: new Set(), contexts: {}, recovering: false };
      } else if (incident.recovering) {
        incident.flaps += 1;
        incident.recovering = false;
        incident.currentDropAt = now();
      }
      if (recoveryTimer) {
        cancel(recoveryTimer);
        recoveryTimer = null;
      }
      missing.forEach(kind => {
        incident.devices.add(kind);
        incident.contexts[kind] = deviceContext[kind] || {};
      });
      return;
    }
    if (!incident || recoveryTimer) return;
    if (incident.currentDropAt != null) {
      incident.offlineMs += Math.max(0, now() - incident.currentDropAt);
      incident.currentDropAt = null;
    }
    incident.recovering = true;
    recoveryTimer = schedule(() => {
      recoveryTimer = null;
      if (!incident) return;
      const completed = incident;
      incident = null;
      onIncident?.({
        blocked_duration_ms: Math.round(completed.offlineMs),
        repeated_drops: completed.flaps,
        blocked_action_attempts: completed.blockedActions,
        blocked_action_types: [...completed.actionTypes],
        devices: [...completed.devices],
        device_context: completed.contexts,
      });
    }, recoveryMs);
  }

  function noteBlockedAction(action, missing) {
    if (!incident || !missing?.length) return;
    incident.blockedActions += 1;
    if (incident.actionTypes.size < 4) incident.actionTypes.add(String(action || "game"));
  }

  function flush() {
    if (!incident) return;
    if (incident.currentDropAt != null) {
      incident.offlineMs += Math.max(0, now() - incident.currentDropAt);
      incident.currentDropAt = null;
    }
    if (recoveryTimer) cancel(recoveryTimer);
    recoveryTimer = null;
    const completed = incident;
    incident = null;
    onIncident?.({
      blocked_duration_ms: Math.round(completed.offlineMs),
      repeated_drops: completed.flaps,
      blocked_action_attempts: completed.blockedActions,
      blocked_action_types: [...completed.actionTypes],
      devices: [...completed.devices],
      device_context: completed.contexts,
    });
  }

  function stop() {
    if (recoveryTimer) cancel(recoveryTimer);
    recoveryTimer = null;
    incident = null;
  }

  return { update, noteBlockedAction, flush, stop };
}
