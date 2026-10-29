// Koreluje fallbacki (dzwonek, heartbeat, polling) z późniejszym odbiorem
// tej samej lub nowszej rewizji przez Postgres Changes.
export function createFallbackRevisionTracker({ now = () => globalThis.performance?.now?.() ?? Date.now(), maxPending = 32 } = {}) {
  const pending = new Map();

  function noteFallback(revision, trigger) {
    if (!Number.isSafeInteger(revision) || typeof trigger !== "string") return;
    const key = `${trigger}:${revision}`;
    pending.delete(key);
    pending.set(key, { revision, trigger, at: now() });
    while (pending.size > maxPending) pending.delete(pending.keys().next().value);
  }

  function noteDirect(revision) {
    if (!Number.isSafeInteger(revision)) return [];
    const observedAt = now();
    const matches = [];
    for (const [key, fallback] of pending) {
      if (fallback.revision > revision) continue;
      pending.delete(key);
      matches.push({
        trigger: fallback.trigger,
        fallback_revision: fallback.revision,
        direct_revision: revision,
        fallback_to_direct_ms: Math.max(0, Math.round(observedAt - fallback.at)),
      });
    }
    return matches;
  }

  function clear() { pending.clear(); }

  return { noteFallback, noteDirect, clear };
}
