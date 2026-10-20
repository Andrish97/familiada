import test from "node:test";
import assert from "node:assert/strict";
import { createSnakeGame, stepDelay, MIN_DELAY, START_DELAY } from "../../web/snake/js/snake-game.js";

test("wąż idzie w prawo, je jabłko i rośnie", () => {
  const game = createSnakeGame({ cols: 10, rows: 5, rng: () => 0 });
  game.state.food = { x: 5, y: 2 };
  assert.deepEqual(game.step(), { ate: true, dead: false });
  assert.equal(game.state.score, 1);
  assert.equal(game.state.snake.length, 4);
  assert.deepEqual(game.state.snake[0], { x: 5, y: 2 });
});

test("nie da się zawrócić w miejscu, kolejka trzyma dwa skręty", () => {
  const game = createSnakeGame({ cols: 10, rows: 5 });
  assert.equal(game.turn("left"), false);
  assert.equal(game.turn("up"), true);
  assert.equal(game.turn("left"), true);
  assert.equal(game.turn("down"), false);
  game.state.food = null;
  game.step();
  game.step();
  assert.equal(game.state.dir, "left");
  assert.deepEqual(game.state.snake[0], { x: 3, y: 1 });
});

test("ściany są przenikalne: wąż wraca z przeciwnej strony", () => {
  const game = createSnakeGame({ cols: 6, rows: 3 });
  game.state.food = null;
  game.step();
  assert.equal(game.step().dead, false);
  assert.deepEqual(game.state.snake[0], { x: 0, y: 1 });
  game.turn("up");
  game.step(); game.step();
  assert.deepEqual(game.state.snake[0], { x: 0, y: 2 });
  assert.equal(game.state.dead, false);
});

test("własny ogon kończy grę, pole ogona w tym samym kroku jest wolne", () => {
  const game = createSnakeGame({ cols: 10, rows: 6 });
  game.state.food = null;
  game.state.snake = [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 3 }];
  game.state.dir = "down";
  assert.equal(game.step().dead, false);
  game.state.snake = [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }];
  game.state.dir = "down";
  assert.equal(game.step().dead, true);
});

test("tempo rośnie z wynikiem do minimum", () => {
  assert.equal(stepDelay(0), START_DELAY);
  assert.ok(stepDelay(5) < START_DELAY);
  assert.equal(stepDelay(1000), MIN_DELAY);
});
