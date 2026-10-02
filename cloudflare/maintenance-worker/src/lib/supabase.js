// src/lib/supabase.js -- Supabase REST/RPC client helpers.

export function getSupabaseConfig(env) {
  const baseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceRoleKey) return null;
  return { baseUrl, serviceRoleKey };
}

export async function supabaseRequest(env, path, { method = "GET", body, headers } = {}) {
  const cfg = getSupabaseConfig(env);
  if (!cfg) {
    return { ok: false, status: 500, data: null, text: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  }

  const reqHeaders = new Headers({
    apikey: cfg.serviceRoleKey,
    Authorization: `Bearer ${cfg.serviceRoleKey}`,
    ...headers,
  });
  if (body !== undefined && !reqHeaders.has("Content-Type")) {
    reqHeaders.set("Content-Type", "application/json");
  }

  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: reqHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    const result = { ok: res.ok, status: res.status, data, text };
    if (!res.ok) {
      result.error = summarizeSupabaseError(result);
    }
    return result;
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: null,
      text: `supabase_fetch_failed:${String((err && err.message) || err || "unknown_error")}`,
    };
  }
}

export async function supabaseRpc(env, fnName, params = {}) {
  return supabaseRequest(env, `/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: params,
  });
}

export function summarizeSupabaseError(result) {
  if (!result) return "unknown_error";
  if (typeof result.data === "string") return result.data.slice(0, 400);
  if (result.data && typeof result.data === "object") {
    const msg = result.data.message || result.data.error || result.data.hint || result.data.details;
    if (msg) return String(msg).slice(0, 400);
  }
  return String(result.text || "unknown_error").slice(0, 400);
}

export function normalizeRpcValue(value) {
  if (Array.isArray(value)) {
    if (!value.length) return null;
    if (value.length === 1) return normalizeRpcValue(value[0]);
    return value;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      return normalizeRpcValue(value[keys[0]]);
    }
  }
  return value;
}

export function extractScalarNumber(value, fallback = 0) {
  const norm = normalizeRpcValue(value);
  if (typeof norm === "number" && Number.isFinite(norm)) return norm;
  if (norm && typeof norm === "object") {
    for (const v of Object.values(norm)) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  if (Array.isArray(norm)) {
    for (const item of norm) {
      const n = Number(item);
      if (Number.isFinite(n)) return n;
    }
  }
  const asNum = Number(value);
  if (Number.isFinite(asNum)) return asNum;
  return fallback;
}
