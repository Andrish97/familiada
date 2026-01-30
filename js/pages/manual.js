// js/pages/manual.js
// Zakładki mają działać nawet jeśli auth się nie załaduje.
// Najpierw UI (tabs + fallback), potem miękko auth, a dopiero wtedy demo-akcje.

import { confirmModal } from "../core/modal.js";

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
  const key = pages[name] ? name : "general";
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === key));
  Object.entries(pages).forEach(([k, el]) => el?.classList.toggle("active", k === key));
  location.hash = key;
}

function wireTabs() {
  tabs.forEach(tab => {
    tab.addEventListener("click", () => setActive(tab.dataset.tab));
  });

  // start: hash → jeśli nie ma / złe → general
  const initial = (location.hash || "").replace("#", "");
  setActive(initial);
}

function wireFallbackNav() {
  // fallback, gdyby auth nie zadziałał (przyciski nie wymagają sesji)
  byId("btnBack")?.addEventListener("click", () => (location.href = "builder.html"));
  byId("btnLogout")?.addEventListener("click", () => (location.href = "index.html"));
}

async function wireDemoActions(user) {
  const btn = byId("demoRestoreBtn");
  if (!btn || !user?.id) return;

  const { resetUserDemoFlag } = await import("../core/user-flags.js");

  btn.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Przywrócić pliki demo?",
      text: "Zostaną dodane przykładowe materiały startowe.",
      okText: "Przywróć",
      cancelText: "Anuluj",
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
  if (who) who.textContent = user?.email || "—";

  byId("btnLogout")?.addEventListener("click", async () => {
    await signOut();
    location.href = "index.html";
  });

  byId("btnBack")?.addEventListener("click", () => {
    location.href = "builder.html";
  });

  // demo akcje – miękko
  wireDemoActions(user).catch((err) => {
    console.warn("[manual] demo actions nieaktywne:", err);
  });
}

/* ================= Init ================= */
wireTabs();
wireFallbackNav();

wireAuthSoft().catch((err) => {
  console.warn("[manual] auth nieaktywny:", err);
});
