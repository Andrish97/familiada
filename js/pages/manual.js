// js/pages/manual.js
// Zakładki mają działać nawet jeśli auth się nie załaduje.
// Dlatego: najpierw podpinamy UI, dopiero potem próbujemy auth.

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

const initial = (location.hash || "").replace("#", "");
if (initial && pages[initial]) setActive(initial);


function wireFallbackNav() {
  // fallback, gdyby auth nie zadziałał
  byId("btnBack")?.addEventListener("click", () => {
    location.href = "builder.html";
  });
  byId("btnLogout")?.addEventListener("click", () => {
    location.href = "index.html";
  });
}

async function wireAuth() {
  // Import dynamiczny: jeśli coś padnie, nie blokujemy zakładek.
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
}

wireTabs();
wireFallbackNav();

// auth próbujemy „miękko”
wireAuth().catch(err => {
  console.warn("[manual] auth nieaktywny:", err);
});
