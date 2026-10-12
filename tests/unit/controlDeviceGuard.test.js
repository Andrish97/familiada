import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../web/shared/js/core/device-guard.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/m, '')
  .replace(/export /g, '');
const load = (width, height, touch) => new Function('window', 'navigator', `${source}; return deviceGuardState;`)(
  {innerWidth:width, innerHeight:height, screen:{width,height}, matchMedia:()=>({matches:touch})},
  {maxTouchPoints:touch?1:0});

test('Control: niski ekran komputera nie jest telefonem; pozostałe strony zachowują regułę', () => {
  const state = load(1280, 650, false);
  assert.equal(state(980, true), 'ok');
  assert.equal(state(980), 'phone');
});
test('Control: telefon dotykowy pozostaje zablokowany także w poziomie', () => {
  assert.equal(load(1200, 390, true)(980, true), 'phone');
});
test('Control: okno komputera za wąskie pozostaje zablokowane', () => {
  assert.equal(load(800, 650, false)(980, true), 'narrow');
});
