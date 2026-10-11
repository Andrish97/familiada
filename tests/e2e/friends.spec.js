const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { clearMailbox, resetMailProviderLimits, waitForEmail, extractHttpLinks } = require("./helpers/mailbox");
test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });
async function user(browser, number) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["friends", "subscribers", "go", "games"] });
  const page = await context.newPage();
  await loginAsTestUser(page, context, { username: testAccountUsername(number) });
  const id = await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
  return { context, page, id };
}
async function cleanup(page, id) {
  await page.evaluate(async id => {
    const { data, error } = await window.__sbClient.rpc("e2e_friendships_cleanup", { p_other_user_id: id });
    if (error || !data?.ok) throw error || new Error(JSON.stringify(data));
  }, id);
}
async function open(page) {
  await page.goto("https://www.familiada.online/friends/");
  await expect(page.locator("[data-skel-step]")).toHaveClass(/skel-step-ready/);
}
async function invite(page, handle) {
  await page.locator("#inviteInput").fill(handle);
  await page.locator("#btnInvite").click();
}
test("@mailbox znajomi: zaproszenie z UI, mail, go, przyjęcie i usunięcie", async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const owner = await user(browser, 7);
  const recipient = await user(browser, 8);
  try {
    await cleanup(owner.page, recipient.id);
    await clearMailbox(testAccountUsername(8));
    await resetMailProviderLimits(owner.page);
    const after = new Date(Date.now() - 2000).toISOString();
    await open(owner.page);
    await expect(owner.page.locator("#inviteForm")).toBeVisible();
    await expect(owner.page.locator(".games-bottom")).toHaveCount(0);
    await invite(owner.page, testAccountUsername(8));
    const outgoing = owner.page.locator('.rowsSection--outgoing .shareRow').filter({ hasText: /test8/i });
    await expect(outgoing).toHaveCount(1);
    await expect(outgoing.locator("[data-act=resend]")).toHaveAttribute("aria-label", "Wyślij ponownie");
    await expect(outgoing.locator("[data-act=resend]")).toBeDisabled();
    await expect(outgoing.locator("[data-act=resend] .shareCountdown")).toBeVisible();
    await expect(outgoing).toHaveClass(/blocked/);
    await expect(outgoing.locator("[data-act=cancel]")).toBeEnabled();
    const blocked = await owner.page.evaluate(async id => (await window.__sbClient.rpc("friends_resend", { p_id: id })).data, await outgoing.getAttribute("data-id"));
    expect(blocked.err).toBe("cooldown");
    await owner.page.screenshot({ path: testInfo.outputPath("shot-friends-layout.png"), fullPage: true });
    const email = await waitForEmail({ recipient: testAccountUsername(8), after, subject: /znajom|friends/i, timeout: 150000 });
    const link = extractHttpLinks(email).find(url => new URL(url).searchParams.has("f"));
    expect(link).toBeTruthy();
    await recipient.page.goto(link);
    await recipient.page.getByRole("button", { name: "Otwórz Znajomych" }).click();
    const incoming = recipient.page.locator('.rowsSection--incoming .shareRow').filter({ hasText: /test7/i });
    await expect(incoming).toHaveCount(1);
    await incoming.locator('[data-act="accept"]').click();
    const active = recipient.page.locator('.rowsSection--friend .shareRow').filter({ hasText: /test7/i });
    await expect(active).toHaveCount(1);
    await owner.page.reload();
    await expect(owner.page.locator('.rowsSection--friend .shareRow').filter({ hasText: /test8/i })).toHaveCount(1);
    await active.locator('[data-act="remove"]').click();
    await expect(recipient.page.locator(".uni-modal")).toContainText("Przyjęte bazy i urządzenia zostają");
    await recipient.page.locator(".uni-foot .btn.gold").click();
    await expect(active).toHaveCount(0);
  } finally {
    await cleanup(owner.page, recipient.id).catch(() => {});
    await owner.context.close();
    await recipient.context.close();
  }
});
test("znajomi: e-mail bez konta pokazuje przejście do Subskrybentów", async ({ browser }) => {
  const owner = await user(browser, 7);
  try {
    await open(owner.page);
    await invite(owner.page, "test14@familiada.online");
    await expect(owner.page.locator(".uni-modal")).toContainText("możesz dodać tę osobę jako subskrybenta");
    const link = owner.page.getByRole("link", { name: "Przejdź →" });
    await expect(link).toHaveAttribute("href", /\/subscribers\//);
    await link.click();
    await expect(owner.page).toHaveURL(/\/subscribers\//);
    const response = await owner.page.request.get("https://www.familiada.online/subscriptions/");
    expect(response.status()).toBe(404);
  } finally { await owner.context.close(); }
});

test("kontakty: wspólny licznik wygasa na żywo, flaga mailowa ukrywa ponowienie", async ({ browser }, testInfo) => {
  const owner = await user(browser, 7);
  try {
    await owner.context.route('**/rest/v1/rpc/contacts_list', async route => {
      const kind = route.request().postDataJSON().p_kind;
      const base = kind === "friends" ? { direction: "outgoing", label: "Odbiorca" } : {};
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([
        { ...base, id: "fixture-timer", email: "timer@example.net", status: "pending", email_enabled: true, resend_available_at: new Date(Date.now()+8000).toISOString() },
        { ...base, id: "fixture-off", email: "off@example.net", status: "pending", email_enabled: false, resend_available_at: null },
        { ...base, id: "fixture-ready", email: "ready@example.net", status: "pending", email_enabled: true, resend_available_at: null }
      ]) });
    });
    for (const kind of ["friends", "subscribers"]) {
      await owner.page.goto(`https://www.familiada.online/${kind}/`);
      const timed = owner.page.locator('[data-id="fixture-timer"]');
      const off = owner.page.locator('[data-id="fixture-off"]');
      const ready = owner.page.locator('[data-id="fixture-ready"]');
      await expect(timed.locator('[data-act="resend"]')).toBeDisabled();
      await expect(timed.locator('.shareCountdown')).toBeVisible();
      await expect(timed).toHaveClass(/blocked/);
      await expect(timed.locator(`[data-act="${kind === "friends" ? "cancel" : "remove"}"]`)).toBeEnabled();
      await expect(off.locator('[data-act="resend"]')).toHaveCount(0);
      await expect(ready.locator('[data-act="resend"]')).toBeEnabled();
      await expect(ready.locator('.shareCountdown')).toBeHidden();
      const sizes = await timed.locator('.shareRowActions .btn').evaluateAll(buttons => buttons.map(button => {
        const r = button.getBoundingClientRect(); return [r.width,r.height];
      }));
      expect(sizes).toHaveLength(2);
      expect(sizes[0]).toEqual(sizes[1]);
      await owner.page.screenshot({path:testInfo.outputPath(`shot-${kind}-countdown.png`),fullPage:true});
      await expect(timed.locator('[data-act="resend"]')).toBeEnabled({timeout:12000});
      await expect(timed.locator('.shareCountdown')).toBeHidden();
      await expect(timed).not.toHaveClass(/blocked/);
    }
  } finally { await owner.context.close(); }
});
