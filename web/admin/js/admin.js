/*
Settings panel (admin)
- GET  /_admin_api/me
- GET  /_admin_api/state
- POST /_admin_api/state { enabled, mode, returnAt }
- POST /_admin_api/off
- POST /_admin_api/bypass
- POST /_admin_api/bypass_off
- GET/POST /_admin_api/mail/settings
- GET /_admin_api/mail/queue
- POST /_admin_api/mail/queue/run
- GET /_admin_api/mail/logs
- GET /_admin_api/stats/overview, /stats/retention, /ratings, /stats/excluded
- POST /_admin_api/stats/excluded { username }, /stats/excluded/remove { user_id }
*/

import { initI18n } from "../../shared/translation/translation.js?v=v2026-10-25T10383";
import { setTopbarNavPriority } from "../../shared/js/core/topbar-controller.js?v=v2026-10-25T10383";
import { startActivityPanel } from "./activity.js?v=v2026-10-25T10383";
import { checkMe, els, showAuth, showPanel, syncTopbarHeight } from "./core.js?v=v2026-10-25T10383";
import { activateSettingsTabFromUrl, activeTab, onEnterMarketingTab, setActiveTab, settingsTabFromUrl } from "./tabs.js?v=v2026-10-25T10383";
import { applyDateOrderByLang, loadState, startCountdownTimer, startPolling, stopPolling, wireMaintenanceEvents } from "./maintenance.js?v=v2026-10-25T10383";
import { initMailSelects, openMailTab, renderCronPresetOptions, renderProviderOrder, syncMailSelectLabels, wireMailSettingsEvents } from "./mail-settings.js?v=v2026-10-25T10383";
import { loadAdminStats, loadExcludedUsers, loadRetentionStats, loadSnakeStats, wireStatsEvents } from "./stats.js?v=v2026-10-25T10383";
import { loadProducerRatings, loadRatings, wireRatingsEvents } from "./ratings.js?v=v2026-10-25T10383";
import { loadMarketplace, wireMarketplaceEvents } from "./marketplace.js?v=v2026-10-25T10383";
import { loadMailFolder, startAdminBadges, wireReportsEvents } from "./mailbox.js?v=v2026-10-25T10383";
import { closeTools, initToolsSelect } from "./tools.js?v=v2026-10-25T10383";
import { initMarketingEditor, wireMarketingEvents } from "./marketing.js?v=v2026-10-25T10383";
import { initMarketingContacts } from "./marketing-contacts.js?v=v2026-10-25T10383";
import "../../shared/js/core/scroll-fade.js?v=v2026-10-25T10383"; // wygaszona krawędź przewijanych list

function wireEvents() {
  if (els.btnTabStats) {
    els.btnTabStats.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("stats");
      await Promise.all([loadAdminStats({ silent: true }), loadRetentionStats(), loadExcludedUsers(), loadSnakeStats()]);
    });
  }

  if (els.btnTabRatings) {
    els.btnTabRatings.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("ratings");
      await loadRatings({ silent: true });
      loadProducerRatings();
    });
  }

  if (els.btnTabMaintenance) {
    els.btnTabMaintenance.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("maintenance");
      await loadState({ silent: true });
    });
  }

  if (els.btnTabMail) {
    els.btnTabMail.addEventListener("click", async () => {
      await openMailTab();
    });
  }

  if (els.btnTabMarketplace) {
    els.btnTabMarketplace.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("marketplace");
      await loadMarketplace({ silent: true });
    });
  }

  if (els.btnTabGenerator) {
    els.btnTabGenerator.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("generator");
    });
  }

  if (els.btnTabReports) {
    els.btnTabReports.addEventListener("click", async () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("reports");
      await loadMailFolder({ silent: true });
    });
  }

  if (els.btnTabMarketing) {
    els.btnTabMarketing.addEventListener("click", () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("marketing");
    });
  }

  if (els.btnTabMarketingContacts) {
    els.btnTabMarketingContacts.addEventListener("click", () => {
      if (activeTab === "tools") closeTools();
      setActiveTab("marketingContacts");
    });
  }

  wireMaintenanceEvents();
  wireMailSettingsEvents();
  wireMarketplaceEvents();
  wireReportsEvents();
  startAdminBadges();
  wireMarketingEvents();
  wireRatingsEvents();
  wireStatsEvents();

  if (els.toolsShell) {
    els.toolsShell.addEventListener("dblclick", closeTools);
  }

  if (els.btnLogout) {
    els.btnLogout.addEventListener("click", () => {
      stopPolling();
      window.location.href = "/cdn-cgi/access/logout";
    });
  }

  if (els.btnAccessLogin) {
    els.btnAccessLogin.addEventListener("click", () => {
      // Try standard Cloudflare Access login
      window.location.href = "/cdn-cgi/access/login";
    });
  }
}

(async () => {
  // Panel admina jest tylko po polsku — bez przełącznika języka. initI18n()
  // nadal jest potrzebne, bo t() jest używane w openMaintenancePreview() do
  // podglądu treści publicznej strony maintenance (ta zostaje wielojęzyczna).
  await initI18n({ withSwitcher: false, apply: true });
  setTopbarNavPriority({
    moreEl: document.getElementById("navMore"),
    moreDropdownEl: document.getElementById("navMoreDropdown"),
  });
  document.documentElement.classList.remove('page-loading');
  document.querySelector('.topbar')?.classList.add('topbar-ready');

  applyDateOrderByLang();
  setActiveTab(settingsTabFromUrl(), { updateUrl: false });
  initMailSelects();
  syncMailSelectLabels();
  renderCronPresetOptions();
  renderProviderOrder();
  syncTopbarHeight();
  window.addEventListener("resize", syncTopbarHeight);
  window.addEventListener("i18n:lang", () => {
    syncTopbarHeight();
    applyDateOrderByLang();
    renderProviderOrder();
  });
  startCountdownTimer();
  await initToolsSelect();
  wireEvents();

  onEnterMarketingTab(initMarketingEditor());
  await initMarketingContacts();

  showAuth("Trwa weryfikacja…");

  const ok = await checkMe();
  if (ok) {
    showPanel();
    startActivityPanel();
    activateSettingsTabFromUrl();
    await loadState();
    document.querySelector("main[data-skel-step]")?.classList.add("skel-step-ready");
    startPolling();
  } else {
    showAuth("Wymagane logowanie przez Cloudflare Access.");
  }
})();
