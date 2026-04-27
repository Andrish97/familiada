// See cloudflare/README.md for full behavior and checklist.
export default {
  async email(message, env) {
    try {
      await handleInboundEmail(message, env);
    } catch (err) {
      console.error("[email] unhandled error:", err);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupExpiredAttachments(env));
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
      if (url.pathname.startsWith("/settings-tools/") || isSettingsAsset(url.pathname) || url.pathname === "/version.txt") {
        const res = await fetchFromOrigin(request, url, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
        if (url.pathname.startsWith("/settings-tools/")) {
          return withHeaders(res, {
            "Content-Security-Policy": "frame-ancestors 'self'",
            "X-Frame-Options": "SAMEORIGIN"
          });
        }
        if (url.pathname === "/version.txt") {
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

    // Lead Finder - passthrough for settings frontend communication
    if (host === "leads.familiada.online") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "https://settings.familiada.online",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "86400"
          }
        });
      }
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

    // Bypass → przepuszcza WSZYSTKO (nawet przy włączonym maintenance)
    if (isBypass) {
      return fetchWith404(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
    }

    // Admin API should not be exposed on public hosts
    if (url.pathname.startsWith("/_admin_api")) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Redirect ?lang=pl → clean URL (pl is default, no param needed)
    if (request.method === "GET" && url.searchParams.get("lang") === "pl") {
      const clean = new URL(url);
      clean.searchParams.delete("lang");
      return Response.redirect(clean.toString(), 301);
    }

    // Public notification endpoint (rate-limited, no auth required) - for marketplace, lead-finder etc
    if (url.pathname === "/_api/notify-submission" && request.method === "POST") {
      return handleNotifySubmission(request, env);
    }

    // Public contact form endpoint
    if (url.pathname === "/_api/contact/append") {
      return handleContactAppend(request, env);
    }
    if (url.pathname === "/_api/contact" && request.method === "POST") {
      return handleContactSubmit(request, env);
    }

    // Game detail pages — SSR dla botów, marketplace SPA dla ludzi
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/marketplace/game/")) {
      if (isBot(request)) {
        return serveGameDetailSsr(request, env, url, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
      }
      // Ludzie widzą marketplace z otwartym modalem gry
      const mpUrl = new URL(url);
      mpUrl.pathname = "/marketplace";
      return fetchFromOrigin(request, mpUrl, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
    }

    // Dynamic sitemap — includes all published game URLs
    if (request.method === "GET" && url.pathname === "/sitemap.xml") {
      return serveDynamicSitemap(env);
    }

    // Boty zawsze dostają prawdziwą treść niezależnie od maintenance
    if (request.method === "GET" && isBot(request)) {
      if (url.pathname === "/marketplace" || url.pathname === "/marketplace/") {
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
  if (!raw) return { enabled: false, mode: "off", returnAt: null, customComments: { pl: null, en: null, uk: null }, useStandardText: true };
  try {
    const s = JSON.parse(raw);
    // minimal sanity
    if (typeof s.enabled !== "boolean") throw new Error("bad enabled");
    
    // Migration from old single field to object
    let comments = s.customComments || { pl: s.customComment || null, en: null, uk: null };
    
    return {
      enabled: s.enabled,
      mode: s.mode || "off",
      returnAt: s.returnAt ?? null,
      customComments: comments,
      useStandardText: s.useStandardText ?? (comments.pl || comments.en || comments.uk ? false : true)
    };
  } catch {
    return { enabled: false, mode: "off", returnAt: null, customComments: { pl: null, en: null, uk: null }, useStandardText: true };
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

  if (url.pathname === "/_admin_api/stats/detail") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const type = String(url.searchParams.get("type") || "");
    const allowed = new Set(["users", "games", "gameplay", "bases", "logos", "ratings"]);
    if (!allowed.has(type)) return json({ ok: false, error: "invalid_type" }, 400);
    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 200);
    const res = await supabaseRpc(env, "get_stats_detail", { p_type: type, p_limit: limit });
    if (!res.ok) return json({ ok: false, error: "stats_detail_failed", details: summarizeSupabaseError(res) }, res.status || 500);
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

const MAIL_PROVIDERS = ["brevo", "mailgun", "sendpulse", "mailersend"];
const DEFAULT_MAIL_SETTINGS = {
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
        providers: loaded.providers,
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

      // Aktualizuj dostawców jeśli przesłano nową listę
      if (Array.isArray(body.providers)) {
        for (let i = 0; i < body.providers.length; i++) {
          const p = body.providers[i];
          if (!p.id) continue;
          await supabaseRequest(env, `/rest/v1/email_providers?id=eq.${encodeURIComponent(p.id)}`, {
            method: "PATCH",
            body: { 
              daily_limit: clampInt(p.daily_limit, 0, 1000000, 1000),
              priority: i + 1,
              is_active: p.is_active !== false
            }
          });
        }
      }

      const next = {
        id: 1,
        queue_enabled:
          typeof body.queue_enabled === "boolean"
            ? body.queue_enabled
            : typeof body.queueEnabled === "boolean"
              ? body.queueEnabled
              : current.queue_enabled,
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
        providers: refreshed.ok ? refreshed.providers : [],
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

    const perPage = clampInt(url.searchParams.get("per_page"), 10, 200, 50);
    const page = clampInt(url.searchParams.get("page"), 1, 9999, 1);
    const fn = String(url.searchParams.get("fn") || "all").toLowerCase();
    const level = String(url.searchParams.get("level") || "all").toLowerCase();
    const fnAllowed = new Set(["all", "send-mail", "send-email", "mail-worker"]);
    const levelAllowed = new Set(["all", "debug", "info", "warn", "error"]);
    if (!fnAllowed.has(fn)) return json({ ok: false, error: "Invalid function filter" }, 400);
    if (!levelAllowed.has(level)) return json({ ok: false, error: "Invalid level filter" }, 400);

    let filters = "";
    if (fn !== "all") filters += `&function_name=eq.${encodeURIComponent(fn)}`;
    if (level !== "all") filters += `&level=eq.${encodeURIComponent(level)}`;

    // Count query
    const countResult = await supabaseRequest(env, `/rest/v1/mail_function_logs?select=count${filters}`, { method: "GET" });
    const total = Array.isArray(countResult.data) && countResult.data[0]?.count != null
      ? Number(countResult.data[0].count)
      : 0;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, pages);
    const offset = (safePage - 1) * perPage;

    let qs =
      "select=id,created_at,function_name,level,event,request_id,queue_id,actor_user_id,recipient_email,provider,status,error,meta";
    qs += `&order=created_at.desc&limit=${perPage}&offset=${offset}${filters}`;

    const list = await supabaseRequest(env, `/rest/v1/mail_function_logs?${qs}`, { method: "GET" });
    if (!list.ok) {
      return json({ ok: false, error: "mail_logs_load_failed", details: summarizeSupabaseError(list) }, list.status || 500);
    }

    return json({
      ok: true,
      rows: Array.isArray(list.data) ? list.data : [],
      total,
      page: safePage,
      per_page: perPage,
      pages,
      filter: { fn, level },
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

  // POST /_admin_api/marketplace/import-bulk
  // Importuje wiele gier naraz z JSON { games: [{title, description, lang, payload}] }
  if (url.pathname === "/_admin_api/marketplace/import-bulk") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    let body = {};
    try { body = await request.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
    const games = body?.games;
    if (!Array.isArray(games) || games.length === 0) return json({ ok: false, error: "missing_games" }, 400);

    const results = [];
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (!g.title || !g.lang || !g.payload) {
        results.push({ index: i, ok: false, error: "missing_fields" });
        continue;
      }
      const upsert = await supabaseRpc(env, "market_admin_upsert", {
        p_title:       String(g.title),
        p_description: String(g.description || ""),
        p_lang:        String(g.lang),
        p_payload:     g.payload,
      });
      if (!upsert.ok) {
        results.push({ index: i, title: g.title, ok: false, error: summarizeSupabaseError(upsert) });
        continue;
      }
      const row = normalizeRpcValue(upsert.data);
      results.push({ index: i, title: g.title, ok: row?.ok ?? true, id: row?.market_id, existing: row?.existing });
    }

    const failed = results.filter(r => !r.ok);
    return json({ ok: failed.length === 0, total: games.length, imported: results.filter(r => r.ok).length, failed: failed.length, results });
  }

  // POST /_admin_api/marketplace/notify-test — wyślij testowe powiadomienie
  if (url.pathname === "/_admin_api/marketplace/notify-test") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const tg = getTelegramConfig(env);
    if (!tg) return json({ ok: false, error: "telegram_not_configured" }, 422);

    return sendTelegram(tg, "Test — Familiada admin\nPowiadomienia push działają poprawnie ✅");
  }

  return new Response("Not Found", { status: 404 });
}

async function handleAdminMarketingApi(request, env, url) {
  // POST /_admin_api/marketing/preview { template_id, custom_subject, custom_body }
  if (url.pathname === "/_admin_api/marketing/preview" && request.method === "POST") {
    const body = await readJson(request);
    const { template_id, custom_subject, custom_body } = body || {};
    const { html } = buildMarketingEmail(template_id || "custom", { customBody: custom_body, customSubject: custom_subject });
    return json({ ok: true, html });
  }

  // POST /_admin_api/marketing/send { emails, subject, template_id, custom_body }
  if (url.pathname === "/_admin_api/marketing/send" && request.method === "POST") {
    const body = await readJson(request);
    const { emails, subject: mktSubject, template_id, custom_body } = body || {};
    if (!Array.isArray(emails) || !emails.length) return json({ ok: false, error: "missing_emails" }, 400);
    if (!mktSubject) return json({ ok: false, error: "missing_subject" }, 400);

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = [...new Set(emails.map(e => String(e).trim().toLowerCase()).filter(e => emailRe.test(e)))];
    if (!validEmails.length) return json({ ok: false, error: "no_valid_emails" }, 400);
    if (validEmails.length > 500) return json({ ok: false, error: "too_many_emails", max: 500 }, 400);

    // custom_body is already full HTML from client (templates in JS)
    const emailHtml = custom_body || "";

    // Generate plain text from HTML for Apple Mail preview
    // IMPORTANT: Strip <style> blocks FIRST before removing HTML tags
    const emailText = emailHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // Remove <style> blocks FIRST
      .replace(/<[^>]*>/g, ' ')                           // Remove all HTML tags
      .replace(/:[^;]+;/g, ' ')                           // Remove CSS properties like :root{...}
      .replace(/&nbsp;/g, ' ')                            // Replace &nbsp;
      .replace(/&amp;/g, '&')                             // Replace &amp;
      .replace(/&lt;/g, '<')                              // Replace &lt;
      .replace(/&gt;/g, '>')                              // Replace &gt;
      .replace(/&quot;/g, '"')                            // Replace &quot;
      .replace(/&#39;/g, "'")                             // Replace &#39;
      .replace(/\s+/g, ' ')                              // Collapse whitespace
      .trim()
      .slice(0, 500);                                     // Limit length for preview

    // Insert into mail_queue (batch insert for all recipients)
    const queueRows = validEmails.map(email => ({
      to_email: email,
      subject: String(mktSubject),
      html: emailHtml,
      text: emailText,
      from_email: "kontakt@familiada.online",
      meta: { type: "marketing", template_id: template_id || "custom" },
    }));

    const qRes = await supabaseRequest(env, "/rest/v1/mail_queue", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: queueRows,
    });

    if (!qRes.ok) {
      return json({ ok: false, error: "queue_insert_failed", details: summarizeSupabaseError(qRes) }, qRes.status || 500);
    }

    // Save message record for ALL emails in batch (so they appear in "Sent" / "Marketing")
    const messageRows = validEmails.map(email => ({
      to_email: email,
      subject: String(mktSubject),
      body: emailText,
      body_html: emailHtml,
      is_marketing: true,
      direction: 'outbound',
      source: 'email'
    }));

    // Batch insert into messages table
    const mRes = await supabaseRequest(env, "/rest/v1/messages", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: messageRows,
    });

    if (!mRes.ok) {
      console.error("[marketing/send] Failed to save message history records", summarizeSupabaseError(mRes));
    }

    return json({ ok: true, queued: validEmails.length, total: validEmails.length });
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

  const { email, subject, message, lang = "pl", attachments: formAttachments = [] } = body;

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
  const msgId = row.message_id;
  const safeLang = ["pl","en","uk"].includes(lang) ? lang : "pl";

  // Save form attachments
  if (msgId && Array.isArray(formAttachments) && formAttachments.length) {
    for (const att of formAttachments.slice(0, 5)) {
      try {
        const filename = String(att.filename || "file").replace(/[^\w.\-]/g, "_").slice(0, 100);
        const mimeType = String(att.mime_type || "application/octet-stream");
        const data_b64 = String(att.data_b64 || "");
        if (!data_b64) continue;
        const size = Math.round(data_b64.length * 0.75);
        if (size > 5 * 1024 * 1024) continue;
        const objectKey = `form_${msgId}_${filename}`;
        const storagePath = `message-attachments/${objectKey}`;
        await uploadToStorage(env, storagePath, data_b64, mimeType);
        await supabaseRpc(env, "save_attachment", {
          p_message_id: msgId, p_filename: filename, p_mime_type: mimeType,
          p_size: size, p_storage_path: storagePath, p_inline: false,
        });
      } catch (err) {
        console.error("[contact] attachment upload failed:", err);
      }
    }
  }

  // Send confirmation email
  try {
    const { subject: confirmSubject, html } = buildContactEmail({
      type: "confirmation",
      lang: safeLang,
      ticket,
      subject: String(subject || "").trim(),
      message: String(message || "").trim(),
    });
    
    // Generate plain text from HTML for Apple Mail preview
    // IMPORTANT: Strip <style> blocks FIRST before removing HTML tags
    const emailText = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // Remove <style> blocks FIRST
      .replace(/<[^>]*>/g, ' ')                           // Remove all HTML tags
      .replace(/:[^;]+;/g, ' ')                           // Remove CSS properties
      .replace(/&nbsp;/g, ' ')                            // Replace &nbsp;
      .replace(/&amp;/g, '&')                             // Replace &amp;
      .replace(/\s+/g, ' ')                              // Collapse whitespace
      .trim()
      .slice(0, 500);                                     // Limit length for preview

    await supabaseRequest(env, "/rest/v1/mail_queue", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: {
        to_email: String(email || "").trim().toLowerCase(),
        subject: confirmSubject,
        html: html,
        text: emailText,
        from_email: "no-reply@familiada.online",
        meta: { type: "contact_confirmation", ticket },
      },
    });
  } catch (err) {
    console.error("[worker] contact: mail_queue insert failed:", err);
  }

  // Notify admin via Telegram (best-effort, rate-limited)
  try {
    const tg = getTelegramConfig(env);
    if (tg) {
      const tgKey = "notify_form_ts";
      const last = await env.MAINT_KV.get(tgKey);
      const now = Date.now();
      if (!last || now - Number(last) >= 5 * 60 * 1000) {
        await env.MAINT_KV.put(tgKey, String(now), { expirationTtl: 600 });
        await sendTelegram(tg, `📬 Familiada — nowe zgłoszenie\n#${ticket}`);
      }
    }
  } catch (err) {
    console.error("[worker] contact: telegram notify failed:", err);
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
// MARKETING EMAIL BUILDER
// ============================================================

const IMG_BASE = "https://familiada.online/img/pl";

function buildMarketingEmail(templateId, opts = {}) {
  const { customBody, customSubject } = opts;
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const nl2br = (s) => esc(s).replace(/\n/g, "<br>");

  // ── shared shell ──────────────────────────────────────────────────────────
  const shell = (bodyContent) => `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="dark light"/>
  <title>Familiada Online</title>
</head>
<body style="margin:0;padding:0;background:#050914;-webkit-text-size-adjust:100%">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050914">
<tr><td align="center" style="padding:24px 12px 32px">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;font-size:14px;color:#ffffff">
  <!-- brand bar -->
  <tr><td style="padding:14px 16px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);border-radius:16px;margin-bottom:14px" bgcolor="#000">
    <a href="https://familiada.online" style="text-decoration:none">
      <div style="font-weight:900;font-size:16px;letter-spacing:.18em;text-transform:uppercase;color:#ffeaa6">FAMILIADA</div>
      <div style="margin-top:3px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.05em">familiada.online</div>
    </a>
  </td></tr>
  <tr><td height="12"></td></tr>
  <!-- main card -->
  <tr><td style="padding:24px 22px 22px;border-radius:18px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)">
    ${bodyContent}
    <!-- footer -->
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.35);text-align:center;line-height:1.6">
      Familiada Online &mdash; bezpłatny system na <a href="https://familiada.online" style="color:rgba(255,234,166,.5);text-decoration:none">familiada.online</a><br>
      Wysłano z no-reply@familiada.online
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  // ── reusable pieces ───────────────────────────────────────────────────────
  const cta = (href, label) =>
    `<div style="margin-top:24px;text-align:center">
      <a href="${esc(href)}" style="display:inline-block;padding:13px 30px;background:#ffeaa6;color:#050914;font-weight:800;font-size:13px;letter-spacing:.09em;text-transform:uppercase;border-radius:10px;text-decoration:none">${esc(label)}</a>
    </div>`;

  const featureTile = (imgSrc, heading, desc) =>
    `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
      <tr>
        <td style="padding:0 0 8px">
          <img src="${esc(imgSrc)}" width="516" alt="${esc(heading)}"
               style="width:100%;max-width:516px;border-radius:10px;display:block;border:0"/>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 4px;font-size:14px;font-weight:700;color:#ffeaa6">${esc(heading)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6">${esc(desc)}</td>
      </tr>
    </table>`;

  const divider = () =>
    `<div style="height:1px;background:rgba(255,255,255,.08);margin:20px 0"></div>`;

  // ── INVITATION ────────────────────────────────────────────────────────────
  if (templateId === "invitation") {
    const subject = customSubject || "familiada.online — profesjonalny system do organizacji wydarzeń";
    const body = `
      <p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.9)">Witam,</p>

      <p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">
        Piszę w sprawie narzędzia, które ułatwia organizację wydarzeń i może realnie wesprzeć realizowane projekty.
      </p>

      <p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">
        <strong style="color:#fff">familiada.online</strong> to profesjonalna platforma do prowadzenia teleturnieju na żywo. To kompletny system: od zbierania odpowiedzi od gości (kod QR), przez panel operatora, aż po animowaną tablicę wyników z dźwiękami prosto z telewizyjnego studia.
      </p>

      ${divider()}

      ${featureTile(
        `${IMG_BASE}/landing-polls.webp`,
        "Ankieta QR — goście odpowiadają na żywo",
        "Uczestnicy odpowiadają z własnych telefonów. System automatycznie normalizuje wyniki do 100 punktów."
      )}
      ${featureTile(
        `${IMG_BASE}/landing-control.webp`,
        "Panel operatora — pełna kontrola",
        "Intuicyjne sterowanie rundami, punktami i błędami (X) w czasie rzeczywistym."
      )}
      ${featureTile(
        `${IMG_BASE}/landing-display.webp`,
        "Tablica wyników na TV lub rzutnik",
        "Animowana tablica z zakrytymi odpowiedziami, bankiem punktów i błędami X — z dźwiękami prosto z telewizyjnego studia."
      )}
      ${featureTile(
        `${IMG_BASE}/landing-host.webp`,
        "Niezależny widok prowadzącego",
        "Osobny podgląd pytań dla prowadzącego na tablecie lub telefonie — dla pełnej swobody na scenie."
      )}

      ${divider()}

      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);padding:14px;border-radius:12px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#ffeaa6">Gotowe gry w Grach Społeczności</p>
        <p style="margin:0;font-size:12px;color:rgba(255,255,255,.65);line-height:1.5">
          Gotowe zestawy pytań udostępnione przez innych użytkowników — bez konieczności tworzenia gry od zera.
        </p>
      </div>

      ${divider()}

      <p style="margin:0 0 14px;font-size:14px;line-height:1.8;color:rgba(255,255,255,.88)">
        System jest dostępny całkowicie bezpłatnie i nie wymaga instalacji żadnych aplikacji. Będę wdzięczny za opinię, czy taki format mógłby wzbogacić dotychczasową ofertę.
      </p>

      <p style="margin:0 0 18px;font-size:14px;color:rgba(255,255,255,.88)">Pozdrawiam,<br>Twórca familiada.online</p>

      ${cta("https://familiada.online", "Poznaj system familiada.online")}

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.4);line-height:1.6">
        Wiadomość ma charakter informacyjny i została wysłana jednorazowo do osób związanych z branżą eventową. 
        W przypadku braku chęci otrzymywania dalszych informacji, proszę o krótką wiadomość zwrotną.
      </div>`;

    return { subject, html: shell(body) };
  }

  // ── NEWSLETTER ────────────────────────────────────────────────────────────
  if (templateId === "newsletter") {
    const subject = customSubject || "Nowości w Familiada Online";
    const rawBody = customBody || "";
    const body = `
      <p style="margin:0 0 6px;font-size:20px;font-weight:800;color:#ffeaa6">${esc(subject)}</p>
      ${divider()}
      <div style="font-size:14px;line-height:1.8;color:rgba(255,255,255,.88);white-space:pre-wrap">${nl2br(rawBody)}</div>
      <br>
      ${cta("https://familiada.online", "familiada.online")}`;
    return { subject, html: shell(body) };
  }

  // ── CUSTOM ────────────────────────────────────────────────────────────────
  const subject = customSubject || "Wiadomość od Familiada";
  const rawBody = customBody || "";
  const body = `<div style="font-size:14px;line-height:1.8;color:rgba(255,255,255,.88);white-space:pre-wrap">${nl2br(rawBody)}</div>`;
  return { subject, html: shell(body) };
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
    console.log("[messages] Calling list_messages RPC with:", { filter, limit, offset });
    const res = await supabaseRpc(env, "list_messages", { p_filter: filter, p_limit: limit, p_offset: offset });
    console.log("[messages] RPC result:", { ok: res.ok, status: res.status, dataRows: Array.isArray(res.data) ? res.data.length : 'N/A' });
    if (!res.ok) {
      console.error("[messages] RPC failed:", res);
      return json({ ok: false, error: "list_messages_failed", details: summarizeSupabaseError(res) }, res.status || 500);
    }
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

    return json({ ok: true });
  }

  // POST /_admin_api/messages/marketing  { is_marketing: boolean }
  if (url.pathname === "/_admin_api/messages/marketing" && request.method === "POST") {
    const messageId = url.searchParams.get("id");
    if (!messageId) return json({ ok: false, error: "missing_id" }, 400);
    const body = await readJson(request);
    const { is_marketing } = body || {};
    
    const updateRes = await supabaseRequest(env, `/rest/v1/messages?id=eq.${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: { is_marketing: is_marketing === true },
    });
    
    if (!updateRes.ok) return json({ ok: false, error: "update_failed", details: summarizeSupabaseError(updateRes) }, updateRes.status || 500);
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
    const { to_email, subject: msgSubject, body: msgBody, body_html, report_id, attachments: sendAttachments } = body || {};
    if (!to_email || !msgBody) return json({ ok: false, error: "missing_to_email_or_body" }, 400);

    // Use body_html from client if provided (TinyMCE HTML), otherwise use plain text
    const emailHtml = body_html || String(msgBody);

    // Generate plain text from HTML for Apple Mail preview
    // IMPORTANT: Strip <style> blocks FIRST before removing HTML tags
    const emailText = emailHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')  // Remove <style> blocks FIRST
      .replace(/<[^>]*>/g, ' ')                           // Remove all HTML tags
      .replace(/:[^;]+;/g, ' ')                           // Remove CSS properties
      .replace(/&nbsp;/g, ' ')                            // Replace &nbsp;
      .replace(/&amp;/g, '&')                             // Replace &amp;
      .replace(/\s+/g, ' ')                              // Collapse whitespace
      .trim()
      .slice(0, 500);                                     // Limit length for preview

    // Insert into mail_queue first
    const queueRes = await supabaseRequest(env, "/rest/v1/mail_queue", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        to_email: String(to_email).trim().toLowerCase(),
        subject:  String(msgSubject || ""),
        html:     emailHtml,
        text:     emailText,
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
    if (messageId && saveRes.ok && sendAttachments?.length) {
      const msgId = messageId;
      for (const att of sendAttachments) {
        const attSave = await supabaseRpc(env, "save_attachment", {
          p_message_id:  msgId,
          p_filename:    att.filename,
          p_mime_type:   att.mime_type,
          p_size:        att.size || 0,
          p_storage_path: att.storage_path,
          p_content_id:  null,
          p_inline:      false,
        });
        if (!attSave.ok) {
          console.error("[messages/send] save_attachment failed:", attSave);
        }
      }
    }

    return json({ ok: true, id: messageId });
  }

  // POST /_admin_api/messages/read  { id } or ?id=xxx — mark message as read
  if (url.pathname === "/_admin_api/messages/read" && request.method === "POST") {
    const messageId = url.searchParams.get("id");
    console.log("[messages/read] Called with id:", messageId);
    
    if (!messageId) {
      console.error("[messages/read] Missing message id");
      return json({ ok: false, error: "missing_id" }, 400);
    }

    // Use direct SQL via RPC - bypasses Supabase REST cache
    console.log("[messages/read] Calling mark_message_read RPC...");
    const rpcRes = await supabaseRpc(env, "mark_message_read", { p_message_id: messageId });
    console.log("[messages/read] RPC result:", { 
      ok: rpcRes.ok, 
      status: rpcRes.status, 
      data: rpcRes.data,
      text: rpcRes.text?.substring(0, 200)
    });
    
    if (!rpcRes.ok) {
      console.error("[messages/read] RPC failed:", rpcRes);
      return json({ ok: false, error: "mark_read_failed", details: rpcRes.text || summarizeSupabaseError(rpcRes) }, rpcRes.status || 500);
    }
    
    console.log("[messages/read] Success!");
    return json({ ok: true });
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
    try {
      let formData;
      try { formData = await request.formData(); } catch { return json({ ok: false, error: "invalid_form" }, 400); }
      const file = formData.get("file");
      if (!file || typeof file === "string") return json({ ok: false, error: "missing_file" }, 400);
      const filename = (file.name || "upload").replace(/[^\w.\-]/g, "_");
      const mimeType = file.type || "application/octet-stream";
      const arrayBuf = await file.arrayBuffer();
      if (arrayBuf.byteLength > 10 * 1024 * 1024) return json({ ok: false, error: "file_too_large" }, 413);

      const cfg = getSupabaseConfig(env);
      if (!cfg) return json({ ok: false, error: "missing_supabase_config" }, 500);

      const tempId = crypto.randomUUID();
      const objectKey = `${tempId}_${filename}`;
      const storagePath = objectKey;
      const storageUrl = `${cfg.baseUrl}/storage/v1/object/message-attachments/${objectKey}`;

      const upRes = await fetch(storageUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfg.serviceRoleKey}`,
          "Content-Type": mimeType,
        },
        body: arrayBuf,
      });
      if (!upRes.ok) {
        const errText = await upRes.text().catch(() => "");
        console.error("[worker] storage upload failed:", upRes.status, errText.slice(0, 300));
        return json({ ok: false, error: "storage_upload_failed", status: upRes.status, details: errText.slice(0, 300) }, 500);
      }
      return json({ ok: true, id: tempId, filename, mime_type: mimeType, storage_path: `message-attachments/${storagePath}`, size: arrayBuf.byteLength });
    } catch (err) {
      console.error("[worker] attachment/upload exception:", String(err));
      return json({ ok: false, error: "exception", details: String(err?.message || err).slice(0, 300) }, 500);
    }
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
      
      // Generate plain text from HTML for Apple Mail preview
      const emailText = html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);

      await supabaseRequest(env, "/rest/v1/mail_queue", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          to_email: reportRow.email,
          subject: replySubject,
          html: html,
          text: emailText,
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
      
      // Generate plain text from HTML for Apple Mail preview
      const emailText = html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);

      await supabaseRequest(env, "/rest/v1/mail_queue", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: {
          to_email: String(to).trim().toLowerCase(),
          subject: mailSubject,
          html: html,
          text: emailText,
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
// CRON: cleanup expired attachments (runs daily at 3:00 UTC)
// ============================================================

async function cleanupExpiredAttachments(env) {
  try {
    const listRes = await supabaseRpc(env, "get_expired_attachments", {});
    if (!listRes.ok || !Array.isArray(listRes.data) || !listRes.data.length) return;
    const cfg = getSupabaseConfig(env);
    for (const att of listRes.data) {
      if (att.storage_path) {
        try {
          const storageUrl = `${cfg.baseUrl}/storage/v1/object/message-attachments/${encodeURIComponent(att.storage_path)}`;
          await fetch(storageUrl, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${cfg.serviceRoleKey}`, apikey: cfg.serviceRoleKey },
          });
        } catch (err) {
          console.error("[cron] storage delete failed:", att.storage_path, err);
        }
      }
      await supabaseRpc(env, "mark_attachment_expired", { p_id: att.id });
    }
    console.log(`[cron] expired ${listRes.data.length} attachments`);
  } catch (err) {
    console.error("[cron] cleanupExpiredAttachments failed:", err);
  }
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
    console.log("[email] raw length:", rawText.length);
    console.log("[email] raw preview:", rawText.slice(0, 500));
    const parts = extractMimeParts(rawText);
    console.log("[email] parsed:", { textLen: parts.text?.length, htmlLen: parts.html?.length, attCount: parts.attachments?.length });
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

  // Check if this is a reply to a marketing email (by subject thread)
  const cleanSubject = subject.replace(/^(Re|Fwd|FW):\s*/gi, '').trim().toLowerCase();
  let isReplyToMarketing = false;
  if (cleanSubject) {
    try {
      // Check if any existing marketing email has similar subject
      const checkRes = await supabaseRequest(env, `/rest/v1/messages?select=id&direction=eq.outbound&is_marketing=eq.true&subject=ilike.%${cleanSubject}%&limit=1`, { method: "GET" });
      if (checkRes.ok && Array.isArray(checkRes.data) && checkRes.data.length > 0) {
        isReplyToMarketing = true;
        console.log("[email] Reply to marketing detected:", subject);
      }
    } catch (err) {
      console.error("[email] marketing check failed:", err);
    }
  }

  if (!from || (!body && !inboundAttachments.length)) {
    console.log("[email] skipping - no from or body, body:", body?.slice(0, 100), "attachments:", inboundAttachments.length);
    return;
  }

  let finalBody = body || "";
  if (!finalBody && inboundAttachments.length > 0) {
    const names = inboundAttachments.map(a => a.filename).join(", ");
    finalBody = `(Wiadomość zawiera tylko załączniki: ${names})`;
  } else if (!finalBody) {
    finalBody = "(brak treści)";
  }

  console.log("[email] saving:", { from, subject: subject.slice(0, 50), bodyLen: finalBody.length, htmlLen: bodyHtml?.length || 0 });
  const rpc = await supabaseRpc(env, "save_inbound_message", {
    p_from_email:    from,
    p_subject:       subject.slice(0, 500),
    p_body:          finalBody,
    p_body_html:     bodyHtml,
    p_ticket_number: ticketArg,
  });

  // If this is a reply to marketing, mark it as marketing
  if (rpc.ok && isReplyToMarketing) {
    const msgRow = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0] : null;
    const msgId = msgRow?.id;
    if (msgId) {
      try {
        await supabaseRequest(env, `/rest/v1/messages?id=eq.${encodeURIComponent(msgId)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: { is_marketing: true },
        });
        console.log("[email] Marked reply as marketing:", msgId);
      } catch (err) {
        console.error("[email] marketing mark failed:", err);
      }
    }
  }

  if (rpc.ok) {
    const msgRow = Array.isArray(rpc.data) && rpc.data.length ? rpc.data[0] : null;
    const msgId = msgRow?.id;
    if (msgId && inboundAttachments.length) {
      for (const att of inboundAttachments) {
        try {
          const objectKey = `inbound_${msgId}_${att.filename}`;
          const storagePath = `message-attachments/${objectKey}`;
          await uploadToStorage(env, storagePath, att.data_b64, att.mimeType);
          const saveRes = await supabaseRpc(env, "save_attachment", {
            p_message_id: msgId,
            p_filename:   att.filename,
            p_mime_type:  att.mimeType,
            p_size:       att.size,
            p_storage_path: storagePath,
            p_content_id: att.cid || null,
            p_inline:     att.inline,
          });
          if (!saveRes.ok) {
            console.error("[email] save_attachment failed:", att.filename, summarizeSupabaseError(saveRes));
          }
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

  // Notify admin via Telegram (best-effort, rate-limited)
  try {
    const tg = getTelegramConfig(env);
    if (tg) {
      const tgKey = "notify_email_ts";
      const last = await env.MAINT_KV.get(tgKey);
      const now = Date.now();
      if (!last || now - Number(last) >= 5 * 60 * 1000) {
        await env.MAINT_KV.put(tgKey, String(now), { expirationTtl: 600 });
        const label = savedTicket ? `#${savedTicket}` : "(nowe)";
        await sendTelegram(tg, `📧 Familiada — nowy email\nWiadomość ${label} od ${from}`);
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
  // Unfold RFC 2822 folded headers
  const unfolded = raw.replace(/\r\n([ \t])/g, " ").replace(/\n([ \t])/g, " ");
  
  const textParts = [];
  const htmlParts = [];
  const attachments = [];
  const cidMap = {};

  function parseLevel(content, boundary) {
    if (!boundary) return;
    const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rawParts = content.split(new RegExp(`--${escaped}(?:\r?\n|--)`, "")).slice(1);

    for (const part of rawParts) {
      if (part.trim() === "" || part.trim() === "--") continue;

      const bodyStart = part.indexOf("\r\n\r\n");
      if (bodyStart === -1) continue;

      const headers = part.slice(0, bodyStart);
      let body = part.slice(bodyStart + 4);
      // Remove trailing CRLF if present before the next boundary
      if (body.endsWith("\r\n")) body = body.slice(0, -2);

      const ctMatch = headers.match(/Content-Type:\s*([^;\r\n]+)/i);
      const mimeType = ctMatch ? ctMatch[1].trim().toLowerCase() : "application/octet-stream";
      
      const subBoundaryMatch = headers.match(/boundary="?([^"\r\n;]+)"?/i);
      if (subBoundaryMatch && mimeType.startsWith("multipart/")) {
        parseLevel(body, subBoundaryMatch[1]);
        continue;
      }

      const dispMatch = headers.match(/Content-Disposition:\s*(attachment|inline)/i);
      const cidMatch = headers.match(/Content-ID:\s*<([^>]+)>/i);
      const fnMatch = headers.match(/filename\*?=(?:.*?'')?["']?([^"'\r\n;]+)["']?/i);
      const isB64 = /Content-Transfer-Encoding:\s*base64/i.test(headers);
      const isQP = /Content-Transfer-Encoding:\s*quoted-printable/i.test(headers);

      if (mimeType === "text/plain" && !dispMatch) {
        textParts.push(decodeMimePart(headers, body).trim());
      } else if (mimeType === "text/html" && !dispMatch) {
        htmlParts.push(decodeMimePart(headers, body).trim());
      } else {
        // Attachment or Inline
        const isAttachment = dispMatch || cidMatch || (mimeType.startsWith("image/") && !textParts.length && !htmlParts.length);
        if (isAttachment) {
          const b64 = isB64
            ? body.replace(/\s+/g, "")
            : btoa(String.fromCharCode(...new TextEncoder().encode(isQP ? decodeMimePart(headers, body) : body)));

          const filename = fnMatch ? decodeURIComponent(fnMatch[1].trim()) : `attachment_${Date.now()}_${attachments.length}`;
          const cid = cidMatch ? cidMatch[1] : null;
          if (cid) cidMap[cid] = `data:${mimeType};base64,${b64}`;
          
          attachments.push({
            filename,
            mimeType,
            data_b64: b64,
            cid,
            inline: !!cidMatch,
            size: Math.round(b64.length * 0.75)
          });
        }
      }
    }
  }

  const boundaryMatch = unfolded.match(/Content-Type:\s*multipart\/[^\r\n]+boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    parseLevel(raw, boundaryMatch[1]);
    let html = htmlParts.join("\n");
    if (html && Object.keys(cidMap).length) {
      for (const [cid, dataUri] of Object.entries(cidMap)) {
        html = html.split(`cid:${cid}`).join(dataUri);
      }
    }
    return { text: textParts.join("\n"), html, attachments };
  }

  // Non-multipart
  const bodyStart = raw.indexOf("\r\n\r\n");
  const content = bodyStart !== -1 ? raw.slice(bodyStart + 4).trim() : "";
  const decoded = decodeMimePart(raw, content);
  const isHtml = /^\s*<!doctype html|^\s*<html/i.test(decoded);
  return { text: isHtml ? "" : decoded, html: isHtml ? decoded : "", attachments: [] };
}

// ============================================================
// STORAGE HELPERS
// ============================================================

async function uploadToStorage(env, bucketPath, data_b64, mimeType) {
  const cfg = getSupabaseConfig(env);
  if (!cfg) throw new Error("storage_upload_failed:missing_supabase_config");
  // bucketPath format: "message-attachments/{path}" or just "{bucket}/{path}"
  const url = `${cfg.baseUrl}/storage/v1/object/${bucketPath}`;
  const binaryStr = atob(data_b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${cfg.serviceRoleKey}`, "Content-Type": mimeType },
    body: bytes,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`storage_upload_failed:${res.status}:${err.slice(0, 200)}`);
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

function getTelegramConfig(env) {
  const token  = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(env.TELEGRAM_CHAT_ID   || "").trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

async function sendTelegram({ token, chatId }, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return json({ ok: false, error: `telegram_http_${res.status}`, detail: body.slice(0, 200) });
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) });
  }
}

async function handleNotifySubmission(request, env) {
  // Rate limit: 1 notification per 5 minutes
  const key = "notify_submission_ts";
  const last = await env.MAINT_KV.get(key);
  const now = Date.now();
  if (last && now - Number(last) < 5 * 60 * 1000) {
    return json({ ok: true });
  }

  let text = null;
  try {
    const body = await request.json();
    text = String(body.text || "").slice(0, 2000);
  } catch {}

  const tg = getTelegramConfig(env);
  if (!tg) return json({ ok: true });

  await env.MAINT_KV.put(key, String(now), { expirationTtl: 600 });
  const message = text || "🎮 Familiada — marketplace\nNowa gra czeka na zatwierdzenie";
  return sendTelegram(tg, message);
}


// ============================================================
// ADMIN CONFIG API
// ============================================================

async function handleAdminConfigApi(request, env, url) {

  // POST /_admin_api/config/telegram/test — test push
  if (url.pathname === "/_admin_api/config/telegram/test" && request.method === "POST") {
    const tg = getTelegramConfig(env);
    if (!tg) return json({ ok: false, error: "telegram_not_configured" }, 422);
    return sendTelegram(tg, "✅ Familiada — test powiadomień Telegram\nPowiadomienia push działają poprawnie!");
  }

  // GET /_admin_api/config/lead-finder-token — serve API key to settings frontend
  if (url.pathname === "/_admin_api/config/lead-finder-token" && request.method === "GET") {
    const token = String(env.LEAD_FINDER_API_KEY || "").trim();
    if (!token) return json({ ok: false, error: "not_configured" }, 422);
    return json({ ok: true, token });
  }

  return new Response("Not Found", { status: 404 });
}

// ============================================================
// BOT DETECTION + MARKETPLACE SSR
// ============================================================

const BOT_UA_PATTERNS = [
  "googlebot", "google-inspectiontool", "mediapartners-google", "googleweblight",
  "bingbot", "slurp", "duckduckbot", "baiduspider",
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
      <h2><a href="/marketplace/game/${escapeHtml(g.slug || g.id)}">${escapeHtml(g.title)}</a></h2>
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

async function serveGameDetailSsr(request, env, url, originBase, originHost, resolveOverride) {
  const parts = url.pathname.split("/");
  const param = parts[3] || "";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!param) {
    return serveNotFoundPage(request, originBase, originHost, resolveOverride);
  }

  const cfg = getSupabaseConfig(env);
  if (!cfg) return fetch(request);

  let game = null;
  try {
    // UUID w URL → pobierz po id, potem redirect 301 na slug
    if (UUID_RE.test(param)) {
      const res = await supabaseRpc(env, "market_admin_detail", { p_id: param });
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      if (res.ok && row?.slug && row?.status === "published") {
        return Response.redirect(
          `https://www.familiada.online/marketplace/game/${row.slug}`,
          301
        );
      }
      return serveNotFoundPage(request, originBase, originHost, resolveOverride);
    }

    // Slug → pobierz po slug
    const res = await supabaseRpc(env, "market_game_by_slug", { p_slug: param });
    if (!res.ok) {
      // Błąd Supabase — zwróć 503 zamiast 404, żeby Google nie deindeksował URL
      console.error("[worker] market_game_by_slug failed:", res.status, res.text);
      return new Response("Service temporarily unavailable", {
        status: 503,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      });
    }
    if (Array.isArray(res.data) && res.data.length > 0) {
      game = res.data[0];
    } else if (res.data && !Array.isArray(res.data)) {
      game = res.data;
    }
  } catch (err) {
    console.error("[worker] game detail SSR error:", err);
    return new Response("Service temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }

  if (!game || game.status !== "published") {
    return serveNotFoundPage(request, originBase, originHost, resolveOverride);
  }

  const lang = game.lang || "pl";
  const pageTitle = `${game.title} – Familiada`;
  const backLabel = lang === "en" ? "← Back to Marketplace" : lang === "uk" ? "← Назад до Маркетплейсу" : "← Wróć do Marketplace";
  const questionsLabel = lang === "en" ? "Questions" : lang === "uk" ? "Питання" : "Pytania";
  const answersLabel = lang === "en" ? "Top answers" : lang === "uk" ? "Топ відповіді" : "Najczęstsze odpowiedzi";
  const byLabel = lang === "en" ? "by" : lang === "uk" ? "від" : "autor";
  const originLabel = game.origin === "producer" ? (lang === "en" ? "Producer" : lang === "uk" ? "Виробник" : "Producent") : (lang === "en" ? "Community" : lang === "uk" ? "Спільнota" : "Społeczność");
  const canonicalUrl = `https://www.familiada.online/marketplace/game/${escapeHtml(game.slug)}`;

  const questions = game.payload?.questions || [];

  const faqEntities = questions.map(q => ({
    "@type": "Question",
    "name": q.text,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": (q.answers || []).map(a => a.text).join(", ")
    }
  }));

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "name": game.title,
    "description": game.description || "",
    "url": canonicalUrl,
    "inLanguage": lang,
    "mainEntity": faqEntities
  });

  const questionsHtml = questions.map((q, i) => {
    const answersHtml = (q.answers || []).map(a =>
      `<li><span class="pts">${a.fixed_points}</span> ${escapeHtml(a.text)}</li>`
    ).join("\n");
    return `
    <section class="question">
      <h3>${i + 1}. ${escapeHtml(q.text)}</h3>
      <p class="answers-label">${answersLabel}:</p>
      <ol>${answersHtml}</ol>
    </section>`;
  }).join("\n");

  const authorLine = game.author_username
    ? `${byLabel}: <strong>${escapeHtml(game.author_username)}</strong>`
    : "Familiada";

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(game.description || game.title)}"/>
  <meta property="og:title" content="${escapeHtml(pageTitle)}"/>
  <meta property="og:description" content="${escapeHtml(game.description || game.title)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:url" content="${canonicalUrl}"/>
  <link rel="canonical" href="${canonicalUrl}"/>
  <script type="application/ld+json">${jsonLd}</script>
  <style>
    body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:16px;color:#222}
    a{color:#1a56db}
    .back{display:inline-block;margin-bottom:16px;font-size:.9em}
    .meta{color:#666;font-size:.9em;margin:4px 0 12px}
    .badge{display:inline-block;background:#e5edff;color:#1a56db;border-radius:4px;padding:2px 8px;font-size:.8em;margin-right:6px}
    .question{border-left:3px solid #1a56db;padding:0 0 0 14px;margin:20px 0}
    .question h3{margin:0 0 6px;font-size:1em}
    .answers-label{color:#666;font-size:.85em;margin:0 0 4px}
    ol{margin:0;padding-left:20px}
    ol li{padding:2px 0;font-size:.95em}
    .pts{display:inline-block;min-width:28px;background:#f0f4ff;border-radius:3px;text-align:center;font-size:.8em;font-weight:bold;color:#1a56db;margin-right:6px}
    .play-btn{display:inline-block;margin-top:20px;padding:10px 20px;background:#1a56db;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold}
  </style>
</head>
<body>
  <a class="back" href="/marketplace">${backLabel}</a>
  <h1>${escapeHtml(game.title)}</h1>
  <p class="meta">
    <span class="badge">${escapeHtml(lang.toUpperCase())}</span>
    <span class="badge">${escapeHtml(originLabel)}</span>
    ${authorLine} · ${escapeHtml(String(questions.length))} ${questionsLabel.toLowerCase()}
  </p>
  ${game.description ? `<p>${escapeHtml(game.description)}</p>` : ""}
  <a class="play-btn" href="/marketplace?game=${escapeHtml(game.id)}">${lang === "en" ? "Play this game" : lang === "uk" ? "Грати" : "Graj w tę grę"}</a>
  <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
  ${questionsHtml}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
      "X-Robots-Tag": "index, follow",
    },
  });
}

async function serveDynamicSitemap(env) {
  const STATIC_PAGES = [
    { loc: "https://www.familiada.online/",          lastmod: "2026-03-14", changefreq: "monthly",  priority: "1.0" },
    { loc: "https://www.familiada.online/marketplace", lastmod: "2026-03-14", changefreq: "weekly",   priority: "0.9" },
    { loc: "https://www.familiada.online/privacy",    lastmod: "2026-03-14", changefreq: "yearly",   priority: "0.2" },
  ];

  let games = [];
  try {
    const res = await supabaseRpc(env, "market_admin_list", { p_status: "published" });
    if (res.ok && Array.isArray(res.data)) {
      games = res.data;
    }
  } catch (err) {
    console.error("[worker] sitemap fetch error:", err);
  }

  const today = new Date().toISOString().slice(0, 10);

  const staticUrls = STATIC_PAGES.map(p => `
  <url>
    <loc>${escapeHtml(p.loc)}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join("");

  const gameUrls = games.filter(g => g.slug).map(g => {
    const cnt = g.library_count || 0;
    const priority = cnt >= 50 ? "0.8" : cnt >= 10 ? "0.7" : "0.6";
    return `
  <url>
    <loc>https://www.familiada.online/marketplace/game/${escapeHtml(g.slug)}</loc>
    <lastmod>${(g.updated_at || g.created_at || today).slice(0, 10)}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${gameUrls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
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
  const q = "select=id,delay_ms,batch_max,worker_limit,updated_at&id=eq.1&limit=1";
  const res = await supabaseRequest(env, `/rest/v1/mail_settings?${q}`, { method: "GET" });
  if (!res.ok) {
    return { ok: false, status: res.status, error: "mail_settings_load_failed", details: summarizeSupabaseError(res) };
  }
  
  const providersRes = await supabaseRequest(env, "/rest/v1/email_providers?select=id,name,label,priority,daily_limit,rem_worker,rem_immediate,is_active&order=priority.asc", { method: "GET" });
  const providers = Array.isArray(providersRes.data) ? providersRes.data : [];

  const row = Array.isArray(res.data) && res.data.length ? res.data[0] : null;
  if (!row) {
    return {
      ok: true,
      settings: { id: 1, ...DEFAULT_MAIL_SETTINGS, updated_at: null },
      providers: providers
    };
  }

  return {
    ok: true,
    settings: {
      id: 1,
      delay_ms: clampInt(row.delay_ms, 0, 5000, DEFAULT_MAIL_SETTINGS.delay_ms),
      batch_max: clampInt(row.batch_max, 1, 500, DEFAULT_MAIL_SETTINGS.batch_max),
      worker_limit: clampInt(row.worker_limit, 1, 200, DEFAULT_MAIL_SETTINGS.worker_limit),
      updated_at: row.updated_at || null,
    },
    providers: providers
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

  const allowedFiles = ["/favicon.ico", "/logo.svg", "/manifest.json"];
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
  if (res.status !== 404) {
    // HTML bez no-store = cache w przeglądarce → stale wersje
    const ct = res.headers.get("Content-Type") || "";
    if (ct.includes("text/html")) {
      return new Response(res.body, {
        status: res.status,
        headers: {
          "Content-Type": ct,
          "Cache-Control": "no-store",
          "X-GitHub-Request-Id": res.headers.get("X-GitHub-Request-Id") || ""
        }
      });
    }
    return res;
  }

  const accept = request.headers.get("Accept") || "";
  if (accept.includes("text/html")) {
    return serveNotFoundPage(request, originBase, originHost, resolveOverride);
  }

  return res;
}

async function fetchWithOrigin(url, request, originHost, resolveOverride) {
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

  const res = await fetch(url, init);

  const ct = res.headers.get("Content-Type") || "";
  const accept = headers.get("Accept") || "";
  if (ct.includes("text/html") || accept.includes("text/html")) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "no-store"
      }
    });
  }

  const pathname = new URL(url).pathname;
  if (
    ct.includes("application/javascript") ||
    ct.includes("text/css") ||
    ct.includes("application/json") ||
    pathname.match(/\.(js|css|json|woff2?|ttf|otf|webp|avif|ico|png|jpg|jpeg|gif|svg)$/i)
  ) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "no-store"
      }
    });
  }

  return res;
}

function isSettingsAsset(pathname) {
  const allowedPrefixes = ["/css/", "/js/", "/translation/", "/img/", "/audio/"];
  for (const prefix of allowedPrefixes) {
    if (pathname.startsWith(prefix)) return true;
  }
  const allowedFiles = ["/favicon.ico", "/logo.svg", "/manifest.json"];
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
  const customComments = body.customComments ?? { pl: null, en: null, uk: null };
  const useStandardText = body.useStandardText ?? (customComments.pl || customComments.en || customComments.uk ? false : true);

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

  if (typeof customComments !== "object") {
    return { ok: false, error: "Invalid customComments" };
  }

  if (typeof useStandardText !== "boolean") {
    return { ok: false, error: "Invalid useStandardText" };
  }

  return { ok: true, value: { enabled, mode, returnAt, customComments, useStandardText } };
}

function setAdminBypassCookieForAllDomains(env) {
  // __Secure- pozwala na Domain=.familiada.online (shared for apex + www)
  return `__Secure-fml_admin=${env.ADMIN_BYPASS_TOKEN}; Path=/; Domain=familiada.online; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}

function clearAdminBypassCookieForAllDomains() {
  return `__Secure-fml_admin=; Path=/; Domain=familiada.online; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}
