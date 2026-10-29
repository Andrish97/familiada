import plHome from "../../../../../web/shared/translation/pl/home.js";
import enHome from "../../../../../web/shared/translation/en/home.js";
import ukHome from "../../../../../web/shared/translation/uk/home.js";
import plCommon from "../../../../../web/shared/translation/pl/common.js";
import enCommon from "../../../../../web/shared/translation/en/common.js";
import ukCommon from "../../../../../web/shared/translation/uk/common.js";
import { homeSeo, homeSchemas, schemaJson } from "../../../../../web/shared/js/core/home-seo.js";

const DICTS = {
  pl: { ...plCommon, ...plHome },
  en: { ...enCommon, ...enHome },
  uk: { ...ukCommon, ...ukHome },
};

export function homeDictionary(lang) {
  return DICTS[lang] || DICTS.pl;
}

export function homeText(dict, key) {
  const value = key.split(".").reduce((v, part) => v?.[part], dict);
  if (typeof value !== "string") return null;
  return value.replace(/\{(\w+)\}/g, (match, name) => ({
    year: new Date().getFullYear(), site: "https://www.familijna.app", siteHost: "www.familijna.app",
  })[name] ?? match);
}

// Ta sama strona i ten sam język dla ludzi i robotów; bez zależności od bazy.
export function localizeHome(request, response) {
  const url = new URL(request.url);
  if (url.hostname !== "www.familijna.app" || !["/", "/index.html"].includes(url.pathname)
      || !["GET", "HEAD"].includes(request.method) || response.status !== 200
      || !response.headers.get("Content-Type")?.includes("text/html")) return response;
  const lang = ["en", "uk"].includes(url.searchParams.get("lang")) ? url.searchParams.get("lang") : "pl";
  const dict = homeDictionary(lang);
  const t = (key) => homeText(dict, key) ?? key;
  const seo = homeSeo(lang, t);
  const schemas = homeSchemas(seo, t, Object.values(dict.home.faq).filter((v) => v?.q && v?.a));
  const rewriter = new HTMLRewriter()
    .on("head", { element(el) {
      // Obsługuje też poprzedni szablon Pages, bez nowych znaczników.
      const jsonLd = Object.entries(schemas).map(([name, value]) =>
        `<script type="application/ld+json" data-home-schema="${name}">${schemaJson(value)}</script>`).join("");
      el.append(jsonLd, { html: true });
    } })
    .on("html", { element(el) { el.setAttribute("lang", lang); } })
    .on("[data-i18n]", { element(el) {
      const text = homeText(dict, el.getAttribute("data-i18n"));
      if (text !== null) el.setInnerContent(text);
    } })
    .on('meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]', { element(el) {
      const name = el.getAttribute("name") || el.getAttribute("property");
      el.setAttribute("content", name.endsWith("title") ? seo.title : seo.description);
    } })
    .on("[data-i18n-content], [data-i18n-alt], [data-i18n-title], [data-i18n-aria-label]", { element(el) {
      for (const attr of ["content", "alt", "title", "aria-label"]) {
        const key = el.getAttribute(`data-i18n-${attr}`);
        const text = key && homeText(dict, key);
        if (text != null) el.setAttribute(attr, text);
      }
    } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute("href", seo.url); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute("content", seo.url); } })
    .on('meta[property="og:locale"]', { element(el) { el.setAttribute("content", seo.locale); } })
    .on('script[type="application/ld+json"]', { element(el) { el.remove(); } });
  const headers = new Headers(response.headers);
  headers.set("Content-Language", lang);
  headers.delete("Content-Length");
  headers.delete("ETag");
  const localized = rewriter.transform(new Response(response.body, { status: response.status, headers }));
  return request.method === "HEAD" ? new Response(null, { headers: localized.headers }) : localized;
}
