const { test, expect } = require("./helpers/production-test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const L = require("./helpers/logo-editor");

const ORIGIN = "https://www.familiada.online";
test.use({ serviceWorkers: "block", viewport: { width: 1400, height: 900 } });

test("Rysunek: × i Delete usuwają zaznaczenie, Cofnij/Ponów odtwarzają je", async ({ page, context }, testInfo) => {
  test.setTimeout(180_000);
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["logos", "manual"] });
  await loginAsTestUser(page, context, { username: testAccountUsername(2) });
  await L.openList(page, { origin: ORIGIN });
  const name = L.uniq("delete-selection");
  let id;
  try {
    id = await L.createNew(page, "Draw", name);
    const count = () => page.evaluate(() => window.__drawFabric.getObjects().length);
    const select = async (indices) => {
      await page.locator("#tSelect").click();
      await page.evaluate(indices => {
        const canvas = window.__drawFabric;
        canvas.discardActiveObject();
        const objects = indices.map(i => canvas.getObjects()[i]);
        canvas.setActiveObject(objects.length === 1 ? objects[0] : new window.fabric.ActiveSelection(objects, { canvas }));
        canvas.requestRenderAll();
      }, indices);
      await expect(page.locator("#cDelete")).toBeVisible();
    };
    const savedObjects = async () => {
      expect(await L.save(page)).toBe("saved");
      return (await L.readLogo(page, id)).payload.source.fabricData.objects;
    };
    await expect(page.locator("#cDelete")).toHaveCount(0);
    await page.keyboard.press("r");
    const b = await L.stage(page);
    for (const x of [0.12, 0.40, 0.68]) {
      await L.drag(page, b.x + b.width * x, b.y + b.height * 0.2, b.x + b.width * (x + 0.14), b.y + b.height * 0.55);
    }
    const original = await savedObjects();
    expect(original).toHaveLength(3);
    await select([0]);
    await expect(page.locator("#cDelete")).toHaveAttribute("title", /Delete.*Fn \+ Backspace/);
    for (const width of [1400, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.mouse.move(0, 0);
      await expect(page.locator("#cDelete")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`shot-delete-selection-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.locator("#cDelete").click();
    expect(await savedObjects()).toHaveLength(2);
    await expect(page.locator("#cDelete")).toHaveCount(0);
    await page.locator("#tUndo").click();
    expect(await savedObjects()).toEqual(original);
    await page.locator("#tRedo").click();
    expect(await savedObjects()).toHaveLength(2);
    await page.keyboard.press("Control+z");
    await expect.poll(count).toBe(3);
    await select([0, 1]);
    await page.locator("#cDelete").click();
    expect(await savedObjects()).toHaveLength(1);
    await page.keyboard.press("Meta+z");
    expect(await savedObjects()).toEqual(original);
    await select([0]);
    await page.locator("#logoName").focus();
    await page.keyboard.press("Delete");
    expect(await count()).toBe(3);
    await page.locator("#logoName").blur();
    await page.keyboard.press("Delete"); // Fn+Backspace on macOS emits Delete.
    expect(await savedObjects()).toHaveLength(2);
    await page.locator("#tUndo").click();
    expect(await savedObjects()).toEqual(original);

    await page.locator("#tText").click();
    const textStage = await L.stage(page);
    await page.mouse.click(textStage.x + textStage.width * 0.4, textStage.y + textStage.height * 0.75);
    await page.keyboard.type("Logo");
    await page.keyboard.press("Backspace");
    expect(await count()).toBe(4); // Editing text must not delete the object.
    await page.keyboard.press("Escape");
    await select([3]);
    const withText = await savedObjects();
    await page.locator("#cDelete").click();
    expect(await savedObjects()).toHaveLength(3);
    await page.locator("#tUndo").click();
    expect(await savedObjects()).toEqual(withText);
    await select([0, 3]); // Mixed shape/text selection still has a delete action.
    await page.locator("#cDelete").click();
    expect(await savedObjects()).toHaveLength(2);
    await page.locator("#tUndo").click();
    expect(await savedObjects()).toEqual(withText);
    await select([0, 1, 2, 3]);
    await page.locator("#cDelete").click();
    expect(await savedObjects()).toHaveLength(0);
    await expect(page.locator("#cDelete")).toHaveCount(0);
    await page.locator("#tUndo").click();
    expect(await savedObjects()).toEqual(withText);
    await page.reload();
    await L.waitEditorReady(page, "Draw");
    expect((await L.readLogo(page, id)).payload.source.fabricData.objects).toEqual(withText);
    await expect(page.locator("#tUndo")).toBeDisabled();
    for (const lang of ["pl", "en", "uk"]) {
      await page.goto(`${ORIGIN}/manual/?tab=logo&lang=${lang}`);
      await expect(page.locator("#tab-logo .m-doc")).toContainText("Fn + Backspace");
      await expect(page.locator("#tab-logo .m-doc")).toContainText("Ctrl + Z");
    }
  } finally {
    if (id) await page.evaluate(async id => {
      const { error } = await window.__sbClient.from("user_logos").delete().eq("id", id);
      if (error) throw new Error(error.message);
    }, id);
  }
});
