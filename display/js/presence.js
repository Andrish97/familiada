import { sb } from "../../js/core/supabase.js";

export async function startPresence({
  channel = null,
  pingMs = 5000,
  onCommand = null,
  onSnapshot = null,   // <-- NOWE: callback do odtworzenia stanu
  debug = false,
} = {}) {
  const { gameId, key } = parseParams();

  // 1) snapshot = autoryzacja + restore
  const snap = await getSnapshotOrThrow(gameId, key);
  const game = snap.game;
  const devices = snap.devices;

  const chName = channel || `familiada-display:${game.id}`;

  // 2) ping przez RPC
  const ping = async () => {
    try {
      await sb().rpc("device_ping", { p_game_id: game.id, p_kind: "display", p_key: key });
    } catch (e) {
      if (debug) console.warn("[display] ping failed", e);
    }
  };

  // najpierw odtwórz stan UI
  try { onSnapshot?.(devices); } catch {}

  await ping();
  const pingTimer = setInterval(ping, pingMs);

  // 3) realtime: DISPLAY_CMD
  const ch = sb()
    .channel(chName)
    .on("broadcast", { event: "DISPLAY_CMD" }, (msg) => {
      const line = msg?.payload?.line;
      if (!line) return;
      if (debug) console.log("[display] cmd:", line);
      try { onCommand?.(String(line)); } catch (e) { console.warn("[display] onCommand error", e); }
    })
    .subscribe();

  const stop = () => {
    try { clearInterval(pingTimer); } catch {}
    try { sb().removeChannel(ch); } catch {}
  };

  window.addEventListener("beforeunload", stop);

  const sendDebug = async (line) => {
    try {
      await ch.send({ type:"broadcast", event:"DISPLAY_CMD", payload:{ line:String(line) } });
    } catch (e) {
      if (debug) console.warn("[display] sendDebug failed", e);
    }
  };

  window.__presence = { game, channel: chName, ping, stop };

  return { game, devices, stop, sendDebug };
}

function parseParams() {
  const u = new URL(location.href);
  return { gameId: u.searchParams.get("id") || "", key: u.searchParams.get("key") || "" };
}

async function getSnapshotOrThrow(gameId, key) {
  if (!gameId || !key) throw new Error("Brak id lub key w URL.");

  const { data, error } = await sb().rpc("get_device_snapshot", {
    p_game_id: gameId,
    p_kind: "display",
    p_key: key,
  });
  if (error) throw error;

  if (!data?.ok) throw new Error("Brak dostępu do display (zły key) albo gra nie istnieje.");
  return data; // {ok, game, devices}
}
