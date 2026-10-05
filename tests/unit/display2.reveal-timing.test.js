import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../../web/display2/js/render.js";
import { makeDefaultState } from "../../web/shared/js/gameplay/gameStateShape.js";

function row(state) { return { step: state.step, phase: state.phase, top_card: state.topCard, detail: structuredClone(state), sound_cue_key: "answer_correct" }; }
function setup() {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const api = new Proxy({}, { get: (_, group) => new Proxy({}, { get: (_, name) => (...args) => {
    calls.push({ name: `${group}.${name}`, args });
    if (`${group}.${name}` === "rounds.setRow" || `${group}.${name}` === "final.setLeft") return gate;
  } }) });
  const renderer = createRenderer({ scene: { api }, qr: {}, getSfxDuration: async () => 1 });
  return { renderer, calls, release };
}

test("round total waits for the complete answer; both phases share one sound duration", async () => {
  const { renderer, calls, release } = setup();
  const state = makeDefaultState("reveal");
  state.step = "r_play";
  state.topCard = "rounds";
  state.rounds.answers = [{ ord: 1, text: "Odpowiedź", fixed_points: 30 }];
  const before = row(state);
  state.rounds.revealed = [1];
  state.rounds.bankPts = 30;
  const pending = renderer.renderDiff(before, row(state));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.some((call) => call.name === "rounds.setSuma"), false);
  release();
  await pending;
  const answer = calls.find((call) => call.name === "rounds.setRow");
  const total = calls.find((call) => call.name === "rounds.setSuma");
  assert.equal(answer.args[1].animIn.ms + total.args[1].animIn.ms, 1000);
  assert.ok(calls.indexOf(answer) < calls.indexOf(total));
});

test("automatic final zero waits for the answer without doubling the sound duration", async () => {
  const { renderer, calls, release } = setup();
  const state = makeDefaultState("final-reveal");
  state.step = "f_p1_map";
  state.topCard = "final";
  state.final.runtime.map1[0] = { outText: "—", pts: 0, revealedAnswer: false, revealedPoints: false };
  const before = row(state);
  state.final.runtime.map1[0].revealedAnswer = true;
  state.final.runtime.map1[0].revealedPoints = true;
  const pending = renderer.renderDiff(before, row(state));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.some((call) => call.name === "final.setA"), false);
  release();
  await pending;
  const answer = calls.find((call) => call.name === "final.setLeft");
  const points = calls.find((call) => call.name === "final.setA");
  assert.equal(answer.args[2].animIn.ms + points.args[2].animIn.ms, 1000);
  assert.equal(calls.find((call) => call.name === "final.setSumaFor").args[2].animIn.ms, points.args[2].animIn.ms);
});
