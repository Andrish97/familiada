import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = path => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const common = await import('data:text/javascript;base64,' + Buffer.from(read('supabase/functions/_shared/mail-document.js')).toString('base64'));
const source = read('web/shared/js/core/compose-mail.js');
const context = vm.createContext({ renderRichMailDocument: common.renderRichMailDocument, escapeMailText: common.escapeMailText });
vm.runInContext(source.replace(/^import .*;\n/gm, '').replace('export function ', 'function '), context);
test('manual mail keeps rich editor formatting; escapes subject, quote and signatures in PL/EN/UK', () => {
  for (const lang of ['pl','en','uk']) {
    const html = context.buildComposeMailHtml({ lang, subject: '<Subject>', bodyHtml: '<p><strong>Bold</strong></p>#quote', quote: '<img src=x>\n$&', greeting: '<Greeting>', farewell: '<Farewell>\nTeam' });
    assert.ok(html.includes(`<html lang="${lang}">`));
    assert.ok(html.includes('<p><strong>Bold</strong></p>'));
    assert.ok(html.includes('&lt;Subject&gt;'));
    assert.ok(html.includes('&lt;Greeting&gt;,'));
    assert.ok(html.includes('&lt;Farewell&gt;<br>Team'));
    assert.ok(html.includes('&lt;img src=x&gt;<br>$&amp;'));
    assert.doesNotMatch(html, /<img|#quote|href=/);
    assert.ok(html.includes('max-width:560px'));
  }
});
test('manual mail removes missing quotes, adds greeting comma once and does not duplicate signature', () => {
  const html = context.buildComposeMailHtml({ lang: 'pl', subject: 'Mail', bodyHtml: '<p>Body</p>#quote', greeting: 'Hello,', farewell: 'Team' });
  assert.doesNotMatch(html, /#quote|Hello,,|<blockquote/);
  assert.equal((html.match(/Hello,/g) || []).length, 1);
  assert.equal((html.match(/Team/g) || []).length, 1);
});
