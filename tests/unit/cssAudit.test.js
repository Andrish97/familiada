import test from "node:test";
import assert from "node:assert/strict";
import { audit, readBaseline, regressions, METRICS, classIsUsed } from "../../scripts/css-audit.mjs";

// E23 (familijna-server/docs/wspolne-style-plan.md): liczby naruszeń wspólnych stylów mogą tylko maleć.
// Włączony przy starcie E23 (2026-10-23); raport: node scripts/css-audit.mjs
test("CSS: brak nowych naruszeń wspólnych stylów ponad baseline", () => {
  const { result } = audit();
  const found = regressions(result, readBaseline()).map(
    (r) => `${r.file}: ${METRICS[r.metric]} — ${r.value} (dozwolone ${r.allowed})`,
  );
  assert.deepEqual(found, [], "Użyj wspólnych klas/tokenów z web/shared/css/ (familijna-server/docs/wspolne-style-plan.md). "
    + "Gdy liczby spadły, odśwież poziom: node scripts/css-audit.mjs --write-baseline");
});

test('CSS: rozpoznaje dynamiczne warianty bez uznawania innych rodzin', () => {
  const code = 'option.className = `support-size support-size--${size}`';
  assert.equal(classIsUsed('support-size--medium', code), true);
  assert.equal(classIsUsed('support-size--large', code), true);
  assert.equal(classIsUsed('other-size--medium', code), false);
  assert.equal(classIsUsed('unused', code), false);
});
