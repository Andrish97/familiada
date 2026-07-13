// displayjs/presence.js
import { sb } from "../../js/core/supabase.js?v=v2026-07-13T08511";

export async function startPresence({
  channel = null,
  pingMs = 5000,
  onCommand = null,
  onSnapshot = null,
  debug = false,
} = {}) {
  const { gameId, key } = parseParams();
  const game = await authDisplayOrThrow(gameId, key);

  const chName = channel || `familiada-display:${game.id}`;

  const DEVICE_ID_KEY = "familiada:deviceId:display";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY) || "tv";

  const ping = async () => {
    const { data, error } = await sb().rpc("device_ping", {
      p_game_id: game.id,
      p_device_type: "display",   // "host" / "buzzer"
      p_key: key,
      p_device_id: deviceId || null,
      p_meta: {}                  // opcjonalnie
    });
    if (!error && data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem("familiada:deviceId:display", deviceId);
    }
    if (error && debug) console.warn("[display] ping failed", error);
  };

  const getSnapshot = async () => {
    try {
      const { data, error } = await sb().rpc("device_state_get", {
        p_game_id: game.id,
        p_device_type: "display",
        p_key: key,
      });
      if (error) throw error;
      return data || {};
    } catch (e) {
      if (debug) console.warn("[display] snapshot failed", e);
      return {};
    }
  };

  // snapshot na wejściu (odtwórz po refreshu)
  const snap = await getSnapshot();
  try { onSnapshot?.(snap); } catch (e) { if (debug) console.warn(e); }

  await ping();

  let pingTimer = null;
  function schedulePing() {
    clearTimeout(pingTimer);
    pingTimer = setTimeout(async () => {
      await ping();
      schedulePing();
    }, pingMs);
  }
  schedulePing();

  let ch = null;
  let reconnectTimer = null;
  let firstConnect = true;

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (ch) {
        try { sb().removeChannel(ch); } catch {}
        ch = null;
      }
      openChannel();
    }, 2000);
  }

  function openChannel() {
    ch = sb()
      .channel(chName)
      .on("broadcast", { event: "DISPLAY_CMD" }, (msg) => {
        const line = msg?.payload?.line;
        if (!line) return;
        try { onCommand?.(String(line)); } catch (e) { if (debug) console.warn(e); }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (!firstConnect) {
            getSnapshot().then(snap => {
              try { onSnapshot?.(snap); } catch (e) { if (debug) console.warn(e); }
            });
            void ping();
          }
          firstConnect = false;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          scheduleReconnect();
        }
      });
  }

  openChannel();

  const stop = () => {
    clearTimeout(pingTimer);
    clearTimeout(reconnectTimer);
    if (ch) try { sb().removeChannel(ch); } catch {}
  };

  window.addEventListener("beforeunload", stop);

  window.__presence = { game, channel: chName, stop, ping, getSnapshot };
  return { game, stop, getSnapshot };
}

function parseParams() {
  const u = new URL(location.href);
  return {
    gameId: u.searchParams.get("id") || "",
    key: u.searchParams.get("key") || "",
  };
}

async function authDisplayOrThrow(gameId, key) {
  if (!gameId || !key) throw new Error("Brak id lub key w URL.");
  const { data, error } = await sb().rpc("display_auth", { p_game_id: gameId, p_key: key });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Zły klucz (display) albo gra nie istnieje.");
  return row;
}
