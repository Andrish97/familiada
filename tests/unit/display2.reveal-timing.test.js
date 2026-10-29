import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../../web/control/display/js/render.js";
import { makeDefaultState } from "../../web/shared/js/gameplay/gameStateShape.js";
import { ROUND_TEXT_MS, ROUND_POINTS_MS, ROUND_SUMA_MS, FINAL_TEXT_MS, FINAL_POINTS_MS, REVEAL_TILE_MS, BOARD_TRANSITION } from "../../web/shared/js/gameplay/displayTiming.js";

function row(state) { return { step: state.step, phase: state.phase, top_card: state.topCard, detail: structuredClone(state), sound_cue_key: "answer_correct" }; }
function setup() {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const api = new Proxy({}, { get: (_, group) => new Proxy({}, { get: (_, name) => (...args) => {
    calls.push({ name: `${group}.${name}`, args });
    if (`${group}.${name}` === "big.replace") args[0]();
    if (`${group}.${name}` === "rounds.setRow" || `${group}.${name}` === "final.setLeft") return gate;
  } }) });
  const renderer = createRenderer({ scene: { api }, qr: {}, getSfxDuration: async () => 1 });
  return { renderer, calls, release };
}

test("round answer, points and bank reveal one after another at one tempo per character", async () => {
  const { renderer, calls } = setup();
  const state = makeDefaultState("reveal");
  state.step = "r_play";
  state.topCard = "rounds";
  state.rounds.answers = [{ ord: 1, text: "Odpowiedź", fixed_points: 30 }];
  const before = row(state);
  state.rounds.revealed = [1];
  state.rounds.bankPts = 30;
  const pending = renderer.renderDiff(before, row(state));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(calls.some((call) => call.name === "rounds.setText"), true);
  assert.equal(calls.some((call) => call.name === "rounds.setPts"), true);
  await pending;
  const answer = calls.find((call) => call.name === "rounds.setText");
  const points = calls.find((call) => call.name === "rounds.setPts");
  const total = calls.find((call) => call.name === "rounds.setSuma");
  // Stałe tempo (decyzja 2026-10-29): 17 znaków tekstu, 2 punktów, 3 sumy.
  assert.equal(answer.args[2].animIn.ms, ROUND_TEXT_MS);
  assert.equal(points.args[2].animIn.ms, ROUND_POINTS_MS);
  assert.equal(total.args[1].animIn.ms, ROUND_SUMA_MS);
  assert.equal(ROUND_TEXT_MS / 17, REVEAL_TILE_MS);
  assert.equal(ROUND_POINTS_MS / 2, REVEAL_TILE_MS);
  assert.ok(calls.indexOf(answer) < calls.indexOf(points));
  assert.ok(calls.indexOf(points) < calls.indexOf(total));
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
  assert.equal(answer.args[2].animIn.ms, FINAL_TEXT_MS);
  assert.equal(points.args[2].animIn.ms, FINAL_POINTS_MS);
  assert.equal(calls.find((call) => call.name === "final.setSumaFor").args[2].animIn.ms, points.args[2].animIn.ms);
});


test("coalesced last score and Finish final do not replay points to final-theme duration", async () => {
  const { renderer, calls } = setup();
  const state = makeDefaultState("coalesced-final");
  state.step = "f_p1_map_q1";
  state.topCard = "final";
  state.final.winnerTeam = "A";
  state.final.runtime.map1[0] = { outText: "Mleko", pts: 36, revealedAnswer: true, revealedPoints: false };
  const before = row(state);
  state.final.runtime.map1[0].revealedPoints = true;
  state.final.runtime.sum = 36;
  state.final.runtime.reached200 = true;
  state.step = "f_end";
  const after = row(state);
  after.sound_cue_key = "final_theme";
  await renderer.renderDiff(before, after);
  assert.equal(calls.find(c => c.name === "final.setA").args[2].animIn.ms, 0);
  // Plansza finału przechodzi w wynik albo logo jednym przejściem planszy.
  const replace = calls.find(c => c.name === "big.replace");
  assert.deepEqual(replace.args[1], BOARD_TRANSITION);
  const result = calls.find(c => c.name === "logo.draw" || c.name === "win.set");
  assert.ok(result);
  assert.ok(calls.indexOf(replace) < calls.indexOf(result));
});
