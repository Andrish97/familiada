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
  await page.locator("#btnInvite").click();
  await page.locator("#inviteInput").fill(handle);
  await page.locator("#btnInviteOk").click();
}
test("@mailbox znajomi: zaproszenie z UI, mail, go, przyjęcie i usunięcie", async ({ browser }) => {
  test.setTimeout(150000);
  const owner = await user(browser, 7);
  const recipient = await user(browser, 8);
  try {
    await cleanup(owner.page, recipient.id);
    await clearMailbox(testAccountUsername(8));
    await resetMailProviderLimits(owner.page);
    const after = new Date(Date.now() - 2000).toISOString();
    await open(owner.page);
    await invite(owner.page, testAccountUsername(8));
    const outgoing = owner.page.locator('.rowsSection--outgoing .rowsRow').filter({ hasText: /test8/i });
    await expect(outgoing).toHaveCount(1);
    const email = await waitForEmail({ recipient: testAccountUsername(8), after, subject: /znajom|friends/i });
    const link = extractHttpLinks(email).find(url => new URL(url).searchParams.has("f"));
    expect(link).toBeTruthy();
    await recipient.page.goto(link);
    await recipient.page.getByRole("button", { name: "Otwórz Znajomych" }).click();
    const incoming = recipient.page.locator('.rowsSection--incoming .rowsRow').filter({ hasText: /test7/i });
    await expect(incoming).toHaveCount(1);
    await incoming.locator('[data-act="accept"]').click();
    const active = recipient.page.locator('.rowsSection--friend .rowsRow').filter({ hasText: /test7/i });
    await expect(active).toHaveCount(1);
    await owner.page.reload();
    await expect(owner.page.locator('.rowsSection--friend .rowsRow').filter({ hasText: /test8/i })).toHaveCount(1);
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
