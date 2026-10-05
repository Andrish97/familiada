const { test, expect } = require("@playwright/test");
const ua = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 TV Safari/537.36";
test.use({ userAgent: ua, viewport: { width: 1920, height: 1080 } });
test("TV: każda strona kieruje do samego kodu, bez logowania", async ({ page }, testInfo) => {
  for (const path of ["/", "/login/", "/games/", "/control/", "/control2/", "/host2/?id=x&key=y", "/buzzer/?id=x&key=y"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#tvCode")).toBeVisible();
    await expect(page.locator("#tvCode")).toBeFocused();
    expect(new URL(page.url()).pathname).toBe("/connect-device/");
    await expect(page.locator("button")).toHaveCount(1);
    await expect(page.locator(".tv-logo")).toBeVisible();
    await expect.poll(() => page.locator(".tv-logo").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator("#tvConnect")).toHaveCSS("color", "rgb(255, 234, 166)");
    if (path === "/") await testInfo.attach("tv-connect-screen", { body: await page.screenshot(), contentType: "image/png" });
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#tvConnect")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("#tvCode")).toBeFocused();
  }
});
