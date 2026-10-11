// Treści wszystkich wariantów kontaktu i ręcznej wiadomości: prawdziwy SMTP
// do test14 bez tworzenia konta. Szablony uruchamiane z kodu repozytorium.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loginAsPooledTestUser } = require('./helpers/login');
const { clearMailbox, waitForEmail, resetMailProviderLimits } = require('./helpers/mailbox');
const { expectMailDocument, escapeMailText } = require('./helpers/mail-document');
const ROOT = path.resolve(__dirname, '../..');
const EMAIL = 'test14@familiada.online';
test.use({ serviceWorkers: 'block' });
async function templates() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const match = url.pathname.match(/^\/shared\/translation\/(pl|en|uk)\.js$/);
    if (match) return new Response(fs.readFileSync(path.join(ROOT, 'web', url.pathname), 'utf8'), { headers: { 'Content-Type': 'text/javascript' } });
    return originalFetch(input, options);
  };
  try {
    const { buildContactEmail } = await import(pathToFileURL(path.join(ROOT, 'cloudflare/maintenance-worker/src/lib/email/contact-email.js')).href);
    const stamp = Date.now(), items = [];
    for (const lang of ['pl','en','uk']) {
      for (const type of ['confirmation','reply','compose']) {
        const ticket = `E2E-PKT6-${stamp}-${lang}-${type}`;
        const message = '<Example> "quoted" & text';
        const mail = await buildContactEmail({ type, lang, ticket, subject: ticket, message, replyMessage: message, originalMessage: message });
        items.push({ ...mail, lang, expected: message, type });
      }
    }
    const renderer = 'data:text/javascript;base64,' + fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/mail-document.js')).toString('base64');
    const composeSource = fs.readFileSync(path.join(ROOT, 'web/shared/js/core/compose-mail.js'), 'utf8').replace(/from "[^\"]+"/, `from "${renderer}"`);
    const { buildComposeMailHtml } = await import('data:text/javascript;base64,' + Buffer.from(composeSource).toString('base64'));
    for (const lang of ['pl','en','uk']) items.push({ lang, type: 'manual', subject: `E2E-PKT6-${stamp}-${lang}-manual`, expected: '<Quote> & text', html: buildComposeMailHtml({ lang, subject: `E2E-PKT6-${stamp}-${lang}-manual`, bodyHtml: '<p><strong>Formatted body</strong></p>#quote', quote: '<Quote> & text', greeting: 'Hello', farewell: 'Team' }) });
    const marketingSource = fs.readFileSync(path.join(ROOT, 'web/shared/js/core/marketing-mail.js'), 'utf8').replace(/from "[^\"]+"/, `from "${renderer}"`);
    const { buildMarketingMailHtml } = await import('data:text/javascript;base64,' + Buffer.from(marketingSource).toString('base64'));
    for (const template of ['invitation','newsletter','custom']) {
      const subject = `E2E-PKT6-${stamp}-marketing-${template}`;
      items.push({ lang:'pl', type: 'marketing', subject, expected: template === 'invitation' ? 'Niezależny widok prowadzącego' : 'Campaign body', html: buildMarketingMailHtml({ template, subject, bodyHtml: '<p><strong>Campaign body</strong></p>' }) });
    }
    return items;
  } finally { globalThis.fetch = originalFetch; }
}
test('mail content: contact/manual PL/EN/UK and marketing templates delivered', async ({ page, context }) => {
  test.setTimeout(240000);
  await loginAsPooledTestUser(page, context, 0);
  const items = await templates();
  const invitation = items.find(item => item.subject.endsWith('marketing-invitation'));
  const images = [...invitation.html.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]);
  expect(images.length).toBe(4);
  for (const url of images) {
    const response = await context.request.get(url.replace(/&amp;/g, '&'));
    expect(response.status(), `marketing image ${url}`).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
  }
  await clearMailbox(EMAIL); await resetMailProviderLimits(page);
  const after = new Date().toISOString();
  try {
    const result = await page.evaluate(async ({ email, items }) => {
      const { data } = await window.__sbClient.auth.getSession();
      const response = await fetch('https://api.familiada.online/functions/v1/send-mail', { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.map(item => ({ to: email, subject: item.subject, html: item.html, cooldownActionKey: 'contact:confirmation', cooldownTargetKey: `email:${email}` })) }) });
      return { status: response.status, body: await response.json() };
    }, { email: EMAIL, items });
    expect(result.status).toBe(200); expect(result.body.queued).toBe(items.length);
    expect(result.body.results.every(item => item.queued)).toBe(true);
    const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const received = await Promise.all(items.map(item => waitForEmail({ recipient: EMAIL, after, subject: new RegExp(`^${escapeRegex(item.subject)}$`), timeout: 180000 })));
    for (let n = 0; n < items.length; n++) {
      const item = items[n], email = received[n];
      expect(email.subject).toBe(item.subject);
      expectMailDocument(email, { lang: item.lang, text: [escapeMailText(item.expected)] });
      expect(email.body_html).not.toContain('<Example>');
      if (item.type === 'manual') {
        expect(email.body_html).toContain('<strong>Formatted body</strong>');
        expect(email.body_html).not.toContain('#quote');
      }
    }
  } finally { await clearMailbox(EMAIL); }
});
