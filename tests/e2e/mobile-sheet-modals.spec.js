// tests/e2e/mobile-sheet-modals.spec.js
// Jeden zbiorczy plik dla WSZYSTKICH testów mobilnego trybu "sheet"
// (js/core/modal-sheet.js) -- rozbudowane modale na telefonie zastępują
// treść strony (topbar/stopka zostają) zamiast być małym, wyśrodkowanym
// oknem na przyciemnionym tle. Każda strona ma własną sekcję
// (test.describe), żeby całość dało się odpalić jednym poleceniem:
//   npx playwright test mobile-sheet-modals.spec.js
//
// Strony objęte tym plikiem: bases, base-explorer, games, marketplace,
// logo-editor, settings (patrz plan mobile sheet modals).
// settings.html jest za Cloudflare Access -- jej sekcja sprawdza sam
// kontrakt CSS/HTML przez bezpośrednią manipulację DOM, nie pełny
// przepływ UI (patrz komentarz przy tej sekcji niżej).

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const MOBILE_VIEWPORT = { width: 390, height: 844 };

// Okno od dołu (decyzja 2026-10-20): na telefonie duże okna wysuwają się od
// dołu nad stroną (strona zostaje pod przyciemnieniem), prawie na całą
// wysokość, stopka ukryta; zamyka je pasek u góry (.sheet-handle), klik
// w tło albo Wstecz przeglądarki. Przycisk wstecz w topbarze nie jest
// przejmowany. Małe okna (confirm/prompt) zostają okienkami.
async function expectBottomSheet(page, overlay, { panel = ".modal, .market-preview-card", handle = true } = {}) {
  await expect(overlay).toHaveClass(/sheet-active/);
  await page.waitForTimeout(450); // animacja wjazdu
  const vp = page.viewportSize();
  const box = await overlay.locator(panel).first().boundingBox();
  expect(box.width, "okno na całą szerokość ekranu").toBeGreaterThanOrEqual(vp.width - 2);
  expect(Math.round(box.y + box.height), "okno przy dolnej krawędzi").toBeGreaterThanOrEqual(vp.height - 2);
  expect(box.y, "okno prawie na całą wysokość").toBeLessThan(60);
  if (handle) await expect(overlay.locator(".sheet-handle")).toBeVisible();
  await expect(page.locator(".footer")).toBeHidden();
}

async function closeSheetViaHandle(page) {
  await page.locator(".sheet-active .sheet-handle").click();
}

/* =====================================================================
   Wspólne helpery seedowania (bezpośrednio przez window.__sbClient) --
   dzielone tam, gdzie kilka stron operuje na tych samych tabelach
   (games/questions), reszta zostaje osobno per sekcja żeby nie zgadywać
   ukrytych zależności między stronami.
===================================================================== */

async function createGameDirect(page, { name, type = "prepared", status = "ready" }) {
  return await page.evaluate(async ({ name, type, status }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: game, error } = await sb
      .from("games")
      .insert({ name, owner_id: userData.user.id, type, status })
      .select("id")
      .single();
    if (error) throw new Error("insert games failed: " + error.message);
    return game.id;
  }, { name, type, status });
}

async function addQuestionDirect(page, gameId, ord, text) {
  await page.evaluate(async ({ gameId, ord, text }) => {
    const { error } = await window.__sbClient
      .from("questions")
      .insert({ game_id: gameId, ord, text });
    if (error) throw new Error("insert question failed: " + error.message);
  }, { gameId, ord, text });
}

async function deleteGameDirect(page, gameId) {
  if (!gameId) return;
  await page.evaluate(async (id) => {
    await window.__sbClient.from("games").delete().eq("id", id);
  }, gameId);
}

async function findGameIdByName(page, name) {
  return await page.evaluate(async (name) => {
    const { data, error } = await window.__sbClient.from("games").select("id").eq("name", name).maybeSingle();
    if (error) throw new Error("query game by name failed: " + error.message);
    return data?.id || null;
  }, name);
}

/* =====================================================================
   1) bases.html -- modal udostępniania / modal nazwy
===================================================================== */

const BASES_URL = "https://www.familiada.online/bases";

async function createBaseDirect(page, name) {
  return await page.evaluate(async (name) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb
      .from("question_bases")
      .insert({ name, owner_id: userData.user.id })
      .select("id")
      .single();
    if (error) throw new Error("insert question_bases failed: " + error.message);
    return data.id;
  }, name);
}

async function deleteBaseDirect(page, baseId) {
  if (!baseId) return;
  await page.evaluate(async (id) => {
    await window.__sbClient.from("question_bases").delete().eq("id", id);
  }, baseId);
}

// Cały spec sprawdza wygląd okien z kodu brancha (strony i wspólny front).
test.beforeEach(async ({ context }) => {
  if (process.env.GITHUB_REF_NAME !== "main") {
    await serveBranchCode(context, { pages: ["bases", "bases/explorer", "games", "marketplace", "logos", "settings"] });
  }
});

test.describe("bases: mobile sheet modal (udostępnianie/nazwa)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("modal udostępniania na telefonie zastępuje treść strony (sheet), nie jest małym okienkiem", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    if (process.env.GITHUB_REF_NAME !== "main") await serveBranchCode(context, { pages: ["bases"] });

    const name = `E2E-BS-SHEET-SHARE-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);

    try {
      await page.goto(BASES_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#mineGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.click();
      await page.locator("#btnShare").click();

      const overlay = page.locator("#shareOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });
      await expect.poll(() => new URL(page.url()).searchParams.get("dialog")).toBe("shareOverlay");
      await expect.poll(() => page.evaluate(() => history.state?.__sheetDialog || null)).toBe("shareOverlay");

      await expectBottomSheet(page, overlay);
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();

      await closeSheetViaHandle(page);
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator(".bar")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      await deleteBaseDirect(page, baseId);
    }
  });

  // Proste okno z jednym polem jest zwykłym okienkiem także na telefonie
  // (modal--keep-dialog, decyzja 2026-10-20): treść strony zostaje pod spodem.
  test("modal nazwy (tworzenie) na telefonie jest roletką od dołu dopasowaną do treści", async ({ page, context }) => {
    test.setTimeout(60_000);
    if (process.env.GITHUB_REF_NAME !== "main") await serveBranchCode(context, { pages: ["bases"] });
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    let baseId = null;

    try {
      await page.goto(BASES_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await page.locator("#mineGrid .addCard").click();
      const overlay = page.locator(".uni-modal:visible");
      await expect(overlay).toBeVisible({ timeout: 5000 });
      // roletka od dołu dopasowana do treści (decyzja 2026-10-20)
      await expect(page.locator(".overlay.sheet-fit.sheet-active:has(.uni-inp)")).toHaveCount(1);
      await expect(page.locator(".overlay.sheet-fit .sheet-handle")).toBeVisible();
      await expect(page.locator(".bar")).toBeVisible();

      await page.locator(".uni-modal .uni-foot .btn:not(.gold)").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });

      // Esc zamyka tak samo jak X / Anuluj
      await page.locator("#mineGrid .addCard").click();
      await expect(overlay).toBeVisible({ timeout: 5000 });
      await page.keyboard.press("Escape");
      await expect(overlay).toBeHidden({ timeout: 5000 });
    } finally {
      if (baseId) await deleteBaseDirect(page, baseId);
    }
  });
});

test.describe("bases: przycisk wstecz w topbarze przejmuje zamykanie sheet modala", () => {
  test.use({ viewport: MOBILE_VIEWPORT, serviceWorkers: "block" });

  test("okno od dołu: topbar bez przejęcia, pasek i Wstecz przeglądarki zamykają, adres ?dialog= odtwarza okno", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    if (process.env.GITHUB_REF_NAME !== "main") await serveBranchCode(context, { pages: ["bases"] });

    const name = `E2E-BS-SHEET-BACKBTN-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);

    try {
      await page.goto(BASES_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const btnBack = page.locator("#btnBack");
      const originalText = (await btnBack.textContent() || "").trim();
      expect(originalText.length).toBeGreaterThan(0);

      const tile = page.locator("#mineGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.click();
      await page.locator("#btnShare").click();

      const overlay = page.locator("#shareOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      // Przycisk wstecz w topbarze nie jest przejmowany (okno leży nad nim).
      await expectBottomSheet(page, overlay);
      await expect(btnBack).toHaveText(originalText);

      // Pasek u góry okna zamyka je (i NIE nawiguje do innej strony).
      await closeSheetViaHandle(page);
      await expect(overlay).toBeHidden({ timeout: 5000 });
      expect(page.url()).toContain("/bases");
      expect(new URL(page.url()).searchParams.has("dialog")).toBe(false);

      await page.goForward();
      await expect.poll(() => new URL(page.url()).searchParams.get("dialog")).toBe("shareOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });
      await expect.poll(() => new URL(page.url()).searchParams.get("dialog")).toBe("shareOverlay");
      await page.goBack();
      await expect(overlay).toBeHidden({ timeout: 5000 });

      // Bezpośredni URL i odświeżenie odtwarzają stan UI bez ponawiania akcji.
      const directUrl = new URL(page.url());
      directUrl.searchParams.set("dialog", "shareOverlay");
      await page.goto(directUrl.toString(), { waitUntil: "domcontentloaded" });
      await expect(overlay).toBeVisible({ timeout: 10000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(overlay).toBeVisible({ timeout: 10000 });

      // Wstecz przeglądarki zamyka okno; przycisk w topbarze bez zmian.
      await page.goBack();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(btnBack).toHaveText(originalText);
    } finally {
      await deleteBaseDirect(page, baseId);
    }
  });
});

test.describe("bases: regresja -- .uni-modal (confirm/alert) zostaje mały na telefonie", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("potwierdzenie usunięcia bazy renderuje się jako mały, wyśrodkowany dialog, nie jako sheet", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-BS-UNIMODAL-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let deleted = false;

    try {
      await page.goto(BASES_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#mineGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.locator(".x").click();

      const uniModal = page.locator(".uni-modal:visible");
      await expect(uniModal).toBeVisible({ timeout: 5000 });

      // Mały dialog: NIE zajmuje pełnej szerokości viewportu (390px), i
      // strona pod spodem NIE jest ukryta (w odróżnieniu od modal--sheet).
      const box = await uniModal.boundingBox();
      expect(box.width).toBeLessThan(370);
      await expect(page.locator(".bar")).toBeVisible();
      await expect(uniModal).not.toHaveClass(/modal--sheet/);

      await page.locator(".uni-modal .uni-foot .btn.gold").click();
      await expect(page.locator("#mineGrid .card", { hasText: name })).toHaveCount(0, { timeout: 10000 });
      deleted = true;
    } finally {
      if (!deleted) await deleteBaseDirect(page, baseId);
    }
  });
});

/* =====================================================================
   2) base-explorer.html -- modale tagów / eksportu / edycji pytania.
   Strona NIE ma stopki (.footer) -- w odróżnieniu od innych stron w tym
   pliku, więc tu nie sprawdzamy punktów footer/btn-contact-footer.
===================================================================== */

const BASE_EXPLORER_URL = "https://www.familiada.online/bases/explorer";

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

async function waitForSbClient(page) {
  await page.waitForFunction(() => !!window.__sbClient, { timeout: 10000 });
}

async function deleteBase(page, baseId) {
  await waitForSbClient(page);
  await page.evaluate(async (id) => {
    await window.__sbClient.from("question_bases").delete().eq("id", id);
  }, baseId);
}

async function createQuestion(page, { baseId, categoryId = null, ord = 1, payload, createdAt = null }) {
  return await page.evaluate(async ({ baseId, categoryId, ord, payload, createdAt }) => {
    const row = { base_id: baseId, category_id: categoryId, ord, payload };
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

async function createTag(page, { baseId, name, ord }) {
  return await page.evaluate(async ({ baseId, name, ord }) => {
    const { data, error } = await window.__sbClient
      .from("qb_tags")
      .insert({ base_id: baseId, name, color: "#4da3ff", ord })
      .select("id")
      .single();
    if (error) throw new Error("insert qb_tags failed: " + error.message);
    return data.id;
  }, { baseId, name, ord });
}

test.describe("base-explorer: mobile sheet modal (tagi/eksport/pytanie)", () => {
  test.use({ viewport: MOBILE_VIEWPORT, serviceWorkers: "block" });

  test("modal tagów na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    if (process.env.GITHUB_REF_NAME !== "main") await serveBranchCode(context, { pages: ["bases/explorer"] });

    const baseId = await createBase(page, `E2E-XB-SHEET-TAGS-${Date.now()}`);

    try {
      for (let ord = 1; ord <= 60; ord++) {
        await createTag(page, { baseId, name: `Tag mobile ${ord}`, ord });
      }
      const qid = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Pytanie do tagowania (mobile)", answers: [] },
      });

      await page.goto(`${BASE_EXPLORER_URL}?id=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await row.click({ button: "right" });
      const tagsItem = page.locator(".context-menu .cm-item", { hasText: /Tagi/i });
      await expect(tagsItem).toBeVisible({ timeout: 5000 });
      await tagsItem.click();

      const overlay = page.locator("#tagsOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      await expectBottomSheet(page, overlay);

      await expect(page.locator("#tagsAssignList .tags-row")).toHaveCount(60, { timeout: 10000 });

      const tagScroll = await page.locator("#tagsAssignList").evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        modalFits: el.closest(".modal").scrollHeight <= el.closest(".modal").clientHeight + 1,
      }));
      expect(tagScroll.scrollHeight).toBeGreaterThan(tagScroll.clientHeight + 1);
      expect(tagScroll.modalFits, "cały modal tagów nie powinien przewijać się razem z listą").toBe(true);
      await page.locator("#tagsAssignList").evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect(page.locator("#tagsL1Save")).toBeInViewport();

      await page.locator("#tagsAddNew").click();
      await expect(page.locator("#tagsL2")).toBeVisible();
      await expect(page.locator("#tagsEditName")).toBeInViewport();
      await expect(page.locator("#tagsEditColorTile")).toBeInViewport();
      await expect(page.locator("#tagsL2Save")).toBeInViewport();

      await page.locator("#tagsEditColorTile").click();
      await expect(page.locator("#tagsL3")).toBeVisible();
      await expect(page.locator("#tagsColorPreview")).toBeInViewport();
      await expect(page.locator("#tagsColorHex")).toBeInViewport();
      await expect(page.locator("#tagsColorR")).toBeInViewport();
      await expect(page.locator("#tagsColorG")).toBeInViewport();
      await expect(page.locator("#tagsColorB")).toBeInViewport();
      await expect(page.locator("#tagsL3Save")).toBeInViewport();
      await page.locator("#tagsColorHex").fill("#2a7fbc");
      await page.locator("#tagsL3Save").click();

      await expect(page.locator("#tagsL2")).toBeVisible();
      await expect(page.locator("#tagsL2Save")).toBeInViewport();
      await page.locator("#tagsEditName").fill("Nowy_tag_mobilny");
      await page.locator("#tagsL2Save").click();
      await expect(page.locator("#tagsL1")).toBeVisible();
      await expect(page.locator("#tagsAssignList .tags-row")).toHaveCount(61, { timeout: 10000 });
      await expect(page.locator("#tagsL1Save")).toBeInViewport();

      await closeSheetViaHandle(page);
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#explorerLeft")).toBeVisible();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("modal eksportu na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    if (process.env.GITHUB_REF_NAME !== "main") await serveBranchCode(context, { pages: ["bases/explorer"] });

    const baseId = await createBase(page, `E2E-XB-SHEET-EXPORT-${Date.now()}`);
    let createdGameId = null;

    try {
      let firstQid = null;
      for (let i = 1; i <= 10; i++) {
        const qid = await createQuestion(page, {
          baseId, ord: i, payload: { text: `Pytanie mobile eksport ${i}`, answers: [] },
        });
        if (i === 1) firstQid = qid;
      }

      await page.goto(`${BASE_EXPLORER_URL}?id=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${firstQid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await page.locator("#list").click();
      await page.keyboard.press("Control+a");
      await row.click({ button: "right" });

      const createGameItem = page.locator(".context-menu .cm-item", { hasText: /Utwórz grę/i });
      await expect(createGameItem).toBeVisible({ timeout: 5000 });
      await createGameItem.click();

      const overlay = page.locator("#exportOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      await expectBottomSheet(page, overlay);

      const scrollState = await page.locator("#exportOverlay").evaluate((overlay) => {
        const modal = overlay.querySelector(".modal");
        const body = modal.querySelector(".sheet-modal-body");
        const xBody = modal.querySelector(".xBody");
        const list = modal.querySelector(".xPickList");
        const overflows = (el) => el.scrollHeight > el.clientHeight + 1;
        return {
          body: overflows(body),
          xBody: overflows(xBody),
          list: overflows(list),
        };
      });
      // E20 (2026-10-17): nazwa, typ i stopka stoją, przewija się tylko lista pytań
      expect(scrollState.list, "lista pytań ma jedyny wewnętrzny scroll").toBe(true);
      expect(scrollState.body, "treść arkusza nie tworzy drugiego scrolla").toBe(false);
      expect(scrollState.xBody, "wewnętrzny kontener nie powinien tworzyć drugiego scrolla").toBe(false);
      await expect(page.locator("#xCreate")).toBeInViewport();

      // (klik w tło zamyka okno od dołu -- sprawdzane w teście importu logo)
      const gameName = `E2E-XB-MOBILE-GAME-${Date.now()}`;
      await page.locator("#lbl0").click();
      await page.locator("#xName").fill(gameName);
      await expect(page.locator("#xCreate")).toBeEnabled({ timeout: 5000 });
      await page.locator("#xCreate").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await page.waitForURL(/\/games\//, { timeout: 15000 });
      await page.goto(`${BASE_EXPLORER_URL}?id=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.__sbClient, { timeout: 10000 });
      createdGameId = await findGameIdByName(page, gameName);
      expect(createdGameId, "gra powinna powstać po zatwierdzeniu w mobilnym modalu").toBeTruthy();
    } finally {
      if (createdGameId) await deleteGameDirect(page, createdGameId);
      await deleteBase(page, baseId);
    }
  });

  test("modal edycji pytania na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const baseId = await createBase(page, `E2E-XB-SHEET-QUESTION-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Pytanie mobile edycja", answers: [] },
      });

      await page.goto(`${BASE_EXPLORER_URL}?id=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.dblclick();

      const overlay = page.locator("#questionOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      await expectBottomSheet(page, overlay);

      await closeSheetViaHandle(page);
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#explorerLeft")).toBeVisible();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("modal zmiany nazwy (renameModal) na telefonie jest roletką od dołu dopasowaną do treści", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const baseId = await createBase(page, `E2E-XB-SHEET-RENAME-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Pytanie do zmiany nazwy (mobile)", answers: [] },
      });

      await page.goto(`${BASE_EXPLORER_URL}?id=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.click();
      await row.click({ button: "right" });
      const renameItem = page.locator(".context-menu .cm-item", { hasText: /Zmień nazwę/i });
      await expect(renameItem).toBeVisible({ timeout: 5000 });
      await renameItem.click();

      const overlay = page.locator(".uni-modal");
      await expect(overlay).toBeVisible({ timeout: 5000 });
      // roletka od dołu dopasowana do treści (decyzja 2026-10-20)
      await expect(page.locator(".overlay.sheet-fit.sheet-active:has(.uni-inp)")).toHaveCount(1);
      await expect(page.locator(".overlay.sheet-fit .sheet-handle")).toBeVisible();

      // „Anuluj” w stopce zamyka okno bez zmian
      await overlay.locator(".uni-foot .btn:not(.gold)").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      expect(page.url()).toContain("bases/explorer");
    } finally {
      await deleteBase(page, baseId);
    }
  });
});

/* =====================================================================
   3) games.html -- modal eksportu gry do bazy pytań
===================================================================== */

const GAMES_URL = "https://www.familiada.online/games";

test.describe("games: mobile sheet modal (eksport do bazy pytań)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("modal eksportu do bazy na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-BLD-SHEET-EXPORT-${Date.now()}`;
    const gameId = await createGameDirect(page, { name, type: "prepared", status: "ready" });

    try {
      // "prepared" wymaga >=10 pytań, by przycisk eksportu do bazy był aktywny
      for (let i = 1; i <= 10; i++) {
        await addQuestionDirect(page, gameId, i, `Pytanie testowe ${i}`);
      }

      await page.goto(GAMES_URL, { waitUntil: "domcontentloaded" });
      await page.locator("#grid > :is(.card,.addCard)").first().waitFor({ timeout: 30000 });

      const tile = page.locator("#grid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.click();

      await expect(page.locator("#btnExportBase")).toBeEnabled({ timeout: 10000 });
      await page.locator("#btnExportBase").click();

      const overlay = page.locator("#exportBaseOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      await expectBottomSheet(page, overlay);
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();

      await closeSheetViaHandle(page);
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator(".bar")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      await deleteGameDirect(page, gameId);
    }
  });
});

test.describe("games: dolny pasek na telefonie przewija się w bok", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  // Decyzja 2026-10-21: zamiast zawijania w rzędy pasek zostaje jednym
  // rzędem i przewija się w bok; wystaje grupa z większą liczbą przycisków.
  test("jeden rząd, przewijanie w prawo, menu filtra zamyka się przy przewinięciu", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    await page.goto(GAMES_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#grid > :is(.card,.addCard)").first().waitFor({ timeout: 30000 });
    const bar = page.locator(".games-bottom:not(.toolbar-measure-box)");
    await expect(bar).toHaveClass(/is-scroll/);
    await expect(bar, "grupy przy sobie, rozdzielone separatorem").toHaveClass(/has-group-sep/);
    const state = await bar.evaluate((el) => {
      const tops = [...el.querySelectorAll(":scope > div > *")]
        .filter((item) => item.getClientRects().length)
        .map((item) => Math.round(item.getBoundingClientRect().top));
      return { rows: new Set(tops).size, scrollLeft: el.scrollLeft, overflow: el.scrollWidth - el.clientWidth };
    });
    console.log(`[e2e-diag] pasek: ${JSON.stringify(state)}`);
    expect(state.rows, "jeden rząd przycisków").toBe(1);
    expect(state.overflow).toBeGreaterThan(0);
    expect(state.scrollLeft, "start od lewej (więcej przycisków po prawej)").toBe(0);
    await expect(bar).toHaveClass(/has-more-end/);

    await page.locator(".games-bottom .list-filter .ui-select-btn").click();
    await expect(page.locator(".games-bottom .list-filter")).toHaveClass(/open/);
    await bar.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect(page.locator(".games-bottom .list-filter")).not.toHaveClass(/open/);
    await expect(bar).toHaveClass(/has-more-start/);
    await expect(bar).not.toHaveClass(/has-more-end/);
  });
});

test.describe("games/editor: pytanie na telefonie w oknie od dołu", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("kliknięcie pytania otwiera roletkę z edycją; pasek zamyka i zapisuje treść", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-EDITOR-SHEET-${Date.now()}`;
    const gameId = await createGameDirect(page, { name, type: "prepared", status: "draft" });
    try {
      await addQuestionDirect(page, gameId, 1, "Pytanie testowe 1");
      await addQuestionDirect(page, gameId, 2, "Pytanie testowe 2");
      await page.goto(`https://www.familiada.online/games/editor/?id=${gameId}`, { waitUntil: "domcontentloaded" });
      const card = page.locator("#qList .qcard[data-id]").nth(1);
      await card.waitFor({ timeout: 30000 });
      await card.click();

      const overlay = page.locator("#questionSheetOverlay");
      await expectBottomSheet(page, overlay);
      await expect(overlay.locator("#qSheetTitle")).toHaveText(/2/);
      await expect(page.locator("body")).not.toHaveClass(/mobile-editing/);
      await overlay.locator("#qText").fill("Zmienione w roletce");

      await closeSheetViaHandle(page);
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator(".rightPanel #editor")).toHaveCount(1);
      await expect(page).not.toHaveURL(/[?&]q=/);
      await expect.poll(async () => page.evaluate(async (id) => {
        const { data } = await window.__sbClient.from("questions").select("text").eq("game_id", id).eq("ord", 2).single();
        return data?.text;
      }, gameId), { timeout: 10000 }).toBe("Zmienione w roletce");
    } finally {
      await deleteGameDirect(page, gameId);
    }
  });
});

/* =====================================================================
   4) marketplace.html -- modal zgłoszenia gry do marketplace
===================================================================== */

const MARKETPLACE_URL = "https://www.familiada.online/marketplace";

test.describe("marketplace: mobile sheet modal (zgłoszenie gry)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("modal zgłoszenia gry na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-MKT-SHEET-SUBMIT-${Date.now()}`;
    const gameId = await createGameDirect(page, { name, type: "prepared", status: "ready" });

    try {
      // "prepared" wymaga >=10 pytań, by gra kwalifikowała się do zgłoszenia
      for (let i = 1; i <= 10; i++) {
        await addQuestionDirect(page, gameId, i, `Pytanie testowe ${i}`);
      }

      await page.goto(MARKETPLACE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await page.locator("#btnMySent").click();
      await expect(page.locator("#viewMine")).toBeVisible({ timeout: 10000 });
      await page.locator("#btnSubmitNew").click();

      const overlay = page.locator("#submitOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      await expectBottomSheet(page, overlay);
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();

      await page.locator("#btnSubmitCancel").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#viewMine")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      await deleteGameDirect(page, gameId);
    }
  });

  // #gameDetailOverlay (szczegóły gry z marketplace: opis/ocena/pytania/oceniający)
  // wymaga opublikowanej pozycji market_games -- RLS na tej tabeli blokuje
  // bezpośrednie DELETE nawet dla właściciela (mg_no_direct_delete), więc
  // zamiast zaśmiecać marketplace trwałym wpisem testowym, sprawdzamy sam
  // kontrakt CSS/HTML (to, co robi enterModalSheet()/show()) bezpośrednio
  // przez DOM, analogicznie do sekcji settings.html niżej w tym pliku.
  test("modal szczegółów gry (#gameDetailOverlay) w trybie sheet wypełnia viewport i chowa resztę main.wrap", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    await page.goto(MARKETPLACE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const overlay = page.locator("#gameDetailOverlay");
    await expect(overlay).toHaveCount(1);

    const originalText = (await page.locator("#btnGoGames").textContent() || "").trim();

    await page.evaluate(() => {
      const overlay = document.getElementById("gameDetailOverlay");
      overlay.style.display = "";
      document.body.classList.add("sheet-open");
      overlay.classList.add("sheet-active");
    });

    await expect(overlay).toBeVisible();
    await expectBottomSheet(page, overlay, { handle: false });
    await expect(page.locator("#btnGoGames")).toHaveText(originalText);

    await page.evaluate(() => {
      const overlay = document.getElementById("gameDetailOverlay");
      overlay.style.display = "none";
      document.body.classList.remove("sheet-open");
      overlay.classList.remove("sheet-active");
    });
    await expect(overlay).toBeHidden();
  });
});

/* =====================================================================
   5) lista logo (/logos/) -- modal zmiany nazwy / modal importu logo.
   Tworzenie i edycja logo są na telefonie ukryte (.le-phone) -- edytory
   to osobne strony /logos/editor/…/, niedostępne na telefonie.
===================================================================== */

const LOGO_EDITOR_URL = "https://www.familiada.online/logos/";

function blankGlyphPayload() {
  return {
    layers: [{ color: "main", rows: Array.from({ length: 10 }, () => " ".repeat(30)) }],
    source: { mode: "TEXT" },
  };
}

async function createLogoDirect(page, name) {
  return await page.evaluate(async ({ name, payload }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: logo, error } = await sb
      .from("user_logos")
      .insert({ user_id: userData.user.id, name, type: "GLYPH_30x10", payload })
      .select("id")
      .single();
    if (error) throw new Error("insert user_logos failed: " + error.message);
    return logo.id;
  }, { name, payload: blankGlyphPayload() });
}

async function deleteLogoDirect(page, logoId) {
  if (!logoId) return;
  await page.evaluate(async (id) => {
    await window.__sbClient.from("user_logos").delete().eq("id", id);
  }, logoId);
}

test.describe("logo: mobile sheet modal (zmiana nazwy/import)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("modal zmiany nazwy logo na telefonie jest roletką od dołu dopasowaną do treści", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-LE-SHEET-RENAME-${Date.now()}`;
    const logoId = await createLogoDirect(page, name);

    try {
      await page.goto(LOGO_EDITOR_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#grid .logoTile", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.dblclick();

      const overlay = page.locator(".uni-modal");
      await expect(overlay).toBeVisible({ timeout: 5000 });
      // roletka od dołu dopasowana do treści (decyzja 2026-10-20)
      await expect(page.locator(".overlay.sheet-fit.sheet-active:has(.uni-inp)")).toHaveCount(1);
      await expect(page.locator(".overlay.sheet-fit .sheet-handle")).toBeVisible();
      await expect(page.locator("#listShell")).toBeVisible();

      await page.locator(".uni-modal .uni-foot .btn:not(.gold)").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
    } finally {
      await deleteLogoDirect(page, logoId);
    }
  });

  test("modal importu logo na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    await page.goto(LOGO_EDITOR_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await page.locator("#btnImport").click();

    const overlay = page.locator("#logoImportOverlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    await expectBottomSheet(page, overlay);
    await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();

    // klik w tło zamyka okno od dołu (decyzja 2026-10-20), pasek też
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).toBeHidden({ timeout: 5000 });

    await page.locator("#btnImport").click();
    await expectBottomSheet(page, overlay);
    await closeSheetViaHandle(page);
    await expect(overlay).toBeHidden({ timeout: 5000 });
    await expect(page.locator("#listShell")).toBeVisible();
    await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
  });

  test("modal podglądu logo (#previewOverlay) na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-LE-SHEET-PREVIEW-${Date.now()}`;
    const logoId = await createLogoDirect(page, name);

    try {
      await page.goto(LOGO_EDITOR_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator(".logoTile", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.click();

      await expect(page.locator("#btnPreview")).toBeEnabled({ timeout: 10000 });
      await page.locator("#btnPreview").click();

      const overlay = page.locator("#previewOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      await expectBottomSheet(page, overlay);

      await closeSheetViaHandle(page);
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#listShell")).toBeVisible();
      expect(page.url()).toContain("/logos/");
    } finally {
      await deleteLogoDirect(page, logoId);
    }
  });
});

/* =====================================================================
   7) settings.html (panel admina) -- modale: oceniający (#ratersOverlay),
   przydzielenie zgłoszenia (#assignReportModal), odrzucenie zgłoszenia z
   marketplace (#marketRejectOverlay).
   UWAGA WAŻNA (do zweryfikowania przez kogoś z realnym dostępem admina):
   settings.html siedzi za Cloudflare Access. Istniejący helper logowania
   (loginAsTestUser/E2E_BYPASS_SECRET) omija WYŁĄCZNIE Turnstile na
   stronie /login dla zwykłych kont Supabase, nie ma NIC wspólnego z
   Cloudflare Access przed panelem admina -- w tym repo nie ma dotąd
   żadnego mechanizmu e2e do autoryzacji Cloudflare Access, więc nawigacja
   do /settings w CI może się nie udać, zanim poniższe testy cokolwiek
   sprawdzą (stąd test.skip() guardy).
   Dodatkowo dane potrzebne do otwarcia tych modali (oceny gier,
   zgłoszenia mailowe) są czytane przez settings.js wyłącznie przez
   wewnętrzne Worker API (/_admin_api/*), nie przez window.__sbClient jak
   na innych stronach w tym pliku -- nie da się ich zaseedować tym samym
   wzorcem. Żeby mimo to pokryć samą mechanikę trybu sheet (ten sam kod co
   na innych stronach: modal-sheet.js + css/base.css "Modal sheet
   (mobile)"), poniższe testy otwierają modal wprost przez manipulację
   DOM (to, co robi enterModalSheet()/show()), zamiast przechodzić przez
   pełny, niedostępny w CI przepływ. To sprawdza kontrakt CSS/HTML, NIE
   testuje realnego wywołania openRatersModal()/openRejectModal()/
   openAssignModal() przez UI -- wymaga osobnego zweryfikowania z
   realnym dostępem admina.
===================================================================== */

const SETTINGS_URL = "https://www.familiada.online/settings";

async function simulateSheetOpen(page, overlaySelector) {
  await page.evaluate((sel) => {
    const overlay = document.querySelector(sel);
    if (!overlay) throw new Error(`overlay ${sel} not found in DOM`);
    overlay.style.display = "";
    overlay.hidden = false;
    document.body.classList.add("sheet-open");
    overlay.classList.add("sheet-active");
  }, overlaySelector);
}

async function simulateSheetClose(page, overlaySelector) {
  await page.evaluate((sel) => {
    const overlay = document.querySelector(sel);
    if (!overlay) return;
    document.body.classList.remove("sheet-open");
    overlay.classList.remove("sheet-active");
    overlay.style.display = "none";
    overlay.hidden = true;
  }, overlaySelector);
}

test.describe("settings: mobile sheet modal -- kontrakt CSS/HTML (oceniający/przydzielenie/odrzucenie)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("#ratersOverlay w trybie sheet wypełnia viewport i chowa resztę main.wrap", async ({ page }) => {
    const res = await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "settings.html niedostępne w tym środowisku (Cloudflare Access) -- patrz komentarz na górze sekcji");

    const overlaySel = "#ratersOverlay";
    const hasOverlay = await page.locator(overlaySel).count();
    test.skip(hasOverlay === 0, "modal nie jest w DOM (strona pewnie pokazała ekran logowania Cloudflare Access zamiast panelu)");

    await simulateSheetOpen(page, overlaySel);
    const overlay = page.locator(overlaySel);
    await expect(overlay).toBeVisible();

    await expectBottomSheet(page, overlay, { handle: false });

    await simulateSheetClose(page, overlaySel);
    await expect(overlay).toBeHidden();
  });

  test("#marketRejectOverlay w trybie sheet wypełnia viewport", async ({ page }) => {
    const res = await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "settings.html niedostępne w tym środowisku (Cloudflare Access)");

    const overlaySel = "#marketRejectOverlay";
    const hasOverlay = await page.locator(overlaySel).count();
    test.skip(hasOverlay === 0, "modal nie jest w DOM (Cloudflare Access?)");

    await simulateSheetOpen(page, overlaySel);
    const overlay = page.locator(overlaySel);
    await expect(overlay).toBeVisible();

    await expectBottomSheet(page, overlay, { handle: false });

    await simulateSheetClose(page, overlaySel);
    await expect(overlay).toBeHidden();
  });

  test("#assignReportModal (market-preview-overlay) w trybie sheet wypełnia viewport", async ({ page }) => {
    const res = await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "settings.html niedostępne w tym środowisku (Cloudflare Access)");

    const overlaySel = "#assignReportModal";
    const hasOverlay = await page.locator(overlaySel).count();
    test.skip(hasOverlay === 0, "modal nie jest w DOM (Cloudflare Access?)");

    await simulateSheetOpen(page, overlaySel);
    const overlay = page.locator(overlaySel);
    await expect(overlay).toBeVisible();

    // ten modal używa .market-preview-card zamiast .modal
    await expectBottomSheet(page, overlay, { handle: false });

    await simulateSheetClose(page, overlaySel);
    await expect(overlay).toBeHidden();
  });

  test("#marketPreviewOverlay w trybie sheet wypełnia viewport", async ({ page }) => {
    const res = await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "settings.html niedostępne w tym środowisku (Cloudflare Access)");

    const overlaySel = "#marketPreviewOverlay";
    const hasOverlay = await page.locator(overlaySel).count();
    test.skip(hasOverlay === 0, "modal nie jest w DOM (Cloudflare Access?)");

    await simulateSheetOpen(page, overlaySel);
    const overlay = page.locator(overlaySel);
    await expect(overlay).toBeVisible();

    await expectBottomSheet(page, overlay, { handle: false });

    await simulateSheetClose(page, overlaySel);
    await expect(overlay).toBeHidden();
  });

  test("#maintenancePreviewOverlay (podgląd strony przerwy technicznej) w trybie sheet wypełnia viewport", async ({ page }) => {
    const res = await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "settings.html niedostępne w tym środowisku (Cloudflare Access)");

    const overlaySel = "#maintenancePreviewOverlay";
    const hasOverlay = await page.locator(overlaySel).count();
    test.skip(hasOverlay === 0, "modal nie jest w DOM (Cloudflare Access?)");

    await simulateSheetOpen(page, overlaySel);
    const overlay = page.locator(overlaySel);
    await expect(overlay).toBeVisible();

    await expectBottomSheet(page, overlay, { handle: false });

    await simulateSheetClose(page, overlaySel);
    await expect(overlay).toBeHidden();
  });

  // Statystyki (openStatsDetailModal) i podgląd wiadomości (mail preview) są
  // budowane w locie przez confirmModal()/shared/js/core/modal.js (klasa .uni-modal),
  // nie istnieją w DOM statycznie -- ani nie da się ich w CI otworzyć
  // realnie (dane z wewnętrznego /_admin_api/*, panel za Cloudflare Access).
  // Test odtwarza dokładnie tę samą strukturę co buildModal({sheet:true})
  // (patrz js/core/modal.js), żeby sprawdzić wspólny kontrakt CSS/HTML
  // (.modal--sheet + .uni-head + ukryty przycisk "✕"), nie realny call site.
  test("modal statystyk/podglądu wiadomości (.uni-modal + modal--sheet) w trybie sheet wypełnia viewport i chowa \"✕\"", async ({ page }) => {
    const res = await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "settings.html niedostępne w tym środowisku (Cloudflare Access)");

    const hasMain = await page.locator("main.wrap").count();
    test.skip(hasMain === 0, "main.wrap nie jest w DOM (Cloudflare Access?)");

    await page.evaluate(() => {
      const main = document.querySelector("main.wrap");
      const overlay = document.createElement("div");
      overlay.className = "overlay modal--sheet sheet-active";
      overlay.id = "e2eStatsDetailOverlay";
      overlay.innerHTML = `
        <div class="modal uni-modal">
          <div class="uni-head">
            <div class="mTitle">Statystyki</div>
            <button class="btn sm" aria-label="Zamknij" type="button">✕</button>
          </div>
          <div class="uni-body">treść</div>
        </div>`;
      main.appendChild(overlay);
      document.body.classList.add("sheet-open");
    });

    const overlay = page.locator("#e2eStatsDetailOverlay");
    await expect(overlay).toBeVisible();

    await expectBottomSheet(page, overlay, { handle: false });
    // Przycisk "✕" w nagłówku ukryty -- okno od dołu zamyka pasek u góry.
    await expect(overlay.locator(".uni-head button[aria-label]")).toBeHidden();

    await page.evaluate(() => {
      document.getElementById("e2eStatsDetailOverlay")?.remove();
      document.body.classList.remove("sheet-open");
    });
  });
});

/* =====================================================================
   8) js/core/contact-modal.js -- modal kontaktu (wspólny dla wielu stron).
   Sprawdzany z poziomu bases.html: ma main.wrap + #btnBack, więc modal
   kontaktu powinien dołączyć do tego samego mechanizmu sheet co reszta
   rozbudowanych modali na tej stronie (patrz js/core/contact-modal.js).
===================================================================== */

test.describe("contact-modal: mobile sheet modal (wspólny dla wielu stron)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("modal kontaktu z bases.html na telefonie zastępuje treść strony i chowa przycisk kontaktu w stopce", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    await page.goto(BASES_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    const btnBack = page.locator("#btnBack");
    const originalText = (await btnBack.textContent() || "").trim();

    const footerContactBtn = page.locator(".footer .btn-contact-footer");
    await expect(footerContactBtn).toBeVisible();
    await footerContactBtn.click();

    const overlay = page.locator("#contactModalOverlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    await expectBottomSheet(page, overlay);
    // Reguła CSS istniejąca już wcześniej (body.sheet-open .footer .btn-contact-footer)
    await expect(footerContactBtn).toBeHidden();

    // Przycisk wstecz w topbarze nie jest przejmowany; okno zamyka pasek.
    await expect(btnBack).toHaveText(originalText);
    await closeSheetViaHandle(page);
    await expect(overlay).toBeHidden({ timeout: 5000 });
    await expect(page.locator(".bar")).toBeVisible();
    await expect(footerContactBtn).toBeVisible();
    await expect(btnBack).toHaveText(originalText);
    expect(page.url()).toContain("/bases");
  });
});
