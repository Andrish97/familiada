// Tłumaczenia bez martwych kluczy (audyt 2026-10-23): każdy klucz
// z web/shared/translation/{pl,en,uk}.js jest używany przez kod, a wszystkie
// trzy języki mają ten sam zestaw kluczy. Lista nieużywanych:
// node scripts/i18n-unused.mjs; usunięcie: node scripts/i18n-prune.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { report } from "../../scripts/i18n-unused.mjs";

const result = await report();

test("tłumaczenia: brak nieużywanych kluczy", () => {
  assert.deepEqual(result.unused, [], `nieużywane klucze — usuń je (node scripts/i18n-prune.mjs) albo użyj w kodzie:\n${result.unused.join("\n")}`);
});

test("tłumaczenia: PL, EN i UK mają te same klucze", () => {
  for (const [lang, keys] of Object.entries(result.missing)) assert.deepEqual(keys, [], `brak w ${lang}`);
});

test("tłumaczenia: każdy klucz użyty w kodzie stron istnieje w słowniku", () => {
  assert.deepEqual(result.missingInDict, [], `brak w web/shared/translation/pl.js:\n${result.missingInDict.join("\n")}`);
});
