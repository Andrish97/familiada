const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["games"] });
  // Gwarantuj kod strony z checkouta nawet gdy worker/cache produkcyjny
  // przechwyciłby adres głównego modułu przed ogólnym routowaniem.
  await context.route("**/games/js/games.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: fs.readFileSync(path.resolve(__dirname, "../../web/games/js/games.js")),
    });
  });
  await context.route("**/rest/v1/app_ratings*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    } else {
      await route.continue();
    }
  });
});

test.describe("system ocen", () => {
  test("modal pojawia się zalogowanemu użytkownikowi bez oceny po 7 dniach", async ({ page, context }) => {
    await loginAsTestUser(page, context, { username: testAccountUsername(2), suppressRating: false });
    await expect(page.locator("#ratingOverlay .rating-modal")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#ratingOverlay .star-btn")).toHaveCount(5);
  });
});
