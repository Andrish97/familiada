// src/lib/admin-api.js -- /_admin_api/* core dispatcher (auth, state, bypass, stats).
import { json } from "../core/http.js";
import { isAdminAuthorized, readJson, setAdminBypassCookieForAllDomains, clearAdminBypassCookieForAllDomains } from "./admin-auth.js";
import { clampInt } from "../core/utils.js";
import { supabaseRpc, summarizeSupabaseError } from "../core/supabase.js";
import { getState, validateState, invalidateStateCache } from "../core/state.js";
import { handleAdminMailApi } from "./admin-mail-api.js";
import { handleAdminMarketplaceApi } from "./admin-marketplace-api.js";
import { handleAdminMarketingApi } from "./admin-marketing-api.js";
import { handleAdminMessagesApi } from "./admin-messages-api.js";
import { handleAdminConfigApi } from "./admin-config-api.js";

export async function handleAdminApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/_admin_api/me") {
    const ok = await isAdminAuthorized(request);
    return new Response(ok ? "OK" : "Unauthorized", { status: ok ? 200 : 401 });
  }

  if (url.pathname === "/_admin_api/bypass") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (!env.ADMIN_BYPASS_TOKEN) {
      return new Response("Missing ADMIN_BYPASS_TOKEN", { status: 500 });
    }
    const authorized = await isAdminAuthorized(request);
    if (!authorized) return new Response("Unauthorized", { status: 401 });
    return new Response("Bypass ON", {
      headers: {
        "Set-Cookie": setAdminBypassCookieForAllDomains(env),
        "Cache-Control": "no-store"
      }
    });
  }

  if (url.pathname === "/_admin_api/bypass_off") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const authorized = await isAdminAuthorized(request);
    if (!authorized) return new Response("Unauthorized", { status: 401 });
    return new Response("Bypass OFF", {
      headers: {
        "Set-Cookie": clearAdminBypassCookieForAllDomains(),
        "Cache-Control": "no-store"
      }
    });
  }

  const authorized = await isAdminAuthorized(request);
  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (url.pathname.startsWith("/_admin_api/mail/")) {
    return handleAdminMailApi(request, env, url);
  }

  if (url.pathname === "/_admin_api/stats/detail") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const type = String(url.searchParams.get("type") || "");
    const allowed = new Set(["users", "games", "custom_settings", "gameplay", "bases", "logos", "ratings"]);
    if (!allowed.has(type)) return json({ ok: false, error: "invalid_type" }, 400);
    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 200);
    const res = await supabaseRpc(env, "get_stats_detail", { p_type: type, p_limit: limit });
    if (!res.ok) return json({ ok: false, error: "stats_detail_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  if (url.pathname === "/_admin_api/stats/polls") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const res = await supabaseRpc(env, "get_admin_poll_stats", {});
    if (!res.ok) return json({ ok: false, error: "poll_stats_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, stats: res.data || {} });
  }

  if (url.pathname === "/_admin_api/stats/polls/detail") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 200);
    const res = await supabaseRpc(env, "get_admin_poll_details", { p_limit: limit });
    if (!res.ok) return json({ ok: false, error: "poll_stats_detail_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  if (url.pathname.startsWith("/_admin_api/marketplace/")) {
    return handleAdminMarketplaceApi(request, env, url);
  }

  if (url.pathname.startsWith("/_admin_api/marketing/")) {
    return handleAdminMarketingApi(request, env, url);
  }

  if (url.pathname.startsWith("/_admin_api/messages") || url.pathname.startsWith("/_admin_api/cleanup/") || url.pathname.startsWith("/_admin_api/attachments")) {
    return handleAdminMessagesApi(request, env, url);
  }

  if (url.pathname.startsWith("/_admin_api/reports")) {
    return handleAdminMessagesApi(request, env, url);
  }

  if (url.pathname.startsWith("/_admin_api/config/")) {
    return handleAdminConfigApi(request, env, url);
  }

  if (url.pathname === "/_admin_api/state") {
    if (request.method === "GET") {
      const state = await getState(env);
      return json(state);
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      const validated = validateState(body);
      if (!validated.ok) {
        return new Response(validated.error, { status: 400 });
      }
      await env.MAINT_KV.put("state", JSON.stringify(validated.value));
      invalidateStateCache();
      return json(validated.value);
    }
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (url.pathname === "/_admin_api/off") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const next = { enabled: false, mode: "off", returnAt: null };
    await env.MAINT_KV.put("state", JSON.stringify(next));
    invalidateStateCache();
    return json(next);
  }

  return new Response("Not Found", { status: 404 });
}
