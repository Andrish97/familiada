const fs = require("fs");
const path = require("path");
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block" });
test.use({ needs: { standard: 1 } });
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
  test("modal pojawia się zalogowanemu użytkownikowi bez oceny po 7 dniach", async ({ page, context, accounts, loginAs }) => {
    // Konta e2e (E25) mogą być młodsze niż 7 dni, więc odpowiedź
    // /auth/v1/user dostaje datę rejestracji sprzed 30 dni.
    await context.route("**/auth/v1/user", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      const user = await response.json().catch(() => null);
      if (!response.ok() || !user?.id) return route.fulfill({ response });
      user.created_at = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await route.fulfill({ response, json: user });
    });
    await loginAs(page, context, accounts.standard[0], { suppressRating: false });
    await expect(page.locator("#ratingOverlay .rating-modal")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#ratingOverlay .star-btn")).toHaveCount(5);
  });
});
