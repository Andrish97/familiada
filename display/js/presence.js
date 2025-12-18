// main/display/js/presence.js
import { sb } from "../../js/core/supabase.js";

/**
 * Display Presence / Auth / Commands
 *
 * - czyta ?id=...&key=...
 * - robi rpc display_auth(p_game_id, p_key)
 * - ping do live_state.seen_display_at (upsert) co pingMs
 * - subskrybuje kanał realtime i odbiera DISPLAY_CMD
 * - woła onCommand(line)
 *
 * Zwraca: { game, stop(), sendDebug(line) }
 */
export async function startPresence({
  // kanał realtime, domyślnie per gra
  channel = null,

  // ping do live_state
  pingMs = 5000,

  // callback na komendy z controla
  onCommand = null,

  // dodatkowe logi
  debug = false,
} = {}) {
  const { gameId, key } = parseParams();
  const game = await authDisplayOrThrow(gameId, key);

  const chName = channel || `familiada-display:${game.id}`;

  // 1) ping do bazy (seen_display_at)
  const ping = async () => {
    const now = new Date().toISOString();
    const { error } = await sb()
      .from("live_state")
      .upsert({ game_id: game.id, seen_display_at: now }, { onConflict: "game_id" });

    if (error && debug) console.warn("[display] ping failed", error);
  };

  await ping();
  const pingTimer = setInterval(ping, pingMs);

  // 2) realtime: odbiór komend DISPLAY_CMD
  const ch = sb()
    .channel(chName)
    .on("broadcast", { event: "DISPLAY_CMD" }, (msg) => {
      const line = msg?.payload?.line;
      if (!line) return;
      if (debug) console.log("[display] cmd:", line);
      try {
        onCommand?.(String(line));
      } catch (e) {
        console.warn("[display] onCommand error", e);
      }
    })
    .subscribe();

  const stop = () => {
    try { clearInterval(pingTimer); } catch {}
    try { sb().removeChannel(ch); } catch {}
  };

  window.addEventListener("beforeunload", stop);

  // debug helper (opcjonalnie)
  const sendDebug = async (line) => {
    try {
      await ch.send({
        type: "broadcast",
        event: "DISPLAY_CMD",
        payload: { line: String(line) },
      });
    } catch (e) {
      if (debug) console.warn("[display] sendDebug failed", e);
    }
  };

  // dla debug w konsoli:
  window.__presence = { game, channel: chName, ping, stop };

  return { game, stop, sendDebug };
}

/* ===== helpers ===== */

function parseParams() {
  const u = new URL(location.href);
  return {
    gameId: u.searchParams.get("id") || "",
    key: u.searchParams.get("key") || "",
  };
}

async function authDisplayOrThrow(gameId, key) {
  if (!gameId || !key) throw new Error("Brak id lub key w URL.");

  const { data, error } = await sb().rpc("display_auth", {
    p_game_id: gameId,
    p_key: key,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("Zły klucz (display) albo gra nie istnieje.");

  return row; // {id,name,kind,status}
}
