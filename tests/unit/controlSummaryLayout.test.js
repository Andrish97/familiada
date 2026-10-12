import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const css = fs.readFileSync(path.join(root, "web/control/css/control.css"), "utf8");
const layoutCss = fs.readFileSync(path.join(root, "web/control/css/test-mode.css"), "utf8");
const ui = fs.readFileSync(path.join(root, "web/control/js/ui.js"), "utf8");

test("sekcja dźwięku w podsumowaniu dostaje pełną szerokość i nie ucina etykiety", () => {
  assert.match(layoutCss, /\.c2-summary-grid\s*\{[^}]*overflow-y:auto/);
  assert.match(ui, /class: "c2-summary-columns".*settingSummarySections/);
  const variant = css.match(/\.summarySoundVariant\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(variant, /white-space:\s*normal/);
  assert.match(variant, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(variant, /text-overflow:\s*ellipsis|white-space:\s*nowrap|overflow:\s*hidden/);
});
