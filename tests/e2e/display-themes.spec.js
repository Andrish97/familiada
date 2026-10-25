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
    // Use the same version as the running page. Importing the bare URL can
    // retrieve a cached module from before deployment and mix dependency graphs.
    const mainScript = [...document.scripts].find(script => new URL(script.src, location.href).pathname === "/control/display/js/main.js");
    if (!mainScript) throw new Error("Missing Display entry module");
    const version = new URL(mainScript.src).search;
    const { createScene } = await import("/control/display/js/scene.js" + version);
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
  for (const name of ["modern", "wings", "radar", "cabinet", "ribbon", "bridge", "classic", "modern"]) {
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
  const stripes = page.locator(".modern-slot");
  await expect(stripes).toHaveCount(4);
  const paths = await stripes.evaluateAll(els => els.map(el => ({ path: el.getAttribute("d"), length: el.getAttribute("pathLength") })));
  expect(paths.every(p => p.path.startsWith("M640 ") && p.length === "3000")).toBe(true);
  const before = await stripes.first().evaluate(el => getComputedStyle(el).strokeDashoffset);
  await expect.poll(() => stripes.first().evaluate(el => getComputedStyle(el).strokeDashoffset)).not.toBe(before);
  // Geometry stays fixed: the dash phase changes, with no scale or opacity pulse.
  await expect(stripes.first()).toHaveCSS("transform", "none");
  await expect(stripes.first()).toHaveCSS("opacity", "1");
  const modernColors = await page.locator('#team stop').evaluateAll(els => els.map(el => el.getAttribute('stop-color')));
  await page.evaluate(() => window.__themeScene.api.color.set("BG", "#abcdef"));
  expect(await page.locator('#team stop').evaluateAll(els => els.map(el => el.getAttribute('stop-color')))).toEqual(modernColors);
  expect(await page.locator('[data-modern-lines]').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.evaluate(() => { const { api } = window.__themeScene; api.theme.set("radar"); api.color.set("A", "#25a56a"); api.indicator.set("ON_A"); });
  await expect(page.locator('.display-theme-indicator.a')).toHaveCSS("color", "rgb(37, 165, 106)");
  expect(await page.locator('#baseSvg text').allTextContents()).not.toContain("GRA");
  await page.evaluate(() => window.__themeScene.api.theme.set("modern"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(stripes.first()).toHaveCSS("animation-name", "none");
  const stopped = await stripes.first().evaluate(el => getComputedStyle(el).strokeDashoffset);
  await page.waitForTimeout(150);
  await expect(stripes.first()).toHaveCSS("stroke-dashoffset", stopped);
  expect(errors).toEqual([]);
});
