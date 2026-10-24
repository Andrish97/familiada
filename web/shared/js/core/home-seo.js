// Wspólny model metadanych dla HTML z Workera i przełącznika języka strony.
export function homeSeo(lang, t) {
  const language = ["pl", "en", "uk"].includes(lang) ? lang : "pl";
  const url = `https://www.familiada.online/${language === "pl" ? "" : `?lang=${language}`}`;
  return {
    lang: language,
    url,
    title: t("home.title"),
    description: t("home.seo.description"),
    locale: { pl: "pl_PL", en: "en_US", uk: "uk_UA" }[language],
  };
}

export function homeSchemas(seo, t, questions) {
  return {
    application: {
      "@context": "https://schema.org", "@type": "SoftwareApplication",
      name: "Familiada Online", url: seo.url, inLanguage: seo.lang,
      operatingSystem: "Web", applicationCategory: "GameApplication",
      offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" },
      description: seo.description,
      featureList: [1, 2, 3, 4].map((n) => t(`home.tiles.t${n}.t`)),
    },
    website: {
      "@context": "https://schema.org", "@type": "WebSite",
      name: "Familiada Online", url: seo.url, inLanguage: seo.lang,
      description: seo.description,
    },
    faq: {
      "@context": "https://schema.org", "@type": "FAQPage",
      url: seo.url, inLanguage: seo.lang,
      mainEntity: questions.map(({ q, a }) => ({
        "@type": "Question", name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  };
}

// JSON-LD trafia też bezpośrednio do HTML: tekst nie może zamknąć <script>.
export function schemaJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
