// See cloudflare/README.md for full behavior and checklist.

export default {
  async email(message, env) {
    try {
      await handleInboundEmail(message, env);
    } catch (err) {
      console.error("[email] unhandled error:", err);
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.host.toLowerCase();
    // Fetch from apex origin but resolve directly to GitHub Pages to avoid recursion.
    const ORIGIN_BASE = "https://familiada.online";
    const ORIGIN_HOST = "familiada.online";
    const ORIGIN_RESOLVE = "andrish97.github.io";
    
    // PUBLIC STATE ENDPOINT (works on every host/subdomain)
    if (url.pathname === "/maintenance-state.json") {
      const state = await getState(env);
      return json(state);
    }

    // Redirect apex → www (301 permanent, SEO canonical)
    if (host === "familiada.online") {
      return Response.redirect(
        "https://www.familiada.online" + url.pathname + url.search,
        301
      );
    }

    // SETTINGS HOST (admin panel, no maintenance gate)
    if (host === "settings.familiada.online") {
      if (url.pathname.startsWith("/_admin_api")) {
        return handleAdminApi(request, env);
      }

      // Block explicit settings paths (only "/" should work)
      if (url.pathname === "/settings" || url.pathname === "/settings/" || url.pathname === "/settings.html") {
        return new Response("Not Found", { status: 404 });
      }

      // Root on settings subdomain should open settings.html
      if (url.pathname === "/" || url.pathname === "/index.html") {
        url.pathname = "/settings.html";
        return fetchFromOrigin(request, url, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
      }

      // allow settings-tools and assets only
      if (url.pathname.startsWith("/settings-tools/") || isSettingsAsset(url.pathname)) {
        const res = await fetchFromOrigin(request, url, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
        if (url.pathname.startsWith("/settings-tools/")) {
          return withHeaders(res, {
            "Content-Security-Policy": "frame-ancestors 'self'",
            "X-Frame-Options": "SAMEORIGIN",
            "Cache-Control": "no-store"
          });
        }
        if (url.pathname === "/settings.html") {
          return withHeaders(res, { "Cache-Control": "no-store" });
        }
        return res;
      }

      return new Response("Not Found", { status: 404 });
    }

    // Known service hosts (no maintenance gate here)
    if (
      host === "panel.familiada.online" ||
      host === "supabase.familiada.online" ||
      host === "api.familiada.online"
    ) {
      return fetch(request);
    }

    // Unknown subdomains: 404 when maintenance OFF, maintenance page when ON
    if (host.endsWith(".familiada.online") && !isKnownHost(host)) {
      if (isCommonAsset(url.pathname)) {
        return fetchFromOrigin(request, url, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
      }
      const state = await getState(env);
      if (!state.enabled || state.mode === "off") {
        return serveNotFoundPage(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
      }
      return serveMaintenance(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
    }

    const isBypass = hasAdminBypass(request, env);

    // Admin API should not be exposed on public hosts
    if (url.pathname.startsWith("/_admin_api")) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Public notification endpoint (rate-limited, no auth required)
    if (url.pathname === "/_api/notify-submission" && request.method === "POST") {
      return handleNotifySubmission(env);
    }

    // Public contact form endpoint
    if (url.pathname === "/_api/contact/append") {
      return handleContactAppend(request, env);
    }
    if (url.pathname === "/_api/contact" && request.method === "POST") {
      return handleContactSubmit(request, env);
    }

    // Boty zawsze dostają prawdziwą treść niezależnie od maintenance
    if (request.method === "GET" && isBot(request)) {
      if (url.pathname.startsWith("/marketplace")) {
        return serveMarketplaceSsr(request, env, url);
      }
      const p = url.pathname;
      if (p === "/" || p === "/index.html" || p.startsWith("/privacy")) {
        return fetchWith404(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
      }
    }

    // Block settings on public hosts (serve custom 404)
    if (isBlockedPath(host, url.pathname)) {
      return serveNotFoundPage(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
    }

    // GLOBAL GATE
    const state = await getState(env);

    if (!state.enabled || state.mode === "off" || isBypass) {
      return fetchWith404(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE); // brak prac
    }

    // allow access to the maintenance page and its assets
    if (isMaintenanceAsset(url.pathname)) {
      return fetchWith404(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
    }

    // block everything else
    return serveMaintenance(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
  }
};

async function getState(env) {
  const raw = await env.MAINT_KV.get("state");
  if (!raw) return { enabled: false, mode: "off", returnAt: null };
  try {
    const s = JSON.parse(raw);
    // minimal sanity
    if (typeof s.enabled !== "boolean") throw new Error("bad enabled");
    return {
      enabled: s.enabled,
      mode: s.mode || "off",
      returnAt: s.returnAt ?? null
    };
  } catch {
    return { enabled: false, mode: "off", returnAt: null };
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function serveMaintenance(request, originBase, originHost, resolveOverride) {
  const maintUrl = new URL("/maintenance", originBase);
  const res = await fetchWithOrigin(maintUrl.toString(), request, originHost, resolveOverride);

  return new Response(res.body, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "300"
    }
  });
}

async function serveNotFoundPage(request, originBase, originHost, resolveOverride) {
  const notFoundUrl = new URL("/404.html", originBase);
  const res = await fetchWithOrigin(notFoundUrl.toString(), request, originHost, resolveOverride);

  const base = new Response(res.body, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

  return withHeaders(base, {
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
    "X-Content-Type-Options": "nosniff"
  });
}

async function handleAdminApi(request, env) {
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

  if (url.pathname.startsWith("/_admin_api/marketplace/")) {
    return handleAdminMarketplaceApi(request, env, url);
  }

  if (url.pathname.startsWith("/_admin_api/messages") || url.pathname.startsWith("/_admin_api/cleanup/") || url.pathname.startsWith("/_admin_api/attachments")) {
    return handleAdminMessagesApi(request, env, url);
  }

  if (url.pathname === "/_admin_api/reports" || url.pathname === "/_admin_api/reports/status") {
    return handleAdminMessagesApi(request, env, url);
  }

  // legacy reports endpoints — kept for backwards compatibility
  if (url.pathname.startsWith("/_admin_api/reports/")) {
    return handleAdminReportsApi(request, env, url);
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
    return json(next);
  }

  return new Response("Not Found", { status: 404 });
}

const MAIL_PROVIDERS = ["sendgrid", "brevo", "mailgun"];
const DEFAULT_MAIL_SETTINGS = {
  queue_enabled: true,
  provider_order: "sendgrid,brevo,mailgun",
  delay_ms: 250,
  batch_max: 100,
  worker_limit: 25,
};

async function handleAdminMailApi(request, env, url) {
  if (url.pathname === "/_admin_api/mail/settings") {
    if (request.method === "GET") {
      const loaded = await loadMailSettings(env);
      if (!loaded.ok) return json({ ok: false, error: loaded.error || "mail_settings_load_failed" }, loaded.status || 500);

      const cron = await loadMailCronStatus(env);
      return json({
        ok: true,
        settings: loaded.settings,
        cron: cron.ok ? cron.data : { supported: false, configured: false, error: cron.error || "cron_status_failed" },
      });
    }

    if (request.method === "POST") {
      const body = await readJson(request);
      if (!body || typeof body !== "object") {
        return json({ ok: false, error: "Invalid JSON" }, 400);
      }

      const loaded = await loadMailSettings(env);
      if (!loaded.ok) return json({ ok: false, error: loaded.error || "mail_settings_load_failed" }, loaded.status || 500);
      const current = loaded.settings;

      const providerOrderArr = parseProviderOrderInput(
        body.provider_order ?? body.providerOrder ?? current.provider_order
      );
      if (!providerOrderArr.length) {
        return json({ ok: false, error: "Invalid provider_order" }, 400);
      }

      const next = {
        id: 1,
        queue_enabled:
          typeof body.queue_enabled === "boolean"
            ? body.queue_enabled
            : typeof body.queueEnabled === "boolean"
              ? body.queueEnabled
              : current.queue_enabled,
        provider_order: providerOrderArr.join(","),
        delay_ms: clampInt(
          body.delay_ms ?? body.delayMs ?? current.delay_ms,
          0,
          5000,
          current.delay_ms
        ),
        batch_max: clampInt(
          body.batch_max ?? body.batchMax ?? current.batch_max,
          1,
          500,
          current.batch_max
        ),
        worker_limit: clampInt(
          body.worker_limit ?? body.workerLimit ?? current.worker_limit,
          1,
          200,
          current.worker_limit
        ),
        updated_at: new Date().toISOString(),
      };

      const upsert = await supabaseRequest(env, "/rest/v1/mail_settings?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: [next],
      });
      if (!upsert.ok) {
        return json({ ok: false, error: "mail_settings_update_failed", details: summarizeSupabaseError(upsert) }, upsert.status || 500);
      }

      let cronResult = null;
      const hasCronSchedule = typeof body.cron_schedule === "string" || typeof body.cronSchedule === "string";
      const hasCronActive = typeof body.cron_active === "boolean" || typeof body.cronActive === "boolean";
      if (hasCronSchedule || hasCronActive) {
        const cronStatus = await loadMailCronStatus(env);
        const scheduleInput = String(body.cron_schedule ?? body.cronSchedule ?? "").trim();
        const schedule = scheduleInput || (cronStatus.ok ? String(cronStatus.data?.schedule || "") : "");
        if (!schedule) {
          return json({ ok: false, error: "Missing cron schedule" }, 400);
        }
        const active =
          typeof body.cron_active === "boolean"
            ? body.cron_active
            : typeof body.cronActive === "boolean"
              ? body.cronActive
              : Boolean(cronStatus.ok ? cronStatus.data?.active : true);
        const cronSet = await supabaseRpc(env, "mail_cron_set", {
          p_schedule: schedule,
          p_active: active,
          p_limit: next.worker_limit,
          p_job_name: "familiada_mail_worker",
        });
        if (!cronSet.ok) {
          return json({ ok: false, error: "mail_cron_set_failed", details: summarizeSupabaseError(cronSet) }, cronSet.status || 500);
        }
        cronResult = cronSet.data;
      }

      const refreshed = await loadMailSettings(env);
      const cron = await loadMailCronStatus(env);
      return json({
        ok: true,
        settings: refreshed.ok ? refreshed.settings : next,
        cron: cron.ok ? cron.data : cronResult || { supported: false, configured: false, error: "cron_status_failed" },
      });
    }

    return new Response("Method Not Allowed", { status: 405 });
  }

  // GET /_admin_api/mail/queue/item?id=xxx — full row with html
  if (url.pathname === "/_admin_api/mail/queue/item") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "Missing id" }, 400);
    const res = await supabaseRequest(env,
      `/rest/v1/mail_queue?id=eq.${encodeURIComponent(id)}&select=id,created_at,to_email,subject,html,status,provider_used,meta&limit=1`,
      { method: "GET" });
    if (!res.ok) return json({ ok: false, error: "not_found" }, 404);
    const rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, item: rows[0] });
  }

  if (url.pathname === "/_admin_api/mail/queue") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 150);
    const status = String(url.searchParams.get("status") || "all").toLowerCase();
    const allowedStatuses = new Set(["all", "pending", "sending", "failed", "sent"]);
    if (!allowedStatuses.has(status)) {
      return json({ ok: false, error: "Invalid status filter" }, 400);
    }

    let qs =
      "select=id,created_at,created_by,to_email,subject,status,not_before,attempts,last_error,provider_used,provider_order,meta,picked_at,last_attempt_at";
    qs += `&order=created_at.desc&limit=${limit}`;
    if (status !== "all") qs += `&status=eq.${encodeURIComponent(status)}`;

    const list = await supabaseRequest(env, `/rest/v1/mail_queue?${qs}`, { method: "GET" });
    if (!list.ok) {
      return json({ ok: false, error: "mail_queue_load_failed", details: summarizeSupabaseError(list) }, list.status || 500);
    }

    return json({
      ok: true,
      rows: Array.isArray(list.data) ? list.data : [],
      filter: { status, limit },
    });
  }

  if (url.pathname === "/_admin_api/mail/queue/run") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const body = await readJson(request);
    const limit = clampInt(body?.limit, 1, 200, 25);
    const requeueFailed = Boolean(body?.requeue_failed ?? body?.requeueFailed);
    const ids = Array.isArray(body?.ids)
      ? body.ids
          .map((v) => String(v || "").trim())
          .filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))
      : [];

    let requeued = 0;
    if (ids.length || requeueFailed) {
      const rq = await supabaseRpc(env, "mail_queue_requeue", {
        p_ids: ids.length ? ids : null,
        p_only_failed: !ids.length,
      });
      if (!rq.ok) {
        return json({ ok: false, error: "mail_queue_requeue_failed", details: summarizeSupabaseError(rq) }, rq.status || 500);
      }
      requeued = extractScalarNumber(rq.data, 0);
    }

    const run = ids.length
      ? await supabaseRpc(env, "invoke_mail_worker_ids", { p_ids: ids, p_limit: limit })
      : await supabaseRpc(env, "invoke_mail_worker", { p_limit: limit });
    if (!run.ok) {
      return json({ ok: false, error: "mail_worker_invoke_failed", details: summarizeSupabaseError(run) }, run.status || 500);
    }

    return json({
      ok: true,
      invoked: true,
      targeted: ids.length > 0,
      targeted_count: ids.length,
      limit,
      requeued,
    });
  }

  if (url.pathname === "/_admin_api/mail/logs") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 200);
    const fn = String(url.searchParams.get("fn") || "all").toLowerCase();
    const level = String(url.searchParams.get("level") || "all").toLowerCase();
    const fnAllowed = new Set(["all", "send-mail", "send-email", "mail-worker"]);
    const levelAllowed = new Set(["all", "debug", "info", "warn", "error"]);
    if (!fnAllowed.has(fn)) return json({ ok: false, error: "Invalid function filter" }, 400);
    if (!levelAllowed.has(level)) return json({ ok: false, error: "Invalid level filter" }, 400);

    let qs =
      "select=id,created_at,function_name,level,event,request_id,queue_id,actor_user_id,recipient_email,provider,status,error,meta";
    qs += `&order=created_at.desc&limit=${limit}`;
    if (fn !== "all") qs += `&function_name=eq.${encodeURIComponent(fn)}`;
    if (level !== "all") qs += `&level=eq.${encodeURIComponent(level)}`;

    const list = await supabaseRequest(env, `/rest/v1/mail_function_logs?${qs}`, { method: "GET" });
    if (!list.ok) {
      return json({ ok: false, error: "mail_logs_load_failed", details: summarizeSupabaseError(list) }, list.status || 500);
    }

    return json({
      ok: true,
      rows: Array.isArray(list.data) ? list.data : [],
      filter: { fn, level, limit },
    });
  }

  return new Response("Not Found", { status: 404 });
}

// ============================================================
// MARKETPLACE ADMIN API
// ============================================================

const GH_RAW_BASE = "https://raw.githubusercontent.com/Andrish97/familiada/main/marketplace";

async function handleAdminMarketplaceApi(request, env, url) {
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

  // POST /_admin_api/marketplace/sync-gh
  // Czyta marketplace/index.json z GitHub, upsertuje każdą grę producenta
  if (url.pathname === "/_admin_api/marketplace/sync-gh") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const BATCH = 20; // max ~41 subrequests: 1 index + 20 gh fetches + 20 rpc calls
    let body = {};
    try { body = await request.json(); } catch { /* no body = first batch */ }
    const offset = Number(body?.offset ?? 0);

    // 1. Pobierz index.json
    let allSlugs;
    try {
      const indexRes = await fetch(`${GH_RAW_BASE}/index.json`, { cf: { cacheEverything: false } });
      if (!indexRes.ok) {
        return json({ ok: false, error: `gh_index_fetch_failed: ${indexRes.status}` }, 502);
      }
      allSlugs = await indexRes.json();
      if (!Array.isArray(allSlugs)) {
        return json({ ok: false, error: "gh_index_invalid_format" }, 502);
      }
    } catch (err) {
      return json({ ok: false, error: `gh_index_error: ${String(err?.message || err)}` }, 502);
    }

    const total   = allSlugs.length;
    const batch   = allSlugs.slice(offset, offset + BATCH);
    const hasMore = offset + BATCH < total;
    console.log(`[worker] sync-gh offset:${offset} batch:${batch.length} total:${total}`);

    // 2. Upsert batcha
    const results = [];
    for (const slug of batch) {
      const safeSlug = String(slug || "").trim();
      if (!safeSlug) continue;

      let gameJson;
      try {
        const gameRes = await fetch(`${GH_RAW_BASE}/${safeSlug}.json`, { cf: { cacheEverything: false } });
        if (!gameRes.ok) {
          results.push({ slug: safeSlug, ok: false, error: `fetch_failed: ${gameRes.status}` });
          continue;
        }
        gameJson = await gameRes.json();
      } catch (err) {
        results.push({ slug: safeSlug, ok: false, error: `fetch_error: ${String(err?.message || err)}` });
        continue;
      }

      if (!gameJson?.meta || !gameJson?.game || !Array.isArray(gameJson?.questions)) {
        results.push({ slug: safeSlug, ok: false, error: "invalid_format" });
        continue;
      }

      const payload = { game: gameJson.game, questions: gameJson.questions };
      const upsert = await supabaseRpc(env, "market_admin_upsert_gh", {
        p_slug:        safeSlug,
        p_title:       String(gameJson.meta.title || gameJson.game.name || ""),
        p_description: String(gameJson.meta.description || ""),
        p_lang:        String(gameJson.meta.lang || "pl"),
        p_payload:     payload,
      });

      if (!upsert.ok) {
        results.push({ slug: safeSlug, ok: false, error: summarizeSupabaseError(upsert) });
        continue;
      }
      const upsertResult = normalizeRpcValue(upsert.data);
      results.push({ slug: safeSlug, ok: upsertResult?.ok ?? true, id: upsertResult?.market_id });
    }

    const failed = results.filter(r => !r.ok);
    console.log(`[worker] sync-gh batch done synced:${results.filter(r => r.ok).length} failed:${failed.length} hasMore:${hasMore}`);
    return json({
      ok: !hasMore && failed.length === 0,
      total,
      offset,
      hasMore,
      synced: results.filter(r => r.ok).length,
      failed: failed.length,
      results,
    });
  }

  // POST /_admin_api/marketplace/sync-gh-cleanup { slugs: string[] }
  // Usuwa z DB gry GH których nie ma już w aktualnym index.json
  if (url.pathname === "/_admin_api/marketplace/sync-gh-cleanup") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let body = {};
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const slugs = body?.slugs;
    if (!Array.isArray(slugs)) return json({ ok: false, error: "missing_slugs" }, 400);

    console.log("[worker] sync-gh-cleanup valid slugs:", slugs.length);
    const result = await supabaseRpc(env, "market_admin_sync_cleanup", { p_slugs: slugs });
    if (!result.ok) {
      console.error("[worker] sync-gh-cleanup failed:", result);
      return json({ ok: false, error: summarizeSupabaseError(result) }, 502);
    }
    const row = normalizeRpcValue(result.data);
    const deleted = row?.deleted ?? 0;
    const removedSlugs = row?.slugs ?? [];
    console.log("[worker] sync-gh-cleanup deleted:", deleted, removedSlugs);
    return json({ ok: true, deleted, slugs: removedSlugs });
  }

  // POST /_admin_api/marketplace/withdraw { id }
  // Wymusza status = withdrawn na opublikowanej grze
  if (url.pathname === "/_admin_api/marketplace/withdraw") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
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
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const { id } = body || {};
    if (!id) return json({ ok: false, error: "missing_id" }, 400);

    console.log("[worker] marketplace delete id:", id);
    const result = await supabaseRpc(env, "market_admin_delete", { p_id: id, p_force: true });
    if (!result.ok || !result.data?.[0]?.ok) {
      console.error("[worker] marketplace delete failed:", result);
      return json({ ok: false, error: result.data?.[0]?.err || result.error || "delete_failed" }, 422);
    }
    return json({ ok: true });
  }

  // POST /_admin_api/marketplace/notify-test — wyślij testowe powiadomienie
  if (url.pathname === "/_admin_api/marketplace/notify-test") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const topicRes = await supabaseRpc(env, "admin_config_get", { p_key: "ntfy_topic" });
    const topic = topicRes.ok ? String(normalizeRpcValue(topicRes.data) ?? "").trim() : "";
    if (!topic) return json({ ok: false, error: "ntfy_topic_not_configured" }, 422);

    return sendNtfy(topic, "Test — Familiada admin", "Powiadomienia push działają poprawnie ✅");
  }

  return new Response("Not Found", { status: 404 });
}


// ============================================================
// CONTACT FORM — PUBLIC
// ============================================================

async function handleContactSubmit(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_body" }, 400);

  const { email, subject, message, lang = "pl" } = body;

  const rpc = await supabaseRpc(env, "save_form_message", {
    p_email:   String(email   || "").trim().toLowerCase(),
    p_subject: String(subject || "").trim(),
    p_body:    String(message || "").trim(),
    p_lang:    String(lang    || "pl"),
  });

  if (!rpc.ok) {
    return json({ ok: false, error: "rpc_failed", details: summarizeSupabaseError(rpc) }, rpc.status || 500);
  }

  const row = normalizeRpcValue(rpc.data);
  if (!row?.ok) {
    const err = row?.err || "submit_failed";
    const status = err === "rate_limited_email" ? 429 : 422;
    return json({ ok: false, error: err }, status);
  }

  const ticket = row.ticket_number;
  const safeLang = ["pl","en","uk"].includes(lang) ? lang : "pl";

  // Send confirmation email
  try {
    const { subject: confirmSubject, html } = buildContactEmail({
      type: "confirmation",
      lang: safeLang,
      ticket,
      subject: String(subject || "").trim(),
      message: String(message || "").trim(),
    });

    await supabaseRequest(env, "/rest/v1/mail_queue", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        to_email: String(email || "").trim().toLowerCase(),
        subject: confirmSubject,
        html,
        from_email: "no-reply@familiada.online",
        meta: { type: "contact_confirmation", ticket },
      },
    });
  } catch (err) {
    console.error("[worker] contact: mail_queue insert failed:", err);
  }

  // Notify admin via ntfy (best-effort, rate-limited like marketplace)
  try {
    const topicRes = await supabaseRpc(env, "admin_config_get", { p_key: "ntfy_topic" });
    const topic = topicRes.ok ? String(normalizeRpcValue(topicRes.data) ?? "").trim() : "";
    if (topic) {
      const ntfyKey = "notify_contact_ts";
      const last = await env.MAINT_KV.get(ntfyKey);
      const now = Date.now();
      if (!last || now - Number(last) >= 5 * 60 * 1000) {
        await env.MAINT_KV.put(ntfyKey, String(now), { expirationTtl: 600 });
        await sendNtfy(topic, "Familiada — zgłoszenie", `Nowe zgłoszenie kontaktowe #${ticket}`);
      }
    }
  } catch (err) {
    console.error("[worker] contact: ntfy notify failed:", err);
  }

  return json({ ok: true, ticket_number: ticket });
}

async function handleContactAppend(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const { email, ticket, message, lang = "pl" } = body || {};
  if (!email || !email.includes("@")) return json({ ok: false, error: "invalid_email" }, 422);
  if (!ticket) return json({ ok: false, error: "missing_ticket" }, 422);
  if (!message || String(message).trim().length < 2) return json({ ok: false, error: "invalid_message" }, 422);

  const ticketStr = String(ticket).trim();
  const rpc = await supabaseRpc(env, "save_inbound_message", {
    p_from_email:    String(email).trim().toLowerCase(),
    p_subject:       `Re: [${ticketStr}]`,
    p_body:          String(message).trim().slice(0, 5000),
    p_body_html:     null,
    p_ticket_number: ticketStr,
  });

  if (!rpc.ok) return json({ ok: false, error: "rpc_failed" }, 500);
  const row = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0] : null;
  if (!row?.report_id) return json({ ok: false, error: "ticket_not_found" }, 404);

  return json({ ok: true, ticket_number: ticketStr });
}

// ============================================================
// CONTACT EMAIL BUILDER
// ============================================================

function buildContactEmail(opts) {
  const { type, lang = "pl", ticket, subject, message, originalMessage, replyMessage } = opts;

  const copy = {
    pl: {
      greeting: "Witaj,",
      closing: "Pozdrawiamy,\nZespół Familiada",
      confirmation: {
        body: `Dziękujemy za kontakt. Twoje zgłoszenie zostało przyjęte.\n\nNumer zgłoszenia: ${ticket || ""}\nTemat: ${subject || ""}`,
        quote: message || "",
        mailSubject: `Potwierdzenie zgłoszenia [${ticket || ""}]`,
      },
      reply: {
        quoteLabel: `Twoje zgłoszenie [${ticket || ""}]:`,
        mailSubject: `Re: [${ticket || ""}] ${subject || ""}`,
      },
      compose: {
        mailSubject: subject || "Wiadomość od Familiada",
      },
    },
    en: {
      greeting: "Hello,",
      closing: "Best regards,\nFamiliada Team",
      confirmation: {
        body: `Thank you for reaching out. Your report has been received.\n\nTicket number: ${ticket || ""}\nSubject: ${subject || ""}`,
        quote: message || "",
        mailSubject: `Report confirmation [${ticket || ""}]`,
      },
      reply: {
        quoteLabel: `Your report [${ticket || ""}]:`,
        mailSubject: `Re: [${ticket || ""}] ${subject || ""}`,
      },
      compose: {
        mailSubject: subject || "Message from Familiada",
      },
    },
    uk: {
      greeting: "Вітаємо,",
      closing: "З повагою,\nКоманда Familiada",
      confirmation: {
        body: `Дякуємо за звернення. Ваше звернення прийнято.\n\nНомер звернення: ${ticket || ""}\nТема: ${subject || ""}`,
        quote: message || "",
        mailSubject: `Підтвердження звернення [${ticket || ""}]`,
      },
      reply: {
        quoteLabel: `Ваше звернення [${ticket || ""}]:`,
        mailSubject: `Re: [${ticket || ""}] ${subject || ""}`,
      },
      compose: {
        mailSubject: subject || "Повідомлення від Familiada",
      },
    },
  };

  const safeLang = ["pl","en","uk"].includes(lang) ? lang : "pl";
  const c = copy[safeLang];
  const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const nl2br = (s) => esc(s).replace(/\n/g, "<br>");

  let mailSubject = "";
  let contentHtml = "";

  if (type === "confirmation") {
    mailSubject = c.confirmation.mailSubject;
    contentHtml = `
      <p style="margin:0 0 20px">${nl2br(c.confirmation.body)}</p>
      ${c.confirmation.quote ? `<blockquote style="margin:0 0 0 0;padding:12px 16px;border-left:3px solid rgba(255,234,166,.4);background:rgba(0,0,0,.25);border-radius:0 8px 8px 0;color:rgba(255,255,255,.7);font-size:13px;white-space:pre-wrap">${esc(c.confirmation.quote)}</blockquote>` : ""}
    `;
  } else if (type === "reply") {
    mailSubject = c.reply.mailSubject;
    contentHtml = `
      ${originalMessage ? `<blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid rgba(255,234,166,.4);background:rgba(0,0,0,.25);border-radius:0 8px 8px 0;color:rgba(255,255,255,.7);font-size:13px"><strong>${esc(c.reply.quoteLabel)}</strong><br><br><span style="white-space:pre-wrap">${esc(originalMessage)}</span></blockquote>` : ""}
      <p style="margin:0">${nl2br(replyMessage || "")}</p>
    `;
  } else {
    // compose
    mailSubject = c.compose.mailSubject;
    contentHtml = `
      ${opts.reply_as ? `<blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid rgba(255,234,166,.4);background:rgba(0,0,0,.25);border-radius:0 8px 8px 0;color:rgba(255,255,255,.7);font-size:13px;white-space:pre-wrap">${esc(opts.reply_as)}</blockquote>` : ""}
      <p style="margin:0">${nl2br(message || "")}</p>
    `;
  }

  const closingLines = c.closing.split("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <style>:root{color-scheme:dark}</style>
</head>
<body style="margin:0;padding:0;background:#050914;color:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:26px 16px;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;font-size:14px;color:#ffffff;">
  <div style="padding:14px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:18px;margin-bottom:14px;">
    <div style="font-weight:1000;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6;">FAMILIADA</div>
    <div style="margin-top:4px;font-size:11px;opacity:.7;letter-spacing:.06em;">familiada.online</div>
  </div>
  <div style="padding:22px 20px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);">
    <p style="margin:0 0 18px;font-size:14px;opacity:.9;">${esc(c.greeting)}</p>
    ${contentHtml}
    <p style="margin:24px 0 0;font-size:14px;opacity:.7;white-space:pre-line;">${closingLines.map(esc).join("<br>")}</p>
  </div>
</div>
</body>
</html>`;

  return { subject: mailSubject, html };
}

// ============================================================
// MESSAGES + REPORTS ADMIN API (new unified system)
// ============================================================

async function handleAdminMessagesApi(request, env, url) {

  // GET /_admin_api/messages?filter=inbox|sent|trash|<uuid>&limit=50&offset=0
  if (url.pathname === "/_admin_api/messages" && request.method === "GET") {
    const filter = String(url.searchParams.get("filter") || "inbox");
    const limit  = clampInt(url.searchParams.get("limit"),  1, 200, 50);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);
    const res = await supabaseRpc(env, "list_messages", { p_filter: filter, p_limit: limit, p_offset: offset });
    if (!res.ok) return json({ ok: false, error: "list_messages_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  // GET /_admin_api/messages/detail?id=<uuid>
  if (url.pathname === "/_admin_api/messages/detail" && request.method === "GET") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "missing_id" }, 400);
    const res = await supabaseRpc(env, "get_message", { p_id: id });
    if (!res.ok) return json({ ok: false, error: "get_message_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    const msg = Array.isArray(res.data) && res.data.length ? res.data[0] : normalizeRpcValue(res.data);
    if (!msg) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, message: msg });
  }

  // PUT /_admin_api/messages/assign  { message_id, report_id? }
  if (url.pathname === "/_admin_api/messages/assign" && request.method === "PUT") {
    const body = await readJson(request);
    const { message_id, report_id } = body || {};
    if (!message_id) return json({ ok: false, error: "missing_message_id" }, 400);

    let res;
    if (report_id) {
      res = await supabaseRpc(env, "assign_message_to_report", { p_message_id: message_id, p_report_id: report_id });
    } else {
      res = await supabaseRpc(env, "unassign_message_report", { p_message_id: message_id });
    }
    if (!res.ok) return json({ ok: false, error: "assign_failed", details: summarizeSupabaseError(res) }, res.status || 500);

    // If assigning: send notification email to original sender
    if (report_id) {
      try {
        const [msgRes, repRes] = await Promise.all([
          supabaseRpc(env, "get_message", { p_id: message_id }),
          supabaseRequest(env, `/rest/v1/reports?id=eq.${encodeURIComponent(report_id)}&select=ticket_number,subject,lang&limit=1`, { method: "GET" }),
        ]);
        const msgRow = Array.isArray(msgRes.data) && msgRes.data.length ? msgRes.data[0] : normalizeRpcValue(msgRes.data);
        const repRow = Array.isArray(repRes.data) && repRes.data.length ? repRes.data[0] : null;
        const toEmail = msgRow?.from_email;
        const ticket  = repRow?.ticket_number || msgRow?.ticket_number;
        if (toEmail && ticket) {
          const lang = repRow?.lang || "pl";
          const safeLang = ["pl","en","uk"].includes(lang) ? lang : "pl";
          const assignedCopy = {
            pl: `Twoja wiadomość została zarejestrowana jako zgłoszenie nr ${ticket}.\nMożesz odpowiadać na ten email aby kontynuować rozmowę.`,
            en: `Your message has been registered as ticket ${ticket}.\nYou can reply to this email to continue the conversation.`,
            uk: `Ваше повідомлення зареєстровано як звернення ${ticket}.\nВи можете відповідати на цей email для продовження розмови.`,
          };
          const subjectCopy = {
            pl: `Twoje zgłoszenie zostało zarejestrowane [${ticket}]`,
            en: `Your ticket has been registered [${ticket}]`,
            uk: `Ваше звернення зареєстровано [${ticket}]`,
          };
          const { html } = buildContactEmail({ type: "compose", lang: safeLang, ticket, subject: subjectCopy[safeLang], message: assignedCopy[safeLang] });
          await supabaseRequest(env, "/rest/v1/mail_queue", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: { to_email: toEmail, subject: subjectCopy[safeLang], html, from_email: "no-reply@familiada.online", meta: { type: "ticket_assigned", ticket } },
          });
        }
      } catch (err) {
        console.error("[worker] assign: notify failed:", err);
      }
    }

    return json({ ok: true });
  }

  // PUT /_admin_api/messages/trash  { message_id }
  if (url.pathname === "/_admin_api/messages/trash" && request.method === "PUT") {
    const body = await readJson(request);
    const { message_id } = body || {};
    if (!message_id) return json({ ok: false, error: "missing_message_id" }, 400);
    const res = await supabaseRpc(env, "trash_message", { p_message_id: message_id });
    if (!res.ok) return json({ ok: false, error: "trash_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // PUT /_admin_api/messages/restore  { message_id }
  if (url.pathname === "/_admin_api/messages/restore" && request.method === "PUT") {
    const body = await readJson(request);
    const { message_id } = body || {};
    if (!message_id) return json({ ok: false, error: "missing_message_id" }, 400);
    const res = await supabaseRpc(env, "restore_message", { p_message_id: message_id });
    if (!res.ok) return json({ ok: false, error: "restore_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // DELETE /_admin_api/messages/delete  { message_id }
  if (url.pathname === "/_admin_api/messages/delete" && request.method === "DELETE") {
    const body = await readJson(request);
    const { message_id } = body || {};
    if (!message_id) return json({ ok: false, error: "missing_message_id" }, 400);
    const res = await supabaseRpc(env, "delete_message", { p_message_id: message_id });
    if (!res.ok) return json({ ok: false, error: "delete_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // POST /_admin_api/messages/send  { to_email, subject, body, body_html?, report_id?, attachments? }
  if (url.pathname === "/_admin_api/messages/send" && request.method === "POST") {
    const body = await readJson(request);
    const { to_email, subject: msgSubject, body: msgBody, body_html, report_id, quote, attachments: sendAttachments } = body || {};
    if (!to_email || !msgBody) return json({ ok: false, error: "missing_to_email_or_body" }, 400);

    const emailHtml = body_html || buildContactEmail({ type: "compose", lang: "pl", subject: String(msgSubject || ""), message: String(msgBody), reply_as: quote || undefined }).html;

    // Insert into mail_queue first
    const queueRes = await supabaseRequest(env, "/rest/v1/mail_queue", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        to_email: String(to_email).trim().toLowerCase(),
        subject:  String(msgSubject || ""),
        html:     emailHtml,
        from_email: "kontakt@familiada.online",
        meta: { type: "admin_compose", report_id: report_id || null, attachments: sendAttachments?.map(a => ({ filename: a.filename, mime_type: a.mime_type, storage_path: a.storage_path })) || [] },
      },
    });
    const queueRow = Array.isArray(queueRes.data) && queueRes.data.length ? queueRes.data[0] : null;
    const queueId = queueRow?.id || null;

    const saveRes = await supabaseRpc(env, "save_outbound_message", {
      p_to_email:  String(to_email).trim().toLowerCase(),
      p_subject:   String(msgSubject || ""),
      p_body:      String(msgBody),
      p_body_html: emailHtml,
      p_report_id: report_id || null,
      p_queue_id:  queueId,
    });
    if (!saveRes.ok) return json({ ok: false, error: "save_outbound_failed", details: summarizeSupabaseError(saveRes) }, saveRes.status || 500);
    const messageId = normalizeRpcValue(saveRes.data);

    // Save attachments (already uploaded to storage) to message_attachments
    if (queueId && saveRes.ok && sendAttachments?.length) {
      const msgId = messageId;
      for (const att of sendAttachments) {
        try {
          // Keep compose path, save reference
          await supabaseRpc(env, "save_attachment", {
            p_message_id:  msgId,
            p_filename:    att.filename,
            p_mime_type:   att.mime_type,
            p_size:        att.size || 0,
            p_storage_path: att.storage_path,
            p_content_id:  null,
            p_inline:      false,
          });
        } catch (err) {
          console.error("[worker] send:attachment_save_failed:", att.filename, err);
        }
      }
    }

    return json({ ok: true, message_id: messageId });
  }

  // GET /_admin_api/reports?status=open|closed|all&limit=50&offset=0
  if (url.pathname === "/_admin_api/reports" && request.method === "GET") {
    const status = String(url.searchParams.get("status") || "all");
    const limit  = clampInt(url.searchParams.get("limit"),  1, 200, 50);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);
    const res = await supabaseRpc(env, "list_reports", { p_status: status, p_limit: limit, p_offset: offset });
    if (!res.ok) return json({ ok: false, error: "list_reports_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true, rows: Array.isArray(res.data) ? res.data : [] });
  }

  // POST /_admin_api/reports  { subject, lang? }
  if (url.pathname === "/_admin_api/reports" && request.method === "POST") {
    const body = await readJson(request);
    const { subject, lang } = body || {};
    const res = await supabaseRpc(env, "create_report", {
      p_subject: String(subject || ""),
      p_lang:    String(lang || "pl"),
    });
    if (!res.ok) return json({ ok: false, error: "create_report_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    const row = Array.isArray(res.data) && res.data.length ? res.data[0] : normalizeRpcValue(res.data);
    return json({ ok: true, id: row?.id, ticket_number: row?.ticket_number });
  }

  // PUT /_admin_api/reports/status  { report_id, status }
  if (url.pathname === "/_admin_api/reports/status" && request.method === "PUT") {
    const body = await readJson(request);
    const { report_id, status } = body || {};
    if (!report_id || !status) return json({ ok: false, error: "missing_report_id_or_status" }, 400);
    const res = await supabaseRpc(env, "set_report_status", { p_report_id: report_id, p_status: status });
    if (!res.ok) return json({ ok: false, error: "set_status_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    return json({ ok: true });
  }

  // POST /_admin_api/cleanup/trash
  if (url.pathname === "/_admin_api/cleanup/trash" && request.method === "POST") {
    const res = await supabaseRpc(env, "cleanup_trash", {});
    if (!res.ok) return json({ ok: false, error: "cleanup_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    const deleted = extractScalarNumber(res.data, 0);
    return json({ ok: true, deleted });
  }

  // GET /_admin_api/attachments?message_id=xxx — lista załączników wiadomości
  if (url.pathname === "/_admin_api/attachments" && request.method === "GET") {
    const messageId = String(url.searchParams.get("message_id") || "").trim();
    if (!messageId) return json({ ok: false, error: "missing_message_id" }, 400);
    const res = await supabaseRpc(env, "get_message_attachments", { p_message_id: messageId });
    if (!res.ok) return json({ ok: false, error: "get_attachments_failed" }, 500);
    return json({ ok: true, attachments: Array.isArray(res.data) ? res.data : [] });
  }

  // GET /_admin_api/attachments/download?id=xxx — pobierz załącznik
  if (url.pathname === "/_admin_api/attachments/download" && request.method === "GET") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "missing_id" }, 400);
    // fetch storage_path from DB
    const attRes = await supabaseRequest(env, `/rest/v1/message_attachments?id=eq.${encodeURIComponent(id)}&select=storage_path,filename,mime_type&limit=1`, { method: "GET" });
    if (!attRes.ok) return json({ ok: false, error: "not_found" }, 404);
    const row = Array.isArray(attRes.data) && attRes.data.length ? attRes.data[0] : null;
    if (!row) return json({ ok: false, error: "not_found" }, 404);
    const storageRes = await downloadFromStorage(env, row.storage_path);
    if (!storageRes.ok) return json({ ok: false, error: "storage_error" }, 502);
    const blob = await storageRes.arrayBuffer();
    return new Response(blob, {
      headers: {
        "Content-Type": row.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${row.filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // POST /_admin_api/attachments/upload — upload pliku (do compose)
  // multipart/form-data z polem "file"
  if (url.pathname === "/_admin_api/attachments/upload" && request.method === "POST") {
    let formData;
    try { formData = await request.formData(); } catch { return json({ ok: false, error: "invalid_form" }, 400); }
    const file = formData.get("file");
    if (!file || typeof file === "string") return json({ ok: false, error: "missing_file" }, 400);
    const filename = file.name || "upload";
    const mimeType = file.type || "application/octet-stream";
    const arrayBuf = await file.arrayBuffer();
    if (arrayBuf.byteLength > 10 * 1024 * 1024) return json({ ok: false, error: "file_too_large" }, 413);
    const bytes = new Uint8Array(arrayBuf);
    const b64 = btoa(bytes.reduce((acc, b) => acc + String.fromCharCode(b), ""));
    const tempId = crypto.randomUUID();
    const storagePath = `message-attachments/compose/${tempId}/${filename}`;
    await uploadToStorage(env, storagePath, b64, mimeType);
    return json({ ok: true, id: tempId, filename, mime_type: mimeType, storage_path: storagePath, size: arrayBuf.byteLength });
  }

  return new Response("Not Found", { status: 404 });
}

// ============================================================
// REPORTS ADMIN API (legacy — kept for backwards compatibility)
// ============================================================

async function handleAdminReportsApi(request, env, url) {

  // GET /_admin_api/reports/list?status=open&limit=50&offset=0
  if (url.pathname === "/_admin_api/reports/list") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const status = String(url.searchParams.get("status") || "open").toLowerCase();
    const allowedStatuses = new Set(["open","replied","closed","all"]);
    if (!allowedStatuses.has(status)) return json({ ok: false, error: "Invalid status" }, 400);

    const limit  = clampInt(url.searchParams.get("limit"),  1, 200, 50);
    const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);

    let qs = "select=id,ticket_number,created_at,email,subject,lang,status,replied_at";
    qs += `&order=created_at.desc&limit=${limit}&offset=${offset}`;
    if (status !== "all") qs += `&status=eq.${encodeURIComponent(status)}`;

    const list = await supabaseRequest(env, `/rest/v1/contact_reports?${qs}`, { method: "GET" });
    if (!list.ok) {
      return json({ ok: false, error: "reports_load_failed", details: summarizeSupabaseError(list) }, list.status || 500);
    }

    const rows = Array.isArray(list.data) ? list.data : [];
    return json({ ok: true, rows, total: rows.length });
  }

  // GET /_admin_api/reports/detail?id=xxx
  if (url.pathname === "/_admin_api/reports/detail") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "Missing id" }, 400);

    const res = await supabaseRequest(env, `/rest/v1/contact_reports?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { method: "GET" });
    if (!res.ok) {
      return json({ ok: false, error: "report_load_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    }

    const rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, report: rows[0] });
  }

  // POST /_admin_api/reports/reply { id, message, lang }
  if (url.pathname === "/_admin_api/reports/reply") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const { id, message, lang } = body || {};
    if (!id || !message) return json({ ok: false, error: "Missing id or message" }, 400);

    const safeLang = ["pl","en","uk"].includes(lang) ? lang : "pl";

    // Fetch report for original data
    const reportRes = await supabaseRequest(env, `/rest/v1/contact_reports?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { method: "GET" });
    const reportRow = Array.isArray(reportRes.data) && reportRes.data.length ? reportRes.data[0] : null;
    if (!reportRow) return json({ ok: false, error: "not_found" }, 404);

    const rpc = await supabaseRpc(env, "admin_update_contact_report", {
      p_id:            String(id),
      p_status:        "replied",
      p_reply_message: String(message),
    });
    if (!rpc.ok) {
      return json({ ok: false, error: "update_failed", details: summarizeSupabaseError(rpc) }, rpc.status || 500);
    }
    const result = normalizeRpcValue(rpc.data);
    if (!result?.ok) {
      return json({ ok: false, error: result?.err || "update_failed" }, 422);
    }

    // Send reply email
    try {
      const { subject: replySubject, html } = buildContactEmail({
        type: "reply",
        lang: safeLang,
        ticket: reportRow.ticket_number,
        subject: reportRow.subject,
        message: String(message),
        replyMessage: String(message),
        originalMessage: reportRow.message,
      });

      await supabaseRequest(env, "/rest/v1/mail_queue", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          to_email: reportRow.email,
          subject: replySubject,
          html,
          from_email: "kontakt@familiada.online",
          meta: { type: "contact_reply", ticket: reportRow.ticket_number, report_id: id },
        },
      });
    } catch (err) {
      console.error("[worker] reports reply: mail_queue insert failed:", err);
    }

    return json({ ok: true });
  }

  // GET /_admin_api/reports/messages?id=xxx
  if (url.pathname === "/_admin_api/reports/messages") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return json({ ok: false, error: "Missing id" }, 400);

    const rpc = await supabaseRpc(env, "get_report_messages", { p_report_id: id });
    if (!rpc.ok) return json({ ok: false, error: "messages_load_failed" }, rpc.status || 500);
    const msgs = Array.isArray(rpc.data) ? rpc.data : [];
    return json({ ok: true, messages: msgs });
  }

  // POST /_admin_api/reports/close { id }
  if (url.pathname === "/_admin_api/reports/close") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const { id } = body || {};
    if (!id) return json({ ok: false, error: "Missing id" }, 400);

    const rpc = await supabaseRpc(env, "admin_update_contact_report", {
      p_id:     String(id),
      p_status: "closed",
    });
    if (!rpc.ok) {
      return json({ ok: false, error: "update_failed", details: summarizeSupabaseError(rpc) }, rpc.status || 500);
    }
    const result = normalizeRpcValue(rpc.data);
    if (!result?.ok) {
      return json({ ok: false, error: result?.err || "update_failed" }, 422);
    }
    return json({ ok: true });
  }

  // POST /_admin_api/reports/send { to, subject, message, lang, reply_as? }
  if (url.pathname === "/_admin_api/reports/send") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const { to, subject: msgSubject, message, lang, reply_as } = body || {};
    if (!to || !message) return json({ ok: false, error: "Missing to or message" }, 400);

    const safeLang = ["pl","en","uk"].includes(lang) ? lang : "pl";

    try {
      const { subject: mailSubject, html } = buildContactEmail({
        type: "compose",
        lang: safeLang,
        ticket: null,
        subject: String(msgSubject || ""),
        message: String(message),
        reply_as: reply_as || null,
      });

      await supabaseRequest(env, "/rest/v1/mail_queue", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          to_email: String(to).trim().toLowerCase(),
          subject: mailSubject,
          html,
          from_email: "kontakt@familiada.online",
          meta: { type: "contact_compose" },
        },
      });
    } catch (err) {
      console.error("[worker] reports send: mail_queue insert failed:", err);
      return json({ ok: false, error: String(err?.message || err) }, 500);
    }

    return json({ ok: true });
  }

  // POST /_admin_api/reports/move-message { message_id, target_ticket }
  if (url.pathname === "/_admin_api/reports/move-message") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const { message_id, target_ticket } = body || {};
    if (!message_id || !target_ticket) return json({ ok: false, error: "Missing message_id or target_ticket" }, 400);

    const rpc = await supabaseRpc(env, "admin_move_message", {
      p_message_id:    String(message_id),
      p_target_ticket: String(target_ticket).trim(),
    });
    if (!rpc.ok) return json({ ok: false, error: "rpc_failed", details: summarizeSupabaseError(rpc) }, rpc.status || 500);
    const row = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0] : null;
    if (!row?.ok) return json({ ok: false, error: row?.err || "move_failed" }, 422);

    try {
      if (row.old_email && row.new_email && row.old_email !== row.new_email) {
        const { subject: s1, html: h1 } = buildContactEmail({
          type: "reply", lang: "pl", ticket: row.old_ticket, subject: "",
          replyMessage: `Twoja wiadomość została przeniesiona do zgłoszenia ${row.new_ticket}.`,
          originalMessage: null,
        });
        await supabaseRequest(env, "/rest/v1/mail_queue", {
          method: "POST", headers: { Prefer: "return=minimal" },
          body: { to_email: row.old_email, subject: s1, html: h1, from_email: "kontakt@familiada.online", meta: { type: "message_moved", from: row.old_ticket, to: row.new_ticket } },
        });
      }
    } catch (err) {
      console.error("[worker] move-message notify failed:", err);
    }

    return json({ ok: true, old_ticket: row.old_ticket, new_ticket: row.new_ticket });
  }

  return new Response("Not Found", { status: 404 });
}

// ============================================================
// INBOUND EMAIL HANDLER (Cloudflare Email Routing)
// ============================================================

async function handleInboundEmail(message, env) {
  const from    = message.from || "";
  const subject = message.headers.get("subject") || "";

  // Parse body from raw MIME stream
  let body = "";
  let bodyHtml = null;
  let inboundAttachments = [];
  try {
    const rawText = await new Response(message.raw).text();
    const parts = extractMimeParts(rawText);
    body = parts.text;
    bodyHtml = parts.html || null;
    inboundAttachments = parts.attachments || [];
  } catch (err) {
    console.error("[email] body parse failed:", err);
  }
  body = body.slice(0, 5000).trim();
  if (bodyHtml) bodyHtml = bodyHtml.slice(0, 200000);

  // Forward copy to iCloud (best-effort)
  const forwardTo = env.FORWARD_EMAIL || "";
  if (forwardTo) {
    try { await message.forward(forwardTo); } catch (err) {
      console.error("[email] forward failed:", err);
    }
  }

  // Detect ticket number in subject: [TICKET-YYYY-NNNN] or [YYYY-NNNN]
  const ticketMatch = subject.match(/\[(?:TICKET-)?(\d{4}-\d{4})\]/i);
  const ticketArg = ticketMatch ? ticketMatch[1] : null;

  if (!from || !body) return;

  const rpc = await supabaseRpc(env, "save_inbound_message", {
    p_from_email:    from,
    p_subject:       subject.slice(0, 500),
    p_body:          body || "(brak treści)",
    p_body_html:     bodyHtml,
    p_ticket_number: ticketArg,
  });

  if (rpc.ok) {
    const msgRow = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0] : null;
    const msgId = msgRow?.id;
    if (msgId && inboundAttachments.length) {
      for (const att of inboundAttachments) {
        try {
          const storagePath = `message-attachments/${msgId}/${att.filename}`;
          await uploadToStorage(env, storagePath, att.data_b64, att.mimeType);
          await supabaseRpc(env, "save_attachment", {
            p_message_id: msgId,
            p_filename:   att.filename,
            p_mime_type:  att.mimeType,
            p_size:       att.size,
            p_storage_path: storagePath,
            p_content_id: att.cid || null,
            p_inline:     att.inline,
          });
        } catch (err) {
          console.error("[email] attachment_upload_failed:", att.filename, err);
        }
      }
    }
  }

  if (!rpc.ok) {
    console.error("[email] save_inbound_message failed:", summarizeSupabaseError(rpc));
    return;
  }

  const row = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0] : normalizeRpcValue(rpc.data);
  const savedTicket = row?.ticket_number || null;

  // Notify admin via ntfy (best-effort, rate-limited)
  try {
    const topicRes = await supabaseRpc(env, "admin_config_get", { p_key: "ntfy_topic" });
    const topic = topicRes.ok ? String(normalizeRpcValue(topicRes.data) ?? "").trim() : "";
    if (topic) {
      const ntfyKey = "notify_contact_ts";
      const last = await env.MAINT_KV.get(ntfyKey);
      const now = Date.now();
      if (!last || now - Number(last) >= 5 * 60 * 1000) {
        await env.MAINT_KV.put(ntfyKey, String(now), { expirationTtl: 600 });
        const label = savedTicket ? `#${savedTicket}` : "(nowe)";
        await sendNtfy(topic, "Familiada — email", `Nowa wiadomość ${label} od ${from}`);
      }
    }
  } catch {}
}

function decodeMimePart(part, content) {
  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(part)) {
    const latin = content.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    try {
      const bytes = new Uint8Array(latin.length);
      for (let i = 0; i < latin.length; i++) bytes[i] = latin.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    } catch { return latin; }
  }
  if (/Content-Transfer-Encoding:\s*base64/i.test(part)) {
    try {
      const latin = atob(content.replace(/\s+/g, ""));
      const bytes = new Uint8Array(latin.length);
      for (let i = 0; i < latin.length; i++) bytes[i] = latin.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    } catch {}
  }
  return content;
}

function extractMimeParts(raw) {
  const boundaryMatch = raw.match(/Content-Type:\s*multipart\/[^\r\n]+boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1].trim();
    const escaped  = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rawParts = raw.split(new RegExp(`--${escaped}(?:\r?\n)`, "")).slice(1);

    let text = "";
    let html  = "";
    const cidMap  = {};      // cid → data URI (inline images)
    const attachments = [];  // { filename, mimeType, data_b64, cid, inline, size }

    for (const part of rawParts) {
      const bodyStart = part.indexOf("\r\n\r\n");
      if (bodyStart === -1) continue;
      let content = part.slice(bodyStart + 4);
      const nextBound = content.indexOf("\r\n--");
      if (nextBound !== -1) content = content.slice(0, nextBound);

      const ctMatch  = part.match(/Content-Type:\s*([^;\r\n]+)/i);
      const mimeType = ctMatch ? ctMatch[1].trim().toLowerCase() : "application/octet-stream";
      const cidMatch  = part.match(/Content-ID:\s*<([^>]+)>/i);
      const dispMatch = part.match(/Content-Disposition:\s*(attachment|inline)/i);
      const fnMatch   = part.match(/filename\*?=(?:.*?'')?["']?([^"'\r\n;]+)["']?/i);
      const isB64     = /Content-Transfer-Encoding:\s*base64/i.test(part);
      const isQP      = /Content-Transfer-Encoding:\s*quoted-printable/i.test(part);

      if (/text\/plain/i.test(mimeType) && !dispMatch && !text) {
        text = decodeMimePart(part, content).trim();
        continue;
      }
      if (/text\/html/i.test(mimeType) && !dispMatch && !html) {
        html = decodeMimePart(part, content).trim();
        continue;
      }

      // Inline image (CID) or attachment
      const isAttachment = dispMatch || cidMatch || (mimeType.startsWith("image/") && !text && !html);
      if (!isAttachment) continue;

      const b64 = isB64
        ? content.replace(/\s+/g, "")
        : btoa(String.fromCharCode(...new TextEncoder().encode(isQP ? decodeMimePart(part, content) : content)));

      const filename = fnMatch ? decodeURIComponent(fnMatch[1].trim()) : `attachment_${Date.now()}`;
      const cid      = cidMatch ? cidMatch[1] : null;
      const inline   = !!cidMatch || (dispMatch && dispMatch[1].toLowerCase() === "inline");

      if (cid) {
        cidMap[cid] = `data:${mimeType};base64,${b64}`;
      }
      // approximate size from base64 length
      const size = Math.round(b64.length * 0.75);
      attachments.push({ filename, mimeType, data_b64: b64, cid, inline, size });
    }

    // Replace CID refs in HTML
    if (html && Object.keys(cidMap).length) {
      for (const [cid, dataUri] of Object.entries(cidMap)) {
        html = html.split(`cid:${cid}`).join(dataUri);
      }
    }
    return { text, html, attachments };
  }

  // Non-multipart
  const bodyStart = raw.indexOf("\r\n\r\n");
  const content   = bodyStart !== -1 ? raw.slice(bodyStart + 4).trim() : "";
  const isHtml    = /^\s*<!doctype html|^\s*<html/i.test(content);
  return { text: isHtml ? "" : content, html: isHtml ? content : "", attachments: [] };
}

// ============================================================
// STORAGE HELPERS
// ============================================================

async function uploadToStorage(env, bucketPath, data_b64, mimeType) {
  // Supabase Storage: POST /storage/v1/object/{bucket}/{path}
  const cfg = getSupabaseConfig(env);
  if (!cfg) throw new Error("storage_upload_failed:missing_supabase_config");
  const url = `${cfg.baseUrl}/storage/v1/object/${bucketPath}`;
  // decode base64 to binary
  const binaryStr = atob(data_b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.serviceRoleKey}`,
      "Content-Type": mimeType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`storage_upload_failed:${res.status}:${err.slice(0,200)}`);
  }
  return bucketPath;
}

async function downloadFromStorage(env, bucketPath) {
  const cfg = getSupabaseConfig(env);
  if (!cfg) throw new Error("storage_download_failed:missing_supabase_config");
  const url = `${cfg.baseUrl}/storage/v1/object/${bucketPath}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${cfg.serviceRoleKey}` },
  });
  return res; // return raw Response to proxy
}

// ============================================================
// NTFY HELPER
// ============================================================

async function sendNtfy(topic, title, message, priority = 3) {
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, message, priority }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return json({ ok: false, error: `ntfy_http_${res.status}`, detail: body.slice(0, 200) });
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) });
  }
}

async function handleNotifySubmission(env) {
  // Rate limit: 1 notification per 5 minutes
  const key = "notify_submission_ts";
  const last = await env.MAINT_KV.get(key);
  const now = Date.now();
  if (last && now - Number(last) < 5 * 60 * 1000) {
    return json({ ok: true });
  }

  const topicRes = await supabaseRpc(env, "admin_config_get", { p_key: "ntfy_topic" });
  const topic = topicRes.ok ? String(normalizeRpcValue(topicRes.data) ?? "").trim() : "";
  if (!topic) return json({ ok: true });

  await env.MAINT_KV.put(key, String(now), { expirationTtl: 600 });
  return sendNtfy(topic, "Familiada — marketplace", "Nowa gra czeka na zatwierdzenie 🎮");
}


// ============================================================
// ADMIN CONFIG API
// ============================================================

async function handleAdminConfigApi(request, env, url) {

  // GET /_admin_api/config/ntfy — pobierz aktualny topic
  if (url.pathname === "/_admin_api/config/ntfy" && request.method === "GET") {
    const res = await supabaseRpc(env, "admin_config_get", { p_key: "ntfy_topic" });
    const topic = normalizeRpcValue(res.data) ?? "";
    return json({ ok: true, topic: String(topic) });
  }

  // POST /_admin_api/config/ntfy { topic } — zapisz topic
  if (url.pathname === "/_admin_api/config/ntfy" && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const topic = String(body?.topic ?? "").trim();

    const res = await supabaseRpc(env, "admin_config_set", {
      p_key:   "ntfy_topic",
      p_value: topic,
      p_note:  "ntfy.sh push notification topic",
    });
    if (!res.ok) return json({ ok: false, error: summarizeSupabaseError(res) }, 500);
    return json({ ok: true, topic });
  }

  return new Response("Not Found", { status: 404 });
}

// ============================================================
// BOT DETECTION + MARKETPLACE SSR
// ============================================================

const BOT_UA_PATTERNS = [
  "googlebot", "bingbot", "slurp", "duckduckbot", "baiduspider",
  "yandexbot", "sogou", "exabot", "facebot", "ia_archiver",
  "linkedinbot", "twitterbot", "whatsapp", "telegrambot",
  "applebot", "semrushbot", "ahrefsbot", "mj12bot",
];

function isBot(request) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  return BOT_UA_PATTERNS.some(p => ua.includes(p));
}

async function serveMarketplaceSsr(request, env, url) {
  // Pobierz opublikowane gry z Supabase (bez auth — anon key nie mamy w Workerze,
  // więc używamy service_role z RPC market_admin_list które zwraca published)
  const cfg = getSupabaseConfig(env);
  if (!cfg) {
    // Fallback: przekieruj do normalnej strony
    return fetch(request);
  }

  let games = [];
  try {
    const res = await supabaseRpc(env, "market_admin_list", { p_status: "published" });
    if (res.ok && Array.isArray(res.data)) {
      games = res.data;
      console.log("[worker] marketplace SSR games:", games.length, "UA:", request.headers.get("User-Agent"));
    }
  } catch (err) {
    console.error("[worker] marketplace SSR error:", err);
    // Przy błędzie serwuj normalnie
    return fetch(request);
  }

  const lang = url.searchParams.get("lang") || "pl";
  const title = lang === "en" ? "Familiada Marketplace" : lang === "uk" ? "Familiada Маркетплейс" : "Familiada Marketplace";
  const desc  = lang === "en"
    ? "Browse and download free Familiada games created by the community."
    : lang === "uk"
    ? "Переглядайте та завантажуйте безкоштовні ігри Familiada від спільноти."
    : "Przeglądaj i pobieraj darmowe gry Familiada stworzone przez społeczność.";

  const gamesHtml = games.map(g => `
    <article class="mg-card">
      <h2>${escapeHtml(g.title)}</h2>
      <p class="mg-meta">${escapeHtml(g.lang.toUpperCase())} · ${escapeHtml(g.author_username || "Familiada")}</p>
      <p>${escapeHtml(g.description)}</p>
    </article>`).join("\n");

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}"/>
  <meta property="og:title" content="${escapeHtml(title)}"/>
  <meta property="og:description" content="${escapeHtml(desc)}"/>
  <meta property="og:type" content="website"/>
  <link rel="canonical" href="https://www.familiada.online/marketplace"/>
  <style>
    body{font-family:sans-serif;max-width:900px;margin:0 auto;padding:16px}
    .mg-card{border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0}
    .mg-meta{color:#666;font-size:.9em}
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(desc)}</p>
  <section>${gamesHtml || "<p>Brak gier.</p>"}</section>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Robots-Tag": "index, follow",
    },
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadMailSettings(env) {
  const q =
    "select=id,queue_enabled,provider_order,delay_ms,batch_max,worker_limit,updated_at&id=eq.1&limit=1";
  const res = await supabaseRequest(env, `/rest/v1/mail_settings?${q}`, { method: "GET" });
  if (!res.ok) {
    return { ok: false, status: res.status, error: "mail_settings_load_failed", details: summarizeSupabaseError(res) };
  }

  const row = Array.isArray(res.data) && res.data.length ? res.data[0] : null;
  if (!row) {
    return {
      ok: true,
      settings: {
        id: 1,
        ...DEFAULT_MAIL_SETTINGS,
        updated_at: null,
      },
    };
  }

  const order = parseProviderOrderInput(row.provider_order || DEFAULT_MAIL_SETTINGS.provider_order);
  return {
    ok: true,
    settings: {
      id: 1,
      queue_enabled: row.queue_enabled !== false,
      provider_order: order.join(","),
      delay_ms: clampInt(row.delay_ms, 0, 5000, DEFAULT_MAIL_SETTINGS.delay_ms),
      batch_max: clampInt(row.batch_max, 1, 500, DEFAULT_MAIL_SETTINGS.batch_max),
      worker_limit: clampInt(row.worker_limit, 1, 200, DEFAULT_MAIL_SETTINGS.worker_limit),
      updated_at: row.updated_at || null,
    },
  };
}

async function loadMailCronStatus(env) {
  const res = await supabaseRpc(env, "mail_cron_status", {});
  if (!res.ok) {
    return { ok: false, status: res.status, error: "mail_cron_status_failed", details: summarizeSupabaseError(res) };
  }
  return { ok: true, data: normalizeRpcValue(res.data) || {} };
}

function parseProviderOrderInput(raw) {
  const source = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

  const uniq = [];
  for (const provider of source) {
    if (!MAIL_PROVIDERS.includes(provider)) continue;
    if (uniq.includes(provider)) continue;
    uniq.push(provider);
  }
  for (const provider of MAIL_PROVIDERS) {
    if (!uniq.includes(provider)) uniq.push(provider);
  }
  return uniq;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function getSupabaseConfig(env) {
  const baseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!baseUrl || !serviceRoleKey) return null;
  return { baseUrl, serviceRoleKey };
}

async function supabaseRequest(env, path, { method = "GET", body, headers } = {}) {
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

    return { ok: res.ok, status: res.status, data, text };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: null,
      text: `supabase_fetch_failed:${String((err && err.message) || err || "unknown_error")}`,
    };
  }
}

async function supabaseRpc(env, fnName, params = {}) {
  return supabaseRequest(env, `/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: params,
  });
}

function summarizeSupabaseError(result) {
  if (!result) return "unknown_error";
  if (typeof result.data === "string") return result.data.slice(0, 400);
  if (result.data && typeof result.data === "object") {
    const msg = result.data.message || result.data.error || result.data.hint || result.data.details;
    if (msg) return String(msg).slice(0, 400);
  }
  return String(result.text || "unknown_error").slice(0, 400);
}

function normalizeRpcValue(value) {
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

function extractScalarNumber(value, fallback = 0) {
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

function isMaintenanceAsset(pathname) {
  if (pathname === "/maintenance") return true;

  const allowedPrefixes = ["/css/", "/js/", "/translation/", "/img/", "/audio/"];
  for (const prefix of allowedPrefixes) {
    if (pathname.startsWith(prefix)) return true;
  }

  const allowedFiles = ["/favicon.ico", "/logo.svg"];
  return allowedFiles.includes(pathname);
}

function isCommonAsset(pathname) {
  if (pathname === "/404.html") return true;
  if (isMaintenanceAsset(pathname)) return true;
  if (isSettingsAsset(pathname)) return true;
  return false;
}

const KNOWN_HOSTS = [
  "familiada.online",
  "www.familiada.online",
  "settings.familiada.online",
  "panel.familiada.online",
  "supabase.familiada.online",
  "api.familiada.online",
];

const BLOCKED_PATHS = [
  {
    hosts: ["familiada.online", "www.familiada.online"],
    paths: ["/settings", "/settings/", "/settings.html", "/tools", "/tools/", "/settings-tools", "/settings-tools/"],
  },
];

function isKnownHost(host) {
  return KNOWN_HOSTS.includes(host);
}

function isBlockedPath(host, pathname) {
  for (const rule of BLOCKED_PATHS) {
    if (!rule.hosts.includes(host)) continue;
    if (rule.paths.includes(pathname)) return true;
    if (pathname.startsWith("/tools/")) return true;
    if (pathname.startsWith("/settings-tools/")) return true;
  }
  return false;
}

function withHeaders(res, extra) {
  const headers = new Headers(res.headers);
  Object.entries(extra).forEach(([key, value]) => headers.set(key, value));
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function fetchFromOrigin(request, url, originBase, originHost, resolveOverride) {
  const target = new URL(url.pathname + url.search, originBase);
  return fetchWithOrigin(target.toString(), request, originHost, resolveOverride);
}

async function fetchWith404(request, originBase, originHost, resolveOverride) {
  const url = new URL(request.url);
  const res = await fetchFromOrigin(request, url, originBase, originHost, resolveOverride);
  if (res.status !== 404) return res;

  const accept = request.headers.get("Accept") || "";
  if (accept.includes("text/html")) {
    return serveNotFoundPage(request, originBase, originHost, resolveOverride);
  }

  return res;
}

function fetchWithOrigin(url, request, originHost, resolveOverride) {
  const headers = new Headers(request.headers);
  if (originHost) headers.set("Host", originHost);

  const method = request.method || "GET";
  const init = {
    method,
    headers,
    redirect: "manual",
    cf: resolveOverride ? { resolveOverride } : undefined,
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = request.body;
  }

  return fetch(url, init);
}

function isSettingsAsset(pathname) {
  const allowedPrefixes = ["/css/", "/js/", "/translation/", "/img/", "/audio/"];
  for (const prefix of allowedPrefixes) {
    if (pathname.startsWith(prefix)) return true;
  }
  const allowedFiles = ["/favicon.ico", "/logo.svg"];
  return allowedFiles.includes(pathname);
}

function getCookie(request, name) {
  const h = request.headers.get("Cookie") || "";
  const parts = h.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    if (k === name) return v;
  }
  return null;
}

function hasAdminBypass(request, env) {
  const hostOnly = getCookie(request, "__Host-fml_admin");
  const allDomains = getCookie(request, "__Secure-fml_admin");
  const token = env.ADMIN_BYPASS_TOKEN;
  return Boolean(token && (hostOnly === token || allDomains === token));
}

function hasAccessJwt(request) {
  return Boolean(
    request.headers.get("CF-Access-Jwt-Assertion") ||
      request.headers.get("Cf-Access-Jwt-Assertion")
  );
}

function hasAccessUserIdentity(request) {
  return Boolean(
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
      request.headers.get("CF-Access-Authenticated-User-Email") ||
      request.headers.get("cf-access-authenticated-user-email")
  );
}

async function isAdminAuthorized(request) {
  // Access is the only auth layer for settings admin API.
  return hasAccessUserIdentity(request) || hasAccessJwt(request);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validateState(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON" };
  }
  const enabled = body.enabled;
  const mode = body.mode;
  const returnAt = body.returnAt ?? null;

  if (typeof enabled !== "boolean") {
    return { ok: false, error: "Invalid enabled" };
  }

  const modes = new Set(["off", "message", "returnAt", "countdown"]);
  if (typeof mode !== "string" || !modes.has(mode)) {
    return { ok: false, error: "Invalid mode" };
  }

  if (returnAt !== null && typeof returnAt !== "string") {
    return { ok: false, error: "Invalid returnAt" };
  }

  return { ok: true, value: { enabled, mode, returnAt } };
}

function setAdminBypassCookieForAllDomains(env) {
  // __Secure- pozwala na Domain=.familiada.online (shared for apex + www)
  return `__Secure-fml_admin=${env.ADMIN_BYPASS_TOKEN}; Path=/; Domain=familiada.online; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}

function clearAdminBypassCookieForAllDomains() {
  return `__Secure-fml_admin=; Path=/; Domain=familiada.online; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}
