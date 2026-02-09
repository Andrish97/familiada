import { sb } from "./supabase.js";

function pickRpcRow(data, fnName) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`${fnName}: empty response`);
  return row;
}

/**
 * Per-user cooldowns (requires authenticated session).
 * DB is source of truth (cross-device).
 */
export async function cooldownGet(actionKeys = []) {
  const keys = Array.isArray(actionKeys) ? actionKeys : [];
  if (!keys.length) return new Map();

  const { data, error } = await sb().rpc("cooldown_get", { p_action_keys: keys });
  if (error) throw error;

  const map = new Map();
  (data || []).forEach((row) => {
    if (!row?.action_key || !row?.next_allowed_at) return;
    const ms = Date.parse(row.next_allowed_at);
    if (Number.isFinite(ms)) map.set(row.action_key, ms);
  });
  return map;
}

export async function cooldownReserve(actionKey, cooldownSeconds) {
  const { data, error } = await sb().rpc("cooldown_reserve", {
    p_action_key: String(actionKey),
    p_cooldown_seconds: Number(cooldownSeconds),
  });
  if (error) throw error;

  const row = pickRpcRow(data, "cooldown_reserve");
  return {
    ok: !!row?.ok,
    nextAllowedAtMs: row?.next_allowed_at ? Date.parse(row.next_allowed_at) : 0,
  };
}

/**
 * Per-email cooldowns (works for anon as well; used for reset password before login).
 * We only store a hash of the email in DB.
 */
export async function cooldownEmailGet(email, actionKeys = []) {
  const e = String(email || "").trim().toLowerCase();
  const keys = Array.isArray(actionKeys) ? actionKeys : [];
  if (!e || !keys.length) return new Map();

  const { data, error } = await sb().rpc("cooldown_email_get", {
    p_email: e,
    p_action_keys: keys,
  });
  if (error) throw error;

  const map = new Map();
  (data || []).forEach((row) => {
    if (!row?.action_key || !row?.next_allowed_at) return;
    const ms = Date.parse(row.next_allowed_at);
    if (Number.isFinite(ms)) map.set(row.action_key, ms);
  });
  return map;
}

export async function cooldownEmailReserve(email, actionKey, cooldownSeconds) {
  const e = String(email || "").trim().toLowerCase();
  const { data, error } = await sb().rpc("cooldown_email_reserve", {
    p_email: e,
    p_action_key: String(actionKey),
    p_cooldown_seconds: Number(cooldownSeconds),
  });
  if (error) throw error;

  const row = pickRpcRow(data, "cooldown_email_reserve");
  return {
    ok: !!row?.ok,
    nextAllowedAtMs: row?.next_allowed_at ? Date.parse(row.next_allowed_at) : 0,
  };
}

export async function cooldownRelease(actionKey, maxAgeSeconds = 60) {
  const { data, error } = await sb().rpc("cooldown_release", {
    p_action_key: String(actionKey),
    p_max_age_seconds: Number(maxAgeSeconds),
  });
  if (error) throw error;
  return !!data;
}

export async function cooldownEmailRelease(email, actionKey, maxAgeSeconds = 60) {
  const e = String(email || "").trim().toLowerCase();
  const { data, error } = await sb().rpc("cooldown_email_release", {
    p_email: e,
    p_action_key: String(actionKey),
    p_max_age_seconds: Number(maxAgeSeconds),
  });
  if (error) throw error;
  return !!data;
}
