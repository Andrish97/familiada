// js/pages/privacy.js
import { initI18n } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

function byId(id) { return document.getElementById(id); }

function decodeManualBack() {
  const p = new URLSearchParams(location.search);
  return p.get("man") || "manual.html";
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

wireFallbackNav();

wireAuthSoft().catch((err) => {
  console.warn("[privacy] auth nieaktywny:", err);
});
