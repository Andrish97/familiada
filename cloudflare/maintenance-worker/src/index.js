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
