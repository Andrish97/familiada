// main/display/js/presence.js
import { sb } from "../../js/core/supabase.js";

/**
 * Presence dla DISPLAY:
 * - auth: rpc display_auth (zostaje)
 * - ping: rpc device_ping
 * - snapshot: rpc device_state_get  (po refreshu)
 * - realtime: DISPLAY_CMD
 */
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

  // zamiast upsert do live_state:
  let deviceId = localStorage.getItem("familiada:deviceId:display") || "";
  
  const ping = async () => {
    const { data, error } = await sb().rpc("public_ping", {
      p_game_id: game.id,
      p_kind: "display",
      p_key: key,
      p_device_id: deviceId,
    });
    if (!error && data?.device_id && !deviceId) {
      deviceId = data.device_id;
      localStorage.setItem("familiada:deviceId:display", deviceId);
    }
  };

  const getSnapshot = async () => {
    try {
      const { data, error } = await sb().rpc("device_state_get", {
        p_game_id: game.id,
        p_kind: "display",
        p_key: key,
      });
      if (error) throw error;
      return data || {};
    } catch (e) {
      if (debug) console.warn("[display] snapshot failed", e);
      return {};
    }
  };

  // 0) snapshot po wejściu (żeby odtworzyć ekran po refreshu)
  const snap = await getSnapshot();
  try { onSnapshot?.(snap); } catch (e) { if (debug) console.warn(e); }

  // 1) ping
  await ping();
  const pingTimer = setInterval(ping, pingMs);

  // 2) realtime commands
  const ch = sb()
    .channel(chName)
    .on("broadcast", { event: "DISPLAY_CMD" }, (msg) => {
      const line = msg?.payload?.line;
      if (!line) return;
      if (debug) console.log("[display] cmd:", line);
      try { onCommand?.(String(line)); } catch (e) { if (debug) console.warn(e); }
    })
    .subscribe();

  const stop = () => {
    try { clearInterval(pingTimer); } catch {}
    try { sb().removeChannel(ch); } catch {}
  };

  window.addEventListener("beforeunload", stop);

  window.__presence = { game, channel: chName, stop, ping, getSnapshot };
  return { game, stop };
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
