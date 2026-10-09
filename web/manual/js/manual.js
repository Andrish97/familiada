// js/pages/manual.js
// Zakładki mają działać nawet jeśli auth się nie załaduje.
// Najpierw UI, potem initPage (dostęp, „Wstecz”, konto) „miękko”.

import { confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-09T22521";
import { initI18n, setUiLang } from "../../shared/translation/translation.js?v=v2026-10-09T22521";
import { linkTo, PAGES } from "../../shared/js/core/nav-map.js?v=v2026-10-09T22521";
import { tabFromUrl, setTab } from "../../shared/js/core/tabs.js?v=v2026-10-09T22521";
import { initPage } from "../../shared/js/core/page-init.js?v=v2026-10-09T22521";
import "../../shared/js/core/contact-modal.js?v=v2026-10-09T22521";

import { decorateManualControls } from "./controls.js?v=v2026-10-09T22521";

async function initManualI18n() {
  const params = new URLSearchParams(location.search);
  const hasLangParam = params.has("lang");
  const storedLang = localStorage.getItem("uiLang");

  if (!hasLangParam && !storedLang) {
    await setUiLang("pl", { persist: true, updateUrl: true, apply: false });
  }

  await initI18n({ withSwitcher: true });
}

function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function byId(id) { return document.getElementById(id); }

function getTabs() {
  return Array.from(document.querySelectorAll(".simple-tabs .tab"));
}

function updateMobileTabSubtitle(name) {
  const subtitle = byId("manualTabSubtitle");
  if (!subtitle) return;
  const activeTab = getTabs().find((tab) => tab.dataset.tab === name);
  subtitle.textContent = activeTab?.textContent?.trim() || "";
}

const pages = Object.fromEntries(
  qsa(".tab-panel[data-tab]").map((el) => [el.dataset.tab, el])
);

// Pigułki (karty) z mapy stron; karta w ?tab=, #hash zostaje kotwicą w karcie.
const MANUAL_TABS = PAGES.manual.tabs;
const DEFAULT_MANUAL_TAB = MANUAL_TABS[0];

function setActive(name, { updateUrl = true } = {}) {
  if (!pages[name]) name = DEFAULT_MANUAL_TAB;

  getTabs().forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  Object.entries(pages).forEach(([key, el]) => {
    const active = key === name;
    el?.classList.toggle("active", active);
    if (el) el.hidden = !active;
  });
  if (updateUrl) setTab(name, DEFAULT_MANUAL_TAB);
  updateMobileTabSubtitle(name);
}

function wireTabs() {
  const tabs = getTabs();
  tabs.forEach((tab, index) => {
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `tab-${tab.dataset.tab}`);
    tab.addEventListener("click", () => setActive(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let next = index;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      tabs[next]?.focus();
      setActive(tabs[next]?.dataset.tab);
    });
  });

  Object.values(pages).forEach((panel) => panel.setAttribute("role", "tabpanel"));

  setActive(tabFromUrl(MANUAL_TABS, DEFAULT_MANUAL_TAB), { updateUrl: false });
}

function wireLegalLink() {
  byId("btnLegal")?.addEventListener("click", () => {
    location.href = linkTo("privacy");
  });
}


/* ================= Init ================= */
async function init() {
  const i18nP = initManualI18n().catch((err) => {
    console.error("[manual] i18n nieaktywny:", err);
  }).finally(() => {
    document.documentElement.classList.remove('page-loading');
  });
  initPage("manual", { ready: i18nP }).catch((err) => {
    console.warn("[manual] initPage nieaktywny:", err);
  });
  await i18nP;

  decorateManualControls(document, document.documentElement.lang);
  wireTabs();
  wireLegalLink();
}

void init();


window.addEventListener("i18n:lang", () => {
  decorateManualControls(document, document.documentElement.lang);
});
