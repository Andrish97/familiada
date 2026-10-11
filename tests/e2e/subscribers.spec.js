const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser } = require("./helpers/login");
const { resetMailProviderLimits } = require("./helpers/mailbox");
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
  await page.locator("#inviteInput").fill(recipient);
  await page.locator("#btnInvite").click();
}
test("@mailbox subskrybenci: e-mail bez konta, anonimowe przyjęcie i usunięcie", async ({ page, context, browser }, testInfo) => {
  test.setTimeout(150000);
  await loginAsTestUser(page, context);
  const anonymous = await browser.newContext({ serviceWorkers: "block" });
  try {
    await cleanup(page);
    await resetMailProviderLimits(page);
    await page.goto("https://www.familiada.online/subscribers/");
    await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
    await expect(page.locator("#inviteForm")).toBeVisible();
    await expect(page.locator(".games-bottom")).toHaveCount(0);
    await invite(page, email);
    await expect(page.locator('.rowsSection--pending .shareRow').filter({ hasText: email })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("shot-subscribers-layout.png"), fullPage: true });
    // test14 is intentionally a mailbox without an account and is not exposed
    // through the E2E mailbox API (which only stores test1..test13). Read the
    // invite token through the authenticated owner's list, then exercise the
    // same /go/?s= URL the delivered email contains.
    const token = await page.evaluate(async email => {
      const { data, error } = await window.__sbClient.rpc("subscribers_list");
      if (error) throw error;
      return data.find(row => row.email.toLowerCase() === email.toLowerCase())?.token || null;
    }, email);
    expect(token).toBeTruthy();
    const invitePage = await anonymous.newPage();
    await invitePage.goto("https://www.familiada.online/", { waitUntil: "domcontentloaded" });
    // Anonim przyjmuje zaproszenie samym tokenem, bez zakładania konta.
    // Widok /go/?s= jest sprawdzany osobno w go.spec.js.
    const accepted = await invitePage.evaluate(async ({ token, email }) => {
      const { data, error } = await window.__sbClient.rpc("poll_sub_accept_email", {
        p_token: token,
        p_email: email,
      });
      if (error) throw error;
      return data;
    }, { token, email });
    expect(accepted?.ok).toBe(true);
    await page.reload();
    const active = page.locator('.rowsSection--active .shareRow').filter({ hasText: email });
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
