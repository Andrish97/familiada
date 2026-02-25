// base-explorerjs/page.js
// Init strony menadżera bazy (warstwa 2)

import { requireAuth, signOut } from "../../js/core/auth.js";
import { alertModal } from "../../js/core/modal.js";
import { getUiLang, initI18n, t, withLangParam } from "../../translation/translation.js";
import { createState, setRole } from "./state.js";
import { renderAll } from "./render.js";
import {
  getBaseMeta,
  getBaseRole,
  listCategories,
  listTags,
  listAllQuestions,
} from "./repo.js";
import { wireActions } from "./actions.js";

/* ================= DOM ================= */
const btnBack = document.getElementById("btnBack");
const btnLogout = document.getElementById("btnLogout");
const btnManual = document.getElementById("btnManual");
const who = document.getElementById("who");
const baseNameEl = document.getElementById("baseName");

/* ================= Helpers ================= */
function getBaseIdFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("base");
}

function buildManualUrl() {
  const url = new URL("../manual", location.href);
  const ret = `${location.pathname.split("/").slice(-2).join("/")}${location.search}${location.hash}`;
  url.searchParams.set("ret", ret);
  url.searchParams.set("lang", getUiLang() || "pl");
  return url.toString();
}

/* ================= Events ================= */
btnManual?.addEventListener("click", () => {
  location.href = buildManualUrl();
});

btnBack?.addEventListener("click", () => {
  // powrót do listy baz (warstwa 1)
  location.href = withLangParam("../bases");
});

btnLogout?.addEventListener("click", async () => {
  await signOut();
  location.href = withLangParam("../login");
});

/* ================= Init ================= */
(async function init() {
  await initI18n({ withSwitcher: true });
  // auth
  const user = await requireAuth(withLangParam("../login"));
  if (who) who.textContent = user?.username || user?.email || "—";

  // base id z URL
  const baseId = getBaseIdFromUrl();
  if (!baseId) {
    void alertModal({ text: t("baseExplorer.errors.missingBaseId") });
    location.href = withLangParam("../bases");
    return;
  }

  // na razie tylko placeholder – właściwe dane w kolejnym etapie
  if (baseNameEl) baseNameEl.textContent = t("baseExplorer.defaults.baseName");

  // ===== state =====
  const state = createState({ baseId, role: "viewer" });
  state.userId = user.id;

  try {
    // ===== meta + rola =====
    state.baseMeta = await getBaseMeta(baseId);

    const r = await getBaseRole(baseId, user.id);
    setRole(state, r.role);

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

    window.addEventListener("i18n:lang", async () => {
      await api.refreshList();
    });

    // ustaw cache all-questions dla widoku ALL
    state._allQuestions = qs;
    state._viewQuestions = qs;

    // refresh (żeby search/filter działały od razu spójnie)
    await api.refreshList();

  } catch (e) {
    console.error(e);

    // brak dostępu – wracamy do baz
    if (e?.code === "NO_ACCESS") {
      void alertModal({ text: t("baseExplorer.errors.noAccess") });
      //location.href = "../bases";
      return;
    }

    void alertModal({ text: t("baseExplorer.errors.loadFailed") });
    //location.href = "../bases";
  }
})();
