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
    const sharedRow = page.locator("#shareSectionsHost .shareRow");
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

test("bazy337: wspólne sekcje, wszystkie stany, osobne przewijanie i blob 390/1400", async ({ page, context }) => {
  test.setTimeout(120_000);
  await loginAsPooledTestUser(page, context, 0);
  const baseId = await createBase(page, `E2E-B337-UI-${Date.now()}`);
  const future = days => new Date(Date.now() + days * 86400000).toISOString();
  const panel = {
    ok: true,
    friends: Array.from({ length: 20 }, (_, n) => ({ user_id: `f${n}`, label: `Znajomy ${n + 1}`, email: `friend${n}@example.net`, cooldown_until: n === 0 ? future(1) : null })),
    outgoing: [
      { task_id: "pending", recipient_user_id: "r1", label: "Alicja", email: "alicja@example.net", role: "viewer", status: "pending", is_friend: true, email_enabled: true, cooldown_until: future(.5) },
      { task_id: "muted", recipient_user_id: "r2", label: "Piotr", email: "piotr@example.net", role: "editor", status: "opened", is_friend: false, email_enabled: false },
      { task_id: "declined", recipient_user_id: "r3", label: "Tomasz", email: "tomasz@example.net", role: "viewer", status: "declined", is_friend: false, email_enabled: true, cooldown_until: future(29) },
    ],
    active: Array.from({ length: 20 }, (_, n) => ({ user_id: `a${n}`, label: `Odbiorca ${n + 1}`, email: `active${n}@example.net`, role: n % 2 ? "viewer" : "editor", status: "done", is_friend: n % 2 === 0 })),
  };
  const refusals = [{ id: "own-refusal", base_id: "refused", name: "Quiz sportowy", owner_label: "Maja", role: "editor", expires_at: future(29) }];
  await page.route("**/rest/v1/rpc/base_share_panel", route => route.fulfill({ json: panel }));
  await page.route("**/rest/v1/rpc/base_declines_list_mine", route => route.fulfill({ json: refusals }));
  await page.route("**/rest/v1/rpc/base_share_by_user", route => route.fulfill({ json: [{ ok: false, err: "already_pending" }] }));
  try {
    for (const width of [1400, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await openShare(page, baseId);
      await expect(page.locator('#shareOverlay .shareSection')).toHaveCount(3);
      await expect(page.locator('#baseShareFriends [data-id="f0"] input')).toBeDisabled();
      await expect(page.locator('#baseShareFriends [data-id="f0"]')).toHaveClass(/is-cooling-down/);
      await expect(page.locator('#shareSectionsHost [data-id="pending"] [data-act="resend"]')).toBeDisabled();
      await expect(page.locator('#shareSectionsHost [data-id="muted"] [data-act="resend"]')).toHaveCount(0);
      await expect(page.locator('#shareSectionsHost [data-id="declined"] [data-act="resend"]')).toHaveCount(0);
      await expect(page.locator('#shareSectionsHost [data-id="declined"] .shareCountdown')).toBeVisible();
      await page.locator('#baseShareFriends [data-id="f1"] input').check();
      await expect(page.locator('#btnBaseShareFriends')).toBeEnabled();
      const geometry = await page.evaluate(() => {
        const left = document.querySelector('#baseShareFriends'); const right = document.querySelector('#shareSectionsHost');
        left.scrollTop = 70; right.scrollTop = 120;
        const row = document.querySelector('#shareSectionsHost [data-id="pending"]');
        const buttons = [...row.querySelectorAll('.shareRowActions button')].map(button => ({ width: Math.round(button.getBoundingClientRect().width), height: Math.round(button.getBoundingClientRect().height) }));
        return { scroll: [left.scrollTop, right.scrollTop], overflow: document.documentElement.scrollWidth > innerWidth, buttons };
      });
      expect(geometry.scroll).toEqual([70, 120]); expect(geometry.overflow).toBe(false);
      expect(new Set(geometry.buttons.map(button => button.width)).size).toBe(1);
      expect(new Set(geometry.buttons.map(button => button.height)).size).toBe(1);
      await page.locator('#shareEmail').fill('alicja@example.net'); await page.locator('#btnShareAdd').click();
      await expect(page.locator('#shareMsg')).toHaveClass(/app-toast--inline/);
      await expect(page.locator('#shareMsg')).toBeVisible(); await expect(page.locator('#shareMsg')).toBeHidden({ timeout: 6000 });
      await page.locator(width === 390 ? '#btnBack' : '#btnShareClose').click();
      await page.locator('#tabBasesShared').click();
      const head = page.locator('#baseDeclinesHost .rowsSectionHead');
      await expect(head).toHaveAttribute('aria-expanded', 'false'); await head.click();
      await expect(page.locator('#baseDeclinesHost [data-act="undo"]')).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`base-refusals-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await head.click();
    }
  } finally {
    await page.unroute("**/rest/v1/rpc/base_share_panel");
    await page.unroute("**/rest/v1/rpc/base_declines_list_mine");
    await page.unroute("**/rest/v1/rpc/base_share_by_user");
    await page.evaluate(async id => { const { error } = await window.__sbClient.from("question_bases").delete().eq("id", id); if (error) throw error; }, baseId);
  }
});
