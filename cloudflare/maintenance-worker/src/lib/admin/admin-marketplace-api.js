// src/lib/admin-marketplace-api.js -- /_admin_api/marketplace/*.
import { json, readJsonOr400 } from "../core/http.js";
import { readJson } from "./admin-auth.js";
import { supabaseRpc, summarizeSupabaseError, normalizeRpcValue } from "../core/supabase.js";

export async function handleAdminMarketplaceApi(request, env, url) {
  // GET /_admin_api/marketplace/list?status=pending|published|rejected|withdrawn
  if (url.pathname === "/_admin_api/marketplace/list") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const status = String(url.searchParams.get("status") || "pending").toLowerCase();
    const allowed = new Set(["pending", "published", "rejected", "withdrawn"]);
    if (!allowed.has(status)) return json({ ok: false, error: "Invalid status" }, 400);

    const res = await supabaseRpc(env, "market_admin_list", { p_status: status });
    if (!res.ok) {
      return json({ ok: false, error: "market_admin_list_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    }
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  // GET /_admin_api/marketplace/producer-ratings
  if (url.pathname === "/_admin_api/marketplace/producer-ratings") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const res = await supabaseRpc(env, "market_admin_producer_games", {});
    if (!res.ok) return json({ ok: false, error: "market_admin_producer_games_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  // GET /_admin_api/marketplace/game-raters?id=...
  if (url.pathname === "/_admin_api/marketplace/game-raters") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "missing_id" }, 400);
    const res = await supabaseRpc(env, "market_game_raters", { p_market_game_id: id });
    if (!res.ok) return json({ ok: false, error: "market_game_raters_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  // GET /_admin_api/marketplace/detail?id=...
  if (url.pathname === "/_admin_api/marketplace/detail") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "Missing id" }, 400);

    const res = await supabaseRpc(env, "market_admin_detail", { p_id: id });
    if (!res.ok) {
      return json({ ok: false, error: "market_admin_detail_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    }
    const row = normalizeRpcValue(res.data);
    if (!row) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, game: row });
  }

  // POST /_admin_api/marketplace/review { id, action, note }
  if (url.pathname === "/_admin_api/marketplace/review") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const body = await readJson(request);
    if (!body || !body.id || !body.action) {
      return json({ ok: false, error: "Missing id or action" }, 400);
    }
    const action = String(body.action).toLowerCase();
    if (!["approve", "reject"].includes(action)) {
      return json({ ok: false, error: "Invalid action — must be approve or reject" }, 400);
    }

    const res = await supabaseRpc(env, "market_admin_review", {
      p_id:     String(body.id),
      p_action: action,
      p_note:   String(body.note || ""),
    });
    if (!res.ok) {
      return json({ ok: false, error: "market_admin_review_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    }
    const result = normalizeRpcValue(res.data);
    if (!result?.ok) {
      return json({ ok: false, error: result?.err || "review_failed" }, 422);
    }
    return json({ ok: true });
  }

  // POST /_admin_api/marketplace/withdraw { id }
  // Wymusza status = withdrawn na opublikowanej grze
  if (url.pathname === "/_admin_api/marketplace/withdraw") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const body = await readJsonOr400(request);
    if (body instanceof Response) return body;
    const { id } = body || {};
    if (!id) return json({ ok: false, error: "missing_id" }, 400);

    console.log("[worker] marketplace withdraw id:", id);
    const result = await supabaseRpc(env, "market_admin_withdraw", { p_id: id });
    if (!result.ok || !result.data?.[0]?.ok) {
      console.error("[worker] marketplace withdraw failed:", result);
      return json({ ok: false, error: result.data?.[0]?.err || result.error || "withdraw_failed" }, 422);
    }
    return json({ ok: true });
  }

  // POST /_admin_api/marketplace/delete { id }
  // Trwale usuwa grę (kaskada czyści user_market_library)
  if (url.pathname === "/_admin_api/marketplace/delete") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const body = await readJsonOr400(request);
    if (body instanceof Response) return body;
    const { id } = body || {};
    if (!id) return json({ ok: false, error: "missing_id" }, 400);

    console.log("[worker] marketplace delete id:", id);
    const result = await supabaseRpc(env, "market_admin_delete", { p_id: id, p_force: true });
    
    // Sprawdź czy result jest poprawny i czy zwrócił oczekiwany wiersz
    const row = Array.isArray(result.data) ? result.data[0] : (result.data || {});
    const ok = result.ok && (row.ok === true);

    if (!ok) {
      console.error("[worker] marketplace delete failed. Full result:", JSON.stringify(result));
      const errDetail = row.err || result.error || (result.status ? `status_${result.status}` : "delete_failed");
      return json({ 
        ok: false, 
        error: errDetail,
        debug: { status: result.status, has_data: !!result.data, row_err: row.err } 
      }, 422);
    }
    return json({ ok: true });
  }

  return new Response("Not Found", { status: 404 });
}
