import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const replacements = JSON.parse(readFileSync(new URL("../../docs/demo-answer-replacements.json", import.meta.url), "utf8"));
const seed = readFileSync(new URL("../../supabase/migrations/2026-03-09_040_demo_in_db.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/2026-10-05_298_demo_short_complete_answers.sql", import.meta.url), "utf8");
const templates = [...seed.matchAll(/VALUES \('([^']+)', '([^']+)', \$z\$(.*?)\$z\$::jsonb/g)]
  .map((match) => ({ lang: match[1], slot: match[2], payload: JSON.parse(match[3]) }));

for (const lang of ["pl", "en", "uk"]) {
  test(`${lang}: complete demo answers and seeded votes fit 17 characters without introducing duplicate answers`, () => {
    let changed = 0;
    for (const { slot, payload } of templates.filter((template) => template.lang === lang)) {
      for (const question of payload.questions || []) {
        const answers = question.answers || question.payload?.answers || [];
        const oldKeys = answers.map((answer) => answer.text.normalize("NFC").toLocaleLowerCase(lang));
        const newKeys = answers.map((answer) => {
          const text = replacements[lang][answer.text] || answer.text;
          if (text !== answer.text) changed++;
          assert.ok(Array.from(text.normalize("NFC")).length <= 17, `${slot}: ${text}`);
          return text.normalize("NFC").toLocaleLowerCase(lang);
        });
        assert.ok(new Set(newKeys).size >= new Set(oldKeys).size, `${slot}: replacement merges distinct answers`);
      }
      for (const vote of payload.votes || []) for (const raw of vote.answers_raw || []) {
        const text = replacements[lang][raw] || raw;
        assert.ok(Array.from(text.normalize("NFC")).length <= 17, `${slot} vote: ${text}`);
      }
    }
    assert.ok(changed > 0);
  });
}

test("migration uses the reviewed replacement map and compares complete demo content before replacing copies", () => {
  for (const match of migration.matchAll(/\$map\$(.*?)\$map\$/gs)) assert.deepEqual(JSON.parse(match[1]), replacements);
  assert.match(migration, /g\.is_demo AND g\.settings = '\{\}'::jsonb/);
  assert.match(migration, /eligible_demo_games/);
  assert.match(migration, /eligible_demo_bases/);
  assert.doesNotMatch(migration, /DELETE FROM|restore_my_demo|seed_demo_for_user\(/);
});
