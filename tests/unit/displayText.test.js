import test from "node:test";
import assert from "node:assert/strict";
import { clipDisplayText } from "../../web/shared/js/gameplay/displayText.js";

for (const capacity of [11, 17]) {
  test(`board capacity ${capacity}: full text, word boundary, punctuation and cut word`, () => {
    const full = "A".repeat(capacity);
    assert.equal(clipDisplayText(full, capacity), full);
    assert.equal(clipDisplayText(full + " drugi", capacity), full);
    assert.equal(clipDisplayText(full + ", drugi", capacity), full);
    assert.equal(clipDisplayText(full + "—drugi", capacity), full);
    assert.equal(clipDisplayText(full + "B", capacity), "A".repeat(capacity - 3) + ".");
    assert.equal(clipDisplayText("A".repeat(capacity - 1) + " B", capacity), "A".repeat(capacity - 1) + " ");
  });
}

test("Polish and Ukrainian letters are preserved and decomposed accents occupy one slot", () => {
  assert.equal(clipDisplayText("zażółć gęślą", 17), "zażółć gęślą");
  assert.equal(clipDisplayText("телефон із зарядкою", 11), "телефон із ");
  assert.equal(clipDisplayText("n\u0301".repeat(11), 11), "ń".repeat(11));
});

test("a cut word loses one or two trailing vowels in Polish, English and Ukrainian", () => {
  for (const ending of ["a", "ąę", "OU", "ІЇ"]) {
    const consonants = "B".repeat(10 - [...ending].length);
    assert.equal(clipDisplayText(consonants + ending + "zzzz", 11), consonants + ".");
  }
  assert.equal(clipDisplayText("BBBBBBBBBBzz", 11), "BBBBBBBBBB.");
});
