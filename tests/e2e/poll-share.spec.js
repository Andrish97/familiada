const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser, loginAsPooledTestUser, testAccountUsername } = require("./helpers/login");
const { clearMailbox, resetMailProviderLimits, waitForEmail, extractHttpLinks, readMailDelivery } = require("./helpers/mailbox");

const subscriberEmail = "test14@familiada.online"; // Skrzynka bez konta.
test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["polls"] });
});

async function rpc(page, name, args) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message} (${error.code || ""})`);
    return data;
  }, { name, args });
}

async function cleanup(ownerPage, friendId) {
  await rpc(ownerPage, "e2e_poll_mail_budget_cleanup", { p_recipient_email: testAccountUsername(8) });
  await rpc(ownerPage, "e2e_poll_mail_budget_cleanup", { p_recipient_email: subscriberEmail });
  await rpc(ownerPage, "e2e_poll_subscriptions_cleanup", { p_other_user_id: friendId });
  await rpc(ownerPage, "e2e_friendships_cleanup", { p_other_user_id: friendId });
  await rpc(ownerPage, "e2e_subscriber_email_cleanup", { p_email: subscriberEmail });
}

async function seedPoll(page) {
  return page.evaluate(async () => {
    const sb = window.__sbClient;
    const { data: userData } = await sb.auth.getUser();
    const { data: game, error } = await sb.from("games")
      .insert({ name: `E2E-POLL-SHARE-${Date.now()}`, owner_id: userData.user.id, type: "poll_text", status: "draft" })
      .select("id,share_key_poll,name").single();
    if (error) throw error;
    for (let ord = 1; ord <= 10; ord++) {
      const { error: questionError } = await sb.from("questions")
        .insert({ game_id: game.id, ord, text: `Pytanie ${ord}` });
      if (questionError) throw questionError;
    }
    return game;
  });
}

test("ankieta: okno Znajomi · Subskrybenci dodaje obie grupy, już zaproszeni znikają z wyboru", async ({ browser }) => {
  test.setTimeout(360000);
  const ownerContext = await browser.newContext({ serviceWorkers: "block" });
  const friendContext = await browser.newContext({ serviceWorkers: "block" });
  const anonymousContext = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") {
    await serveBranchCode(ownerContext, { pages: ["polls", "go", "tasks"] });
    await serveBranchCode(friendContext, { pages: ["polls", "go", "tasks"] });
    await serveBranchCode(anonymousContext, { pages: ["polls", "go", "tasks"] });
  }
  const ownerPage = await ownerContext.newPage();
  const friendPage = await friendContext.newPage();
  let gameId = null;
  let friendId = null;
  try {
    await loginAsTestUser(ownerPage, ownerContext, { username: testAccountUsername(7) });
    await loginAsTestUser(friendPage, friendContext, { username: testAccountUsername(8) });
    friendId = await friendPage.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    await cleanup(ownerPage, friendId);
    await clearMailbox(testAccountUsername(8));
    await clearMailbox(subscriberEmail);
    await resetMailProviderLimits(ownerPage);

    const friendInvite = await rpc(ownerPage, "friends_invite", { p_handle: testAccountUsername(8) });
    expect(friendInvite?.ok).toBe(true);
    const accepted = await rpc(friendPage, "friends_accept", { p_id: friendInvite.id });
    expect(accepted?.ok).toBe(true);

    const subscriberInvite = await rpc(ownerPage, "subscribers_invite", { p_email: subscriberEmail });
    expect(subscriberInvite?.ok).toBe(true);
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto("https://www.familiada.online/", { waitUntil: "domcontentloaded" });
    const subscriberAccepted = await rpc(anonymousPage, "poll_sub_accept_email", {
      p_token: subscriberInvite.token,
      p_email: subscriberEmail,
    });
    expect(subscriberAccepted?.ok).toBe(true);

    const game = await seedPoll(ownerPage);
    gameId = game.id;
    const emailAfter = new Date(Date.now() - 2000).toISOString();
    await ownerPage.goto(`https://www.familiada.online/polls/?id=${gameId}`, { waitUntil: "domcontentloaded" });
    await ownerPage.waitForLoadState("networkidle");
    await ownerPage.locator("#btnAddRecipients").click();
    const modal = ownerPage.locator("#pollRecipientsOverlay");
    await expect(modal).toBeVisible();
    const friendRow = modal.locator("#pollRecipientsFriends .shareRow").filter({ hasText: "test8" });
    const subscriberRow = modal.locator("#pollRecipientsSubs .shareRow").filter({ hasText: subscriberEmail });
    await expect(friendRow).toHaveCount(1);
    await expect(subscriberRow).toHaveCount(1);
    await friendRow.click();
    await subscriberRow.click();
    await expect(modal.locator("#pollRecipientsAdd")).toBeEnabled();
    await modal.locator("#pollRecipientsAdd").click();

    await ownerPage.locator("#btnOpenPoll").click();
    await ownerPage.locator(".uni-foot .btn.gold:visible").click();
    await expect(ownerPage.locator("#pollLink")).not.toHaveValue("");
    await expect(ownerPage.locator("#subsGrid .shareRow")).toHaveCount(2, { timeout: 20000 });
    await expect(ownerPage.locator("#subsGrid .shareRow").filter({ hasText: "test8" })).toHaveCount(1);
    await expect(ownerPage.locator("#subsGrid .shareRow").filter({ hasText: subscriberEmail })).toHaveCount(1);

    await ownerPage.locator("#btnAddRecipients").click();
    await expect(ownerPage.locator("#pollRecipientsFriends .shareRow").filter({ hasText: "test8" })).toHaveCount(0);
    await expect(ownerPage.locator("#pollRecipientsSubs .shareRow").filter({ hasText: subscriberEmail })).toHaveCount(0);
    await ownerPage.locator("#pollRecipientsCancel").click();
    const mails = await Promise.all([
      waitForEmail({ recipient: testAccountUsername(8), after: emailAfter, subject: /Zaproszenie do ankiety/i, timeout: 150_000 }),
      waitForEmail({ recipient: subscriberEmail, after: emailAfter, subject: /Zaproszenie do ankiety/i, timeout: 150_000 }),
    ]);
    const links = mails.map(email => extractHttpLinks(email).find(url => new URL(url).pathname === "/go/" && new URL(url).searchParams.has("t")));
    expect(links.every(Boolean)).toBe(true);
    for (const link of links) expect(new URL(link).searchParams.get("lang")).toBe("pl");
    await friendPage.goto(links[0]);
    await expect(friendPage.locator("#title")).toContainText(/ankiet/);
    await friendPage.getByRole("button", { name: "Otwórz Zadania", exact: true }).click({ timeout: 30_000 });
    const taskToken = new URL(links[0]).searchParams.get("t");
    const taskRow = friendPage.locator(`#tasksHost .rowsRow[data-token="${taskToken}"]`);
    await expect(taskRow).toHaveClass(/rowsFocus/, { timeout: 30_000 });
    expect(await rpc(friendPage, "poll_task_done", { p_token: taskToken })).toBe("votes_incomplete");
    await taskRow.locator('[data-act="vote"]').click();
    await expect(friendPage.locator("#answerInput")).toBeVisible({ timeout: 30_000 });
    for (let n = 0; n < 10; n++) {
      await friendPage.locator("#answerInput").fill("Kot");
      await friendPage.locator("#btnSend").click();
    }
    await expect.poll(async () => (await rpc(ownerPage, "poll_share_panel", { p_game_id: gameId })).tasks.find(t => t.recipient_user_id === friendId)?.status, { timeout: 30_000 }).toBe("done");
    await anonymousPage.goto(links[1]);
    await expect(anonymousPage.locator("#message")).toContainText(/ankiet/);
    await anonymousPage.getByRole("button", { name: "Odrzuć", exact: true }).click();
    await expect(anonymousPage.locator("#message")).toContainText(/odrzucon/i);
    const panel = await rpc(ownerPage, "poll_share_panel", { p_game_id: gameId });
    const declined = panel.tasks.find(t => !t.recipient_user_id);
    expect(declined.status).toBe("declined");
    await ownerPage.reload();
    await expect(ownerPage.locator(`#subsGrid [data-id="${declined.id}"] [data-act="remind"]`)).toHaveCount(0);
    await ownerPage.locator(`#subsGrid [data-id="${declined.id}"] [data-act="remove"]`).click();
    await ownerPage.locator(".uni-foot .btn.gold:visible").click();
    await expect(ownerPage.locator(`#subsGrid [data-id="${declined.id}"]`)).toHaveCount(0);
    await ownerPage.locator("#btnAddRecipients").click();
    await expect(ownerPage.locator("#pollRecipientsSubs .shareRow").filter({ hasText: subscriberEmail })).toHaveCount(0);
    expect(await rpc(ownerPage, "poll_share_send", { p_game_id: gameId, p_friend_ids: [], p_subscriber_ids: [subscriberInvite.id] })).toMatchObject({ ok: true, created: 0, kept: 1 });
    await ownerPage.locator("#pollRecipientsCancel").click();
    await rpc(ownerPage, "poll_stop", { p_game_id: gameId });
    await rpc(ownerPage, "poll_resume", { p_game_id: gameId });
    expect((await rpc(ownerPage, "poll_share_panel", { p_game_id: gameId })).tasks.find(t => t.id === declined.id)).toMatchObject({ hidden: true, status: "cancelled" });
    await anonymousPage.goto(links[1]);
    await expect(anonymousPage.locator("#title")).toContainText(/cofnięt|anulowan|nieważn|niedostępn|wygasło/i);
    const voted = panel.tasks.find(t => t.recipient_user_id === friendId);
    expect((await rpc(ownerPage, "poll_share_remove", { p_game_id: gameId, p_task_id: voted.id })).ok).toBe(true);
    const rows = await ownerPage.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("poll_text_entries").select("id").eq("game_id", id);
      if (error) throw error; return data;
    }, gameId);
    expect(rows).toEqual([]);
  } finally {
    if (gameId) await ownerPage.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId).catch(() => {});
    if (friendId) await cleanup(ownerPage, friendId).catch(() => {});
    await Promise.all([ownerContext.close(), friendContext.close(), anonymousContext.close()]);
  }
});

test("ankieta: odbiorca z kontem nie przechodzi starym kanałem Subskrybentów", async ({ page, context, browser }) => {
  await loginAsPooledTestUser(page, context, 0);
  const recipientContext = await browser.newContext({ serviceWorkers: "block" });
  const recipientPage = await recipientContext.newPage();
  let gameId = null, subId = null, recipientId = null;
  try {
    await loginAsTestUser(recipientPage, recipientContext, { username: testAccountUsername(8) });
    recipientId = await recipientPage.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    await cleanup(page, recipientId);
    const ids = await page.evaluate(async ({ recipientId, email }) => {
      const sb = window.__sbClient;
      const ownerId = (await sb.auth.getUser()).data.user.id;
      const { data: areFriends, error: friendError } = await sb.rpc("are_friends", { a: ownerId, b: recipientId });
      if (friendError || areFriends) throw friendError || new Error("fixture must have no accepted Friendship");
      const { data, error } = await sb.rpc("e2e_registered_subscriber_fixture", { p_remove: false });
      if (error || !data?.ok) throw new Error(error?.message || data?.err || "registered subscriber fixture failed");
      return data;
    }, { recipientId, email: testAccountUsername(8) });
    subId = ids.id;
    const game = await seedPoll(page);
    gameId = game.id;
    await rpc(page, "poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
    const direct = await rpc(page, "poll_share_send", { p_game_id: gameId, p_friend_ids: [], p_subscriber_ids: [subId] });
    expect(direct).toMatchObject({ ok: true, created: 0, mail: [] });
    const legacy = await rpc(page, "polls_hub_share_poll", { p_game_id: gameId, p_sub_ids: [subId] });
    expect(legacy).toMatchObject({ ok: true, created: 0, mail: [] });
    const rows = await page.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("poll_tasks").select("id").eq("game_id", id);
      if (error) throw error;
      return data;
    }, gameId);
    expect(rows).toEqual([]);
    await page.goto(`https://www.familiada.online/polls/?id=${gameId}`);
    await page.locator("#btnAddRecipients").click();
    await expect(page.locator("#pollRecipientsOverlay")).toBeVisible();
    await expect(page.locator("#pollRecipientsSubs .shareRow").filter({ hasText: testAccountUsername(8) })).toHaveCount(0);
  } finally {
    if (subId) await rpc(page, "e2e_registered_subscriber_fixture", { p_remove: true });
    if (gameId) await page.evaluate(async id => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId);
    if (recipientId) await cleanup(page, recipientId);
    await recipientContext.close();
  }
});

test("ankieta: mail-off daje zadanie mimo zegara, bez maila i przypomnienia", async ({ page, context, browser }) => {
  test.setTimeout(150_000);
  await loginAsPooledTestUser(page, context, 0);
  const recipientContext = await browser.newContext({ serviceWorkers: "block" });
  const recipient = await recipientContext.newPage();
  let gameId, user, previous;
  const setFlag = enabled => recipient.evaluate(async ({ id, enabled }) => {
    const { error } = await window.__sbClient.from("user_flags").upsert({ user_id: id, email_notifications: enabled });
    if (error) throw error;
  }, { id: user.id, enabled });
  try {
    await loginAsPooledTestUser(recipient, recipientContext, 1);
    user = await recipient.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user);
    await cleanup(page, user.id);
    previous = await recipient.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("user_flags").select("email_notifications").eq("user_id", id).maybeSingle();
      if (error) throw error; return data?.email_notifications ?? true;
    }, user.id);
    const friendship = await rpc(page, "friends_invite", { p_handle: user.email });
    expect((await rpc(recipient, "friends_accept", { p_id: friendship.id })).ok).toBe(true);
    const game = await seedPoll(page); gameId = game.id;
    await rpc(page, "poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
    const ownerId = await page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    const target = `pair:${ownerId}:${user.id}:game:${gameId}`;
    await setFlag(true);
    const reserved = await rpc(page, "mail_cooldown_reserve", { p_action_key: "poll:share", p_target_key: target });
    expect(reserved[0].ok).toBe(true);
    expect((await rpc(page, "poll_share_panel", { p_game_id: gameId })).friends.find(f => f.user_id === user.id).cooldown_until).toBeTruthy();
    await setFlag(false);
    const after = new Date().toISOString();
    await page.goto(`https://www.familiada.online/polls/?id=${gameId}`);
    await page.locator("#btnAddRecipients").click();
    const friend = page.locator("#pollRecipientsFriends .shareRow").filter({ hasText: user.email.split("@")[0] });
    await expect(friend.locator('input')).toBeEnabled(); await friend.locator('input').check();
    await page.locator("#pollRecipientsAdd").click();
    await expect(page.locator("#subsGrid .shareRow")).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator("#subsGrid [data-act=remind]")).toHaveCount(0);
    const panel = await rpc(page, "poll_share_panel", { p_game_id: gameId });
    expect(panel.tasks[0]).toMatchObject({ email_enabled: false, reminder_count: 0, cooldown_until: null, status: "pending" });
    expect(await rpc(page, "poll_share_remind", { p_game_id: gameId, p_task_id: panel.tasks[0].id })).toMatchObject({ ok: true, mail_allowed: false, mail: [] });
    expect((await rpc(page, "mail_cooldown_check", { p_action_key: "poll:share", p_target_key: target })).at(0).next_allowed_at).toBe(reserved[0].next_allowed_at);
    const delivery = await readMailDelivery({ recipient: user.email, after });
    expect(delivery.queue || []).toEqual([]); expect(delivery.events || []).toEqual([]);
    const task = await page.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("poll_tasks").select("token,email_sent_at,email_send_count,reminder_count").eq("game_id", id).single();
      if (error) throw error; return data;
    }, gameId);
    expect(task).toMatchObject({ email_sent_at: null, email_send_count: 0, reminder_count: 0 });
    const qid = await page.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("questions").select("id").eq("game_id", id).eq("ord", 1).single();
      if (error) throw error; return data.id;
    }, gameId);
    await rpc(recipient, "poll_text_submit_batch", { p_game_id: gameId, p_key: panel.tasks[0].share_key_poll,
      p_voter_token: `task:${panel.tasks[0].id}`, p_items: [{ question_id: qid, answer_raw: "Kot", answer_norm: "kot" }] });
    expect(await rpc(recipient, "poll_task_done", { p_token: task.token })).toBe("votes_incomplete");
    expect(await rpc(recipient, "poll_task_decline", { p_token: task.token })).toBe("ok");
    const entries = await page.evaluate(async id => {
      const { data, error } = await window.__sbClient.from("poll_text_entries").select("id").eq("game_id", id);
      if (error) throw error; return data;
    }, gameId);
    expect(entries).toEqual([]);
    const kept = await rpc(page, "poll_share_send", { p_game_id: gameId, p_friend_ids: [user.id], p_subscriber_ids: [] });
    expect(kept).toMatchObject({ ok: true, created: 0, kept: 1, mail: [] });
  } finally {
    if (previous !== undefined) await setFlag(previous);
    if (gameId) await page.evaluate(async id => { const { error } = await window.__sbClient.from("games").delete().eq("id", id); if (error) throw error; }, gameId);
    if (user) await cleanup(page, user.id);
    await recipientContext.close();
  }
});

test("ankieta: wspólny UI i stany odbiorców, checkboxy, zegary, scroll oraz akcje390/1400", async ({ page, context }) => {
  test.setTimeout(150_000);
  await loginAsPooledTestUser(page, context, 0);
  const game = await seedPoll(page);
  const future = new Date(Date.now() + 12 * 3600000).toISOString();
  const panel = { ok: true,
    friends: Array.from({ length: 20 }, (_, n) => ({ user_id: `f${n}`, label: `Znajomy ${n}`, email: `f${n}@example.net`, email_enabled: true, cooldown_until: n === 0 ? future : null })),
    subscribers: Array.from({ length: 20 }, (_, n) => ({ id: `s${n}`, email: `s${n}@example.net`, email_enabled: true, cooldown_until: n === 0 ? future : null })),
    tasks: [
      { id: "pending", label: "Alicja", recipient_user_id: "r1", status: "pending", email_enabled: true, cooldown_until: future },
      { id: "opened", label: "Bartek", recipient_user_id: "r2", status: "opened", email_enabled: true, reminder_count: 0 },
      { id: "muted", label: "Cezary", recipient_user_id: "r3", status: "pending", email_enabled: false },
      { id: "done", label: "Dorota", recipient_user_id: "r4", status: "done", email_enabled: true },
      { id: "declined", label: "Ewa", recipient_user_id: "r5", status: "declined", email_enabled: true },
      { id: "limited", label: "Filip", recipient_user_id: "r6", status: "pending", email_enabled: true, reminder_count: 2 },
      { id: "hidden", label: "Grzegorz", recipient_user_id: "f19", status: "declined", email_enabled: true, hidden: true },
      ...Array.from({ length: 20 }, (_, n) => ({ id: `t${n}`, label: `Odbiorca ${n}`, recipient_user_id: `r${n + 10}`, status: "pending", email_enabled: false })),
    ] };
  await page.route("**/rest/v1/rpc/poll_share_panel", route => route.fulfill({ json: panel }));
  await page.route("**/rest/v1/rpc/poll_share_remind", route => route.fulfill({ json: { ok: false, err: "cooldown", cooldown_until: future } }));
  try {
    await rpc(page, "poll_open", { p_game_id: game.id, p_key: game.share_key_poll });
    for (const width of [1400, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`https://www.familiada.online/polls/?id=${game.id}`);
      await expect(page.locator('#subsGrid .shareRow')).toHaveCount(26, { timeout: 30_000 });
      for (const id of ["muted", "done", "declined"]) await expect(page.locator(`#subsGrid [data-id="${id}"] [data-act=remind]`)).toHaveCount(0);
      for (const id of ["pending", "limited"]) await expect(page.locator(`#subsGrid [data-id="${id}"] [data-act=remind]`)).toBeDisabled();
      await expect(page.locator('#subsGrid [data-id=hidden]')).toHaveCount(0);
      const geometry = await page.evaluate(() => {
        const sections = [...document.querySelectorAll('#secShare .pollSec')].map(e => Math.round(e.getBoundingClientRect().width));
        const buttons = [...document.querySelectorAll('#subsGrid [data-id=pending] .shareRowActions button')].map(e => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]);
        const actions = [...document.querySelectorAll('#pollActions .btn')].filter(e => e.getBoundingClientRect().height).map(e => e.getBoundingClientRect().height);
        return { sections, buttons, actions, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(new Set(geometry.sections).size).toBe(1);
      expect(geometry.buttons[0]).toEqual(geometry.buttons[1]); expect(geometry.overflow).toBe(false);
      for (const height of geometry.actions) expect(height).toBeLessThanOrEqual(36);
      await page.locator('#subsGrid [data-id=opened] [data-act=remind]').click();
      await expect(page.locator('#appToast')).toHaveClass(/show/); await expect(page.locator('#appToast')).not.toHaveClass(/show/, { timeout: 6000 });
      await page.locator('#btnAddRecipients').click();
      await expect(page.locator('#pollRecipientsFriends [data-id=f0] input')).toBeDisabled();
      await expect(page.locator('#pollRecipientsFriends [data-id=f0]')).toHaveClass(/is-cooling-down/);
      await expect(page.locator('#pollRecipientsFriends [data-id=f19]')).toHaveCount(0);
      await expect(page.locator('#pollRecipientsSubs [data-id=s0] input')).toBeDisabled();
      await page.locator('#pollRecipientsFriends [data-id=f1] input').check();
      await expect(page.locator('#pollRecipientsAdd')).toBeEnabled();
      const scroll = await page.evaluate(() => {
        const lists = [document.querySelector('#pollRecipientsFriends .shareList'), document.querySelector('#pollRecipientsSubs .shareList')];
        lists[0].scrollTop = 70; lists[1].scrollTop = 120;
        return lists.map(e => e.scrollTop);
      });
      expect(scroll).toEqual([70, 120]);
      await page.screenshot({ path: test.info().outputPath(`shot-poll-recipients-${width}.png`), fullPage: true });
      await page.locator('#pollRecipientsCancel').click();
      await page.screenshot({ path: test.info().outputPath(`shot-poll-sharing-${width}.png`), fullPage: true });
    }
    await rpc(page, "poll_stop", { p_game_id: game.id });
    await page.reload(); await expect(page.locator('#btnAddRecipients')).toBeDisabled();
    await expect(page.locator('#subsGrid [data-id=opened] [data-act=remind]')).toBeDisabled();
  } finally {
    await page.unroute("**/rest/v1/rpc/poll_share_panel"); await page.unroute("**/rest/v1/rpc/poll_share_remind");
    await page.evaluate(async id => { const { error } = await window.__sbClient.from("games").delete().eq("id", id); if (error) throw error; }, game.id);
  }
});

test("ankieta: trzy dostarczone maile zachowują limit24h po usunięciu taska i gry", async ({ page, context }) => {
  test.setTimeout(600_000);
  await loginAsPooledTestUser(page, context, 0);
  let gameId;
  try {
    await rpc(page, "e2e_subscriber_email_cleanup", { p_email: subscriberEmail });
    expect((await rpc(page, "e2e_poll_mail_budget_cleanup", { p_recipient_email: subscriberEmail })).ok).toBe(true);
    await clearMailbox(subscriberEmail); await resetMailProviderLimits(page);
    for (let n = 0; n < 3; n++) {
      // Ten helper czyści task/sub i podłogę pary; nie czyści trwałego budżetu342.
      await rpc(page, "e2e_subscriber_email_cleanup", { p_email: subscriberEmail });
      const sub = await rpc(page, "subscribers_invite", { p_email: subscriberEmail });
      expect((await rpc(page, "poll_sub_accept_email", { p_token: sub.token, p_email: subscriberEmail })).ok).toBe(true);
      const game = await seedPoll(page); gameId = game.id;
      await rpc(page, "poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
      const after = new Date(Date.now() - 1000).toISOString();
      await page.goto(`https://www.familiada.online/polls/?id=${gameId}`);
      await page.locator('#btnAddRecipients').click();
      await page.locator('#pollRecipientsSubs .shareRow').filter({ hasText: subscriberEmail }).locator('input').check();
      await page.locator('#pollRecipientsAdd').click();
      await expect(page.locator('#subsGrid .shareRow')).toHaveCount(1, { timeout: 30_000 });
      const email = await waitForEmail({ recipient: subscriberEmail, after, subject: new RegExp(game.name), timeout: 150_000 });
      expect(extractHttpLinks(email).some(url => new URL(url).pathname === '/go/' && new URL(url).searchParams.has('t'))).toBe(true);
      await expect.poll(async () => (await readMailDelivery({ recipient: subscriberEmail, after })).queue || [], { timeout: 30_000 }).toEqual([]);
      await page.evaluate(async id => { const { error } = await window.__sbClient.from('games').delete().eq('id', id); if (error) throw error; }, gameId);
      gameId = null;
    }
    const game = await seedPoll(page); gameId = game.id;
    await rpc(page, "poll_open", { p_game_id: gameId, p_key: game.share_key_poll });
    const panel = await rpc(page, "poll_share_panel", { p_game_id: gameId });
    const sub = panel.subscribers.find(s => s.email === subscriberEmail);
    expect(Date.parse(sub.cooldown_until)).toBeGreaterThan(Date.now() + 20 * 3600000);
    const after = new Date().toISOString();
    expect(await rpc(page, "poll_share_send", { p_game_id: gameId, p_friend_ids: [], p_subscriber_ids: [sub.id] })).toMatchObject({ ok: true, created: 0, blocked: 1, mail: [] });
    await page.goto(`https://www.familiada.online/polls/?id=${gameId}`);
    await page.locator('#btnAddRecipients').click();
    const row = page.locator('#pollRecipientsSubs .shareRow').filter({ hasText: subscriberEmail });
    await expect(row).toHaveClass(/is-cooling-down/); await expect(row.locator('input')).toBeDisabled();
    expect((await rpc(page, "poll_share_panel", { p_game_id: gameId })).tasks).toEqual([]);
    const delivery = await readMailDelivery({ recipient: subscriberEmail, after });
    expect(delivery.queue || []).toEqual([]); expect(delivery.events || []).toEqual([]);
  } finally {
    if (gameId) await page.evaluate(async id => { const { error } = await window.__sbClient.from('games').delete().eq('id', id); if (error) throw error; }, gameId);
    await rpc(page, "e2e_subscriber_email_cleanup", { p_email: subscriberEmail });
    await rpc(page, "e2e_poll_mail_budget_cleanup", { p_recipient_email: subscriberEmail });
    await clearMailbox(subscriberEmail);
  }
});
