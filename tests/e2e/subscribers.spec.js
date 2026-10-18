const { expectMailDocument } = require("./helpers/mail-document");
const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsPooledTestUser } = require("./helpers/login");
const { clearMailbox, resetMailProviderLimits, waitForEmail, extractHttpLinks, readMailDelivery } = require("./helpers/mailbox");
const { generateE2EToken } = require("./helpers/e2e-token");
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
  await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
  await expect(page.locator("#btnInvite")).toBeEnabled();
  await page.locator("#inviteInput").fill(recipient);
  await page.locator("#btnInvite").click();
}
for (const withdrawal of [false, true]) test(`@mailbox subskrybenci: e-mail bez konta, anonimowe przyjęcie i ${withdrawal ? "wypisanie jako odmowa" : "usunięcie"}`, async ({ page, context, browser }, testInfo) => {
  test.setTimeout(240000);
  await loginAsPooledTestUser(page, context, 0);
  const anonymous = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(anonymous, { pages: ["go"] });
  await anonymous.addInitScript(() => { localStorage.setItem("uiLang", "pl"); localStorage.setItem("fam:app_rating_suppressed", "true"); });
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
    expectMailDocument(delivered, { globalUnsub: true });
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
  await anonymous.addInitScript(() => { localStorage.setItem("uiLang", "pl"); localStorage.setItem("fam:app_rating_suppressed", "true"); });
  try {
    await cleanup(page);
    await clearMailbox(email);
    await resetMailProviderLimits(page);
    const after = new Date(Date.now()-2000).toISOString();
    await page.goto("https://www.familiada.online/subscribers/");
    await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
    await invite(page, email);
    const delivered = await waitForEmail({ recipient: email, after, subject: /subskrypc|subscript|підпис/i, timeout: 150000 });
    expectMailDocument(delivered, { globalUnsub: true });
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
  await anonymous.addInitScript(() => { localStorage.setItem("uiLang", "pl"); localStorage.setItem("fam:app_rating_suppressed", "true"); });
  const anonPage = await anonymous.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await anonPage.setViewportSize({ width: 390, height: 844 });
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
      expect(new URL(page.url()).searchParams.get("tab")).toBe("received");
      await expect(page.locator('[data-contact-panel="received"]')).toBeVisible();
    }
    status = "pending";
    await anonPage.goto(url);
    await expect(anonPage.locator("#message")).toContainText("Odbiorca ma konto");
    await anonymous.setExtraHTTPHeaders({ "X-E2E-Token": generateE2EToken(process.env.E2E_BYPASS_SECRET) });
    await anonPage.getByRole("button", { name: "Zaloguj", exact: true }).click();
    await expect(anonPage).toHaveURL(/\/login\//);
    expect(new URL(anonPage.url()).searchParams.get("next")).toBe("friends");
    expect(new URL(anonPage.url()).searchParams.has("s")).toBe(false);
    expect(new URL(anonPage.url()).searchParams.get("tab")).toBe("received");
    await anonPage.waitForLoadState("networkidle");
    await anonPage.locator("#email").fill(recipientEmail);
    await anonPage.locator("#pass").fill(process.env.TEST_PASSWORD);
    await anonPage.locator("#btnPrimary").click();
    await expect(anonPage).toHaveURL(/\/friends\//);
    expect(new URL(anonPage.url()).searchParams.get("tab")).toBe("received");
    await expect(anonPage.locator('[data-contact-panel="received"]')).toBeVisible();
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

test("@mailbox subskrybenci: globalne wypisanie blokuje kolejne zaproszenia bez kolejki", async ({ page, context, browser }) => {
  test.setTimeout(240000);
  await loginAsPooledTestUser(page, context, 0);
  const flag = await page.evaluate(async () => (await window.__sbClient.rpc("e2e_subscriber_mail_flag", { p_reset: false })).data);
  expect(flag).toMatchObject({ ok: true, suppressed_at: null });
  const anonymous = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(anonymous, { pages: ["go"] });
  await anonymous.addInitScript(() => { localStorage.setItem("uiLang", "pl"); localStorage.setItem("fam:app_rating_suppressed", "true"); });
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
    await expect(invitePage.locator("#message")).toContainText("Gotowe. Nie będziesz już otrzymywać powiadomień mailem.");
    await invitePage.reload();
    await expect(invitePage.locator("#message")).toContainText("Powiadomienia mailem są już wyłączone.");
    await page.reload();
    const refused = page.locator('.rowsSection--pending .shareRow').filter({ hasText: email });
    await expect(refused).toContainText("Odrzucono");
    await expect(refused.locator('[data-act="resend"]')).toHaveCount(0);
    const mutedAfter = new Date().toISOString();
    const mutedId = await refused.getAttribute("data-id");
    const beforeBlockedInvite = await page.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("poll_subscriptions")
        .select("status,declined_at,cancelled_at,email_sent_at,email_send_count").eq("id", id).single();
      if (error) throw error;
      return data;
    }, mutedId);
    const blockedInvite = await page.evaluate(async email =>
      (await window.__sbClient.rpc("subscribers_invite", { p_email: email })).data, email);
    expect(blockedInvite).toMatchObject({ ok: false, err: "notifications_disabled", mail_allowed: false });
    const afterBlockedInvite = await page.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("poll_subscriptions")
        .select("status,declined_at,cancelled_at,email_sent_at,email_send_count").eq("id", id).single();
      if (error) throw error;
      return data;
    }, mutedId);
    expect(afterBlockedInvite).toEqual(beforeBlockedInvite);
    await expect(refused.locator('[data-act="resend"]')).toHaveCount(0);
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
