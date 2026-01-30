// js/pages/manual.js
// Zakładki mają działać nawet jeśli auth się nie załaduje.
// Najpierw UI, potem auth "miękko".

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
  tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(pages).forEach(([key, el]) => {
    el?.classList.toggle("active", key === name);
  });
  location.hash = name;
}

function wireTabs() {
  tabs.forEach(tab => {
    tab.addEventListener("click", () => setActive(tab.dataset.tab));
  });
}

function wireFallbackNav() {
  // fallback, gdyby auth nie zadziałał
  byId("btnBack")?.addEventListener("click", () => {
    location.href = "builder.html";
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
      title: "Przywrócić pliki demo?",
      text: "Zostaną dodane przykładowe materiały startowe.",
      okText: "Przywróć",
      cancelText: "Anuluj",
    });
    if (!ok) return;

    // ustaw demo=true
    await resetUserDemoFlag(user.id, true);

    // przejście do buildera
    location.href = "./builder.html";
  });
}

async function wireAuth() {
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

  // Demo tab – miękko
  wireDemoActions(user).catch((err) => {
    console.warn("[manual] demo actions nieaktywne:", err);
  });
}

/* ===== init ===== */
wireTabs();
wireFallbackNav();

// hash start: jak brak, pokaż general
const initial = (location.hash || "").replace("#", "");
if (initial && pages[initial]) setActive(initial);
else setActive("general");

// auth próbujemy „miękko”
wireAuth().catch((err) => {
  console.warn("[manual] auth nieaktywny:", err);
});
