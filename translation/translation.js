import pl from "./pl.js";

const LANG_LOADERS = {
  pl: async () => pl,
  en: async () => (await import("./en.js")).default,
  uk: async () => (await import("./uk.js")).default,
};

const LANG_ORDER = ["pl", "en", "uk"];

let currentLang = "pl";
let translations = pl;

let switcherEl = null; // container w topbarze
let menuEl = null;     // portal w body

function getCurrentYear() {
  return new Date().getFullYear();
}

function normalizeLang(raw) {
  const v = String(raw || "").toLowerCase();
  if (v.startsWith("pl")) return "pl";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("uk") || v.startsWith("ua")) return "uk";
  return "pl";
}

function safeGetLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function getUiLang() {
  const params = new URLSearchParams(location.search);
  const q = params.get("lang");
  if (q) return normalizeLang(q);

  const stored = safeGetLocalStorage("uiLang");
  if (stored) return normalizeLang(stored);

  if (navigator?.language) return normalizeLang(navigator.language);
  return "pl";
}

export async function setUiLang(
  lang,
  { persist = true, updateUrl = true, apply = true } = {}
) {
  const next = normalizeLang(lang);
  const loader = LANG_LOADERS[next] || LANG_LOADERS.pl;

  translations = await loader();
  currentLang = translations?.meta?.lang || next;

  if (persist) safeSetLocalStorage("uiLang", currentLang);

  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set("lang", currentLang);
    history.replaceState({}, "", url);
  }

  document.documentElement.lang = currentLang;

  if (apply) applyTranslations(document);
  updateSwitcherLabel();

  window.dispatchEvent(new CustomEvent("i18n:lang", { detail: { lang: currentLang } }));
}

export async function initI18n({ withSwitcher = true, apply = true } = {}) {
  await setUiLang(getUiLang(), { persist: true, updateUrl: true, apply });

  if (withSwitcher) {
    // ✅ Jeśli initI18n jest wołane zanim DOM istnieje (np. top-level await),
    // to switcher nie ma gdzie się wstrzyknąć i potrafi wysypać całą stronę.
    if (typeof document !== "undefined" && document.readyState === "loading") {
      await new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true })
      );
    }
    await injectLanguageSwitcher();
  }
}

export function t(key, vars = {}) {
  const value = key
    .split(".")
    .reduce(
      (acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined),
      translations || pl
    );

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
  const defaultVars = {
    site: (typeof location !== "undefined" ? location.origin : ""),
    siteHost: (typeof location !== "undefined" ? location.host : ""),
    year: getCurrentYear(),
  };

  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key, defaultVars);
  });

  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (key) el.innerHTML = t(key, defaultVars);
  });

  const attrMap = [
    { attr: "placeholder", data: "data-i18n-placeholder" },
    { attr: "title", data: "data-i18n-title" },
    { attr: "aria-label", data: "data-i18n-aria-label" },
    { attr: "value", data: "data-i18n-value" },
    { attr: "alt", data: "data-i18n-alt" },
    { attr: "content", data: "data-i18n-content" },
  ];

  attrMap.forEach(({ attr, data }) => {
    root.querySelectorAll(`[${data}]`).forEach((el) => {
      const key = el.getAttribute(data);
      if (key) el.setAttribute(attr, t(key, defaultVars));
    });
  });

  root.querySelectorAll("title[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key, defaultVars);
  });
}

async function injectLanguageSwitcher() {
  if (switcherEl) return switcherEl;

  // --- Container w topbarze ---
  const container = document.createElement("div");
  container.className = "lang-switcher";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn lang-btn";
  btn.setAttribute("aria-label", t("common.languageLabel", {
    site: (typeof location !== "undefined" ? location.origin : ""),
    siteHost: (typeof location !== "undefined" ? location.host : ""),
  }));

  // --- Menu jako PORTAL w body ---
  const menu = document.createElement("div");
  menu.className = "lang-menu";
  menu.hidden = true;

  // Ważne: portal do body (żeby nie ucinało przez topbar/overflow/stacking)
  document.body.appendChild(menu);

  // Metadane języków
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
    opt.addEventListener("click", async (e) => {
      e.stopPropagation();
      menu.hidden = true;
      await setUiLang(meta.lang, { persist: true, updateUrl: true, apply: true });
    });
    menu.appendChild(opt);
  });

  // Toggle menu
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    if (!menu.hidden) repositionMenu(container, menu);
  });

  // Klik poza: uwzględnij i container i menu (bo menu jest w body)
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target) && !menu.contains(e.target)) {
      menu.hidden = true;
    }
  });

  window.addEventListener(
    "resize",
    () => {
      if (!menu.hidden) repositionMenu(container, menu);
    },
    { passive: true }
  );

  window.addEventListener(
    "scroll",
    () => {
      if (!menu.hidden) repositionMenu(container, menu);
    },
    { passive: true }
  );

  container.appendChild(btn);

  const topbarLangSection = document.querySelector(".topbar .topbar-section-3");
  if (topbarLangSection) {
    topbarLangSection.prepend(container);
  } else {
    container.classList.add("lang-floating");
    document.body.appendChild(container);
  }

  switcherEl = container;
  menuEl = menu;

  updateSwitcherLabel();
  return switcherEl;
}

function repositionMenu(container, menu) {
  // Pomiar gdy hidden=true (nie ma wymiarów)
  const wasHidden = menu.hidden;
  if (wasHidden) {
    menu.hidden = false;
    menu.style.visibility = "hidden";
    menu.style.pointerEvents = "none"; // NIE BLOKUJ KLIKÓW podczas pomiaru
  }

  // fixed overlay
  menu.style.position = "fixed";

  const cRect = container.getBoundingClientRect();
  const mRect = menu.getBoundingClientRect();

  const padding = 8;

  // Preferuj wyrównanie do prawej krawędzi przycisku
  let left = cRect.right - mRect.width;

  // Clamp X
  left = Math.min(left, window.innerWidth - mRect.width - padding);
  left = Math.max(left, padding);

  // Preferuj pod przyciskiem
  let top = cRect.bottom + 8;

  // Jeśli nie mieści się na dole -> nad przyciskiem
  if (top + mRect.height > window.innerHeight - padding) {
    top = cRect.top - mRect.height - 8;
  }

  // Clamp Y
  top = Math.min(top, window.innerHeight - mRect.height - padding);
  top = Math.max(top, padding);

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.right = "auto";
  menu.style.transform = "";

  if (wasHidden) {
    menu.style.visibility = "";
    menu.style.pointerEvents = "";
    menu.hidden = true;
  }
}

function updateSwitcherLabel() {
  if (!switcherEl) return;
  const btn = switcherEl.querySelector(".lang-btn");
  if (!btn) return;

  const meta = translations?.meta || pl.meta;
  btn.textContent = meta.flag;
  btn.setAttribute("aria-label", t("common.languageLabel"));
}

// -----------------------------------------------------------------------------
// BFCache / back-forward navigation fix
// Przy powrocie na stronę (pageshow) JS nie jest restartowany,
// więc musimy ponownie zsynchronizować język z URL / localStorage
// -----------------------------------------------------------------------------

if (typeof window !== "undefined") {
  window.addEventListener("pageshow", () => {
    try {
      // setUiLang robi:
      // - load właściwego słownika
      // - applyTranslations()
      // - synchronizację URL / localStorage
      setUiLang(getUiLang(), {
        persist: true,
        updateUrl: true,
        apply: true,
      });
    } catch (e) {
      console.warn("i18n pageshow sync failed", e);
    }
  });
}
