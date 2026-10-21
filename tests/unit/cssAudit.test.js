import test from "node:test";
import assert from "node:assert/strict";
import { audit, readBaseline, regressions, METRICS } from "../../scripts/css-audit.mjs";

// E23 (docs/wspolne-style-plan.md): liczby naruszeń wspólnych stylów mogą tylko maleć.
// Wyłączony do startu E23 (decyzja użytkownika 2026-10-21); raport: node scripts/css-audit.mjs
test.skip("CSS: brak nowych naruszeń wspólnych stylów ponad baseline", () => {
  const { result } = audit();
  const found = regressions(result, readBaseline()).map(
    (r) => `${r.file}: ${METRICS[r.metric]} — ${r.value} (dozwolone ${r.allowed})`,
  );
  assert.deepEqual(found, [], "Użyj wspólnych klas/tokenów z web/shared/css/ (docs/wspolne-style-plan.md). "
    + "Gdy liczby spadły, odśwież poziom: node scripts/css-audit.mjs --write-baseline");
});
