import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const renderer = 'data:text/javascript;base64,' + Buffer.from(read('supabase/functions/_shared/mail-document.js')).toString('base64');
const source = read('web/shared/js/core/marketing-mail.js').replace(/from "[^\"]+"/, `from "${renderer}"`);
const { buildMarketingMailHtml } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('marketing templates share document, escaped title and withdrawal/footer while retaining editable HTML', () => {
  for (const template of ['invitation','custom']) {
    const html = buildMarketingMailHtml({ template, subject: '<Campaign> & name', bodyHtml:'<p><strong>Editor body</strong></p>' });
    assert.ok(html.includes('<html lang="pl">'));
    assert.ok(html.includes('max-width:560px'));
    assert.ok(html.includes('&lt;Campaign&gt; &amp; name'));
    assert.ok(html.includes('krótką wiadomość zwrotną'));
    assert.ok(html.includes('kontakt@familiada.online'));
    assert.doesNotMatch(html,/text-transform:uppercase|backdrop-filter/);
    assert.equal((html.match(/<!doctype html>/gi)||[]).length,1);
    if (template === 'invitation') {
      assert.ok(html.includes('Trzy sposoby na przygotowanie gry'));
      // Mail informuje o darmowym systemie — nie jest ofertą (prośba właściciela).
      assert.ok(html.includes('To nie jest oferta handlowa'));
      assert.ok(!/Państwa ofercie/.test(html));
      assert.ok(html.includes('Widok prowadzącego i Przycisk do pojedynku'));
      assert.equal((html.match(/<img /g)||[]).length,3);
      // Pierwszy obraz: grafika OG strony (wersja do maila), potem kadry systemu zrzutów.
      const first = html.match(/<img [^>]*src="([^"]+)"/)[1];
      assert.match(first, /^https:\/\/familiada\.online\/assets\/img\/og\/og-image-mail\.webp/);
      assert.ok(fs.existsSync(new URL('../../web/assets/img/og/og-image-mail.webp', import.meta.url)));
      assert.ok(!html.includes('poll-vote-mobile'));
      for (const image of ['control-round','host-round']) {
        const file = `assets/img/pl/shots/${image}-preview.webp`;
        assert.ok(html.includes(`https://familiada.online/${file}`));
        assert.ok(fs.existsSync(new URL('../../web/' + file, import.meta.url)));
      }
      assert.ok(html.includes('Poznaj system familiada.online'));
      assert.ok(!html.includes('Editor body'));
    } else assert.ok(html.includes('<strong>Editor body</strong>'));
  }
});


test('Worker dependency binaries use real paths without browser cache query', () => {
  const lock = JSON.parse(read('cloudflare/maintenance-worker/package-lock.json'));
  for (const entry of Object.values(lock.packages)) {
    for (const binary of Object.values(entry.bin || {})) assert.doesNotMatch(binary, /\?v=/);
  }
  assert.equal(lock.packages['node_modules/wrangler'].bin.wrangler, 'bin/wrangler.js');
});

test('custom HTML preserves complete documents and wraps fragments without nesting documents', () => {
  const document = '<!DOCTYPE html><html lang="pl"><head><style>p{color:red}</style></head><body><p>Własny układ</p></body></html>';
  assert.equal(buildMarketingMailHtml({ template: 'custom', subject: 'Temat', bodyMode: 'html', bodyHtml: document }), document);
  const fragment = buildMarketingMailHtml({ template: 'custom', subject: '<Temat>', bodyMode: 'html', bodyHtml: '<p>Fragment</p>' });
  assert.match(fragment, /<p>Fragment<\/p>/);
  assert.match(fragment, /&lt;Temat&gt;/);
  assert.equal((fragment.match(/<!doctype html>/gi) || []).length, 1);
  const invitation = buildMarketingMailHtml({ template: 'invitation', subject: 'Zaproszenie', bodyMode: 'html', bodyHtml: document });
  assert.match(invitation, /Trzy sposoby na przygotowanie gry/);
  assert.doesNotMatch(invitation, /Własny układ/);
});
