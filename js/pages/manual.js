// js/pages/manual.js
// Zakładki mają działać nawet jeśli auth się nie załaduje.
// Najpierw UI, potem auth „miękko”.

import { confirmModal } from "../core/modal.js";
import { initI18n, setUiLang, t, withLangParam } from "../../translation/translation.js";

function isControlModal() {
  const p = new URLSearchParams(location.search);
  return p.get("modal") === "control";
}

async function initManualI18n() {
  const params = new URLSearchParams(location.search);
  const hasLangParam = params.has("lang");
  const storedLang = localStorage.getItem("uiLang");

  if (!hasLangParam && !storedLang) {
    await setUiLang("pl", { persist: true, updateUrl: true, apply: false });
  }

  await initI18n({ withSwitcher: !isControlModal() });
}

function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function byId(id) { return document.getElementById(id); }

function getTabs() { return qsa(".simple-tabs .tab"); }

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
  if (!shouldShowDemoTab() || isControlModal()) {
    document.querySelector('.simple-tabs .tab[data-tab="demo"]')?.remove();
    pages.demo?.remove();
    delete pages.demo;
  }

  getTabs().forEach(tab => {
    tab.addEventListener("click", () => setActive(tab.dataset.tab));
  });

  const initial = (location.hash || "").replace("#", "");
  if (initial && pages[initial]) setActive(initial);
  else setActive("general");
}

function normalizeRetTarget(rawRet) {
  const fallback = withLangParam("builder.html");
  const trimmed = String(rawRet || "").trim();
  if (!trimmed) return fallback;

  try {
    const target = new URL(trimmed, location.origin + "/");
    if (target.origin !== location.origin) return fallback;
    const rel = `${target.pathname.replace(/^\/+/, "")}${target.search}${target.hash}`;
    return withLangParam(rel || "builder.html");
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
    return "/builder.html";
  }
}

function applyControlModalLayout() {
  if (!isControlModal()) return;
  document.body.classList.add("manual-in-control-modal");
  document.documentElement.classList.add("manual-in-control-modal");
  byId("btnBack")?.remove();
  byId("who")?.remove();
  byId("btnLogout")?.remove();
  document.querySelector('.simple-tabs .tab[data-tab="demo"]')?.remove();
  pages.demo?.remove();
  delete pages.demo;
}

function shouldShowDemoTab() {
  const retPath = getRetPathnameLower();
  return retPath.endsWith("/builder.html");
}

function buildPrivacyUrl() {
  const url = new URL("privacy.html", location.href);
  url.searchParams.set("ret", decodeRet());
  if (isControlModal()) url.searchParams.set("modal", "control");
  url.searchParams.set("lang", new URLSearchParams(location.search).get("lang") || localStorage.getItem("uiLang") || "pl");
  const manualPath = `${location.pathname.split("/").pop() || "manual.html"}${location.search}${location.hash}`;
  url.searchParams.set("man", manualPath);
  return url.toString();
}


function resolveBackLabelKey() {
  const retPath = getRetPathnameLower();
  if (retPath.endsWith("/bases.html") || retPath.endsWith("/base-explorer/base-explorer.html")) return "baseExplorer.backToBases";
  if (retPath.endsWith("/polls-hub.html") || retPath.endsWith("/subscriptions.html") || retPath.endsWith("/polls.html")) return "polls.backToHub";
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

  byId("btnLogout")?.addEventListener("click", () => {
    location.href = "index.html";
  });
}

async function wireDemoActions(user) {
  const btn = byId("demoRestoreBtn");
  if (!btn || !user?.id) return;

  const { resetUserDemoFlag } = await import("../core/user-flags.js");

  btn.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: t("manual.demo.modalTitle"),
      text: t("manual.demo.modalText"),
      okText: t("manual.demo.modalOk"),
      cancelText: t("manual.demo.modalCancel"),
    });

    if (!ok) return;

    await resetUserDemoFlag(user.id, true);
    location.href = "./builder.html";
  });
}

async function wireAuthSoft() {
  const { requireAuth, signOut } = await import("../core/auth.js");
  const user = await requireAuth("index.html");

  const who = byId("who");
  if (who) who.textContent = user?.username || user?.email || "—";

  byId("btnLegal")?.addEventListener("click", () => {
    location.href = buildPrivacyUrl();
  });

  byId("btnLogout")?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
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
