const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("url");
const path = require("path");
const { loginAsPooledTestUser, loginAsGuest } = require("./helpers/login");

// Exercise actual production navigation without replacing routes or files.
for (const path of ["/connect", "/connect/"]) {
  test(`anonim: powrót z ${path} ma strzałkę i prowadzi na stronę główną`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.locator(".topbar.topbar-ready")).toBeAttached();
    const back = page.locator("#btnBack");
    await expect(back.locator("svg.ico-arrow-left")).toBeVisible();
    await back.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  });
}

test("instrukcja: powrót zachowuje ścieżkę, parametry i fragment", async ({ page }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  const target = "/connect/?lang=en#connect";
  await page.goto(`/manual/?lang=en&ret=${encodeURIComponent(target)}`, { waitUntil: "networkidle" });
  await expect(page.locator(".topbar.topbar-ready")).toBeAttached();
  await page.locator("#btnBack").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/connect/");
  expect(new URL(page.url()).searchParams.get("lang")).toBe("en");
  expect(new URL(page.url()).hash).toBe("#connect");
});

test("zalogowany: Bazy → Subskrypcje → Bazy oraz powrót do gier", async ({ page }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  await page.goto("/bases/", { waitUntil: "networkidle" });
  await page.locator("#btnGoAlt").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/subscriptions/");
  expect(new URL(page.url()).searchParams.get("ret")).toBe("/bases/");
  // Adres zmienia się przed wykonaniem modułu strony — „Wstecz” podpina
  // initPage dopiero po auth (topbar-ready).
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".topbar.topbar-ready")).toBeAttached();
  await page.locator("#btnBackToGames").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/bases/");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".topbar.topbar-ready")).toBeAttached();
  await page.locator("#btnBack").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/games/");
});

test("zalogowany: subskrypcje wracają do gier bez doklejania folderu", async ({ page }, testInfo) => {
  await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);
  await page.goto("/subscriptions/", { waitUntil: "networkidle" });
  await expect(page.locator(".topbar.topbar-ready")).toBeAttached();
  await page.locator("#btnBackToGames").click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/games/");
});

// ---------------------------------------------------------------------------
// Sześć map (docs/nawigacja-mapa-plan.md, sekcja 3): rola × urządzenie.
// Dane z PAGES — ten sam wpis czyta initPage(), więc test nie ma własnej
// listy przycisków. Dla każdej mapy: przyciski niedostępne dla roli /
// telefonu są schowane, pozostałe (poza custom — te sprawdzają coś przed
// przejściem i wymagają wybranej gry) przechodzą na cel z poprawnym ?ret=,
// a „Wstecz” na celu wraca na stronę wyjściową.
// Konta: gość z loginAsGuest, konto z puli test1–test8 (loginAsPooledTestUser).
// ---------------------------------------------------------------------------

// Klik programowy: przycisk topbaru bywa w „Więcej” (komputer) albo w ☰
// (telefon), a sam układ topbaru testują inne spece.
const clickEl = (locator) => locator.evaluate((el) => el.click());

// Id przycisku „Wstecz” na stronie docelowej (nie każda strona ma #btnBack).
const BACK_ID = {
  marketplace: "btnGoGames",
  subscriptions: "btnBackToGames",
  account: "backToGames",
};

// Dynamiczny import przez Function: transformacja Playwrighta nie zamieni go na require.
const loadNav = (file) => new Function("p", "return import(p)")(pathToFileURL(path.resolve(__dirname, file)).href);

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
};

const MAP_LIST = [
  { id: "A1", role: "anon", phone: false },
  { id: "A2", role: "anon", phone: true },
  { id: "B1", role: "guest", phone: false },
  { id: "B2", role: "guest", phone: true },
  { id: "C1", role: "user", phone: false },
  { id: "C2", role: "user", phone: true },
];

for (const map of MAP_LIST) {
  test(`mapa ${map.id} (${map.role}, ${map.phone ? "390×844" : "1280×800"}): przyciski, cele i „Wstecz”`, async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const { PAGES, buttonVisible, pageRoles } = await loadNav("../../web/shared/js/core/nav-map.js");
    await page.setViewportSize(map.phone ? VIEWPORTS.phone : VIEWPORTS.desktop);
    const topbarReady = () => expect(page.locator(".topbar.topbar-ready")).toBeAttached();
    const pathOf = () => new URL(page.url()).pathname;

    if (map.role === "anon") {
      // Niezalogowany nie ma przycisków w PAGES.buttons — sprawdzamy ↩ stron
      // publicznych: parentAnon z mapy (landing).
      const publicPages = Object.entries(PAGES).filter(([id, p]) => p.parentAnon && p.access === "public" && pageRoles(id).includes("anon"));
      expect(publicPages.length).toBeGreaterThan(0);
      for (const [id, p] of publicPages) {
        await page.goto(p.path, { waitUntil: "networkidle" });
        await topbarReady();
        await clickEl(page.locator(`#${BACK_ID[id] || "btnBack"}`));
        await expect.poll(pathOf, { message: `↩ z ${id}` }).toBe(PAGES[p.parentAnon].path);
      }
      return;
    }

    if (map.role === "guest") await loginAsGuest(page, page.context());
    else await loginAsPooledTestUser(page, page.context(), testInfo.parallelIndex);

    let clicked = 0;
    for (const [id, p] of Object.entries(PAGES)) {
      if (!p.buttons || !pageRoles(id).includes(map.role)) continue;
      // Strony z device wide / noPhone na telefonie to nakładka; strony z id w adresie
      // (ustawienia gry) wymagają konkretnej gry — poza tym testem.
      if (map.phone && (p.device === "wide" || p.device === "noPhone")) continue;
      if (p.state?.includes("id")) continue;

      for (const [bid, spec] of Object.entries(p.buttons)) {
        const visible = buttonVisible(id, spec, map.role, map.phone);
        await page.goto(p.path, { waitUntil: "networkidle" });
        await topbarReady();
        const btn = page.locator(`#${bid}`);
        if (!visible) {
          await expect(btn, `${id}#${bid} ma być schowany`).toHaveAttribute("data-nav-hidden", "true");
          await expect(btn).toBeHidden();
          continue;
        }
        await expect(btn, `${id}#${bid} ma być dostępny`).not.toHaveAttribute("data-nav-hidden", "true");
        if (spec.custom) continue; // własny cel i sprawdzenia strony — e2e danej strony
        const here = new URL(page.url());
        const origin = `${here.pathname}${here.search}`;
        await clickEl(btn);
        await expect.poll(pathOf, { message: `${id}#${bid} → ${spec.to}` }).toBe(PAGES[spec.to].path);
        const from = PAGES[spec.to].from;
        const wantsRet = from === "*" || (Array.isArray(from) && from.includes(id));
        const ret = new URL(page.url()).searchParams.get("ret");
        expect(ret, `${id}#${bid}: ret`).toBe(wantsRet ? origin : null);
        await page.waitForLoadState("domcontentloaded");
        await topbarReady();
        await clickEl(page.locator(`#${BACK_ID[spec.to] || "btnBack"}`));
        const back = wantsRet ? here.pathname : PAGES[PAGES[spec.to].parent].path;
        await expect.poll(pathOf, { message: `↩ z ${spec.to}` }).toBe(back);
        clicked++;
      }
    }
    expect(clicked).toBeGreaterThan(0);
  });
}
