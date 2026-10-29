// Treści wszystkich wariantów maili kontaktu (Worker). Ręczne wiadomości,
// szablony marketingowe i podgląd zapisanych maili należą do panelu admina
// (prywatne repo familijna-server, admin-panel/tests/unit).
// E25: Worker nie ma już /_e2e_api/mail-template-fixtures (fikstura pod stary
// adres bez konta), więc dokumenty sprawdzamy po złożeniu, bez wysyłki SMTP.
const { test, expect } = require('./helpers/e2e-test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { expectMailDocument } = require('./helpers/mail-document');
const ROOT = path.resolve(__dirname, '../..');
test.use({ serviceWorkers: 'block' });
// E25: konto wypożyczane na worker (tests/README.md „Test accounts”).
test.use({ needs: { standard: 1 } });
async function templates() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const match = url.pathname.match(/^\/shared\/translation\/(pl|en|uk)\/server\.js$/);
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
    return items;
  } finally { globalThis.fetch = originalFetch; }
}
test('mail content: contact PL/EN/UK rendered', async ({ page }) => {
  test.setTimeout(240000);
  const items = await templates();
  for (const item of items) {
    const email = { subject: item.subject, body_html: item.html };
    expectMailDocument(email, { lang: item.lang });
    const containsText = await page.evaluate(({html,expected}) => new DOMParser().parseFromString(html, 'text/html').body.textContent.includes(expected), { html: email.body_html, expected: item.expected });
    expect(containsText, `rendered text ${item.subject}`).toBe(true);
    expect(email.body_html).not.toContain('<Example>');
  }
});
