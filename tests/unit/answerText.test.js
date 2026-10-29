import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGlyphMap, hasDisplayGlyph } from "../../web/shared/js/display/fonts.js";
import { answerInvalidChars, cleanAnswerText, charLength, clipChars, limitAnswerInput } from "../../web/shared/js/core/answer-text.js";

const fontJson = JSON.parse(readFileSync(new URL("../../web/shared/fonts/display/font_5x7.json", import.meta.url)));
const glyphs = buildGlyphMap(fontJson);

test("SQL ma te same znaki co font_5x7.json (migracja 404)", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/2026-10-20_404_e21_rules_engine.sql", import.meta.url), "utf8");
  const lit = sql.match(/fam_display_glyph_chars\(\) RETURNS text\nLANGUAGE sql IMMUTABLE PARALLEL SAFE AS \$f\$ SELECT '((?:[^']|'')*)'::text/);
  assert.ok(lit, "brak literału w migracji");
  const keys = Object.entries(fontJson).filter(([g]) => g !== "meta").flatMap(([, v]) => Object.keys(v)).join("");
  assert.equal(lit[1].replace(/''/g, "'"), keys);
});

test("znaki według czcionki: małe litery z wielkim odpowiednikiem, NFC", () => {
  for (const ch of ["ą", "ż", "ł", "ї", "ґ", "є", "a", "Z", "7", "?", " "]) assert.ok(hasDisplayGlyph(glyphs, ch) || ch === " ", ch);
  assert.equal(hasDisplayGlyph(glyphs, "😀"), false);
  assert.equal(hasDisplayGlyph(glyphs, "ß"), false); // „SS” to dwa znaki -- jak upper() w SQL
  assert.deepEqual(answerInvalidChars("é ą", glyphs), []); // é, ą złożone
  assert.deepEqual(answerInvalidChars("a😀b👍😀", glyphs), ["😀", "👍"]);
});

test("czyszczenie odpowiedzi -- jak public.fam_answer_clean", () => {
  assert.equal(cleanAnswerText(" Kawa 😀  z  mlekiem!!! ", glyphs), "Kawa z mlekiem!!!");
  assert.equal(cleanAnswerText("😀😀", glyphs), "");
  assert.equal(cleanAnswerText("a\tb", glyphs), "a b");
  assert.equal(charLength(cleanAnswerText("x".repeat(20) + "😀", glyphs)), 17);
});

test("limit 17 liczony pełnymi znakami, bez rozcinania par UTF-16", () => {
  const s = "😀".repeat(18);
  assert.equal(charLength(limitAnswerInput(s)), 17);
  assert.equal(clipChars("ab😀cd", 3), "ab😀");
  assert.equal(limitAnswerInput("x".repeat(17)), "x".repeat(17));
});
