// tests/e2e/mobile-sheet-modals.spec.js
// Jeden zbiorczy plik dla WSZYSTKICH testów mobilnego trybu "sheet"
// (js/core/modal-sheet.js) -- rozbudowane modale na telefonie zastępują
// treść strony (topbar/stopka zostają) zamiast być małym, wyśrodkowanym
// oknem na przyciemnionym tle. Każda strona ma własną sekcję
// (test.describe), żeby całość dało się odpalić jednym poleceniem:
//   npx playwright test mobile-sheet-modals.spec.js
//
// Strony objęte tym plikiem: bases, base-explorer, builder, marketplace,
// polls-hub, logo-editor, settings (patrz plan mobile sheet modals).
// settings.html jest za Cloudflare Access -- jej sekcja sprawdza sam
// kontrakt CSS/HTML przez bezpośrednią manipulację DOM, nie pełny
// przepływ UI (patrz komentarz przy tej sekcji niżej).

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");

const MOBILE_VIEWPORT = { width: 390, height: 844 };

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

test.describe("bases: mobile sheet modal (udostępnianie/nazwa)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("modal udostępniania na telefonie zastępuje treść strony (sheet), nie jest małym okienkiem", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

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

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      await expect(page.locator(".bar")).toBeHidden();
      await expect(page.locator(".footer")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      await page.locator("#btnShareClose").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator(".bar")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      await deleteBaseDirect(page, baseId);
    }
  });

  test("modal nazwy (tworzenie) na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    let baseId = null;

    try {
      await page.goto(BASES_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await page.locator("#mineGrid .addCard").click();
      const overlay = page.locator("#nameOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      await expect(page.locator(".bar")).toBeHidden();
      await expect(page.locator(".footer")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      // klik w tło (poza .modal) nic nie robi na telefonie -- jedynym
      // wyjściem jest widoczny przycisk Anuluj
      await overlay.click({ position: { x: 5, y: 5 } });
      await expect(overlay).toBeVisible();

      await page.locator("#btnNameCancel").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator(".bar")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      if (baseId) await deleteBaseDirect(page, baseId);
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

      const uniModal = page.locator(".uni-modal");
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

const BASE_EXPLORER_URL = "https://www.familiada.online/base-explorer";

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

test.describe("base-explorer: mobile sheet modal (tagi/eksport/pytanie)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("modal tagów na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const baseId = await createBase(page, `E2E-XB-SHEET-TAGS-${Date.now()}`);

    try {
      const qid = await createQuestion(page, {
        baseId, ord: 1, payload: { text: "Pytanie do tagowania (mobile)", answers: [] },
      });

      await page.goto(`${BASE_EXPLORER_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
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

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      await expect(page.locator("#explorerLeft")).toBeHidden();
      await expect(page.locator(".explorer-right")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      await page.locator("#tagsL1Close").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#explorerLeft")).toBeVisible();
    } finally {
      await deleteBase(page, baseId);
    }
  });

  test("modal eksportu na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const baseId = await createBase(page, `E2E-XB-SHEET-EXPORT-${Date.now()}`);

    try {
      let firstQid = null;
      for (let i = 1; i <= 10; i++) {
        const qid = await createQuestion(page, {
          baseId, ord: i, payload: { text: `Pytanie mobile eksport ${i}`, answers: [] },
        });
        if (i === 1) firstQid = qid;
      }

      await page.goto(`${BASE_EXPLORER_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
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

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);
      await expect(page.locator("#explorerLeft")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      // klik w tło nic nie robi na telefonie (wychodzi tylko przez X)
      await overlay.click({ position: { x: 5, y: 5 } });
      await expect(overlay).toBeVisible();

      await page.locator("#xClose").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#explorerLeft")).toBeVisible();
    } finally {
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

      await page.goto(`${BASE_EXPLORER_URL}?base=${baseId}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const row = page.locator(`#list .row[data-kind="q"][data-id="${qid}"]`);
      await expect(row).toBeVisible({ timeout: 15000 });
      await row.dblclick();

      const overlay = page.locator("#questionOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);
      await expect(page.locator("#explorerLeft")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      await page.locator("#qClose").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#explorerLeft")).toBeVisible();
    } finally {
      await deleteBase(page, baseId);
    }
  });
});

/* =====================================================================
   3) builder.html -- modal eksportu gry do bazy pytań
===================================================================== */

const BUILDER_URL = "https://www.familiada.online/builder";

test.describe("builder: mobile sheet modal (eksport do bazy pytań)", () => {
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

      await page.goto(BUILDER_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#grid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.click();

      await expect(page.locator("#btnExportBase")).toBeEnabled({ timeout: 10000 });
      await page.locator("#btnExportBase").click();

      const overlay = page.locator("#exportBaseOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      await expect(page.locator(".bar")).toBeHidden();
      await expect(page.locator(".footer")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      await page.locator("#btnExportBaseCancel").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator(".bar")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
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

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      await expect(page.locator("#viewMine")).toBeHidden();
      await expect(page.locator(".footer")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      await page.locator("#btnSubmitCancel").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#viewMine")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      await deleteGameDirect(page, gameId);
    }
  });
});

/* =====================================================================
   5) polls-hub.html -- modale udostępniania i szczegółów ankiety.
   UWAGA: subscriptions.html dzieli markup .hub-* z polls-hub.html, ale ma
   WŁASNY plik JS (js/pages/subscriptions.js) i własne modale (progress
   only) -- nie jest tu objęta.
===================================================================== */

const POLLS_HUB_URL = "https://www.familiada.online/polls-hub";

async function createPollDirect(page, { name, type = "poll_text", status = "poll_open" }) {
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

test.describe("polls-hub: mobile sheet modal (udostępnianie/szczegóły ankiety)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("modal udostępniania ankiety na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-PH-SHEET-SHARE-${Date.now()}`;
    const gameId = await createPollDirect(page, { name });

    try {
      await page.goto(POLLS_HUB_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#pollsListMobile .hub-item", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.click();

      await expect(page.locator("#btnShareMobile")).toBeEnabled({ timeout: 10000 });
      await page.locator("#btnShareMobile").click();

      const overlay = page.locator("#shareOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      await expect(page.locator(".bar")).toBeHidden();
      await expect(page.locator(".footer")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      await page.locator("#btnShareClose").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator(".bar")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      await deleteGameDirect(page, gameId);
    }
  });

  test("modal szczegółów ankiety na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-PH-SHEET-DETAILS-${Date.now()}`;
    const gameId = await createPollDirect(page, { name });

    try {
      await page.goto(POLLS_HUB_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#pollsListMobile .hub-item", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.click();

      await expect(page.locator("#btnDetailsMobile")).toBeEnabled({ timeout: 10000 });
      await page.locator("#btnDetailsMobile").click();

      const overlay = page.locator("#detailsOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      await expect(page.locator(".bar")).toBeHidden();
      await expect(page.locator(".footer")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      await page.locator("#btnDetailsClose").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator(".bar")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      await deleteGameDirect(page, gameId);
    }
  });
});

/* =====================================================================
   6) logo-editor.html -- modal zmiany nazwy / modal importu logo.
   UWAGA: modal tworzenia (#createOverlay) jest tu POMINIĘTY -- jego jedyny
   trigger w HTML (".addCard") ma klasę `hide-mobile`, więc na telefonie
   nie da się go dziś w ogóle otworzyć przez UI. Infrastruktura sheet jest
   mimo to podłączona pod ten modal w kodzie (logo-editor/js/main.js) --
   do zweryfikowania osobno, czy to świadomy stan czy przeoczenie.
===================================================================== */

const LOGO_EDITOR_URL = "https://www.familiada.online/logo-editor";

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

test.describe("logo-editor: mobile sheet modal (zmiana nazwy/import)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("modal zmiany nazwy logo na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-LE-SHEET-RENAME-${Date.now()}`;
    const logoId = await createLogoDirect(page, name);

    try {
      await page.goto(LOGO_EDITOR_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#grid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.dblclick();

      const overlay = page.locator("#renameOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      await expect(page.locator("#listShell")).toBeHidden();
      await expect(page.locator(".footer")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      await page.locator("#btnRenameCancel").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#listShell")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
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

    const box = await overlay.locator(".modal").boundingBox();
    expect(box.width).toBeGreaterThan(370);

    await expect(page.locator("#listShell")).toBeHidden();
    await expect(page.locator(".footer")).toBeVisible();
    await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
    await expect(page.locator(".topbar")).toBeVisible();

    // klik w tło nic nie robi na telefonie (wychodzi tylko przez X)
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).toBeVisible();

    await page.locator("#btnLogoImportCancel").click();
    await expect(overlay).toBeHidden({ timeout: 5000 });
    await expect(page.locator("#listShell")).toBeVisible();
    await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
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

    const box = await overlay.locator(".modal").boundingBox();
    expect(box.width).toBeGreaterThan(370);

    await expect(page.locator(".topbar")).toBeVisible();

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

    const box = await overlay.locator(".modal").boundingBox();
    expect(box.width).toBeGreaterThan(370);

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
    const box = await overlay.locator(".market-preview-card").boundingBox();
    expect(box.width).toBeGreaterThan(370);

    await simulateSheetClose(page, overlaySel);
    await expect(overlay).toBeHidden();
  });
});
