const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { clearMailbox, resetMailProviderLimits, waitForEmail } = require("./helpers/mailbox");

const subscriberEmail = "test14@familiada.online"; // Skrzynka bez konta.
test.use({ serviceWorkers: "block" });
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context }) => {
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(context, { pages: ["polls"] });
});

async function rpc(page, name, args) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw error;
    return data;
  }, { name, args });
}

async function cleanup(ownerPage, friendId) {
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
  test.setTimeout(180000);
  const ownerContext = await browser.newContext({ serviceWorkers: "block" });
  const friendContext = await browser.newContext({ serviceWorkers: "block" });
  const anonymousContext = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.TEST_BRANCH_CODE !== "0") await serveBranchCode(ownerContext, { pages: ["polls"] });
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
    await ownerPage.goto(`https://www.familiada.online/polls?id=${gameId}`, { waitUntil: "domcontentloaded" });
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
    await waitForEmail({ recipient: testAccountUsername(8), after: emailAfter, subject: /Zaproszenie do ankiety/i });
  } finally {
    if (gameId) await ownerPage.evaluate(async (id) => { await window.__sbClient.from("games").delete().eq("id", id); }, gameId).catch(() => {});
    if (friendId) await cleanup(ownerPage, friendId).catch(() => {});
    await Promise.all([ownerContext.close(), friendContext.close(), anonymousContext.close()]);
  }
});
