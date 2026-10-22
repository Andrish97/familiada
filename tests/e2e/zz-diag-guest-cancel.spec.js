// Diagnostyka (do usunięcia): stan auth po zamianie konta gościa -- A w toku, B anulowana.
// Linki NIE są klikane; goście zostają do zapytania w Studio (sami wygasną).
// W logu tylko UUID gości i 8 znaków token_hash z maila (repo publiczne).
const { test, expect } = require("@playwright/test");
const { loginAsGuest } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");
const { clearMailbox, waitForEmail, extractHttpLinks, resetMailProviderLimits, releaseMailCooldown } = require("./helpers/mailbox");

const MAILBOX = "test14@familiada.online";
test.use({ serviceWorkers: "block" });

async function guestWithMigration(browser, cancel) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  await serveBranchCode(context, { pages: ["account"] });
  const page = await context.newPage();
  await loginAsGuest(page, context);
  await page.goto("https://www.familiada.online/account", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#btnMigrate")).toBeVisible({ timeout: 30000 });
  await releaseMailCooldown(MAILBOX, "auth:guest_upgrade_email");
  await clearMailbox(MAILBOX);
  const after = new Date(Date.now() - 2_000).toISOString();
  await page.locator("#migrateUsername").fill(`e2ediag${Date.now() % 1000000}`);
  await page.locator("#migrateEmail").fill(MAILBOX);
  await page.locator("#migratePass1").fill("E2eTest123!");
  await page.locator("#migratePass2").fill("E2eTest123!");
  await page.locator("#btnMigrate").click();
  await expect(page.locator("#migratePendingHint")).toBeVisible({ timeout: 20000 });
  const mail = await waitForEmail({ recipient: MAILBOX, after });
  const link = extractHttpLinks(mail).find((l) => /token_hash=/.test(l));
  const tokenHash = new URL(link).searchParams.get("token_hash") || "";
  if (cancel) {
    await page.locator("#migrateCancel").click();
    await expect(page.locator("#migratePendingHint")).toBeHidden({ timeout: 15000 });
  }
  const id = await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
  console.log(`[e2e-diag] gosc ${cancel ? "B (anulowana)" : "A (w toku)"}: id=${id} token_hash_8=${tokenHash.slice(0, 8)} link_type=${new URL(link).searchParams.get("type")}`);
  await context.close();
}

test("diagnostyka: stan auth po zamianie konta gościa (A w toku, B anulowana) @mailbox", async ({ browser }) => {
  test.setTimeout(240_000);
  await resetMailProviderLimits();
  await guestWithMigration(browser, false);
  await guestWithMigration(browser, true);
  await clearMailbox(MAILBOX);
});
