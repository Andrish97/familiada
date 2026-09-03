// tests/e2e/base-explorer.spec.js
// Weryfikuje base-explorer (js/pages/base-explorer -> base-explorer/js/*.js),
// menadżer "baz pytań" (drzewo folderów + pytania + tagi + eksport do gry).
// Panel był budowany bez pełnego przeglądu kodu i testowany tylko ręcznie,
// więc pokrycie tutaj jest szerokie i rosnące w miarę audytu, nie
// ograniczone do jednego typu ryzyka. Cztery grupy testów (test.describe):
//
// 1) "naprawy z audytu" -- regresja 1:1 na bugach znalezionych przy
//    pierwszym, dogłębnym przejściu przez cały moduł:
//    - Eksport ("Utwórz grę") rzucał ReferenceError przy KAŻDYM użyciu --
//      `let t = null` w run() przesłaniało zaimportowaną funkcję tłumaczeń
//      `t` w całym zasięgu (temporal dead zone). Funkcja była martwa.
//    - Przeciągnięcie folderu w tryb before/after na jego bezpośrednie
//      dziecko nie miało walidacji cyklu (w przeciwieństwie do trybu
//      "into") -- ustawiało folderowi parent_id na samego siebie.
//    - renameByKey() dla pytań brał payload z lokalnego, potencjalnie
//      nieaktualnego cache'u i nadpisywał nim CAŁY wiersz -- realny
//      lost-update przy równoległej edycji tego samego pytania gdzie
//      indziej.
//    - Usunięcie folderu z pytaniami w środku nie kasowało tych pytań
//      (FK qb_questions.category_id ma ON DELETE SET NULL, nie CASCADE).
//    - Modal tagów podpinał listenery X/Zapisz PRZED utworzeniem swojego
//      Promise -- klik w trakcie wolnej sieci zawieszał go na zawsze.
//
// 2) "codzienna funkcjonalność panelu" -- CRUD/tagi/wyszukiwanie/schowek/
//    DnD/uprawnienia, bo same testy regresji na już znalezionych bugach
//    to za mało. Przy pisaniu znaleziony i naprawiony kolejny samodzielny
//    bug: Ctrl+A filtrował wiersze po atrybucie `data-key`, którego żaden
//    wiersz nigdy nie ma (wszystkie mają data-kind+data-id) --
//    zaznacz-wszystko było od zawsze całkowicie martwe.
//
// 3) i 4) "question-modal.js" / "export-modal.js" -- dogłębne testy dwóch
//    najważniejszych, najbardziej złożonych modali (edycja treści pytania
//    i tworzenie gry z zaznaczonych pytań), bo płytsze pokrycie z punktu
//    2) nie oddawało wagi tych komponentów. Znaleziony i naprawiony
//    kolejny bug: question-modal.js's qSave w ogóle nie sprawdzał, czy
//    treść pytania jest niepusta (tylko punkty/sumę).

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

const BASE_URL = "https://www.familiada.online/base-explorer";

/* ================= Seed / DB helpers (bezpośrednio przez window.__sbClient) ================= */

async function createBase(page, name) {
  return await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb
      .from("question_bases")
      .insert({ name: name || `E2E-BASE-${Date.now()}`, owner_id: userData.user.id })
      .select("id")
      .single();
    if (error) throw new Error("insert question_bases failed: " + error.message);
    return data.id;
  }, name);
}

// Eksport ('Utwórz grę') po sukcesie robi location.href do ../builder --
// jeśli cleanup trafia tuż po tej nawigacji, window.__sbClient może na
// chwilę nie istnieć (stara strona już zniknęła, nowa jeszcze nie
// odpaliła własnego init). Bez tego deleteGame/deleteBase w finally
// czasem łapały "Cannot read properties of undefined (reading 'from')"
// (run #74, oba testy export-modal.js z PUNKTACJA/PREPAROWANA -- flaky).
async function waitForSbClient(page) {
  await page.waitForFunction(() => !!window.__sbClient, { timeout: 10000 });
}

async function deleteBase(page, baseId) {
  await waitForSbClient(page);
  await page.evaluate(async (id) => {
    await window.__sbClient.from("question_bases").delete().eq("id", id);
  }, baseId);
}

async function createCategory(page, { baseId, parentId = null, name, ord = 1 }) {
  return await page.evaluate(async ({ baseId, parentId, name, ord }) => {
    const { data, error } = await window.__sbClient
      .from("qb_categories")
      .insert({ base_id: baseId, parent_id: parentId, name, ord })
      .select("id")
      .single();
    if (error) throw new Error("insert qb_categories failed: " + error.message);
    return data.id;
  }, { baseId, parentId, name, ord });
}

async function createQuestion(page, { baseId, categoryId = null, ord = 1, payload, createdAt = null }) {
  return await page.evaluate(async ({ baseId, categoryId, ord, payload, createdAt }) => {
    const row = { base_id: baseId, category_id: categoryId, ord, payload };
    // pickDate() w render.js priorytetyzuje updated_at nad created_at -- ustawiamy
    // oba, żeby kontrolować kolejność sortowania po dacie bez niejasności co do defaultów.
    if (createdAt) { row.created_at = createdAt; row.updated_at = createdAt; }
    const { data, error } = await window.__sbClient
      .from("qb_questions")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error("insert qb_questions failed: " + error.message);
    return data.id;
  }, { baseId, categoryId, ord, payload, createdAt });
}

async function createTag(page, { baseId, name, color = "#4da3ff", ord = 1 }) {
  return await page.evaluate(async ({ baseId, name, color, ord }) => {
    const { data, error } = await window.__sbClient
      .from("qb_tags")
      .insert({ base_id: baseId, name, color, ord })
      .select("id")
      .single();
    if (error) throw new Error("insert qb_tags failed: " + error.message);
    return data.id;
  }, { baseId, name, color, ord });
}

async function assignTag(page, { questionId, tagId }) {
  await page.evaluate(async ({ questionId, tagId }) => {
    const { error } = await window.__sbClient
      .from("qb_question_tags").insert({ question_id: questionId, tag_id: tagId });
    if (error) throw new Error(error.message);
  }, { questionId, tagId });
}

async function getUserId(page) {
  return await page.evaluate(async () => {
    const { data } = await window.__sbClient.auth.getUser();
    return data.user.id;
  });
}

// Udostępnia bazę drugiemu użytkownikowi z daną rolą. `page` musi być
// zalogowane jako WŁAŚCICIEL bazy (question_base_shares INSERT/UPDATE
// wymaga tego po stronie RLS -- patrz qb_shares_write w schema.sql).
async function shareBaseWith(page, baseId, userId, role) {
  await page.evaluate(async ({ baseId, userId, role }) => {
    const { error } = await window.__sbClient
      .from("question_base_shares")
      .upsert({ base_id: baseId, user_id: userId, role }, { onConflict: "base_id,user_id" });
    if (error) throw new Error(error.message);
  }, { baseId, userId, role });
}

async function revokeShare(page, baseId, userId) {
  await page.evaluate(async ({ baseId, userId }) => {
    const { error } = await window.__sbClient
      .from("question_base_shares").delete().eq("base_id", baseId).eq("user_id", userId);
    if (error) throw new Error(error.message);
  }, { baseId, userId });
}

// Symuluje "ktoś inny właśnie edytuje" bez realnego otwierania modala po
// drugiej stronie -- woła dokładnie to samo RPC co acquireResourceLock()
// w przeglądarce (js/core/resource-lock.js), z jednorazowym tab_id.
async function acquireLockDirect(page, resourceType, resourceId, context = "e2e-test") {
  const tabId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const data = await page.evaluate(async ({ resourceType, resourceId, tabId, context }) => {
    const { data, error } = await window.__sbClient.rpc("acquire_edit_lock", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_tab_id: tabId,
      p_context: context,
    });
    if (error) throw new Error(error.message);
    return data;
  }, { resourceType, resourceId, tabId, context });
  return { ...data, tabId };
}

async function releaseLockDirect(page, resourceType, resourceId, tabId) {
  await page.evaluate(async ({ resourceType, resourceId, tabId }) => {
    const { error } = await window.__sbClient.rpc("release_edit_lock", {
      p_resource_type: resourceType,
      p_resource_id: resourceId,
      p_tab_id: tabId,
    });
    if (error) throw new Error(error.message);
  }, { resourceType, resourceId, tabId });
}

async function getCategoryRow(page, categoryId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient
      .from("qb_categories").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }, categoryId);
}

async function getQuestionRow(page, questionId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient
      .from("qb_questions").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }, questionId);
}

async function getQuestionTagIds(page, questionId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient
      .from("qb_question_tags").select("tag_id").eq("question_id", id);
    if (error) throw new Error(error.message);
    return (data || []).map((r) => r.tag_id);
  }, questionId);
}

async function getAllQuestionsFlat(page, baseId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient
      .from("qb_questions").select("*").eq("base_id", id);
    if (error) throw new Error(error.message);
    return data || [];
  }, baseId);
}

async function updateQuestionPayload(page, questionId, payload) {
  await page.evaluate(async ({ id, payload }) => {
    const { error } = await window.__sbClient
      .from("qb_questions").update({ payload }).eq("id", id);
    if (error) throw new Error(error.message);
  }, { id: questionId, payload });
}

async function findGameByName(page, name) {
  await waitForSbClient(page);
  return await page.evaluate(async (name) => {
    const { data, error } = await window.__sbClient
      .from("games").select("id,name").eq("name", name).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }, name);
}

async function getGameQuestionsWithAnswers(page, gameId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient
      .from("questions")
      .select("id,ord,text,answers(ord,text,fixed_points)")
      .eq("game_id", id)
      .order("ord");
    if (error) throw new Error(error.message);
    return data || [];
  }, gameId);
}

async function deleteGame(page, gameId) {
  await waitForSbClient(page);
  await page.evaluate(async (id) => {
    await window.__sbClient.from("games").delete().eq("id", id);
  }, gameId);
}

async function seedTenPlainQuestions(page, baseId, startOrd = 1) {
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const id = await createQuestion(page, {
      baseId, ord: startOrd + i,
      payload: { text: `Pytanie wypełniające ${i + 1}`, answers: [] },
    });
    ids.push(id);
  }
  return ids;
}

// Jak seedTenPlainQuestions, ale z odpowiedziami spełniającymi warunki
// WSZYSTKICH trzech typów naraz (3 odpowiedzi, fixed_points 0..100 sumujące
// się <=100) -- do testów eksportu PUNKTACJA/PREPAROWANA, gdzie wypełniacz
// musi zostać "zielony" (validateForType) w każdym z tych typów, inaczej
// export-modal.js's hasBadSelected() blokuje "Utwórz" (patrz zgłoszenie:
// czerwone pytania i tak trafiały do gry -- teraz naprawdę blokują eksport).
async function seedTenTypeCompatibleQuestions(page, baseId, startOrd = 1) {
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const id = await createQuestion(page, {
      baseId, ord: startOrd + i,
      payload: {
        text: `Pytanie wypełniające ${i + 1}`,
        answers: [{ text: "A", fixed_points: 0 }, { text: "B", fixed_points: 0 }, { text: "C", fixed_points: 0 }],
      },
    });
    ids.push(id);
  }
  return ids;
}

// scheduleRenderList() w actions.js debounce'uje aktualizację toolbara o 180ms
// po kliknięciu wiersza ("krótko: pozwala na dblclick") -- skróty klawiszowe
// (Ctrl+E/Ctrl+G/Ctrl+D) klikają przycisk toolbara TYLKO gdy jego atrybut
// disabled w DOM już zniknął. Wciśnięcie klawisza od razu po row.click(),
// zanim debounce zdąży przerenderować toolbar, trafia na wciąż-disabled
// przycisk i po cichu nic nie robi. Czekamy więc na realny stan przycisku,
// nie tylko na to, że wiersz jest zaznaczony.
async function pressToolbarShortcut(page, dataAct, keys) {
  await expect(page.locator(`#toolbar button[data-act="${dataAct}"]`)).toBeEnabled({ timeout: 5000 });
  await page.keyboard.press(keys);
}

// Zamiennik locator.dragTo() dla testów D&D w tym pliku. Wideo z CI (run
// #76, video: retain-on-failure) pokazało, że wszystkie 3 failujące testy
// D&D wyglądają identycznie: zaznaczenie źródła (dragstart się odpala --
// appka poprawnie reaguje), a potem KOMPLETNA cisza aż do końca 60s okna --
// zero ruchu, zero podświetlenia drop-targetu. Jawny `timeout: 20000` na
// dragTo() (Playwright naprawdę wspiera tę opcję -- sprawdzone w typings)
// mimo to nigdy nie odpalił WŁASNEGO błędu -- zawsze goły
// "Test timeout of 60000ms exceeded", co wskazuje że to natywna,
// CDP-owa symulacja przeciągania (nie appka, nie logika testu) się gdzieś
// zawiesza w tym konkretnym środowisku headless Chromium. Appka i tak
// operuje wyłącznie na zwykłych zdarzeniach DOM (dragstart/dragover/drop
// z dataTransfer) -- więc dispatchujemy je ręcznie w kontekście strony,
// całkiem omijając mechanizm dragTo().
async function simulateDragDrop(page, sourceSelector, targetSelector, { targetOffsetX = null, targetOffsetY = null } = {}) {
  await page.evaluate(({ sourceSelector, targetSelector, targetOffsetX, targetOffsetY }) => {
    const dataTransfer = new DataTransfer();

    // WAŻNE: nie wolno zapamiętać elementów RAZ na początku. dragstart na
    // jeszcze-niezaznaczonym wierszu wywołuje w appce selectionSetSingle()
    // + renderList()/renderAll(), co wymienia węzły DOM listy/drzewa --
    // stare referencje stają się odłączone i kolejne zdarzenia (dragover/
    // drop) dispatchowane na nich już nie bąbelkują do listenera na
    // #list/#tree (który nasłuchuje przez delegację). Efekt widoczny w
    // run #77: drag "działał" (dragstart się odpalał), ale drop nic nie
    // robił -- zero błędu, zero zmiany w DB, bo zdarzenia po prostu nigdy
    // nie docierały do właściwego listenera. Trzeba więc doszukiwać
    // elementu selektorem tuż przed KAŻDYM dispatchem.
    function find(selector, label) {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`simulateDragDrop: ${label} not found (${selector})`);
      return el;
    }

    function fire(type, selector, label, offsetX, offsetY) {
      const el = find(selector, label);
      const r = el.getBoundingClientRect();
      const x = r.left + (offsetX ?? r.width / 2);
      const y = r.top + (offsetY ?? r.height / 2);
      el.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        dataTransfer,
      }));
    }

    fire("dragstart", sourceSelector, "source", null, null);
    fire("dragenter", targetSelector, "target", targetOffsetX, targetOffsetY);
    fire("dragover", targetSelector, "target", targetOffsetX, targetOffsetY);
    fire("drop", targetSelector, "target", targetOffsetX, targetOffsetY);
    fire("dragend", sourceSelector, "source", null, null);
  }, { sourceSelector, targetSelector, targetOffsetX, targetOffsetY });
}

/* ================= 1) Naprawy z audytu ================= */

test.describe("base-explorer: naprawy z audytu (nie tylko wiele kart naraz)", () => {

  test("eksport ('Utwórz grę') faktycznie tworzy grę zamiast rzucać błąd", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-EXPORT-${Date.now()}`);
    const gameName = `E2E-XB-CREATED-${Date.now()}`;

    try {
      // 10 pytań płaskich w roocie -- wystarczające i zawsze zgodne z typem poll_text
      let firstQid = null;
      for (let i = 1; i <= 10; i++) {
        const qid = await createQuestion(page, {
          baseId,
          ord: i,
          payload: { text: `Pytanie testowe ${i}`, answers: [] },
        });
        if (i === 1) firstQid = qid;
      }

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // zaznacz wszystkie 10 (modal wybiera dokładnie zaznaczenie, bez
      // dopełniania losowymi resztkami z bazy) i otwórz eksport przez menu
      // kontekstowe
      const row = page.locator(`#list .row[data-kind="q"][data-id="${firstQid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await page.locator("#list").click();
      await page.keyboard.press("Control+a");
      await row.click({ button: "right" });

      const createGameItem = page.locator(".context-menu .cm-item", { hasText: /Utwórz grę/i });
      await expect(createGameItem).toBeVisible({ timeout: 5000 });
      await createGameItem.click();

      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });

      // typ "Typowa ankieta" (poll_text) -- zawsze kompatybilny, nie blokuje niczym
      await page.locator("#lbl0").click();
      await page.locator("#xName").fill(gameName);

      await expect(page.locator("#xCreate")).toBeEnabled({ timeout: 5000 });
      await page.locator("#xCreate").click();

      // przed naprawą: ReferenceError złapany w try/catch, xErr pokazuje błąd,
      // modal NIGDY się nie zamyka. Po naprawie: modal znika, gra powstaje.
      await expect(page.locator("#exportOverlay")).toBeHidden({ timeout: 15000 });

      const game = await findGameByName(page, gameName);
      expect(game, "gra powinna zostać utworzona przez eksport z base-explorera").not.toBeNull();

      if (game?.id) {
        await page.evaluate(async (id) => {
          await window.__sbClient.from("games").delete().eq("id", id);
        }, game.id);
      }
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("drag&drop folderu w tryb before/after na jego dziecko jest blokowany (bez cyklu parent_id)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-CYCLE-${Date.now()}`);

    try {
      const catA = await createCategory(page, { baseId, parentId: null, name: "Folder A", ord: 1 });
      const catB = await createCategory(page, { baseId, parentId: catA, name: "Folder B", ord: 1 });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // rozwiń A w drzewie, żeby B było widoczne
      await page.locator(`#tree .tree-toggle[data-id="${catA}"]`).click();

      const rowASel = `#tree .row[data-kind="cat"][data-id="${catA}"]`;
      const rowBSel = `#tree .row[data-kind="cat"][data-id="${catB}"]`;
      const rowA = page.locator(rowASel);
      const rowB = page.locator(rowBSel);
      await expect(rowA).toBeVisible({ timeout: 10000 });
      await expect(rowB).toBeVisible({ timeout: 10000 });

      // upuść A w górnej (25%) strefie B => tryb "before" => nowy rodzic A = parent(B) = A samo
      await simulateDragDrop(page, rowASel, rowBSel, { targetOffsetX: 20, targetOffsetY: 2 });

      // przed naprawą: cichy zapis, A.parent_id = A.id, folder znika z nawigacji.
      // po naprawie: alertModal blokuje operację.
      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 10000 });
      await expect(page.locator(".uni-modal .mSub")).toContainText("podfolderu", { timeout: 5000 });
      await page.locator(".uni-modal .uni-foot .btn.gold").click();

      const freshA = await getCategoryRow(page, catA);
      expect(freshA?.parent_id, "folder A nie może stać się swoim własnym rodzicem").not.toBe(catA);
      expect(freshA?.parent_id, "folder A powinien zostać przy swoim oryginalnym (braku) rodzica").toBeNull();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("F2 (zmień nazwę pytania) nie nadpisuje odpowiedzi dodanych w międzyczasie gdzie indziej", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-RENAME-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId,
        ord: 1,
        payload: { text: "Oryginalny tekst", answers: [{ text: "A1", fixed_points: 10 }] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click(); // pytanie trafia do lokalnego cache (state.questions) z JEDNĄ odpowiedzią

      // symulacja edycji "w drugiej karcie/urządzeniu" -- dokłada drugą odpowiedź
      // już PO tym, jak ta karta załadowała i zacache'owała stary payload
      await updateQuestionPayload(page, qid, {
        text: "Oryginalny tekst",
        answers: [
          { text: "A1", fixed_points: 10 },
          { text: "A2", fixed_points: 20 },
        ],
      });

      // F2 na tej samej karcie, wciąż z nieaktualnym lokalnym cache
      await row.click();
      await page.keyboard.press("F2");

      const input = page.locator("#renameModalInput");
      await expect(input).toBeVisible({ timeout: 5000 });
      await input.fill("Nowy tekst");

      // renameModal.close() (który chowa #renameModal) jest SYNCHRONICZNY na klik
      // Zapisz -- prawdziwy zapis do qb_questions leci asynchronicznie już PO
      // zamknięciu modala (w renameSelectedPrompt, nie w samym modalu), więc samo
      // "modal się schował" nie gwarantuje, że PATCH już doleciał do bazy.
      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/rest/v1/qb_questions") && res.request().method() === "PATCH"),
        page.locator("#renameModalSave").click(),
      ]);
      await expect(page.locator("#renameModal")).toBeHidden({ timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.text).toBe("Nowy tekst");
      expect(
        fresh?.payload?.answers?.length,
        "odpowiedź dodana w międzyczasie (A2) nie powinna zniknąć przy zmianie samego tekstu"
      ).toBe(2);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("usunięcie folderu z pytaniem w środku kasuje też to pytanie (nie osiera go do 'Wszystkie')", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-DELFOLDER-${Date.now()}`);

    try {
      const catC = await createCategory(page, { baseId, parentId: null, name: "Do usunięcia", ord: 1 });
      const qid = await createQuestion(page, {
        baseId,
        categoryId: catC,
        ord: 1,
        payload: { text: "Pytanie w folderze", answers: [] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const catRow = page.locator(`#list .row[data-kind="cat"][data-id="${catC}"]`);
      await expect(catRow).toBeVisible({ timeout: 15000 });
      await catRow.click();
      await page.keyboard.press("Delete");

      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await expect(page.locator(".uni-modal .mSub")).toContainText("Usunąć", { timeout: 5000 });
      await page.locator(".uni-modal .uni-foot .btn.gold").click();

      await expect(catRow).toBeHidden({ timeout: 10000 });

      const freshCat = await getCategoryRow(page, catC);
      expect(freshCat, "folder powinien zniknąć z bazy").toBeNull();

      const freshQ = await getQuestionRow(page, qid);
      expect(
        freshQ,
        "pytanie z usuniętego folderu powinno zniknąć razem z nim, nie 'spaść' do Wszystkie z category_id=null"
      ).toBeNull();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("zamknięcie modala tagów podczas wolnej sieci nie zawiesza Promise ani nie rzuca wyjątku", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    const baseId = await createBase(page, `E2E-XB-TAGSHANG-${Date.now()}`);

    try {
      await page.evaluate(async (baseId) => {
        const { data, error } = await window.__sbClient
          .from("qb_tags").insert({ base_id: baseId, name: "e2e-tag", color: "#4da3ff", ord: 1 }).select("id").single();
        if (error) throw new Error(error.message);
        return data.id;
      }, baseId);

      const qid = await createQuestion(page, {
        baseId,
        ord: 1,
        payload: { text: "Pytanie do tagowania", answers: [] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // opóźnij zapytanie o powiązania tag<->pytanie, żeby złapać okno między
      // pokazaniem modala (i podpięciem listenerów) a rozwiązaniem jego Promise
      await page.route("**/rest/v1/qb_question_tags*", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await row.click({ button: "right" });

      const tagsItem = page.locator(".context-menu .cm-item", { hasText: /Tagi/i });
      await expect(tagsItem).toBeVisible({ timeout: 5000 });
      await tagsItem.click();

      await expect(page.locator("#tagsOverlay")).toBeVisible({ timeout: 5000 });

      // zamknij NATYCHMIAST, w trakcie opóźnionego zapytania sieciowego
      await page.locator("#tagsL1Close").click();

      await expect(page.locator("#tagsOverlay")).toBeHidden({ timeout: 5000 });

      // poczekaj, aż opóźnione zapytanie faktycznie dokończy w tle
      await page.waitForTimeout(2000);

      expect(
        pageErrors.map((e) => e.message),
        "kliknięcie X w trakcie ładowania nie powinno rzucać nieobsłużonego wyjątku"
      ).toEqual([]);

      // funkcjonalne potwierdzenie, że Promise faktycznie się rozwiązał: modal
      // da się otworzyć ponownie i normalnie działa (bez naprawy zostałby
      // zawieszony pierwszy await, ale kolejne wywołanie tworzy nowy Promise --
      // więc kluczowy dowód to brak wyjątku powyżej; to tylko dodatkowa pewność)
      await row.click({ button: "right" });
      await expect(page.locator(".context-menu .cm-item", { hasText: /Tagi/i })).toBeVisible({ timeout: 5000 });
      await page.locator(".context-menu .cm-item", { hasText: /Tagi/i }).click();
      await expect(page.locator("#tagsOverlay")).toBeVisible({ timeout: 10000 });
      await page.locator("#tagsL1Close").click();
      await expect(page.locator("#tagsOverlay")).toBeHidden({ timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });
});

/* ================= 2) Codzienna funkcjonalność panelu ================= */

test.describe("base-explorer: codzienna funkcjonalność panelu", () => {

  test("Ctrl+A zaznacza wszystkie widoczne elementy (regresja: filtrował po nieistniejącym data-key)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-SELECTALL-${Date.now()}`);

    try {
      const catId = await createCategory(page, { baseId, name: "Folder", ord: 1 });
      await createQuestion(page, { baseId, ord: 1, payload: { text: "P1", answers: [] } });
      await createQuestion(page, { baseId, ord: 2, payload: { text: "P2", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await expect(page.locator("#list .row[data-kind]")).toHaveCount(3, { timeout: 15000 });

      await page.locator("#list").click(); // focus na listę, poza inputem
      await page.keyboard.press("Control+a");

      await expect(page.locator("#list .row.is-selected")).toHaveCount(3, { timeout: 5000 });
      void catId;
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("regresja: toolbar aktualizuje disabled po ODZNACZENIU (Escape / klik w puste tło), nie tylko po zaznaczeniu", async ({ page, context }) => {
    // Przed naprawą: renderList() (wołane samo, bez renderToolbar()) po
    // selectionClear() w kliku-w-puste-tło listy i w globalnym Escape zostawiało
    // toolbar ze stanem enabled sprzed odznaczenia -- widoczne w wierszu (klasa
    // is-selected) znikało poprawnie, ale np. "Usuń"/"Zmień nazwę" dalej dawały
    // się kliknąć mimo braku realnej selekcji.
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-TBDESELECT-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Pytanie", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      const deleteBtn = page.locator('#toolbar button[data-act="delete"]');

      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await expect(deleteBtn).toBeEnabled({ timeout: 5000 });

      // 1) Escape -- global keydown handler w actions.js
      await page.keyboard.press("Escape");
      await expect(row).not.toHaveClass(/is-selected/);
      await expect(deleteBtn).toBeDisabled({ timeout: 5000 });

      // 2) klik w puste tło listy (poniżej jedynego wiersza -- #list ma
      // flex:1 1 auto i jest znacznie wyższe niż tabela z 1 wierszem)
      await row.click();
      await expect(deleteBtn).toBeEnabled({ timeout: 5000 });

      const box = await page.locator("#list").boundingBox();
      await page.mouse.click(box.x + 10, box.y + box.height - 10);

      await expect(row).not.toHaveClass(/is-selected/);
      await expect(deleteBtn).toBeDisabled({ timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("regresja: PPM na NIEZAZNACZONYM pytaniu od razu je zaznacza (menu kontekstowe nie jest wyszarzone)", async ({ page, context }) => {
    // Przed naprawą: showContextMenu() liczyło selectedRealCount ze STAREJ
    // selekcji sprzed kliknięcia -- lazy-select wewnątrz np. action() dla
    // "Zmień nazwę"/"Usuń" nigdy się nie wykonywał, bo renderMenu() w ogóle
    // nie podpina click handlera do <button disabled>. Efekt: żeby cokolwiek
    // zrobić przez PPM, trzeba było najpierw kliknąć lewym (zaznaczyć), potem
    // dopiero PPM -- dokładnie to na co poskarżył się użytkownik. Naprawa:
    // showContextMenu() sam zaznacza cel PRZED policzeniem disabled (tak jak
    // już wcześniej robił dla tagów w lewym panelu).
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-PPMSELECT-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Oryginalny tekst", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });

      // BEZ wcześniejszego lewego kliknięcia -- prosto PPM na nieznaczonym wierszu
      await row.click({ button: "right" });

      // widoczne podświetlenie od razu po PPM
      await expect(row).toHaveClass(/is-selected/);

      const renameItem = page.locator(".context-menu .cm-item", { hasText: /Zmień nazwę/i });
      await expect(renameItem).toBeVisible({ timeout: 5000 });
      await expect(renameItem).toBeEnabled();

      await renameItem.click();

      const input = page.locator("#renameModalInput");
      await expect(input).toBeVisible({ timeout: 5000 });
      await input.fill("Zmienione przez PPM");

      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/rest/v1/qb_questions") && res.request().method() === "PATCH"),
        page.locator("#renameModalSave").click(),
      ]);
      await expect(page.locator("#renameModal")).toBeHidden({ timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.text).toBe("Zmienione przez PPM");
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("regresja: chmurka (tooltip) kropki meta znika po kliknięciu gdzie indziej, nie zostaje 'przy palcu'", async ({ page, context }) => {
    // Zgłoszenie użytkownika: na dotyku tapnięcie w kropkę meta ("preparowane"/
    // "punktowane"/"typowe") pokazuje chmurkę, ale ta nigdy nie znika -- zostaje
    // przyklejona w miejscu tapnięcia niezależnie od tego, gdzie klika się
    // później. Przyczyna: #dot-tooltip w actions.js chowa się WYŁĄCZNIE na
    // "mouseout" konkretnej kropki -- prawdziwe urządzenia dotykowe nie
    // generują "mouseout" po odsunięciu palca ani "mousemove" po drodze
    // (tylko syntetyczny "mouseover" przy samym tapnięciu), więc chmurka
    // zostaje na ekranie w nieskończoność. Naprawa: globalny "pointerdown"
    // poza kropką chowa chmurkę niezależnie od typu urządzenia -- test
    // weryfikuje to zwykłą myszą (hover pokazuje, klik gdzie indziej chowa),
    // bo mechanizm jest wspólny dla obu (pointerdown odpala się też dla myszy).
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-METATIP-${Date.now()}`);

    try {
      // 3 odpowiedzi z fixed_points sumującymi się <=100 -> meta: prepared + poll_points + poll_text
      const qid = await createQuestion(page, {
        baseId, ord: 1,
        payload: {
          text: "Pytanie preparowane",
          answers: [
            { text: "A", fixed_points: 40 },
            { text: "B", fixed_points: 30 },
            { text: "C", fixed_points: 20 },
          ],
        },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });

      const dot = row.locator(".meta-dot").first();
      await expect(dot).toBeVisible({ timeout: 10000 });

      const tip = page.locator(".dot-tooltip");
      await expect(tip).toBeHidden();

      await dot.hover();
      await expect(tip).toBeVisible({ timeout: 5000 });

      // klik w puste tło listy (poniżej wiersza), NIE w samą kropkę
      const box = await page.locator("#list").boundingBox();
      await page.mouse.click(box.x + 10, box.y + box.height - 10);

      await expect(tip).toBeHidden({ timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("question-modal: dodanie odpowiedzi z punktami zapisuje się w DB", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-QADD-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Pytanie bez odpowiedzi", answers: [] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");

      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });
      await page.locator("#qAdd").click();

      const rowEl = page.locator("#qAnswers .qRow").first();
      await rowEl.locator(".qAnsText").fill("Odpowiedź A");
      await rowEl.locator(".qAnsPts").fill("42");

      // questionModal.close() (chowa #questionOverlay) jest SYNCHRONICZNY na klik
      // Zapisz -- prawdziwy UPDATE do qb_questions leci asynchronicznie już PO
      // zamknięciu (w openQuestionModal, nie w samym modalu), więc trzeba poczekać
      // na realny PATCH, nie tylko na zniknięcie overlay.
      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/rest/v1/qb_questions") && res.request().method() === "PATCH"),
        page.locator("#qSave").click(),
      ]);
      await expect(page.locator("#questionOverlay")).toBeHidden({ timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.answers?.length).toBe(1);
      expect(fresh?.payload?.answers?.[0]?.text).toBe("Odpowiedź A");
      expect(fresh?.payload?.answers?.[0]?.fixed_points).toBe(42);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("question-modal: blokuje dodanie 7. odpowiedzi (limit 6)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-QMAX-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1,
        payload: {
          text: "Pytanie z 6 odpowiedziami",
          answers: Array.from({ length: 6 }, (_, i) => ({ text: `A${i + 1}` })),
        },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");

      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#qAnswers .qRow")).toHaveCount(6, { timeout: 5000 });

      await page.locator("#qAdd").click();

      await expect(page.locator("#qAnswers .qRow")).toHaveCount(6);
      await expect(page.locator("#qErr")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#qErr")).toContainText("Max 6", { timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("question-modal: blokuje zapis, gdy suma punktów przekracza 100", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-QSUM-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Pytanie do przekroczenia sumy", answers: [] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      for (let i = 0; i < 3; i++) {
        await page.locator("#qAdd").click();
        const r = page.locator("#qAnswers .qRow").nth(i);
        await r.locator(".qAnsText").fill(`A${i + 1}`);
        await r.locator(".qAnsPts").fill("50");
      }
      await expect(page.locator("#qSumVal")).toHaveText("150/100", { timeout: 5000 });

      await page.locator("#qSave").click();

      await expect(page.locator("#qErr")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#qErr")).toContainText("Suma punktów", { timeout: 5000 });
      await expect(page.locator("#questionOverlay")).toBeVisible(); // modal nie zamknął się

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.answers?.length ?? 0, "nic nie powinno zostać zapisane do DB").toBe(0);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("tagi: utworzenie i przypisanie do jednego pytania (stan 'wszyscy')", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-TAGONE-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Pytanie do otagowania", answers: [] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // utwórz tag przez modal (+ Dodaj tag)
      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await row.click({ button: "right" });
      await page.locator(".context-menu .cm-item", { hasText: /Tagi/i }).click();
      await expect(page.locator("#tagsOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#tagsAddNew").click();
      await expect(page.locator("#tagsL2")).toBeVisible({ timeout: 5000 });
      await page.locator("#tagsEditName").fill("e2e_nowy_tag");
      await page.locator("#tagsL2Save").click();

      // powrót do L1, przypisz nowy tag
      await expect(page.locator("#tagsL1")).toBeVisible({ timeout: 5000 });
      const checkbox = page.locator('#tagsAssignList input[type="checkbox"][data-tag-id]').first();
      await checkbox.click();
      await page.locator("#tagsL1Save").click();
      await expect(page.locator("#tagsOverlay")).toBeHidden({ timeout: 10000 });

      const tagIds = await getQuestionTagIds(page, qid);
      expect(tagIds.length).toBe(1);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("tagi: zaznaczenie częściowe (some) -- klik ustawia tag wszystkim zaznaczonym pytaniom", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-TAGSOME-${Date.now()}`);

    try {
      const q1 = await createQuestion(page, { baseId, ord: 1, payload: { text: "P1", answers: [] } });
      const q2 = await createQuestion(page, { baseId, ord: 2, payload: { text: "P2", answers: [] } });
      const tagId = await createTag(page, { baseId, name: "e2e-partial" });
      await assignTag(page, { questionId: q1, tagId }); // tylko P1 ma tag -- stan "some" przy zaznaczeniu obu

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row1 = page.locator(`#list .row[data-kind="q"][data-id="${q1}"]`);
      const row2 = page.locator(`#list .row[data-kind="q"][data-id="${q2}"]`);
      await expect(row1).toBeVisible({ timeout: 15000 });
      await row1.click();
      await row2.click({ modifiers: ["Control"] });

      await row2.click({ button: "right" });
      await page.locator(".context-menu .cm-item", { hasText: /Tagi/i }).click();
      await expect(page.locator("#tagsOverlay")).toBeVisible({ timeout: 5000 });

      const checkbox = page.locator(`#tagsAssignList input[type="checkbox"][data-tag-id="${tagId}"]`);
      const isIndeterminate = await checkbox.evaluate((el) => el.indeterminate);
      expect(isIndeterminate, "przy 1 z 2 zaznaczonych pytań otagowanych stan powinien być 'częściowy'").toBe(true);

      await checkbox.click();
      // klik na "some" pokazuje ostrzeżenie (ustawi wszystkim) -- zamknij je
      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await page.locator(".uni-modal .uni-foot .btn.gold").click();

      await page.locator("#tagsL1Save").click();
      await expect(page.locator("#tagsOverlay")).toBeHidden({ timeout: 10000 });

      const tagsQ1 = await getQuestionTagIds(page, q1);
      const tagsQ2 = await getQuestionTagIds(page, q2);
      expect(tagsQ1).toContain(tagId);
      expect(tagsQ2, "kliknięcie stanu 'some' powinno przypisać tag OBU zaznaczonym pytaniom").toContain(tagId);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("tagi: usunięcie tagu kasuje jego przypisania do pytań", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-TAGDEL-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "P1", answers: [] } });
      const tagId = await createTag(page, { baseId, name: "e2e-do-usuniecia" });
      await assignTag(page, { questionId: qid, tagId });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tagRow = page.locator(`#tags .row[data-kind="tag"][data-id="${tagId}"]`);
      await expect(tagRow).toBeVisible({ timeout: 15000 });
      await tagRow.click({ button: "right" });

      const deleteItem = page.locator(".context-menu .cm-item", { hasText: /Usuń tag/i });
      await expect(deleteItem).toBeVisible({ timeout: 5000 });
      await deleteItem.click();

      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await page.locator(".uni-modal .uni-foot .btn.gold").click();

      await expect(tagRow).toBeHidden({ timeout: 10000 });

      const remainingLinks = await getQuestionTagIds(page, qid);
      expect(remainingLinks).not.toContain(tagId);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("wyszukiwanie tekstowe filtruje listę pytań po treści", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-SEARCH-${Date.now()}`);

    try {
      const uniq = `Unikalny${Date.now()}`;
      const qMatch = await createQuestion(page, { baseId, ord: 1, payload: { text: `${uniq} tekst`, answers: [] } });
      const qOther = await createQuestion(page, { baseId, ord: 2, payload: { text: "Zupełnie inne pytanie", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await expect(page.locator(`#list .row[data-id="${qOther}"]`)).toBeVisible({ timeout: 15000 });

      await page.locator("#searchText").fill(uniq);
      await expect(page.locator(`#list .row[data-id="${qMatch}"]`)).toBeVisible({ timeout: 10000 });
      await expect(page.locator(`#list .row[data-id="${qOther}"]`)).toHaveCount(0);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("wyszukiwanie po #tagu (chip) pokazuje tylko oznaczone pytania", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-SEARCHTAG-${Date.now()}`);

    try {
      const tagId = await createTag(page, { baseId, name: "e2e-searchtag" });
      const qTagged = await createQuestion(page, { baseId, ord: 1, payload: { text: "Otagowane pytanie", answers: [] } });
      const qPlain = await createQuestion(page, { baseId, ord: 2, payload: { text: "Zwykłe pytanie", answers: [] } });
      await assignTag(page, { questionId: qTagged, tagId });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await expect(page.locator(`#list .row[data-id="${qPlain}"]`)).toBeVisible({ timeout: 15000 });

      // Konwersja "#tag" -> chip dzieje się w handlerze keydown (Spacja/Enter/przecinek),
      // nie w handlerze input -- .fill() same w sobie by tego nie wyzwoliło.
      await page.locator("#searchText").fill("#e2e-searchtag");
      await page.locator("#searchText").press("Space");
      await expect(page.locator("#searchChips .chip")).toHaveCount(1, { timeout: 10000 });

      await expect(page.locator(`#list .row[data-id="${qTagged}"]`)).toBeVisible({ timeout: 10000 });
      await expect(page.locator(`#list .row[data-id="${qPlain}"]`)).toHaveCount(0);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("wytnij + wklej pytanie przenosi je do innego folderu (bez duplikatu)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-CUTPASTE-${Date.now()}`);

    try {
      const catTarget = await createCategory(page, { baseId, name: "Cel", ord: 1 });
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Do przeniesienia", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await page.keyboard.press("Control+x");

      await page.locator(`#list .row[data-kind="cat"][data-id="${catTarget}"]`).dblclick();
      await expect(page.locator("#list .row[data-kind]")).toHaveCount(0, { timeout: 10000 }); // pusty folder docelowy

      await page.locator("#list").click();
      await page.keyboard.press("Control+v");

      await expect(page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`)).toBeVisible({ timeout: 10000 });

      const all = await getAllQuestionsFlat(page, baseId);
      expect(all.length, "wytnij+wklej nie powinno duplikować pytania").toBe(1);
      expect(all[0].category_id).toBe(catTarget);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("kopiuj + wklej pytanie tworzy duplikat, oryginał zostaje na miejscu", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-COPYPASTE-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Do skopiowania", answers: [{ text: "A1" }] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await page.keyboard.press("Control+c");
      await page.keyboard.press("Control+v");

      await expect(page.locator(`#list .row[data-kind="q"]`)).toHaveCount(2, { timeout: 10000 });

      const all = await getAllQuestionsFlat(page, baseId);
      expect(all.length).toBe(2);
      expect(all.some((q) => q.id === qid), "oryginał powinien zostać nietknięty").toBe(true);
      const copy = all.find((q) => q.id !== qid);
      expect(copy?.payload?.text).toBe("Do skopiowania");
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("przeciągnięcie pytania na folder w liście przenosi je (category_id)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-DRAGQ-${Date.now()}`);

    try {
      const catTarget = await createCategory(page, { baseId, name: "Cel DnD", ord: 1 });
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Przeciągane pytanie", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const qRowSel = `#list .row[data-kind="q"][data-id="${qid}"]`;
      const catRowSel = `#list .row[data-kind="cat"][data-id="${catTarget}"]`;
      const qRow = page.locator(qRowSel);
      const catRow = page.locator(catRowSel);
      await expect(qRow).toBeVisible({ timeout: 15000 });
      await expect(catRow).toBeVisible({ timeout: 15000 });

      await simulateDragDrop(page, qRowSel, catRowSel);

      await expect(page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`)).toHaveCount(0, { timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.category_id).toBe(catTarget);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("editor współdzielonej bazy może dodawać foldery i pytania", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-SHAREEDIT-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });

      const user2Id = await page2.evaluate(async () => {
        const { data } = await window.__sbClient.auth.getUser();
        return data.user.id;
      });

      await page.evaluate(async ({ baseId, userId }) => {
        const { error } = await window.__sbClient
          .from("question_base_shares").insert({ base_id: baseId, user_id: userId, role: "editor" });
        if (error) throw new Error(error.message);
      }, { baseId, userId: user2Id });

      await page2.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page2.waitForLoadState("networkidle");

      const btnNewFolder = page2.locator('#toolbar button[data-act="newFolder"]');
      await expect(btnNewFolder).toBeEnabled({ timeout: 15000 });
      await btnNewFolder.click();
      await expect(page2.locator('#list .row[data-kind="cat"]')).toHaveCount(1, { timeout: 10000 });
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("viewer współdzielonej bazy nie może pisać -- UI wyszarzone i RLS blokuje bezpośredni zapis", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XB-SHAREVIEW-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });

      const user2Id = await page2.evaluate(async () => {
        const { data } = await window.__sbClient.auth.getUser();
        return data.user.id;
      });

      await page.evaluate(async ({ baseId, userId }) => {
        const { error } = await window.__sbClient
          .from("question_base_shares").insert({ base_id: baseId, user_id: userId, role: "viewer" });
        if (error) throw new Error(error.message);
      }, { baseId, userId: user2Id });

      await page2.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page2.waitForLoadState("networkidle");

      await expect(page2.locator('#toolbar button[data-act="newFolder"]')).toBeDisabled({ timeout: 15000 });
      await expect(page2.locator('#toolbar button[data-act="newQuestion"]')).toBeDisabled();

      const insertError = await page2.evaluate(async (baseId) => {
        const { error } = await window.__sbClient
          .from("qb_categories").insert({ base_id: baseId, parent_id: null, name: "Should fail", ord: 1 });
        return error ? error.message : null;
      }, baseId);
      expect(insertError, "RLS powinno zablokować zapis viewera bezpośrednio przez klienta, z pominięciem UI").not.toBeNull();
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("sortowanie po nazwie: klik nagłówka przełącza rosnąco/malejąco", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-SORTNAME-${Date.now()}`);

    try {
      // ord celowo NIE zgodny z alfabetem, żeby sort po nazwie było jednoznacznie odróżnialne od ord
      await createQuestion(page, { baseId, ord: 3, payload: { text: "Alfa", answers: [] } });
      await createQuestion(page, { baseId, ord: 1, payload: { text: "Beta", answers: [] } });
      await createQuestion(page, { baseId, ord: 2, payload: { text: "Gamma", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const titles = () => page.locator("#list tbody tr .title-text").allTextContents();

      // domyślny sort: name/asc (createState)
      await expect.poll(titles).toEqual(["Alfa", "Beta", "Gamma"]);

      await page.locator(".list-head .h-main").click();
      await expect.poll(titles).toEqual(["Gamma", "Beta", "Alfa"]);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("sortowanie po typie: foldery zawsze przed pytaniami, niezależnie od nazwy", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-SORTTYPE-${Date.now()}`);

    try {
      await createQuestion(page, { baseId, ord: 1, payload: { text: "A-pytanie", answers: [] } });
      await createCategory(page, { baseId, name: "Z-folder", ord: 1 });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // .title-text folderu to ikona SVG + spacja + nazwa (render.js) -- spacja
      // między ikoną a tekstem zostaje w textContent (widoczna tylko jako
      // odstęp od ikony, nie w samej nazwie), więc trimujemy przy porównaniu;
      // pytania nie mają ikony, więc to normalnie nie ma znaczenia gdzie
      // indziej w tym pliku, ale ten test miesza oba typy wierszy.
      const titles = () =>
        page.locator("#list tbody tr .title-text").allTextContents()
          .then((arr) => arr.map((s) => s.trim()));

      // domyślnie (name/asc) pytanie "A-pytanie" jest przed folderem "Z-folder"
      await expect.poll(titles).toEqual(["A-pytanie", "Z-folder"]);

      await page.locator(".list-head .h-type").click();
      // po typie: folder zawsze przed pytaniem, mimo że nazwą jest "później" alfabetycznie
      await expect.poll(titles).toEqual(["Z-folder", "A-pytanie"]);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("breadcrumbs: nawigacja w głąb i powrót do korzenia", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-CRUMBS-${Date.now()}`);

    try {
      const catA = await createCategory(page, { baseId, name: "Folder A", ord: 1 });
      const qInA = await createQuestion(page, { baseId, categoryId: catA, ord: 1, payload: { text: "W środku A", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await page.locator(`#list .row[data-kind="cat"][data-id="${catA}"]`).dblclick();
      await expect(page.locator(`#list .row[data-id="${qInA}"]`)).toBeVisible({ timeout: 10000 });

      await expect(page.locator("#breadcrumbs .crumb")).toHaveCount(2, { timeout: 5000 }); // Root / Folder A
      await expect(page.locator("#breadcrumbs .crumb").last()).toHaveText("Folder A");

      await page.locator('#breadcrumbs .crumb[data-kind="root"]').click();

      // z powrotem w widoku Wszystkie: widać folder A jako wiersz, nie jego zawartość
      await expect(page.locator(`#list .row[data-kind="cat"][data-id="${catA}"]`)).toBeVisible({ timeout: 10000 });
      await expect(page.locator(`#list .row[data-id="${qInA}"]`)).toHaveCount(0);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("Ctrl+D duplikuje zaznaczone pytanie w tym samym miejscu", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-CTRLD-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Do zduplikowania", answers: [{ text: "A1" }] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "duplicate", "Control+d");

      await expect(page.locator(`#list .row[data-kind="q"]`)).toHaveCount(2, { timeout: 10000 });

      const all = await getAllQuestionsFlat(page, baseId);
      expect(all.length).toBe(2);
      expect(all.every((q) => q.category_id === null)).toBe(true);
      expect(all.every((q) => q.payload?.text === "Do zduplikowania")).toBe(true);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("Ctrl+T pokazuje realny stan tri-state zaznaczenia (regresja: wcześniej zawsze 'none')", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-CTRLT-${Date.now()}`);

    try {
      const q1 = await createQuestion(page, { baseId, ord: 1, payload: { text: "P1", answers: [] } });
      const q2 = await createQuestion(page, { baseId, ord: 2, payload: { text: "P2", answers: [] } });
      const tagId = await createTag(page, { baseId, name: "e2e-ctrlt" });
      await assignTag(page, { questionId: q1, tagId }); // tylko P1 -- przy zaznaczeniu obu stan powinien być "some"

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row1 = page.locator(`#list .row[data-kind="q"][data-id="${q1}"]`);
      const row2 = page.locator(`#list .row[data-kind="q"][data-id="${q2}"]`);
      await expect(row1).toBeVisible({ timeout: 15000 });
      await row1.click();
      await row2.click({ modifiers: ["Control"] });

      await page.keyboard.press("Control+t");
      await expect(page.locator("#tagsOverlay")).toBeVisible({ timeout: 5000 });

      const checkbox = page.locator(`#tagsAssignList input[type="checkbox"][data-tag-id="${tagId}"]`);
      const isIndeterminate = await checkbox.evaluate((el) => el.indeterminate);
      expect(
        isIndeterminate,
        "przed naprawą Ctrl+T nie przekazywał zaznaczenia -- tri-state zawsze wychodził 'none' (odznaczone), nie 'some'"
      ).toBe(true);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("przeciągnięcie kilku zaznaczonych elementów naraz (folder + pytanie) przenosi oba", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-DRAGMULTI-${Date.now()}`);

    try {
      const catTarget = await createCategory(page, { baseId, name: "Cel", ord: 1 });
      const catSrc = await createCategory(page, { baseId, name: "Przenoszony folder", ord: 2 });
      const qSrc = await createQuestion(page, { baseId, ord: 1, payload: { text: "Przenoszone pytanie", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const catSrcRowSel = `#list .row[data-kind="cat"][data-id="${catSrc}"]`;
      const catTargetRowSel = `#list .row[data-kind="cat"][data-id="${catTarget}"]`;
      const catSrcRow = page.locator(catSrcRowSel);
      const qSrcRow = page.locator(`#list .row[data-kind="q"][data-id="${qSrc}"]`);
      const catTargetRow = page.locator(catTargetRowSel);
      await expect(catSrcRow).toBeVisible({ timeout: 15000 });
      await expect(qSrcRow).toBeVisible({ timeout: 15000 });

      await catSrcRow.click();
      await qSrcRow.click({ modifiers: ["Control"] });

      // dragstart na dowolnym zaznaczonym wierszu przenosi CAŁE zaznaczenie
      await simulateDragDrop(page, catSrcRowSel, catTargetRowSel);

      await expect(page.locator(`#list .row[data-kind="cat"][data-id="${catSrc}"]`)).toHaveCount(0, { timeout: 10000 });
      await expect(page.locator(`#list .row[data-kind="q"][data-id="${qSrc}"]`)).toHaveCount(0);

      const freshCat = await getCategoryRow(page, catSrc);
      const freshQ = await getQuestionRow(page, qSrc);
      expect(freshCat?.parent_id, "folder z wieloselekcji powinien trafić do celu").toBe(catTarget);
      expect(freshQ?.category_id, "pytanie z wieloselekcji powinno trafić do celu").toBe(catTarget);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("reorder rodzeństwa w drzewie (before/after) działa normalnie, gdy to nie jest cykl", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-REORDER-${Date.now()}`);

    try {
      const catA = await createCategory(page, { baseId, name: "Folder A", ord: 1 });
      const catB = await createCategory(page, { baseId, name: "Folder B", ord: 2 });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // root domyślnie rozwinięty -- oba widoczne bez dodatkowego klikania
      const rowASel = `#tree .row[data-kind="cat"][data-id="${catA}"]`;
      const rowBSel = `#tree .row[data-kind="cat"][data-id="${catB}"]`;
      const rowA = page.locator(rowASel);
      const rowB = page.locator(rowBSel);
      await expect(rowA).toBeVisible({ timeout: 15000 });
      await expect(rowB).toBeVisible({ timeout: 15000 });

      // upuść B w górnej (25%) strefie A => "before" => B przed A wśród rodzeństwa (ten sam rodzic: null)
      await simulateDragDrop(page, rowBSel, rowASel, { targetOffsetX: 20, targetOffsetY: 2 });

      await expect.poll(async () => {
        const a = await getCategoryRow(page, catA);
        const b = await getCategoryRow(page, catB);
        return (b?.ord ?? 999) < (a?.ord ?? -1);
      }, { timeout: 10000 }).toBe(true);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("kopiowanie folderu z podfolderem i pytaniem duplikuje całe poddrzewo", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-COPYSUBTREE-${Date.now()}`);

    try {
      const parent = await createCategory(page, { baseId, name: "Rodzic", ord: 1 });
      const child = await createCategory(page, { baseId, parentId: parent, name: "Dziecko", ord: 1 });
      await createQuestion(page, { baseId, categoryId: child, ord: 1, payload: { text: "W poddrzewie", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const parentRow = page.locator(`#list .row[data-kind="cat"][data-id="${parent}"]`);
      await expect(parentRow).toBeVisible({ timeout: 15000 });
      await parentRow.click();
      await page.keyboard.press("Control+c");
      await page.keyboard.press("Control+v");

      await expect(page.locator(`#list .row[data-kind="cat"]`)).toHaveCount(2, { timeout: 10000 });

      const allCats = await page.evaluate(async (id) => {
        const { data, error } = await window.__sbClient.from("qb_categories").select("*").eq("base_id", id);
        if (error) throw new Error(error.message);
        return data || [];
      }, baseId);
      const allQs = await getAllQuestionsFlat(page, baseId);

      expect(allCats.length, "oryginalny Rodzic+Dziecko oraz ich kopie = 4 kategorie").toBe(4);
      expect(allQs.length, "pytanie z poddrzewa też powinno się zduplikować").toBe(2);

      const copiedParent = allCats.find((c) => c.id !== parent && c.id !== child && c.parent_id === null);
      expect(copiedParent, "kopia Rodzica powinna dostać unikalną nazwę (kopia)").toBeTruthy();
      expect(copiedParent.name).toContain("kopia");

      const copiedChild = allCats.find((c) => c.parent_id === copiedParent.id);
      expect(copiedChild, "kopia Dziecka powinna wisieć pod kopią Rodzica, nie pod oryginałem").toBeTruthy();

      const copiedQuestion = allQs.find((q) => q.category_id === copiedChild.id);
      expect(copiedQuestion?.payload?.text).toBe("W poddrzewie");
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("Delete działa w widoku wyszukiwania (regresja: druga, zbędna bramka cicho blokowała SEARCH)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-DELSEARCH-${Date.now()}`);

    try {
      const uniq = `DoUsuniecia${Date.now()}`;
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: uniq, answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await page.locator("#searchText").fill(uniq);
      const row = page.locator(`#list .row[data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 10000 });
      await row.click();

      await page.keyboard.press("Delete");

      // przed naprawą: nic się nie działo (cicha, zbędna druga bramka canMutateHere
      // blokowała SEARCH, mimo że pierwsza bramka canDeleteHere je przepuszczała)
      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      // potwierdzenie zamyka modal synchronicznie, ale sam DELETE leci
      // asynchronicznie po kliknięciu -- run #77 złapał to jako flaky
      // (sprawdzenie DB, zanim żądanie realnie doleciało)
      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/rest/v1/qb_questions") && res.request().method() === "DELETE"),
        page.locator(".uni-modal .uni-foot .btn.gold").click(),
      ]);

      const fresh = await getQuestionRow(page, qid);
      expect(fresh, "Delete w widoku wyszukiwania powinien realnie usuwać, tak jak toolbar/menu kontekstowe").toBeNull();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("Edytuj pytanie (menu kontekstowe) działa w widoku wyszukiwania (regresja: zbędna blokada widoku)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-EDITSEARCH-${Date.now()}`);

    try {
      const uniq = `DoEdycji${Date.now()}`;
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: uniq, answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await page.locator("#searchText").fill(uniq);
      const row = page.locator(`#list .row[data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 10000 });
      await row.click();
      await row.click({ button: "right" });

      const editItem = page.locator(".context-menu .cm-item", { hasText: /Edytuj pytanie/i });
      await expect(editItem).toBeVisible({ timeout: 5000 });
      await expect(editItem).toBeEnabled({
        timeout: 5000,
      }); // przed naprawą: disabled w SEARCH mimo że toolbar/Ctrl+E to pozwalały
      await editItem.click();

      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("sortowanie po dacie: klik nagłówka przełącza rosnąco/malejąco", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XB-SORTDATE-${Date.now()}`);

    try {
      // nazwy celowo NIE w kolejności dat, żeby test nie mógł przypadkiem
      // przejść dzięki sortowaniu po nazwie zamiast po dacie
      await createQuestion(page, { baseId, ord: 1, payload: { text: "Najstarsze", answers: [] }, createdAt: "2020-01-01T00:00:00Z" });
      await createQuestion(page, { baseId, ord: 2, payload: { text: "Środkowe", answers: [] }, createdAt: "2021-01-01T00:00:00Z" });
      await createQuestion(page, { baseId, ord: 3, payload: { text: "Najnowsze", answers: [] }, createdAt: "2022-01-01T00:00:00Z" });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const titles = () => page.locator("#list tbody tr .title-text").allTextContents();

      await page.locator(".list-head .h-date").click();
      await expect.poll(titles).toEqual(["Najstarsze", "Środkowe", "Najnowsze"]);

      await page.locator(".list-head .h-date").click();
      await expect.poll(titles).toEqual(["Najnowsze", "Środkowe", "Najstarsze"]);
    } finally {
      await deleteBase(page, baseId);
    }
  });
});

/* ================= 3) question-modal.js (edycja pytania) ================= */

test.describe("base-explorer: question-modal.js (edycja pytania)", () => {

  test("edycja istniejącej odpowiedzi aktualizuje ją, nie dokłada nowej", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-QM-EDIT-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1,
        payload: { text: "Pytanie", answers: [{ text: "Stara", fixed_points: 10 }] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      const r = page.locator("#qAnswers .qRow").first();
      await r.locator(".qAnsText").fill("Nowa");
      await r.locator(".qAnsPts").fill("77");
      // questionModal.close() (chowa #questionOverlay) jest SYNCHRONICZNY na klik
      // Zapisz -- prawdziwy UPDATE do qb_questions leci asynchronicznie już PO
      // zamknięciu (w openQuestionModal, nie w samym modalu), więc trzeba poczekać
      // na realny PATCH, nie tylko na zniknięcie overlay.
      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/rest/v1/qb_questions") && res.request().method() === "PATCH"),
        page.locator("#qSave").click(),
      ]);
      await expect(page.locator("#questionOverlay")).toBeHidden({ timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.answers?.length, "edycja nie powinna dokładać nowej odpowiedzi").toBe(1);
      expect(fresh?.payload?.answers?.[0]?.text).toBe("Nowa");
      expect(fresh?.payload?.answers?.[0]?.fixed_points).toBe(77);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("usunięcie odpowiedzi przyciskiem ✕ persystuje po zapisie", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-QM-DELANS-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1,
        payload: { text: "Pytanie", answers: [{ text: "A1" }, { text: "A2" }, { text: "A3" }] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#qAnswers .qRow")).toHaveCount(3);

      await page.locator("#qAnswers .qRow").nth(1).locator(".qDel").click(); // usuń A2
      await expect(page.locator("#qAnswers .qRow")).toHaveCount(2);

      // questionModal.close() (chowa #questionOverlay) jest SYNCHRONICZNY na klik
      // Zapisz -- prawdziwy UPDATE do qb_questions leci asynchronicznie już PO
      // zamknięciu (w openQuestionModal, nie w samym modalu), więc trzeba poczekać
      // na realny PATCH, nie tylko na zniknięcie overlay.
      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/rest/v1/qb_questions") && res.request().method() === "PATCH"),
        page.locator("#qSave").click(),
      ]);
      await expect(page.locator("#questionOverlay")).toBeHidden({ timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      const texts = (fresh?.payload?.answers || []).map((a) => a.text);
      expect(texts).toEqual(["A1", "A3"]);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("tekst odpowiedzi jest obcinany do 17 znaków w locie", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-QM-TXTLEN-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Pytanie", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#qAdd").click();
      const input = page.locator("#qAnswers .qRow").first().locator(".qAnsText");
      await input.fill("To jest zdecydowanie za długi tekst odpowiedzi");
      await expect(input).toHaveValue("To jest zdecydowa", { timeout: 5000 }); // pierwsze 17 znaków

      // questionModal.close() (chowa #questionOverlay) jest SYNCHRONICZNY na klik
      // Zapisz -- prawdziwy UPDATE do qb_questions leci asynchronicznie już PO
      // zamknięciu (w openQuestionModal, nie w samym modalu), więc trzeba poczekać
      // na realny PATCH, nie tylko na zniknięcie overlay.
      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/rest/v1/qb_questions") && res.request().method() === "PATCH"),
        page.locator("#qSave").click(),
      ]);
      await expect(page.locator("#questionOverlay")).toBeHidden({ timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.answers?.[0]?.text?.length).toBeLessThanOrEqual(17);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("treść pytania jest ograniczana do 200 znaków (ten sam limit co przy F2)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-QM-QTXTLEN-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Pytanie", answers: [] } });
      const long = "A".repeat(250);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      const qText = page.locator("#qText");
      await qText.fill(long);
      await expect(qText).toHaveValue("A".repeat(200), { timeout: 5000 });

      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/rest/v1/qb_questions") && res.request().method() === "PATCH"),
        page.locator("#qSave").click(),
      ]);
      await expect(page.locator("#questionOverlay")).toBeHidden({ timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.text?.length).toBeLessThanOrEqual(200);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("punkty odpowiedzi są ograniczane do zakresu 0-100 w locie", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-QM-PTSCLAMP-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Pytanie", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#qAdd").click();
      const pts = page.locator("#qAnswers .qRow").first().locator(".qAnsPts");

      await pts.fill("999");
      await expect(pts).toHaveValue("100", { timeout: 5000 });

      await pts.fill("-50");
      await expect(pts).toHaveValue("0", { timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("zamknięcie modala krzyżykiem (X) nie zapisuje żadnych zmian", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-QM-CANCEL-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Oryginał", answers: [{ text: "A1" }] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#qText").fill("Zmieniony, ale nie zapisany");
      await page.locator("#qAdd").click();

      await page.locator("#qClose").click();
      await expect(page.locator("#questionOverlay")).toBeHidden({ timeout: 5000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.text).toBe("Oryginał");
      expect(fresh?.payload?.answers?.length).toBe(1);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("pusta treść pytania blokuje zapis (regresja: qSave w ogóle nie sprawdzał tekstu)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-QM-EMPTYTEXT-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Coś tam", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#qText").fill("   ");
      await page.locator("#qSave").click();

      await expect(page.locator("#qErr")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#qErr")).toContainText("pusta", { timeout: 5000 });
      await expect(page.locator("#questionOverlay")).toBeVisible(); // modal nie zamknął się

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.text).toBe("Coś tam"); // niezmienione w DB
    } finally {
      await deleteBase(page, baseId);
    }
  });
});

/* ================= 4) export-modal.js ('Utwórz grę') ================= */

test.describe("base-explorer: export-modal.js ('Utwórz grę')", () => {

  test("odznaczenie pytania poniżej progu 10 wyłącza przycisk Utwórz", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-COUNT-${Date.now()}`);

    try {
      await seedTenPlainQuestions(page, baseId);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await expect(page.locator("#list .row[data-kind=\"q\"]")).toHaveCount(10, { timeout: 15000 });

      // Ctrl+A zaznacza wszystkie 10 -- modal ma teraz wybierać DOKŁADNIE
      // to co user zaznaczył (patrz test "modal wybiera DOKŁADNIE
      // zaznaczone pytania" niżej), więc żeby wystartować z pełnym
      // zaznaczeniem trzeba zaznaczyć wszystko, a nie tylko jedno pytanie.
      await page.locator("#list").click();
      await page.keyboard.press("Control+a");
      await pressToolbarShortcut(page, "createGame", "Control+g");

      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });

      // domyślny typ to "Preparowana" (3-6 odpowiedzi wymagane) -- te pytania
      // są puste (0 odpowiedzi), więc byłyby czerwone/blokujące "Utwórz" z
      // powodu TYPU, nie liczby. "Typowa ankieta" nie ma tego wymogu --
      // test sprawdza wyłącznie próg liczby zaznaczonych, nie walidację typu.
      await page.locator("#lbl0").click();

      await expect(page.locator("#xCreate")).toBeEnabled({ timeout: 5000 });
      await expect(page.locator("#xCountVal")).toHaveText("10");

      await page.locator("#xList .xPickItem").first().click();

      await expect(page.locator("#xCountVal")).toHaveText("9", { timeout: 5000 });
      await expect(page.locator("#xCreate")).toBeDisabled();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("regresja: czerwone (niespełniające warunków typu) pytanie blokuje Utwórz, nawet gdy zaznaczone", async ({ page, context }) => {
    // Zgłoszenie użytkownika: podtytuł modala mówi "czerwone nie spełniają
    // warunków wybranego typu -- odhacz je albo popraw dane", ale gra i tak
    // powstawała z czerwonym (niepasującym) pytaniem w środku --
    // buildExportPayload() brało wszystko z selectedIds bez sprawdzania
    // validateForType(). Naprawa: "Utwórz" jest wyłączone dopóki
    // którekolwiek zaznaczone pytanie jest czerwone dla aktualnego typu.
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-BADBLOCKS-${Date.now()}`);

    try {
      // 10 z 3 odpowiedziami (zielone dla Punktacji/Preparowanej) + 1 z
      // 0 odpowiedziami (czerwone dla obu -- wymagają 3-6)
      await seedTenTypeCompatibleQuestions(page, baseId);
      const badQid = await createQuestion(page, {
        baseId, ord: 11, payload: { text: "Za mało odpowiedzi", answers: [] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await expect(page.locator('#list .row[data-kind="q"]')).toHaveCount(11, { timeout: 15000 });

      await page.locator("#list").click();
      await page.keyboard.press("Control+a");
      await pressToolbarShortcut(page, "createGame", "Control+g");
      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#lbl1").click(); // Punktacja -- wymaga 3-6 odpowiedzi
      await expect(page.locator(`#xList .xPickItem[data-qid="${badQid}"]`)).toHaveClass(/\bbad\b/, { timeout: 5000 });

      // 11 zaznaczonych (>=10), ale jedno czerwone -> Utwórz ma być wyłączone
      await expect(page.locator("#xCountVal")).toHaveText("11");
      await expect(page.locator("#xCreate")).toBeDisabled();

      // odznaczenie czerwonego odblokowuje (zostaje 10 zielonych)
      await page.locator(`#xList .xPickItem[data-qid="${badQid}"]`).click();
      await expect(page.locator("#xCountVal")).toHaveText("10");
      await expect(page.locator("#xCreate")).toBeEnabled({ timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("regresja: modal wybiera DOKŁADNIE zaznaczone pytania, nie dopełnia losowymi resztkami do progu 10", async ({ page, context }) => {
    // Zgłoszenie użytkownika: w modalu tworzenia gry zaznaczonych jest
    // zawsze dokładnie 10 pytań, mimo że user zaznaczył/wybrał mniej --
    // export-modal.js's open() dopełniało selekcję losowo dobranymi
    // pytaniami z całej bazy do progu QN_MIN(10). Naprawa: brak dopełniania
    // -- selekcja w modalu = dokładnie to co user zaznaczył, nawet jeśli to
    // mniej niż 10 (przycisk "Utwórz" zostaje wtedy po prostu wyłączony).
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-NORANDOM-${Date.now()}`);

    try {
      // 15 pytań w bazie -- gdyby modal dopełniał do 10, wybrałby 7 spośród
      // TYCH 12 niezaznaczonych (obce dla zaznaczenia użytkownika).
      const ids = [];
      for (let i = 0; i < 15; i++) {
        ids.push(await createQuestion(page, {
          baseId, ord: i + 1, payload: { text: `Pytanie ${i + 1}`, answers: [] },
        }));
      }

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      // zaznacz tylko 3 konkretne pytania (Ctrl+klik)
      const chosen = ids.slice(0, 3);
      for (const qid of chosen) {
        await page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`).click({ modifiers: ["Control"] });
      }
      await expect(page.locator("#list .row.is-selected")).toHaveCount(3, { timeout: 5000 });

      await pressToolbarShortcut(page, "createGame", "Control+g");
      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });

      // dokładnie 3, nie 10 -- i to te same 3, nie jakiekolwiek inne
      await expect(page.locator("#xCountVal")).toHaveText("3");
      await expect(page.locator("#xCreate")).toBeDisabled();

      for (const qid of chosen) {
        const cb = page.locator(`#xList .xPickItem[data-qid="${qid}"] input[type="checkbox"]`);
        await expect(cb).toBeChecked();
      }
      const notChosen = ids.filter((id) => !chosen.includes(id));
      for (const qid of notChosen) {
        const cb = page.locator(`#xList .xPickItem[data-qid="${qid}"] input[type="checkbox"]`);
        await expect(cb).not.toBeChecked();
      }
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("Utwórz grę z zaznaczonego folderu podpowiada jego nazwę jako nazwę gry", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-FOLDERNAME-${Date.now()}`);

    try {
      const catId = await createCategory(page, { baseId, name: "Sport", ord: 1 });
      for (let i = 0; i < 10; i++) {
        await createQuestion(page, {
          baseId, categoryId: catId, ord: i + 1,
          payload: { text: `Pytanie sportowe ${i + 1}`, answers: [] },
        });
      }

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const folderRow = page.locator(`#list .row[data-kind="cat"][data-id="${catId}"]`);
      await expect(folderRow).toBeVisible({ timeout: 15000 });
      await folderRow.click();
      await pressToolbarShortcut(page, "createGame", "Control+g");

      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#xName")).toHaveValue("Sport");
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("modal typu gry: bez angielskich podpisów technicznych pod przyciskami, suwak cały złoty", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-TYPEUI-${Date.now()}`);

    try {
      const ids = await seedTenPlainQuestions(page, baseId);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const firstRow = page.locator(`#list .row[data-kind="q"][data-id="${ids[0]}"]`);
      await expect(firstRow).toBeVisible({ timeout: 15000 });
      await firstRow.click();
      await pressToolbarShortcut(page, "createGame", "Control+g");

      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });

      // brak "poll_text"/"poll_points"/"prepared" pod przyciskami typu
      await expect(page.locator(".xTypeLbl span")).toHaveCount(0);

      // suwak: --track ma być jednolicie złoty, nie domyślny czarno-biały .rng
      const track = await page.locator("#xTypeRange").evaluate(
        (el) => getComputedStyle(el).getPropertyValue("--track")
      );
      expect(track).toContain("#f5d26b");
      expect(track).not.toContain("#000");
      expect(track).not.toContain("#fff");
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("zmiana typu na PUNKTACJA oznacza pytania spoza zakresu 3-6 odpowiedzi jako niepasujące", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-TYPEBADGE-${Date.now()}`);

    try {
      const qShort = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Za mało odpowiedzi", answers: [{ text: "A" }, { text: "B" }] },
      });
      const qGood = await createQuestion(page, {
        baseId, ord: 2,
        payload: { text: "W sam raz", answers: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }] },
      });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const rowShort = page.locator(`#list .row[data-kind="q"][data-id="${qShort}"]`);
      await expect(rowShort).toBeVisible({ timeout: 15000 });
      await rowShort.click({ modifiers: ["Control"] });
      const rowGood = page.locator(`#list .row[data-kind="q"][data-id="${qGood}"]`);
      await rowGood.click({ modifiers: ["Control"] });
      await rowShort.click({ button: "right" });
      await page.locator(".context-menu .cm-item", { hasText: /Utwórz grę/i }).click();

      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });

      // domyślnie "Preparowana" -- za mało odpowiedzi też jest "bad" tam, ale
      // sprawdzamy jawnie po przełączeniu na "Punktacja" (środkowa etykieta)
      await page.locator("#lbl1").click();

      const itemShort = page.locator(`#xList .xPickItem[data-qid="${qShort}"]`);
      const itemGood = page.locator(`#xList .xPickItem[data-qid="${qGood}"]`);
      await expect(itemShort).toHaveClass(/\bbad\b/, { timeout: 5000 });
      await expect(itemGood).toHaveClass(/\bok\b/, { timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("eksport typu PUNKTACJA zeruje punkty w utworzonej grze niezależnie od źródła", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-POINTSZERO-${Date.now()}`);
    let gameId = null;

    try {
      const gameName = `E2E-XM-CREATED-PP-${Date.now()}`;
      const qid = await createQuestion(page, {
        baseId, ord: 1,
        payload: { text: "Pytanie z punktami", answers: [
          { text: "A1", fixed_points: 30 }, { text: "A2", fixed_points: 40 }, { text: "A3", fixed_points: 30 },
        ] },
      });
      await seedTenTypeCompatibleQuestions(page, baseId, 2);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      // Modal wybiera dokładnie zaznaczenie (bez dopełniania do 10 losowymi
      // resztkami) -- zaznacz więc wszystkie 11, żeby "Utwórz" się odblokowało.
      await page.locator("#list").click();
      await page.keyboard.press("Control+a");
      await pressToolbarShortcut(page, "createGame", "Control+g");
      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#lbl1").click(); // Punktacja (poll_points)
      await page.locator("#xName").fill(gameName);
      await expect(page.locator("#xCreate")).toBeEnabled({ timeout: 5000 });
      await page.locator("#xCreate").click();
      await expect(page.locator("#exportOverlay")).toBeHidden({ timeout: 15000 });

      const game = await findGameByName(page, gameName);
      expect(game).not.toBeNull();
      gameId = game.id;

      const questions = await getGameQuestionsWithAnswers(page, gameId);
      const target = questions.find((q) => q.text === "Pytanie z punktami");
      expect(target, "wyeksportowane pytanie powinno się znaleźć w nowej grze").toBeTruthy();
      for (const a of target.answers) {
        expect(a.fixed_points, "poll_points musi zerować punkty niezależnie od źródła").toBe(0);
      }
    } finally {
      if (gameId) await deleteGame(page, gameId);
      await deleteBase(page, baseId);
    }
  });

  test("eksport typu PREPAROWANA zachowuje tekst i punkty odpowiedzi", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-PREPKEEP-${Date.now()}`);
    let gameId = null;

    try {
      const gameName = `E2E-XM-CREATED-PREP-${Date.now()}`;
      const qid = await createQuestion(page, {
        baseId, ord: 1,
        payload: { text: "Pytanie preparowane", answers: [
          { text: "Jeden", fixed_points: 60 }, { text: "Dwa", fixed_points: 40 }, { text: "Trzy", fixed_points: 0 },
        ] },
      });
      await seedTenTypeCompatibleQuestions(page, baseId, 2);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      // Modal wybiera dokładnie zaznaczenie (bez dopełniania do 10 losowymi
      // resztkami) -- zaznacz więc wszystkie 11, żeby "Utwórz" się odblokowało.
      await page.locator("#list").click();
      await page.keyboard.press("Control+a");
      await pressToolbarShortcut(page, "createGame", "Control+g");
      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#lbl2").click(); // Preparowana (domyślna, ale ustawiamy jawnie)
      await page.locator("#xName").fill(gameName);
      await expect(page.locator("#xCreate")).toBeEnabled({ timeout: 5000 });
      await page.locator("#xCreate").click();
      await expect(page.locator("#exportOverlay")).toBeHidden({ timeout: 15000 });

      const game = await findGameByName(page, gameName);
      expect(game).not.toBeNull();
      gameId = game.id;

      const questions = await getGameQuestionsWithAnswers(page, gameId);
      const target = questions.find((q) => q.text === "Pytanie preparowane");
      expect(target).toBeTruthy();
      const byText = new Map(target.answers.map((a) => [a.text, a.fixed_points]));
      expect(byText.get("Jeden")).toBe(60);
      expect(byText.get("Dwa")).toBe(40);
      expect(byText.get("Trzy")).toBe(0);
    } finally {
      if (gameId) await deleteGame(page, gameId);
      await deleteBase(page, baseId);
    }
  });

  test("zamknięcie modala eksportu krzyżykiem nie tworzy gry", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-CLOSENOCREATE-${Date.now()}`);

    try {
      const gameName = `E2E-XM-SHOULD-NOT-EXIST-${Date.now()}`;
      const ids = await seedTenPlainQuestions(page, baseId);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${ids[0]}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "createGame", "Control+g");
      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#xName").fill(gameName);
      await page.locator("#xClose").click();
      await expect(page.locator("#exportOverlay")).toBeHidden({ timeout: 5000 });

      const game = await findGameByName(page, gameName);
      expect(game, "zamknięcie X nie powinno utworzyć gry").toBeNull();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("baza z mniej niż 10 pytaniami pokazuje błąd i nie pozwala na eksport", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-TOOFEW-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Jedyne pytanie", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "createGame", "Control+g");

      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#xErr")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#xErr")).toContainText("Potrzebujesz co najmniej", { timeout: 5000 });
      await expect(page.locator("#xCreate")).toBeDisabled();
    } finally {
      await deleteBase(page, baseId);
    }
  });
});

/* ================= 5) współdzielenie i uprawnienia (dwóch RÓŻNYCH użytkowników) =================
 *
 * W odróżnieniu od grupy 2) (jeden user, dwa konteksty tej samej sesji),
 * tu logujemy NAPRAWDĘ drugie konto (TEST_USERNAME_2) na tej samej,
 * współdzielonej bazie -- punkty B) i C) z planu audytu base-explorera.
 * Cel: nie tylko "czy da się kliknąć", ale co się dzieje z DANYMI, gdy
 * dwie osoby faktycznie nachodzą na siebie w czasie.
 */

test.describe("base-explorer: współdzielenie i uprawnienia (dwóch różnych użytkowników)", () => {

  test("edycja tego samego pytania przez dwie osoby niemal jednocześnie -- późniejszy zapis cicho nadpisuje wcześniejszy", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XS-RACE-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);

      await shareBaseWith(page, baseId, user2Id, "editor");

      const qid = await createQuestion(page, {
        baseId, ord: 1,
        payload: { text: "Wersja wyjściowa", answers: [{ text: "A1" }] },
      });

      // Właściciel otwiera pytanie do edycji -- payload zostaje wczytany do
      // modala W TEJ CHWILI (fetchQuestionById w openQuestionModal), i to on
      // dostaje nadpisany w całości przy Zapisz, niezależnie od tego co się
      // zmieni w międzyczasie w DB.
      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      // W międzyczasie drugi user (editor) modyfikuje to samo pytanie
      // bezpośrednio (symulacja jego niezależnej edycji "gdzieś indziej")
      await page2.evaluate(async ({ id }) => {
        const { error } = await window.__sbClient
          .from("qb_questions")
          .update({ payload: { text: "Wersja od editora", answers: [{ text: "B1" }] } })
          .eq("id", id);
        if (error) throw new Error(error.message);
      }, { id: qid });

      // Właściciel kończy swoją edycję i zapisuje -- wciąż na bazie payloadu
      // sprzed chwili (bez odpowiedzi editora)
      await page.locator("#qText").fill("Wersja finalna właściciela");
      await Promise.all([
        page.waitForResponse((res) => res.url().includes("/rest/v1/qb_questions") && res.request().method() === "PATCH"),
        page.locator("#qSave").click(),
      ]);
      await expect(page.locator("#questionOverlay")).toBeHidden({ timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.text, "ostatni Zapisz wygrywa, bez błędu i bez ostrzeżenia o konflikcie").toBe("Wersja finalna właściciela");
      expect(
        (fresh?.payload?.answers || []).map((a) => a.text),
        "edycja editora w międzyczasie (B1) zostaje bezpowrotnie i cicho nadpisana"
      ).toEqual(["A1"]);
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("usunięcie pytania przez jednego usera, gdy drugi ma je otwarte do edycji -- zapis kończy się cicho, pytanie nie wraca", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XS-DELWHILEEDIT-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Do usunięcia gdzie indziej", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      // Drugi user usuwa to pytanie, podczas gdy pierwszy wciąż ma otwarty modal
      await page2.evaluate(async (id) => {
        const { error } = await window.__sbClient.from("qb_questions").delete().eq("id", id);
        if (error) throw new Error(error.message);
      }, qid);

      // Pierwszy user kończy edycję i zapisuje -- UPDATE trafia w 0 wierszy,
      // bez błędu (Postgres/PostgREST nie traktuje "nic nie pasowało" jak wyjątek)
      await page.locator("#qText").fill("Ta zmiana nie ma już czego dotyczyć");
      await page.locator("#qSave").click();
      await expect(page.locator("#questionOverlay")).toBeHidden({ timeout: 10000 });
      // brak alertModal z błędem -- zapis "powiódł się" po cichu
      await expect(page.locator(".uni-modal")).toHaveCount(0);

      const fresh = await getQuestionRow(page, qid);
      expect(fresh, "UPDATE na usuniętym wierszu nie może go wskrzesić").toBeNull();
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("cofnięcie dostępu w trakcie sesji -- kolejny zapis jest odrzucony przez RLS mimo wciąż otwartej karty", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XS-REVOKE-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      await page2.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page2.waitForLoadState("networkidle");
      await expect(page2.locator('#toolbar button[data-act="newFolder"]')).toBeEnabled({ timeout: 15000 });

      // Właściciel cofa dostęp -- karta drugiego usera NIE jest odświeżana,
      // nie ma żadnego live sygnału (znany, udokumentowany w planie brak)
      await revokeShare(page, baseId, user2Id);

      // Mimo że przycisk w UI wciąż pokazuje się jako aktywny (brak
      // odświeżenia roli na żywo), RLS na poziomie bazy blokuje zapis
      // natychmiast, niezależnie od tego co pamięta klient
      const insertError = await page2.evaluate(async (baseId) => {
        const { error } = await window.__sbClient
          .from("qb_categories").insert({ base_id: baseId, parent_id: null, name: "Po cofnięciu dostępu", ord: 1 });
        return error ? error.message : null;
      }, baseId);
      expect(insertError, "RLS musi odrzucić zapis natychmiast po cofnięciu udostępnienia, bez czekania na odświeżenie karty").not.toBeNull();
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("degradacja roli editor -> viewer na żywo -- RLS blokuje zapis mimo nieodświeżonej karty", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XS-DOWNGRADE-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      await page2.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page2.waitForLoadState("networkidle");
      await expect(page2.locator('#toolbar button[data-act="newFolder"]')).toBeEnabled({ timeout: 15000 });

      // Właściciel obniża rolę do viewer, bez żadnego sygnału do otwartej karty
      await shareBaseWith(page, baseId, user2Id, "viewer");

      const insertError = await page2.evaluate(async (baseId) => {
        const { error } = await window.__sbClient
          .from("qb_categories").insert({ base_id: baseId, parent_id: null, name: "Po degradacji roli", ord: 1 });
        return error ? error.message : null;
      }, baseId);
      expect(insertError, "base_can_edit() sprawdza rolę na żywo z DB, nie z cache klienta").not.toBeNull();
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("viewer nie zapisze bezpośrednio ani pytań, ani tagów (nie tylko kategorii)", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XS-VIEWERWRITE-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "viewer");

      await page2.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page2.waitForLoadState("networkidle");

      const questionInsertError = await page2.evaluate(async (baseId) => {
        const { error } = await window.__sbClient
          .from("qb_questions").insert({ base_id: baseId, category_id: null, ord: 1, payload: { text: "Should fail", answers: [] } });
        return error ? error.message : null;
      }, baseId);
      expect(questionInsertError, "viewer nie może dodać pytania bezpośrednio przez klienta").not.toBeNull();

      const tagInsertError = await page2.evaluate(async (baseId) => {
        const { error } = await window.__sbClient
          .from("qb_tags").insert({ base_id: baseId, name: "Should fail", color: "#ffffff", ord: 1 });
        return error ? error.message : null;
      }, baseId);
      expect(tagInsertError, "viewer nie może dodać tagu bezpośrednio przez klienta").not.toBeNull();
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("editor nie może zmienić nazwy bazy -- to uprawnienie wyłącznie właściciela", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const originalName = `E2E-XS-RENAME-${Date.now()}`;
    const baseId = await createBase(page, originalName);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      await page2.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page2.waitForLoadState("networkidle");

      // qb_bases_update: USING/WITH CHECK (owner_id = auth.uid()) -- editor
      // nie jest właścicielem, więc RLS po prostu nie dopasuje żadnego wiersza
      // (UPDATE "powiedzie się" z 0 zmienionych wierszy, bez jawnego błędu)
      await page2.evaluate(async ({ baseId }) => {
        await window.__sbClient.from("question_bases").update({ name: "Nazwa od editora" }).eq("id", baseId);
      }, { baseId });

      const fresh = await page.evaluate(async (id) => {
        const { data, error } = await window.__sbClient.from("question_bases").select("name").eq("id", id).single();
        if (error) throw new Error(error.message);
        return data;
      }, baseId);
      expect(fresh?.name, "nazwa bazy może się zmienić WYŁĄCZNIE przez właściciela").toBe(originalName);
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("blokada pytania: drugi user je edytuje, pierwszy dostaje komunikat zamiast modala, zwolnienie odblokowuje od razu", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XL-QLOCK-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Zablokowane pytanie", answers: [] } });

      const lock = await acquireLockDirect(page2, "base_question", qid, "e2e-test:question-modal");
      expect(lock?.ok, "drugi user musi realnie zająć blokadę przed próbą pierwszego").toBe(true);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");

      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#questionOverlay")).toBeHidden();
      await page.locator(".uni-modal .uni-foot button").first().click();
      await expect(page.locator(".uni-modal")).toHaveCount(0);

      // zwolnienie blokady (odpowiednik zamknięcia modala/karty drugiego usera)
      // musi natychmiast pozwolić pierwszemu wejść do edycji
      await releaseLockDirect(page2, "base_question", qid, lock.tabId);

      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("blokada folderu obejmuje poddrzewo: usunięcie folderu jest zablokowane, gdy drugi user edytuje ZAGNIEŻDŻONE pytanie", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XL-FOLDERSUBTREE-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      const catId = await createCategory(page, { baseId, name: "Folder z blokadą w środku", ord: 1 });
      const qid = await createQuestion(page, { baseId, categoryId: catId, ord: 1, payload: { text: "Pytanie w folderze", answers: [] } });

      // drugi user "edytuje" TYLKO zagnieżdżone pytanie -- nie sam folder
      const lock = await acquireLockDirect(page2, "base_question", qid, "e2e-test:question-modal");
      expect(lock?.ok).toBe(true);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      const folderRow = page.locator(`#list .row[data-kind="cat"][data-id="${catId}"]`);
      await expect(folderRow).toBeVisible({ timeout: 15000 });
      await folderRow.click();

      await page.keyboard.press("Delete");
      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      // to jest okno POTWIERDZENIA usunięcia (confirmModal) -- potwierdź je,
      // dopiero WTEDY appka próbuje zająć blokady i musi się zatrzymać na
      // zablokowanym pytaniu w środku, zanim cokolwiek skasuje
      await page.locator(".uni-modal .uni-foot .btn.gold").click();

      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await page.locator(".uni-modal .uni-foot button").first().click();

      const folderStillThere = await getCategoryRow(page, catId);
      expect(folderStillThere, "folder nie może zniknąć, gdy pytanie w jego poddrzewie jest zablokowane gdzie indziej").not.toBeNull();
      const questionStillThere = await getQuestionRow(page, qid);
      expect(questionStillThere, "usunięcie musi być odrzucone w całości, nie częściowo").not.toBeNull();
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });

  test("tagi (assign): blokada innego, niezmienianego tagu NIE przeszkadza zapisać innego tagu w tym samym modalu", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const baseId = await createBase(page, `E2E-XL-TAGSCOPE-${Date.now()}`);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Pytanie do otagowania", answers: [] } });
      const lockedTagId = await createTag(page, { baseId, name: "e2e-locked" });
      const freeTagId = await createTag(page, { baseId, name: "e2e-free" });

      // drugi user "zarządza" (edytuje) tagId, którego w tym teście NIE
      // dotykamy w modalu przypisywania -- jeśli modal blokowałby WSZYSTKIE
      // widoczne tagi (błąd pierwszej wersji implementacji), zapis niżej
      // zostałby niesłusznie odrzucony.
      const lock = await acquireLockDirect(page2, "base_tag", lockedTagId, "e2e-test:tags-edit");
      expect(lock?.ok).toBe(true);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await row.click({ button: "right" });
      await page.locator(".context-menu .cm-item", { hasText: /Tagi/i }).click();
      await expect(page.locator("#tagsOverlay")).toBeVisible({ timeout: 5000 });

      // oba tagi widoczne w L1 (w tym zablokowany) -- zaznaczamy tylko WOLNY
      await expect(page.locator(`#tagsAssignList input[type="checkbox"][data-tag-id="${lockedTagId}"]`)).toBeVisible({ timeout: 5000 });
      await page.locator(`#tagsAssignList input[type="checkbox"][data-tag-id="${freeTagId}"]`).click();
      await page.locator("#tagsL1Save").click();

      await expect(page.locator("#tagsOverlay")).toBeHidden({ timeout: 10000 });
      const tagIds = await getQuestionTagIds(page, qid);
      expect(tagIds, "wolny tag musi się zapisać mimo że inny, niedotykany tag jest zablokowany").toContain(freeTagId);
      expect(tagIds).not.toContain(lockedTagId);
    } finally {
      if (context2) await context2.close();
      await deleteBase(page, baseId);
    }
  });
});

/* ================= 5.5) Warstwa 2 -- updateChecked()/ROW_GONE =================
 *
 * Warstwa 1 (locki per element, sekcja wyżej) chroni UX -- konflikt
 * pokazuje jasny komunikat zamiast cichego rozjazdu. Warstwa 2 jest
 * niezależną linią obrony: nawet gdy blokada zostanie ominięta (zasób
 * usunięty bezpośrednio przez inny proces/klienta, nie przez UI, które by
 * ją zajęło), UPDATE trafiający w 0 wierszy nie może cicho "udać się" --
 * ten sam wzorzec co już zamknięty dla `editor.js` (docs, sekcja "Warstwa
 * 2"). Symulujemy ominięcie usuwając zasób bezpośrednio przez
 * window.__sbClient tuż przed kliknięciem Zapisz, w tej samej karcie --
 * nie trzeba drugiego, prawdziwego konta, bo to nie test współdzielenia,
 * tylko odporności samego zapisu.
 */

test.describe("base-explorer: Warstwa 2 (updateChecked, ROW_GONE)", () => {

  test("F2: zmiana nazwy pytania usuniętego tuż przed Zapisz pokazuje komunikat zamiast cichego sukcesu", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XV-RENAMEGONE-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Do usunięcia w trakcie edycji", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await page.keyboard.press("F2");

      const input = page.locator("#renameModalInput");
      await expect(input).toBeVisible({ timeout: 5000 });
      await input.fill("Nowa nazwa");

      // pytanie znika "gdzieś indziej" (poza blokadą -- bezpośredni zapis)
      // tuż przed kliknięciem Zapisz
      await page.evaluate(async (id) => {
        await window.__sbClient.from("qb_questions").delete().eq("id", id);
      }, qid);

      await page.locator("#renameModalSave").click();
      await expect(page.locator(".uni-modal .mSub")).toHaveText(/w międzyczasie usunięte/i, { timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("Ctrl+E: zapis treści pytania usuniętego tuż przed Zapisz pokazuje komunikat zamiast cichego sukcesu", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XV-QSAVEGONE-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Do usunięcia w trakcie edycji", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await pressToolbarShortcut(page, "editQuestion", "Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#qText").fill("Nowa treść");

      // pytanie znika "gdzieś indziej" tuż przed kliknięciem Zapisz
      await page.evaluate(async (id) => {
        await window.__sbClient.from("qb_questions").delete().eq("id", id);
      }, qid);

      await page.locator("#qSave").click();
      await expect(page.locator(".uni-modal .mSub")).toHaveText(/w międzyczasie usunięte/i, { timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("Edytuj tag: zapis nazwy/koloru tagu usuniętego tuż przed Zapisz pokazuje komunikat w modalu", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XV-TAGEDITGONE-${Date.now()}`);

    try {
      const tagId = await createTag(page, { baseId, name: "e2e-do-znikniecia" });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tagRow = page.locator(`#tags .row[data-kind="tag"][data-id="${tagId}"]`);
      await expect(tagRow).toBeVisible({ timeout: 15000 });
      await tagRow.click({ button: "right" });

      const editItem = page.locator(".context-menu .cm-item", { hasText: /Edytuj tag/i });
      await expect(editItem).toBeVisible({ timeout: 5000 });
      await editItem.click();

      await expect(page.locator("#tagsOverlay")).toBeVisible({ timeout: 5000 });
      await page.locator("#tagsEditName").fill("nowanazwa");

      // tag znika "gdzieś indziej" tuż przed kliknięciem Zapisz
      await page.evaluate(async (id) => {
        await window.__sbClient.from("qb_tags").delete().eq("id", id);
      }, tagId);

      await page.locator("#tagsL2Save").click();
      await expect(page.locator("#tagsEditErr")).toHaveText(/w międzyczasie usunięte/i, { timeout: 5000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });
});

/* ================= 6) mobile.js (drawer, long-press, podwójny tap) =================
 *
 * mobile.js nie ma żadnych własnych testów mimo osobnego, nietrywialnego
 * mechanizmu wejścia (drawer, long-press jako zamiennik PPM, podwójny tap
 * jako zamiennik dblclick). Symulujemy zdarzenia dotykowe (PointerEvent
 * pointerType:"touch", TouchEvent) ręcznie przez page.evaluate() zamiast
 * polegać na natywnej emulacji dotyku Playwrighta -- ta sama ostrożność
 * co przy simulateDragDrop() wyżej: prościej i pewniej niż CDP-owa
 * symulacja gestów, której akurat w tym środowisku CI nie można ufać
 * (patrz Runda 12 w docs/plan-testy-i-poprawki.md).
 */

async function simulateLongPress(page, selector, holdMs = 650) {
  await page.evaluate(({ selector }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`simulateLongPress: element not found (${selector})`);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    el.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, pointerType: "touch", clientX: x, clientY: y,
    }));
  }, { selector });
  await page.waitForTimeout(holdMs);
}

async function simulateDoubleTap(page, selector) {
  await page.evaluate(({ selector }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`simulateDoubleTap: element not found (${selector})`);
    function tap() {
      const touch = new Touch({ identifier: 1, target: el, clientX: 0, clientY: 0 });
      el.dispatchEvent(new TouchEvent("touchend", {
        bubbles: true, cancelable: true, composed: true,
        touches: [], targetTouches: [], changedTouches: [touch],
      }));
    }
    tap();
    tap();
  }, { selector });
}

test.describe("base-explorer: mobile.js (drawer, long-press, podwójny tap)", () => {

  test("drawer: przycisk otwiera/zamyka panel; klik w wiersz go NIE zamyka", async ({ page, context }) => {
    // Na życzenie: zaznaczenie/nawigacja w drzewie/tagach nie ma już
    // automatycznie zamykać drawera (dawniej zamykał się po KAŻDYM kliku,
    // nawet samym zaznaczeniu) -- lista po prawej i tak aktualizuje się w
    // tle, user zamyka drawer ręcznie (hamburger albo klik w overlay).
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 400, height: 800 });
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-DRAWER-${Date.now()}`);

    try {
      const catId = await createCategory(page, { baseId, name: "Folder mobilny", ord: 1 });
      for (let i = 0; i < 10; i++) {
        await createQuestion(page, {
          baseId, categoryId: catId, ord: i + 1,
          payload: { text: `Pytanie ${i + 1}`, answers: [] },
        });
      }

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const btnDrawer = page.locator("#btnDrawerToggle");
      const panel = page.locator("#explorerLeft");
      await expect(btnDrawer).toBeVisible({ timeout: 15000 });
      await expect(panel).not.toHaveClass(/is-open/);

      await btnDrawer.click();
      await expect(panel).toHaveClass(/is-open/);
      await expect(page.locator("#drawerOverlay")).toBeVisible();

      const folderRow = page.locator(`#tree .row[data-kind="cat"][data-id="${catId}"]`);

      // pojedynczy klik (samo zaznaczenie) -- drawer zostaje otwarty
      await folderRow.click();
      await expect(panel).toHaveClass(/is-open/);

      // dblclick (realna nawigacja do folderu) -- drawer WCIĄŻ otwarty,
      // ale lista po prawej i tak się zaktualizowała w tle
      await folderRow.dblclick();
      await expect(panel).toHaveClass(/is-open/);
      await expect(page.locator('#list .row[data-kind="q"]')).toHaveCount(10, { timeout: 10000 });

      // zamyka się tylko ręcznie: hamburger
      await btnDrawer.click();
      await expect(panel).not.toHaveClass(/is-open/);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("regresja: otwarty drawer nie zasłania toolbara (#toolbar jest osobnym elementem NAD .explorer)", async ({ page, context }) => {
    // Przed naprawą: .explorer-left/.drawer-overlay pozycjonowały się na
    // top: var(--topbar-h) (tylko globalny topbar strony) -- ale #toolbar
    // (search + przyciski) leży JESZCZE NIŻEJ, między topbarem a .explorer
    // (patrz base-explorer.html), więc drawer zaczynał się dokładnie tam
    // gdzie zaczynał się toolbar i go zasłaniał. initDrawer() w mobile.js
    // mierzy realną wysokość #toolbar i doi ją do --be-toolbar-h.
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 400, height: 800 });
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-DRAWERTOOLBAR-${Date.now()}`);

    try {
      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const btnDrawer = page.locator("#btnDrawerToggle");
      await expect(btnDrawer).toBeVisible({ timeout: 15000 });
      await btnDrawer.click();
      await expect(page.locator("#explorerLeft")).toHaveClass(/is-open/);

      const toolbarBox = await page.locator("#toolbar").boundingBox();
      const drawerBox = await page.locator("#explorerLeft").boundingBox();
      expect(toolbarBox).toBeTruthy();
      expect(drawerBox).toBeTruthy();

      // brak nakładania w pionie: drawer musi zaczynać się na/poniżej dołu toolbara
      expect(drawerBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height - 1);
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("long-press na wierszu listy otwiera menu kontekstowe (zamiennik PPM na dotyku)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 400, height: 800 });
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-LONGPRESS-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Long-press mnie", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const rowSel = `#list .row[data-kind="q"][data-id="${qid}"]`;
      await expect(page.locator(rowSel)).toBeVisible({ timeout: 15000 });

      await simulateLongPress(page, rowSel);

      await expect(page.locator(".context-menu")).toBeVisible({ timeout: 5000 });
      await expect(page.locator(".context-menu .cm-item", { hasText: /Edytuj pytanie/i })).toBeVisible();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("long-press anulowany przez ruch palca > 10px nie otwiera menu (nie blokuje zwykłego przewijania/scrollowania)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 400, height: 800 });
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-LONGPRESSMOVE-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Nie długo trzymane", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const rowSel = `#list .row[data-kind="q"][data-id="${qid}"]`;
      await expect(page.locator(rowSel)).toBeVisible({ timeout: 15000 });

      // pointerdown, potem ruch > MOVE_THRESHOLD (10px) PRZED upływem 500ms --
      // addLongPress() musi to potraktować jako przewijanie, nie długie
      // tapnięcie. Wszystkie trzy zdarzenia w JEDNYM page.evaluate() -- dwa
      // osobne round-tripy (jak przy dragTo()/simulateDragDrop wyżej)
      // ryzykowałyby, że sam narzut CDP między wywołaniami przekroczy 500ms
      // i timer long-pressa zdąży odpalić się PRZED dotarciem ruchu. Każde
      // zdarzenie dostaje ŚWIEŻE document.querySelector()+getBoundingClientRect()
      // tuż przed swoim dispatchem zamiast dzielenia jednego `el`/`r` między
      // wszystkimi -- ten sam wzorzec co find()/fire() w simulateDragDrop()
      // (commit f997d8dd): gdyby pointerdown zdążył wywołać synchroniczny
      // re-render wiersza, dispatch na starej (odłączonej) referencji
      // przestałby bąbelkować do delegowanego listenera na #list, a
      // anulujący pointermove nigdy by nie dotarł. Dokładamy też pointerup
      // (prawdziwy dotyk zawsze go wysyła) -- addLongPress ma na niego
      // osobny, niezależny listener "pointerup -> cancel".
      await page.evaluate((selector) => {
        function fire(type, extra) {
          const el = document.querySelector(selector);
          if (!el) throw new Error(`simulateLongPress(move): element not found (${selector})`);
          const r = el.getBoundingClientRect();
          el.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerType: "touch",
            clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 + (extra || 0),
          }));
        }
        fire("pointerdown", 0);
        fire("pointermove", 40);
        fire("pointerup", 40);
      }, rowSel);
      await page.waitForTimeout(650);

      // #contextMenu jest STATYCZNYM elementem obecnym w DOM od załadowania
      // strony (base-explorer.html: <div id="contextMenu" class="context-menu"
      // hidden></div>) -- otwieranie/zamykanie menu przełącza tylko atrybut
      // "hidden" (patrz context-menu.js), NIE tworzy/usuwa węzła. toHaveCount(0)
      // NIGDY nie może przejść (element zawsze istnieje w DOM), niezależnie od
      // poprawności aplikacji -- właściwa asercja to widoczność, nie liczność.
      await expect(page.locator(".context-menu")).toBeHidden();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("podwójny tap na pytaniu otwiera modal edycji (zamiennik dblclick na dotyku)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 400, height: 800 });
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-DOUBLETAPQ-${Date.now()}`);

    try {
      const qid = await createQuestion(page, { baseId, ord: 1, payload: { text: "Dotknij mnie dwa razy", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const rowSel = `#list .row[data-kind="q"][data-id="${qid}"]`;
      await expect(page.locator(rowSel)).toBeVisible({ timeout: 15000 });

      await simulateDoubleTap(page, rowSel);

      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#qText")).toHaveValue("Dotknij mnie dwa razy");
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("podwójny tap na folderze nawiguje do jego wnętrza", async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 400, height: 800 });
    await loginAsTestUser(page, context);
    const baseId = await createBase(page, `E2E-XM-DOUBLETAPCAT-${Date.now()}`);

    try {
      const catId = await createCategory(page, { baseId, name: "Folder do wejścia", ord: 1 });
      await createQuestion(page, { baseId, categoryId: catId, ord: 1, payload: { text: "W środku folderu", answers: [] } });

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const catRowSel = `#list .row[data-kind="cat"][data-id="${catId}"]`;
      await expect(page.locator(catRowSel)).toBeVisible({ timeout: 15000 });

      await simulateDoubleTap(page, catRowSel);

      await expect(page.locator(`#list .row[data-kind="q"]`, { hasText: "W środku folderu" })).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteBase(page, baseId);
    }
  });
});
