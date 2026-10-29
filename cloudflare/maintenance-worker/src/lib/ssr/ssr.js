// src/lib/ssr.js -- bot detection + server-side rendering for marketplace pages + sitemap.
import { publicCatalog, marketUnavailable } from "./marketplace.js";
import { escapeHtml } from "../core/utils.js";
import { MANUAL_CHAPTERS } from "./public-pages.js";
import { PUBLIC_LANGS, publicUrl } from "../../../../../web/shared/js/core/public-seo.js";

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

// Świeże źródło także po wycofaniu gry; Cache API starej mapy jest pomijany.
export async function serveDynamicSitemap(env) {
  return buildDynamicSitemap(env);
}

export async function buildDynamicSitemap(env) {
  const STATIC_PAGES = [
    { loc: "https://www.familijna.app/",          lastmod: "2026-10-24", changefreq: "monthly",  priority: "1.0" },
    { loc: "https://www.familijna.app/?lang=en",  lastmod: "2026-10-24", changefreq: "monthly",  priority: "0.8" },
    { loc: "https://www.familijna.app/?lang=uk",  lastmod: "2026-10-24", changefreq: "monthly",  priority: "0.8" },
    ...PUBLIC_LANGS.map((lang) => ({ loc: `https://www.familijna.app/marketplace${lang === "pl" ? "" : `?lang=${lang}`}`, changefreq: "weekly", priority: "0.9" })),
    { loc: "https://www.familijna.app/privacy", changefreq: "yearly", priority: "0.2" },
    ...["en", "uk"].map((lang) => ({ loc: publicUrl("privacy", lang), changefreq: "yearly", priority: "0.2" })),
    ...PUBLIC_LANGS.flatMap((lang) => [null, ...MANUAL_CHAPTERS].map((id) => ({
      loc: publicUrl("manual", lang, id), changefreq: "monthly", priority: "0.5",
    }))),
  ];

  let games;
  try { games = await publicCatalog(env); }
  catch { return marketUnavailable(); }

  const staticUrls = STATIC_PAGES.map(p => `
  <url>
    <loc>${escapeHtml(p.loc)}</loc>
    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ""}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join("");

  const gameUrls = games.filter(g => g.slug).map(g => {
    const cnt = g.library_count || 0;
    const priority = cnt >= 50 ? "0.8" : cnt >= 10 ? "0.7" : "0.6";
    return `
  <url>
    <loc>https://www.familijna.app/marketplace/game/${escapeHtml(g.slug)}</loc>
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
      "Cache-Control": "no-store",
    },
  });
}
