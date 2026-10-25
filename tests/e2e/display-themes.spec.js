const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block", viewport: { width: 1400, height: 900 } });
test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE !== "0") {
    await serveBranchCode(context, { pages: ["control/display"] });
  }
});

test("display themes: switching preserves all six panels; gaps orbit and reduced motion stops them", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/control/display/?preview=1&lang=pl");
  await expect(page.locator("#gameScreen")).toBeVisible();
  // Exercise the real scene API: theme.set snapshots and restores the pixels.
  await page.evaluate(async () => {
    const { createScene } = await import("/control/display/js/scene.js");
    const scene = await createScene();
    window.__themeScene = scene;
    scene.api.big.put(1, 1, "A");
    scene.api.small.topDigits("123");
    scene.api.small.leftDigits("234");
    scene.api.small.rightDigits("345");
    scene.api.small.long1("ALFA");
    scene.api.small.long2("BETA");
    scene.api.color.set("A", "#123456");
    scene.api.indicator.set("ON_B");
    window.__themePixels = scene.api.snapshotAll();
  });
  for (const name of ["modern", "neon", "studio", "gold", "classic", "modern"]) {
    const result = await page.evaluate(name => {
      const { api, themeMgr } = window.__themeScene;
      api.theme.set(name);
      return {
        active: api.theme.getActive(),
        preserved: JSON.stringify(api.snapshotAll()) === JSON.stringify(window.__themePixels),
        controls: themeMgr.getActiveTheme().getControls(),
      };
    }, name);
    expect(result).toEqual({ active: name, preserved: true, controls: { A: false, B: true } });
  }
  const stripes = page.locator(".modern-stripe");
  await expect(stripes).toHaveCount(18);
  const before = await stripes.first().evaluate(el => getComputedStyle(el).strokeDashoffset);
  await expect.poll(() => stripes.first().evaluate(el => getComputedStyle(el).strokeDashoffset)).not.toBe(before);
  // Geometry stays fixed: the dash phase changes, with no scale or opacity pulse.
  await expect(stripes.first()).toHaveCSS("transform", "none");
  await expect(stripes.first()).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(stripes.first()).toHaveCSS("animation-name", "none");
  const stopped = await stripes.first().evaluate(el => getComputedStyle(el).strokeDashoffset);
  await page.waitForTimeout(150);
  await expect(stripes.first()).toHaveCSS("stroke-dashoffset", stopped);
  expect(errors).toEqual([]);
});
