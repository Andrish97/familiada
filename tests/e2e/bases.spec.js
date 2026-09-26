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

//
// Strona /bases i cały front-end (js/, css/, translation/) są serwowane z
// plików TEGO repo (helpers/branch-code.js), a backend jest prawdziwy --
// więc workflow odpalony na branchu testuje poprawki przed wdrożeniem.

const fs = require("fs");
const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const BASE_URL = "https://www.familiada.online/bases";

// service worker obsłużyłby żądania z własnego cache z pominięciem page.route
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["bases"] });
});

async function newUserContext(browser, username, contextOptions = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", ...contextOptions });
  await serveBranchCode(ctx, { pages: ["bases"] });
  const pg = await ctx.newPage();
  await loginAsTestUser(pg, ctx, { username });
  return { ctx, page: pg };
}

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
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

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
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

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
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

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
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-BS-SHARE-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let context2 = null;

    try {
      let page2;
      ({ ctx: context2, page: page2 } = await newUserContext(browser, testAccountUsername(2)));
      const user2Id = await getUserId(page2);
      await shareBaseWith(page, baseId, user2Id, "editor");

      await page2.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page2.waitForLoadState("networkidle");
      await page2.locator("#tabBasesShared").click();

      const tile = page2.locator("#sharedGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await expect(tile.locator('.tileBadge[data-kind="role"]')).toHaveAttribute("title", "Masz dostęp z edycją");
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
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-BS-DELLOCKED-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let context2 = null;

    try {
      let page2;
      ({ ctx: context2, page: page2 } = await newUserContext(browser, testAccountUsername(2)));
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
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-BS-DELFREE-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let context2 = null;
    let deleted = false;

    try {
      let page2;
      ({ ctx: context2, page: page2 } = await newUserContext(browser, testAccountUsername(2)));
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
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

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
      await expect(page.locator("#nameMsg")).toHaveText(/w międzyczasie usunięte/i, { timeout: 5000 });
      // modal NIE zamyka się przy błędzie (patrz catch w nameOk())
      await expect(page.locator("#nameOverlay")).toBeVisible();
    } finally {
      if (!cleaned) await deleteBaseDirect(page, baseId);
    }
  });
});

// Mobile "sheet" modal testy (udostępnianie/nazwa + regresja .uni-modal)
// zostały przeniesione do tests/e2e/mobile-sheet-modals.spec.js -- tam są
// zebrane testy tego mechanizmu dla wszystkich stron w jednym pliku.

/* ================= 3) Audyt bases (2026-09): regresje poprawionych błędów ================= */

// Tworzy zaproszenie (base_share_tasks) tak jak przycisk "Dodaj" w modalu
// udostępniania, ale bez wysyłki maila. Zwraca token z linku z maila.
async function inviteUser(ownerPage, baseId, recipientUserId, role = "viewer") {
  return await ownerPage.evaluate(async ({ baseId, recipientUserId, role }) => {
    const { data, error } = await window.__sbClient.rpc("base_share_by_user", {
      p_base_id: baseId, p_recipient_user_id: recipientUserId, p_role: role,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.ok) throw new Error("base_share_by_user: " + row?.err);
    return new URL(row.mail_link, location.origin).searchParams.get("share");
  }, { baseId, recipientUserId, role });
}

async function countUniModals(page, windowMs) {
  // ile RÓŻNYCH okienek alert/confirm pojawi się w oknie czasu (zamykając każde)
  let n = 0;
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    const modal = page.locator(".uni-modal");
    if (await modal.count()) {
      n += 1;
      await modal.locator(".uni-foot button").first().click();
      await expect(modal).toHaveCount(0);
    }
    await page.waitForTimeout(200);
  }
  return n;
}

test.describe("bases: audyt -- układ i gesty", () => {

  test("desktop: dwie wypustki jak na mobile -- widoczna tylko aktywna sekcja, wybór zapamiętany", async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1400, height: 900 });
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await expect(page.locator("#basesTabs")).toBeVisible();
    await expect(page.locator("#mineGrid")).toBeVisible();
    await expect(page.locator("#sharedGrid")).toBeHidden();

    await page.locator("#tabBasesShared").click();
    await expect(page.locator("#sharedGrid")).toBeVisible();
    await expect(page.locator("#mineGrid")).toBeHidden();
    await expect(page.locator("#tabBasesShared")).toHaveAttribute("aria-selected", "true");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#sharedGrid")).toBeVisible();

    // wypustki 50/50 na całą szerokość karty
    const [a, b, card] = await Promise.all([
      page.locator(".slot-mine").boundingBox(),
      page.locator(".slot-shared").boundingBox(),
      page.locator(".bases-card").boundingBox(),
    ]);
    expect(Math.abs(a.width - b.width)).toBeLessThan(2);
    expect(Math.abs(a.width + b.width - card.width)).toBeLessThan(3);
  });

  test("telefon: podwójne tapnięcie w kafelek otwiera zmianę nazwy", async ({ browser }) => {
    test.setTimeout(60_000);
    const { ctx, page } = await newUserContext(browser, testAccountUsername(1), {
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    });
    const name = `E2E-BS-TAP-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      const tile = page.locator("#mineGrid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });

      // pojedyncze tapnięcie: zaznacza, bez modala
      await tile.tap();
      await expect(tile).toHaveClass(/selected/);
      await expect(page.locator("#btnBrowse")).toBeEnabled();
      await page.waitForTimeout(500);

      // podwójne: modal zmiany nazwy (wcześniej pierwszy tap przebudowywał
      // kafelki i drugi trafiał w nowy element -- gest nigdy nie działał)
      await tile.tap();
      await tile.tap();
      await expect(page.locator("#nameOverlay")).toBeVisible({ timeout: 5000 });
      await expect(page.locator("#nameInp")).toHaveValue(name);
    } finally {
      await deleteBaseDirect(page, baseId);
      await ctx.close();
    }
  });
});

test.describe("bases: audyt -- zaproszenia i link z maila", () => {

  test("zaproszenie: kafelek pokazuje od kogo i rolę, Przeglądaj/Eksport zablokowane do akceptacji", async ({ page, context, browser }) => {
    test.setTimeout(90_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-BS-INVITE-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let ctx2 = null;
    try {
      let page2;
      ({ ctx: ctx2, page: page2 } = await newUserContext(browser, testAccountUsername(2)));
      await inviteUser(page, baseId, await getUserId(page2), "editor");

      await page2.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page2.waitForLoadState("networkidle");
      await expect(page2.locator("#basesSharedBadge")).not.toHaveClass(/is-empty/);
      await page2.locator("#tabBasesShared").click();

      const tile = page2.locator("#sharedGrid .card.proposed", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await expect(tile.locator('.tileBadge[data-kind="from"]')).toBeVisible();
      await expect(tile.locator('.tileBadge[data-kind="role"]')).toHaveAttribute("title", "Masz dostęp z edycją");
      await expect(tile.locator('.tileBadge[data-kind="mine"]')).toHaveCount(0);

      await tile.locator(".name").click();
      await expect(tile).toHaveClass(/selected/);
      await expect(page2.locator("#btnBrowse")).toBeDisabled();
      await expect(page2.locator("#btnExport")).toBeDisabled();

      await tile.locator("[data-accept]").click();
      const accepted = page2.locator("#sharedGrid .card", { hasText: name });
      await expect(accepted).not.toHaveClass(/proposed/, { timeout: 10000 });
      // zaznaczenie przetrwało akceptację -- teraz to już dostęp, więc Przeglądaj działa
      await expect(accepted).toHaveClass(/selected/);
      await expect(page2.locator("#btnBrowse")).toBeEnabled();
    } finally {
      if (ctx2) await ctx2.close();
      await deleteBaseDirect(page, baseId);
    }
  });

  test("link z maila: adresat trafia na zaproszenie bez komunikatu; obcy widzi jeden komunikat; cofnięte -> jeden komunikat", async ({ page, context, browser }) => {
    test.setTimeout(120_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-BS-LINK-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    let ctx2 = null;
    try {
      let page2;
      ({ ctx: ctx2, page: page2 } = await newUserContext(browser, testAccountUsername(2)));
      const token = await inviteUser(page, baseId, await getUserId(page2));

      // adresat
      await page2.goto(`${BASE_URL}?share=${token}`, { waitUntil: "domcontentloaded" });
      await expect(page2.locator("#sharedGrid .card.proposed.selected", { hasText: name })).toBeVisible({ timeout: 15000 });
      expect(await countUniModals(page2, 2500), "adresat nie powinien dostać żadnego komunikatu").toBe(0);
      await expect(page2).not.toHaveURL(/share=/);

      // ktoś inny (tu: sam właściciel) z tym samym linkiem
      await page.goto(`${BASE_URL}?share=${token}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".uni-modal .mSub")).toContainText("innego użytkownika", { timeout: 15000 });
      expect(await countUniModals(page, 3000)).toBe(1);

      // cofnięte zaproszenie
      await page.evaluate(async (baseId) => {
        const { data } = await window.__sbClient.rpc("list_base_share_tasks_outgoing", { p_base_id: baseId });
        for (const r of data || []) await window.__sbClient.rpc("base_share_cancel_task", { p_task_id: r.task_id });
      }, baseId);
      await page2.goto(`${BASE_URL}?share=${token}`, { waitUntil: "domcontentloaded" });
      await expect(page2.locator(".uni-modal .mSub")).toContainText("cofnięte", { timeout: 15000 });
      expect(await countUniModals(page2, 3000)).toBe(1);
    } finally {
      if (ctx2) await ctx2.close();
      await deleteBaseDirect(page, baseId);
    }
  });
});

test.describe("bases: audyt -- eksport / import", () => {

  test("eksport -> import zachowuje foldery, tagi pytań i tagi folderów", async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-BS-EXPORT-${Date.now()}`;
    const baseId = await createBaseDirect(page, name);
    const createdIds = [baseId];
    try {
      await page.evaluate(async (baseId) => {
        const sb = window.__sbClient;
        const one = async (q) => { const { data, error } = await q.select("id").single(); if (error) throw new Error(error.message); return data.id; };
        const root = await one(sb.from("qb_categories").insert({ base_id: baseId, name: "Folder", ord: 1 }));
        const child = await one(sb.from("qb_categories").insert({ base_id: baseId, parent_id: root, name: "Podfolder", ord: 1 }));
        const tag = await one(sb.from("qb_tags").insert({ base_id: baseId, name: "Tag", color: "red", ord: 1 }));
        const q = await one(sb.from("qb_questions").insert({ base_id: baseId, category_id: child, ord: 1, payload: { text: "Pytanie?", answers: [] } }));
        let r = await sb.from("qb_question_tags").insert({ question_id: q, tag_id: tag });
        if (r.error) throw new Error(r.error.message);
        r = await sb.from("qb_category_tags").insert({ category_id: root, tag_id: tag });
        if (r.error) throw new Error(r.error.message);
      }, baseId);

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await page.locator("#mineGrid .card", { hasText: name }).locator(".name").click();

      const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#btnExport").click()]);
      const file = testInfo.outputPath("export.fambase");
      await download.saveAs(file);
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      expect(json.categories).toHaveLength(2);
      expect(json.question_tags).toHaveLength(1);
      expect(json.category_tags, "eksport musi zawierać tagi folderów").toHaveLength(1);

      await page.locator("#btnImport").click();
      await page.locator("#importFile").setInputFiles(file);
      await expect(page.locator("#btnImportJson")).toBeEnabled();
      await page.locator("#btnImportJson").click();
      await expect(page.locator("#importOverlay")).toBeHidden({ timeout: 30000 });

      const summary = await page.evaluate(async ({ name, baseId }) => {
        const sb = window.__sbClient;
        const { data: bases } = await sb.from("question_bases").select("id").eq("name", name).neq("id", baseId);
        const id = bases?.[0]?.id;
        const count = async (t, col, ids) => (await sb.from(t).select("*").in(col, ids)).data?.length ?? -1;
        const cats = (await sb.from("qb_categories").select("id,parent_id").eq("base_id", id)).data || [];
        const qs = (await sb.from("qb_questions").select("id,category_id").eq("base_id", id)).data || [];
        return {
          id,
          cats: cats.length,
          nested: cats.filter((c) => c.parent_id).length,
          qs: qs.length,
          qInFolder: qs.filter((q) => q.category_id).length,
          tags: (await sb.from("qb_tags").select("id").eq("base_id", id)).data?.length,
          qtags: await count("qb_question_tags", "question_id", qs.map((q) => q.id)),
          ctags: await count("qb_category_tags", "category_id", cats.map((c) => c.id)),
        };
      }, { name, baseId });
      if (summary.id) createdIds.push(summary.id);
      expect(summary).toMatchObject({ cats: 2, nested: 1, qs: 1, qInFolder: 1, tags: 1, qtags: 1, ctags: 1 });
    } finally {
      for (const id of createdIds) await deleteBaseDirect(page, id);
    }
  });

  test("nieudany import nie zostawia pustej/niepełnej bazy", async ({ page, context }, testInfo) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });
    const name = `E2E-BS-IMPFAIL-${Date.now()}`;
    const file = testInfo.outputPath("broken.fambase");
    fs.writeFileSync(file, JSON.stringify({
      base: { name },
      categories: [{ id: "c1", parent_id: null, name: "F", ord: 1 }],
      tags: [],
      questions: [{ id: "q1", category_id: "c1", ord: 1, payload: { text: "?", answers: [] } }],
    }));

    // awaria serwera w połowie importu (po utworzeniu bazy i folderów)
    await page.route("**/rest/v1/qb_questions*", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "e2e: symulowana awaria" }) })
        : route.continue());

    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await page.locator("#btnImport").click();
      await page.locator("#importFile").setInputFiles(file);
      await page.locator("#btnImportJson").click();
      await expect(page.locator("#importMsg")).not.toBeEmpty({ timeout: 15000 });

      const left = await page.evaluate(async (name) =>
        (await window.__sbClient.from("question_bases").select("id").eq("name", name)).data || [], name);
      expect(left, "po nieudanym imporcie baza ma zostać usunięta").toHaveLength(0);
      await expect(page.locator("#mineGrid .card", { hasText: name })).toHaveCount(0);
    } finally {
      await page.unroute("**/rest/v1/qb_questions*");
      const left = await page.evaluate(async (name) =>
        (await window.__sbClient.from("question_bases").select("id").eq("name", name)).data || [], name);
      for (const b of left) await deleteBaseDirect(page, b.id);
    }
  });
});
