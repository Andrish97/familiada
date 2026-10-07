const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["games"] });
  // Serwuj moduły tej strony z checkouta, bo test celuje w kod z brancha.
  await context.route("**/games/js/*.js*", async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/games\//, "");
    const file = path.resolve(__dirname, "../../web/games", pathname.replace(/^js\//, "js/"));
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: fs.readFileSync(file),
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
