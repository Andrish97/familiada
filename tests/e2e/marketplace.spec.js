const { test, expect } = require("@playwright/test");
const { loginAsTestUser, loginAsGuest, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const URL = "https://www.familiada.online/marketplace";
const PREFIX = "E2E-MKT-";

test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["marketplace"] });
  await context.addInitScript(() => localStorage.setItem("uiLang", "pl"));
});

async function rpc(page, name, args = {}) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }, { name, args });
}

async function cleanup(page) {
  const result = await rpc(page, "e2e_marketplace_cleanup", { p_prefix: PREFIX });
  expect(result?.ok, JSON.stringify(result)).toBe(true);
}

async function publishedGame(page) {
  const rows = await rpc(page, "market_browse", {
    p_lang: "pl", p_search: "", p_limit: 100, p_offset: 0,
  });
  const game = rows.find((row) => row.origin === "producer") || rows[0];
  expect(game, "produkcyjny katalog musi zawierać opublikowaną grę").toBeTruthy();
  return game;
}

async function removeLibraryCopy(page, id) {
  const rows = await rpc(page, "market_remove_from_library", { p_market_game_id: id });
  expect(rows?.[0]?.ok, JSON.stringify(rows)).toBe(true);
}

async function createPlayableGame(page, name) {
  return page.evaluate(async ({ name }) => {
    const sb = window.__sbClient;
    const { data: auth } = await sb.auth.getUser();
    const { data: game, error: gameError } = await sb.from("games").insert({
      owner_id: auth.user.id, name, type: "prepared", status: "draft", is_demo: false,
    }).select("id").single();
    if (gameError) throw new Error(gameError.message);

    const questions = Array.from({ length: 10 }, (_, index) => ({
      game_id: game.id, ord: index + 1, text: `${name} pytanie ${index + 1}`,
    }));
    const { data: inserted, error: qError } = await sb.from("questions").insert(questions).select("id,ord");
    if (qError) throw new Error(qError.message);
    const answers = inserted.flatMap((q) => [30, 20, 10].map((points, index) => ({
      question_id: q.id, ord: index + 1, text: `Odp ${q.ord}-${index + 1}`, fixed_points: points,
    })));
    const { error: aError } = await sb.from("answers").insert(answers);
    if (aError) throw new Error(aError.message);
    return game.id;
  }, { name });
}

test("anonim: lista, wyszukiwanie, filtr, sortowanie, URL, klawiatura i i18n", async ({ page }) => {
  await page.goto(`${URL}?sort=newest`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#browseGrid .mkt-card").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#btnMySent")).toBeHidden();
  await expect(page.locator("#btnGoGames")).toContainText("Wróć do: Strona główna");

  const first = page.locator("#browseGrid .mkt-card").first();
  const title = (await first.locator(".mkt-card-title").innerText()).trim();
  await page.locator("#searchInput").fill(title);
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator("#browseGrid .mkt-card-title").first()).toContainText(title);

  const lang = (await page.locator("#browseGrid .mkt-lang-badge").first().innerText()).toLowerCase();
  const langFilter = page.locator("#langFilter");
  await expect(langFilter).toHaveClass(/ui-select/);
  await langFilter.locator(".ui-select-btn").click();
  await langFilter.locator(`.ui-select-item[data-value="${lang}"]`).click();
  await expect(page.locator("#browseGrid .mkt-lang-badge").first()).toHaveText(lang.toUpperCase());
  const sortSelect = page.locator("#sortSelect");
  await expect(sortSelect).toHaveClass(/ui-select/);
  await sortSelect.locator(".ui-select-btn").click();
  await sortSelect.locator('.ui-select-item[data-value="title"]').click();
  await expect(page).toHaveURL(/sort=title/);

  await page.locator("#searchInput").fill("");
  await langFilter.locator(".ui-select-btn").click();
  await langFilter.locator('.ui-select-item[data-value="all"]').click();
  await page.locator("#browseGrid .mkt-card").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#gameDetailOverlay")).toBeVisible();
  await expect(page).toHaveURL(/\/marketplace\/game\//);
  await page.keyboard.press("Escape");
  await page.locator(".lang-btn").click();
  await page.locator('.lang-option[data-lang="en"]').click();
  await expect(page.locator("#sortSelect .ui-select-label")).toHaveText("Title A–Z");
  await page.locator("#browseGrid .mkt-card").first().click();
  await expect(page.locator("#btnAddLibrary")).toHaveText("Add to my games");
  await expect(page.locator("#detailQuestions .mkt-pts").first()).toContainText("pts");
  await page.keyboard.press("Escape");
  await expect(page.locator("#gameDetailOverlay")).toBeHidden();
  await expect(page).toHaveURL(/sort=title/);

  await page.locator("#browseGrid .mkt-card").first().click();
  await page.goBack();
  await expect(page.locator("#gameDetailOverlay")).toBeHidden();
  await expect(page).toHaveURL(/sort=title/);
});

test("wolny prawdziwy backend pokazuje loading, a nieistniejący UUID konkretny błąd", async ({ page }) => {
  await page.route("**/rest/v1/rpc/market_browse", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  const navigation = page.goto(URL, { waitUntil: "domcontentloaded" });
  await navigation;
  await expect(page.locator("#browseInfo")).toHaveText("Ładowanie…");
  await expect(page.locator("#browseGrid .mkt-card").first()).toBeVisible({ timeout: 20_000 });

  await page.goto(`${URL}/game/00000000-0000-0000-0000-000000000000`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#appToast")).toContainText("Nie udało się załadować gier.", { timeout: 20_000 });
  await expect(page.locator("#gameDetailOverlay")).toBeHidden();
});

test("konto: dodanie jest atomowe i idempotentne, kopia ma poprawny typ i zawartość", async ({ page, context }) => {
  await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await cleanup(page);
  const game = await publishedGame(page);
  await removeLibraryCopy(page, game.id);

  try {
    await page.locator(`#browseGrid .mkt-card[data-id="${game.id}"]`).click();
    await expect(page.locator("#btnAddLibrary")).toBeVisible();
    await page.locator("#btnAddLibrary").evaluate((button) => { button.click(); button.click(); });
    await expect(page.locator("#addedBadge")).toBeVisible();
    await expect(page.locator("#btnAddLibrary")).toBeHidden();

    const result = await page.evaluate(async (marketId) => {
      const sb = window.__sbClient;
      const { data: copies, error } = await sb.from("games")
        .select("id,type,status,source_market_id,questions(count)")
        .eq("source_market_id", marketId);
      if (error) throw new Error(error.message);
      const detail = await sb.rpc("market_game_detail", { p_id: marketId }).single();
      return { copies, sourceCount: detail.data.payload.questions.length };
    }, game.id);
    expect(result.copies).toHaveLength(1);
    expect(result.copies[0]).toMatchObject({ type: "market", status: "ready", source_market_id: game.id });
    expect(result.copies[0].questions[0].count).toBe(result.sourceCount);

    const again = await rpc(page, "market_add_to_library", { p_market_game_id: game.id });
    expect(again[0].ok).toBe(true);
    const count = await page.evaluate(async (id) => {
      const { count, error } = await window.__sbClient.from("games")
        .select("id", { count: "exact", head: true }).eq("source_market_id", id);
      if (error) throw new Error(error.message);
      return count;
    }, game.id);
    expect(count).toBe(1);
  } finally {
    await removeLibraryCopy(page, game.id);
    await cleanup(page);
  }
});

test("konto: ocenę można zmienić, a UI i baza pokazują nową wartość", async ({ page, context }) => {
  await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await cleanup(page);
  const game = await publishedGame(page);

  try {
    await page.locator(`#browseGrid .mkt-card[data-id="${game.id}"]`).click();
    await page.locator('.mkt-star-btn[data-stars="2"]').click();
    await expect(page.locator('.mkt-star-btn[data-stars="2"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('.mkt-star-btn[data-stars="4"]').click();
    await expect(page.locator('.mkt-star-btn[data-stars="4"]')).toHaveAttribute("aria-pressed", "true");
    const stars = await page.evaluate(async (id) => {
      const { data, error } = await window.__sbClient.from("market_game_ratings")
        .select("stars").eq("market_game_id", id).single();
      if (error) throw new Error(error.message);
      return data.stars;
    }, game.id);
    expect(stars).toBe(4);
  } finally {
    await cleanup(page);
  }
});

test("gość może dodać i usunąć kopię, ale nie ocenia ani nie wysyła gry", async ({ page, context }) => {
  test.setTimeout(90_000);
  await loginAsGuest(page, context);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  const game = await publishedGame(page);
  try {
    await page.locator(`#browseGrid .mkt-card[data-id="${game.id}"]`).click();
    await expect(page.locator("#btnAddLibrary")).toBeVisible();
    await expect(page.locator(".mkt-star-input")).toHaveCount(0);
    await expect(page.locator("#btnMySent")).toBeHidden();
    await page.locator("#btnAddLibrary").click();
    await expect(page.locator("#btnRemoveLibrary")).toBeVisible();
    await page.locator("#btnRemoveLibrary").click();
    await expect(page.locator("#btnAddLibrary")).toBeVisible();
  } finally {
    await removeLibraryCopy(page, game.id);
  }
});

test("wysłanie gry tworzy dokładnie jedno pending i sprząta cały stan", async ({ page, context }) => {
  test.setTimeout(90_000);
  await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await cleanup(page);
  const name = `${PREFIX}${Date.now()}`;
  await createPlayableGame(page, name);

  try {
    await page.locator("#btnMySent").click();
    await page.locator("#btnSubmitNew").click();
    await page.locator("#submitGameSelect .ui-select-btn").click();
    await page.locator("#submitGameSelect .ui-select-item", { hasText: name }).click();
    await page.locator("#submitTitle").fill(name);
    await page.locator("#submitDesc").fill("Bezpieczny test zgłoszenia marketplace");
    await page.locator("#submitConfirm").check();
    await page.locator("#btnSubmitConfirm").evaluate((button) => { button.click(); button.click(); });
    await expect(page.locator("#submitOverlay")).toBeHidden({ timeout: 20_000 });
    const rows = await page.evaluate(async (title) => {
      const { data, error } = await window.__sbClient.from("market_games")
        .select("id,status,title").eq("title", title);
      if (error) throw new Error(error.message);
      return data;
    }, name);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    await expect(page.locator("#mySentList", { hasText: name })).toContainText("Oczekuje na weryfikację");
    const duplicate = await rpc(page, "market_submit_game", {
      p_game_id: await page.evaluate(async (gameName) => {
        const { data } = await window.__sbClient.from("games").select("id").eq("name", gameName).single();
        return data.id;
      }, name),
      p_title: name,
      p_description: "retry",
      p_lang: "pl",
      p_payload: {},
    });
    expect(duplicate[0]).toMatchObject({ ok: false, err: "already_submitted" });
  } finally {
    await cleanup(page);
  }
});

test("backend nie ujawnia listy oceniających anonimowi ani zwykłemu użytkownikowi", async ({ page, context }) => {
  await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  const game = await publishedGame(page);
  const rows = await rpc(page, "market_game_raters", { p_market_game_id: game.id });
  expect(rows).toEqual([]);

  const anon = await context.browser().newContext({ serviceWorkers: "block" });
  await serveBranchCode(anon, { pages: ["marketplace"] });
  const anonPage = await anon.newPage();
  try {
    await anonPage.goto(URL, { waitUntil: "domcontentloaded" });
    const anonRows = await rpc(anonPage, "market_game_raters", { p_market_game_id: game.id });
    expect(anonRows).toEqual([]);
  } finally {
    await anon.close();
  }
});
