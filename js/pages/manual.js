// js/pages/manual.js
// Zakładki mają działać nawet jeśli auth się nie załaduje.
// Najpierw UI, potem auth „miękko”.

import { confirmModal } from "../core/modal.js";
import { initI18n, setUiLang, t } from "../../translation/translation.js";

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

const tabs = qsa(".simple-tabs .tab");
const pages = {
  general: byId("tab-general"),
  edit: byId("tab-edit"),
  bases: byId("tab-bases"),
  polls: byId("tab-polls"),
  logo: byId("tab-logo"),
  control: byId("tab-control"),
  demo: byId("tab-demo"),
};

function setActive(name) {
  if (!pages[name]) name = "general";

  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(pages).forEach(([key, el]) => {
    el?.classList.toggle("active", key === name);
  });
  location.hash = name;
}

function wireTabs() {
  if (!shouldShowDemoTab()) {
    document.querySelector('.simple-tabs .tab[data-tab="demo"]')?.remove();
    pages.demo?.remove();
    delete pages.demo;
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => setActive(tab.dataset.tab));
  });

  const initial = (location.hash || "").replace("#", "");
  if (initial && pages[initial]) setActive(initial);
  else setActive("general");
}

function decodeRet() {
  const p = new URLSearchParams(location.search);
  return p.get("ret") || "builder.html";
}

function shouldShowDemoTab() {
  const ret = decodeRet().toLowerCase();
  return ret.startsWith("builder.html") || ret.startsWith("/builder.html");
}

function buildPrivacyUrl() {
  const url = new URL("privacy.html", location.href);
  url.searchParams.set("ret", decodeRet());
  const manualPath = `${location.pathname.split("/").pop() || "manual.html"}${location.search}${location.hash}`;
  url.searchParams.set("man", manualPath);
  return url.toString();
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
wireTabs();
wireFallbackNav();

wireAuthSoft().catch((err) => {
  console.warn("[manual] auth nieaktywny:", err);
});
