// tests/e2e/polls-hub.spec.js
// Weryfikuje mobilny "sheet" modal (js/core/modal-sheet.js) na
// polls-hub.html -- modale udostępniania i szczegółów ankiety
// (openShareModal()/openDetailsModal(), js/pages/polls-hub.js). Strona
// nie miała wcześniej pokrycia e2e; ten plik na razie ogranicza się do
// tego nowego zachowania mobilnego (patrz plan mobile sheet modals).
//
// UWAGA: subscriptions.html dzieli markup .hub-* z polls-hub.html, ale ma
// WŁASNY plik JS (js/pages/subscriptions.js) i własne modale (progress
// only, żadnych "substantial" udostępnij/szczegóły) -- nie jest tu objęta.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");

const BASE_URL = "https://www.familiada.online/polls-hub";

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

async function deleteGameDirect(page, gameId) {
  if (!gameId) return;
  await page.evaluate(async (id) => {
    await window.__sbClient.from("games").delete().eq("id", id);
  }, gameId);
}

test.describe("polls-hub: mobile sheet modal (udostępnianie/szczegóły ankiety)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("modal udostępniania ankiety na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-PH-SHEET-SHARE-${Date.now()}`;
    const gameId = await createPollDirect(page, { name });

    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
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
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
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
