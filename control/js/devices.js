// /familiada/control/js/devices.js
import { sb } from "/familiada/js/core/supabase.js";

const ONLINE_MS = 12_000;

export async function fetchPresence(gameId) {
  const { data, error } = await sb()
    .from("device_presence")
    .select("device_type,device_id,last_seen_at")
    .eq("game_id", gameId);

  if (error) return { ok: false, rows: [], error };
  return { ok: true, rows: data || [], error: null };
}

function pickNewest(rows, t) {
  return (
    rows
      .filter((r) => String(r.device_type || "").toLowerCase() === t)
      .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at))[0] || null
  );
}

export function presenceSnapshot(rows) {
  const now = Date.now();
  const d = pickNewest(rows, "display");
  const h = pickNewest(rows, "host");
  const b = pickNewest(rows, "buzzer");

  const isOn = (row) => row?.last_seen_at && now - new Date(row.last_seen_at).getTime() < ONLINE_MS;

  return {
    display: { on: isOn(d), last: d?.last_seen_at || null },
    host: { on: isOn(h), last: h?.last_seen_at || null },
    buzzer: { on: isOn(b), last: b?.last_seen_at || null },
  };
}

export function fmtSince(ts) {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return `${s}s temu`;
}
