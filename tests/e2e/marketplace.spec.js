// tests/e2e/marketplace.spec.js
// Weryfikuje mobilny "sheet" modal (js/core/modal-sheet.js) na
// marketplace.html -- modal zgłoszenia gry do marketplace
// (openSubmitModal(), js/pages/marketplace.js). Strona nie miała
// wcześniej pokrycia e2e; ten plik na razie ogranicza się do tego jednego,
// nowego zachowania mobilnego (patrz plan mobile sheet modals).

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");

const BASE_URL = "https://www.familiada.online/marketplace";

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

test.describe("marketplace: mobile sheet modal (zgłoszenie gry)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("modal zgłoszenia gry na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-MKT-SHEET-SUBMIT-${Date.now()}`;
    const gameId = await createGameDirect(page, { name, type: "prepared", status: "ready" });

    try {
      // "prepared" wymaga >=10 pytań, by gra była kwalifikująca się do
      // zgłoszenia (patrz eligible.filter w openSubmitModal()).
      for (let i = 1; i <= 10; i++) {
        await addQuestionDirect(page, gameId, i, `Pytanie testowe ${i}`);
      }

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      await page.locator("#btnMySent").click();
      await expect(page.locator("#viewMine")).toBeVisible({ timeout: 10000 });
      await page.locator("#btnSubmitNew").click();

      const overlay = page.locator("#submitOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      // 1) modal wypełnia szerokość viewportu
      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      // 2) reszta treści strony jest ukryta
      await expect(page.locator("#viewMine")).toBeHidden();

      // 3) stopka nadal widoczna
      await expect(page.locator(".footer")).toBeVisible();

      // 4) przycisk kontaktu w stopce ukryty
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();

      // 5) topbar nadal widoczny
      await expect(page.locator(".topbar")).toBeVisible();

      // 6) zamknięcie modala przywraca normalny widok + przycisk kontaktu
      await page.locator("#btnSubmitCancel").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#viewMine")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      await deleteGameDirect(page, gameId);
    }
  });
});
