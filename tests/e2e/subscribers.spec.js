const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsPooledTestUser } = require("./helpers/login");
const { clearMailbox, resetMailProviderLimits, waitForEmail, extractHttpLinks, readMailDelivery } = require("./helpers/mailbox");
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
for (const withdrawal of [false, true]) test(`@mailbox subskrybenci: e-mail bez konta, anonimowe przyjęcie i ${withdrawal ? "wypisanie jako odmowa" : "usunięcie"}`, async ({ page, context, browser }, testInfo) => {
  test.setTimeout(240000);
  await loginAsPooledTestUser(page, context, 0);
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
    let removalRow = active;
    if (withdrawal) {
      const unsub = new URL(link);
      unsub.searchParams.set("action", "unsub");
      await invitePage.goto(unsub.toString());
      await invitePage.locator(".poll-go-actions button").click();
      await expect(invitePage.locator("#message")).toContainText("Subskrypcja anulowana");
      await page.reload();
      removalRow = page.locator('.rowsSection--pending .shareRow').filter({ hasText: email });
      await expect(removalRow).toContainText("Odrzucono");
      await expect(removalRow.locator('[data-act="resend"]')).toHaveCount(0);
      const blockedInvite = await page.evaluate(async email =>
        (await window.__sbClient.rpc("subscribers_invite", { p_email: email })).data, email);
      expect(blockedInvite).toMatchObject({ ok: false, err: "cooldown" });
    }
    await removalRow.locator('[data-act="remove"]').click();
    await page.locator(".uni-foot .btn.gold").click();
    await expect(active).toHaveCount(0);
    await invitePage.reload();
    await expect(invitePage.locator(".poll-go-title")).toContainText("To zaproszenie wygasło");
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
  await loginAsPooledTestUser(page, context, 0);
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
    await expect(invitePage.locator(".poll-go-title")).toContainText("Odrzucono");
    await expect(invitePage.getByRole("button", { name: "Akceptuj", exact: true })).toHaveCount(0);
    await invitePage.reload();
    await expect(invitePage.locator(".poll-go-title")).toContainText("Odrzucono");
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
    await page.reload();
    const refused = page.locator('.rowsSection--pending .shareRow').filter({ hasText: email });
    await expect(refused).toContainText("Odrzucono");
    await expect(refused.locator('[data-act="resend"]')).toHaveCount(0);
    await refused.locator('[data-act="remove"]').click();
    await page.locator(".uni-foot .btn.gold").click();
    await invite(page, email);
    await expect(page.locator("#appToast")).toContainText("Kolejne zaproszenie można wysłać po");
  } finally {
    await cleanup(page).catch(() => {});
    await anonymous.close();
  }
});
test("subskrybenci: konto pokazuje przejście do Znajomych", async ({ page, context }) => {
  await loginAsPooledTestUser(page, context, 0);
  await page.goto("https://www.familiada.online/subscribers/");
  await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
  await invite(page, "test8@familiada.online");
  await expect(page.locator(".uni-modal")).toContainText("możesz zaprosić tę osobę do znajomych");
  await expect(page.getByRole("link", { name: "Przejdź →" })).toHaveAttribute("href", /\/friends\//);
});

test("subskrybenci: Go kieruje konta do Znajomych i zachowuje zamknięte stany", async ({ page, context, browser }) => {
  await loginAsPooledTestUser(page, context, 0);
  const recipientEmail = await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.email);
  const anonymous = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(anonymous, { pages: ["go"] });
  await anonymous.addInitScript(() => localStorage.setItem("uiLang", "pl"));
  const anonPage = await anonymous.newPage();
  let status = "pending";
  const resolver = route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    ok: true, kind: "sub", sub_id: "333-preview", status, owner_label: "Agnieszka",
    subscriber_user_id: null, subscriber_email: recipientEmail, friend_conversion_required: true,
  }) });
  await context.route("**/rest/v1/rpc/poll_go_resolve", resolver);
  await anonymous.route("**/rest/v1/rpc/poll_go_resolve", resolver);
  const url = "https://www.familiada.online/go/?s=cccccccc-3330-0000-0000-000000000003";
  try {
    for (status of ["pending", "active"]) {
      await page.goto(url);
      await expect(page.getByRole("button", { name: "Przejdź do Znajomych", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Akceptuj", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Przejdź do Znajomych", exact: true }).click();
      await expect(page).toHaveURL(/\/friends\/(?:\?|$)/);
      expect(new URL(page.url()).searchParams.has("s")).toBe(false);
    }
    status = "pending";
    await anonPage.goto(url);
    await expect(anonPage.locator("#message")).toContainText("Odbiorca ma konto");
    await anonPage.getByRole("button", { name: "Zaloguj", exact: true }).click();
    await expect(anonPage).toHaveURL(/\/login\//);
    expect(new URL(anonPage.url()).searchParams.get("next")).toBe("friends");
    expect(new URL(anonPage.url()).searchParams.has("s")).toBe(false);
    for (status of ["declined", "cancelled"]) {
      await page.goto(url);
      await expect(page.locator(".poll-go-title")).toContainText(status === "declined" ? "Odrzucono" : "To zaproszenie wygasło");
      await expect(page.locator(".poll-go-actions button")).toHaveCount(0);
    }
  } finally {
    await context.unroute("**/rest/v1/rpc/poll_go_resolve", resolver);
    await anonymous.close();
  }
});

test("@mailbox subskrybenci: globalne wypisanie, mail-off bez kolejki i naliczeń", async ({ page, context, browser }) => {
  test.setTimeout(240000);
  await loginAsPooledTestUser(page, context, 0);
  const flag = await page.evaluate(async () => (await window.__sbClient.rpc("e2e_subscriber_mail_flag", { p_reset: false })).data);
  expect(flag).toMatchObject({ ok: true, suppressed_at: null });
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
    const unsub = extractHttpLinks(delivered).find(url => new URL(url).searchParams.has("u"));
    expect(unsub).toBeTruthy();
    expect(new URL(unsub).pathname).toMatch(/^\/go\/?$/);
    const invitePage = await anonymous.newPage();
    await invitePage.goto(unsub);
    await invitePage.locator("#actions button").click();
    await expect(invitePage.locator("#message")).toContainText("Nie będziesz już otrzymywać żadnych maili");
    await invitePage.reload();
    await expect(invitePage.locator("#message")).toContainText("Już jesteś wypisany");
    await page.reload();
    const refused = page.locator('.rowsSection--pending .shareRow').filter({ hasText: email });
    await expect(refused).toContainText("Odrzucono");
    await expect(refused.locator('[data-act="resend"]')).toHaveCount(0);
    const blockedInvite = await page.evaluate(async email =>
      (await window.__sbClient.rpc("subscribers_invite", { p_email: email })).data, email);
    expect(blockedInvite).toMatchObject({ ok: false, err: "cooldown" });
    // Fixture removes only this test sender's history/clocks. Suppression stays.
    await cleanup(page);
    const mutedAfter = new Date().toISOString();
    await page.reload();
    await invite(page, email);
    const muted = page.locator('.rowsSection--pending .shareRow').filter({ hasText: email });
    await expect(muted).toHaveCount(1);
    await expect(muted.locator('[data-act="resend"]')).toHaveCount(0);
    const actual = await page.evaluate(async id => ({
      resend: (await window.__sbClient.rpc("polls_hub_subscriber_resend", { p_id: id })).data,
      row: (await window.__sbClient.from("poll_subscriptions").select("email_sent_at,email_send_count").eq("id", id).single()).data,
      flag: (await window.__sbClient.rpc("e2e_subscriber_mail_flag", { p_reset: false })).data,
    }), await muted.getAttribute("data-id"));
    expect(actual.resend).toEqual({ ok: true, mail_allowed: false });
    expect(actual.row).toEqual({ email_sent_at: null, email_send_count: 0 });
    expect(actual.flag.suppressed_at).toBeTruthy();
    const delivery = await readMailDelivery({ recipient: email, after: mutedAfter });
    expect(delivery.queue).toEqual([]);
    expect(delivery.events).toEqual([]);
  } finally {
    const restored = await page.evaluate(async () => (await window.__sbClient.rpc("e2e_subscriber_mail_flag", { p_reset: true })).data);
    expect(restored).toMatchObject({ ok: true, suppressed_at: null });
    await cleanup(page);
    await anonymous.close();
  }
});
