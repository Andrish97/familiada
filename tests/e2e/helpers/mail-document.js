const { expect } = require('@playwright/test');
const { extractHttpLinks } = require('./mailbox');
function expectMailDocument(email, { lang = 'pl', accountFooter = false, globalUnsub = false, text = [] } = {}) {
  const html = email.body_html || '';
  expect(html, 'mail has the common document and explicit language').toContain(`<html lang="${lang}">`);
  expect(html).toContain('max-width:560px');
  expect(html).toContain('font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif');
  expect(html).not.toMatch(/backdrop-filter|text-transform:uppercase/);
  for (const value of text) expect(html).toContain(value);
  const links = extractHttpLinks(email).map(link => new URL(link));
  if (accountFooter || globalUnsub) {
    const footer = links.find(link => link.pathname === '/go/' && /^[a-f0-9]{64}$/.test(link.searchParams.get('m') || ''));
    expect(footer, 'private notification center footer for every notification recipient').toBeTruthy();
    expect(footer.searchParams.get('lang')).toBe(lang);
    expect(html).toContain('data-familiada-mail-center');
  }
}
function escapeMailText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
module.exports = { expectMailDocument, escapeMailText };
