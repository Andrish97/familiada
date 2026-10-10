const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser } = require("./helpers/login");

const ORIGIN = "https://www.familiada.online";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  await serveBranchCode(context, { pages: ["privacy", "manual"] });
});

test("privacy: treść, tytuł i opis SEO przełączają się w PL/EN/UK", async ({ page }) => {
  const cases = [
    { lang: "pl", heading: "Polityka Prywatności", description: "Polityka prywatności" },
    { lang: "en", heading: "Privacy Policy", description: "privacy policy" },
    { lang: "uk", heading: "Політика конфіденційності", description: "Політика конфіденційності" },
  ];

  for (const item of cases) {
    await page.goto(`${ORIGIN}/privacy?lang=${item.lang}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).not.toHaveClass(/page-loading/);
    await expect(page.locator("h1")).toContainText(item.heading);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", new RegExp(item.description, "i"));
    await expect(page.locator(".m-doc h2")).toHaveCount(9);
  }
});

test("privacy: parametr ret dopuszcza tylko bezpieczny powrót w obrębie serwisu", async ({ page, context }) => {
  // Powrót prowadzi do instrukcji, która wymaga sesji (bez niej: logowanie).
  await loginAsTestUser(page, context);
  await page.goto(`${ORIGIN}/privacy?lang=en&ret=${encodeURIComponent("https://example.com/phishing")}`);
  await expect(page.locator(".topbar.topbar-ready")).toBeAttached(); // „Wstecz” podpina initPage
  await page.locator("#btnBack").click();
  await page.waitForURL((url) => url.origin === ORIGIN && !url.pathname.startsWith("/privacy"));
  expect(new URL(page.url()).origin).toBe(ORIGIN);

  const safeBack = "/manual/?tab=polls";
  await page.goto(`${ORIGIN}/privacy?lang=uk&ret=${encodeURIComponent(safeBack)}`);
  await expect(page.locator(".topbar.topbar-ready")).toBeAttached();
  await page.locator("#btnBack").click();
  await page.waitForURL(/\/manual/);
  const returned = new URL(page.url());
  expect(returned.origin).toBe(ORIGIN);
  expect(returned.searchParams.get("tab")).toBe("polls");
  expect(returned.searchParams.get("lang")).toBe("uk");
  await expect(page.locator("#tab-polls")).toBeVisible();
});

test("manual: tłumaczy UI i ma semantykę zakładek (zwykła strona, bez ?modal=)", async ({ page, context }) => {
  await loginAsTestUser(page, context);
  await page.goto(`${ORIGIN}/manual?lang=en`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).not.toHaveClass(/page-loading/);
  await expect(page).toHaveURL(/\/manual/);
  await expect(page.locator(".modal-tabs")).toHaveCount(0);
  await expect(page.locator(".topbar")).toBeVisible();

  const tabs = page.locator('.simple-tabs [role="tab"]');
  await expect(tabs).toHaveCount(10);
  await expect(page.locator('.simple-tabs[role="tablist"]')).toHaveAttribute("aria-label", "User guide tabs");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('#tab-general[role="tabpanel"]')).toBeVisible();

  await tabs.first().press("ArrowRight");
  await expect(page.locator('#tab-edit')).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=edit(?:&|$)/);
});

test("manual: karta w ?tab= (replaceState): odświeżenie ją zachowuje, nieznana to ogólny opis", async ({ page, context }) => {
  await loginAsTestUser(page, context);
  await page.goto(`${ORIGIN}/manual?lang=pl`, { waitUntil: "domcontentloaded" });
  const historyBefore = await page.evaluate(() => history.length);
  await page.locator('[data-tab="edit"][role="tab"]').click();
  await page.locator('[data-tab="polls"][role="tab"]').click();
  await expect(page.locator("#tab-polls")).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=polls(?:&|$)/);
  expect(await page.evaluate(() => history.length)).toBe(historyBefore); // zmiana karty nie dokłada wpisów historii

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#tab-polls")).toBeVisible();
  await expect(page.locator('[data-tab="polls"][role="tab"]')).toHaveAttribute("aria-selected", "true");

  await page.goto(`${ORIGIN}/manual?lang=pl&tab=nieznana`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#tab-general")).toBeVisible();
});

test("manual: treść i etykieta zakładek istnieją w PL/EN/UK", async ({ page, context }) => {
  await loginAsTestUser(page, context);
  const cases = [
    { lang: "pl", label: "Zakładki wskazówek", title: "Wskazówki dla użytkownika" },
    { lang: "en", label: "User guide tabs", title: "User guide" },
    { lang: "uk", label: "Вкладки підказок", title: "Підказки для користувача" },
  ];

  for (const item of cases) {
    await page.goto(`${ORIGIN}/manual?lang=${item.lang}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText(item.title);
    await expect(page.locator('.simple-tabs[role="tablist"]')).toHaveAttribute("aria-label", item.label);
    await expect(page.locator("#tab-general .m-p").first()).not.toBeEmpty();
  }
});

test("manual: Host logo jest opisane w Control i Ustawieniach gry w PL/EN/UK", async ({ page, context }, testInfo) => {
  await loginAsTestUser(page, context);
  const cases = [
    { lang: "pl", control: "Logo prowadzącego", settings: "Przełącznik Logo prowadzącego", source: "Źródło" },
    { lang: "en", control: "Host logo", settings: "The Host logo selector", source: "Source" },
    { lang: "uk", control: "Логотип ведучого", settings: "Перемикач Логотип ведучого", source: "Джерело" },
  ];

  for (const item of cases) {
    await page.goto(`${ORIGIN}/manual?lang=${item.lang}`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-tab="control"][role="tab"]').click();
    const control = page.locator("#tab-control .m-doc");
    await expect(control).toContainText(item.control);
    await expect(control).toContainText(item.source);
    await expect(control.locator(".m-ul .m-strong").filter({ hasText: item.control })).toBeVisible();
    if (item.lang === "pl") await page.screenshot({ path: testInfo.outputPath("shot-manual-control-pl.png"), fullPage: true });

    await page.locator('[data-tab="gameSettings"][role="tab"]').click();
    const settings = page.locator("#tab-gameSettings .m-doc");
    await expect(settings).toContainText(item.settings);
    await expect(settings).toContainText(item.source);
    await expect(settings.locator(".m-strong").filter({ hasText: item.control })).toBeVisible();
    await expect(settings.locator(".m-p").filter({ hasText: /preview|Podgląd|перегляд/i }).first()).toBeVisible();
    if (item.lang === "pl") await page.screenshot({ path: testInfo.outputPath("shot-manual-settings-pl.png"), fullPage: true });
  }
});
