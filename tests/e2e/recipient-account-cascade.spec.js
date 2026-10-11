const { test, expect } = require("@playwright/test");
const { serveBranchCode } = require("./helpers/branch-code");
const { loginAsTestUser, testAccountUsername } = require("./helpers/login");
const { clearMailbox, resetMailProviderLimits, waitForEmail, extractHttpLinks, restoreTestAccount } = require("./helpers/mailbox");
const { expectMailDocument } = require("./helpers/mail-document");

async function rpc(page, name, args) {
  return page.evaluate(async ({ name, args }) => {
    const { data, error } = await window.__sbClient.rpc(name, args);
    if (error) throw new Error(name + ": " + error.message);
    return data;
  }, { name, args });
}

test("@mailbox konto348: usunięcie odbiorcy zachowuje komplet, usuwa partial i nie oddaje starych linków nowemu kontu", async ({ browser }) => {
  test.setTimeout(600000);
  const ownerContext = await browser.newContext({ serviceWorkers: "block" });
  const recipientContext = await browser.newContext({ serviceWorkers: "block" });
  const anonymousContext = await browser.newContext({ serviceWorkers: "block" });
  if (process.env.GITHUB_REF_NAME !== "main" && process.env.TEST_BRANCH_CODE !== "0") {
    for (const context of [ownerContext, recipientContext, anonymousContext]) await serveBranchCode(context, { pages: ["polls", "account", "go", "tasks"] });
  }
  const owner = await ownerContext.newPage();
  const recipient = await recipientContext.newPage();
  const anonymous = await anonymousContext.newPage();
  const games = [];
  const email = testAccountUsername(8);
  let oldRecipientId = null;
  try {
    await loginAsTestUser(owner, ownerContext, { username: testAccountUsername(7) });
    await loginAsTestUser(recipient, recipientContext, { username: email });
    oldRecipientId = await recipient.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    await rpc(owner, "e2e_poll_mail_budget_cleanup", { p_recipient_email: email });
    await rpc(owner, "e2e_friendships_cleanup", { p_other_user_id: oldRecipientId });
    await clearMailbox(email);
    await resetMailProviderLimits(owner);
    const invite = await rpc(owner, "friends_invite", { p_handle: email });
    expect(invite.ok).toBe(true);
    expect((await rpc(recipient, "friends_accept", { p_id: invite.id })).ok).toBe(true);
    for (const type of ["poll_text", "poll_points"]) {
      const game = await owner.evaluate(async type => {
        const sb = window.__sbClient;
        const user = (await sb.auth.getUser()).data.user;
        const { data: game, error } = await sb.from("games").insert({ owner_id: user.id, name: "E2E-348-" + type + "-" + Date.now(), type, status: "draft", share_key_poll: crypto.randomUUID() }).select("id,name,share_key_poll").single();
        if (error) throw error;
        for (let ord = 1; ord <= 10; ord++) {
          const { data: question, error: questionError } = await sb.from("questions").insert({ game_id: game.id, ord, text: "Pytanie " + ord }).select("id").single();
          if (questionError) throw questionError;
          if (type === "poll_points") {
            const { error: answerError } = await sb.from("answers").insert([1, 2, 3, 4].map(ord => ({ question_id: question.id, ord, text: "Odpowiedź " + ord })));
            if (answerError) throw answerError;
          }
        }
        return game;
      }, type);
      const fixture = { ...game, type };
      games.push(fixture);
      await rpc(owner, "poll_open", { p_game_id: game.id, p_key: game.share_key_poll });
      const sharing = await rpc(owner, "poll_share_send", { p_game_id: game.id, p_friend_ids: [oldRecipientId], p_subscriber_ids: [] });
      expect(sharing).toMatchObject({ ok: true, created: 1 });
      fixture.taskId = sharing.mail[0].task_id;
      const after = new Date(Date.now() - 2000).toISOString();
      const sent = await owner.evaluate(async ({ mailItems, name }) => {
        const { sendPollInviteMails } = await import("/shared/js/core/poll-mail.js");
        const currentUser = (await window.__sbClient.auth.getUser()).data.user;
        return sendPollInviteMails({ mailItems, pollName: name, currentUser });
      }, { mailItems: sharing.mail, name: game.name });
      expect(sent).toMatchObject({ sent: 1, failed: 0 });
      const mail = await waitForEmail({ recipient: email, after, subject: new RegExp(game.name), timeout: 150000 });
      expectMailDocument(mail, { accountFooter: true });
      fixture.link = extractHttpLinks(mail).find(link => new URL(link).pathname === "/go/" && new URL(link).searchParams.has("t"));
      expect(fixture.link).toBeTruthy();
      fixture.token = new URL(fixture.link).searchParams.get("t");
      await recipient.goto(fixture.link);
      await recipient.waitForFunction(() => !!window.__sbClient);
      expect(await rpc(recipient, "poll_task_opened", { p_token: fixture.token })).toBe("ok");
      const items = await owner.evaluate(async ({ id, type }) => {
        const sb = window.__sbClient;
        const { data: questions, error } = await sb.from("questions").select("id,ord").eq("game_id", id).order("ord");
        if (error) throw error;
        const items = [];
        for (const question of type === "poll_text" ? questions : questions.slice(0, 1)) {
          const { data: answer, error: answerError } = await sb.from("answers").select("id").eq("question_id", question.id).eq("ord", 1).maybeSingle();
          if (answerError) throw answerError;
          items.push({ question_id: question.id, answer_id: answer?.id, answer_raw: "Kot", answer_norm: "kot" });
        }
        return items;
      }, { id: game.id, type });
      await rpc(recipient, type === "poll_text" ? "poll_text_submit_batch" : "poll_points_vote_batch", { p_game_id: game.id, p_key: game.share_key_poll, p_voter_token: "task:" + fixture.taskId, p_items: items });
      expect(await rpc(recipient, "poll_task_done", { p_token: fixture.token })).toBe(type === "poll_text" ? "ok" : "votes_incomplete");
    }
    const count = async fixture => owner.evaluate(async fixture => {
      const { count, error } = await window.__sbClient.from(fixture.type === "poll_text" ? "poll_text_entries" : "poll_votes").select("id", { head: true, count: "exact" }).eq("game_id", fixture.id).eq("voter_token", "task:" + fixture.taskId);
      if (error) throw error;
      return count;
    }, fixture);
    expect(await count(games[0])).toBe(10);
    expect(await count(games[1])).toBe(1);
    await recipient.goto("https://www.familiada.online/account/");
    await recipient.locator("#deletePassword").fill(process.env.TEST_PASSWORD);
    await recipient.locator("#deleteAccount").click();
    await recipient.waitForURL(/login/, { timeout: 30000 });
    expect(await count(games[0])).toBe(10);
    expect(await count(games[1])).toBe(0);
    for (const fixture of games) expect((await rpc(owner, "poll_share_panel", { p_game_id: fixture.id })).tasks).toHaveLength(0);
    await restoreTestAccount(email);
    await loginAsTestUser(recipient, recipientContext, { username: email });
    const newRecipientId = await recipient.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    expect(newRecipientId).not.toBe(oldRecipientId);
    for (const fixture of games) {
      expect(await rpc(recipient, "poll_task_opened", { p_token: fixture.token })).toBe("not_found");
      for (const page of [recipient, anonymous]) {
        await page.goto(fixture.link);
        await expect(page.locator("#title")).toContainText(/wygas|nieważn|nieprawidł|niedostępn/i);
      }
    }
  } finally {
    await restoreTestAccount(email);
    if (games.length) await owner.evaluate(async ids => {
      const { error } = await window.__sbClient.from("games").delete().in("id", ids);
      if (error) throw error;
    }, games.map(game => game.id));
    await Promise.all([ownerContext.close(), recipientContext.close(), anonymousContext.close()]);
  }
});
