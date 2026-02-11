// js/pages/privacy.js
import { initI18n } from "../../translation/translation.js";

initI18n({ withSwitcher: !(new URLSearchParams(location.search).get("modal") === "control") });

function byId(id) { return document.getElementById(id); }

function decodeManualBack() {
  const p = new URLSearchParams(location.search);
  const man = p.get("man") || "manual.html";
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

wireAuthSoft().catch((err) => {
  console.warn("[privacy] auth nieaktywny:", err);
});
