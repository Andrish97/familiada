// Jednorazowe sprzątanie: konto powstałe na test14 przez błąd anulowania migracji
// gościa (link działał po anulowaniu). Reset hasła daje sesję, delete-account ją usuwa.
const { test, expect } = require("@playwright/test");
const { clearMailbox, waitForEmail, extractHttpLinks, resetMailProviderLimits } = require("./helpers/mailbox");
const { withE2EBypass } = require("./helpers/login");
const MAILBOX = "test14@familiada.online";

test("sprzatanie konta test14", async ({ page, context }) => {
  test.setTimeout(180_000);
  await resetMailProviderLimits();
  await clearMailbox(MAILBOX);
  const after = new Date(Date.now() - 2_000).toISOString();
  await withE2EBypass(context);
  await page.goto("https://www.familiada.online/login", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector("#status")?.textContent?.trim() && !/sprawdzam/i.test(document.querySelector("#status").textContent));
  await page.locator("#email").fill(MAILBOX);
  await page.locator("#btnForgot").click();
  await expect(page.locator("#status")).toContainText("Wysłano", { timeout: 30_000 });
  const email = await waitForEmail({ recipient: MAILBOX, after });
  const link = extractHttpLinks(email).find((l) => /\/login\/reset|token_hash=|type=recovery/i.test(l));
  expect(link).toBeTruthy();
  await page.goto(link, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#form")).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: u } = await sb.auth.getUser();
    const before = { email: u?.user?.email, anon: u?.user?.is_anonymous, guest: u?.user?.user_metadata?.is_guest };
    const { data, error } = await sb.functions.invoke("delete-account");
    return { before, ok: data?.ok, error: error?.message || data?.error || null };
  });
  console.log("[e2e-diag] sprzatanie test14:", JSON.stringify({ ...result, before: { ...result.before, email: result.before.email ? "test14" : null } }));
  expect(result.ok).toBe(true);
  await clearMailbox(MAILBOX);
});
