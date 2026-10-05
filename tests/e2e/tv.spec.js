const { test, expect } = require("@playwright/test");
const ua = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 TV Safari/537.36";
test.use({ userAgent: ua });
test("TV: każda strona kieruje do samego kodu, bez logowania", async ({ page }) => {
  for (const path of ["/", "/login/", "/games/", "/control/", "/control2/", "/host2/?id=x&key=y", "/buzzer/?id=x&key=y"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#tvCode")).toBeVisible();
    await expect(page.locator("#tvCode")).toBeFocused();
    expect(new URL(page.url()).pathname).toBe("/connect-device/");
    await expect(page.locator("button")).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#tvConnect")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#tvCode")).toBeFocused();
  }
});
