import { sb } from "../../js/core/supabase.js";

/**
 * Display Presence / Snapshot / Commands
 *
 * - czyta ?id=...&key=...
 * - pobiera snapshot get_public_snapshot_v2
 * - woła onSnapshot(devices) (na starcie)
 * - ping device_ping_v2 co pingMs
 * - subskrybuje DISPLAY_CMD i woła onCommand(line)
 */
export async function startPresence({
  channel = null,
  pingMs = 5000,
  onCommand = null,
  onSnapshot = null, // <<<<<< DODANE
  debug = false,
} = {}) {
  const { gameId, key } = parseParams();
  if (!gameId || !key) throw new Error("Brak id lub key w URL.");

  // 1) snapshot (żeby po refresh wrócić do stanu)
  const snap = await getSnapshotOrThrow(gameId, key);
  const game = snap?.game;
  const devices = snap?.devices || {};

  // hook do main.js
  try { onSnapshot?.(devices); } catch (e) {
    if (debug) console.warn("[display] onSnapshot error", e);
  }

  const chName = channel || `familiada-display:${game.id}`;

  // 2) ping (presence)
  const ping = async () => {
    try {
      await sb().rpc("device_ping_v2", { p_game_id: game.id, p_kind: "display", p_key: key });
    } catch (e) {
      if (debug) console.warn("[display] ping failed", e);
    }
  };

  await ping();
  const pingTimer = setInterval(ping, pingMs);

  // 3) realtime: komendy
  const ch = sb()
    .channel(chName)
    .on("broadcast", { event: "DISPLAY_CMD" }, (msg) => {
      const line = msg?.payload?.line;
      if (!line) return;
      if (debug) console.log("[display] cmd:", line);
      try { onCommand?.(String(line)); } catch (e) {
        console.warn("[display] onCommand error", e);
      }
    })
    .subscribe();

  const stop = () => {
    try { clearInterval(pingTimer); } catch {}
    try { sb().removeChannel(ch); } catch {}
  };

  window.addEventListener("beforeunload", stop);

  // debug helper
  const sendDebug = async (line) => {
    try {
      await ch.send({ type: "broadcast", event: "DISPLAY_CMD", payload: { line: String(line) } });
    } catch (e) {
      if (debug) console.warn("[display] sendDebug failed", e);
    }
  };

  window.__presence = { game, devices, channel: chName, ping, stop };
  return { game, devices, stop, sendDebug };
}

function parseParams() {
  const u = new URL(location.href);
  return { gameId: u.searchParams.get("id") || "", key: u.searchParams.get("key") || "" };
}

async function getSnapshotOrThrow(gameId, key) {
  const { data, error } = await sb().rpc("get_public_snapshot_v2", {
    p_game_id: gameId,
    p_kind: "display",
    p_key: key,
  });
  if (error) throw error;
  if (!data?.game?.id) throw new Error("Zły klucz (display) albo gra nie istnieje.");
  return data;
}
