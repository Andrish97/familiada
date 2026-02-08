// js/pages/privacy.js
// Styl i UX jak manual: topbar + miękki auth + i18n z przełącznikiem języka.

import { initI18n } from "../../translation/translation.js";

initI18n({ withSwitcher: true });

function byId(id) { return document.getElementById(id); }

function wireFallbackNav() {
  byId("btnBack")?.addEventListener("click", () => {
    // zachowaj ?lang=...
    location.href = "manual.html" + (location.search || "");
  });
  byId("btnLogout")?.addEventListener("click", () => {
    location.href = "index.html" + (location.search || "");
  });
}

async function wireAuthSoft() {
  const { requireAuth, signOut } = await import("../core/auth.js");
  const user = await requireAuth("index.html" + (location.search || ""));

  const who = byId("who");
  if (who) who.textContent = user?.username || user?.email || "—";

  byId("btnLogout")?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html" + (location.search || "");
  });

  byId("btnBack")?.addEventListener("click", () => {
    location.href = "manual.html" + (location.search || "");
  });
}

/* ================= Init ================= */
wireFallbackNav();

wireAuthSoft().catch((err) => {
  console.warn("[privacy] auth nieaktywny:", err);
});
