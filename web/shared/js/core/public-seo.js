// Publiczne dokumenty: jedna polityka URL w Workerze i przy zmianach języka/rozdziału.
export const PUBLIC_LANGS = ["pl", "en", "uk"];
export const publicLang = (lang) => PUBLIC_LANGS.includes(lang) ? lang : "pl";
export const escapePublicHtml = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function publicUrl(page, lang, chapter = null) {
  const url = new URL(page === "manual" ? "/manual/" : "/privacy", "https://www.familiada.online");
  if (page === "manual" && chapter) url.searchParams.set("ch", chapter);
  if (publicLang(lang) !== "pl") url.searchParams.set("lang", publicLang(lang));
  return url.href;
}

export function publicSeo(page, lang, title, description, chapter = null) {
  lang = publicLang(lang);
  return {
    lang, url: publicUrl(page, lang, chapter?.id),
    title,
    description,
  };
}

export function publicMetaHtml(page, seo, chapter = null) {
  const esc = escapePublicHtml;
  return `<meta name="description" content="${esc(seo.description)}">
    <link rel="canonical" href="${esc(seo.url)}">
    ${[...PUBLIC_LANGS, "x-default"].map((lang) => `<link rel="alternate" hreflang="${lang}" href="${esc(publicUrl(page, lang, chapter?.id))}">`).join("\n")}
    <meta property="og:title" content="${esc(seo.title)}">
    <meta property="og:description" content="${esc(seo.description)}">
    <meta property="og:url" content="${esc(seo.url)}">
    <meta property="og:type" content="article">`;
}

export function syncPublicSeo(page, lang, title, description, chapter = null) {
  const seo = publicSeo(page, lang, title, description, chapter);
  document.title = seo.title;
  document.documentElement.lang = seo.lang;
  const set = (selector, tag, attrs) => {
    let el = document.head.querySelector(selector);
    if (!el) { el = document.createElement(tag); document.head.append(el); }
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  };
  set('meta[name="description"]', "meta", { name: "description", content: seo.description });
  set('link[rel="canonical"]', "link", { rel: "canonical", href: seo.url });
  for (const lang of [...PUBLIC_LANGS, "x-default"]) {
    set(`link[hreflang="${lang}"]`, "link", { rel: "alternate", hreflang: lang, href: publicUrl(page, lang, chapter?.id) });
  }
  for (const [key, value] of Object.entries({ title: seo.title, description: seo.description, url: seo.url, type: "article" })) {
    set(`meta[property="og:${key}"]`, "meta", { property: `og:${key}`, content: value });
  }
}
