// See cloudflare/README.md for full behavior and checklist.
//
// This file is the thin router/entry point only -- all actual logic lives in
// src/lib/*.js, split by functionality (admin APIs, mail, contact form,
// inbound email/MIME parsing, SSR, E2E test bypass, Supabase client, origin
// proxying, etc). This split is purely mechanical (every line of logic moved
// verbatim into its new file, nothing rewritten) -- see git history for the
// single-file version if something here looks surprising.
import { handleInboundEmail } from "./lib/email/inbound-email.js";
import { cleanupExpiredAttachments, cleanupExpiredE2EEmails } from "./lib/core/cleanup.js";
import { handleE2EApi, handleE2ELoginBypass, authorizeE2EApi } from "./lib/e2e/e2e-api.js";
import { getState } from "./lib/core/state.js";
import { json, withHeaders } from "./lib/core/http.js";
import { handleAdminApi } from "./lib/admin/admin-api.js";
import {
  ORIGIN_BASE,
  ORIGIN_HOST,
  ORIGIN_RESOLVE,
  fetchFromOrigin,
  fetchWith404,
  isKnownHost,
  isBlockedPath,
  serveMaintenance,
  serveNotFoundPage,
} from "./lib/origin/origin.js";
import {
  isSettingsAsset,
  isStaticAssetPath,
  serveStaticAsset,
  isCommonAsset,
  isMaintenanceAsset,
} from "./lib/origin/assets.js";
import { hasAdminBypass } from "./lib/admin/admin-auth.js";
import { handleNotifySubmission } from "./lib/notifications/telegram.js";
import { handleContactAppend, handleContactSubmit } from "./lib/email/contact.js";
import { isBot, serveGameDetailSsr, serveMarketplaceSsr, serveDynamicSitemap } from "./lib/ssr/ssr.js";
import { tvRedirect } from "./lib/origin/tv.js";

export default {
  async email(message, env) {
    try {
      await handleInboundEmail(message, env);
    } catch (err) {
      console.error("[email] unhandled error:", err);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([
      cleanupExpiredAttachments(env),
      cleanupExpiredE2EEmails(env),
    ]));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.host.toLowerCase();
    if (host === "www.familiada.online" || host === "familiada.online" || host === "settings.familiada.online") {
      const redirect = tvRedirect(request, url);
      if (redirect) return redirect;
    }

    // Prywatne API testow produkcyjnych. Obslugiwane przed redirectem apex
    // i maintenance gate, ale zawsze wymaga krotkozyjacego tokenu HMAC.
    if (
      (host === "www.familiada.online" || host === "familiada.online") &&
      url.pathname.startsWith("/_e2e_api/")
    ) {
      return handleE2EApi(request, env, url);
    }

    // PUBLIC STATE ENDPOINT (works on every host/subdomain, ignore ?v= cache-busting)
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
        url.pathname = "/settings/index.html";
        return fetchFromOrigin(request, url, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
      }

      // allow settings-tools and assets only
      if (url.pathname.startsWith("/settings/tools/") || isSettingsAsset(url.pathname) || url.pathname === "/version.txt") {
        const res = await fetchFromOrigin(request, url, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
        if (url.pathname.startsWith("/settings/tools/")) {
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
      // NIE dodawaj tu cf.resolveOverride wskazującego z powrotem na ten sam
      // `host` — to nie jest "wymuszenie użycia rekordu DNS", tylko każe
      // temu subrequestowi z Workera ponownie wejść w edge Cloudflare dla
      // TEJ SAMEJ strefy/hosta. panel.familiada.online i
      // supabase.familiada.online mają politykę Cloudflare Access — taki
      // subrequest (bez sesji/ciasteczka logowania) wpada w bramkę Access i
      // origin staje się nieosiągalny (błąd "3 warstwy Cloudflare" widoczny
      // 15.09 po wdrożeniu tej zmiany, cofniętej w tym samym commicie).
      // resolveOverride ma sens tylko gdy wskazuje NA ZEWNĄTRZ strefy (patrz
      // ORIGIN_RESOLVE = "andrish97.github.io" niżej) - żeby ominąć
      // zapętlenie subrequestu w tego samego Workera, nie żeby "użyć DNS".
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

    // Statyczne assety (dowolny folder, dopasowane po rozszerzeniu, nie po
    // prefiksie ścieżki) — omijają całkowicie GLOBAL GATE i KV. Tu host jest
    // zawsze www.familiada.online: apex zawsze przekierowuje wyżej, a
    // settings/panel/supabase/api/leads/nieznane subdomeny już zwróciły
    // odpowiedź w blokach powyżej. Patrz isStaticAssetPath — jeden wyjątek
    // (/maintenance-state.json) zostaje w normalnej bramce, bo czyta KV.
    if ((request.method === "GET" || request.method === "HEAD") && isStaticAssetPath(url.pathname)) {
      return serveStaticAsset(request, url, ctx, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
    }

    // E2E test bypass — tylko strona logowania, tylko z poprawnym jednorazowym
    // tokenem (patrz tests/README.md). Podmienia data-captcha-site-key na
    // oficjalny, zawsze-przechodzący testowy sitekey Turnstile — nic więcej.
    if (
      (host === "www.familiada.online" || host === "familiada.online") &&
      ["/login", "/login/", "/login/index.html"].includes(url.pathname) &&
      request.method === "GET"
    ) {
      const e2eRes = await handleE2ELoginBypass(request, env, url, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
      if (e2eRes) return e2eRes;
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

    // Explicit language parameters must survive proxying. Removing lang=pl
    // would make a fresh English-language browser render English instead.

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
      return serveDynamicSitemap(env, ctx);
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

    // Signed, short-lived production-test token bypasses maintenance only.
    // It grants no account session or access to admin endpoints.
    if (host === "www.familiada.online" && ["GET", "HEAD"].includes(request.method)
        && await authorizeE2EApi(request, env)) {
      return fetchWith404(request, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE);
    }

    // GLOBAL GATE
    const state = await getState(env);

    if (!state.enabled || state.mode === "off" || isBypass) {
      if (["/connect/", "/connect", "/connect/index.html"].includes(url.pathname) && url.searchParams.get("tv") === "1") {
        const tvUrl = new URL(url);
        tvUrl.pathname = "/connect/tv/index.html";
        return withHeaders(await fetchFromOrigin(request, tvUrl, ORIGIN_BASE, ORIGIN_HOST, ORIGIN_RESOLVE), { "Cache-Control": "no-store", Vary: "User-Agent" });
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
