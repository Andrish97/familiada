// tests/e2e/tasks.spec.js
// Strona /tasks/ (E19 krok 2): konto A udostępnia bazę kontu B (RPC jak w
// bases.spec.js), B widzi ją w „Do zrobienia”, filtr ?kind=, akceptuje —
// wiersz znika z listy (bazy nie trafiają do „Zrobione”).
// Chodzi po produkcji (po wdrożeniu strony). Konta tylko z puli: test2 (A)
// i test3 (B); test4/5/9/10 nie używać.

const { test, expect } = require("@playwright/test");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");

const TASKS_URL = "https://www.familiada.online/tasks/";

test.use({ serviceWorkers: "block" });

async function newUserContext(browser, username) {
  const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await loginAsTestUser(page, ctx, { username });
  return { ctx, page };
}

test.describe("tasks: baza udostępniona drugiemu kontu", () => {
  test("B widzi bazę w „Do zrobienia”, filtr ?kind=base, akceptacja usuwa wiersz", async ({ browser }) => {
    test.setTimeout(120_000);
    const a = await newUserContext(browser, testAccountUsername(2));
    const b = await newUserContext(browser, testAccountUsername(3));
    const baseName = `E2E zadania ${Date.now()}`;
    let baseId = null;
    try {
      const recipientId = await b.page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);

      baseId = await a.page.evaluate(async (name) => {
        const sb = window.__sbClient;
        const { data: u } = await sb.auth.getUser();
        const { data, error } = await sb.from("question_bases").insert({ name, owner_id: u.user.id }).select("id").single();
        if (error) throw new Error("insert question_bases: " + error.message);
        return data.id;
      }, baseName);

      await a.page.evaluate(async ({ baseId, recipientId }) => {
        const { data, error } = await window.__sbClient.rpc("base_share_by_user", {
          p_base_id: baseId, p_recipient_user_id: recipientId, p_role: "viewer",
        });
        if (error) throw new Error(error.message);
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.ok) throw new Error("base_share_by_user: " + row?.err);
      }, { baseId, recipientId });

      // Wszystkie rodzaje: baza w „Do zrobienia”.
      await b.page.goto(TASKS_URL, { waitUntil: "domcontentloaded" });
      const row = b.page.locator(".rowsSection--todo .rowsRow", { hasText: baseName });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row.locator('[data-act="accept"]')).toBeVisible();

      // Filtr rodzaju w adresie: ?kind=base pokazuje bazę, ?kind=poll ją ukrywa.
      await b.page.goto(`${TASKS_URL}?kind=base`, { waitUntil: "domcontentloaded" });
      await expect(b.page.locator(".rowsRow", { hasText: baseName })).toBeVisible({ timeout: 20_000 });
      await expect(b.page.locator('.rowsRow:not([hidden])[data-kind="poll"]')).toHaveCount(0);
      await b.page.goto(`${TASKS_URL}?kind=poll`, { waitUntil: "domcontentloaded" });
      await expect(b.page.locator(".rowsRow", { hasText: baseName })).toBeHidden({ timeout: 20_000 });

      // Akceptacja: wiersz znika (nie przechodzi do „Zrobione”).
      await b.page.goto(`${TASKS_URL}?kind=base`, { waitUntil: "domcontentloaded" });
      const again = b.page.locator(".rowsSection--todo .rowsRow", { hasText: baseName });
      await expect(again).toBeVisible({ timeout: 20_000 });
      await again.locator('[data-act="accept"]').click();
      await expect(b.page.locator(".rowsRow", { hasText: baseName })).toHaveCount(0, { timeout: 20_000 });
      await expect(b.page.locator(".rowsSection--done .rowsRow", { hasText: baseName })).toHaveCount(0);
    } finally {
      if (baseId) {
        await a.page.evaluate(async (id) => { await window.__sbClient.from("question_bases").delete().eq("id", id); }, baseId).catch(() => {});
      }
      await a.ctx.close();
      await b.ctx.close();
    }
  });
});
