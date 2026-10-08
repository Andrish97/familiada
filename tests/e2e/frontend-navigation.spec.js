const { test, expect } = require("@playwright/test");
const { loginAsPooledTestUser } = require("./helpers/login");

// Exercise actual production navigation without replacing routes or files.
for (const path of ["/connect-device", "/connect-device/"]) {
  test(`anonim: powrót z ${path} ma strzałkę i prowadzi na stronę główną`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    const back = page.locator("#btnBack");
    await expect(back.locator("svg.ico-arrow-left")).toBeVisible();
    await back.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  });
}

test("instrukcja: powrót zachowuje ścieżkę, parametry i fragment", async ({ page }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const target = "/connect-device/?lang=en#connect";
  await page.goto(`/manual/?lang=en&ret=${encodeURIComponent(target)}`, { waitUntil: "networkidle" });
  await page.locator("#btnBack").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/connect-device/");
  expect(new URL(page.url()).searchParams.get("lang")).toBe("en");
  expect(new URL(page.url()).hash).toBe("#connect");
});

test("zalogowany: Bazy → Subskrypcje → Bazy oraz powrót do gier", async ({ page }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  await page.goto("/bases/?from=games", { waitUntil: "networkidle" });
  await page.locator("#btnGoAlt").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/subscriptions/");
  expect(new URL(page.url()).searchParams.get("ret")).toBe("/bases/?from=games");
  await page.locator("#btnBackToGames").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/bases/");
  await page.locator("#btnBack").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/games/");
});

test("zalogowany: subskrypcje wracają do gier bez doklejania folderu", async ({ page }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  await page.goto("/subscriptions/", { waitUntil: "networkidle" });
  await page.locator("#btnBackToGames").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/games/");
});
