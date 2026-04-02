// base-explorerjs/page.js
// Init strony menadżera bazy (warstwa 2)

import { requireAuth } from "../../js/core/auth.js?v=4721e86e";
import { alertModal } from "../../js/core/modal.js?v=0c9fe6fd";
import { getUiLang, initI18n, t, withLangParam } from "../../translation/translation.js?v=7222ec9e";
import { initTopbarAccountDropdown } from "../../js/core/topbar-controller.js?v=78fbf2a5";
import { createState, setRole } from "./state.js?v=c58d730d";
import { renderAll } from "./render.js?v=fb8e975e";
import {
  getBaseMeta,
  getBaseRole,
  listCategories,
  listTags,
  listAllQuestions,
} from "./repo.js?v=e8a2caa7";
import { wireActions } from "./actions.js?v=d86c0392";
import { initDrawer, disableDragOnTouch } from "./mobile.js?v=8d87b81b";

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
  url.hash = "bases";
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


/* ================= Init ================= */
(async function init() {
  await initI18n({ withSwitcher: true });
  // auth
  const user = await requireAuth(withLangParam("../login"));
  initTopbarAccountDropdown(user, { accountHref: "../account", loginHref: "../login" });

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

    // ===== mobile =====
    initDrawer();
    disableDragOnTouch();

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
