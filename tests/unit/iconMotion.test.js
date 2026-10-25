import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('para czeka na widoczność, zatrzymuje się przy ograniczonym ruchu i odpina po usunięciu', () => {
  let visibility, preference, intersect;
  let starts = 0, ends = 0, unobserved = 0;
  const media = { matches: false, addEventListener: (_, fn) => { preference = fn; } };
  const svg = { isConnected: true, matches: () => true, querySelectorAll: selector => selector === 'animate' ? [{ beginElement: () => starts++, endElement: () => ends++ }] : [], toggleAttribute() {} };
  const document = { hidden: false, addEventListener: (_, fn) => { visibility = fn; } };
  const context = vm.createContext({ document, window: { matchMedia: () => media }, IntersectionObserver: class {
    constructor(fn) { intersect = fn; } observe() {} unobserve() { unobserved++; }
  } });
  vm.runInContext(fs.readFileSync(new URL('../../web/shared/js/core/icon-motion.js', import.meta.url), 'utf8').replace(/export /g, '') + ';globalThis.api={observeIconMotion,forgetIconMotion};', context);
  context.api.observeIconMotion(svg); assert.equal(starts, 0);
  intersect([{ target: svg, isIntersecting: true }]); assert.equal(starts, 1);
  document.hidden = true; visibility(); assert.equal(ends, 1);
  document.hidden = false; visibility(); assert.equal(starts, 2);
  media.matches = true; preference(); assert.equal(ends, 2);
  preference(); assert.equal(ends, 2, 'nie zatrzymuje ponownie tej samej animacji');
  media.matches = false; preference(); assert.equal(starts, 3);
  context.api.forgetIconMotion(svg); assert.equal(unobserved, 0, 'przeniesienie w DOM nie odpina połączonej ikony');
  svg.isConnected = false; context.api.forgetIconMotion(svg); assert.equal(ends, 3); assert.equal(unobserved, 1);
  intersect([{ target: svg, isIntersecting: true }]); assert.equal(starts, 3);
});
