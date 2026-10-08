const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");

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

test("privacy: parametr ret dopuszcza tylko bezpieczny powrót w obrębie serwisu", async ({ page }) => {
  await page.goto(`${ORIGIN}/privacy?lang=en&ret=${encodeURIComponent("https://example.com/phishing")}`);
  await page.locator("#btnBack").click();
  await page.waitForURL((url) => url.origin === ORIGIN && !url.pathname.startsWith("/privacy"));
  expect(new URL(page.url()).origin).toBe(ORIGIN);

  const safeBack = "/manual/?modal=control&tab=polls#polls";
  await page.goto(`${ORIGIN}/privacy?lang=uk&ret=${encodeURIComponent(safeBack)}`);
  await page.locator("#btnBack").click();
  await page.waitForURL(/\/manual/);
  const returned = new URL(page.url());
  expect(returned.origin).toBe(ORIGIN);
  expect(returned.searchParams.get("modal")).toBe("control");
  expect(returned.searchParams.get("tab")).toBe("polls");
  expect(returned.searchParams.get("lang")).toBe("uk");
  expect(returned.hash).toBe("#polls");
});

test("manual modal: działa bez sesji, tłumaczy UI i ma semantykę zakładek", async ({ page }) => {
  await page.goto(`${ORIGIN}/manual?modal=control&lang=en`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).not.toHaveClass(/page-loading/);
  await expect(page).toHaveURL(/\/manual/);
  await expect(page.locator(".simple-tabs")).toHaveCount(0);

  const tabs = page.locator('.modal-tabs [role="tab"]');
  await expect(tabs).toHaveCount(10);
  await expect(page.locator('.modal-tabs[role="tablist"]')).toHaveAttribute("aria-label", "User guide tabs");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('#tab-general[role="tabpanel"]')).toBeVisible();

  await tabs.first().press("ArrowRight");
  await expect(page.locator('#tab-edit')).toBeVisible();
  await expect(page).toHaveURL(/#edit$/);
});

test("manual: Back/Forward synchronizuje hash, aktywną zakładkę i treść", async ({ page }) => {
  await page.goto(`${ORIGIN}/manual?modal=control&lang=pl`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-tab="edit"][role="tab"]').click();
  await expect(page.locator("#tab-edit")).toBeVisible();
  await page.locator('[data-tab="polls"][role="tab"]').click();
  await expect(page.locator("#tab-polls")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#edit$/);
  await expect(page.locator('[data-tab="edit"][role="tab"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#tab-edit")).toBeVisible();
  await expect(page.locator("#tab-polls")).toBeHidden();

  await page.goForward();
  await expect(page).toHaveURL(/#polls$/);
  await expect(page.locator("#tab-polls")).toBeVisible();
});

test("manual: treść i etykieta zakładek istnieją w PL/EN/UK", async ({ page }) => {
  const cases = [
    { lang: "pl", label: "Zakładki wskazówek", title: "Wskazówki dla użytkownika" },
    { lang: "en", label: "User guide tabs", title: "User guide" },
    { lang: "uk", label: "Вкладки підказок", title: "Підказки для користувача" },
  ];

  for (const item of cases) {
    await page.goto(`${ORIGIN}/manual?modal=control&lang=${item.lang}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toHaveText(item.title);
    await expect(page.locator('.modal-tabs[role="tablist"]')).toHaveAttribute("aria-label", item.label);
    await expect(page.locator("#tab-general .m-p").first()).not.toBeEmpty();
  }
});
