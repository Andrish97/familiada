// Kontekst jest wspólny dla kart jednego profilu przeglądarki, ale ograniczony
// do jednej gry. Nie jest identyfikatorem komputera ani użytkownika.
function createToken() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {}
  try {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

export function getGameBrowserContextId(gameId) {
  if (!gameId) return null;
  try {
    const key = `familiada:browser-context:${gameId}`;
    let value = localStorage.getItem(key);
    if (!value) {
      value = createToken();
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    // Private modes and embedded browsers may deny storage. Report the
    // relationship as unknown instead of trying to fingerprint the device.
    return null;
  }
}

export function getDevicePresenceMeta(gameId, extra = {}) {
  let visibility = null;
  let focused = null;
  try {
    visibility = typeof document?.visibilityState === "string" ? document.visibilityState : null;
    focused = typeof document?.hasFocus === "function" ? !!document.hasFocus() : null;
  } catch {}
  return {
    ...extra,
    browser_context_id: getGameBrowserContextId(gameId),
    page_visibility: visibility,
    page_focused: focused,
  };
}

export function compareBrowserContexts(controlId, deviceId) {
  if (!controlId || !deviceId) return "unknown";
  return controlId === deviceId ? "same_profile" : "different_profile";
}
