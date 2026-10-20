import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LONG_MAX_CHARS, measureLongText, clipLongText } from "../../web/shared/js/display/long-text.js";
import { buildGlyphMap } from "../../web/shared/js/display/fonts.js";

// Długie pole Wyświetlacza (nazwy drużyn): 95 kolumn, znak 5 + przerwa 1.
test("long display field holds exactly 16 characters", () => {
  assert.equal(LONG_MAX_CHARS, 16);
  assert.equal(LONG_MAX_CHARS * 5 + (LONG_MAX_CHARS - 1), 95);
});

test("team names are measured and clipped as the Display draws them", () => {
  assert.equal(clipLongText("Wesołe Króliczki z Wąchocka"), "Wesołe Króliczki");
  assert.equal(clipLongText("Kowalscy"), "Kowalscy");
  // ß rośnie do SS po zamianie na wielkie litery -- liczy się to, co narysuje Wyświetlacz.
  assert.equal(clipLongText("ß".repeat(10)), "ß".repeat(8));
  const m = measureLongText("Króliczki", null);
  assert.deepEqual([m.count, m.max, m.fits], [9, 16, true]);
});

test("characters without a Display glyph are reported", () => {
  const glyphs = buildGlyphMap(JSON.parse(readFileSync(new URL("../../web/shared/fonts/display/font_5x7.json", import.meta.url))));
  assert.deepEqual(measureLongText("Króliczki", glyphs).invalid, []);
  assert.deepEqual(measureLongText("Drużyna 😀", glyphs).invalid, ["😀"]);
});
