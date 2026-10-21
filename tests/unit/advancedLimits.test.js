import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntInRange, parseMultipliers, finalMaxPoints, roundsMaxPoints, ADVANCED_LIMITS, FINAL_TARGET_MAX } from "../../web/games/settings/js/advanced-limits.js";

test("parseIntInRange: tylko liczby całkowite w zakresie", () => {
  assert.equal(parseIntInRange("200", ADVANCED_LIMITS.finalTarget), 200);
  assert.equal(parseIntInRange(" 480 ", ADVANCED_LIMITS.finalTarget), 480);
  assert.equal(parseIntInRange("481", ADVANCED_LIMITS.finalTarget), null);
  assert.equal(parseIntInRange("0", ADVANCED_LIMITS.finalTarget), null);
  assert.equal(parseIntInRange("12.5", ADVANCED_LIMITS.finalMinPoints), null);
  assert.equal(parseIntInRange("", ADVANCED_LIMITS.finalMinPoints), null);
  assert.equal(parseIntInRange("-3", ADVANCED_LIMITS.finalMinPoints), null);
  assert.equal(FINAL_TARGET_MAX, 480);
});

test("parseMultipliers: dodatnie liczby całkowite po przecinku", () => {
  assert.deepEqual(parseMultipliers("1, 1, 2,3"), [1, 1, 2, 3]);
  assert.equal(parseMultipliers("1, 0"), null);
  assert.equal(parseMultipliers("1, x"), null);
  assert.equal(parseMultipliers(""), null);
});

test("finalMaxPoints: dwie najlepsze odpowiedzi każdego z 5 pytań; 5 najlepszych pytań z puli", () => {
  const q = (a, b, c) => [c, a, b];
  assert.equal(finalMaxPoints([q(50, 25, 25), q(50, 25, 25), q(50, 25, 25), q(50, 25, 25), q(50, 25, 25)]), 375);
  assert.equal(finalMaxPoints([q(10, 5, 1), q(50, 30, 1), q(50, 30, 1), q(50, 30, 1), q(50, 30, 1), q(50, 30, 1)]), 400);
  assert.equal(finalMaxPoints([q(50, 25, 25)]), null);
});

test("roundsMaxPoints: suma punktów pytań × mnożnik (ostatni się powtarza)", () => {
  const pts = [[30, 20, 10], [40, 30], [10, 10]];
  // kolejność ustalona: 60×1 + 70×2 + 20×2
  assert.equal(roundsMaxPoints(pts, [1, 2], { ordered: true }), 240);
  // losowo: najlepsze pytania na najwyższe mnożniki: 70×2 + 60×2 + 20×1
  assert.equal(roundsMaxPoints(pts, [1, 2]), 280);
  assert.equal(roundsMaxPoints([], [1, 2]), 0);
});
