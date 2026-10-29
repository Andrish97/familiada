import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateReadiness, RULES } from "../../web/shared/js/core/game-rules.js";

// Te same scenariusze co tests/sql/e21-rules-engine-404.sql (game_rules_compute).
const q = (...pts) => ({ answers: pts.map((p) => ({ fixed_points: p })) });
const ten = (make) => Array.from({ length: 10 }, (_, i) => make(i));
const codes = (r) => r.issues.map((i) => `${i.code}${i.params.ord ? "#" + i.params.ord : ""}`);

test("preparowana: 10 pytań, 3–6 odpowiedzi, ≥4 pkt, suma ≤100", () => {
  assert.equal(RULES.PTS_MIN, 4);
  assert.deepEqual(evaluateReadiness("prepared", ten(() => q(40, 30, 30))), { ok: true, issues: [] });
  assert.deepEqual(codes(evaluateReadiness("prepared", ten((i) => (i === 1 ? q(40, 30, 3) : q(40, 30, 30))))), ["answerMinPoints#2"]);
  assert.equal(evaluateReadiness("prepared", ten((i) => (i === 1 ? q(40, 30, 4) : q(40, 30, 30)))).ok, true);
  assert.deepEqual(codes(evaluateReadiness("prepared", ten((i) => (i === 2 ? q(40, 30, 31) : q(40, 30, 30))))), ["sumTooBig#3"]);
  // suma nie musi wynosić 100
  assert.equal(evaluateReadiness("prepared", ten(() => q(10, 10, 10))).ok, true);
  assert.deepEqual(codes(evaluateReadiness("prepared", ten((i) => (i === 3 ? q() : q(40, 30, 30))))), ["answersRange#4"]);
});

test("braki są informacyjne i kompletne: 0, 1, 9 pytań", () => {
  assert.deepEqual(codes(evaluateReadiness("prepared", [])), ["minQuestions"]);
  assert.deepEqual(codes(evaluateReadiness("prepared", [q(1)])), ["minQuestions", "answersRange#1"]);
  assert.equal(evaluateReadiness("prepared", Array(9).fill(q(40, 30, 30))).issues[0].params.n, 9);
});

test("ankiety: punktowa 3–6 odpowiedzi bez progu punktów, tekstowa bez odpowiedzi", () => {
  assert.equal(evaluateReadiness("poll_points", ten(() => q(0, 0, 0))).ok, true);
  assert.deepEqual(codes(evaluateReadiness("poll_points", ten((i) => (i === 0 ? q(0, 0) : q(0, 0, 0))))), ["answersRange#1"]);
  assert.equal(evaluateReadiness("poll_text", ten(() => q())).ok, true);
  assert.deepEqual(codes(evaluateReadiness("market", ten(() => q(40, 30, 3)))).length, 10);
});

test("lista warunków edytora: każdy warunek osobno, zgodna z evaluateReadiness", async () => {
  const { readinessChecklist } = await import("../../web/shared/js/core/game-rules.js");
  const state = (list) => list.map((i) => `${i.key}:${i.ok ? "ok" : i.ords.join(",") || "x"}`);
  // pytanie 2 łamie naraz próg 4 pkt i sumę
  const qs = ten((i) => (i === 1 ? q(90, 10, 3) : i === 4 ? q(40, 30) : q(40, 30, 30)));
  assert.deepEqual(state(readinessChecklist("prepared", qs)), ["questions:ok", "answers:5", "minPoints:2", "sum:2"]);
  assert.equal(readinessChecklist("prepared", qs).every((i) => i.ok), evaluateReadiness("prepared", qs).ok);
  assert.deepEqual(state(readinessChecklist("prepared", ten(() => q(40, 30, 30)))), ["questions:ok", "answers:ok", "minPoints:ok", "sum:ok"]);
  assert.deepEqual(state(readinessChecklist("poll_points", [q(0, 0, 0)])), ["questions:x", "answers:ok"]);
  assert.deepEqual(state(readinessChecklist("poll_text", ten(() => q()))), ["questions:ok"]);
  assert.equal(readinessChecklist("poll_text", []).at(0).params.n, 0);
});
