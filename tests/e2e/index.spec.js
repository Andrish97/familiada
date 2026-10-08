const { test, expect } = require("@playwright/test");
const {
  instrumentPage,
  loginAsGuest,
  loginAsTestUser,
  testAccountUsername,
} = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

const INDEX_URL = "https://www.familiada.online/";

test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page, context }) => {
  await serveBranchCode(context, { pages: ["index"] });
  await context.addInitScript(() => localStorage.setItem("uiLang", "pl"));
  instrumentPage(page);
});

async function openIndex(page, suffix = "") {
  await page.goto(INDEX_URL + suffix, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).not.toHaveClass(/page-loading/, { timeout: 15_000 });
  await expect(page.locator(".hero-card h1")).toBeVisible();
}

async function dumpIndexDiagnostics(page) {
  console.log("[e2e-diag] index current URL:", page.url());
  console.log("[e2e-diag] index visible overlays:", await page.locator(
    '.overlay:visible, .imgv-overlay.is-open, [role="dialog"]:visible'
  ).evaluateAll((nodes) => nodes.map((node) => ({ id: node.id, className: node.className }))));
  console.log("[e2e-diag] index body:", (await page.locator("body").innerText()).slice(0, 800));
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    await dumpIndexDiagnostics(page).catch((error) => {
      console.log("[e2e-diag] index dump failed:", error.message);
    });
  }
});

test("anonim: pełny render, kontrakt statystyk i bezpieczna obsługa parametrów", async ({ page }) => {
  await openIndex(page, "?lang=pl&next=https%3A%2F%2Fevil.example");
  await expect(page).toHaveTitle("Familiada Online — system do prowadzenia gry na żywo");
  await expect(page.locator(".hero-card h1")).toContainText("Darmowa Familiada Online");
  await expect(page).toHaveURL(/next=https%3A%2F%2Fevil\.example/);

  const stats = await page.evaluate(async () => {
    const { data, error } = await window.__sbClient.rpc("get_app_rating_stats");
    return { data, error: error && { message: error.message, code: error.code } };
  });
  expect(stats.error, JSON.stringify(stats)).toBeNull();
  expect(Array.isArray(stats.data)).toBe(true);
  expect(stats.data).toHaveLength(1);
  expect(Number(stats.data[0].avg_stars)).toBeGreaterThanOrEqual(0);
  expect(Number(stats.data[0].avg_stars)).toBeLessThanOrEqual(5);
  expect(Number(stats.data[0].total_count)).toBeGreaterThanOrEqual(0);

  const realError = await page.evaluate(async () => {
    const { error } = await window.__sbClient.rpc("get_app_rating_stats", { unexpected: true });
    return error && { message: error.message, code: error.code };
  });
  expect(realError?.message).toBeTruthy();
  console.log("[e2e-diag] expected real RPC error:", JSON.stringify(realError));

  for (const selector of ["#ctaStart", 'a[href*="marketplace"]', 'a[href*="connect-device"]']) {
    const href = await page.locator(selector).first().getAttribute("href");
    const url = new URL(href, page.url());
    expect(url.origin).toBe("https://www.familiada.online");
    expect(url.hostname).not.toBe("evil.example");
  }
});

test("wolny backend nie blokuje strony, a wielokrotne kliknięcie nie duplikuje dialogu", async ({ page }) => {
  await page.route("**/auth/v1/user", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.continue();
  });
  await page.route("**/rest/v1/rpc/get_app_rating_stats", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.continue();
  });

  const started = Date.now();
  await openIndex(page);
  expect(Date.now() - started).toBeLessThan(1_100);
  await page.locator(".tile-shot").first().evaluate((tile) => {
    tile.click();
    tile.click();
  });
  await expect(page.locator(".imgv-overlay.is-open")).toHaveCount(1);
  await expect(page.locator(".imgv-panel")).toHaveCount(1);
});

test("PL/EN/UK: cały zależny interfejs, tytuły, obrazy i linki zmieniają język", async ({ page }) => {
  await openIndex(page);
  const cases = [
    { lang: "en", title: /live game hosting system/, heading: /Free Familiada Online/, image: "/assets/img/en/", query: "en" },
    { lang: "uk", title: /система для проведення гри наживо/, heading: /Безкоштовна Familiada Online/, image: "/assets/img/uk/", query: "uk" },
    { lang: "pl", title: /system do prowadzenia gry na żywo/, heading: /Darmowa Familiada Online/, image: "/assets/img/pl/", query: null },
  ];

  for (const item of cases) {
    await page.locator(".lang-btn").click();
    await page.locator(`.lang-option[data-lang="${item.lang}"]`).click();
    await expect(page).toHaveTitle(item.title);
    await expect(page.locator(".hero-card h1")).toContainText(item.heading);
    await expect(page.locator(".shot-img").first()).toHaveAttribute("src", new RegExp(item.image));
    const href = new URL(await page.locator("#ctaStart").getAttribute("href"));
    expect(href.searchParams.get("lang")).toBe(item.query);
  }
});

test("klawiatura, focus, historia i mobilny viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openIndex(page);

  const shot = page.locator(".tile-shot").first();
  await shot.focus();
  await expect(shot).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".imgv-overlay")).toHaveClass(/is-open/);
  await expect(page.locator("#imgvClose")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".imgv-overlay")).not.toHaveClass(/is-open/);
  await expect(shot).toBeFocused();

  await page.locator(".pipeline-node").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#section-about")).toBeInViewport();

  await page.locator('a[href*="marketplace"]').first().click();
  await expect(page).toHaveURL(/\/marketplace/);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/^https:\/\/www\.familiada\.online\/(?:\?.*)?$/);
  await expect(page.locator(".hero-card h1")).toBeVisible();
});

test("odnośniki prowadzą do właściwych sekcji, a powroty nazywają cel Strona główna", async ({ page }) => {
  await openIndex(page);
  const destinations = [
    { selector: "#ctaStart", url: /\/login(?:\?|$)/ },
    { selector: '.hero-cta a[href*="marketplace"]', url: /\/marketplace(?:\?|$)/ },
    { selector: '.hero-cta a[href*="connect-device"]', url: /\/connect-device(?:\?|$)/ },
    { selector: '.footer a[href*="privacy"]', url: /\/privacy(?:\?|$)/ },
  ];
  for (const destination of destinations) {
    await page.locator(destination.selector).click();
    await expect(page).toHaveURL(destination.url);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".hero-card h1")).toBeVisible();
  }

  await page.locator("#ctaStart").click();
  await expect(page.locator("#btnBackHome")).toHaveText(/Strona główna/);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.locator('.hero-cta a[href*="marketplace"]').click();
  await expect(page.locator("#btnGoGames")).toContainText("Wróć do: Strona główna");
});

test("gość pozostaje na stronie głównej i jest w całości sprzątany", async ({ page, context }) => {
  test.setTimeout(90_000);
  await loginAsGuest(page, context);
  try {
    await openIndex(page);
    await expect(page).toHaveURL(/^https:\/\/www\.familiada\.online\/(?:\?.*)?$/);
    const user = await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user);
    expect(user?.is_anonymous || user?.user_metadata?.is_guest).toBeTruthy();
  } finally {
    if (!page.isClosed()) {
      const cleanup = await page.evaluate(async () => {
        const { data, error } = await window.__sbClient.rpc("guest_discard_current");
        await window.__sbClient.auth.signOut();
        return { data, error: error?.message || null };
      });
      expect(cleanup.error, JSON.stringify(cleanup)).toBeNull();
    }
  }
});

test("zalogowany użytkownik trafia do biblioteki gier", async ({ page, context }) => {
  await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto(INDEX_URL, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/games(?:\?|$)/, { timeout: 20_000 });
});

test("fałszywa lub nieprawidłowa sesja nie daje dostępu", async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem("sb-api-auth-token", JSON.stringify({
      access_token: "invalid", refresh_token: "invalid", expires_at: 4_102_444_800,
      user: { id: "00000000-0000-0000-0000-000000000000", is_anonymous: false },
    }));
  });
  await openIndex(page);
  await page.waitForTimeout(1_500);
  await expect(page).toHaveURL(/^https:\/\/www\.familiada\.online\/(?:\?.*)?$/);
});
