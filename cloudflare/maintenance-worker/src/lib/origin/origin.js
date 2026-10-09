// src/lib/origin.js -- proxying to the GitHub Pages origin, maintenance/404
// pages, and host/path classification.
import { withHeaders } from "../core/http.js";

// Fetch from apex origin but resolve directly to GitHub Pages to avoid recursion.
export const ORIGIN_BASE = "https://familiada.online";
export const ORIGIN_HOST = "familiada.online";
export const ORIGIN_RESOLVE = "andrish97.github.io";

export async function serveMaintenance(request, originBase, originHost, resolveOverride) {
  const maintUrl = new URL("/maintenance/index.html", originBase);
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

export async function serveNotFoundPage(request, originBase, originHost, resolveOverride) {
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

export const KNOWN_HOSTS = [
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

export function isKnownHost(host) {
  return KNOWN_HOSTS.includes(host);
}

export function isBlockedPath(host, pathname) {
  for (const rule of BLOCKED_PATHS) {
    if (!rule.hosts.includes(host)) continue;
    if (rule.paths.includes(pathname)) return true;
    if (pathname.startsWith("/tools/")) return true;
    if (pathname.startsWith("/settings-tools/") || pathname.startsWith("/settings/")) return true;
  }
  return false;
}

export function fetchFromOrigin(request, url, originBase, originHost, resolveOverride) {
  const isTvConnect = ["/connect-device", "/connect-device/", "/connect-device/index.html"].includes(url.pathname)
    && url.searchParams.get("tv") === "1";
  const targetPath = isTvConnect ? "/connect-device/tv/index.html" : pageIndexPath(url.pathname);
  const target = new URL(targetPath + url.search, originBase);
  return fetchWithOrigin(target.toString(), request, originHost, resolveOverride);
}

const PAGE_ROUTES = new Set([
  "account", "bases", "bases/explorer", "buzzer",
  "connect-device", "connect-device/tv", "control", "display",
  "games", "games/editor", "games/settings", "host", "login", "login/confirm", "login/reset",
  "logo", "logo/editor/draw", "logo/editor/image", "logo/editor/text",
  "maintenance", "manual", "marketplace", "go",
  "polls", "polls/vote/points", "polls/vote/qr", "polls/vote/text",
  "privacy", "subscriptions",
]);

export function pageIndexPath(pathname) {
  if (pathname === "/") return "/index.html";
  const route = pathname.replace(/^\//, "").replace(/\/$/, "");
  return PAGE_ROUTES.has(route) ? `/${route}/index.html` : pathname;
}

export async function fetchWith404(request, originBase, originHost, resolveOverride) {
  const url = new URL(request.url);
  const res = await fetchFromOrigin(request, url, originBase, originHost, resolveOverride);
  if (res.status >= 300 && res.status < 400) return res;
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

export async function fetchWithOrigin(url, request, originHost, resolveOverride, opts = {}) {
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

  // Preserve origin redirects, including Location, rather than returning
  // their HTML body without a destination.
  if (res.status >= 300 && res.status < 400 && res.headers.has("Location")) {
    return withHeaders(res, { "Cache-Control": "no-store" });
  }

  const ct = res.headers.get("Content-Type") || "";
  const accept = headers.get("Accept") || "";

  // Wywołane wyłącznie przez serveStaticAsset(): odwrotność reszty tej
  // funkcji, która celowo wymusza no-store na WSZYSTKICH innych odpowiedziach
  // (łącznie z tymi samymi rozszerzeniami niżej) - HTML z bramki maintenance,
  // odpowiedzi SSR itd. muszą zostać świeże. Tylko ta jedna ścieżka wie, że
  // serwuje coś, co faktycznie wolno cache'ować.
  if (opts.staticAsset && res.status === 200) {
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": ct, "Cache-Control": opts.cacheControl || "public, max-age=600" }
    });
  }

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
