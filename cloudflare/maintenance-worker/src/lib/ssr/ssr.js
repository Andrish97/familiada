// src/lib/ssr.js -- bot detection + server-side rendering for marketplace pages + sitemap.
import { getSupabaseConfig, supabaseRpc } from "../core/supabase.js";
import { escapeHtml } from "../core/utils.js";
import { serveNotFoundPage } from "../origin/origin.js";

export const BOT_UA_PATTERNS = [
  "googlebot", "google-inspectiontool", "mediapartners-google", "googleweblight",
  "bingbot", "slurp", "duckduckbot", "baiduspider",
  "yandexbot", "sogou", "exabot", "facebot", "ia_archiver",
  "linkedinbot", "twitterbot", "whatsapp", "telegrambot",
  "applebot", "semrushbot", "ahrefsbot", "mj12bot",
];

export function isBot(request) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  return BOT_UA_PATTERNS.some(p => ua.includes(p));
}

export async function serveMarketplaceSsr(request, env, url) {
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

export async function serveGameDetailSsr(request, env, url, originBase, originHost, resolveOverride) {
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

export const SITEMAP_CACHE_KEY = new Request("https://www.familiada.online/sitemap.xml");

export async function serveDynamicSitemap(env, ctx) {
  const edgeCache = caches.default;
  const cached = await edgeCache.match(SITEMAP_CACHE_KEY);
  if (cached) return cached;

  const res = await buildDynamicSitemap(env);
  ctx.waitUntil(edgeCache.put(SITEMAP_CACHE_KEY, res.clone()));
  return res;
}

export async function buildDynamicSitemap(env) {
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
