// base-explorerjs/page.js
// Init strony menadżera bazy (warstwa 2)

import { requireAuth } from "../../shared/js/core/auth.js?v=v2026-10-07T00521";
import { alertModal } from "../../shared/js/core/modal.js?v=v2026-10-07T00521";
import { getUiLang, initI18n, t, withLangParam } from "../../shared/translation/translation.js?v=v2026-10-07T00521";
import { initTopbarAccountDropdown } from "../../shared/js/core/topbar-controller.js?v=v2026-10-07T00521";
import { VIEW, createState, setRole } from "./state.js?v=v2026-10-07T00521";
import { renderAll } from "./render.js?v=v2026-10-07T00521";
import {
  getBaseMeta,
  getBaseRole,
  listCategories,
  listTags,
  listAllQuestions,
} from "./repo.js?v=v2026-10-07T00521";
import { wireActions } from "./actions.js?v=v2026-10-07T00521";
import { initDrawer, disableDragOnTouch } from "./mobile.js?v=v2026-10-07T00521";
import { handleSheetBack } from "../../shared/js/core/modal-sheet.js?v=v2026-10-07T00521";

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
  const url = new URL("/manual/", location.href);
  const ret = `${location.pathname}${location.search}${location.hash}`;
  url.searchParams.set("ret", ret);
  url.searchParams.set("lang", getUiLang() || "pl");
  url.hash = "bases";
  return url.toString();
}

/* ================= Events ================= */
btnManual?.addEventListener("click", () => {
  location.href = buildManualUrl();
});

// Znacznik dla contact-modal.js -- patrz js/pages/bases.js dla wyjaśnienia.
if (btnBack) btnBack.dataset.sheetBack = "1";
btnBack?.addEventListener("click", () => {
  if (handleSheetBack()) return;
  // powrót do listy baz (warstwa 1)
  location.href = withLangParam("/bases/");
});


/* ================= Init ================= */
(async function init() {
  const requireAuthP = requireAuth(withLangParam("/login/")); // start równolegle z initI18n
  await initI18n({ withSwitcher: true });
  document.documentElement.classList.remove('page-loading');

  const user = await requireAuthP;
  initTopbarAccountDropdown(user, { accountHref: "../account", loginHref: "../login" });
  document.querySelector('.topbar')?.classList.add('topbar-ready');

  // base id z URL
  const baseId = getBaseIdFromUrl();
  if (!baseId) {
    void alertModal({ text: t("baseExplorer.errors.missingBaseId") });
    location.href = withLangParam("/bases/");
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

    const initialFolderId = new URLSearchParams(location.search).get("folder");
    if (initialFolderId && cats.some((cat) => cat.id === initialFolderId)) {
      state.view = VIEW.FOLDER;
      state.folderId = initialFolderId;
    }

    renderAll(state);

    // ===== mobile =====
    initDrawer();
    disableDragOnTouch();

    // ===== akcje UI (klik folder, search, selekcja) =====
    const api = wireActions({ state });
    state._syncFolderUrl = true;

    window.addEventListener("popstate", async () => {
      const folderId = new URLSearchParams(location.search).get("folder");
      state._syncFolderUrl = false;
      if (folderId && state.categories.some((cat) => cat.id === folderId)) {
        state.view = VIEW.FOLDER;
        state.folderId = folderId;
      } else {
        state.view = VIEW.ALL;
        state.folderId = null;
      }
      state._syncFolderUrl = true;
      await api.refreshList();
    });

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
