// js/pages/manual.js
// Zakładki mają działać nawet jeśli auth się nie załaduje.

import { confirmModal } from "../core/modal.js";

function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }
function byId(id) { return document.getElementById(id); }

/* ================= Tabs ================= */

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
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  Object.entries(pages).forEach(([key, el]) => el?.classList.toggle("active", key === name));
  location.hash = name;
}

function wireTabs() {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActive(tab.dataset.tab));
  });

  const initial = (location.hash || "").replace("#", "");
  if (initial && pages[initial]) setActive(initial);
  else setActive("general"); // fallback
}

/* ================= Fallback nav (bez auth) ================= */

function wireFallbackNav() {
  byId("btnBack")?.addEventListener("click", () => {
    location.href = "builder.html";
  });
  byId("btnLogout")?.addEventListener("click", () => {
    location.href = "index.html";
  });
}

/* ================= DEMO actions ================= */

async function wireDemoActions(user) {
  const btn = byId("demoRestoreBtn");
  if (!btn) {
    console.warn("[manual] Brak #demoRestoreBtn w HTML (zakładka DEMO).");
    return;
  }

  if (!user?.id) {
    // auth nie zadziałał → przycisk może być, ale nie będzie działał
    btn.disabled = true;
    btn.title = "Zaloguj się, aby przywrócić demo.";
    return;
  }

  const { resetUserDemoFlag } = await import("../core/user-flags.js");

  btn.disabled = false;
  btn.title = "";

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

/* ================= Auth (miękko) ================= */

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

  await wireDemoActions(user);
}

/* ================= Init ================= */

wireTabs();
wireFallbackNav();

wireAuth().catch(async (err) => {
  console.warn("[manual] auth nieaktywny:", err);
  // mimo braku auth: spróbujmy chociaż zablokować demo button, jeśli istnieje
  try { await wireDemoActions(null); } catch {}
});
