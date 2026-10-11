import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const renderer = 'data:text/javascript;base64,' + Buffer.from(read('supabase/functions/_shared/mail-document.js')).toString('base64');
const source = read('web/shared/js/core/stored-mail.js').replace(/from "[^\"]+"/, `from "${renderer}"`);
const { buildStoredMailHtml } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('stored full mail document is previewed unchanged, without a second header, nested document or CSS overrides', () => {
  for (const html of ['<!doctype html><html lang="uk"><body style="background:#123">Mail</body></html>','<HTML lang="en"><body>Mail</body></HTML>']) {
    assert.equal(buildStoredMailHtml({subject:'Second title',body_html:html}),html);
  }
});
test('stored HTML fragments keep formatting; plain messages are escaped with correct language', () => {
  const fragment = buildStoredMailHtml({subject:'<Subject>',body_html:'<p><strong>Body</strong></p>',lang:'en'});
  assert.ok(fragment.includes('<html lang="en">'));
  assert.ok(fragment.includes('&lt;Subject&gt;'));
  assert.ok(fragment.includes('<strong>Body</strong>'));
  const plain = buildStoredMailHtml({subject:'Subject',body:'<img src=x> & text',lang:'invalid'});
  assert.ok(plain.includes('<html lang="pl">'));
  assert.ok(plain.includes('&lt;img src=x&gt; &amp; text'));
  assert.doesNotMatch(plain,/<img/);
});
test('all five Settings message and thread previews use the saved document helper', () => {
  const settings = read('web/settings/js/settings.js');
  assert.equal((settings.match(/buildStoredMailHtml\(msg\)/g)||[]).length,5);
  assert.doesNotMatch(settings,/\.email-container \{|\* \{ background: #050914 !important/);
});
