import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGlyphMap } from "../../web/shared/js/display/fonts.js";
import {
  sharePercent, pointsPollAnalysis, pointsPollPreview, textTallyAnalysis, textTallyPoints, nextTieSelection,
} from "../../web/shared/js/core/poll-tally-math.js";

// Te same przypadki co tests/sql/e21-poll-tally-405.sql (SQL _poll_share, _poll_text_tally_select).
const glyphs = buildGlyphMap(JSON.parse(readFileSync(new URL("../../web/shared/fonts/display/font_5x7.json", import.meta.url))));

test("udział: 0 -> 0, dodatni <1% -> 1, poza tym floor; równe głosy = równe procenty", () => {
  assert.equal(sharePercent(0, 30), 0);
  assert.equal(sharePercent(8, 1000), 1);
  assert.equal(sharePercent(19, 1000), 1);
  assert.equal(sharePercent(39, 1000), 3);
  assert.equal(sharePercent(4, 100), 4);
  assert.deepEqual(pointsPollPreview([10, 10, 10], 30), [33, 33, 33]);
});

test("punktowa: kwalifikacja od 4%, suma ≤100, bez obniżania remisów", () => {
  const rows = pointsPollAnalysis([40, 40, 17, 3], 100);
  assert.deepEqual(rows.map((r) => r.points), [40, 40, 17, 0]);
  assert.equal(rows[3].skipped, true);
  assert.ok(rows.reduce((s, r) => s + r.points, 0) <= 100);
});

test("tekstowa: oczyszczenie przed grupowaniem, pusty wynik się nie kwalifikuje", () => {
  const a = textTallyAnalysis([{ text: "kawa😀", count: 9 }, { text: "KAWA", count: 1 }, { text: "😀", count: 5 }], { total: 15, glyphs });
  assert.deepEqual(a.rows.map((r) => [r.text, r.count, r.percent]), [["kawa", 10, 66]]);
  assert.equal(a.valid, false);
});

test("szóstka: domyślny wybór, wybór z remisu, lepsza odpowiedź spoza remisu zostaje", () => {
  const ans = [["A", 5], ["B", 4], ["C", 3], ["D", 2], ["E", 2], ["F 😀", 1], ["G", 1], ["😀", 2]].map(([text, count]) => ({ text, count }));
  assert.deepEqual(textTallyPoints(ans, { total: 20, glyphs }).map((r) => `${r.text}:${r.points}`), ["A:25", "B:20", "C:15", "D:10", "E:10", "F:5"]);
  const a = textTallyAnalysis(ans, { total: 20, glyphs });
  assert.deepEqual(a.tie, { keys: ["F", "G"], slots: 1 });
  const next = nextTieSelection(a);
  assert.deepEqual(next, ["A", "B", "C", "D", "E", "G"]);
  const b = textTallyAnalysis(ans, { total: 20, glyphs, selected: next });
  assert.deepEqual(b.rows.filter((r) => r.selected).map((r) => r.text), ["A", "B", "C", "D", "E", "G"]);
  // cyklicznie z powrotem do pierwszego zestawu
  assert.deepEqual(nextTieSelection(b), ["A", "B", "C", "D", "E", "F"]);
  // wybór pomijający E (spoza remisu) jest odrzucany -> domyślny
  const c = textTallyAnalysis(ans, { total: 20, glyphs, selected: ["A", "B", "C", "D", "F", "G"] });
  assert.deepEqual(c.rows.filter((r) => r.selected).map((r) => r.text), ["A", "B", "C", "D", "E", "F"]);
});

test("większa grupa remisowa: wszystkie zestawy osiągalne", () => {
  const ans = [["A", 9], ["B", 8], ["C", 7], ["D", 7], ["E", 7], ["F", 7], ["G", 7]].map(([text, count]) => ({ text, count }));
  let a = textTallyAnalysis(ans, { total: 60 });
  assert.equal(a.tie.slots, 4);
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    seen.add(a.selectedKeys.join(""));
    a = textTallyAnalysis(ans, { total: 60, selected: nextTieSelection(a) });
  }
  assert.equal(seen.size, 5); // C(5,4)
  assert.equal(a.selectedKeys.join(""), "ABCDEF"); // po pełnym cyklu
});

test("równe procenty z różnych liczebności nie dają remisu; 3,9% nie kwalifikuje się", () => {
  const ans = [["A", 100], ["B", 40], ["C", 30], ["D", 11], ["E", 10], ["F", 9], ["G", 8], ["H", 7]].map(([text, count]) => ({ text, count }));
  const a = textTallyAnalysis(ans, { total: 200 });
  assert.equal(a.tie, null);
  assert.deepEqual(textTallyPoints(ans, { total: 200 }).map((r) => `${r.text}:${r.points}`), ["A:50", "B:20", "C:15", "D:5", "E:5", "F:4"]);
  assert.equal(a.rows.find((r) => r.text === "H").qualifies, false); // 3,5%
});
