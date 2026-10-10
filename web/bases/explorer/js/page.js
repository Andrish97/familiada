// base-explorerjs/page.js
// Init strony menadżera bazy (warstwa 2)

import { alertModal } from "../../../shared/js/core/modal.js?v=v2026-10-10T00415";
import { guardResourceLocks } from "../../../shared/js/core/resource-lock.js?v=v2026-10-10T00415";
import { getUiLang, initI18n, t } from "../../../shared/translation/translation.js?v=v2026-10-10T00415";
import { backHref } from "../../../shared/js/core/nav-map.js?v=v2026-10-10T00415";
import { initPage } from "../../../shared/js/core/page-init.js?v=v2026-10-10T00415";
import { VIEW, createState, setRole, pruneTreeOpen } from "./state.js?v=v2026-10-10T00415";
import { renderAll } from "./render.js?v=v2026-10-10T00415";
import {
  getBaseMeta,
  getBaseRole,
  listCategories,
  listTags,
  listAllQuestions,
} from "./repo.js?v=v2026-10-10T00415";
import { wireActions } from "./actions.js?v=v2026-10-10T00415";
import { initDrawer, disableDragOnTouch } from "./mobile.js?v=v2026-10-10T00415";

/* ================= DOM ================= */
const baseNameEl = document.getElementById("baseName");

/* ================= Helpers ================= */
function getBaseIdFromUrl() {
  const params = new URLSearchParams(location.search);
  return params.get("id");
}

/* ================= Init ================= */
(async function init() {
  const i18nP = initI18n({ withSwitcher: true });
  const userP = initPage("baseExplorer", { ready: i18nP }); // auth startuje równolegle z i18n
  await i18nP;
  document.documentElement.classList.remove('page-loading');

  const user = await userP;
  if (!user) return; // initPage przekierował na logowanie

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
          backHref: backHref("baseExplorer"),
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
    pruneTreeOpen(state.treeOpen, cats);
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
