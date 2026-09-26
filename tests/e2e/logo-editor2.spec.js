// tests/e2e/logo-editor2.spec.js
//
// Testy przepisywanego edytora logo (logo-editor2.html). Strona jest
// serwowana z BIEŻĄCEGO CHECKOUTU przez lokalny serwer w runnerze
// (helpers/local-site.js), a nie z www.familiada.online -- dzięki temu
// testują kod z gałęzi, na prawdziwym backendzie, bez wdrażania na produkcję.
//
// Konto: test5@ (test9@ zwraca z Supabase "Database error querying schema")
// -- nie odpalać równolegle z control2.spec.js (pula test1..test5).
// Każdy test sprząta swoje logo (prefiks nazwy LE2_PREFIX).

const { test, expect } = require("@playwright/test");
const { startLocalSite, loginToLocalSite } = require("./helpers/local-site");
const { testAccountUsername } = require("./helpers/login");

const USERNAME = testAccountUsername(1);
const LE2_PREFIX = "E2E-LE2-";

test.use({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: "block",
});

let site;
test.beforeAll(async () => { site = await startLocalSite(); });
test.afterAll(async () => { await site?.close(); });

async function openEditorPage(page, context) {
  await loginToLocalSite(page, context, site.origin, { username: USERNAME, startPath: "/logo-editor2" });
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#grid .addCard")).toBeVisible({ timeout: 15000 });
}

async function cleanupLogos(page) {
  await page.evaluate(async (prefix) => {
    const sb = window.__sbClient;
    if (!sb) return;
    await sb.from("user_logos").delete().like("name", `${prefix}%`);
  }, LE2_PREFIX).catch(() => {});
}

async function createLogo(page, { name, type, payload }) {
  return page.evaluate(async ({ name, type, payload }) => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data, error } = await sb.from("user_logos")
      .insert({ user_id: userData.user.id, name, type, payload })
      .select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }, { name, type, payload });
}

async function readLogo(page, id) {
  return page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient.from("user_logos").select("id,name,type,payload").eq("id", id).single();
    if (error) throw new Error(error.message);
    return data;
  }, id);
}

test.afterEach(async ({ page }) => { await cleanupLogos(page); });

test("smoke: lista logo2 ładuje się z lokalnego serwera i zalogowanej sesji", async ({ page, context }) => {
  await openEditorPage(page, context);
  const id = await createLogo(page, {
    name: `${LE2_PREFIX}smoke-${Date.now()}`,
    type: "GLYPH_30x10",
    payload: { layers: [{ color: "main", rows: Array.from({ length: 10 }, () => " ".repeat(30)) }], source: { mode: "TEXT", text: "" } },
  });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(`.logoTile[data-key="${id}"]`)).toBeVisible({ timeout: 10000 });
  const row = await readLogo(page, id);
  expect(row.type).toBe("GLYPH_30x10");
});
