// tests/e2e/logo-editor.spec.js
// Weryfikuje mobilny "sheet" modal (js/core/modal-sheet.js) na
// logo-editor.html -- modal zmiany nazwy (#renameOverlay, dblclick/double-
// tap na kafelku) i modal importu logo (#logoImportOverlay, przycisk
// "Import", js/main.js). Strona nie miała wcześniej pokrycia e2e; ten plik
// na razie ogranicza się do tego nowego zachowania mobilnego (patrz plan
// mobile sheet modals).
//
// UWAGA: modal tworzenia (#createOverlay) jest tu POMINIĘTY -- jego jedyny
// trigger w HTML ("+" kafelek, `.addCard`) ma klasę `hide-mobile`
// (css/base.css: `.hide-mobile { display:none!important }` poniżej
// breakpointu), więc na telefonie nie da się go dziś w ogóle otworzyć
// przez UI. Infrastruktura sheet (enterModalSheet/exitModalSheet, klasa
// modal--sheet) jest mimo to podłączona pod ten modal w kodzie (patrz
// logo-editor/js/main.js) -- do zweryfikowania osobno, czy to jest
// świadomy stan (desktop-only feature) czy przeoczenie warte naprawy poza
// zakresem tego zadania.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");

const BASE_URL = "https://www.familiada.online/logo-editor";

function blankGlyphPayload() {
  return {
    layers: [{ color: "main", rows: Array.from({ length: 10 }, () => " ".repeat(30)) }],
    source: { mode: "TEXT" },
  };
}

async function createLogoDirect(page, name) {
  return await page.evaluate(async ({ name, payload }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: logo, error } = await sb
      .from("user_logos")
      .insert({ user_id: userData.user.id, name, type: "GLYPH_30x10", payload })
      .select("id")
      .single();
    if (error) throw new Error("insert user_logos failed: " + error.message);
    return logo.id;
  }, { name, payload: blankGlyphPayload() });
}

async function deleteLogoDirect(page, logoId) {
  if (!logoId) return;
  await page.evaluate(async (id) => {
    await window.__sbClient.from("user_logos").delete().eq("id", id);
  }, logoId);
}

test.describe("logo-editor: mobile sheet modal (zmiana nazwy/import)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("modal zmiany nazwy logo na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    const name = `E2E-LE-SHEET-RENAME-${Date.now()}`;
    const logoId = await createLogoDirect(page, name);

    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const tile = page.locator("#grid .card", { hasText: name });
      await expect(tile).toBeVisible({ timeout: 15000 });
      await tile.dblclick();

      const overlay = page.locator("#renameOverlay");
      await expect(overlay).toBeVisible({ timeout: 5000 });

      const box = await overlay.locator(".modal").boundingBox();
      expect(box.width).toBeGreaterThan(370);

      await expect(page.locator("#listShell")).toBeHidden();
      await expect(page.locator(".footer")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
      await expect(page.locator(".topbar")).toBeVisible();

      await page.locator("#btnRenameCancel").click();
      await expect(overlay).toBeHidden({ timeout: 5000 });
      await expect(page.locator("#listShell")).toBeVisible();
      await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
    } finally {
      await deleteLogoDirect(page, logoId);
    }
  });

  test("modal importu logo na telefonie zastępuje treść strony (sheet)", async ({ page, context }) => {
    test.setTimeout(60_000);
    await loginAsTestUser(page, context, { username: testAccountUsername(1) });

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await page.locator("#btnImport").click();

    const overlay = page.locator("#logoImportOverlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    const box = await overlay.locator(".modal").boundingBox();
    expect(box.width).toBeGreaterThan(370);

    await expect(page.locator("#listShell")).toBeHidden();
    await expect(page.locator(".footer")).toBeVisible();
    await expect(page.locator(".footer .btn-contact-footer")).toBeHidden();
    await expect(page.locator(".topbar")).toBeVisible();

    // klik w tło nic nie robi na telefonie (wychodzi tylko przez X)
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).toBeVisible();

    await page.locator("#btnLogoImportCancel").click();
    await expect(overlay).toBeHidden({ timeout: 5000 });
    await expect(page.locator("#listShell")).toBeVisible();
    await expect(page.locator(".footer .btn-contact-footer")).toBeVisible();
  });
});
