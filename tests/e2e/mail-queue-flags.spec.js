const { test, expect } = require('@playwright/test');
const { loginAsPooledTestUser } = require('./helpers/login');
const { readMailDelivery } = require('./helpers/mailbox');
test.use({ serviceWorkers: 'block' });
// send-mail przyjmuje tylko akcję i token powiadomienia (audyt E24, P2):
// HTML i adres od klienta są odrzucane, a token bez przydziału z RPC nie
// trafia do kolejki (wynik „pominięty”, bez wiersza i bez wysyłki).
test('mail queue: send-mail odrzuca HTML klienta, token bez przydziału nie trafia do kolejki', async ({ page, context, browser }) => {
  test.setTimeout(90000);
  await loginAsPooledTestUser(page, context, 0);
  const receiverContext = await browser.newContext({ serviceWorkers: 'block' });
  const receiver = await receiverContext.newPage();
  try {
    await loginAsPooledTestUser(receiver, receiverContext, 1);
    const email = await receiver.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.email);
    const after = new Date().toISOString();
    const results = await page.evaluate(async email => {
      const { data } = await window.__sbClient.auth.getSession();
      const call = async body => {
        const response = await fetch('https://api.familiada.online/functions/v1/send-mail', {
          method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
      };
      const legacy = await call({ to: email, subject: 'E2E-MAIL-QUEUE-LEGACY', html: '<a href="https://www.familiada.online/go/?f=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">x</a>', cooldownActionKey: 'friend:invite', cooldownTargetKey: `email:${email.toLowerCase()}` });
      const forged = await call({ lang: 'pl', items: [{ action: 'friend:invite', token: crypto.randomUUID(), to: email, html: '<p>x</p>' }] });
      return { legacy, forged };
    }, email);
    console.log('[e2e-diag] send-mail legacy', results.legacy.status, results.legacy.body.error, 'forged', results.forged.status);
    expect(results.legacy.status).toBe(400);
    expect(results.legacy.body).toMatchObject({ ok: false, error: 'invalid_notification_request' });
    expect(results.forged.status).toBe(200);
    expect(results.forged.body).toMatchObject({ ok: true, queued: 0, results: [{ ok: true, queued: false, skipped: true }] });
    const actual = await readMailDelivery({ recipient: email, after });
    expect(actual.queue).toEqual([]); expect(actual.events).toEqual([]);
  } finally {
    await receiverContext.close();
  }
});
