import test from "node:test";
import assert from "node:assert/strict";
import { questionFromSearch, questionHref } from "../../web/games/editor/js/question-url.js";

const qs = [{ id: "a1" }, { id: "b2" }];

test("?q= otwiera istniejące pytanie, nieznane i puste jest ignorowane", () => {
  assert.equal(questionFromSearch("?id=g&q=b2", qs), "b2");
  assert.equal(questionFromSearch("?id=g&q=zz", qs), null);
  assert.equal(questionFromSearch("?id=g", qs), null);
  assert.equal(questionFromSearch("?id=g&q=", qs), null);
});

test("questionHref ustawia i usuwa q, zachowując id i ret", () => {
  const base = "https://x.test/games/editor/?id=g&ret=%2Fgames%2F";
  assert.equal(questionHref(base, "a1"), "/games/editor/?id=g&ret=%2Fgames%2F&q=a1");
  assert.equal(questionHref(base + "&q=a1", null), "/games/editor/?id=g&ret=%2Fgames%2F");
});
