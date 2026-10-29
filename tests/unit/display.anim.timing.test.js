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

test("restart cancels a matrix animation before it can overwrite the new screen", async () => {
  let generation = 0, writes = 0, clock = 0;
  const dots = Array.from({ length: 7 }, () => Array.from({ length: 5 }, () => ({
    setAttribute() { writes++; },
  })));
  const animator = createAnimator({
    tileAt: () => ({ dots }), clearTileAt() {}, clearArea() {}, dotOff: "off",
    snapArea: () => [[Array.from({ length: 7 }, () => Array(5).fill("on"))]],
    getGeneration: () => generation, now: () => clock,
    wait: async ms => { clock += ms; generation++; },
  });
  await assert.rejects(animator.inMatrix({}, { c1: 1, c2: 1, r1: 1, r2: 1 }, "down", 100), { name: "AbortError" });
  assert.equal(writes, 5, "only the first pixel row was painted before cancellation");
});

test("hidden page finishes the animation without waiting for frames", async (t) => {
  const originalFrame = globalThis.requestAnimationFrame;
  const originalDocument = globalThis.document;
  t.after(() => {
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame; else delete globalThis.requestAnimationFrame;
    if (originalDocument) globalThis.document = originalDocument; else delete globalThis.document;
  });
  let clock = 0;
  // Karta w tle: przeglądarka nie wywołuje requestAnimationFrame.
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
  const tiles = Array.from({ length: 2 }, () => ({ dots: Array.from({ length: 7 }, () => Array.from({ length: 5 }, () => ({ fill: "off", setAttribute(_, fill) { this.fill = fill; } }))) }));
  const animator = createAnimator({
    tileAt: (_, col) => tiles[col - 1], clearTileAt() {}, clearArea() {}, dotOff: "off", now: () => clock,
    snapArea: () => [tiles.map(() => Array.from({ length: 7 }, () => Array(5).fill("on")))],
  });
  const done = animator.inMatrix({}, { c1: 1, c2: 2, r1: 1, r2: 1 }, "right", 40);
  const result = await Promise.race([done.then(() => "done"), new Promise((resolve) => setTimeout(() => resolve("stuck"), 200))]);
  assert.equal(result, "done", "ukryta karta nie może czekać na klatki, bo Control czeka na potwierdzenie planszy");
  assert.ok(tiles.every((tile) => tile.dots.flat().every((dot) => dot.fill === "on")));
});

test("matrix entry over previous content overwrites it at the wave front instead of blanking the field", async () => {
  const tiles = Array.from({ length: 2 }, () => ({ dots: Array.from({ length: 7 }, () => Array.from({ length: 5 }, () => ({ fill: "new", setAttribute(_, fill) { this.fill = fill; } }))) }));
  let cleared = 0;
  const seen = [];
  const animator = createAnimator({
    tileAt: (_, col) => tiles[col - 1], clearTileAt() { cleared++; }, clearArea() { cleared++; }, dotOff: "off",
    snapArea: () => [tiles.map(() => Array.from({ length: 7 }, () => Array(5).fill("new")))],
    wait: async () => { seen.push(tiles[1].dots[0][4].fill); },
  });
  const from = [tiles.map(() => Array.from({ length: 7 }, () => Array(5).fill("old")))];
  await animator.inMatrix({}, { c1: 1, c2: 2, r1: 1, r2: 1 }, "right", 10, { from });
  assert.equal(cleared, 0, "field is not blanked before the wave");
  assert.equal(seen[0], "old", "the far end still shows the old content when the wave starts");
  assert.ok(tiles.every((tile) => tile.dots.flat().every((dot) => dot.fill === "new")));
});

test("board transition tears old tiles out at random and overlaps the new board wipe without punching holes in it", async () => {
  // 3 kafle w rzędzie, 2 rzędy; stara plansza świeci wszędzie, nowa ma "new".
  const grid = Array.from({ length: 2 }, () => Array.from({ length: 3 }, () => ({ dots: Array.from({ length: 7 }, () => Array.from({ length: 5 }, () => ({ fill: "new", setAttribute(_, fill) { this.fill = fill; } }))) })));
  let clock = 0;
  const timeline = [];
  const animator = createAnimator({
    tileAt: (_, c, r) => grid[r - 1]?.[c - 1], clearTileAt() {}, clearArea() {}, dotOff: "off",
    snapArea: () => grid.map((row) => row.map((t) => t.dots.map((line) => line.map((d) => d.fill)))),
    now: () => clock,
    wait: async (ms) => { clock += ms; timeline.push({ at: clock, tiles: grid.flat().map((t) => t.dots.flat().map((d) => d.fill)) }); },
  });
  const from = grid.map((row) => row.map(() => Array.from({ length: 7 }, () => Array(5).fill("old"))));
  let seed = 7;
  const rng = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  await animator.transition({}, { c1: 1, r1: 1, c2: 3, r2: 2 }, { from, outMs: 100, inMs: 140, overlapMs: 40, rng });
  assert.equal(clock, 200, "out 100 ms + in 140 ms - overlap 40 ms");
  // Przed nakładką część starej planszy już zgasła, część jeszcze stoi.
  const beforeIn = timeline.filter((s) => s.at < 60).at(-1).tiles;
  assert.ok(beforeIn.some((t) => t.every((f) => f === "off")) && beforeIn.some((t) => t.every((f) => f === "old")));
  // Koniec: cała nowa plansza, bez dziur po wyrywaniu.
  assert.ok(grid.flat().every((t) => t.dots.flat().every((d) => d.fill === "new")));
});
