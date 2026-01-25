// base-explorer/js/page.js
// Init strony menadżera bazy (warstwa 2)

import { requireAuth, signOut } from "../../js/core/auth.js";
import { createState, setRole, VIEW } from "./state.js";
import { sb } from "../../js/core/supabase.js";
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
  location.href = "../bases.html";
});

btnLogout?.addEventListener("click", async () => {
  await signOut();
  location.href = "../index.html";
});

/* ================= Realtime (Model 3) ================= */

function currentCategoryId(state) {
  // Root = category_id null
  return (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
}

function currentParentId(state) {
  // Root = parent_id null
  return (state.view === VIEW.FOLDER && state.folderId) ? state.folderId : null;
}

function textOfQuestionPayload(q) {
  return String(q?.payload?.text ?? q?.text ?? "").trim();
}

function matchesSearchText(q, textQ) {
  const t = String(textQ || "").trim().toLowerCase();
  if (!t) return true;
  return textOfQuestionPayload(q).toLowerCase().includes(t);
}

// pobiera tagi dla 1 pytania (tylko gdy trzeba)
async function fetchQuestionTagIds(questionId) {
  const { data, error } = await sb()
    .from("qb_question_tags")
    .select("tag_id")
    .eq("question_id", questionId);

  if (error) throw error;
  return (data || []).map(r => r.tag_id).filter(Boolean);
}

async function initRealtime(state) {
  // kanał per baza — łatwo odpiąć
  const channel = sb().channel(`bx:${state.baseId}`);

  // mały bezpiecznik przeciwko spamowi eventów (hurtowe operacje)
  let busy = false;
  async function runOnce(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } finally { busy = false; }
  }

  function isQuestionVisibleNow(q, { oldCategoryId } = {}) {
    if (!q) return false;

    // 1) jeśli pytanie JUŻ jest na liście po prawej, to użytkownik je widzi
    const shownIds = new Set((state.questions || []).map(x => x?.id).filter(Boolean));
    if (q.id && shownIds.has(q.id)) return true;

    // 2) browse (ALL/FOLDER): widoczność zależy od folderu/root
    if (state.view === VIEW.ALL || state.view === VIEW.FOLDER) {
      const curCat = currentCategoryId(state);       // null albo folderId
      const newCat = (q.category_id || null);
      const oldCat = (oldCategoryId || null);

      // refresh gdy: było widoczne, jest widoczne lub mogło "wpaść/wypaść" z bieżącego folderu
      return (newCat === curCat) || (oldCat === curCat);
    }

    // 3) SEARCH: tekst + tagi z searchTokens
    if (state.view === VIEW.SEARCH) {
      const textQ = String(state.searchTokens?.text || "").trim();
      return matchesSearchText(q, textQ);
      // tagi dołożymy w handlerze (bo trzeba dociągać linki)
    }

    // 4) TAG/META: w praktyce zmiana pytania może wpływać na wynik,
    //    więc decyzję dopniemy w handlerze (tagi/meta mapy)
    if (state.view === VIEW.TAG || state.view === VIEW.META) return true;

    return false;
  }

  function isFolderVisibleNow(c) {
    if (!c) return false;

    // drzewo jest zawsze widoczne -> zmiana folderu zwykle ma znaczenie
    // ale refresh listy folderów po prawej tylko, gdy dotyczy aktualnego parenta
    const curParent = currentParentId(state);
    const parent = (c.parent_id || null);

    // jeśli folder jest w aktualnie oglądanym "poziomie" (root albo dany folder) -> ma znaczenie
    if (parent === curParent) return true;

    // jeśli to folder aktualnie otwarty (zmiana nazwy ma wpływ na breadcrumbs)
    if (state.view === VIEW.FOLDER && state.folderId && c.id === state.folderId) return true;

    return false;
  }

  async function handleQuestionChange(payload) {
    const id = payload?.new?.id || payload?.old?.id;
    if (!id) return;

    const oldCategoryId = payload?.old?.category_id || null;

    // dociągnij świeży rekord (albo stwierdź DELETE)
    const { data, error } = await sb()
      .from("qb_questions")
      .select("id,base_id,category_id,ord,payload,updated_at")
      .eq("id", id)
      .maybeSingle?.() ?? await sb().from("qb_questions").select("id,base_id,category_id,ord,payload,updated_at").eq("id", id).single();

    // Uwaga: jeśli nie masz maybeSingle(), to w razie DELETE wejdzie error.
    // Wtedy traktujemy to jako DELETE i opieramy się o payload.old.
    let q = null;
    if (!error) q = data;
    if (error) {
      // DELETE albo brak rekordu
      q = payload?.old ? { ...payload.old, id } : null;
    }

    if (!q) return;
    if (String(q.base_id || "") !== String(state.baseId || "")) return;

    // decyzja “czy użytkownik widzi / może zauważyć”
    let visible = isQuestionVisibleNow(q, { oldCategoryId });

    // Dopinamy tagi dla SEARCH/TAG, ale tylko jeśli to potrzebne
    const needTags =
      (state.view === VIEW.SEARCH && (state.searchTokens?.tagIds || []).length) ||
      (state.view === VIEW.TAG && (state.tagIds || []).length);

    if (needTags) {
      const activeTagIds =
        (state.view === VIEW.SEARCH)
          ? (Array.isArray(state.searchTokens?.tagIds) ? state.searchTokens.tagIds : [])
          : (Array.isArray(state.tagIds) ? state.tagIds : []);

      const active = new Set(activeTagIds.filter(Boolean));

      if (active.size) {
        const qTagIds = new Set(await fetchQuestionTagIds(id));
        // TAG/SEARCH-tag: wymagamy, żeby pytanie miało wszystkie wybrane tagi (AND),
        // bo tak działa u Ciebie filtr w buildVirtualViewResults.
        // Jeśli chcesz OR, zmienisz tu logikę.
        let hasAll = true;
        for (const tid of active) {
          if (!qTagIds.has(tid)) { hasAll = false; break; }
        }
        visible = visible && hasAll;
      }
    }

    if (!visible) return;

    // minimalny refresh: unieważnij cache, ale tylko te, które realnie mogą się rozjechać
    // (u Ciebie invalidateDerivedCaches jest wewnątrz actions.js, więc robimy „manualnie” minimum)
    state._rootQuestions = null;
    state._viewQuestions = null;

    // dla widoków wirtualnych musisz też skasować globalny cache pytań (żeby wynik się zgadzał)
    if (state.view === VIEW.SEARCH || state.view === VIEW.TAG || state.view === VIEW.META) {
      state._allQuestions = null;
    }

    // mapy tagów/meta mogą się zmienić nawet gdy pytanie jest “to samo” (np. payload)
    state._viewQuestionTagMap = null;
    state._allQuestionTagMap = null;
    state._derivedCategoryTagMap = null;
    state._folderDescQIds = null;
    state._allCategoryTagMap = null;

    state._allQuestionMetaMap = null;
    state._allCategoryMetaMap = null;
    state._viewQuestionMetaMap = null;

    await state._api?.refreshList?.();
  }

  async function handleCategoryChange(payload) {
    const id = payload?.new?.id || payload?.old?.id;
    if (!id) return;

    // dociągnij świeży rekord (albo DELETE)
    const { data, error } = await sb()
      .from("qb_categories")
      .select("id,base_id,parent_id,name,ord")
      .eq("id", id)
      .maybeSingle?.() ?? await sb().from("qb_categories").select("id,base_id,parent_id,name,ord").eq("id", id).single();

    let c = null;
    if (!error) c = data;
    if (error) c = payload?.old ? { ...payload.old, id } : null;

    if (!c) return;
    if (String(c.base_id || "") !== String(state.baseId || "")) return;

    // refresh drzewa praktycznie zawsze ma sens,
    // ale listę po prawej tylko gdy folder jest “widziany”
    const affectsRight = isFolderVisibleNow(c);

    // kategorie wpływają też na breadcrumbs i na możliwość auto-open w treeOpen
    await state._api?.refreshCategories?.();

    if (affectsRight) {
      state._folderDescQIds = null;
      state._derivedCategoryTagMap = null;
      state._allCategoryTagMap = null;
      await state._api?.refreshList?.();
    } else {
      // samo odrysowanie też zadziała, ale refreshCategories już zmieniło state.categories,
      // więc najlepiej przerysować UI:
      state._api?.refreshList?.(); // opcjonalnie możesz tu zrobić renderAll(state)
    }
  }

  async function handleTagsChange() {
    // lista tagów jest zawsze widoczna po lewej -> zwykle odświeżamy
    await state._api?.refreshTags?.();

    // tagi wpływają na kropki/filtry -> odśwież tylko gdy jesteśmy w widoku tagowym albo search z #tagami
    const inTagSensitive =
      state.view === VIEW.TAG ||
      state.view === VIEW.META ||
      (state.view === VIEW.SEARCH && (state.searchTokens?.tagIds || []).length);

    if (!inTagSensitive) return;

    state._viewQuestionTagMap = null;
    state._allQuestionTagMap = null;
    state._derivedCategoryTagMap = null;
    state._folderDescQIds = null;
    state._allCategoryTagMap = null;

    await state._api?.refreshList?.();
  }

  // --- Subskrypcje ---
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "qb_questions" },
    (payload) => runOnce(() => handleQuestionChange(payload))
  );

  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "qb_categories" },
    (payload) => runOnce(() => handleCategoryChange(payload))
  );

  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "qb_tags" },
    () => runOnce(() => handleTagsChange())
  );

  // linki tagów dla pytań/folderów: tu robimy prostą reakcję “tag-sensitive”
  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "qb_question_tags" },
    () => runOnce(() => handleTagsChange())
  );

  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "qb_category_tags" },
    () => runOnce(() => handleTagsChange())
  );

  channel.subscribe();

  // sprzątanie
  window.addEventListener("beforeunload", () => {
    try { sb().removeChannel(channel); } catch {}
  });

  return channel;
}

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
    // realtime: Model 3 (odświeżaj tylko gdy użytkownik widzi element)
    await initRealtime(state);

  } catch (e) {
    console.error(e);

    // brak dostępu – wracamy do baz
    if (e?.code === "NO_ACCESS") {
      alert("Brak dostępu do tej bazy.");
      location.href = "../bases.html";
      return;
    }

    alert("Nie udało się wczytać bazy (sprawdź konsolę).");
    location.href = "../bases.html";
  }
})();
