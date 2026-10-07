const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["games"] });
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
