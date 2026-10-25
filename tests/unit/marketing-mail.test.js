import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adminPanelSource } from "./helpers/admin-source.js";
const read = path => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const renderer = 'data:text/javascript;base64,' + Buffer.from(read('supabase/functions/_shared/mail-document.js')).toString('base64');
const source = read('web/shared/js/core/marketing-mail.js').replace(/from "[^\"]+"/, `from "${renderer}"`);
const { buildMarketingMailHtml } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('marketing templates share document, escaped title and withdrawal/footer while retaining editable HTML', () => {
  for (const template of ['invitation','newsletter','custom']) {
    const html = buildMarketingMailHtml({ template, subject: '<Campaign> & name', bodyHtml:'<p><strong>Editor body</strong></p>' });
    assert.ok(html.includes('<html lang="pl">'));
    assert.ok(html.includes('max-width:560px'));
    assert.ok(html.includes('&lt;Campaign&gt; &amp; name'));
    assert.ok(html.includes('krótką wiadomość zwrotną'));
    assert.ok(html.includes('kontakt@familiada.online'));
    assert.doesNotMatch(html,/text-transform:uppercase|backdrop-filter/);
    assert.equal((html.match(/<!doctype html>/gi)||[]).length,1);
    if (template === 'invitation') {
      assert.ok(html.includes('Pytania na trzy sposoby'));
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
test('marketing preview and send use the same builder; skipped compose retains editor and skipped batch retains recipients', () => {
  const settings = adminPanelSource();
  const preview = settings.slice(settings.indexOf('async function mktRefreshPreview'), settings.indexOf('function mktParseEmails'));
  const send = settings.slice(settings.indexOf('async function sendMarketing'));
  for (const part of [preview,send]) {
    assert.match(part,/buildMarketingMailHtml\(\{ template: mktActiveTpl, subject, bodyHtml \}\)/);
    assert.doesNotMatch(part,/<!DOCTYPE html>/i);
  }
  const compose = settings.slice(settings.indexOf('async function sendComposeWithSignature'),settings.indexOf('function showComposePreview'));
  assert.ok(compose.indexOf('if (json.queued === 0)') < compose.indexOf('closeCompose()'));
  assert.match(compose,/if \(json\.queued === 0\) \{[\s\S]+?return;/);
  assert.ok(send.indexOf('if (!json.queued) return;') < send.indexOf('emailInput.value = ""'));
});

test('Worker dependency binaries use real paths without browser cache query', () => {
  const lock = JSON.parse(read('cloudflare/maintenance-worker/package-lock.json'));
  for (const entry of Object.values(lock.packages)) {
    for (const binary of Object.values(entry.bin || {})) assert.doesNotMatch(binary, /\?v=/);
  }
  assert.equal(lock.packages['node_modules/wrangler'].bin.wrangler, 'bin/wrangler.js');
});
