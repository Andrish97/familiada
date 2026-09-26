// tests/e2e/games.spec.js
// Audyt strony "Moje gry" (games.html, js/pages/games.js,
// js/pages/games-import-export.js) -- regresje poprawionych błędów:
//
// - klik w kafelek przebudowywał całą listę, więc podwójne tapnięcie
//   (zmiana nazwy) na telefonie nie działało,
// - pusta nazwa w modalu nie dawała żadnego komunikatu,
// - usunięcie gry skasowanej w międzyczasie pokazywało "gra jest w użyciu",
// - eksport do pliku gubił polskie/ukraińskie litery w nazwie pliku,
// - import: 7 odpowiedzi w pytaniu / błąd w połowie zostawiał niepełną grę;
//   zepsuty plik dawał angielski komunikat silnika JS,
// - eksport do bazy: błąd w połowie zostawiał folder w bazie,
// - Społeczność: podgląd zawsze "Brak pytań", kosz usuwał bez pytania,
// - zmiana języka nie tłumaczyła kafelków.
//
// Strona /games i cały front-end (js/, css/, translation/) są serwowane z
// plików TEGO repo (helpers/branch-code.js), a backend jest prawdziwy --
// więc workflow odpalony na branchu testuje poprawki przed wdrożeniem.

const fs = require("fs");
const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const GAMES_URL = "https://www.familiada.online/games";

// service worker obsłużyłby żądania z własnego cache z pominięciem page.route
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["games"] });
});

async function newUserContext(browser, username, contextOptions = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", ...contextOptions });
  await serveBranchCode(ctx, { pages: ["games"] });
  const pg = await ctx.newPage();
  await loginAsTestUser(pg, ctx, { username });
  return { ctx, page: pg };
}

/* ================= Seed / DB helpers (bezpośrednio przez window.__sbClient) ================= */

// Gra preparowana gotowa do gry: 10 pytań x 3 odpowiedzi (50/30/20 pkt).
async function seedPreparedGame(page, name, { questions = 10 } = {}) {
  return await page.evaluate(async ({ name, questions }) => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const { data: g, error } = await sb.from("games")
      .insert({ name, owner_id: u.user.id, type: "prepared", status: "draft" })
      .select("id").single();
    if (error) throw new Error("insert games: " + error.message);
    const qRows = Array.from({ length: questions }, (_, i) => ({ game_id: g.id, ord: i + 1, text: `Pytanie ${i + 1}?` }));
    const { data: qs, error: qErr } = await sb.from("questions").insert(qRows).select("id");
    if (qErr) throw new Error("insert questions: " + qErr.message);
    const aRows = qs.flatMap((q) => [50, 30, 20].map((p, j) => ({ question_id: q.id, ord: j + 1, text: `Odp ${j + 1}`, fixed_points: p })));
    const { error: aErr } = await sb.from("answers").insert(aRows);
    if (aErr) throw new Error("insert answers: " + aErr.message);
    return g.id;
  }, { name, questions });
}

async function gamesByName(page, name) {
  return await page.evaluate(async (name) => {
    const { data, error } = await window.__sbClient.from("games").select("id,type,status").eq("name", name);
    if (error) throw new Error(error.message);
    return data || [];
  }, name);
}

async function deleteGamesByName(page, name) {
  await page.evaluate(async (name) => {
    await window.__sbClient.from("games").delete().eq("name", name);
  }, name);
}

async function countQA(page, gameId) {
  return await page.evaluate(async (id) => {
    const sb = window.__sbClient;
    const { data: qs } = await sb.from("questions").select("id").eq("game_id", id);
    const ids = (qs || []).map((q) => q.id);
    const { data: as } = ids.length ? await sb.from("answers").select("id,question_id").in("question_id", ids) : { data: [] };
    return { q: ids.length, a: (as || []).length };
  }, gameId);
}

async function openGames(page, query = "") {
  await page.goto(GAMES_URL + query, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}

function tileByName(page, name) {
  return page.locator("#grid .card", { has: page.locator(".name", { hasText: name }) });
}

/* ================= 1) Kafelki: zaznaczanie, tworzenie, zmiana nazwy, usuwanie ================= */

test.describe("games: audyt -- kafelki", () => {

  test("telefon: tapnięcie zaznacza bez przebudowy listy, podwójne otwiera zmianę nazwy", async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await newUserContext(browser, testAccountUsername(1), {
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    });
    const name = `E2E-GM-TAP-${Date.now()}`;
    try {
      await seedPreparedGame(page, name);
      await openGames(page);
      const tile = tileByName(page, name);
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.evaluate((el) => { el.dataset.e2eMark = "1"; });

      await tile.tap();
      await expect(tile).toHaveClass(/selected/);
      // ten sam element DOM (wcześniej render() podmieniał wszystkie kafelki)
      await expect(page.locator('#grid .card[data-e2e-mark="1"]')).toHaveCount(1);
      await expect(page.locator("#btnPreview")).toBeEnabled();
      await expect(page.locator("#btnPlay")).toBeEnabled({ timeout: 10000 });
      await page.waitForTimeout(500);

      await tile.tap();
      await tile.tap();
      await expect(page.locator("#nameOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#nameInp")).toHaveValue(name);
    } finally {
      await deleteGamesByName(page, name);
      await ctx.close();
    }
  });

  test("nowa gra przez '+', pusta nazwa daje komunikat, dwuklik zmienia nazwę, kosz usuwa", async ({ page, context }) => {
    test.setTimeout(90_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-GM-NEW-${Date.now()}`;
    const renamed = `${name}-R`;
    try {
      await openGames(page);
      await page.locator("#grid .addCard").click();
      await expect(page.locator("#nameOverlay")).toBeVisible();

      await page.locator("#btnNameOk").click();
      await expect(page.locator("#nameMsg")).not.toBeEmpty();
      await expect(page.locator("#nameOverlay")).toBeVisible();

      await page.locator("#nameInp").fill(name);
      await page.locator("#nameInp").press("Enter");
      await expect(page.locator("#nameOverlay")).toBeHidden({ timeout: 15000 });
      const tile = tileByName(page, name);
      await expect(tile).toHaveClass(/selected/);
      expect(await gamesByName(page, name)).toMatchObject([{ type: "prepared", status: "draft" }]);

      await tile.dblclick();
      await expect(page.locator("#nameInp")).toHaveValue(name);
      await page.locator("#nameInp").fill(renamed);
      await page.locator("#nameInp").press("Enter");
      await expect(page.locator("#nameOverlay")).toBeHidden({ timeout: 15000 });
      await expect(tileByName(page, renamed)).toBeVisible();

      await tileByName(page, renamed).locator(".x").click();
      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await page.locator(".uni-modal .uni-foot .btn.gold").click();
      await expect(tileByName(page, renamed)).toHaveCount(0, { timeout: 15000 });
      expect(await gamesByName(page, renamed)).toHaveLength(0);
    } finally {
      await deleteGamesByName(page, name);
      await deleteGamesByName(page, renamed);
    }
  });

  test("usunięcie gry skasowanej w międzyczasie nie pokazuje 'gra jest w użyciu'", async ({ page, context }) => {
    test.setTimeout(90_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-GM-GONE-${Date.now()}`;
    try {
      await seedPreparedGame(page, name, { questions: 1 });
      await openGames(page);
      const tile = tileByName(page, name);
      await expect(tile).toBeVisible({ timeout: 15000 });

      await deleteGamesByName(page, name); // "inna karta" usuwa grę
      await tile.locator(".x").click();
      await page.locator(".uni-modal .uni-foot .btn.gold").click();
      await expect(tile).toHaveCount(0, { timeout: 15000 });
      await page.waitForTimeout(1000);
      await expect(page.locator(".uni-modal"), "żadnego alertu po potwierdzeniu").toHaveCount(0);
    } finally {
      await deleteGamesByName(page, name);
    }
  });

  test("zmiana języka tłumaczy kafelki od razu", async ({ page, context }) => {
    test.setTimeout(90_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-GM-LANG-${Date.now()}`;
    try {
      await seedPreparedGame(page, name, { questions: 1 });
      await openGames(page, "?lang=pl");
      const meta = tileByName(page, name).locator(".meta");
      await expect(meta).toContainText("PREPAROWANA", { timeout: 15000 });

      await page.locator(".lang-btn").click();
      await page.locator('.lang-option[data-lang="en"]').click();
      await expect(meta).toContainText("PREPARED", { timeout: 5000 });
      await expect(meta).not.toContainText("PREPAROWANA");
    } finally {
      await deleteGamesByName(page, name);
    }
  });
});

/* ================= 2) Eksport / import ================= */

test.describe("games: audyt -- eksport / import pliku", () => {

  test("eksport: nazwa pliku z polskimi literami; import odtwarza grę", async ({ page, context }, testInfo) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-GM-Łódź-${Date.now()}`;
    try {
      await seedPreparedGame(page, name);
      await openGames(page);
      await tileByName(page, name).click();
      await expect(page.locator("#btnExport")).toBeEnabled({ timeout: 10000 });

      const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#btnExport").click()]);
      expect(download.suggestedFilename()).toBe(`${name}.famgame`);
      const file = testInfo.outputPath("export.famgame");
      await download.saveAs(file);
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      expect(json.game).toMatchObject({ name, type: "prepared" });
      expect(json.questions).toHaveLength(10);

      await page.locator("#btnImport").click();
      await page.locator("#importFile").setInputFiles(file);
      await expect(page.locator("#importPreview")).toContainText(name);
      await page.locator("#btnImportJson").click();
      await expect(page.locator("#importOverlay")).toBeHidden({ timeout: 60000 });

      const games = await gamesByName(page, name);
      expect(games).toHaveLength(2);
      for (const g of games) expect(await countQA(page, g.id)).toEqual({ q: 10, a: 30 });
      await expect(page.locator("#grid .card.selected .name")).toHaveText(name);
    } finally {
      await deleteGamesByName(page, name);
    }
  });

  test("import: 7 odpowiedzi -> 6, zepsuty plik -> nasz komunikat", async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-GM-IMP7-${Date.now()}`;
    const file = testInfo.outputPath("seven.famgame");
    fs.writeFileSync(file, JSON.stringify({
      game: { name, type: "prepared" },
      questions: [{ text: "Siedem?", answers: Array.from({ length: 7 }, (_, i) => ({ text: `O${i + 1}`, fixed_points: 10 })) }],
    }));
    const bad = testInfo.outputPath("broken.famgame");
    fs.writeFileSync(bad, "{ to nie jest json");
    try {
      await openGames(page);
      await page.locator("#btnImport").click();

      await page.locator("#importFile").setInputFiles(bad);
      await expect(page.locator("#importErr")).toBeVisible();
      await expect(page.locator("#importErr")).not.toContainText(/Unexpected|position|token/i);
      await expect(page.locator("#btnImportJson")).toBeDisabled();

      await page.locator("#importFile").setInputFiles(file);
      await page.locator("#btnImportJson").click();
      await expect(page.locator("#importOverlay")).toBeHidden({ timeout: 30000 });
      const games = await gamesByName(page, name);
      expect(games).toHaveLength(1);
      expect(await countQA(page, games[0].id)).toEqual({ q: 1, a: 6 });
    } finally {
      await deleteGamesByName(page, name);
    }
  });

  test("nieudany import nie zostawia niepełnej gry", async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-GM-IMPFAIL-${Date.now()}`;
    const file = testInfo.outputPath("fail.famgame");
    fs.writeFileSync(file, JSON.stringify({
      game: { name, type: "prepared" },
      questions: [
        { text: "P1?", answers: [{ text: "A", fixed_points: 50 }] },
        { text: "P2?", answers: [{ text: "B", fixed_points: 50 }] },
      ],
    }));

    // awaria serwera w połowie importu (gra i pierwsze pytanie już zapisane)
    await page.route("**/rest/v1/answers*", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "e2e: symulowana awaria" }) })
        : route.continue());
    try {
      await openGames(page);
      await page.locator("#btnImport").click();
      await page.locator("#importFile").setInputFiles(file);
      await page.locator("#btnImportJson").click();
      await expect(page.locator("#importMsg")).not.toBeEmpty({ timeout: 15000 });
      expect(await gamesByName(page, name), "po nieudanym imporcie gra ma zostać usunięta").toHaveLength(0);
    } finally {
      await page.unroute("**/rest/v1/answers*");
      await deleteGamesByName(page, name);
    }
  });
});

/* ================= 3) Eksport do bazy pytań ================= */

test.describe("games: audyt -- eksport do bazy", () => {

  test("eksport tworzy folder z pytaniami; błąd w połowie nie zostawia folderu", async ({ page, context }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const stamp = Date.now();
    const gameName = `E2E-GM-TOBASE-${stamp}`;
    const baseName = `E2E-GM-BASE-${stamp}`;
    let baseId = null;
    try {
      await seedPreparedGame(page, gameName);
      baseId = await page.evaluate(async (name) => {
        const sb = window.__sbClient;
        const { data: u } = await sb.auth.getUser();
        const { data, error } = await sb.from("question_bases").insert({ name, owner_id: u.user.id }).select("id").single();
        if (error) throw new Error(error.message);
        return data.id;
      }, baseName);
      const folders = async () => await page.evaluate(async (baseId) => {
        const sb = window.__sbClient;
        const { data: cats } = await sb.from("qb_categories").select("id,name").eq("base_id", baseId);
        const { data: qs } = await sb.from("qb_questions").select("id,category_id").eq("base_id", baseId);
        return { cats: cats || [], qs: qs || [] };
      }, baseId);

      await openGames(page);
      await tileByName(page, gameName).click();
      await expect(page.locator("#btnExportBase")).toBeEnabled({ timeout: 10000 });

      const exportOnce = async () => {
        await page.locator("#btnExportBase").click();
        await expect(page.locator("#exportBaseOverlay")).toBeVisible();
        // przycisk włącza się dopiero po wczytaniu listy baz (select jest
        // wtedy budowany od nowa -- wcześniejszy klik trafiłby w stary)
        await expect(page.locator("#btnExportBaseDo")).toBeEnabled({ timeout: 15000 });
        await page.locator("#baseSelectWrap .ui-select-btn").click();
        await page.locator("#baseSelectWrap .ui-select-item", { hasText: baseName }).click();
        await page.locator("#btnExportBaseDo").click();
      };

      await exportOnce();
      await expect(page.locator(".uni-modal")).toBeVisible({ timeout: 30000 });
      await page.locator(".uni-modal .uni-foot button").first().click();
      let st = await folders();
      expect(st.cats.map((c) => c.name)).toEqual([gameName]);
      expect(st.qs.filter((q) => q.category_id === st.cats[0].id)).toHaveLength(10);

      await page.route("**/rest/v1/qb_questions*", (route) =>
        route.request().method() === "POST"
          ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "e2e: symulowana awaria" }) })
          : route.continue());
      try {
        await exportOnce();
        await expect(page.locator("#exportBaseMsg")).not.toBeEmpty({ timeout: 30000 });
      } finally {
        await page.unroute("**/rest/v1/qb_questions*");
      }
      st = await folders();
      expect(st.cats, "po błędzie nie może zostać folder 'nazwa (2)'").toHaveLength(1);
      expect(st.qs).toHaveLength(10);
    } finally {
      if (baseId) await page.evaluate(async (id) => { await window.__sbClient.from("question_bases").delete().eq("id", id); }, baseId);
      await deleteGamesByName(page, gameName);
    }
  });
});

/* ================= 4) Gry ze Społeczności ================= */

test.describe("games: audyt -- Społeczność", () => {

  test("podgląd pokazuje pytania, kosz pyta o potwierdzenie", async ({ page, context }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const mg = await page.evaluate(async () => {
      const { data, error } = await window.__sbClient.rpc("market_browse", { p_lang: "pl", p_search: "", p_limit: 50, p_offset: 0 });
      if (error) throw new Error(error.message);
      return (data || []).find((r) => !r.in_library) || null;
    });
    test.skip(!mg, "brak opublikowanej gry spoza biblioteki konta testowego");

    const inLibrary = async () => await page.evaluate(async (id) => {
      const { data } = await window.__sbClient.rpc("market_my_library");
      return (data || []).some((r) => r.market_game_id === id);
    }, mg.id);

    try {
      await page.evaluate(async (id) => {
        const { error } = await window.__sbClient.rpc("market_add_to_library", { p_market_game_id: id });
        if (error) throw new Error(error.message);
      }, mg.id);

      await openGames(page, "?tab=market");
      const tile = page.locator(`#grid .card[data-market-id="${mg.id}"]`);
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.click();
      await expect(tile).toHaveClass(/selected/);

      await page.locator("#btnPreview").click();
      await expect(page.locator("#previewOverlay")).toBeVisible();
      await expect(page.locator("#previewQuestions .bld-q-block").first()).toBeVisible({ timeout: 15000 });
      await page.locator("#btnPreviewClose").click();
      await expect(page.locator("#previewOverlay")).toBeHidden();

      // kosz: najpierw potwierdzenie -- "Anuluj" nic nie usuwa
      await tile.locator(".x").click();
      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await page.locator(".uni-modal .uni-foot .btn:not(.gold)").click();
      await expect(tile).toBeVisible();
      expect(await inLibrary()).toBe(true);

      await tile.locator(".x").click();
      await page.locator(".uni-modal .uni-foot .btn.gold").click();
      await expect(tile).toHaveCount(0, { timeout: 15000 });
      expect(await inLibrary()).toBe(false);
    } finally {
      await page.evaluate(async (id) => {
        await window.__sbClient.rpc("market_remove_from_library", { p_market_game_id: id });
      }, mg.id);
    }
  });
});

/* ================= 5) Reset ankiety przed edycją (migracja 272) ================= */

// Wymaga RPC game_reset_poll_for_edit z migracji 272 -- na branchu przed
// wdrożeniem pomijany przez --grep-invert "migracja 272".
test.describe("games: audyt -- migracja 272", () => {

  test("edycja zamkniętej ankiety resetuje ją jednym RPC (status, daty, punkty)", async ({ page, context }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-GM-RESET-${Date.now()}`;
    try {
      const gameId = await page.evaluate(async (name) => {
        const sb = window.__sbClient;
        const { data: u } = await sb.auth.getUser();
        const { data: g, error } = await sb.from("games")
          .insert({ name, owner_id: u.user.id, type: "poll_points", status: "draft" })
          .select("id").single();
        if (error) throw new Error(error.message);
        const { data: qs, error: qErr } = await sb.from("questions")
          .insert(Array.from({ length: 10 }, (_, i) => ({ game_id: g.id, ord: i + 1, text: `P${i + 1}?` })))
          .select("id");
        if (qErr) throw new Error(qErr.message);
        const { error: aErr } = await sb.from("answers").insert(qs.flatMap((q) =>
          [40, 35, 25].map((p, j) => ({ question_id: q.id, ord: j + 1, text: `O${j + 1}`, fixed_points: p }))));
        if (aErr) throw new Error(aErr.message);
        const { error: sErr } = await sb.from("games")
          .update({ status: "ready", poll_opened_at: new Date().toISOString(), poll_closed_at: new Date().toISOString() })
          .eq("id", g.id);
        if (sErr) throw new Error(sErr.message);
        return g.id;
      }, name);

      await openGames(page);
      await page.locator("#tabPollPoints").click();
      await tileByName(page, name).click();
      await expect(page.locator("#btnEdit")).toBeEnabled({ timeout: 10000 });
      await page.locator("#btnEdit").click();
      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await page.locator(".uni-modal .uni-foot .btn.gold").click();
      await page.waitForURL(/\/editor/, { timeout: 20000 });

      const st = await page.evaluate(async (id) => {
        const sb = window.__sbClient;
        const { data: g } = await sb.from("games").select("status,poll_opened_at,poll_closed_at").eq("id", id).single();
        const { data: qs } = await sb.from("questions").select("id").eq("game_id", id);
        const { data: as } = await sb.from("answers").select("fixed_points").in("question_id", qs.map((q) => q.id));
        return { ...g, pts: as.reduce((s, a) => s + a.fixed_points, 0), answers: as.length };
      }, gameId);
      expect(st).toEqual({ status: "draft", poll_opened_at: null, poll_closed_at: null, pts: 0, answers: 30 });
    } finally {
      await deleteGamesByName(page, name);
    }
  });
});
