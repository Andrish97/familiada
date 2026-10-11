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
  if (accountFooter) {
    const settings = links.find(link => link.pathname === '/account/');
    expect(settings, 'account notification settings footer').toBeTruthy();
    expect(settings.searchParams.get('lang')).toBe(lang);
    expect(links.some(link => link.searchParams.has('u'))).toBe(false);
  }
  if (globalUnsub) {
    const unsubscribe = links.find(link => link.pathname === '/go/' && link.searchParams.has('u'));
    expect(unsubscribe, 'anonymous global notification footer').toBeTruthy();
    expect(unsubscribe.searchParams.get('lang')).toBe(lang);
  }
}
function escapeMailText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
module.exports = { expectMailDocument, escapeMailText };
