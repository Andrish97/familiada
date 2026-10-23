// src/lib/admin-api.js -- /_admin_api/* core dispatcher (auth, state, bypass, stats).
import { json } from "../core/http.js";
import { isAdminAuthorized, adminWriteAllowed, readJson, setAdminBypassCookieForAllDomains, clearAdminBypassCookieForAllDomains } from "./admin-auth.js";
import { clampInt } from "../core/utils.js";
import { supabaseRpc, summarizeSupabaseError } from "../core/supabase.js";
import { getState, validateState, invalidateStateCache } from "../core/state.js";
import { handleAdminMailApi } from "./admin-mail-api.js";
import { handleAdminMarketplaceApi } from "./admin-marketplace-api.js";
import { handleAdminMarketingApi } from "./admin-marketing-api.js";
import { handleAdminMessagesApi } from "./admin-messages-api.js";
import { handleAdminConfigApi } from "./admin-config-api.js";
import { handleAdminGeneratorApi } from "./admin-generator-api.js";
import { handleAdminLeadsApi } from "./admin-leads-api.js";

export async function handleAdminApi(request, env) {
  const url = new URL(request.url);

  if (!adminWriteAllowed(request, url)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (url.pathname === "/_admin_api/me") {
    const ok = await isAdminAuthorized(request, env);
    return new Response(ok ? "OK" : "Unauthorized", { status: ok ? 200 : 401 });
  }

  if (url.pathname === "/_admin_api/bypass") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (!env.ADMIN_BYPASS_TOKEN) {
      return new Response("Missing ADMIN_BYPASS_TOKEN", { status: 500 });
    }
    const authorized = await isAdminAuthorized(request, env);
    if (!authorized) return new Response("Unauthorized", { status: 401 });
    return new Response("Bypass ON", {
      headers: {
        "Set-Cookie": await setAdminBypassCookieForAllDomains(env),
        "Cache-Control": "no-store"
      }
    });
  }

  if (url.pathname === "/_admin_api/bypass_off") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const authorized = await isAdminAuthorized(request, env);
    if (!authorized) return new Response("Unauthorized", { status: 401 });
    return new Response("Bypass OFF", {
      headers: {
        "Set-Cookie": clearAdminBypassCookieForAllDomains(),
        "Cache-Control": "no-store"
      }
    });
  }

  const authorized = await isAdminAuthorized(request, env);
  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (url.pathname.startsWith("/_admin_api/mail/")) {
    return handleAdminMailApi(request, env, url);
  }

  if (url.pathname === "/_admin_api/activity") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status:405 });
    const result = await supabaseRpc(env,"get_maintenance_activity",{});
    if (!result.ok) return json({ok:false,error:"activity_failed"},502);
    return json({ok:true,...result.data});
  }

  if (url.pathname === "/_admin_api/stats/detail") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const type = String(url.searchParams.get("type") || "");
    const allowed = new Set(["users", "games", "custom_settings", "gameplay", "bases", "logos", "ratings"]);
    if (!allowed.has(type)) return json({ ok: false, error: "invalid_type" }, 400);
    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 200);
    const res = await supabaseRpc(env, "get_stats_detail", { p_type: type, p_limit: limit });
    if (!res.ok) return json({ ok: false, error: "stats_detail_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    let rows = Array.isArray(res.data) ? res.data : [];
    if (type === "gameplay") {
      const sessionIds = rows
        .filter(row => Number(row?.control_version) === 2 && typeof row?.session_id === "string")
        .map(row => row.session_id);
      // Zdarzenia i podsumowanie sesji z jednej tabeli (migracja 468).
      const objectOf = data => data && typeof data === "object" && !Array.isArray(data) ? data : {};
      let sessionEvents = {};
      let sessionDiag = {};
      if (sessionIds.length) {
        const [logRes, diagRes] = await Promise.all([
          supabaseRpc(env, "get_control2_session_events", { p_session_ids: sessionIds }),
          supabaseRpc(env, "get_control2_session_diag", { p_session_ids: sessionIds }),
        ]);
        if (!logRes.ok) return json({ ok: false, error: "session_events_failed", details: summarizeSupabaseError(logRes) }, logRes.status || 500);
        if (!diagRes.ok) return json({ ok: false, error: "session_diag_failed", details: summarizeSupabaseError(diagRes) }, diagRes.status || 500);
        sessionEvents = objectOf(logRes.data);
        sessionDiag = objectOf(diagRes.data);
      }
      rows = rows.map(row => {
        const { session_id: sessionId, ...publicRow } = row || {};
        if (Number(publicRow.control_version) !== 2) return publicRow;
        const events = Array.isArray(sessionEvents[sessionId]) ? sessionEvents[sessionId] : [];
        const stats = publicRow.stats_detail && typeof publicRow.stats_detail === "object" ? publicRow.stats_detail : {};
        return {
          ...publicRow,
          diag: sessionDiag[sessionId] || null,
          stats_detail: { ...stats, events },
        };
      });
    }
    return json({ ok: true, rows });
  }

  // Statystyki, oceny i wykluczenia ze statystyk: tylko kluczem serwisowym
  // (funkcje w bazie bez EXECUTE dla anon/authenticated -- migracja 444).
  if (url.pathname === "/_admin_api/stats/overview") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const res = await supabaseRpc(env, "get_admin_stats", {});
    if (!res.ok) return json({ ok: false, error: "stats_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, stats: res.data || {} });
  }

  if (url.pathname === "/_admin_api/stats/retention") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const res = await supabaseRpc(env, "get_retention_stats", {});
    if (!res.ok) return json({ ok: false, error: "retention_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, stats: res.data || {} });
  }

  if (url.pathname === "/_admin_api/ratings") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const res = await supabaseRpc(env, "get_ratings_admin", {});
    if (!res.ok) return json({ ok: false, error: "ratings_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  if (url.pathname === "/_admin_api/stats/excluded") {
    if (request.method === "GET") {
      const res = await supabaseRpc(env, "stats_excluded_list", {});
      if (!res.ok) return json({ ok: false, error: "excluded_failed", details: summarizeSupabaseError(res) }, res.status || 500);
      return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      const username = String(body?.username || "").trim();
      if (!username) return json({ ok: false, error: "missing_username" }, 400);
      const res = await supabaseRpc(env, "stats_exclude_user", { p_username: username });
      if (!res.ok) return json({ ok: false, error: "exclude_failed", details: summarizeSupabaseError(res) }, res.status || 500);
      return json({ ok: true, result: res.data || {} });
    }
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (url.pathname === "/_admin_api/stats/excluded/remove") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const body = await readJson(request);
    const userId = String(body?.user_id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ ok: false, error: "invalid_user_id" }, 400);
    const res = await supabaseRpc(env, "stats_unexclude_user", { p_user_id: userId });
    if (!res.ok) return json({ ok: false, error: "unexclude_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  if (url.pathname === "/_admin_api/stats/polls") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const res = await supabaseRpc(env, "get_admin_poll_stats", {});
    if (!res.ok) return json({ ok: false, error: "poll_stats_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, stats: res.data || {} });
  }

  if (url.pathname === "/_admin_api/stats/snake") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const res = await supabaseRpc(env, "get_admin_snake_stats", {});
    if (!res.ok) return json({ ok: false, error: "snake_stats_failed", details: summarizeSupabaseError(res) }, res.status || 500);
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

  if (url.pathname.startsWith("/_admin_api/generator/")) {
    return handleAdminGeneratorApi(request, env, url);
  }

  if (url.pathname.startsWith("/_admin_api/leads/")) {
    return handleAdminLeadsApi(request, env, url);
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
