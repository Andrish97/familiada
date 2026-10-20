// Menedżer bazy: dane pochodne i „co pokazać” (data/derived.js, data/listing.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStore, suggestedType } from "../../web/bases/explorer/js/data/derived.js";
import { computeListing, normalizeText, isQueryEmpty, emptyQuery } from "../../web/bases/explorer/js/data/listing.js";

const ans = (n, pts) => Array.from({ length: n }, (_, i) => (pts == null ? { text: `A${i}` } : { text: `A${i}`, fixed_points: pts }));

// Folder główny: Jedzenie/{Owoce/{q1 żółw, q2}, q3}, Dom/{} (pusty), q4
const store = {
  categories: [
    { id: "jedzenie", parent_id: null, name: "Jedzenie", ord: 1 },
    { id: "owoce", parent_id: "jedzenie", name: "Owoce i warzywa", ord: 1 },
    { id: "dom", parent_id: null, name: "Dom", ord: 2 },
  ],
  tags: [{ id: "latwe" }, { id: "final" }],
  questions: [
    { id: "q1", category_id: "owoce", ord: 1, payload: { text: "Żółw je sałatę?", answers: ans(3, 10) } },
    { id: "q2", category_id: "owoce", ord: 2, payload: { text: "Ulubiony owoc", answers: ans(3, 10) } },
    { id: "q3", category_id: "jedzenie", ord: 1, payload: { text: "Co jesz rano", answers: ans(3) } },
    { id: "q4", category_id: null, ord: 1, payload: { text: "Kolor nieba", answers: [] } },
  ],
  questionTags: [
    { question_id: "q1", tag_id: "latwe" }, { question_id: "q2", tag_id: "latwe" },
    { question_id: "q2", tag_id: "final" }, { question_id: "q3", tag_id: "latwe" },
  ],
  trash: [{ id: "t1" }],
};
const d = deriveStore(store);
const root = { kind: "root" };
const ids = (arr) => arr.map((x) => x.id).sort();

test("proponowana kategoria jest rozłączna: punkty → preparowana, same odpowiedzi → punktowana, bez odpowiedzi → tekstowa", () => {
  assert.equal(suggestedType({ answers: ans(3, 10) }), "prepared");
  assert.equal(suggestedType({ answers: ans(3) }), "poll_points");
  assert.equal(suggestedType({ answers: [] }), "poll_text");
  assert.equal(suggestedType(null), "poll_text");
});

test("folder ma tagi i kategorię wspólne dla całego poddrzewa; pusty folder nie ma żadnych", () => {
  assert.deepEqual([...d.folderTags("owoce")].sort(), ["latwe"]);
  assert.deepEqual([...d.folderTags("jedzenie")], ["latwe"]);
  assert.equal(d.folderType("owoce"), "prepared");
  assert.equal(d.folderType("jedzenie"), null); // q3 punktowana
  assert.equal(d.folderType("dom"), null);
  assert.equal(d.childCount("jedzenie"), 2);
});

test("puste zapytanie: zawartość bieżącego folderu", () => {
  assert.ok(isQueryEmpty(emptyQuery()));
  const r = computeListing(store, d, { location: root, query: emptyQuery() });
  assert.equal(r.mode, "browse");
  assert.deepEqual(ids(r.folders), ["dom", "jedzenie"]);
  assert.deepEqual(ids(r.questions), ["q4"]);
  const f = computeListing(store, d, { location: { kind: "folder", folderId: "jedzenie" }, query: emptyQuery() });
  assert.deepEqual(ids(f.folders), ["owoce"]);
  assert.deepEqual(ids(f.questions), ["q3"]);
});

test("tekst bez polskich znaków i w dowolnej kolejności słów", () => {
  assert.equal(normalizeText("Żółw ŁÓDŹ"), "zolw lodz");
  const r = computeListing(store, d, { location: root, query: { text: "salate zolw", tagIds: [], types: [] } });
  assert.deepEqual(ids(r.questions), ["q1"]);
});

test("folder w wynikach, gdy pasuje całe poddrzewo; pytania pod nim się nie powtarzają", () => {
  const r = computeListing(store, d, { location: root, query: { text: "", tagIds: ["latwe"], types: [] } });
  assert.deepEqual(ids(r.folders), ["jedzenie"]); // owoce też pełny, ale pod jedzeniem
  assert.deepEqual(ids(r.questions), []);
  assert.equal(r.matchCount.get("jedzenie"), 3);
});

test("tagi AND, kategorie OR", () => {
  const and = computeListing(store, d, { location: root, query: { text: "", tagIds: ["latwe", "final"], types: [] } });
  assert.deepEqual(ids(and.questions), ["q2"]);
  const or = computeListing(store, d, { location: root, query: { text: "", tagIds: [], types: ["poll_points", "poll_text"] } });
  assert.deepEqual(ids(or.questions).concat(ids(or.folders)), ["q3", "q4"]);
});

test("wyniki tylko z poddrzewa bieżącego folderu", () => {
  const r = computeListing(store, d, { location: { kind: "folder", folderId: "owoce" }, query: { text: "owoc", tagIds: [], types: [] } });
  assert.deepEqual(ids(r.questions), ["q2"]);
  assert.deepEqual(ids(r.folders), []);
});

test("folder pasujący nazwą: tylko gdy spełnia też tagi i kategorie", () => {
  const byName = computeListing(store, d, { location: root, query: { text: "warzywa", tagIds: [], types: [] } });
  assert.deepEqual(ids(byName.folders), ["owoce"]);
  const withTag = computeListing(store, d, { location: root, query: { text: "dom", tagIds: ["latwe"], types: [] } });
  assert.deepEqual(ids(withTag.folders), []); // „Dom” jest pusty — nie ma tagu
});

test("kosz", () => {
  const r = computeListing(store, d, { location: { kind: "trash" }, query: emptyQuery() });
  assert.equal(r.mode, "trash");
  assert.deepEqual(ids(r.entries), ["t1"]);
});

test("uszkodzone dane: cykl folderów nie zawiesza liczenia", () => {
  const bad = deriveStore({ categories: [{ id: "a", parent_id: "b" }, { id: "b", parent_id: "a" }], questions: [], questionTags: [] });
  assert.deepEqual(bad.subtreeQuestionIds("a"), []);
  assert.ok(Array.isArray(bad.ancestorIds("a")));
});

test("wyszukiwarka: rozpoznanie #tagu przed kursorem i tekst bez #…", async () => {
  const { hashTokenBeforeCaret, textWithoutHashTokens } = await import("../../web/bases/explorer/js/data/listing.js");
  assert.deepEqual(hashTokenBeforeCaret("abc #fa", 7), { start: 4, name: "fa" });
  assert.equal(hashTokenBeforeCaret("abc#fa", 6), null);
  assert.equal(textWithoutHashTokens("kot #fa pies"), "kot pies");
});
