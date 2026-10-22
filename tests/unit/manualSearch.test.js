import { test } from "node:test";
import assert from "node:assert/strict";

const { norm, searchIndex } = await import("../../web/manual/js/search.js");

const entry = (id, title, text) => ({ id, ch: id.split(".")[0], title, text, nTitle: norm(title), nText: norm(text) });
const entries = [
  entry("3.5", "Błędy i przejęcie punktów", "W serwisie przejęcie punktów nazywa się kradzieżą."),
  entry("17.3", "Prowadzenie rund", "Kradzież: po trzech błędach przeciwnicy podają jedną odpowiedź. Kradzież przenosi pulę."),
  entry("16.4", "Dźwięk", "Gra ma 10 dźwięków."),
];

test("norm: bez wielkości liter i polskich znaków", () => {
  assert.equal(norm("Kradzież ŁÓDŹ"), "kradziez lodz");
});

test("searchIndex: wszystkie słowa muszą wystąpić, tytuł waży więcej", () => {
  assert.deepEqual(searchIndex(entries, "kradziez").map((e) => e.id), ["17.3", "3.5"]);
  assert.deepEqual(searchIndex(entries, "przejęcie punktów").map((e) => e.id), ["3.5"]);
  assert.deepEqual(searchIndex(entries, "dźwięk").map((e) => e.id), ["16.4"]);
  assert.deepEqual(searchIndex(entries, "x"), []);
  assert.deepEqual(searchIndex(entries, "nieistniejące słowo"), []);
});
