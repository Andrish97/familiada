import { test, expect } from '@playwright/test';
import loginHelpers from './helpers/login.js';
import mailboxHelpers from './helpers/mailbox.js';

const { loginAsTestUser, testAccountUsername } = loginHelpers;
const { clearMailbox, waitForEmail, extractHttpLinks } = mailboxHelpers;

async function userId(page) {
  return page.evaluate(async () => (await window.__sbClient.auth.getUser()).data.user.id);
}

async function cleanupPair(page, otherId) {
  await page.evaluate(async (id) => {
    const { data, error } = await window.__sbClient.rpc('e2e_poll_subscriptions_cleanup', { p_other_user_id: id });
    if (error || data?.ok === false) throw error || new Error(JSON.stringify(data));
  }, otherId);
}

async function makeActiveSubscription(ownerPage, recipientPage, recipientEmail) {
  const invited = await ownerPage.evaluate(async (email) => {
    const { data, error } = await window.__sbClient.rpc('polls_hub_subscription_invite', { p_recipient: email });
    if (error || data?.ok === false) throw error || new Error(JSON.stringify(data));
    return data.id;
  }, recipientEmail);
  await recipientPage.evaluate(async (id) => {
    const { data, error } = await window.__sbClient.rpc('polls_hub_subscription_accept', { p_id: id });
    if (error || data?.ok === false) throw error || new Error(JSON.stringify(data));
  }, invited);
}

async function seedOpenPoll(page, type, name) {
  return page.evaluate(async ({ type, name }) => {
    const sb = window.__sbClient;
    const ownerId = (await sb.auth.getUser()).data.user.id;
    const { data: game, error } = await sb.from('games')
      .insert({ name, owner_id: ownerId, type, status: 'draft' }).select('id').single();
    if (error) throw error;
    for (let ord = 1; ord <= 10; ord++) {
      const { data: question, error: qError } = await sb.from('questions')
        .insert({ game_id: game.id, ord, text: `Pytanie ${ord}` }).select('id').single();
      if (qError) throw qError;
      if (type === 'poll_points') {
        for (let answerOrd = 1; answerOrd <= 3; answerOrd++) {
          const { error: aError } = await sb.from('answers').insert({
            question_id: question.id, ord: answerOrd, text: `Odpowiedź ${answerOrd}`,
          });
          if (aError) throw aError;
        }
      }
    }
    const { error: openError } = await sb.from('games').update({ status: 'poll_open' }).eq('id', game.id);
    if (openError) throw openError;
    return game.id;
  }, { type, name });
}

async function deleteGame(page, gameId) {
  await page.evaluate((id) => window.__sbClient.from('games').delete().eq('id', id), gameId);
}

for (const [type, target] of [['poll_text', 'poll-text'], ['poll_points', 'poll-points']]) {
  test(`@mailbox polls hub + poll-go: mail prowadzi do ${target}`, async ({ browser }) => {
    test.setTimeout(360_000);
    const ownerContext = await browser.newContext({ serviceWorkers: 'block' });
    const recipientContext = await browser.newContext({ serviceWorkers: 'block' });
    const ownerPage = await ownerContext.newPage();
    const recipientPage = await recipientContext.newPage();
    const recipient = testAccountUsername(9);
    let gameId;

    try {
      await loginAsTestUser(ownerPage, ownerContext, { username: testAccountUsername(5) });
      await loginAsTestUser(recipientPage, recipientContext, { username: recipient });
      const recipientId = await userId(recipientPage);
      await cleanupPair(ownerPage, recipientId);
      await makeActiveSubscription(ownerPage, recipientPage, recipient);
      await clearMailbox(recipient);
      const after = new Date(Date.now() - 2_000).toISOString();
      const name = `E2E-MAIL-${type}-${Date.now()}`;
      gameId = await seedOpenPoll(ownerPage, type, name);

      await ownerPage.goto('https://www.familiada.online/polls-hub', { waitUntil: 'domcontentloaded' });
      await expect(ownerPage.locator('#pollsListDesktop .hub-item', { hasText: name })).toBeVisible({ timeout: 20_000 });
      await ownerPage.locator('#pollsListDesktop .hub-item', { hasText: name }).click();
      await ownerPage.locator('#btnShare').click();
      const recipientRow = ownerPage.locator('#shareList .hub-share-item', { hasText: /test9/i });
      await expect(recipientRow).toBeVisible();
      await recipientRow.locator('input[type="checkbox"]').check();
      await ownerPage.locator('#btnShareSave').click();

      const email = await waitForEmail({
        recipient,
        after,
        subject: new RegExp(name, 'i'),
        timeout: 300_000,
      });
      expect(`${email.body || ''}\n${email.body_html || ''}`).toContain(name);
      const invitation = extractHttpLinks(email).find((link) => {
        const url = new URL(link);
        return /\/poll-go(?:\.html)?$/.test(url.pathname) && url.searchParams.has('t');
      });
      expect(invitation, 'mail musi zawierać link /poll-go?t=').toBeTruthy();

      await recipientPage.goto(invitation, { waitUntil: 'domcontentloaded' });
      await expect(recipientPage.locator('.poll-go-title')).toContainText(/Zaproszenie|invitation/i);
      await recipientPage.getByRole('button', { name: /Głosuj|Vote/i }).click();
      await recipientPage.waitForURL(new RegExp(`/${target}(?:\\?|$)`));
    } finally {
      if (gameId) await deleteGame(ownerPage, gameId).catch(() => {});
      const recipientId = await userId(recipientPage).catch(() => null);
      if (recipientId) await cleanupPair(ownerPage, recipientId).catch(() => {});
      await clearMailbox(recipient).catch(() => {});
      await ownerContext.close();
      await recipientContext.close();
    }
  });
}

test.describe('polls-hub', () => {
  test('production: strona się ładuje', async ({ page }) => {
    // Test na pure production
    await page.goto('/login');

    // Czekaj aż strona się załaduje
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    expect(await page.locator('input[type="email"]').isVisible()).toBeTruthy();
  });

  test('production: home page dostępna', async ({ page }) => {
    await page.goto('/');

    // Czekaj aż main się załaduje
    await page.waitForSelector('main', { timeout: 10000 });
    expect(await page.locator('main').isVisible()).toBeTruthy();
  });

  test('production: games page dostępna', async ({ page }) => {
    await page.goto('/games');

    // Jeśli nie zalogowany, powinno redirect na login
    // Lub powinno być main element
    const currentUrl = page.url();
    const hasMainOrLogin =
      currentUrl.includes('login') ||
      (await page.locator('main').isVisible({ timeout: 5000 }).catch(() => false));

    expect(hasMainOrLogin).toBeTruthy();
  });

  test('production: brak błędów JS w konsoli (sample)', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Załaduj stronę główną
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Czekaj chwilę na ewentualne JS errory
    await page.waitForTimeout(1000);

    // Powinno być mało error logsów
    expect(errors.length).toBeLessThan(5);
  });
});
