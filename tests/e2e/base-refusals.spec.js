const { test, expect } = require("@playwright/test");
const { loginAsPooledTestUser } = require("./helpers/login");
const { serveBranchCode } = require("./helpers/branch-code");
const { clearMailbox, waitForEmail, extractHttpLinks, resetMailProviderLimits } = require("./helpers/mailbox");
const SITE = "https://www.familiada.online";
const branch = process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0";
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => { if (branch) await serveBranchCode(context); });
async function rpc(page, name, args) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }, { name, args });
}
async function ready(page) { await expect(page.locator('[data-skel-step].skel-step-ready').first()).toBeVisible(); }
async function createBase(page, name) {
  return page.evaluate(async name => {
    const user = (await window.__sbClient.auth.getUser()).data.user;
    const { data, error } = await window.__sbClient.from("question_bases")
      .insert({ name, owner_id: user.id }, { defaultToNull: false }).select("id").single();
    if (error) throw error; return data.id;
  }, name);
}
async function openShare(page, baseId) {
  await page.goto(`${SITE}/bases/`); await ready(page);
  await page.locator(`#mineGrid [data-base-id="${baseId}"]`).click();
  await page.locator("#btnShare").click();
  await expect(page.locator("#shareOverlay")).toBeVisible();
  await expect(page.locator("#baseShareFriends .shareRow").first()).toBeVisible();
}
async function openShared(page) {
  await page.goto(`${SITE}/bases/?tab=shared`); await ready(page);
}

test("bazy337: rzeczywisty mail, odmowa i opuszczenie, undo, role oraz cofnięcie", async ({ page, context, browser }) => {
  test.setTimeout(300_000);
  await loginAsPooledTestUser(page, context, 0);
  const recipientContext = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  if (branch) await serveBranchCode(recipientContext);
  const recipient = await recipientContext.newPage();
  let baseId = null, recipientId = null, recipientEmail = null;
  const name = `E2E-B337-${Date.now()}`;
  try {
    await loginAsPooledTestUser(recipient, recipientContext, 1);
    const identity = await recipient.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user);
    recipientId = identity.id; recipientEmail = identity.email;
    await rpc(page, "e2e_friendships_cleanup", { p_other_user_id: recipientId });
    const friendship = await rpc(page, "friends_invite", { p_handle: recipientEmail });
    expect(friendship.ok).toBe(true);
    expect((await rpc(recipient, "friends_accept", { p_id: friendship.id })).ok).toBe(true);
    baseId = await createBase(page, name);
    await clearMailbox(recipientEmail); await resetMailProviderLimits(page);
    const after = new Date().toISOString();
    await openShare(page, baseId);
    const friend = page.locator(`#baseShareFriends [data-id="${recipientId}"]`);
    await friend.locator('input[type="checkbox"]').check();
    await page.locator("#baseShareFriendsRole button").click(); // editor -> viewer
    await page.locator("#btnBaseShareFriends").click();
    const sharedRow = page.locator(`#shareSectionsHost .shareRow`).filter({ hasText: recipientEmail.split("@")[0] });
    await expect(sharedRow).toHaveCount(1);
    await expect(friend).toHaveCount(0);
    await expect(sharedRow.locator('[data-act="resend"]')).toBeDisabled();
    await expect(sharedRow.locator(".baseShareRole")).toHaveAttribute("data-role", "viewer");
    const tasks = await rpc(page, "list_base_share_tasks_outgoing", { p_base_id: baseId });
    const taskId = tasks[0].task_id;
    const tokenInfo = await rpc(page, "base_share_panel", { p_base_id: baseId });
    expect(tokenInfo.outgoing[0].status).toBe("pending");
    // Duplicate po e-mailu/nazwie nie tworzy kolejnego zaproszenia ani maila.
    await page.locator("#shareEmail").fill(recipientEmail);
    await page.locator("#btnShareAdd").click();
    await expect(page.locator("#shareMsg")).toContainText(/oczekuje|pending/i);
    await expect(page.locator("#shareMsg")).toBeHidden({ timeout: 6000 });
    expect((await rpc(page, "list_base_share_tasks_outgoing", { p_base_id: baseId })).length).toBe(1);
    const email = await waitForEmail({ recipient: recipientEmail, after, subject: /baz|base/i, timeout: 150_000 });
    const link = extractHttpLinks(email).find(url => new URL(url).pathname === "/go/" && new URL(url).searchParams.has("b"));
    expect(link).toBeTruthy();
    await recipient.goto(link); await expect(recipient.locator("#message")).toContainText(/udostępnia.*bazę/);
    await recipient.locator("#actions button").click();
    await expect.poll(() => new URL(recipient.url()).pathname).toBe("/bases/");
    const proposed = recipient.locator(`#sharedGrid [data-base-id="${baseId}"][data-proposed="1"]`);
    await expect(proposed).toBeVisible(); await proposed.locator("[data-decline]").click();
    await expect(proposed).toHaveCount(0);
    const head = recipient.locator("#baseDeclinesHost .rowsSectionHead");
    await expect(head).toHaveAttribute("aria-expanded", "false");
    for (const width of [1400, 390]) {
      await recipient.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await openShared(recipient);
      await expect(head).toHaveAttribute("aria-expanded", "false"); await head.click();
      await expect(recipient.locator('#baseDeclinesHost [data-act="undo"]')).toBeVisible();
      expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator("#btnShareClose").click(); await openShare(page, baseId);
    await expect(sharedRow).toContainText("Odrzucono");
    await expect(sharedRow.locator('[data-act="resend"]')).toHaveCount(0);
    expect(await rpc(recipient, "base_share_accept", { p_task_id: taskId })).toBe(false);
    await recipient.locator('#baseDeclinesHost [data-act="undo"]').click();
    await expect(proposed).toBeVisible(); // undo nie przyznaje dostępu
    await expect(proposed.locator("[data-accept]")).toBeVisible();
    await proposed.locator("[data-accept]").click();
    await expect(recipient.locator(`#sharedGrid [data-base-id="${baseId}"]:not([data-proposed])`)).toBeVisible();
    expect(await rpc(recipient, "leave_shared_base", { p_base_id: baseId })).toBe(true);
    expect(await rpc(recipient, "leave_shared_base", { p_base_id: baseId })).toBe(false);
    await openShared(recipient); await head.click();
    await expect(recipient.locator('#baseDeclinesHost [data-act="undo"]')).toBeVisible();
    await recipient.locator('#baseDeclinesHost [data-act="undo"]').click(); await expect(proposed).toBeVisible();
    await page.locator("#btnShareClose").click(); await openShare(page, baseId);
    await sharedRow.locator(".baseShareRole").click();
    await expect(sharedRow.locator(".baseShareRole")).toHaveAttribute("data-role", "editor");
    await proposed.locator("[data-accept]").click();
    await expect(proposed).toHaveCount(0);
    await page.locator("#btnShareClose").click(); await openShare(page, baseId);
    await expect(sharedRow).toContainText("Zaakceptowano");
    await sharedRow.locator(".baseShareRole").click();
    await expect(sharedRow.locator(".baseShareRole")).toHaveAttribute("data-role", "viewer");
    const access = await rpc(page, "list_base_shares", { p_base_id: baseId });
    expect(access[0].role).toBe("viewer");
    await sharedRow.locator('[data-act="remove"]').click(); await expect(sharedRow).toHaveCount(0);
    expect((await rpc(recipient, "base_share_undo_decline", { p_task_id: taskId })).ok).toBe(false);
    expect(await rpc(recipient, "base_share_accept", { p_task_id: taskId })).toBe(false);
    await recipient.goto(link); await expect(recipient.locator("#message")).toContainText(/cofnięt|anulowan/);
  } finally {
    if (baseId) await page.evaluate(async id => { const { error } = await window.__sbClient.from("question_bases").delete().eq("id", id); if (error) throw error; }, baseId);
    if (recipientId) await rpc(page, "e2e_friendships_cleanup", { p_other_user_id: recipientId });
    if (recipientEmail) await clearMailbox(recipientEmail);
    await recipientContext.close();
  }
});
