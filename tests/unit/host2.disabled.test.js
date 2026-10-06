import { test } from "node:test";
import assert from "node:assert/strict";
import { createHostRenderer } from "../../web/host2/js/render.js";

test("wyłączenie Prowadzącego czyści poprzednią treść i uniemożliwia odsłonięcie", () => {
  const previousDocument = globalThis.document;
  const nodes = new Map(["paperText1", "paperText2", "cover2", "cover2Swipe", "p2Hint"].map(id => [id, { textContent: "Poprzednia odpowiedź", classList: { toggle() {} } }]));
  globalThis.document = { getElementById: id => nodes.get(id), documentElement: { classList: { toggle() {}, contains() { return false; } } } };
  try {
    const renderer = createHostRenderer();
    renderer.render({ top_card: "final", detail: { settings: { noHostTablet: true }, host: { covered: true } } });
    renderer.setPeek(true);
    for (const id of ["paperText1", "paperText2", "cover2Swipe", "p2Hint"]) assert.equal(nodes.get(id).textContent, "");
    assert.equal(renderer.isCoverableAtAll(), false);
    assert.equal(renderer.isPeeked(), false);
  } finally { globalThis.document = previousDocument; }
});

test("zakończenie gry bez finału czyści tablet Prowadzącego", () => {
  const previousDocument = globalThis.document;
  const nodes = new Map(["paperText1", "paperText2", "cover2", "cover2Swipe", "p2Hint"].map(id => [id, { textContent: "Ostatnie pytanie", classList: { toggle() {} } }]));
  globalThis.document = { getElementById: id => nodes.get(id), documentElement: { classList: { toggle() {}, contains() { return false; } } } };
  try {
    const renderer = createHostRenderer();
    renderer.render({ step: "r_gameEnd", top_card: "rounds", detail: { settings: { noHostTablet: false }, host: { covered: false } } });
    assert.equal(nodes.get("paperText1").textContent, "");
    assert.equal(nodes.get("paperText2").textContent, "");
  } finally { globalThis.document = previousDocument; }
});

test("mapowanie: status z listy jest zielony; przekreślona jest tylko wybrana odpowiedź", () => {
  const previousDocument = globalThis.document;
  function node() { return { textContent: "", children: [], classList: { toggle() {} }, appendChild(child) { this.children.push(child); } }; }
  const nodes = new Map(["paperText1", "paperText2", "cover2", "cover2Swipe", "p2Hint"].map(id => [id, node()]));
  globalThis.document = { getElementById: id => nodes.get(id), createElement: node, createTextNode: text => ({ textContent: text }), documentElement: { classList: { toggle() {}, contains() { return false; } } } };
  try {
    const renderer = createHostRenderer();
    renderer.render({ step: "f_p1_map_q1", top_card: "final", detail: { settings: {}, host: { covered: true }, final: { questions: [{ text: "Pytanie", answers: [{ id: "a1", text: "Mleko", fixed_points: 40 }] }], runtime: { p1: [{ text: "mleko" }], map1: [{ kind: "MATCH", matchId: "a1" }] } } } });
    const styled = nodes.get("paperText2").children.filter(child => child.className);
    assert.equal(styled.length, 2);
    assert.equal(styled[0].className, "hostGreen");
    assert.equal(styled[1].className, "hostGreen hostStrike");
    assert.equal(styled[1].textContent, "Mleko (40)");
  } finally { globalThis.document = previousDocument; }
});
