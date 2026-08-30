// tests/e2e/base-explorer.spec.js
// Weryfikuje base-explorer (js/pages/base-explorer -> base-explorer/js/*.js),
// menadżer "baz pytań" (drzewo folderów + pytania + tagi). Napisane po
// dogłębnym audycie całego modułu, który znalazł kilka realnych bugów
// niezwiązanych z otwieraniem wielu kart naraz -- każdy z poniższych testów
// odtwarza konkretny scenariusz z audytu i weryfikuje naprawę:
//
// 1) Eksport ("Utwórz grę") rzucał ReferenceError przy KAŻDYM użyciu --
//    `let t = null` w run() przesłaniało zaimportowaną funkcję tłumaczeń `t`
//    w całym zasięgu (temporal dead zone). Funkcja była całkowicie martwa.
// 2) Przeciągnięcie folderu w tryb before/after na jego bezpośrednie dziecko
//    nie miało żadnej walidacji cyklu (w przeciwieństwie do trybu "into") --
//    ustawiało folderowi parent_id na samego siebie, korumpując drzewo.
// 3) renameByKey() dla pytań brał payload z lokalnego, potencjalnie
//    nieaktualnego cache'u (state.questions/_viewQuestions) i nadpisywał
//    nim CAŁY wiersz -- realny lost-update, jeśli ktoś w międzyczasie dodał
//    odpowiedzi do tego samego pytania gdzie indziej.
// 4) Usunięcie folderu z pytaniami w środku nie kasowało tych pytań (FK
//    qb_questions.category_id ma ON DELETE SET NULL, nie CASCADE) -- po
//    cichu "spadały" do widoku Wszystkie zamiast zniknąć razem z folderem.
// 5) Modal tagów tworzył swój Promise DOPIERO po dwóch `await`
//    (refreshTags/initTriState), a listenery X/Zapisz podpinał PRZED nimi --
//    klik w tym oknie w trakcie wolnej sieci zawieszał Promise na zawsze.

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

/* ================= Testy ================= */

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
