import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('drawer: desktop stays usable; narrow panels exclude hidden content, close each other and restore focus', async () => {
  class Element extends EventTarget {
    constructor() {
      super(); this.classes = new Set(); this.attrs = {}; this.isConnected = true;
      this.classList = { contains: name => this.classes.has(name), toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) };
    }
    setAttribute(name, value) { this.attrs[name] = value; }
    contains(el) { return el === this.child; }
    focus() { document.activeElement = this; }
  }
  const old = { window: globalThis.window, document: globalThis.document, CustomEvent: globalThis.CustomEvent };
  const media = new EventTarget(); media.matches = false;
  const doc = new EventTarget(); doc.activeElement = null;
  globalThis.document = doc;
  globalThis.window = { matchMedia: () => media };
  globalThis.CustomEvent = class extends Event { constructor(type, opts) { super(type); this.detail = opts.detail; } };
  try {
    const source = fs.readFileSync(new URL('../../web/shared/js/core/drawer.js', import.meta.url), 'utf8');
    const { bindDrawer } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const panel = new Element(), backdrop = new Element(), toggle = new Element();
    let measured = 0;
    const drawer = bindDrawer({ panel, backdrop, toggle, beforeOpen: () => measured++ });
    assert.equal(panel.inert, false);
    drawer.open(); assert.equal(drawer.isOpen(), false); assert.equal(measured, 0);
    media.matches = true; media.dispatchEvent(new Event('change'));
    assert.equal(panel.inert, true);
    toggle.dispatchEvent(new Event('click'));
    assert.equal(drawer.isOpen(), true); assert.equal(toggle.attrs['aria-expanded'], 'true');
    assert.equal(panel.inert, false); assert.equal(measured, 1);
    panel.child = new Element(); doc.activeElement = panel.child;
    backdrop.dispatchEvent(new Event('click'));
    assert.equal(drawer.isOpen(), false); assert.equal(panel.inert, true);
    assert.equal(doc.activeElement, toggle);
    drawer.open();
    const second = bindDrawer({ panel: new Element(), backdrop: new Element() });
    second.open(); assert.equal(drawer.isOpen(), false); assert.equal(second.isOpen(), true);
    const key = new Event('keydown', { cancelable: true }); key.key = 'Escape'; doc.dispatchEvent(key);
    assert.equal(second.isOpen(), false); assert.equal(key.defaultPrevented, true);
    drawer.open(); media.matches = false; media.dispatchEvent(new Event('change'));
    assert.equal(drawer.isOpen(), false); assert.equal(panel.inert, false);
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
