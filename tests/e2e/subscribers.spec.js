const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser } = require("./helpers/login");
const { clearMailbox, resetMailProviderLimits, waitForEmail, extractHttpLinks } = require("./helpers/mailbox");
const email = "test14@familiada.online"; // Skrzynka bez konta: nie zakładać konta.
test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ context }) => {
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["subscribers", "friends", "go"] });
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
  test.setTimeout(240000);
  await loginAsTestUser(page, context);
  const anonymous = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(anonymous, { pages: ["go"] });
  await anonymous.addInitScript(() => localStorage.setItem("uiLang", "pl"));
  try {
    await cleanup(page);
    await clearMailbox(email);
    await resetMailProviderLimits(page);
    const after = new Date(Date.now()-2000).toISOString();
    await page.goto("https://www.familiada.online/subscribers/");
    await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
    await expect(page.locator("#inviteForm")).toBeVisible();
    await expect(page.locator(".games-bottom")).toHaveCount(0);
    await invite(page, email);
    await expect(page.locator('.rowsSection--pending .shareRow').filter({ hasText: email })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("shot-subscribers-layout.png"), fullPage: true });
    const delivered = await waitForEmail({ recipient: email, after, subject: /subskrypc|subscript|підпис/i, timeout: 150000 });
    const link = extractHttpLinks(delivered).find(url => new URL(url).searchParams.has("s"));
    expect(link).toBeTruthy();
    expect(new URL(link).pathname).toMatch(/^\/go\/?$/);
    // Duplikat nie tworzy kolejnego wpisu. Ponowienie respektuje cooldown.
    await invite(page, email);
    await expect(page.locator("#appToast")).toContainText("Ta osoba jest już na liście");
    const pending = page.locator('.rowsSection--pending .shareRow').filter({ hasText: email });
    await expect(pending).toHaveCount(1);
    await expect(pending.locator('[data-act="resend"]')).toBeDisabled();
    await expect(pending.locator('[data-act="resend"] .shareCountdown')).toBeVisible();
    await expect(pending).toHaveClass(/blocked/);
    await expect(pending.locator('[data-act="remove"]')).toBeEnabled();
    const blocked = await page.evaluate(async id => (await window.__sbClient.rpc("polls_hub_subscriber_resend", { p_id: id })).data, await pending.getAttribute("data-id"));
    expect(blocked.err).toBe("cooldown");
    const invitePage = await anonymous.newPage();
    await invitePage.goto(link);
    await expect(invitePage.getByRole("button", { name: "Akceptuj", exact: true })).toBeVisible();
    await invitePage.getByRole("button", { name: "Akceptuj", exact: true }).click();
    await expect(invitePage.locator(".poll-go-title")).toContainText(/aktywna/i);
    await invitePage.reload();
    await expect(invitePage.locator(".poll-go-title")).toContainText(/aktywna/i);
    const token = new URL(link).searchParams.get("s");
    const wrongEmail = await invitePage.evaluate(async token =>
      (await window.__sbClient.rpc("poll_sub_accept_email", { p_token: token, p_email: "wrong-token@example.net" })).data, token);
    expect(wrongEmail).toMatchObject({ ok: false, error: "email_mismatch" });
    await page.reload();
    const active = page.locator('.rowsSection--active .shareRow').filter({ hasText: email });
    await expect(active).toHaveCount(1);
    await active.locator('[data-act="remove"]').click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(active).toHaveCount(0);
    await invitePage.reload();
    await expect(invitePage.getByRole("button", { name: "Akceptuj", exact: true })).toHaveCount(0);
    await expect(invitePage.locator("#emailInput")).toBeHidden();
    const closed = await invitePage.evaluate(async ({ token, email }) => ({
      legacy: await window.__sbClient.rpc("poll_go_subscribe_email", { p_token: token, p_email: email }),
      direct: await window.__sbClient.rpc("poll_sub_accept_email", { p_token: token, p_email: email }),
    }), { token, email });
    expect(closed.legacy.error).toBeNull();
    expect(closed.legacy.data).toBe(false);
    expect(closed.direct.data).toMatchObject({ ok: false, error: "already_closed" });
    await page.reload();
    await expect(page.locator('.rowsSection--active .shareRow').filter({ hasText: email })).toHaveCount(0);
    await expect(page.locator('.rowsSection--pending .shareRow').filter({ hasText: email })).toHaveCount(0);
  } finally {
    await cleanup(page).catch(() => {});
    await anonymous.close();
  }
});
test("@mailbox subskrybenci: odmowa w Go blokuje oba RPC akceptacji", async ({ page, context, browser }) => {
  test.setTimeout(240000);
  await loginAsTestUser(page, context);
  const anonymous = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(anonymous, { pages: ["go"] });
  await anonymous.addInitScript(() => localStorage.setItem("uiLang", "pl"));
  try {
    await cleanup(page);
    await clearMailbox(email);
    await resetMailProviderLimits(page);
    const after = new Date(Date.now()-2000).toISOString();
    await page.goto("https://www.familiada.online/subscribers/");
    await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
    await invite(page, email);
    const delivered = await waitForEmail({ recipient: email, after, subject: /subskrypc|subscript|підпис/i, timeout: 150000 });
    const link = extractHttpLinks(delivered).find(url => new URL(url).searchParams.has("s"));
    expect(link).toBeTruthy();
    const token = new URL(link).searchParams.get("s");
    const invitePage = await anonymous.newPage();
    await invitePage.goto(link);
    await invitePage.getByRole("button", { name: "Odrzuć", exact: true }).click();
    await expect(invitePage.getByRole("button", { name: "Akceptuj", exact: true })).toHaveCount(0);
    await invitePage.reload();
    await expect(invitePage.getByRole("button", { name: "Akceptuj", exact: true })).toHaveCount(0);
    const closed = await invitePage.evaluate(async ({ token, email }) => ({
      legacy: await window.__sbClient.rpc("poll_go_subscribe_email", { p_token: token, p_email: email }),
      direct: await window.__sbClient.rpc("poll_sub_accept_email", { p_token: token, p_email: email }),
    }), { token, email });
    expect(closed.legacy.error).toBeNull();
    expect(closed.legacy.data).toBe(false);
    expect(closed.direct.data).toMatchObject({ ok: false, error: "already_closed" });
    const records = await page.evaluate(async email => {
      const { data, error } = await window.__sbClient.from("poll_subscriptions").select("status").eq("subscriber_email", email);
      if (error) throw error;
      return data;
    }, email);
    expect(records).toEqual([{ status: "declined" }]);
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
