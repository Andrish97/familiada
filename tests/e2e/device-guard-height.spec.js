// tests/e2e/device-guard-height.spec.js
// Próg wysokości viewportu (decyzja użytkownika 2026-10-22): strony robocze
// w poziomie poniżej 580 px dostają „Obróć urządzenie” (dotykowy tablet, gdy
// pion pomoże) albo „Za małe okno” (komputer, strona 980 px, Wyświetlacz). Guard działa przed logowaniem, więc spec nie potrzebuje kont.
const { test, expect } = require("./helpers/e2e-test");
const { serveBranchCode } = require("./helpers/branch-code");

const SITE = "https://www.familiada.online";
const branch = process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0";
const TABLET = { viewport: { width: 1200, height: 560 }, screen: { width: 1280, height: 800 }, isMobile: true, hasTouch: true, serviceWorkers: "block" };

async function newContext(browser, options) {
  const context = await browser.newContext({ serviceWorkers: "block", ...options });
  if (branch) await serveBranchCode(context, { pages: ["games", "control", "snake"] });
  return context;
}

const guardState = (page) => page.locator("html").getAttribute("data-device-guard");

test("komputer: niskie okno Moich gier to „Za małe okno”, na żywo znika i wraca", async ({ browser }, testInfo) => {
  const context = await newContext(browser, { viewport: { width: 1400, height: 550 } });
  const page = await context.newPage();
  try {
    await page.goto(`${SITE}/games/?lang=pl`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#pageGuard")).toBeVisible();
    await expect(page.locator("#pageGuard")).toHaveAttribute("data-state", "small");
    await expect(page.locator("#pageGuard")).toContainText("Za małe okno");
    await page.screenshot({ path: testInfo.outputPath("shot-guard-height-desktop-1400x550.png") });
    // Powiększenie okna (albo zmniejszenie powiększenia strony) zdejmuje blokadę;
    // strona przechodzi dalej (tu: logowanie, bo kontekst nie ma sesji).
    await page.setViewportSize({ width: 1400, height: 900 });
    await expect.poll(() => guardState(page)).toBe("ok");
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 15000 }).toMatch(/^\/login\/?$/);
  } finally {
    await context.close();
  }
});

test("Wyświetlacz: zmiana wysokości po wczytaniu pokazuje i zdejmuje blokadę (wymóg HD bez zmian)", async ({ browser }) => {
  const context = await newContext(browser, { viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${SITE}/control/display/?lang=pl`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => guardState(page)).toBe("ok");
    await page.setViewportSize({ width: 1400, height: 550 });
    await expect.poll(() => guardState(page)).toBe("small");
    await expect(page.locator("#pageGuard")).toBeVisible();
    await page.setViewportSize({ width: 1400, height: 900 });
    await expect.poll(() => guardState(page)).toBe("ok");
    await expect(page.locator("#pageGuard")).toBeHidden();
  } finally {
    await context.close();
  }
});

test("tablet w poziomie z niskim viewportem: Moje gry proszą o obrót, w pionie działają", async ({ browser }, testInfo) => {
  const context = await newContext(browser, TABLET);
  const page = await context.newPage();
  try {
    await page.goto(`${SITE}/games/?lang=pl`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#pageGuard")).toBeVisible();
    await expect(page.locator("#pageGuard")).toHaveAttribute("data-state", "rotate");
    await page.screenshot({ path: testInfo.outputPath("shot-guard-height-tablet-1200x560.png") });
    // Obrót do pionu: bez progu wysokości, strona rusza dalej.
    await page.setViewportSize({ width: 800, height: 1200 });
    await expect.poll(() => guardState(page)).toBe("ok");
  } finally {
    await context.close();
  }
});

test("tablet w poziomie z niskim viewportem: Control (980 px) to „Za małe okno”, obrót nie pomoże", async ({ browser }, testInfo) => {
  // Nowy kontekst: setViewportSize w emulacji urządzenia zmienia też screen.
  const context = await newContext(browser, TABLET);
  const page = await context.newPage();
  try {
    // Control wymaga 980 px szerokości; w pionie (krótszy bok 800 px) się nie zmieści.
    await page.goto(`${SITE}/control/?lang=pl`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#pageGuard")).toBeVisible();
    await expect(page.locator("#pageGuard")).toHaveAttribute("data-state", "small");
    await expect(page.locator("#pageGuard")).toContainText("Za małe okno");
    await page.screenshot({ path: testInfo.outputPath("shot-guard-height-tablet-control-1200x560.png") });
  } finally {
    await context.close();
  }
});

// Wyjątki (decyzja użytkownika 2026-10-22): Host, Przycisk i Snake nie mają
// progu wysokości -- przy tym samym niskim oknie zostają bez blokady.
for (const [label, url, options] of [
  ["Host (tablet 1200×560)", "/control/host/", TABLET],
  ["Przycisk (tablet 1200×560)", "/control/buzzer/", TABLET],
  // Wąż startuje tylko z identyfikatorem demo (inaczej strona 404) -- jak w scenach zrzutów.
  ["Snake (komputer 1400×550)", "/snake/?qr=00000000-0000-4000-8000-000000000103", { viewport: { width: 1400, height: 550 } }],
]) {
  test(`bez progu wysokości: ${label}`, async ({ browser }, testInfo) => {
    const context = await newContext(browser, options);
    const page = await context.newPage();
    try {
      await page.goto(`${SITE}${url}${url.includes("?") ? "&" : "?"}lang=pl`, { waitUntil: "domcontentloaded" });
      await expect.poll(() => guardState(page)).toBe("ok");
      await expect(page.locator("#pageGuard")).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath(`shot-guard-height-none-${url.replace(/\W+/g, "-")}.png`) });
    } finally {
      await context.close();
    }
  });
}
