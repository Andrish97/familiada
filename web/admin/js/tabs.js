// admin/js/tabs.js — Zakładki panelu: aktywna karta, adres (?tab=), przełączanie paneli.
// Część panelu admina (E23 §8a: rozbicie admin.js (dawniej settings.js) na moduły paneli).

import { tabFromUrl, setTab } from "../../shared/js/core/tabs.js?v=v2026-10-25T17470";
import { els } from "./core.js?v=v2026-10-25T17470";
import { hideMailNav, setMailView } from "./mailbox.js?v=v2026-10-25T17470";

export let activeTab = "maintenance";

// Strona administratora (poza mapą PAGES): lista kart lokalnie, pierwsza = domyślna.
const SETTINGS_TABS = [
  "maintenance", "mail", "marketplace", "ratings", "stats", "generator",
  "reports", "marketing",
];
const DEFAULT_SETTINGS_TAB = SETTINGS_TABS[0];

export function settingsTabFromUrl() {
  return tabFromUrl(SETTINGS_TABS, DEFAULT_SETTINGS_TAB);
}
let onMarketingTab = null;
// Karta Marketing uruchamia edytor treści przy pierwszym wejściu.
export function onEnterMarketingTab(fn) {
  onMarketingTab = fn;
  if (activeTab === "marketing") fn();
}

export function setActiveTab(tab, { updateUrl = true } = {}) {
  if (tab !== "tools" && !SETTINGS_TABS.includes(tab)) tab = DEFAULT_SETTINGS_TAB;
  activeTab = tab;
  window.activeTab = tab;
  if (tab === "marketing") onMarketingTab?.();

  if (updateUrl && tab !== "tools") setTab(tab, DEFAULT_SETTINGS_TAB);
  
  const btn = document.getElementById("btnTabMaintenance");
  const btnMail = document.getElementById("btnTabMail");
  const btnMarket = document.getElementById("btnTabMarketplace");
  const btnRatings = document.getElementById("btnTabRatings");
  const btnStats = document.getElementById("btnTabStats");
  const btnGen = document.getElementById("btnTabGenerator");
  const btnReports = document.getElementById("btnTabReports");
  const btnMarketing = document.getElementById("btnTabMarketing");
  const tools = document.getElementById("btnTools");

  if (btn) btn.classList.toggle("is-active", tab === "maintenance");
  if (btnMail) btnMail.classList.toggle("is-active", tab === "mail");
  if (btnMarket) btnMarket.classList.toggle("is-active", tab === "marketplace");
  if (btnRatings) btnRatings.classList.toggle("is-active", tab === "ratings");
  if (btnStats) btnStats.classList.toggle("is-active", tab === "stats");
  if (btnGen) btnGen.classList.toggle("is-active", tab === "generator");
  if (btnReports) btnReports.classList.toggle("is-active", tab === "reports");
  if (btnMarketing) btnMarketing.classList.toggle("is-active", tab === "marketing");
  if (tools) tools.classList.toggle("is-active", tab === "tools");

  // Hide/show panels
  if (els.maintenancePanel) els.maintenancePanel.hidden = tab !== "maintenance";
  if (els.mailPanel) els.mailPanel.hidden = tab !== "mail";
  if (els.marketplacePanel) els.marketplacePanel.hidden = tab !== "marketplace";
  if (els.ratingsPanel) els.ratingsPanel.hidden = tab !== "ratings";
  if (els.statsPanel) els.statsPanel.hidden = tab !== "stats";
  if (els.generatorPanel) els.generatorPanel.hidden = tab !== "generator";
  if (els.reportsPanel) els.reportsPanel.hidden = tab !== "reports";
  if (els.marketingPanel) els.marketingPanel.hidden = tab !== "marketing";

  // When entering reports panel, init mail view
  if (tab === "reports") {
    setMailView("list");
  } else {
    hideMailNav();
  }

  if (tab === "generator" && window.resetGeneratorSession) {
    window.resetGeneratorSession();
  }
}
export function labelFromPath(pathname) {
  const raw = pathname.split("/").pop() || pathname;
  return raw.replace(/\.html$/i, "");
}

export function activateSettingsTabFromUrl() {
  const tab = settingsTabFromUrl();
  const buttons = {
    maintenance: els.btnTabMaintenance,
    mail: els.btnTabMail,
    marketplace: els.btnTabMarketplace,
    ratings: els.btnTabRatings,
    stats: els.btnTabStats,
    generator: els.btnTabGenerator,
    reports: els.btnTabReports,
    marketing: els.btnTabMarketing,
  };
  const button = buttons[tab];
  if (button) button.click();
  else setActiveTab(tab, { updateUrl: false });
}
