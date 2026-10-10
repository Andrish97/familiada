const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser } = require("./helpers/login");
const { clearMailbox, resetMailProviderLimits, waitForEmail, extractHttpLinks } = require("./helpers/mailbox");
const email = "test14@familiada.online"; // Skrzynka bez konta: nie zakładać konta.
test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["subscribers", "friends", "go"] });
});
async function cleanup(page) {
  await page.evaluate(async email => {
    const { data, error } = await window.__sbClient.rpc("e2e_subscriber_email_cleanup", { p_email: email });
    if (error || !data?.ok) throw error || new Error(JSON.stringify(data));
  }, email);
}
async function invite(page, recipient) {
  await page.locator("#btnInvite").click();
  await page.locator("#inviteInput").fill(recipient);
  await page.locator("#btnInviteOk").click();
}
test("@mailbox subskrybenci: e-mail bez konta, przyjęcie przez go i usunięcie", async ({ page, context, browser }) => {
  test.setTimeout(150000);
  await loginAsTestUser(page, context);
  const anonymous = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(anonymous, { pages: ["go"] });
  try {
    await cleanup(page);
    await clearMailbox(email);
    await resetMailProviderLimits(page);
    const after = new Date(Date.now() - 2000).toISOString();
    await page.goto("https://www.familiada.online/subscribers/");
    await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
    await invite(page, email);
    await expect(page.locator('.rowsSection--pending .rowsRow').filter({ hasText: email })).toHaveCount(1);
    const message = await waitForEmail({ recipient: email, after, subject: /subskrypc|subscription/i });
    const links = extractHttpLinks(message);
    const link = links.find(url => new URL(url).searchParams.has("s"));
    expect(link).toBeTruthy();
    expect(links.some(url => new URL(url).searchParams.has("u"))).toBe(true);
    const invitePage = await anonymous.newPage();
    await invitePage.goto(link);
    // Anonim przyjmuje subskrypcję samym tokenem, bez zakładania konta.
    await invitePage.getByRole("button", { name: /Akcept|Przyjm/i }).click();
    await page.reload();
    const active = page.locator('.rowsSection--active .rowsRow').filter({ hasText: email });
    await expect(active).toHaveCount(1);
    await active.locator('[data-act="remove"]').click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(active).toHaveCount(0);
  } finally {
    await cleanup(page).catch(() => {});
    await anonymous.close();
  }
});
test("subskrybenci: konto pokazuje przejście do Znajomych", async ({ page, context }) => {
  await loginAsTestUser(page, context);
  await page.goto("https://www.familiada.online/subscribers/");
  await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
  await invite(page, "test8@familiada.online");
  await expect(page.locator(".uni-modal")).toContainText("możesz zaprosić tę osobę do znajomych");
  await expect(page.getByRole("link", { name: "Przejdź →" })).toHaveAttribute("href", /\/friends\//);
});
