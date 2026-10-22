import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// E25 (decyzja użytkownika 2026-10-22): spece przepisuje się stopniowo, przy
// okazji pracy nad nimi. Zapadka: nowe pliki tylko z helpers/e2e-test (lease),
// a użyć starych kont testN może tylko ubywać. Przepisany plik -> usuń go
// z unit/legacy-test-accounts.json (albo zmniejsz liczbę).
const E2E = new URL("../e2e/", import.meta.url).pathname;
const LEGACY = JSON.parse(readFileSync(new URL("./legacy-test-accounts.json", import.meta.url), "utf8")).files;
const OLD = /testAccountUsername\(|loginAsPooledTestUser\(|getTestAccountPool\(|test[0-9]+@familiada\.online|restoreTestAccount\(|loginAsTestUser\(/g;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "helpers" ? [] : files(path);
    return name.endsWith(".js") ? [path] : [];
  });
}

test("stare konta testN: tylko w plikach z listy i nie więcej niż dotąd", () => {
  const problems = [];
  for (const path of files(E2E)) {
    const rel = relative(E2E, path);
    const count = (readFileSync(path, "utf8").match(OLD) || []).length;
    const allowed = LEGACY[rel] || 0;
    if (count > allowed) problems.push(`${rel}: ${count} użyć starych kont (dozwolone ${allowed}) — użyj helpers/e2e-test (needs/accounts)`);
  }
  assert.deepEqual(problems, []);
});

test("lista starych plików jest aktualna (przepisane usunięte z listy)", () => {
  const stale = [];
  for (const [rel, allowed] of Object.entries(LEGACY)) {
    let count = 0;
    try { count = (readFileSync(join(E2E, rel), "utf8").match(OLD) || []).length; } catch { /* plik usunięty */ }
    if (count < allowed) stale.push(`${rel}: ${count} < ${allowed} — zmniejsz albo usuń wpis w unit/legacy-test-accounts.json`);
  }
  assert.deepEqual(stale, []);
});
