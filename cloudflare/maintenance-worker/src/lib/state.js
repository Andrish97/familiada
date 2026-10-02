// src/lib/state.js -- maintenance-mode state, cached per isolate in KV.

export const STATE_CACHE_TTL_MS = 30_000;
let _stateCache = null;
let _stateCacheAt = 0;

export function setStateCache(state) {
  _stateCache = state;
  _stateCacheAt = Date.now();
}

export async function getState(env) {
  if (_stateCache && Date.now() - _stateCacheAt < STATE_CACHE_TTL_MS) {
    return _stateCache;
  }

  const raw = await env.MAINT_KV.get("state");
  if (!raw) {
    const empty = { enabled: false, mode: "off", returnAt: null, customComments: { pl: null, en: null, uk: null }, useStandardText: true };
    setStateCache(empty);
    return empty;
  }
  try {
    const s = JSON.parse(raw);
    // minimal sanity
    if (typeof s.enabled !== "boolean") throw new Error("bad enabled");

    // Migration from old single field to object
    let comments = s.customComments || { pl: s.customComment || null, en: null, uk: null };

    const state = {
      enabled: s.enabled,
      mode: s.mode || "off",
      returnAt: s.returnAt ?? null,
      customComments: comments,
      useStandardText: s.useStandardText ?? (comments.pl || comments.en || comments.uk ? false : true)
    };
    setStateCache(state);
    return state;
  } catch {
    const empty = { enabled: false, mode: "off", returnAt: null, customComments: { pl: null, en: null, uk: null }, useStandardText: true };
    setStateCache(empty);
    return empty;
  }
}

// Force a fresh KV read on this isolate's next getState() call -- used
// after any admin write that changes the stored state (POST /state, /off).
// Extracted out of handleAdminApi() as an explicit function instead of that
// module reaching in to mutate _stateCacheAt directly.
export function invalidateStateCache() {
  _stateCacheAt = 0;
}

export function validateState(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON" };
  }
  const enabled = body.enabled;
  const mode = body.mode;
  const returnAt = body.returnAt ?? null;
  const customComments = body.customComments ?? { pl: null, en: null, uk: null };
  const useStandardText = body.useStandardText ?? (customComments.pl || customComments.en || customComments.uk ? false : true);

  if (typeof enabled !== "boolean") {
    return { ok: false, error: "Invalid enabled" };
  }

  const modes = new Set(["off", "message", "returnAt", "countdown"]);
  if (typeof mode !== "string" || !modes.has(mode)) {
    return { ok: false, error: "Invalid mode" };
  }

  if (returnAt !== null && typeof returnAt !== "string") {
    return { ok: false, error: "Invalid returnAt" };
  }

  if (typeof customComments !== "object") {
    return { ok: false, error: "Invalid customComments" };
  }

  if (typeof useStandardText !== "boolean") {
    return { ok: false, error: "Invalid useStandardText" };
  }

  return { ok: true, value: { enabled, mode, returnAt, customComments, useStandardText } };
}
