// tests/e2e/base-explorer-modals.spec.js
// Dogłębne testy DWÓCH najważniejszych modali w base-explorer:
// question-modal.js (edycja treści pytania i odpowiedzi) oraz
// export-modal.js ("Utwórz grę" z zaznaczonych pytań). Oba są złożone
// (walidacje, limity, przełączanie typu gry, tworzenie realnych wierszy
// w games/questions/answers) i miały za płytkie pokrycie w pierwszych
// dwóch rundach testów -- ten plik pokrywa je osobno i szerzej.
//
// Przy pisaniu tych testów znaleziony i naprawiony kolejny bug:
// question-modal.js pozwalał zapisać pytanie z całkowicie pustą treścią
// bez żadnego ostrzeżenia (qSave nie walidował tekstu wcale, tylko
// punkty/sumę) -- dodana walidacja blokująca pusty zapis.

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

async function createQuestion(page, { baseId, ord = 1, payload }) {
  return await page.evaluate(async ({ baseId, ord, payload }) => {
    const { data, error } = await window.__sbClient
      .from("qb_questions")
      .insert({ base_id: baseId, category_id: null, ord, payload })
      .select("id")
      .single();
    if (error) throw new Error("insert qb_questions failed: " + error.message);
    return data.id;
  }, { baseId, ord, payload });
}

async function getQuestionRow(page, questionId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient
      .from("qb_questions").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }, questionId);
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

/* ================= question-modal.js ================= */

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
      await expect(input).toHaveValue("To jest zdecydowa", { timeout: 5000 }); // 17 znaków wliczając wielkie litery/spacje... patrz niżej

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

/* ================= export-modal.js ================= */

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
