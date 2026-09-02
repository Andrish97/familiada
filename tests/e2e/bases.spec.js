// tests/e2e/bases.spec.js
// Weryfikuje bases.js (js/pages/bases.js) -- hub z listą baz pytań
// ("Moje" + "Udostępnione"), zanim jeszcze wchodzi się do base-explorera.
// Strona nie miała wcześniej ŻADNEGO pokrycia e2e. Dwie grupy testów:
//
// 1) "codzienna funkcjonalność" -- tworzenie/zmiana nazwy/usunięcie bazy
//    przez UI (kafelek "+", podwójny klik, przycisk "x"), oraz widoczność
//    bazy udostępnionej drugiemu, PRAWDZIWEMU kontu (nie dwie karty tego
//    samego usera) na jej liście "Udostępnione".
//
// 2) "ochrona przy usuwaniu/zmianie nazwy" -- rozszerzenie Warstwy 1/2
//    zbudowanej dla base-explorera (docs/plan-testy-i-poprawki.md, sekcja
//    "Baza pytań") na samą stronę bases.js: usunięcie całej bazy nie może
//    po cichu skasować (CASCADE) elementu, który ktoś aktywnie edytuje w
//    środku (delete_resource_checked z resource_type='base', migracja
//    258); zmiana nazwy bazy usuniętej w międzyczasie musi pokazać
//    komunikat zamiast cichego "sukcesu" (updateChecked, ROW_GONE).

const { test, expect } = require("@playwright/test");
const { loginAsTestUser } = require("./helpers/login");

const BASE_URL = "https://www.familiada.online/bases";

/* ================= Seed / DB helpers (bezpośrednio przez window.__sbClient) ================= */

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

async function getBaseRow(page, baseId) {
  return await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient
      .from("question_bases").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }, baseId);
}

async function createQuestionDirect(page, baseId, payload) {
  return await page.evaluate(async ({ baseId, payload }) => {
    const { data, error } = await window.__sbClient
      .from("qb_questions")
      .insert({ base_id: baseId, category_id: null, ord: 1, payload })
      .select("id")
      .single();
    if (error) throw new Error("insert qb_questions failed: " + error.message);
    return data.id;
  }, { baseId, payload });
}

async function getUserId(page) {
  return await page.evaluate(async () => {
    const { data } = await window.__sbClient.auth.getUser();
    return data.user.id;
  });
}

// `page` musi być zalogowane jako WŁAŚCICIEL bazy (RLS qb_shares_write).
async function shareBaseWith(page, baseId, userId, role) {
  await page.evaluate(async ({ baseId, userId, role }) => {
    const { error } = await window.__sbClient
      .from("question_base_shares")
      .upsert({ base_id: baseId, user_id: userId, role }, { onConflict: "base_id,user_id" });
    if (error) throw new Error(error.message);
  }, { baseId, userId, role });
}

// Symuluje "ktoś inny właśnie edytuje coś w środku tej bazy" -- to samo RPC
// co acquireResourceLock()/acquireResourceLocks() w przeglądarce
// (js/core/resource-lock.js), z jednorazowym tab_id.
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

/* ================= 1) Codzienna funkcjonalność ================= */

test.describe("bases: codzienna funkcjonalność (tworzenie/zmiana nazwy/usunięcie)", () => {

  test("kafelek '+' tworzy nową bazę i trafia na listę 'Moje'", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const name = `E2E-BS-CREATE-${Date.now()}`;
    let baseId = null;

    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await page.locator("#mineGrid .addCard").click();
      await expect(page.locator("#nameOverlay")).toBeVisible({ timeout: 5000 });
      await page.locator("#nameInp").fill(name);
      await page.locator("#btnNameOk").click();
      await expect(page.locator("#nameOverlay")).toBeHidden({ timeout: 10000 });

      await expect(page.locator("#mineGrid .card", { hasText: name })).toBeVisible({ timeout: 10000 });

      baseId = await page.evaluate(async (name) => {
        const { data } = await window.__sbClient.from("question_bases").select("id").eq("name", name).maybeSingle();
        return data?.id || null;
      }, name);
      expect(baseId, "baza musi realnie istnieć w DB, nie tylko wizualnie na kafelku").toBeTruthy();
    } finally {
      if (baseId) await deleteBaseDirect(page, baseId);
    }
  });

  test("podwójny klik w kafelek otwiera zmianę nazwy, zapis aktualizuje nazwę wszędzie", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const oldName = `E2E-BS-RENAME-${Date.now()}`;
    const newName = `${oldName}-zmieniona`;
    const baseId = await createBaseDirect(page, oldName);

    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#mineGrid .card", { hasText: oldName });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.dblclick();

      await expect(page.locator("#nameOverlay")).toBeVisible({ timeout: 5000 });
      await page.locator("#nameInp").fill(newName);
      await page.locator("#btnNameOk").click();
      await expect(page.locator("#nameOverlay")).toBeHidden({ timeout: 10000 });

      await expect(page.locator("#mineGrid .card", { hasText: newName })).toBeVisible({ timeout: 10000 });

      const fresh = await getBaseRow(page, baseId);
      expect(fresh?.name).toBe(newName);
    } finally {
      await deleteBaseDirect(page, baseId);
    }
  });

  test("przycisk 'x' + potwierdzenie usuwa bazę z listy i z DB", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const name = `E2E-BS-DELETE-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let deleted = false;

    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#mineGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.locator(".x").click();

      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await page.locator(".uni-modal .uni-foot .btn.gold").click();

      await expect(page.locator("#mineGrid .card", { hasText: name })).toHaveCount(0, { timeout: 10000 });
      deleted = true;

      const fresh = await getBaseRow(page, baseId);
      expect(fresh, "potwierdzone usunięcie musi realnie skasować wiersz w DB").toBeNull();
    } finally {
      if (!deleted) await deleteBaseDirect(page, baseId);
    }
  });

  test("udostępniona baza pojawia się u drugiego, prawdziwego użytkownika na liście 'Udostępnione' z właściwą rolą", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const name = `E2E-BS-SHARE-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      await page2.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page2.waitForLoadState("networkidle");

      const tile = page2.locator("#sharedGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await expect(tile.locator('.tileBadge[data-kind="role"]')).toHaveText("✎");
    } finally {
      if (context2) await context2.close();
      await deleteBaseDirect(page, baseId);
    }
  });
});

/* ================= 2) Ochrona przy usuwaniu/zmianie nazwy ================= */

test.describe("bases: ochrona bazy jako całości (delete_resource_checked + updateChecked)", () => {

  test("usunięcie bazy jest zablokowane, gdy drugi, prawdziwy użytkownik edytuje pytanie w jej wnętrzu", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const name = `E2E-BS-DELLOCKED-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let context2 = null;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      const qid = await createQuestionDirect(page, baseId, { text: "Zablokowane pytanie", answers: [] });
      const lock = await acquireLockDirect(page2, "base_question", qid, "e2e-test:question-modal");
      expect(lock?.ok, "drugi user musi realnie zająć blokadę przed próbą usunięcia bazy").toBe(true);

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#mineGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.locator(".x").click();

      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      // to jest okno POTWIERDZENIA (confirmModal) -- potwierdź je, dopiero
      // WTEDY appka woła delete_resource_checked i musi się zatrzymać
      await page.locator(".uni-modal .uni-foot .btn.gold").click();

      // drugie okno: alertModal z blokadą
      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await page.locator(".uni-modal .uni-foot button").first().click();

      await expect(page.locator("#mineGrid .card", { hasText: name })).toBeVisible();
      const fresh = await getBaseRow(page, baseId);
      expect(fresh, "baza (ani nic w jej wnętrzu) nie może zniknąć, gdy ktoś tam aktywnie edytuje").not.toBeNull();
    } finally {
      if (context2) await context2.close();
      await deleteBaseDirect(page, baseId);
    }
  });

  test("usunięcie bazy działa normalnie, gdy nic w jej wnętrzu nie jest zablokowane", async ({ page, context, browser }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const name = `E2E-BS-DELFREE-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let context2 = null;
    let deleted = false;

    try {
      context2 = await browser.newContext();
      const page2 = await context2.newPage();
      await loginAsTestUser(page2, context2, { username: process.env.TEST_USERNAME_2 });
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");
      await createQuestionDirect(page, baseId, { text: "Wolne pytanie", answers: [] });

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#mineGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.locator(".x").click();
      await expect(page.locator(".uni-modal .mSub")).toBeVisible({ timeout: 5000 });
      await page.locator(".uni-modal .uni-foot .btn.gold").click();

      await expect(page.locator("#mineGrid .card", { hasText: name })).toHaveCount(0, { timeout: 10000 });
      deleted = true;

      const fresh = await getBaseRow(page, baseId);
      expect(fresh).toBeNull();
    } finally {
      if (context2) await context2.close();
      if (!deleted) await deleteBaseDirect(page, baseId);
    }
  });

  test("zmiana nazwy bazy usuniętej tuż przed zapisem pokazuje komunikat zamiast cichego 'sukcesu'", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context);

    const name = `E2E-BS-RENAMEGONE-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let cleaned = false;

    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#mineGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.dblclick();
      await expect(page.locator("#nameOverlay")).toBeVisible({ timeout: 5000 });
      await page.locator("#nameInp").fill(`${name}-nowa`);

      // baza znika "gdzieś indziej" tuż przed kliknięciem Zapisz
      await deleteBaseDirect(page, baseId);
      cleaned = true;

      await page.locator("#btnNameOk").click();
      await expect(page.locator("#nameMsg")).toHaveText(/usunięte w międzyczasie/i, { timeout: 5000 });
      // modal NIE zamyka się przy błędzie (patrz catch w nameOk())
      await expect(page.locator("#nameOverlay")).toBeVisible();
    } finally {
      if (!cleaned) await deleteBaseDirect(page, baseId);
    }
  });
});
