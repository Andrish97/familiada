const { test, expect } = require("./helpers/production-test");
const { serveBranchCode, serveBranchLoginHtml } = require("./helpers/branch-code");
const { loginAsTestUser } = require("./helpers/login");
const { touchSwipe } = require("./helpers/touch-swipe");

const ORIGIN = "https://www.familiada.online";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["privacy", "manual"] });
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

  const safeBack = "/manual/?ch=15#s-15-4";
  await page.goto(`${ORIGIN}/privacy?lang=uk&ret=${encodeURIComponent(safeBack)}`);
  await expect(page.locator(".topbar.topbar-ready")).toBeAttached();
  await page.locator("#btnBack").click();
  await page.waitForURL(/\/manual/);
  const returned = new URL(page.url());
  expect(returned.origin).toBe(ORIGIN);
  expect(returned.searchParams.get("ch")).toBe("15");
  expect(returned.searchParams.get("lang")).toBe("uk");
  await expect(page.locator("#s-15-4")).toBeVisible();
});

test("manual: spis treści (części → rozdziały) w PL/EN/UK, bez ?modal=", async ({ page, context }) => {
  await loginAsTestUser(page, context);
  const cases = [
    { lang: "pl", title: "Wskazówki dla użytkownika", part: "Część I", toc: "Spis treści wskazówek" },
    { lang: "en", title: "Help for users", part: "Part I", toc: "Help contents" },
    { lang: "uk", title: "Підказки для користувача", part: "Частина I", toc: "Зміст підказок" },
  ];
  for (const item of cases) {
    await page.goto(`${ORIGIN}/manual/?lang=${item.lang}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).not.toHaveClass(/page-loading/);
    await expect(page.locator(".modal-tabs")).toHaveCount(0);
    await expect(page.locator(".m-article h1")).toHaveText(item.title);
    await expect(page.locator(".m-part-card")).toHaveCount(3);
    await expect(page.locator(".m-part-title").first()).toContainText(item.part);
    await expect(page.locator("#manualToc")).toHaveAttribute("aria-label", item.toc);
    await expect(page.locator("#manualToc .m-side-item:not(.m-side-sub)")).toHaveCount(19);
  }
});

test("manual: rozdział w ?ch= (replaceState), podrozdział w #s-…, odnośnik → i poprzedni/następny", async ({ page, context }, testInfo) => {
  await loginAsTestUser(page, context);
  await page.goto(`${ORIGIN}/manual/?lang=pl`, { waitUntil: "domcontentloaded" });
  const historyBefore = await page.evaluate(() => history.length);

  await page.locator('#manualToc a.m-side-item[data-ch="6"]').first().click();
  await expect(page.locator(".m-article h1")).toContainText("Moje gry");
  await expect(page).toHaveURL(/[?&]ch=6(?:&|#|$)/);
  await expect(page.locator("#manualToc .m-side-sub")).toHaveCount(7);
  await expect(page.locator(".m-doc .m-control").first()).toBeVisible();
  await expect(page.locator(".m-doc .m-control svg.ico").first()).toBeVisible();

  await page.locator('.m-doc a.m-ref[href="?ch=7#s-7-1"]').first().click();
  await expect(page.locator(".m-article h1")).toContainText("Tworzenie i edycja gry");
  await expect(page).toHaveURL(/[?&]ch=7&from=6\.1#s-7-1$/);
  await expect(page.locator("#s-7-1")).toBeInViewport();
  await expect(page.locator(".m-return")).toBeVisible();

  await page.locator(".m-pager-link.next").click();
  await expect(page).toHaveURL(/[?&]ch=8(?:&|#|$)/);
  expect(await page.evaluate(() => history.length)).toBe(historyBefore);
  if (testInfo) await page.screenshot({ path: testInfo.outputPath("shot-manual-chapter-pl.png") });

  await page.goto(`${ORIGIN}/manual/?lang=pl&ch=16#s-16-5-2`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#s-16-5-2")).toBeInViewport();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".m-article h1")).toContainText("Ustawienia rozgrywki");

  await page.goto(`${ORIGIN}/manual/?lang=pl&ch=99`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".m-part-card")).toHaveCount(3);
  await expect(page).not.toHaveURL(/[?&]ch=/);
});

test("manual: przycisk pomocy strony otwiera jej rozdział, Wstecz wraca", async ({ page, context }) => {
  await serveBranchCode(context, { pages: ["privacy", "manual", "bases"] });
  await loginAsTestUser(page, context);
  await page.goto(`${ORIGIN}/bases/?lang=pl`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".topbar.topbar-ready")).toBeAttached();
  await page.locator("#btnManual").click();
  await page.waitForURL(/\/manual\/\?.*ch=9/);
  await expect(page.locator(".m-article h1")).toContainText("Bazy pytań");
  await page.locator("#btnBack").click();
  await page.waitForURL(/\/bases\//);
});

test("manual: telefon — spis treści pod przyciskiem", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsTestUser(page, context);
  await page.goto(`${ORIGIN}/manual/?lang=pl&ch=17`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#manualToc")).toBeHidden();
  await page.locator("#manualTocToggle").click();
  await expect(page.locator("#manualToc")).toBeVisible();
  await page.locator('#manualToc a.m-side-item[data-ch="15"]').first().click();
  await expect(page.locator(".m-article h1")).toContainText("Ankiety");
  await expect(page.locator("#manualToc")).toBeHidden();
});

test("manual: wyszukiwanie — wyniki na żywo, wybór otwiera podrozdział z zaznaczeniem", async ({ page }) => {
  await page.goto(`${ORIGIN}/manual/?lang=pl`, { waitUntil: "domcontentloaded" });
  const input = page.locator("#manualSearch .searchText");
  await input.fill("kradzież");
  await expect(page.locator("#manualSearch .m-search-hit").first()).toBeVisible();
  await input.press("Enter");
  await expect(page).toHaveURL(/[?&]ch=\d+#s-[\d-]+$/);
  await expect(page.locator(".m-doc mark.m-hit").first()).toBeInViewport();

  await input.fill("qqzzxx");
  await expect(page.locator("#manualSearch .m-search-empty")).toBeVisible();
  await page.locator("#manualSearch .searchClear").click();
  await expect(page.locator("#manualSearch .m-search-results")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#manualSearchToggle").click();
  await expect(input).toBeFocused();
  await input.fill("mnożnik");
  await page.locator("#manualSearch .m-search-hit").first().click();
  await expect(page.locator("#manualToc")).toBeHidden();
  await expect(page.locator(".m-doc mark.m-hit").first()).toBeInViewport();
});

test("manual: nazwa strony prowadzi do serwisu, „←” wraca do tego samego podrozdziału", async ({ page, context }) => {
  await serveBranchCode(context, { pages: ["privacy", "manual", "bases"] });
  await loginAsTestUser(page, context);
  await page.goto(`${ORIGIN}/manual/?lang=pl&ch=12#s-12-2`, { waitUntil: "domcontentloaded" });
  await page.locator('#s-12-2 ~ * a.m-go[data-page="bases"]').first().click();
  await page.waitForURL(/\/bases\/\?ret=/);
  await expect(page.locator(".topbar.topbar-ready")).toBeAttached();
  await expect(page.locator("#btnBack")).toContainText("Wskazówki");
  await page.locator("#btnBack").click();
  await page.waitForURL(/\/manual\/\?ch=12#s-12-2$/);
  await expect(page.locator("#s-12-2")).toBeInViewport();
});

test("manual: przycisk na logowaniu otwiera rozdział o koncie, „←” wraca na logowanie", async ({ page, context }) => {
  await serveBranchCode(context, { pages: ["privacy", "manual", "login"] });
  // HTML logowania zwykle idzie z Workera (Turnstile); tu bez logowania — bierzemy go z brancha.
  if (process.env.TEST_BRANCH_CODE !== "0") await context.route(/^https:\/\/www\.familiada\.online\/login\/?(?:\?.*)?$/, serveBranchLoginHtml);
  await page.goto(`${ORIGIN}/login/?lang=en`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#btnManual")).toHaveAttribute("href", /^\/manual\/\?ch=5&ret=%2Flogin%2F&lang=en$/);
  await page.locator("#btnManual").click();
  await page.waitForURL(/\/manual\/\?ch=5/);
  await expect(page.locator(".m-article h1")).toBeVisible();
  await page.locator("#btnBack").click();
  await page.waitForURL(/\/login\/\?lang=en$/);
});

test("manual: zrzuty — karuzela widoków (strzałki, kropki) i powiększenie", async ({ page }) => {
  await page.goto(`${ORIGIN}/manual/?lang=pl&ch=17#s-17-3`, { waitUntil: "domcontentloaded" });
  const carousel = page.locator("#s-17-3 ~ .m-carousel").first();
  const dots = carousel.locator(".m-carousel-dot");
  await expect(dots.first()).toBeVisible();
  const n = await dots.count();
  expect(n).toBeGreaterThanOrEqual(3);
  await expect(dots.nth(0)).toHaveClass(/active/);
  await carousel.locator('[data-step="1"]').click();
  await expect(dots.nth(1)).toHaveClass(/active/);
  await dots.nth(n - 1).click();
  await expect(dots.nth(n - 1)).toHaveClass(/active/);
  await expect.poll(() => carousel.locator("img").nth(n - 1).evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await carousel.locator(".m-shot-zoom").nth(n - 1).click();
  await expect(page.locator("#imgvOverlay.is-open .imgv-img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#imgvOverlay")).toBeHidden();
});

test("manual: telefon — przesunięcie palcem zmienia widok karuzeli, nie otwiera podglądu", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  try {
    if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["privacy", "manual"] });
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/manual/?lang=pl&ch=17#s-17-3`, { waitUntil: "domcontentloaded" });
    const carousel = page.locator("#s-17-3 ~ .m-carousel").first();
    const dots = carousel.locator(".m-carousel-dot");
    await carousel.scrollIntoViewIfNeeded();
    await expect(dots.nth(0)).toHaveClass(/active/);
    await touchSwipe(page, carousel.locator(".m-carousel-track"), { dx: -180 });
    await expect(dots.nth(1)).toHaveClass(/active/);
    await touchSwipe(page, carousel.locator(".m-carousel-track"), { dx: 180 });
    await expect(dots.nth(0)).toHaveClass(/active/);
    await expect(page.locator("#imgvOverlay.is-open")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
