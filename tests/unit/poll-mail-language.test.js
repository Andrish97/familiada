const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../web/shared/js/core/poll-mail.js'), 'utf8');
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
