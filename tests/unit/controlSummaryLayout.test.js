import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const css = fs.readFileSync(path.join(root, "web/control/css/control.css"), "utf8");
const page = fs.readFileSync(path.join(root, "web/control/index.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "web/control/js/ui.js"), "utf8");

test("sekcja dźwięku w podsumowaniu dostaje pełną szerokość i nie ucina etykiety", () => {
  assert.match(page, /\.c2-summary-columns\s*>\s*\.c2-summary-sound\s*\{\s*grid-column:\s*1\s*\/\s*-1\s*;/);
  assert.match(ui, /h\("div",\s*\{\s*class:\s*"c2-summary-columns"\s*\},\s*settingSummarySections\)/);
  const variant = css.match(/\.summarySoundVariant\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(variant, /white-space:\s*normal/);
  assert.match(variant, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(variant, /text-overflow:\s*ellipsis|white-space:\s*nowrap|overflow:\s*hidden/);
});
