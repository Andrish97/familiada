// Treści wszystkich wariantów kontaktu i ręcznej wiadomości oraz szablonów
// marketingowych. Szablony uruchamiane z kodu repozytorium.
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
test('mail content: contact/manual PL/EN/UK and marketing templates rendered', async ({ page, context }) => {
  test.setTimeout(240000);
  const items = await templates();
  const invitation = items.find(item => item.subject.endsWith('marketing-invitation'));
  const images = [...invitation.html.matchAll(/<img src="([^"]+)"/g)].map(match => match[1]);
  expect(images.length).toBe(4);
  for (const url of images) {
    const response = await context.request.get(url.replace(/&amp;/g, '&'));
    expect(response.status(), `marketing image ${url}`).toBe(200);
    expect(response.headers()['content-type']).toContain('image/webp');
  }
  for (const item of items) {
    const email = { subject: item.subject, body_html: item.html };
    expectMailDocument(email, { lang: item.lang });
    const containsText = await page.evaluate(({html,expected}) => new DOMParser().parseFromString(html, 'text/html').body.textContent.includes(expected), { html: email.body_html, expected: item.expected });
    expect(containsText, `rendered text ${item.subject}`).toBe(true);
    expect(email.body_html).not.toContain('<Example>');
    if (item.type === 'manual') {
      expect(email.body_html).toContain('<strong>Formatted body</strong>');
      expect(email.body_html).not.toContain('#quote');
    }
  }
});

test('mail preview: stored full document, rich fragment and plain text use browser modules', async ({ page, context, accounts, loginAs }) => {
  test.setTimeout(90000);
  if (process.env.GITHUB_REF_NAME !== 'main' && process.env.TEST_BRANCH_CODE !== '0') {
    const { serveBranchCode } = require('./helpers/branch-code');
    await serveBranchCode(context, { pages: ['settings'] });
  }
  await loginAs(page, context, accounts.standard[0]);
  const result = await page.evaluate(async () => {
    const { buildStoredMailHtml } = await import('/shared/js/core/stored-mail.js');
    const { renderMailDocument } = await import('/shared/js/core/mail-document.js');
    const full = renderMailDocument({lang:'pl',title:'Wiadomość testowa',body:'Przykładowa treść'});
    const saved = buildStoredMailHtml({subject:'Nie dokładaj nagłówka',body_html:full});
    const fragment = buildStoredMailHtml({subject:'Fragment',body_html:'<p><strong>Treść</strong></p>',lang:'uk'});
    const plain = buildStoredMailHtml({subject:'Tekst',body:'<img src=x> & tekst',lang:'en'});
    return {full,saved,fragment,plain};
  });
  expect(result.saved).toBe(result.full);
  expect(result.fragment).toContain('<html lang="uk">');
  expect(result.fragment).toContain('<strong>Treść</strong>');
  expect(result.plain).toContain('&lt;img src=x&gt; &amp; tekst');
  expect(result.plain).not.toContain('<img');
});
