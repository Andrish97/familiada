import pl from "./pl.js";

const LANG_LOADERS = {
  pl: async () => pl,
  en: async () => (await import("./en.js")).default,
  uk: async () => (await import("./uk.js")).default,
};

const LANG_ORDER = ["pl", "en", "uk"];
let currentLang = "pl";
let translations = pl;
let switcherEl = null;

function normalizeLang(raw) {
  const v = String(raw || "").toLowerCase();
  if (v.startsWith("pl")) return "pl";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("uk") || v.startsWith("ua")) return "uk";
  return "pl";
}

export function getUiLang() {
  const params = new URLSearchParams(location.search);
  const q = params.get("lang");
  if (q) return normalizeLang(q);

  const stored = localStorage.getItem("uiLang");
  if (stored) return normalizeLang(stored);

  if (navigator?.language) return normalizeLang(navigator.language);
  return "pl";
}

export async function setUiLang(lang, { persist = true, updateUrl = true, apply = true } = {}) {
  const next = normalizeLang(lang);
  const loader = LANG_LOADERS[next] || LANG_LOADERS.pl;
  translations = await loader();
  currentLang = translations?.meta?.lang || next;

  if (persist) localStorage.setItem("uiLang", currentLang);
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set("lang", currentLang);
    history.replaceState({}, "", url);
  }

  document.documentElement.lang = currentLang;
  if (apply) applyTranslations(document);
  updateSwitcherLabel();
  window.dispatchEvent(
    new CustomEvent("i18n:lang", { detail: { lang: currentLang } })
  );
}

export async function initI18n({ withSwitcher = true, apply = true } = {}) {
  await setUiLang(getUiLang(), { persist: true, updateUrl: true, apply });
  if (withSwitcher) await injectLanguageSwitcher();
}

export function t(key, vars = {}) {
  const value = key
    .split(".")
    .reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), translations || pl);

  if (value == null) return key;
  if (typeof value === "function") return value(vars);

  return String(value).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

export function getI18nSection(section) {
  return (translations && translations[section]) || (pl && pl[section]) || {};
}

export function withLangParam(url) {
  const u = new URL(url, location.href);
  u.searchParams.set("lang", currentLang);
  return u.toString();
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });

  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (key) el.innerHTML = t(key);
  });

  const attrMap = [
    { attr: "placeholder", data: "data-i18n-placeholder" },
    { attr: "title", data: "data-i18n-title" },
    { attr: "aria-label", data: "data-i18n-aria-label" },
    { attr: "value", data: "data-i18n-value" },
    { attr: "alt", data: "data-i18n-alt" },
  ];

  attrMap.forEach(({ attr, data }) => {
    root.querySelectorAll(`[${data}]`).forEach((el) => {
      const key = el.getAttribute(data);
      if (key) el.setAttribute(attr, t(key));
    });
  });

  root.querySelectorAll("title[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
}

async function injectLanguageSwitcher() {
  if (switcherEl) return switcherEl;

  const container = document.createElement("div");
  container.className = "lang-switcher";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn sm lang-btn";
  btn.setAttribute("aria-label", t("common.languageLabel"));

  const menu = document.createElement("div");
  menu.className = "lang-menu";
  menu.hidden = true;

  const metas = await Promise.all(
    LANG_ORDER.map(async (lang) => {
      const loader = LANG_LOADERS[lang] || LANG_LOADERS.pl;
      const data = await loader();
      return data.meta;
    })
  );

  metas.forEach((meta) => {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "lang-option";
    opt.dataset.lang = meta.lang;
    opt.textContent = `${meta.flag} ${meta.label}`;
    opt.addEventListener("click", async () => {
      menu.hidden = true;
      await setUiLang(meta.lang, { persist: true, updateUrl: true, apply: true });
    });
    menu.appendChild(opt);
  });

  btn.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) menu.hidden = true;
  });

  container.appendChild(btn);
  container.appendChild(menu);

  const topbarRight = document.querySelector(".topbar .topbar-right");
  if (topbarRight) {
    topbarRight.prepend(container);
  } else {
    container.classList.add("lang-floating");
    document.body.appendChild(container);
  }

  switcherEl = container;
  updateSwitcherLabel();
  return switcherEl;
}

function updateSwitcherLabel() {
  if (!switcherEl) return;
  const btn = switcherEl.querySelector(".lang-btn");
  if (!btn) return;
  const meta = translations?.meta || pl.meta;
  btn.textContent = meta.flag;
  btn.setAttribute("aria-label", t("common.languageLabel"));
}
