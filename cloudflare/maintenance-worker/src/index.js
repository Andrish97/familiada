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

      // Root on settings subdomain should open settings.html
      if (url.pathname === "/" || url.pathname === "/index.html") {
        url.pathname = "/settings.html";
        return fetchFromOrigin(request, url, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
      }

      // allow settings.html, settings-tools, and assets only
      if (url.pathname === "/settings.html" || url.pathname.startsWith("/settings-tools/") || isSettingsAsset(url.pathname)) {
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

    // ADMIN ENDPOINTS
    if (url.pathname.startsWith("/_maint")) {
      return handleAdmin(request, env);
    }

    // Admin API should not be exposed on public hosts
    if (url.pathname.startsWith("/_admin_api")) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Block settings on public hosts (serve custom 404)
    if (isBlockedPath(host, url.pathname)) {
      return serveNotFoundPage(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
    }

    // Prettify URLs (redirect /name -> /name.html, /folder -> /folder/folder.html)
    const pretty = resolvePrettyPath(url.pathname);
    if (pretty?.redirect) {
      const target = new URL(request.url);
      target.pathname = pretty.redirect;
      return Response.redirect(target.toString(), 301);
    }

    // GLOBAL GATE
    const state = await getState(env);

    if (!state.enabled || state.mode === "off" || isBypass) {
      if (pretty?.rewrite) {
        const prettyUrl = new URL(request.url);
        prettyUrl.pathname = pretty.rewrite;
        const res = await fetchFromOrigin(request, prettyUrl, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
        if (res.status !== 404) return res;
        const accept = request.headers.get("Accept") || "";
        if (accept.includes("text/html")) {
          return serveNotFoundPage(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
        }
        return res;
      }
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

function json(data) {
  return new Response(JSON.stringify(data), {
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

async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (token !== env.ADMIN_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }

  if (url.pathname === "/_maint/bypass") {
    if (!env.ADMIN_BYPASS_TOKEN) {
      return new Response("Missing ADMIN_BYPASS_TOKEN", { status: 500 });
    }

    const stage = url.searchParams.get("stage") || "1";
    const host = url.host;
    const isWww = host.toLowerCase().startsWith("www.");

    // stage 1: jesteś na apex -> ustaw cookie dla apex i przejdź na www
    if (stage === "1" && !isWww) {
      const next = new URL(url.toString());
      next.host = `www.${host}`;
      next.searchParams.set("stage", "2");

      return new Response("Bypass ON (stage 1)", {
        status: 302,
        headers: {
          "Set-Cookie": setAdminBypassCookie(env),
          "Location": next.toString(),
          "Cache-Control": "no-store"
        }
      });
    }

    // stage 2: jesteś na www (albo od razu wszedłeś na www) -> ustaw cookie dla www i wróć na /
    return new Response("Bypass ON (stage 2)", {
      status: 302,
      headers: {
        "Set-Cookie": setAdminBypassCookie(env),
        "Location": "/",
        "Cache-Control": "no-store"
      }
    });
  }

  if (url.pathname === "/_maint/bypass_off") {
    const stage = url.searchParams.get("stage") || "1";
    const host = url.host;
    const isWww = host.toLowerCase().startsWith("www.");

    // stage 1: jesteś na apex -> skasuj cookie dla apex i przejdź na www
    if (stage === "1" && !isWww) {
      const next = new URL(url.toString());
      next.host = `www.${host}`;
      next.searchParams.set("stage", "2");

      return new Response("Bypass OFF (stage 1)", {
        status: 302,
        headers: {
          "Set-Cookie": clearAdminBypassCookie(),
          "Location": next.toString(),
          "Cache-Control": "no-store"
        }
      });
    }

    // stage 2: skasuj cookie dla www i wróć na /
    return new Response("Bypass OFF (stage 2)", {
      status: 302,
      headers: {
        "Set-Cookie": clearAdminBypassCookie(),
        "Location": "/",
        "Cache-Control": "no-store"
      }
    });
  }

  if (url.pathname === "/_maint/off") {
    await env.MAINT_KV.put("state", JSON.stringify({
      enabled: false,
      mode: "off",
      returnAt: null
    }));
    return new Response("Maintenance OFF");
  }

  if (url.pathname === "/_maint/message") {
    await env.MAINT_KV.put("state", JSON.stringify({
      enabled: true,
      mode: "message",
      returnAt: null
    }));
    return new Response("Maintenance MESSAGE");
  }

  if (url.pathname === "/_maint/returnAt") {
    const t = url.searchParams.get("t");
    await env.MAINT_KV.put("state", JSON.stringify({
      enabled: true,
      mode: "returnAt",
      returnAt: t || null
    }));
    return new Response("Maintenance RETURN_AT");
  }

  if (url.pathname === "/_maint/countdown") {
    const t = url.searchParams.get("t");
    await env.MAINT_KV.put("state", JSON.stringify({
      enabled: true,
      mode: "countdown",
      returnAt: t || null
    }));
    return new Response("Maintenance COUNTDOWN");
  }

  return new Response("Unknown command", { status: 400 });
}

async function handleAdminApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/_admin_api/me") {
    const ok = await isAdminAuthorized(request, env);
    return new Response(ok ? "OK" : "Unauthorized", { status: ok ? 200 : 401 });
  }

  if (url.pathname === "/_admin_api/login") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (!env.ADMIN_PANEL_USERNAME || !env.ADMIN_PANEL_PASSWORD) {
      return new Response("Missing ADMIN_PANEL_USERNAME or ADMIN_PANEL_PASSWORD", { status: 500 });
    }

    const rate = await checkLoginRateLimit(request, env);
    if (!rate.ok) {
      return new Response("Too Many Requests", { status: 429 });
    }

    const body = await readJson(request);
    const username = body?.username || "";
    const password = body?.password || "";
    if (username !== env.ADMIN_PANEL_USERNAME || password !== env.ADMIN_PANEL_PASSWORD) {
      return new Response("Forbidden", { status: 403 });
    }
    const token = await createSettingsSession(env);
    return new Response("OK", {
      headers: {
        "Set-Cookie": setSettingsCookie(token),
        "Cache-Control": "no-store"
      }
    });
  }

  if (url.pathname === "/_admin_api/logout") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const token = getCookie(request, "__Host-fml_settings");
    if (token) {
      await env.MAINT_KV.delete(`settings_session:${token}`);
    }
    return new Response("OK", {
      headers: {
        "Set-Cookie": clearSettingsCookie(),
        "Cache-Control": "no-store"
      }
    });
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
        "Set-Cookie": setAdminBypassCookieForAllDomains(env),
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

const PRETTY_ROUTES = {
  "/account": "/account",
  "/bases": "/bases",
  "/builder": "/builder",
  "/buzzer": "/buzzer",
  "/confirm": "/confirm",
  "/editor": "/editor",
  "/host": "/host",
  "/login": "/login",
  "/maintenance": "/maintenance",
  "/manual": "/manual",
  "/poll-go": "/poll-go",
  "/poll-points": "/poll-points",
  "/poll-qr": "/poll-qr",
  "/poll-text": "/poll-text",
  "/polls": "/polls",
  "/polls-hub": "/polls-hub",
  "/privacy": "/privacy",
  "/reset": "/reset",
  "/settings": "/settings.html",
  "/subscriptions": "/subscriptions",

  "/control": "/control",
  "/display": "/display",
  "/logo-editor": "/logo-editor",
  "/base-explorer": "/base-explorer",
};

function isFolderRoute(pretty) {
  const target = PRETTY_ROUTES[pretty];
  return Boolean(target && target.startsWith(`${pretty}/`));
}

function resolvePrettyPath(pathname) {
  if (pathname === "/index.html") return { redirect: "/" };
  if (pathname.endsWith("/")) {
    const base = pathname.slice(0, -1);
    if (PRETTY_ROUTES[base]) {
      if (isFolderRoute(base)) return { rewrite: PRETTY_ROUTES[base] };
      return { redirect: base };
    }
  }
  if (PRETTY_ROUTES[pathname]) {
    if (isFolderRoute(pathname)) return { redirect: `${pathname}/` };
    return { rewrite: PRETTY_ROUTES[pathname] };
  }
  for (const [pretty, file] of Object.entries(PRETTY_ROUTES)) {
    if (pathname === file) {
      return { redirect: isFolderRoute(pretty) ? `${pretty}/` : pretty };
    }
  }
  return null;
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

async function hasSettingsSession(request, env) {
  const token = getCookie(request, "__Host-fml_settings");
  if (!token) return false;
  const key = `settings_session:${token}`;
  const value = await env.MAINT_KV.get(key);
  return Boolean(value);
}

async function isAdminAuthorized(request, env) {
  if (hasAccessJwt(request)) return true;
  return hasSettingsSession(request, env);
}

async function createSettingsSession(env) {
  const token = crypto.randomUUID();
  const ttl = 60 * 60 * 24 * 30;
  await env.MAINT_KV.put(`settings_session:${token}`, "1", { expirationTtl: ttl });
  return token;
}

function setSettingsCookie(token) {
  return `__Host-fml_settings=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}

function clearSettingsCookie() {
  return `__Host-fml_settings=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function checkLoginRateLimit(request, env) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  const key = `settings_login_rate:${ip}`;
  const raw = await env.MAINT_KV.get(key);
  let data = raw ? JSON.parse(raw) : { count: 0 };
  data.count = (data.count || 0) + 1;
  await env.MAINT_KV.put(key, JSON.stringify(data), { expirationTtl: 300 });
  return { ok: data.count <= 5 };
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

function setAdminBypassCookie(env) {
  // __Host- => wymaga Secure, Path=/ i bez Domain (host-only)
  return `__Host-fml_admin=${env.ADMIN_BYPASS_TOKEN}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}

function clearAdminBypassCookie() {
  return `__Host-fml_admin=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function setAdminBypassCookieForAllDomains(env) {
  // __Secure- pozwala na Domain=.familiada.online (shared for apex + www)
  return `__Secure-fml_admin=${env.ADMIN_BYPASS_TOKEN}; Path=/; Domain=familiada.online; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000`;
}

function clearAdminBypassCookieForAllDomains() {
  return `__Secure-fml_admin=; Path=/; Domain=familiada.online; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}
