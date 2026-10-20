// Konto: ocena systemu — „Oceń” bez oceny, „Zmień ocenę” przy istniejącej.
// Komentarz wyświetlany jako tekst (bez interpretacji HTML). Po teście
// przywracana jest poprzednia ocena konta (RLS nie pozwala jej usunąć,
// więc konto bez oceny zostaje z oceną testową).
const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");

test.use({ serviceWorkers: "block" });

test("Konto: wystawienie i zmiana oceny systemu", async ({ page, context }) => {
  test.setTimeout(120_000);
  if (process.env.GITHUB_REF_NAME !== "main") await serveBranchCode(context, { pages: ["account"] });
  await loginAsTestUser(page, context, { username: testAccountUsername(1) });
  await page.goto("https://www.familiada.online/account/", { waitUntil: "domcontentloaded" });
  const previous = await page.evaluate(async () => {
    const db = window.__sbClient;
    const { data: u } = await db.auth.getUser();
    const { data, error } = await db.from("app_ratings").select("stars,comment").eq("user_id", u.user.id).maybeSingle();
    if (error) throw error;
    return data;
  });
  const btn = page.locator("#ratingEditBtn");
  try {
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await expect(btn).toContainText(previous ? /Zmień ocenę/ : /Oceń/);

    const comment = `E2E <b>ocena</b> ${Date.now()}`;
    await btn.click();
    const modal = page.locator("#ratingEditOverlay");
    await expect(modal).toBeVisible();
    await modal.locator('.star-btn[data-value="3"]').click();
    await modal.locator(".rating-comment").fill(comment);
    await modal.locator("[data-rating-save]").click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator("#userRatingInfo .rating-comment-box")).toContainText(comment);
    await expect(page.locator("#userRatingInfo .rating-comment-box b")).toHaveCount(0);
    await expect(btn).toContainText(/Zmień ocenę/);

    // zmiana: okno z bieżącą oceną, Anuluj nic nie zmienia
    await btn.click();
    await expect(modal.locator(".star-btn.active")).toHaveCount(3);
    await expect(modal.locator(".rating-comment")).toHaveValue(comment);
    await modal.locator("[data-rating-cancel]").click();
    await expect(modal).toHaveCount(0);

    await btn.click();
    await modal.locator('.star-btn[data-value="5"]').click();
    await modal.locator("[data-rating-save]").click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator("#userRatingInfo .rating-stars .value .ico")).toHaveCount(5);
    const saved = await page.evaluate(async () => {
      const db = window.__sbClient;
      const { data: u } = await db.auth.getUser();
      const { data } = await db.from("app_ratings").select("stars").eq("user_id", u.user.id).single();
      return data.stars;
    });
    expect(saved).toBe(5);
  } finally {
    if (previous) {
      await page.evaluate(async (prev) => {
        const db = window.__sbClient;
        const { data: u } = await db.auth.getUser();
        await db.from("app_ratings").update({ stars: prev.stars, comment: prev.comment }).eq("user_id", u.user.id);
      }, previous).catch(() => {});
    }
  }
});
