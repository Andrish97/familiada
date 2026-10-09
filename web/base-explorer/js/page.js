// base-explorerjs/page.js
// Init strony menadżera bazy (warstwa 2)

import { requireAuth } from "../../shared/js/core/auth.js?v=v2026-10-09T11234";
import { alertModal } from "../../shared/js/core/modal.js?v=v2026-10-09T11234";
import { guardResourceLocks } from "../../shared/js/core/resource-lock.js?v=v2026-10-09T11234";
import { getUiLang, initI18n, t, withLangParam } from "../../shared/translation/translation.js?v=v2026-10-09T11234";
import { linkTo, backHref, renderBackLabel } from "../../shared/js/core/nav-map.js?v=v2026-10-09T11234";
import { initTopbarAccountDropdown } from "../../shared/js/core/topbar-controller.js?v=v2026-10-09T11234";
import { VIEW, createState, setRole } from "./state.js?v=v2026-10-09T11234";
import { renderAll } from "./render.js?v=v2026-10-09T11234";
import {
  getBaseMeta,
  getBaseRole,
  listCategories,
  listTags,
  listAllQuestions,
} from "./repo.js?v=v2026-10-09T11234";
import { wireActions } from "./actions.js?v=v2026-10-09T11234";
import { initDrawer, disableDragOnTouch } from "./mobile.js?v=v2026-10-09T11234";
import { handleSheetBack } from "../../shared/js/core/modal-sheet.js?v=v2026-10-09T11234";

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

/* ================= Events ================= */
btnManual?.addEventListener("click", () => {
  location.href = linkTo("manual", { hash: "bases" });
});

// Znacznik dla contact-modal.js -- patrz js/pages/bases.js dla wyjaśnienia.
if (btnBack) btnBack.dataset.sheetBack = "1";
btnBack?.addEventListener("click", () => {
  if (handleSheetBack()) return;
  location.href = backHref("baseExplorer");
});


/* ================= Init ================= */
(async function init() {
  const requireAuthP = requireAuth(withLangParam("/login/")); // start równolegle z initI18n
  await initI18n({ withSwitcher: true });
  document.documentElement.classList.remove('page-loading');
  renderBackLabel(btnBack, "baseExplorer");

  const user = await requireAuthP;
  initTopbarAccountDropdown(user, { accountHref: "../account", loginHref: "../login" });
  document.querySelector('.topbar')?.classList.add('topbar-ready');

  // base id z URL
  const baseId = getBaseIdFromUrl();
  if (!baseId) {
    void alertModal({ text: t("baseExplorer.errors.missingBaseId") });
    location.href = backHref("baseExplorer");
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

    // Eksplorator trzyma base:B współdzielenie (obecność -- współpracownicy
    // mogą mieć bazę otwartą naraz). Trzymanie wyłączne (zmiana nazwy / usuwanie
    // całej bazy) zatrzymuje wejście i odnowienie pełnoekranowym komunikatem;
    // odebrany dostęp daje `forbidden` przy odnowieniu. Czytelnik (viewer) nie
    // trzyma nic -- nie edytuje, więc nie przeszkadza zmianie całej bazy.
    if (state.canEdit) {
      const lock = await guardResourceLocks(
        [{ type: "base", id: baseId, mode: "shared", message: t("resourceLock.baseChangingMessage") }],
        {
          context: "base-explorer",
          backHref: "/bases/",
          forbiddenTitle: t("resourceLock.baseAccessRevokedTitle"),
          forbiddenMessage: t("resourceLock.baseAccessRevokedMessage"),
        }
      );
      if (!lock.ok) return;
    }

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
