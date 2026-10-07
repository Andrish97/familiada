const { test, expect } = require("@playwright/test");
const ua = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 TV Safari/537.36";
test.use({ locale: "pl-PL", userAgent: ua, viewport: { width: 1920, height: 1080 } });
test("TV: każda strona kieruje do samego kodu, bez logowania", async ({ page }, testInfo) => {
  for (const path of ["/", "/login/", "/games/", "/control/", "/control/", "/host/?id=x&key=y", "/buzzer/?id=x&key=y"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#tvCode")).toBeVisible();
    await expect(page.locator("#tvCode")).toBeFocused();
    await expect(page.locator("body")).toHaveCSS("background-image", "none");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(5, 9, 20)");
    await expect(page.locator("#tvCode")).toHaveCSS("outline-width", "0px");
    expect(new URL(page.url()).pathname).toBe("/connect-device/");
    await expect(page.locator("#tvConnectForm button")).toHaveCount(1);
    const brand = page.locator(".tv-topbar .brand");
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText("FAMILIADA");
    await expect(brand).toHaveCSS("color", "rgb(255, 234, 166)");
    const topbar = await page.locator(".tv-topbar").boundingBox();
    expect(topbar.y).toBe(0);
    expect(topbar.width).toBe(1920);
    await expect(page.locator(".tv-logo")).toHaveCount(0);
    await expect(page.locator("#tvConnect")).toHaveClass(/btn gold/);
    await expect(page.locator("#tvConnect")).toHaveCSS("color", "rgb(255, 234, 166)");
    if (path === "/") await testInfo.attach("tv-connect-screen", { body: await page.screenshot(), contentType: "image/png" });
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#tvConnect")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#tvCode")).toBeFocused();
  }
});


test("TV: język zmienia cały formularz i komunikaty, pilot obsługuje menu", async ({ page }) => {
  await page.goto("/connect-device/tv/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#tvCode")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".lang-btn")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('.lang-option[data-lang="pl"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('.lang-option[data-lang="en"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("h1")).toHaveText("Connect display");
  await expect(page.locator("#tvConnect")).toHaveText("Connect");
  await page.locator("#tvCode").fill("12");
  await page.locator("#tvConnect").click();
  await expect(page.locator("#tvMessage")).toContainText("6-digit");
  await page.locator(".lang-btn").click();
  await page.locator('.lang-option[data-lang="uk"]').click();
  await expect(page.locator("h1")).toHaveText("Підключіть дисплей");
  await expect(page.locator("#tvMessage")).toContainText("6-значний");
  await expect(page.locator("#tvCode")).toHaveValue("12");
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Підключіть дисплей");
});


test("TV: pierwszy wybór języka pochodzi z przeglądarki telewizora", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, locale: "en-US", userAgent: ua, viewport: { width: 1920, height: 1080 } });
  try {
    const page = await context.newPage();
    await page.goto("/connect-device/tv/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText("Connect display");
    await expect(page.locator("#tvConnect")).toHaveText("Connect");
  } finally { await context.close(); }
});
