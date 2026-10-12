import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../web/shared/js/core/poll-mail.js', import.meta.url), 'utf8');
const helper = source.match(/export function mailLink\(path\) \{[\s\S]*?\n\}/)?.[0].replace('export ', '');
test('poll mail links preserve invitation, withdrawal and account targets with PL/EN/UK language', () => {
  assert.ok(helper);
  for (const lang of ['pl', 'en', 'uk']) {
    const context = vm.createContext({ URL, location: { origin: 'https://www.familiada.online' }, getUiLang: () => lang });
    vm.runInContext(helper, context);
    for (const target of ['/go/?t=task', '/go/?s=sub&action=unsub', '/go/?u=global', '/account/']) {
      const actual = new URL(context.mailLink(target));
      const original = new URL(target, 'https://www.familiada.online');
      assert.equal(actual.pathname, original.pathname);
      assert.equal(actual.searchParams.get('lang'), lang);
      actual.searchParams.delete('lang');
      assert.equal(actual.href, original.href);
    }
  }
});
