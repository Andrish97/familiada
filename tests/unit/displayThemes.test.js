import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTheme } from "../../web/shared/js/display/theme_modern.js";

function elements() {
  return { svg: { innerHTML: "", setAttribute() {}, querySelector: () => null, querySelectorAll: () => [], style: { setProperty() {} }, classList: { toggle() {} } }, bg: { innerHTML: "", style: {} } };
}

test("all registered themes provide six panels and host factories", async () => {
  const registry = JSON.parse(await readFile(new URL("../../web/shared/data/display-themes.json", import.meta.url)));
  assert.equal(registry.default, "classic");
  for (const entry of registry.themes) {
    assert.deepEqual(Object.keys(entry.label).sort(), ["en", "pl", "uk"]);
    const { createTheme } = await import(new URL(`../../web/shared/js/display/${entry.module}`, import.meta.url));
    const { svg, bg } = elements();
    if (entry.key === "classic") svg.querySelectorAll = () => [];
    const theme = createTheme(svg, bg, { colors: { A: "#123456", B: "#abcdef" }, controls: { B: true } });
    assert.equal(theme.name, entry.key);
    assert.equal(Object.keys(theme.displays).length, 6);
    assert.equal(theme.getColors().A, "#123456");
    assert.equal(theme.getControls().B, true);
    const host = await import(new URL(`../../web${entry.hostModule}`, import.meta.url));
    const props = new Map();
    host.createTheme({ style: { setProperty: (k, v) => props.set(k, v) } });
    assert.ok(props.get("--host-paper-bg"));
    theme.destroy?.();
  }
});

test("modern cancels the old color transition and does not rebuild stripes on color updates", () => {
  const callbacks = new Map();
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  let id = 0;
  globalThis.requestAnimationFrame = fn => { callbacks.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = n => callbacks.delete(n);
  try {
    const { svg, bg } = elements();
    const theme = createTheme(svg, bg);
    const content = svg.innerHTML;
    assert.equal(callbacks.size, 0);
    theme.updateControls({ A: true });
    assert.equal(callbacks.size, 1);
    theme.updateControls({ B: true });
    assert.equal(callbacks.size, 1);
    theme.updateColors({ A: "#123456" });
    assert.equal(svg.innerHTML, content);
    theme.destroy();
    assert.equal(callbacks.size, 0);
    theme.updateControls({ A: false });
    assert.equal(callbacks.size, 0);
  } finally {
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

test("reduced motion applies the active team color immediately without animation frames", () => {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const { svg, bg } = elements();
    const theme = createTheme(svg, bg);
    theme.updateControls({ A: true });
    assert.equal(theme.getControls().A, true);
    assert.match(svg.innerHTML, /prefers-reduced-motion/);
    theme.destroy();
  } finally { globalThis.matchMedia = previous; }
});


test("explicit theme choice applies only its optional background; same selection preserves custom background", async () => {
  const { chooseDisplayTheme } = await import("../../web/shared/js/display/theme-config.js");
  const display = { theme: "classic", logoId: "logo", colors: { A: "#25a56a", B: "#ef8e24", DOT: "#d7ff3d", BACKGROUND: "#123456" } };
  const chosen = chooseDisplayTheme(display, { key: "wings", defaultBackground: "#152238" });
  assert.equal(chosen.colors.BACKGROUND, "#152238");
  assert.equal(chosen.colors.A, display.colors.A);
  assert.equal(chosen.colors.B, display.colors.B);
  assert.equal(chosen.logoId, display.logoId);
  assert.equal(display.colors.BACKGROUND, "#123456");
  chosen.colors.BACKGROUND = "#987654";
  assert.equal(chooseDisplayTheme(chosen, { key: "wings", defaultBackground: "#152238" }), chosen);
  assert.equal(chooseDisplayTheme(chosen, { key: "modern" }).colors.BACKGROUND, "#987654");
});
