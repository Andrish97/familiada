// js/pages/manual.js
// Zakładki mają działać nawet jeśli auth się nie załaduje.
// Najpierw UI, potem auth „miękko”.

import { confirmModal } from "../core/modal.js?v=v2026-05-03T22144";
import { initI18n, setUiLang, t, withLangParam } from "../../translation/translation.js?v=v2026-05-03T22144";
import { initTopbarAccountDropdown } from "../core/topbar-controller.js?v=v2026-05-03T22144";
import "../core/contact-modal.js";

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

function setActive(name) {
  if (!pages[name]) name = "general";

  getTabs().forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(pages).forEach(([key, el]) => {
    el?.classList.toggle("active", key === name);
  });
  location.hash = name;
  updateMobileTabSubtitle(name);
}

function wireTabs() {
  if (!shouldShowDemoTab() || isModalMode()) {
    document.querySelector('.simple-tabs .tab[data-tab="demo"], .modal-tabs .tab[data-tab="demo"]')?.remove();
    pages.demo?.remove();
    delete pages.demo;
  }

  getTabs().forEach(tab => {
    tab.addEventListener("click", () => setActive(tab.dataset.tab));
  });

  const hashInitial = (location.hash || "").replace("#", "");
  const p = new URLSearchParams(location.search);
  const paramInitial = p.get("tab") || "";
  const initial = hashInitial || paramInitial;
  if (initial && pages[initial]) setActive(initial);
  else setActive("general");
}

function normalizeRetTarget(rawRet) {
  const fallback = withLangParam("builder");
  const trimmed = String(rawRet || "").trim();
  if (!trimmed) return fallback;

  try {
    const target = new URL(trimmed, location.origin + "/");
    if (target.origin !== location.origin) return fallback;
    const rel = `${target.pathname.replace(/^\/+/, "")}${target.search}${target.hash}`;
    return withLangParam(rel || "builder");
  } catch {
    return fallback;
  }
}

function decodeRet() {
  const p = new URLSearchParams(location.search);
  return normalizeRetTarget(p.get("ret"));
}

function getRetPathnameLower() {
  try {
    return new URL(decodeRet(), location.href).pathname.toLowerCase();
  } catch {
    return "/builder";
  }
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

  // Remove demo tab before cloning
  document.querySelector('.simple-tabs .tab[data-tab="demo"]')?.remove();
  pages.demo?.remove();
  delete pages.demo;

  // Replace simple-tabs with modal-tabs so topbar-controller doesn't pick it up
  const tabs = document.querySelector(".simple-tabs");
  if (tabs) {
    tabs.classList.remove("simple-tabs");
    tabs.classList.add("modal-tabs");
  }
}

function shouldShowDemoTab() {
  const retPath = getRetPathnameLower();
  return retPath.endsWith("/builder") || retPath.endsWith("/builder.html");
}

function buildPrivacyUrl() {
  const url = new URL("privacy", location.href);
  url.searchParams.set("ret", decodeRet());
  const p = new URLSearchParams(location.search);
  if (p.get("modal")) url.searchParams.set("modal", p.get("modal"));
  url.searchParams.set("lang", new URLSearchParams(location.search).get("lang") || localStorage.getItem("uiLang") || "pl");
  const manualPath = `${location.pathname.split("/").pop() || "manual"}${location.search}${location.hash}`;
  url.searchParams.set("man", manualPath);
  return url.toString();
}


function resolveBackLabelKey() {
  const retPath = getRetPathnameLower();
  if (retPath.endsWith("/base-explorer")) return "manual.backToBaseManager";
  if (retPath.endsWith("/bases")) return "baseExplorer.backToBases";
  if (retPath.endsWith("/logo-editor")) return "manual.backToLogos";
  if (retPath.endsWith("/editor")) return "manual.backToEditor";
  if (retPath.endsWith("/polls")) return "manual.backToPoll";
  if (retPath.endsWith("/subscriptions")) return "manual.backToSubscriptions";
  if (retPath.endsWith("/account")) return "manual.backToAccount";
  if (retPath.endsWith("/polls-hub")) return "polls.backToHub";
  if (retPath.endsWith("/marketplace")) return "manual.backToMarketplace";
  return "manual.backToGames";
}

function updateBackButtonLabel() {
  const btn = byId("btnBack");
  if (!btn) return;
  btn.textContent = t(resolveBackLabelKey());
}

function wireFallbackNav() {
  byId("btnBack")?.addEventListener("click", () => {
    location.href = decodeRet();
  });

  byId("btnLegal")?.addEventListener("click", () => {
    location.href = buildPrivacyUrl();
  });

}

async function wireDemoActions(user) {
  const btn = byId("demoRestoreBtn");
  if (!btn || !user?.id) return;

  const { sb } = await import("../core/supabase.js?v=v2026-05-03T22144");

  btn.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: t("manual.demo.modalTitle"),
      text: t("manual.demo.modalText"),
      okText: t("manual.demo.modalOk"),
      cancelText: t("manual.demo.modalCancel"),
    });

    if (!ok) return;

    const lang = localStorage.getItem("uiLang") || "pl";
    const { error } = await sb().rpc("restore_my_demo", { p_lang: lang });
    if (error) {
      console.error("restore_my_demo error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        status: error.status,
        raw: JSON.stringify(error),
      });
      return;
    }
    location.href = "./builder";
  });
}

async function wireAuthSoft() {
  const { requireAuth } = await import("../core/auth.js?v=v2026-05-03T22144");
  const user = await requireAuth("login");

  initTopbarAccountDropdown(user);

  byId("btnLegal")?.addEventListener("click", () => {
    location.href = buildPrivacyUrl();
  });


  byId("btnBack")?.addEventListener("click", () => {
    location.href = decodeRet();
  });

  await wireDemoActions(user);
}

/* ================= Init ================= */
initManualI18n();
applyControlModalLayout();
wireTabs();
updateBackButtonLabel();
wireFallbackNav();

wireAuthSoft().catch((err) => {
  console.warn("[manual] auth nieaktywny:", err);
});


window.addEventListener("i18n:lang", () => {
  updateBackButtonLabel();
});
