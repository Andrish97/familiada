import { test } from "node:test";
import assert from "node:assert/strict";
import { pointsPollPreview, textTallyPoints } from "../../web/shared/js/core/poll-tally-math.js";

const sum = (a) => a.reduce((s, x) => s + x, 0);

test("punktowa: zero głosów liczy się jak jeden, suma zawsze 100", () => {
  const out = pointsPollPreview([0, 0, 0, 0]);
  assert.deepEqual(out, [25, 25, 25, 25]);
  assert.equal(sum(pointsPollPreview([8, 6, 4, 2])), 100);
  assert.equal(sum(pointsPollPreview([1, 1, 1])), 100);
});

test("punktowa: największe reszty, remis reszt wygrywa niższy numer odpowiedzi", () => {
  // 3 równe odpowiedzi: 33,33,33 + jeden punkt dla pierwszej
  assert.deepEqual(pointsPollPreview([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(pointsPollPreview([10, 5, 5]), [50, 25, 25]);
});

test("punktowa: minimum 1 punkt, nadwyżkę zabierają największe", () => {
  const out = pointsPollPreview([1000, 1, 1]);
  assert.equal(sum(out), 100);
  assert.ok(out.every((p) => p >= 1), JSON.stringify(out));
  assert.deepEqual(out, [98, 1, 1]);
});

test("tekstowa: punkty do 100, odpowiedzi >= 3 pkt, najwyżej 6", () => {
  const out = textTallyPoints([
    { text: "Pizza", count: 8 },
    { text: "Kotek", count: 6 },
    { text: "Herbata", count: 4 },
    { text: "Rower", count: 2 },
  ]);
  assert.deepEqual(out.map((o) => o.points), [40, 30, 20, 10]);
  assert.deepEqual(out.map((o) => o.text), ["Pizza", "Kotek", "Herbata", "Rower"]);
});

test("tekstowa: duplikaty sumowane bez względu na wielkość liter, tekst przycięty do 17 znaków", () => {
  const out = textTallyPoints([
    { text: "  pizza ", count: 5 },
    { text: "PIZZA", count: 5 },
    { text: "Bardzo długa odpowiedź która nie mieści się", count: 5 },
    { text: "x", count: 0 },
    { text: "", count: 4 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].text, "pizza");
  assert.equal(out[0].idx, 0);
  assert.equal(out[1].text.length, 17);
});

test("tekstowa: odpowiedzi poniżej 3 pkt odpadają, remisy punktów rozbijane w dół", () => {
  // 50 / 50 -> remis 50, drugi dostaje 49
  const tie = textTallyPoints([{ text: "A", count: 1 }, { text: "B", count: 1 }]);
  assert.deepEqual(tie.map((o) => o.points), [50, 49]);
  // 2 głosy na 100 to 2 pkt (< 3) -> odpada
  const out = textTallyPoints([{ text: "A", count: 98 }, { text: "B", count: 2 }]);
  assert.deepEqual(out.map((o) => o.text), ["A"]);
});

test("tekstowa: co najwyżej 6 odpowiedzi", () => {
  const answers = ["a", "b", "c", "d", "e", "f", "g", "h"].map((text, i) => ({ text, count: 20 - i }));
  assert.equal(textTallyPoints(answers).length, 6);
});
