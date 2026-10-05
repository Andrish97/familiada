import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnimator } from "../../web/shared/js/display/anim.js";

function setup() {
  let clock = 0;
  const tiles = Array.from({ length: 2 }, () => ({ dots: Array.from({ length: 7 }, () => Array.from({ length: 5 }, () => ({
    fill: "off", setAttribute(_, value) { this.fill = value; clock += 0.1; },
  }))) }));
  const tileAt = (_, col) => tiles[col - 1];
  const clearTileAt = (big, col) => { for (const row of tileAt(big, col).dots) for (const dot of row) dot.setAttribute("fill", "off"); };
  const animator = createAnimator({
    tileAt, clearTileAt, dotOff: "off",
    snapArea: () => [tiles.map(() => Array.from({ length: 7 }, () => Array(5).fill("on")))],
    clearArea: (big) => { clearTileAt(big, 1); clearTileAt(big, 2); },
    now: () => clock,
    // Timer ma minimalną pauzę; koszt rysowania też zużywa czas animacji.
    wait: async (ms) => { clock += Math.max(4, ms); },
  });
  return { animator, tiles, now: () => clock };
}

test("edge timing includes SVG work instead of adding it to every pause", async () => {
  const { animator, tiles, now } = setup();
  await animator.inEdge({}, { c1: 1, c2: 2, r1: 1, r2: 1 }, "left", 50);
  assert.ok(Math.abs(now() - 57) < 0.01); // 7 ms przygotowania + 50 ms animacji
  assert.ok(tiles.every((tile) => tile.dots.flat().every((dot) => dot.fill === "on")));
  const start = now();
  await animator.outEdge({}, { c1: 1, c2: 2, r1: 1, r2: 1 }, "right", 50);
  assert.ok(Math.abs(now() - start - 50) < 0.01);
});

test("matrix timing compensates timer delay and preserves the final pixels", async () => {
  const { animator, tiles, now } = setup();
  await animator.inMatrix({}, { c1: 1, c2: 2, r1: 1, r2: 1 }, "right", 50);
  assert.ok(Math.abs(now() - 57) < 0.01);
  assert.ok(tiles.every((tile) => tile.dots.flat().every((dot) => dot.fill === "on")));
  const start = now();
  await animator.outMatrix({}, { c1: 1, c2: 2, r1: 1, r2: 1 }, "up", 50);
  assert.ok(Math.abs(now() - start - 50) < 0.01);
  assert.ok(tiles.every((tile) => tile.dots.flat().every((dot) => dot.fill === "off")));
});

test("browser animation groups pixel steps into display frames", async (t) => {
  const original = globalThis.requestAnimationFrame;
  t.after(() => { if (original) globalThis.requestAnimationFrame = original; else delete globalThis.requestAnimationFrame; });
  let clock = 0, frames = 0;
  globalThis.requestAnimationFrame = (callback) => { frames++; clock += 16; queueMicrotask(() => callback(clock)); };
  const tiles = Array.from({ length: 2 }, () => ({ dots: Array.from({ length: 7 }, () => Array.from({ length: 5 }, () => ({ fill: "off", setAttribute(_, fill) { this.fill = fill; } }))) }));
  const animator = createAnimator({
    tileAt: (_, col) => tiles[col - 1], clearTileAt() {}, clearArea() {}, dotOff: "off", now: () => clock,
    snapArea: () => [tiles.map(() => Array.from({ length: 7 }, () => Array(5).fill("on")))],
  });
  await animator.inMatrix({}, { c1: 1, c2: 2, r1: 1, r2: 1 }, "right", 40);
  assert.equal(frames, 3, "ten pixel columns share three frames instead of ten timers");
  assert.equal(clock, 48);
  assert.ok(tiles.every((tile) => tile.dots.flat().every((dot) => dot.fill === "on")));
});
