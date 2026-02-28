// See cloudflare/README.md for full behavior and checklist.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.host.toLowerCase();
    // Fetch from apex origin but resolve directly to GitHub Pages to avoid recursion.
    const ORIGIN_BASE = "https://familiada.online";
    const ORIGIN_HOST = "familiada.online";
    const ORIGIN_RESOLVE = "andrish97.github.io";

    // (no apex redirect here)

    // PUBLIC STATE ENDPOINT (works on every host/subdomain)
    if (url.pathname === "/maintenance-state.json") {
      const state = await getState(env);
      return json(state);
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

  if (url.pathname === "/_admin_api/mail/queue") {
    if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

    const limit = clampInt(url.searchParams.get("limit"), 1, 500, 150);
    const status = String(url.searchParams.get("status") || "all").toLowerCase();
    const allowedStatuses = new Set(["all", "pending", "sending", "failed"]);
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

    const run = await supabaseRpc(env, "invoke_mail_worker", { p_limit: limit });
    if (!run.ok) {
      return json({ ok: false, error: "mail_worker_invoke_failed", details: summarizeSupabaseError(run) }, run.status || 500);
    }

    return json({
      ok: true,
      invoked: true,
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
