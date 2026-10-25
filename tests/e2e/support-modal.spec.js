// „Postaw kawę”: filiżanka w stopce obok Kontaktu, okno wyboru kawy, wejście
// z FAQ strony głównej. Bez logowania (strony publiczne); buycoffee.to
// podmienione w teście -- sprawdzamy tylko adres nowej karty.
const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");

const ORIGIN = "https://www.familiada.online";
const SUPPORT = "https://buycoffee.to/familiada.online";

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE === "1") await serveBranchCode(context, { pages: ["index", "privacy"] });
  await context.route("https://buycoffee.to/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>buycoffee stub</title>" }));
});

async function pickCoffee(page, size) {
  const modal = page.locator(".support-modal");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".support-size")).toHaveCount(3);
  await expect(modal.locator('input[value="small"]')).toBeChecked();
  await modal.locator(`.support-size--${size}`).click();
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    modal.locator(".uni-foot .btn.gold").click(),
  ]);
  expect(popup.url()).toBe(`${SUPPORT}?coffeeSize=${size}`);
  await popup.close();
  await expect(modal).toHaveCount(0);
}

test("stopka: sama filiżanka obok Kontaktu, okno i wybrana kawa (komputer)", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${ORIGIN}/privacy/?lang=pl`, { waitUntil: "domcontentloaded" });
  const cup = page.locator(".footer .footer-actions .btn-support-footer");
  await expect(cup).toBeVisible();
  await expect(cup).toHaveAttribute("aria-label", "Postaw kawę");
  await expect(cup).toHaveText("");
  // filiżanka tuż przed Kontaktem, w jednej grupie
  await expect(page.locator(".footer-actions > .btn-support-footer + .btn-contact-footer")).toHaveCount(1);
  await cup.click();
  await expect(page.locator(".support-modal .mTitle")).toHaveText("Postaw kawę");
  await expect(page.locator(".support-modal .support-modal-note")).toContainText("buycoffee.to");
  await pickCoffee(page, "medium");
});

test("telefon: okno jako roletka od dołu, Anuluj zamyka bez nowej karty", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ORIGIN}/privacy/?lang=pl`, { waitUntil: "domcontentloaded" });
  const cup = page.locator(".footer .btn-support-footer");
  await expect(cup).toBeVisible();
  await cup.click();
  await expect(page.locator(".overlay.modal--sheet:has(.support-modal)")).toBeVisible();
  let popups = 0;
  page.on("popup", () => { popups += 1; });
  await page.locator(".support-modal .uni-foot .btn:not(.gold)").click();
  await expect(page.locator(".support-modal")).toHaveCount(0);
  expect(popups).toBe(0);
  await cup.click();
  await pickCoffee(page, "large");
});

test("FAQ strony głównej: kategoria Wsparcie projektu i przycisk otwierający okno (PL/EN/UK)", async ({ page }) => {
  const cases = [
    { lang: "pl", cat: "Wsparcie projektu", btn: "Postaw kawę", title: "Postaw kawę" },
    { lang: "en", cat: "Supporting the project", btn: "Buy a coffee", title: "Buy me a coffee" },
    { lang: "uk", cat: "Підтримка проєкту", btn: "Пригостити кавою", title: "Пригостити кавою" },
  ];
  for (const item of cases) {
    await page.goto(`${ORIGIN}/?lang=${item.lang}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-i18n="home.faq.cat6"]')).toHaveText(item.cat);
    await page.locator('[data-i18n="home.faq.q31.q"]').click();
    const btn = page.locator("[data-support-modal]");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(item.btn);
    await btn.click();
    await expect(page.locator(".support-modal .mTitle")).toHaveText(item.title);
    await page.keyboard.press("Escape");
    await expect(page.locator(".support-modal")).toHaveCount(0);
  }
  // dane strukturalne FAQ zawierają nowe pytania
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(ld.join("\n")).toContain("FAQPage");
  await page.goto(`${ORIGIN}/?lang=pl`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-i18n="home.faq.q31.q"]').click();
  await page.locator("[data-support-modal]").click();
  await pickCoffee(page, "small");
});
