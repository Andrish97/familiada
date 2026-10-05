import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenderer } from "../../web/display2/js/render.js";
import { makeDefaultState } from "../../web/shared/js/gameplay/gameStateShape.js";

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

test("team names are painted before the game starts, including the initial black board", async () => {
  const { renderer, calls, state } = setup();
  state.step = "devices_display";
  state.display.mode = "BLACK";
  state.teams = { teamA: "Alfa", teamB: "Beta" };
  await renderer.renderSnapshot(stateToRow(state));
  assert.deepEqual(calls.filter((call) => ["small.long1", "small.long2"].includes(call.name)).map((call) => call.args[0]), ["Alfa", "Beta"]);
  assert.equal(calls.some((call) => call.name === "logo.show"), false);
});

test("final result appears only after Finish final; outro does not redraw or count the final twice", async () => {
  const { renderer, calls, state } = setup();
  state.topCard = "final";
  state.step = "f_p1_map_q1";
  state.locks.gameStarted = true;
  state.settings.endScreenMode = "money";
  state.settings.finalPrizeMultiplier = 3;
  state.settings.mainPrizeAmount = 25000;
  state.rounds.totals = { A: 300, B: 0 };
  state.final.winnerTeam = "A";
  state.final.runtime.sum = 200;
  state.final.runtime.reached200 = true;
  const mapping = stateToRow(state);
  await renderer.renderDiff(mapping, stateToRow(state));
  assert.equal(calls.some((call) => call.name === "win.set" || call.name === "logo.show"), false);
  state.step = "f_end";
  const endedFinal = stateToRow(state);
  endedFinal.sound_cue_key = "round_transition";
  endedFinal.sound_cue_seq = 1;
  await renderer.renderDiff(mapping, endedFinal);
  assert.equal(calls.filter((call) => call.name === "win.set").at(-1).args[0], 26500);
  calls.length = 0;
  state.rounds.totals.A += state.final.runtime.sum;
  state.locks.gameEnded = true;
  const endedGame = stateToRow(state);
  endedGame.sound_cue_key = "final_end";
  endedGame.sound_cue_seq = 2;
  await renderer.renderDiff(endedFinal, endedGame);
  assert.equal(calls.some((call) => call.name === "win.set" || call.name === "logo.show"), false);
  await renderer.renderSnapshot(endedGame);
  assert.equal(calls.filter((call) => call.name === "win.set").at(-1).args[0], 26500);
});
