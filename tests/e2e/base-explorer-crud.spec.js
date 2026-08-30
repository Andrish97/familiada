// tests/e2e/base-explorer-crud.spec.js
// Druga część audytu base-explorer (js/pages/base-explorer -> base-explorer/js/*.js):
// tam gdzie base-explorer.spec.js pilnuje konkretnych naprawionych bugów,
// ten plik pokrywa CODZIENNĄ funkcjonalność panelu (edytor pytania, tagi,
// wyszukiwanie, schowek/DnD, uprawnienia dwóch różnych kont) -- napisany bo
// panel był budowany bez pełnego przeglądu kodu i testowany tylko ręcznie,
// więc same testy regresji na już znalezionych bugach to za mało.
//
// Przy okazji pisania tych testów znaleziony i naprawiony kolejny,
// samodzielny bug: Ctrl+A filtrował wiersze po atrybucie `data-key`, którego
// żaden wiersz nigdy nie ma (wszystkie mają data-kind+data-id) -- WSZYSTKIE
// wywołania Ctrl+A od zawsze zaznaczały zero elementów.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

const BASE_URL = "https://www.familiada.online/base-explorer";

/* ================= Seed / DB helpers ================= */

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

/* ================= Testy ================= */

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
