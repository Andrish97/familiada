import test from "node:test";
import assert from "node:assert/strict";
import { createSnakeGame, stepDelay, bonusPoints, MIN_DELAY, START_DELAY, BONUS_EVERY, BONUS_STEPS, BONUS_MIN, BONUS_MAX } from "../../web/snake/js/snake-game.js";

test("wąż idzie w prawo, je jabłko i rośnie", () => {
  const game = createSnakeGame({ cols: 10, rows: 5, rng: () => 0 });
  game.state.food = { x: 5, y: 2 };
  assert.deepEqual(game.step(), { ate: true, bonus: 0, dead: false });
  assert.equal(game.state.score, 1);
  assert.equal(game.state.apples, 1);
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

test("bonus: co kilka jabłek, znika po czasie, szybciej zjedzony daje więcej", () => {
  assert.equal(bonusPoints(BONUS_STEPS), BONUS_MAX);
  assert.equal(bonusPoints(0), BONUS_MIN);
  assert.ok(bonusPoints(BONUS_STEPS / 2) > BONUS_MIN && bonusPoints(BONUS_STEPS / 2) < BONUS_MAX);

  const game = createSnakeGame({ cols: 30, rows: 10, rng: () => 0.5 });
  // jabłka podsuwane przed głowę, aż pojawi się bonus
  for (let i = 0; i < BONUS_EVERY; i++) {
    const h = game.state.snake[0];
    game.state.food = { x: (h.x + 1) % 30, y: h.y };
    assert.equal(game.step().ate, true);
  }
  assert.ok(game.state.bonus, "bonus po 5 jabłkach");
  assert.equal(game.state.bonus.left, BONUS_STEPS);
  const len = game.state.snake.length;

  // zjedzony od razu: maksimum punktów, wąż nie rośnie
  const h = game.state.snake[0];
  game.state.bonus = { x: (h.x + 1) % 30, y: h.y, left: BONUS_STEPS };
  game.state.food = { x: h.x, y: (h.y + 5) % 10 };
  const before = game.state.score;
  const r = game.step();
  assert.equal(r.bonus, bonusPoints(BONUS_STEPS - 0));
  assert.equal(game.state.score, before + r.bonus);
  assert.equal(game.state.snake.length, len);
  assert.equal(game.state.bonus, null);

  // niezjedzony znika po BONUS_STEPS krokach
  game.state.bonus = { x: 0, y: 9, left: 3 };
  game.state.food = null;
  game.turn("up");
  game.step(); game.step();
  assert.ok(game.state.bonus);
  game.step();
  assert.equal(game.state.bonus, null);
});
