// js/pages/privacy.js
import { initI18n, t } from "../../translation/translation.js";

initI18n({ withSwitcher: !(new URLSearchParams(location.search).get("modal") === "control") });

function byId(id) { return document.getElementById(id); }

function hasManualRef() {
  return new URLSearchParams(location.search).has("man");
}

function buildBuilderBackUrl() {
  const p = new URLSearchParams(location.search);
  const lang = p.get("lang") || localStorage.getItem("uiLang") || "pl";
  return `builder.html?lang=${encodeURIComponent(lang)}`;
}

function decodeManualBack() {
  const p = new URLSearchParams(location.search);
  const man = p.get("man");

  if (!man) return buildBuilderBackUrl();
  if (man.includes("lang=")) return man;

  const lang = p.get("lang") || localStorage.getItem("uiLang") || "pl";
  const sep = man.includes("?") ? "&" : "?";
  return `${man}${sep}lang=${encodeURIComponent(lang)}`;
}

function isControlModal() {
  const p = new URLSearchParams(location.search);
  return p.get("modal") === "control";
}

function applyControlModalLayout() {
  if (!isControlModal()) return;
  document.body.classList.add("manual-in-control-modal");
  byId("who")?.remove();
  byId("btnLogout")?.remove();
}

function updateBackButtonLabel() {
  const btn = byId("btnBack");
  if (!btn) return;
  btn.textContent = hasManualRef() ? t("privacy.backToManual") : t("manual.backToGames");
}

function wireFallbackNav() {
  byId("btnBack")?.addEventListener("click", () => {
    location.href = decodeManualBack();
  });

  byId("btnLogout")?.addEventListener("click", () => {
    location.href = "index.html";
  });
}

async function wireAuthSoft() {
  const { requireAuth, signOut } = await import("../core/auth.js");
  const user = await requireAuth("index.html" + (location.search || ""));

  const who = byId("who");
  if (who) who.textContent = user?.username || user?.email || "—";

  byId("btnLogout")?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  byId("btnBack")?.addEventListener("click", () => {
    location.href = decodeManualBack();
  });
}

applyControlModalLayout();
wireFallbackNav();
updateBackButtonLabel();

wireAuthSoft().catch((err) => {
  console.warn("[privacy] auth nieaktywny:", err);
});

window.addEventListener("i18n:lang", updateBackButtonLabel);
