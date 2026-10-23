import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { normHex, hexToRgb, rgbToHex } = await import("../../web/shared/js/core/color.js");

test("kolor: jeden zapis #RRGGBB, odczyt dawnych zapisów, błędny -> null", () => {
  assert.equal(normHex("#c4002f"), "#C4002F");
  assert.equal(normHex("C4002F"), "#C4002F");
  assert.equal(normHex(" #abc "), "#AABBCC");
  for (const bad of ["", null, undefined, "#12345", "#GGGGGG", "red"]) assert.equal(normHex(bad), null);
  assert.deepEqual(hexToRgb("#4da3ff"), { r: 77, g: 163, b: 255 });
  assert.equal(hexToRgb("zły"), null);
  assert.equal(rgbToHex(77, 163, 255), "#4DA3FF");
  assert.equal(rgbToHex(-5, 300, "x"), "#00FF00");
  assert.equal(rgbToHex(12.6, 0, 0), "#0D0000");
});

test("kolor: Ustawienia gry i znaczniki Eksploratora bez własnych kopii funkcji", () => {
  for (const file of ["../web/games/settings/js/game-settings.js", "../web/bases/explorer/js/tags-modal.js"]) {
    const src = fs.readFileSync(new URL(file, import.meta.url.replace(/unit\/[^/]+$/, "")), "utf8");
    assert.match(src, /from "\.\.\/\.\.\/\.\.\/shared\/js\/core\/color\.js/);
    assert.doesNotMatch(src, /function (normHex|hexToRgb|rgbToHex)\b/);
  }
});
