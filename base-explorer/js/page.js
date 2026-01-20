// base-explorer/js/page.js
// Init strony menadżera bazy (warstwa 2)

import { requireAuth, signOut } from "/familiada/js/core/auth.js";

/* ================= DOM ================= */
const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");
const who = document.getElementById("who");
const baseNameEl = document.getElementById("baseName");

/* ================= Helpers ================= */
function getBaseIdFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("base");
}

/* ================= Events ================= */
btnBack?.addEventListener("click", () => {
  // powrót do listy baz (warstwa 1)
  location.href = "familiada/bases.html";
});

btnLogout?.addEventListener("click", async () => {
  await signOut();
  location.href = "familiada/index.html";
});

/* ================= Init ================= */
(async function init() {
  // auth
  const user = await requireAuth("familiada/index.html");
  if (who) who.textContent = user?.email || "—";

  // base id z URL
  const baseId = getBaseIdFromUrl();
  if (!baseId) {
    alert("Brak identyfikatora bazy.");
    location.href = "familiada/bases.html";
    return;
  }

  // na razie tylko placeholder – właściwe dane w kolejnym etapie
  if (baseNameEl) baseNameEl.textContent = "Baza pytań";

  // TODO (kolejne pliki):
  // - załadować meta bazy (repo)
  // - ustawić rolę (owner/editor/viewer)
  // - zainicjalizować state
  // - wywołać pierwszy render
})();
