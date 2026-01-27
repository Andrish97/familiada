// base-explorer/js/page.js
// Init strony menadżera bazy (warstwa 2)

import { requireAuth, signOut } from "../../js/core/auth.js";
import { createState, setRole } from "./state.js";
import { renderAll } from "./render.js";

import {
  getBaseMeta,
  getBaseRole,
  listCategories,
  listAllTags,
  listAllQuestions,
  ensureTrashCategory,
} from "./repo.js";

import { wireActions } from "./actions.js";

/* ================= DOM ================= */
const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");
const who = document.getElementById("who");
const baseNameEl = document.getElementById("baseName");

/* ================= Helpers ================= */
function IdFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("base");
}

/* ================= Events ================= */
btnBack?.addEventListener("click", () => {
  // powrót do listy baz (warstwa 1)
  location.href = "../bases.html";
});

btnLogout?.addEventListener("click", async () => {
  await signOut();
  location.href = "../index.html";
});

/* ================= Init ================= */
(async function init() {
  // auth
  const user = await requireAuth("../index.html");
  if (who) who.textContent = user?.email || "—";

  // base id z URL
  const baseId = getBaseIdFromUrl();
  if (!baseId) {
    alert("Brak identyfikatora bazy.");
    location.href = "../bases.html";
    return;
  }

  // na razie tylko placeholder – właściwe dane w kolejnym etapie
  if (baseNameEl) baseNameEl.textContent = "Baza pytań";

  // ===== state =====
  const state = createState({ baseId, role: "viewer" });
  state.userId = user.id;

  try {
    // ===== meta + rola =====
    state.baseMeta = await getBaseMeta(baseId);

    const r = await getBaseRole(baseId, user.id);
    setRole(state, r.role);
    // Kosz (ukryty folder w root) – tworzymy, jeśli brakuje.
    await ensureTrashCategory({ baseId });

    // ===== dane do renderu (etap 1: prosto, wszystko) =====
    const [cats, tags, qs] = await Promise.all([
      listCategories(baseId),
      listTags(baseId),
      listAllQuestions(baseId),
    ]);

    state.categories = cats;
    state.tags = tags;
    state.questions = qs;

    renderAll(state);

    // ===== akcje UI (klik folder, search, selekcja) =====
    const api = wireActions({ state });

    // ustaw cache all-questions dla widoku ALL
    state._allQuestions = qs;
    state._viewQuestions = qs;

    // refresh (żeby search/filter działały od razu spójnie)
    await api.refreshList();

  } catch (e) {
    console.error(e);

    // brak dostępu – wracamy do baz
    if (e?.code === "NO_ACCESS") {
      alert("Brak dostępu do tej bazy.");
      //location.href = "../bases.html";
      return;
    }

    alert("Nie udało się wczytać bazy (sprawdź konsolę).");
    //location.href = "../bases.html";
  }
})();
