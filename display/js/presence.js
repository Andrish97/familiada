export const startPresence = ({ channel = "familiada-display", key = "familiada_display_alive" } = {}) => {
  const bc = ("BroadcastChannel" in window) ? new BroadcastChannel(channel) : null;

  const ping = () => {
    const payload = { type: "alive", ts: Date.now() };
    try { localStorage.setItem(key, String(payload.ts)); } catch {}
    try { bc?.postMessage(payload); } catch {}
  };

  ping();
  const t = setInterval(ping, 1500);

  window.addEventListener("beforeunload", () => clearInterval(t));

  // dla debug:
  window.__presence = { ping, stop: () => clearInterval(t), channel, key };
};
