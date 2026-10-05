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
