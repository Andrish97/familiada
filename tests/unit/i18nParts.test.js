// Podział słownika na części (familijna-server/docs/tlumaczenia-podzial-plan.md): te same części
// i sekcje w PL/EN/UK, każda sekcja w jednej części, meta i18n-parts w HTML
// zgodna z kodem stron (node scripts/i18n-parts.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS, SERVER_PART, loadParts, partNames, stale, computePageParts } from "../../scripts/i18n-parts.mjs";

const parts = await loadParts();

test("i18n: te same części i sekcje w PL/EN/UK", () => {
  for (const lang of LANGS) {
    assert.deepEqual(partNames(lang), partNames("pl"), `${lang}: inne pliki części`);
    for (const part of partNames("pl")) {
      assert.deepEqual(Object.keys(parts[lang][part]).sort(), Object.keys(parts.pl[part]).sort(), `${lang}/${part}: inne sekcje niż pl/${part}`);
    }
  }
});

test("i18n: każda sekcja leży w dokładnie jednej części", () => {
  for (const lang of LANGS) {
    const seen = new Map();
    for (const [part, dict] of Object.entries(parts[lang])) {
      for (const section of Object.keys(dict)) {
        assert.ok(!seen.has(section), `${lang}: sekcja ${section} w ${seen.get(section)} i ${part}`);
        seen.set(section, part);
      }
    }
  }
});

test("i18n: meta i18n-parts w HTML aktualna (node scripts/i18n-parts.mjs)", async () => {
  const diff = await stale();
  assert.deepEqual(diff.map((d) => `${d.rel}: ${d.parts?.join(" ") || "(tylko common)"}`), []);
});

test("i18n: strony nie wczytują części serwera", async () => {
  const pages = await computePageParts();
  const bad = Object.entries(pages).filter(([, list]) => list?.includes(SERVER_PART)).map(([rel]) => rel);
  assert.deepEqual(bad, [], "kod strony używa sekcji z server.js — przenieś klucz do części strony");
});

test("i18n: translation.js nie importuje słowników wprost", () => {
  const src = readFileSync(new URL("../../web/shared/translation/translation.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /import\s*\(?\s*["'`]\.\/(pl|en|uk)\//);
});
