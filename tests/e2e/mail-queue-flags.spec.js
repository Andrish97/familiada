const { test, expect } = require('@playwright/test');
const { loginAsPooledTestUser } = require('./helpers/login');
const { readMailDelivery } = require('./helpers/mailbox');
test.use({ serviceWorkers: 'block' });
test('mail queue: flag checked at insertion reports queued0 and keeps queue empty', async ({ page, context, browser }) => {
  test.setTimeout(90000);
  await loginAsPooledTestUser(page, context, 0);
  const receiverContext = await browser.newContext({ serviceWorkers: 'block' });
  const receiver = await receiverContext.newPage();
  let recipientId = null, savedFlag = null;
  try {
    await loginAsPooledTestUser(receiver, receiverContext, 1);
    const identity = await receiver.evaluate(async () => {
      const client = window.__sbClient, user = (await client.auth.getUser()).data.user;
      const { data, error } = await client.from('user_flags').select('email_notifications').eq('user_id', user.id).maybeSingle();
      if (error) throw new Error(error.message);
      return { id: user.id, email: user.email, flag: data?.email_notifications ?? true };
    });
    recipientId = identity.id; savedFlag = identity.flag;
    await receiver.evaluate(async id => {
      const { error } = await window.__sbClient.from('user_flags').upsert({ user_id: id, email_notifications: false });
      if (error) throw new Error(error.message);
    }, recipientId);
    const after = new Date().toISOString();
    const result = await page.evaluate(async email => {
      const { data } = await window.__sbClient.auth.getSession();
      const response = await fetch('https://api.familiada.online/functions/v1/send-mail', {
        method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, subject: 'E2E-MAIL-QUEUE-MUTED', html: '<p>Flag boundary check</p>', cooldownActionKey: 'friend:invite', cooldownTargetKey: `email:${email.toLowerCase()}` }),
      });
      return { status: response.status, body: await response.json() };
    }, identity.email);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, queued: 0, results: [{ to: identity.email, ok: true, queued: false, skipped: true, reason: 'notifications_disabled' }] });
    const actual = await readMailDelivery({ recipient: identity.email, after });
    expect(actual.queue).toEqual([]); expect(actual.events).toEqual([]);
  } finally {
    if (recipientId && savedFlag !== null) await receiver.evaluate(async ({ id, value }) => {
      const { error } = await window.__sbClient.from('user_flags').upsert({ user_id: id, email_notifications: value });
      if (error) throw new Error(error.message);
    }, { id: recipientId, value: savedFlag });
    await receiverContext.close();
  }
});
