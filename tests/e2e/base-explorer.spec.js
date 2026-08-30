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

async function deleteBase(page, baseId) {
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

async function createQuestion(page, { baseId, categoryId = null, ord = 1, payload }) {
  return await page.evaluate(async ({ baseId, categoryId, ord, payload }) => {
    const { data, error } = await window.__sbClient
      .from("qb_questions")
      .insert({ base_id: baseId, category_id: categoryId, ord, payload })
      .select("id")
      .single();
    if (error) throw new Error("insert qb_questions failed: " + error.message);
    return data.id;
  }, { baseId, categoryId, ord, payload });
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

      // zaznacz jedno pytanie i otwórz eksport przez menu kontekstowe (export-modal
      // sam dopełni zaznaczenie do 10 z state.questions)
      const row = page.locator(`#list .row[data-kind="q"][data-id="${firstQid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
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

      const rowA = page.locator(`#tree .row[data-kind="cat"][data-id="${catA}"]`);
      const rowB = page.locator(`#tree .row[data-kind="cat"][data-id="${catB}"]`);
      await expect(rowA).toBeVisible({ timeout: 10000 });
      await expect(rowB).toBeVisible({ timeout: 10000 });

      // upuść A w górnej (25%) strefie B => tryb "before" => nowy rodzic A = parent(B) = A samo
      await rowA.dragTo(rowB, { targetPosition: { x: 20, y: 2 } });

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
      await page.locator("#renameModalSave").click();
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
      await page.keyboard.press("Control+e");

      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });
      await page.locator("#qAdd").click();

      const rowEl = page.locator("#qAnswers .qRow").first();
      await rowEl.locator(".qAnsText").fill("Odpowiedź A");
      await rowEl.locator(".qAnsPts").fill("42");

      await page.locator("#qSave").click();
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
      await page.keyboard.press("Control+e");

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
      await page.keyboard.press("Control+e");
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

      const qRow = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      const catRow = page.locator(`#list .row[data-kind="cat"][data-id="${catTarget}"]`);
      await expect(qRow).toBeVisible({ timeout: 15000 });
      await expect(catRow).toBeVisible({ timeout: 15000 });

      await qRow.dragTo(catRow);

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
      await page.keyboard.press("Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      const r = page.locator("#qAnswers .qRow").first();
      await r.locator(".qAnsText").fill("Nowa");
      await r.locator(".qAnsPts").fill("77");
      await page.locator("#qSave").click();
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
      await page.keyboard.press("Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#qAnswers .qRow")).toHaveCount(3);

      await page.locator("#qAnswers .qRow").nth(1).locator(".qDel").click(); // usuń A2
      await expect(page.locator("#qAnswers .qRow")).toHaveCount(2);

      await page.locator("#qSave").click();
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
      await page.keyboard.press("Control+e");
      await expect(page.locator("#questionOverlay")).toBeVisible({ timeout: 5000 });

      await page.locator("#qAdd").click();
      const input = page.locator("#qAnswers .qRow").first().locator(".qAnsText");
      await input.fill("To jest zdecydowanie za długi tekst odpowiedzi");
      await expect(input).toHaveValue("To jest zdecydowa", { timeout: 5000 }); // pierwsze 17 znaków

      await page.locator("#qSave").click();
      await expect(page.locator("#questionOverlay")).toBeHidden({ timeout: 10000 });

      const fresh = await getQuestionRow(page, qid);
      expect(fresh?.payload?.answers?.[0]?.text?.length).toBeLessThanOrEqual(17);
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
      await page.keyboard.press("Control+e");
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
      await page.keyboard.press("Control+e");
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
      await page.keyboard.press("Control+e");
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
      const ids = await seedTenPlainQuestions(page, baseId);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const firstRow = page.locator(`#list .row[data-kind="q"][data-id="${ids[0]}"]`);
      await expect(firstRow).toBeVisible({ timeout: 15000 });
      await firstRow.click();
      await page.keyboard.press("Control+g");

      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#xCreate")).toBeEnabled({ timeout: 5000 });
      await expect(page.locator("#xCountVal")).toHaveText("10");

      await page.locator("#xList .xPickItem").first().click();

      await expect(page.locator("#xCountVal")).toHaveText("9", { timeout: 5000 });
      await expect(page.locator("#xCreate")).toBeDisabled();
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
      await seedTenPlainQuestions(page, baseId, 2);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await page.keyboard.press("Control+g");
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
      await seedTenPlainQuestions(page, baseId, 2);

      await page.goto(`${BASE_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await page.keyboard.press("Control+g");
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
      await page.keyboard.press("Control+g");
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
      await page.keyboard.press("Control+g");

      await expect(page.locator("#exportOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#xErr")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#xErr")).toContainText("Potrzebujesz co najmniej", { timeout: 5000 });
      await expect(page.locator("#xCreate")).toBeDisabled();
    } finally {
      await deleteBase(page, baseId);
    }
  });
});
