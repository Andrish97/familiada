import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const read = file => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function layoutHarness() {
  const frames = [], events = [], listeners = {};
  let mutation;
  const attributes = new Set(['data-layout-pending']);
  const root = { classList: { contains: () => false }, removeAttribute: attr => attributes.delete(attr) };
  const context = vm.createContext({
    document: { documentElement: root, readyState: 'interactive', addEventListener: (event, cb) => { listeners[event] = cb; } },
    MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} },
    performance: { getEntriesByType: () => [{ domContentLoadedEventStart: 0 }] },
    requestAnimationFrame: cb => frames.push(cb),
    window: { dispatchEvent: event => events.push(event.type) }, Event, console,
  });
  vm.runInContext(`${read('web/shared/js/core/page-layout.js').replace(/export /g, '')}; globalThis.api = { registerPageLayout, holdPageLayout, holdSkeletonLayout };`, context);
  return { context, frames, events, listeners, attributes, mutation: records => mutation(records), api: context.api };
}

test('pierwsza klatka czeka na DOMContentLoaded, tłumaczenia i obydwa pomiary', async () => {
  const h = layoutHarness();
  let resolve;
  h.api.holdPageLayout(new Promise(done => { resolve = done; }));
  const measures = [];
  h.api.registerPageLayout(() => measures.push(h.attributes.has('data-layout-pending')));
  assert.equal(h.frames.length, 0, 'interactive nie oznacza, że moduły stron już się wykonały');
  h.listeners.DOMContentLoaded();
  assert.equal(h.frames.length, 0, 'słownik jeszcze niegotowy');
  resolve(); await tick();
  h.frames.shift()();
  assert.ok(h.attributes.has('data-layout-pending'));
  h.frames.shift()();
  assert.deepEqual(measures, [true, true]);
  assert.equal(h.attributes.has('data-layout-pending'), false);
  assert.deepEqual(h.events, ['page:shown']);
});

test('błąd inicjalizacji zwalnia bramkę; nowa obietnica między klatkami wstrzymuje odsłonięcie', async () => {
  const h = layoutHarness();
  h.listeners.DOMContentLoaded();
  h.frames.shift()();
  let reject;
  h.api.holdPageLayout(new Promise((_, fail) => { reject = fail; }));
  h.frames.shift()();
  assert.ok(h.attributes.has('data-layout-pending'));
  reject(new Error('offline')); await tick();
  h.frames.shift()(); h.frames.shift()();
  assert.equal(h.attributes.has('data-layout-pending'), false);
});

test('odczyt geometrii wstrzymuje tylko własny etap, a gotowe etapy i powłoka pozostają widoczne', async () => {
  const h = layoutHarness();
  h.listeners.DOMContentLoaded(); h.frames.shift()(); h.frames.shift()();
  const step = (ready = false) => {
    const classes = new Set(ready ? ['skel-step-ready'] : []);
    return { matches: () => classes.has('skel-step-ready'), classList: {
      contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key),
    } };
  };
  const pending = step(), loaded = step(true);
  let resolve;
  h.api.holdSkeletonLayout([pending, loaded], new Promise(done => { resolve = done; }));
  pending.classList.add('skel-step-ready');
  h.mutation([{ type: 'attributes', target: pending, oldValue: '' }]);
  assert.equal(pending.classList.contains('skel-step-ready'), false);
  assert.equal(loaded.classList.contains('skel-step-ready'), true);
  assert.equal(h.attributes.has('data-layout-pending'), false);
  resolve(); await tick();
  assert.equal(pending.classList.contains('skel-step-ready'), true);
});

test('błąd danych zwalnia etap po wszystkich zgłoszeniach geometrii', async () => {
  const h = layoutHarness(), classes = new Set();
  const step = { matches: () => classes.has('skel-step-ready'), classList: {
    contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key),
  } };
  let first, fail;
  h.api.holdSkeletonLayout(step, new Promise(done => { first = done; }));
  h.api.holdSkeletonLayout(step, new Promise((_, reject) => { fail = reject; }));
  classes.add('skel-step-ready'); h.mutation([{ type: 'attributes', target: step, oldValue: '' }]);
  first(); await tick();
  assert.equal(classes.has('skel-step-ready'), false);
  fail(new Error('offline')); await tick();
  assert.equal(classes.has('skel-step-ready'), true);
});

test('bootstrap ustawia telefon przed body, resetuje etap HTML i ma niezależny bezpiecznik', () => {
  const attributes = new Set(), classes = new Set(['page-loading']), callbacks = [];
  const root = { dataset: {}, toggleAttribute: (k, enabled) => enabled ? attributes.add(k) : attributes.delete(k),
    setAttribute: k => attributes.add(k), removeAttribute: k => attributes.delete(k), classList: { remove: k => classes.delete(k), contains: k => classes.has(k) } };
  let timeout;
  const context = vm.createContext({ document: { documentElement: root, readyState: 'loading', addEventListener() {} },
    window: { innerWidth: 390, innerHeight: 844, screen: { width: 390, height: 844 }, matchMedia: q => ({ matches: q.includes('coarse') }) },
    navigator: { maxTouchPoints: 1 }, MutationObserver: class { constructor(fn) { callbacks.push(fn); } observe() {} disconnect() {} },
    setTimeout: fn => { timeout = fn; }, clearTimeout() {} });
  vm.runInContext(read('web/shared/js/core/page-boot.js'), context);
  assert.equal(root.dataset.device, 'phone');
  assert.equal(root.dataset.input, 'touch');
  assert.ok(attributes.has('data-compact') && attributes.has('data-sheet') && attributes.has('data-layout-pending'));
  let reset = false;
  callbacks[0]([{ addedNodes: [{ nodeType: 1, matches: () => true, classList: { remove: () => { reset = true; } }, querySelectorAll: () => [] }] }]);
  assert.ok(reset, 'treść HTML dla przeglądarki bez JS czeka na potwierdzenie hydracji');
  timeout();
  assert.equal(attributes.has('data-layout-pending'), false);
  assert.equal(classes.has('page-loading'), false);
  context.document.readyState = 'complete';
  timeout = undefined;
  const late = vm.createContext({ ...context, FamiliadaDevice: undefined, FamiliadaPageBoot: undefined });
  vm.runInContext(read('web/shared/js/core/page-boot.js'), late);
  assert.ok(late.FamiliadaDevice, 'profil istnieje także przy późnym imporcie');
  assert.equal(attributes.has('data-layout-pending'), false, 'późny import nie chowa działającej strony');
  assert.equal(timeout, undefined);
});

test('audyt rozdziela etap ukryty i widoczny, pomija interakcje i zatrzymuje się przed krokami sceny', () => {
  const { observeLayoutShifts } = createRequire(import.meta.url)('../../scripts/screens/audit-layout.cjs');
  let deliver, mutation, now = 10, loading = true;
  const context = vm.createContext({
    document: { body: {}, documentElement: { classList: { contains: () => loading }, hasAttribute: () => false } },
    performance: { now: () => now },
    MutationObserver: class { constructor(cb) { mutation = cb; } observe() {} disconnect() {} },
    PerformanceObserver: class { static supportedEntryTypes = ['layout-shift']; constructor(cb) { deliver = entries => cb({ getEntries: () => entries }); } observe() {} takeRecords() { return []; } disconnect() {} },
  });
  context.window = context;
  vm.runInContext(`(${observeLayoutShifts})();`, context);
  deliver([{ startTime: 5, value: .1, sources: [] }]);
  loading = false; now = 20; mutation([]);
  deliver([{ startTime: 30, value: .02, sources: [] }, { startTime: 35, value: .5, hadRecentInput: true, sources: [] }]);
  const result = context.__screensLayoutAudit.stop();
  assert.equal(result.shown, 20);
  assert.equal(result.before, .1);
  assert.equal(result.after, .02);
  assert.equal(result.shifts.length, 1);
  deliver([{ startTime: 40, value: .5, sources: [] }]);
  assert.equal(context.__screensLayoutAudit.shifts.length, 2);
});
