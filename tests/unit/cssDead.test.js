// E23: żadna reguła CSS strony nie dotyczy klasy, której strona nie używa
// (scripts/css-dead.cjs — graf importów od HTML strony).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("CSS stron: brak martwych klas", () => {
  const { report } = require("../../scripts/css-dead.cjs");
  assert.deepEqual(report, {});
});
