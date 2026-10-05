const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");

const ORIGIN = "https://www.familiada.online";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["404", "maintenance"] });
});

async function mockMaintenanceState(page, state) {
  await page.route("**/maintenance-state.json*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
      body: JSON.stringify(state),
    });
  });
}

test("404: Worker zwraca prawdziwe 404 bez cache i z globalnym CSP", async ({ request }) => {
  const path = `/e2e-brak-${Date.now()}/gleboka/sciezka`;
  const response = await request.get(path);
  expect(response.status()).toBe(404);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const csp = response.headers()["content-security-policy"] || "";
  expect(csp).toContain("script-src");
  expect(csp).toContain("connect-src 'self'");
  expect(await response.text()).toContain('src="/404/js/404.js');
});

test("404: PL/EN/UK, akcje i zasoby mają poprawne adresy", async ({ page }) => {
  const cases = [
    { lang: "pl", title: "Strona nie istnieje" },
    { lang: "en", title: "Page not found" },
    { lang: "uk", title: "Сторінку не знайдено" },
  ];

  for (const item of cases) {
    await page.goto(`${ORIGIN}/404.html?lang=${item.lang}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).not.toHaveClass(/page-loading/);
    await expect(page.locator("#title")).toHaveText(item.title);
    await expect(page.locator('.notfound-actions a[href="/"]')).toBeVisible();
    await expect(page.locator('.notfound-actions a[href="/marketplace"]')).toBeVisible();
    await expect(page.locator('script[src^="/shared/js/core/security-warning.js"]')).toHaveCount(1);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      "content",
      /default-src 'self'/
    );
  }
});

test("maintenance: standardowa treść przełącza się w PL/EN/UK", async ({ page }) => {
  await mockMaintenanceState(page, { enabled: true, mode: "message", useStandardText: true });
  const cases = [
    { lang: "pl", title: "Trwa przerwa techniczna", text: "System jest chwilowo niedostępny" },
    { lang: "en", title: "Technical maintenance in progress", text: "temporarily unavailable" },
    { lang: "uk", title: "Триває технічна перерва", text: "тимчасово недоступна" },
  ];

  for (const item of cases) {
    await page.goto(`${ORIGIN}/maintenance?lang=${item.lang}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).not.toHaveClass(/page-loading/);
    await expect(page.locator("#title")).toHaveText(item.title);
    await expect(page.locator("#description")).toContainText(item.text);
    await expect(page.locator('link[href^="/maintenance/css/maintenance.css"]')).toHaveCount(1);
    await expect(page.locator('script[src^="/maintenance/js/maintenance.js"]')).toHaveCount(1);
  }
});

test("maintenance: brak tłumaczenia własnego komentarza używa istniejącego fallbacku", async ({ page }) => {
  await mockMaintenanceState(page, {
    enabled: true,
    mode: "message",
    useStandardText: false,
    customComments: { pl: "Planowana przerwa — komunikat administratora", en: "", uk: "" },
  });

  await page.goto(`${ORIGIN}/maintenance?lang=en`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#customContent")).toBeVisible();
  await expect(page.locator("#customContent")).toContainText("Planowana przerwa");
  await expect(page.locator("#standardContent")).toBeHidden();
});

test("maintenance: ukraiński countdown i wszystkie znaczniki #timer", async ({ page }) => {
  await mockMaintenanceState(page, {
    enabled: true,
    mode: "countdown",
    returnAt: new Date(Date.now() + 65_000).toISOString(),
    useStandardText: false,
    customComments: { uk: "До запуску #timer. Повтор: #timer." },
  });

  await page.goto(`${ORIGIN}/maintenance?lang=uk`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".countdown-inline")).toHaveCount(2);
  await expect(page.locator(".countdown-inline").first()).toContainText(/1 хвилина|[5-9][0-9] секунд/);
  await expect(page.locator("#customContent")).not.toContainText("секуnda");
});

test("maintenance: wyłączony stan wraca na stronę główną", async ({ page }) => {
  await mockMaintenanceState(page, { enabled: false, mode: "off" });
  await page.goto(`${ORIGIN}/maintenance?lang=en`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.origin === ORIGIN && url.pathname === "/");
});
