import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LONG_COLS, layoutLongText, measureLongText, clipLongText, dropUnsupported } from "../../web/shared/js/display/long-text.js";
import { buildGlyphMap } from "../../web/shared/js/display/fonts.js";

const glyphs = buildGlyphMap(JSON.parse(readFileSync(new URL("../../web/shared/fonts/display/font_5x7.json", import.meta.url))));

// Długie pole Wyświetlacza (nazwy drużyn): 95 kolumn, znaki proporcjonalnie
// z rzeczywistej czcionki, 1 kolumna przerwy, spacja 3 kolumny.
test("width comes from the real glyphs, not from the number of characters", () => {
  assert.equal(LONG_COLS, 95);
  assert.equal(layoutLongText("W", glyphs).width, 5);
  assert.equal(layoutLongText(".", glyphs).width, 2);
  assert.equal(layoutLongText("!", glyphs).width, 1);
  assert.equal(layoutLongText("A B", glyphs).width, 5 + 1 + 3 + 1 + 5);
  // 16 × „W” = 95 kolumn -- dokładnie pełne pole.
  assert.equal(measureLongText("W".repeat(16), glyphs).fits, true);
  assert.equal(measureLongText("W".repeat(17), glyphs).fits, false);
});

test("narrow characters leave room for more text", () => {
  const dots = ".".repeat(16);
  assert.equal(measureLongText(`${dots}KOT`, glyphs).fits, true);
  assert.ok(clipLongText(`${dots}KOTY I PSY`, glyphs).length > 16);
  assert.equal(clipLongText("W".repeat(20), glyphs), "W".repeat(16));
  assert.ok(layoutLongText(clipLongText("Wesołe Króliczki z Wąchocka", glyphs), glyphs).width <= LONG_COLS);
});

test("characters without a Display glyph are reported", () => {
  assert.deepEqual(measureLongText("Króliczki", glyphs).invalid, []);
  assert.deepEqual(measureLongText("Drużyna 😀", glyphs).invalid, ["😀"]);
});

// Decyzja 2026-10-20: znak bez glifu jest pomijany razem z jedną spacją za nim.
test("characters without a Display glyph are skipped with one following space", () => {
  assert.equal(dropUnsupported("Kawa 😀 z mlekiem", glyphs), "Kawa z mlekiem");
  assert.equal(dropUnsupported("Jogurt ♥ owoc", glyphs), "Jogurt owoc");
  assert.equal(dropUnsupported("Zajączki 😀", glyphs), "Zajączki ");
  assert.equal(dropUnsupported("😀😀 Ekipa", glyphs), "Ekipa");
  assert.equal(dropUnsupported("Ekipa nr 1!", glyphs), "Ekipa nr 1!");
  // Na długim polu pominięty znak nie zostawia luki.
  assert.equal(layoutLongText("Kotki 😀 Psy", glyphs).width, layoutLongText("Kotki Psy", glyphs).width);
});
