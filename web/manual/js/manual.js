// js/pages/manual.js
// Zakładki mają działać nawet jeśli auth się nie załaduje.
// Najpierw UI, potem auth „miękko”.

import { confirmModal } from "../../shared/js/core/modal.js?v=v2026-10-09T19290";
import { initI18n, setUiLang } from "../../shared/translation/translation.js?v=v2026-10-09T19290";
import { linkTo, backHref, renderBackLabel } from "../../shared/js/core/nav-map.js?v=v2026-10-09T19290";
import { initTopbarAccountDropdown } from "../../shared/js/core/topbar-controller.js?v=v2026-10-09T19290";
import "../../shared/js/core/contact-modal.js?v=v2026-10-09T19290";

import { decorateManualControls } from "./controls.js?v=v2026-10-09T19290";

function isModalMode() {
  const p = new URLSearchParams(location.search);
  const m = p.get("modal");
  return m && m !== "false";
}

async function initManualI18n() {
  const params = new URLSearchParams(location.search);
  const hasLangParam = params.has("lang");
  const storedLang = localStorage.getItem("uiLang");

  if (!hasLangParam && !storedLang) {
    await setUiLang("pl", { persist: true, updateUrl: true, apply: false });
  }

  await initI18n({ withSwitcher: !isModalMode() });
}

function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function byId(id) { return document.getElementById(id); }

function getTabs() {
  return Array.from(document.querySelectorAll(".simple-tabs .tab, .modal-tabs .tab"));
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

function setActive(name, { updateHash = true } = {}) {
  if (!pages[name]) name = "general";

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
  if (updateHash && location.hash !== `#${name}`) location.hash = name;
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

  const hashInitial = (location.hash || "").replace("#", "");
  const p = new URLSearchParams(location.search);
  const paramInitial = p.get("tab") || "";
  const initial = hashInitial || paramInitial;
  if (initial && pages[initial]) setActive(initial, { updateHash: false });
  else setActive("general", { updateHash: false });

  window.addEventListener("hashchange", () => {
    const name = location.hash.replace(/^#/, "");
    setActive(pages[name] ? name : "general", { updateHash: false });
  });
}

function applyControlModalLayout() {
  if (!isModalMode()) return;
  // Ensure the class is set (fallback if inline script didn't run)
  document.documentElement.classList.add("modal-mode");
  document.body.classList.add("manual-in-control-modal");
  byId("btnBack")?.remove();
  byId("who")?.remove();
  byId("btnLogout")?.remove();

  // Remove topbar sections so mobile controller has nothing to move
  document.querySelector(".topbar-section-2")?.remove();
  document.querySelector(".topbar-section-4")?.remove();

  // Replace simple-tabs with modal-tabs so topbar-controller doesn't pick it up
  const tabs = document.querySelector(".simple-tabs");
  if (tabs) {
    tabs.classList.remove("simple-tabs");
    tabs.classList.add("modal-tabs");
  }
}


function wireFallbackNav() {
  byId("btnBack")?.addEventListener("click", () => {
    location.href = backHref("manual");
  });

  byId("btnLegal")?.addEventListener("click", () => {
    location.href = linkTo("privacy", { modal: new URLSearchParams(location.search).get("modal") });
  });

}


async function wireAuthSoft() {
  const auth = await import("../../shared/js/core/auth.js?v=v2026-10-09T19290");
  // Pełna strona jest częścią panelu użytkownika i wymaga sesji. Wersja
  // modalna jest osadzanym dokumentem pomocy — nie może zamienić iframe'u
  // w ekran logowania, gdy auth jest chwilowo niedostępny lub nie istnieje.
  const user = isModalMode()
    ? await auth.getUser().catch(() => null)
    : await auth.requireAuth("/login/");

  if (!user && !isModalMode()) return;

  initTopbarAccountDropdown(user);
  document.querySelector('.topbar')?.classList.add('topbar-ready');
}

/* ================= Init ================= */
async function init() {
  try {
    await initManualI18n();
  } catch (err) {
    console.error("[manual] i18n nieaktywny:", err);
  } finally {
    document.documentElement.classList.remove('page-loading');
  }

  decorateManualControls(document, document.documentElement.lang);
  applyControlModalLayout();
  wireTabs();
  renderBackLabel(byId("btnBack"), "manual");
  wireFallbackNav();

  wireAuthSoft().catch((err) => {
    console.warn("[manual] auth nieaktywny:", err);
  });
}

void init();


window.addEventListener("i18n:lang", () => {
  decorateManualControls(document, document.documentElement.lang);
});
