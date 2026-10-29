// 6-cyfrowy kod urządzenia -> { ok, device_type, game_id, share_key, … } przez
// Worker (/_api/device/resolve, limit nieudanych prób; migracja 514).
// err: "not_found" | "rate_limited" | "unavailable".
export async function resolveDeviceCode(code) {
  const res = await fetch("/_api/device/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: String(code || "") }),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 429) return { ok: false, err: "rate_limited" };
  if (!data || typeof data !== "object") throw new Error(`device code: HTTP ${res.status}`);
  return data;
}
