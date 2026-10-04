import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../../display2/js/render.js";
import { makeDefaultState } from "../../shared/gameStateShape.js";

function stateToRow(state) {
  return { step: state.step, phase: state.phase, top_card: state.topCard, detail: structuredClone(state) };
}

function setup() {
  const calls = [];
  const api = new Proxy({}, { get: (_, group) => new Proxy({}, { get: (_, name) => (...args) => { calls.push({ name: `${group}.${name}`, args, at: Date.now() }); } }) });
  const renderer = createRenderer({ scene: { api }, qr: { show() {}, hide() {} }, getSfxDuration: async (key) => key === "show_intro" ? 0.06 : 0.02 });
  const state = makeDefaultState("intro-test");
  state.topCard = "rounds";
  state.display.mode = "GAME";
  state.step = "r_intro";
  return { renderer, calls, state };
}

test("Display stays blank before Start game; the logo enters with reveal near the end of intro", async () => {
  const { renderer, calls, state } = setup();
  const before = stateToRow(state);
  await renderer.renderSnapshot(before);
  assert.equal(calls.some((call) => call.name === "logo.show"), false);
  calls.length = 0;
  state.step = "r_roundStart";
  state.phase = "READY";
  const after = stateToRow(state);
  after.sound_cue_key = "show_intro";
  after.sound_cue_seq = 1;
  const start = Date.now();
  const pending = renderer.renderDiff(before, after);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls.some((call) => call.name === "logo.show"), false);
  await pending;
  const logo = calls.find((call) => call.name === "logo.show");
  assert.ok(logo);
  assert.ok(logo.at - start >= 35);
  assert.equal(logo.args[0].ms, 20);
});

test("Reconnect after intro restores logo rather than an empty round board", async () => {
  const { renderer, calls, state } = setup();
  state.step = "r_roundStart";
  state.phase = "READY";
  await renderer.renderSnapshot(stateToRow(state));
  assert.equal(calls.some((call) => call.name === "logo.show"), true);
  assert.equal(calls.some((call) => call.name === "rounds.setAll"), false);
});
