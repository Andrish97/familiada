import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../../web/${p}`, import.meta.url), "utf8");

test("wyskakujące menu: jedno położenie z core/popover.js (topbar, język, menu kontekstowe)", () => {
  const popover = read("shared/js/core/popover.js");
  assert.match(popover, /export function placeDropdown\(/);
  assert.match(popover, /export function placeAtPoint\(/);
  for (const [p, fn] of [["shared/js/core/topbar-controller.js", "placeDropdown"], ["shared/translation/translation.js", "placeDropdown"], ["bases/explorer/js/context-menu.js", "placeAtPoint"]]) {
    const src = read(p);
    assert.match(src, new RegExp(`import \\{ ${fn}(, \\w+)* \\} from "[./]*(?:js/core/|shared/js/core/)?popover\\.js`), p);
    assert.doesNotMatch(src, /function (repositionDropdown|repositionMenu|place)\(/, p);
  }
});
