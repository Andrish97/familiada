import plManual from "../../../../../web/manual/content/pl.js";
import enManual from "../../../../../web/manual/content/en.js";
import ukManual from "../../../../../web/manual/content/uk.js";
import plText from "../../../../../web/shared/translation/pl/manual.js";
import enText from "../../../../../web/shared/translation/en/manual.js";
import ukText from "../../../../../web/shared/translation/uk/manual.js";
import plPrivacy from "../../../../../web/shared/translation/pl/privacy.js";
import enPrivacy from "../../../../../web/shared/translation/en/privacy.js";
import ukPrivacy from "../../../../../web/shared/translation/uk/privacy.js";
import { homeDictionary, homeText } from "./home.js";
import { publicLang, publicUrl, publicSeo, publicMetaHtml } from "../../../../../web/shared/js/core/public-seo.js";
import { manualArticle, manualToc } from "../../../../../web/manual/js/render.js";

const MANUALS = { pl: plManual, en: enManual, uk: ukManual };
const TEXTS = { pl: plText, en: enText, uk: ukText };
const PRIVACY = { pl: plPrivacy, en: enPrivacy, uk: ukPrivacy };
export const MANUAL_CHAPTERS = plManual.chapters.map((ch) => ch.id);

export function publicPage(path) {
  if (["/manual", "/manual/", "/manual/index.html"].includes(path)) return "manual";
  if (["/privacy", "/privacy/", "/privacy/index.html"].includes(path)) return "privacy";
  return null;
}

export function invalidManualChapter(url) {
  return publicPage(url.pathname) === "manual" && url.searchParams.has("ch")
    && !MANUAL_CHAPTERS.includes(url.searchParams.get("ch"));
}

// Gotowa treść z Markdown i słowników, bez bazy, sesji i rozpoznawania botów.
export function localizePublicPage(request, response) {
  const url = new URL(request.url);
  const page = publicPage(url.pathname);
  if (url.hostname !== "www.familiada.online" || !page || !["GET", "HEAD"].includes(request.method)
      || response.status !== 200 || !response.headers.get("Content-Type")?.includes("text/html")) return response;
  const lang = publicLang(url.searchParams.get("lang"));
  const dict = { ...homeDictionary(lang), ...TEXTS[lang], ...PRIVACY[lang] };
  const t = (key, params = {}) => (homeText(dict, key) ?? key)
    .replace(/\{(\w+)\}/g, (m, name) => params[name] ?? m);
  const manual = MANUALS[lang];
  const chapter = page === "manual" ? manual.chapters.find((ch) => ch.id === url.searchParams.get("ch")) : null;
  const seo = publicSeo(page, lang, chapter ? t("manual.chapterTitle", { title: chapter.title }) : t(`${page}.title`),
    page === "privacy" ? t("privacy.description") : chapter?.description || t("manual.startLead"), chapter);
  const href = (id, hash = "") => publicUrl("manual", lang, id).replace("https://www.familiada.online", "") + hash;
  const rewriter = new HTMLRewriter()
    .on("html", { element(el) { el.setAttribute("lang", lang); el.removeAttribute("data-device-guard-pending"); } })
    .on("head", { element(el) { el.append(publicMetaHtml(page, seo, chapter), { html: true }); } })
    .on('meta[name="robots"]', { element(el) { el.setAttribute("content", "index, follow"); } })
    .on('meta[name="description"], link[rel="canonical"], link[hreflang], meta[property^="og:"]', { element(el) { el.remove(); } })
    .on("title", { element(el) { el.removeAttribute("data-i18n"); el.setInnerContent(seo.title); } })
    // Starszy szablon Pages także nie może ukrywać gotowej treści do startu JS.
    .on("body", { element(el) {
      el.setAttribute("class", (el.getAttribute("class") || "").split(/\s+/).filter((c) => c !== "skel-body").join(" "));
    } })
    .on("script:not([src])", { element(el) { el.remove(); } })
    .on('[data-i18n]', { element(el) {
      const value = homeText(dict, el.getAttribute("data-i18n"));
      if (value != null) el.setInnerContent(value);
    } })
    .on('[data-i18n-html="privacy.content"]', { element(el) { el.setInnerContent(dict.privacy.content, { html: true }); } })
    .on("[data-i18n-alt], [data-i18n-title], [data-i18n-aria-label]", { element(el) {
      for (const attr of ["alt", "title", "aria-label"]) {
        const key = el.getAttribute(`data-i18n-${attr}`);
        const value = key && homeText(dict, key);
        if (value != null) el.setAttribute(attr, value);
      }
    } })
    .on("#manualArticle", { element(el) { el.setInnerContent(manualArticle(manual, chapter, t, href), { html: true }); } })
    .on("#manualToc", { element(el) { el.setInnerContent(manualToc(manual, chapter?.id, href), { html: true }); } })
    .on("#manualCurrent", { element(el) { el.setInnerContent(chapter?.title || t("manual.pageTitle")); } })
    .on("#btnLegal", { element(el) { el.setAttribute("href", publicUrl("privacy", lang)); } })
    .on("a#btnBack", { element(el) { el.setAttribute("href", `/${lang === "pl" ? "" : `?lang=${lang}`}`); } })
    .on("[data-skel-step]", { element(el) { el.removeAttribute("data-skel-step"); } });
  const headers = new Headers(response.headers);
  headers.set("Content-Language", lang);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "index, follow");
  headers.delete("ETag");
  headers.delete("Content-Length");
  const localized = rewriter.transform(new Response(response.body, { headers }));
  return request.method === "HEAD" ? new Response(null, { headers: localized.headers }) : localized;
}
