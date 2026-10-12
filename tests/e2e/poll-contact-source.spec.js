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

test("@mailbox ankieta353: cofnięcie źródła po rejestracji usuwa partial i zamyka Go", async ({ browser }) => {
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
  const email = "test15@familiada.online";
  let oldRecipientId = null;
  try {
    await restoreTestAccount("test15");
    await loginAsTestUser(owner, ownerContext, { username: testAccountUsername(7) });
    await loginAsTestUser(recipient, recipientContext, { username: email });
    oldRecipientId = await recipient.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    expect((await rpc(owner, "e2e_poll_mail_budget_cleanup", { p_recipient_email: email })).ok).toBe(true);
    expect((await rpc(owner, "e2e_friendships_cleanup", { p_other_user_id: oldRecipientId })).ok).toBe(true);
    await owner.evaluate(async () => {
      const sb = window.__sbClient;
      const uid = (await sb.auth.getUser()).data.user.id;
      const { error } = await sb.from("games").delete().eq("owner_id", uid).like("name", "E2E-353-%");
      if (error) throw error;
    });
    await clearMailbox(email);
    await resetMailProviderLimits(owner);
    // Account15 is explicitly reserved for deletion and recreated in finally.
    await recipient.goto("https://www.familiada.online/account/");
    await recipient.waitForSelector("[data-skel-step].skel-step-ready", { timeout: 20000 });
    await recipient.locator("#deletePassword").fill(process.env.TEST_PASSWORD);
    const firstDeletion = recipient.waitForResponse(response => response.url().includes("/functions/v1/delete-account") && response.request().method() === "POST", { timeout: 30000 });
    await recipient.locator("#deleteAccount").click();
    expect(await (await firstDeletion).json()).toMatchObject({ ok: true });
    await recipient.waitForURL(/login/, { timeout: 30000 });
    expect((await rpc(owner, "e2e_subscriber_email_cleanup", { p_email: email })).ok).toBe(true);
    const subscription = await rpc(owner, "subscribers_invite", { p_email: email });
    expect(subscription.ok).toBe(true);
    const subscriptionMail = await rpc(owner, "polls_hub_subscriber_resend", { p_id: subscription.id });
    expect(subscriptionMail.unsub_token).toBeTruthy();
    await anonymous.goto("https://www.familiada.online/");
    await anonymous.waitForFunction(() => !!window.__sbClient);
    // Subscription is fixture setup via public RPC; actual poll mails are delivered below.
    expect((await rpc(anonymous, "poll_sub_accept_email", { p_token: subscription.token, p_email: email })).ok).toBe(true);
    let previousMailAt = 0;
    for (const type of ["poll_text", "poll_points"]) {
      const wait = previousMailAt + 62000 - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      const game = await owner.evaluate(async type => {
        const sb = window.__sbClient;
        const user = (await sb.auth.getUser()).data.user;
        const { data: game, error } = await sb.from("games").insert({ owner_id: user.id, name: "E2E-353-" + type + "-" + Date.now(), type, status: "draft", share_key_poll: crypto.randomUUID() }).select("id,name,share_key_poll").single();
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
      fixture.share_key_poll = await owner.evaluate(async id => {
        const { data, error } = await window.__sbClient.from("games").select("share_key_poll").eq("id", id).single();
        if (error) throw error;
        return data.share_key_poll;
      }, game.id);
      const sharing = await rpc(owner, "poll_share_send" , { p_game_id: game.id, p_friend_ids: [], p_subscriber_ids: [subscription.id] });
      expect(sharing).toMatchObject({ ok: true, created: 1 });
      fixture.taskId = sharing.mail[0].task_id;
      const source = await owner.evaluate(async id => {
        const { data, error } = await window.__sbClient.from("poll_tasks").select("source_subscription_id,source_friendship_id,source_kind").eq("id", id).single();
        if (error) throw error;
        return data;
      }, fixture.taskId);
      expect(source).toEqual({ source_subscription_id: subscription.id, source_friendship_id: null, source_kind: "subscriber" });
      const after = new Date(Date.now() - 2000).toISOString();
      const sent = await owner.evaluate(async ({ mailItems, name }) => {
        const { sendPollInviteMails } = await import("/shared/js/core/poll-mail.js");
        const currentUser = (await window.__sbClient.auth.getUser()).data.user;
        return sendPollInviteMails({ mailItems, pollName: name, currentUser });
      }, { mailItems: sharing.mail, name: game.name });
      expect(sent).toMatchObject({ sent: 1, failed: 0 });
      previousMailAt = Date.now();
      const mail = await waitForEmail({ recipient: email, after, subject: new RegExp(game.name), timeout: 150000 });
      expectMailDocument(mail, { globalUnsub: true });
      fixture.link = extractHttpLinks(mail).find(link => new URL(link).pathname === "/go/" && new URL(link).searchParams.has("t"));
      expect(fixture.link).toBeTruthy();
      fixture.token = new URL(fixture.link).searchParams.get("t");
      await anonymous.goto(fixture.link);
      await anonymous.waitForFunction(() => !!window.__sbClient);
      expect(await rpc(anonymous, "poll_task_opened", { p_token: fixture.token })).toBe("ok");
      const emailTask = (await rpc(owner, "poll_share_panel", { p_game_id: game.id })).tasks.find(task => task.id === fixture.taskId);
      expect(emailTask.recipient_user_id).toBeNull();
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
      fixture.items = items;
      if (type === "poll_points") {
        await rpc(anonymous, "poll_points_vote_batch", { p_game_id: game.id, p_key: fixture.share_key_poll, p_voter_token: "task:" + fixture.taskId, p_items: items });
        expect(await rpc(anonymous, "poll_task_done", { p_token: fixture.token })).toBe("votes_incomplete");
      }
    }
    const restored = await restoreTestAccount("test15");
    expect(restored.admin_excluded).toBe(true);
    expect(restored.user_id).not.toBe(oldRecipientId);
    await loginAsTestUser(recipient, recipientContext, { username: email });
    const registeredId = await recipient.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
    for (const fixture of games) {
      const task = (await rpc(owner, "poll_share_panel", { p_game_id: fixture.id })).tasks.find(task => task.id === fixture.taskId);
      expect(task.recipient_user_id).toBe(registeredId);
      expect(task.recipient_email).toBeNull();
      expect(await rpc(anonymous, "poll_task_opened", { p_token: fixture.token })).toBe("not_your_task");
      const denied = await anonymous.evaluate(async fixture => {
        const { error } = await window.__sbClient.rpc(fixture.type === "poll_text" ? "poll_text_submit_batch" : "poll_points_vote_batch", { p_game_id: fixture.id, p_key: fixture.share_key_poll, p_voter_token: "task:" + fixture.taskId, p_items: fixture.items });
        return error?.message || null;
      }, fixture);
      expect(denied).toContain("Not your task");
      await anonymous.goto(fixture.link);
      await expect(anonymous.getByRole("button", { name: /zaloguj|log in/i })).toBeVisible();
      await recipient.goto(fixture.link);
      await recipient.waitForFunction(() => !!window.__sbClient);
      expect(await rpc(recipient, "poll_task_opened", { p_token: fixture.token })).toBe("ok");
    }
    await rpc(recipient, "poll_text_submit_batch", { p_game_id: games[0].id, p_key: games[0].share_key_poll, p_voter_token: "task:" + games[0].taskId, p_items: games[0].items });
    expect(await rpc(recipient, "poll_task_done", { p_token: games[0].token })).toBe("ok");
    oldRecipientId = registeredId;
    const count = async fixture => owner.evaluate(async fixture => {
      const { count, error } = await window.__sbClient.from(fixture.type === "poll_text" ? "poll_text_entries" : "poll_votes").select("id", { head: true, count: "exact" }).eq("game_id", fixture.id).eq("voter_token", "task:" + fixture.taskId);
      if (error) throw error;
      return count;
    }, fixture);
    expect(await count(games[0])).toBe(10);
    expect(await count(games[1])).toBe(1);
    expect((await rpc(owner, "polls_hub_subscriber_remove", { p_id: subscription.id })).ok).toBe(true);
    expect(await count(games[0])).toBe(10);
    expect(await count(games[1])).toBe(0);
    expect((await rpc(owner, "poll_share_panel", { p_game_id: games[0].id })).tasks).toHaveLength(1);
    expect((await rpc(owner, "poll_share_panel", { p_game_id: games[1].id })).tasks).toHaveLength(0);
    for (const fixture of games) {
      for (const page of [recipient, anonymous]) {
        await page.goto(fixture.link);
        await expect(page.locator("#title")).toContainText(/wygas|nieważn|nieprawidł|niedostępn/i);
        const denied = await page.evaluate(async fixture => {
          const { error } = await window.__sbClient.rpc(fixture.type === "poll_text" ? "poll_text_submit_batch" : "poll_points_vote_batch", { p_game_id: fixture.id, p_key: fixture.share_key_poll, p_voter_token: "task:" + fixture.taskId, p_items: fixture.items });
          return error?.message || null;
        }, fixture);
        expect(denied).toMatch(/Task unavailable|Not your task/);
      }
    }
    await recipient.goto("https://www.familiada.online/account/");
    await recipient.waitForSelector("[data-skel-step].skel-step-ready", { timeout: 20000 });
    await recipient.locator("#deletePassword").fill(process.env.TEST_PASSWORD);
    const deletionResponse = recipient.waitForResponse(response => response.url().includes("/functions/v1/delete-account") && response.request().method() === "POST", { timeout: 30000 });
    await recipient.locator("#deleteAccount").click();
    const deletion = await deletionResponse;
    expect(deletion.status()).toBe(200);
    expect(await deletion.json()).toMatchObject({ ok: true });
    await recipient.waitForURL(/login/, { timeout: 30000 });
    expect(await count(games[0])).toBe(10);
    expect(await count(games[1])).toBe(0);
    for (const fixture of games) expect((await rpc(owner, "poll_share_panel", { p_game_id: fixture.id })).tasks).toHaveLength(0);
    await restoreTestAccount("test15");
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
  } catch (error) {
    console.error("[e2e353] scenario failed:", error.message);
    throw error;
  } finally {
    const cleanup = await Promise.allSettled([
      (async () => {
        await restoreTestAccount("test15");
        const recoveryContext = await browser.newContext();
        try {
          const recoveryPage = await recoveryContext.newPage();
          await loginAsTestUser(recoveryPage, recoveryContext, { username: email });
          expect(await recoveryPage.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.email)).toBe(email);
        } finally { await recoveryContext.close(); }
      })(),
      (async () => {
        expect((await rpc(owner, "e2e_subscriber_email_cleanup", { p_email: email })).ok).toBe(true);
        if (!games.length) return;
        await owner.evaluate(async ids => {
        const { error } = await window.__sbClient.from("games").delete().in("id", ids);
        if (error) throw error;
      }, games.map(game => game.id));
      })(),
    ]);
    await Promise.all([ownerContext.close(), recipientContext.close(), anonymousContext.close()]);
    for (const result of cleanup) if (result.status === "rejected") throw result.reason;
  }
});
