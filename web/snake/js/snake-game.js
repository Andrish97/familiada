// Logika węża (bez DOM): plansza cols x rows pól, ściany i własny ogon kończą
// grę, jabłko wydłuża węża o jedno pole i daje punkt. Strona rysuje stan
// na kafelkach dużej planszy Wyświetlacza (30x10).

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

export const START_DELAY = 190;
export const MIN_DELAY = 80;
export const DELAY_STEP = 5;

/** Opóźnienie kroku (ms) dla danego wyniku -- wąż przyspiesza z każdym jabłkiem. */
export const stepDelay = (score) => Math.max(MIN_DELAY, START_DELAY - score * DELAY_STEP);

export function createSnakeGame({ cols = 30, rows = 10, rng = Math.random } = {}) {
  const y0 = Math.floor(rows / 2);
  const state = {
    cols, rows,
    snake: [{ x: 4, y: y0 }, { x: 3, y: y0 }, { x: 2, y: y0 }],
    dir: "right",
    queue: [],
    food: null,
    score: 0,
    dead: false,
    won: false,
  };

  const occupied = (x, y) => state.snake.some((s) => s.x === x && s.y === y);

  function placeFood() {
    const free = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!occupied(x, y)) free.push({ x, y });
    state.food = free.length ? free[Math.floor(rng() * free.length)] : null;
  }
  placeFood();

  // Kolejka do dwóch skrętów na krok, żeby szybkie „góra, lewo” nie ginęło
  // i żeby nie dało się zawrócić w miejscu.
  function turn(dir) {
    if (!DIRS[dir] || state.dead) return false;
    const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
    if (dir === last || dir === OPPOSITE[last] || state.queue.length >= 2) return false;
    state.queue.push(dir);
    return true;
  }

  /** Jeden krok. Zwraca { ate, dead }. */
  function step() {
    if (state.dead) return { ate: false, dead: true };
    if (state.queue.length) state.dir = state.queue.shift();
    const d = DIRS[state.dir];
    const head = { x: state.snake[0].x + d.x, y: state.snake[0].y + d.y };
    const ate = !!state.food && head.x === state.food.x && head.y === state.food.y;
    // Ogon odsuwa się w tym samym kroku, więc wolno wejść na jego pole (chyba że rośniemy).
    const body = ate ? state.snake : state.snake.slice(0, -1);
    const hitWall = head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows;
    if (hitWall || body.some((s) => s.x === head.x && s.y === head.y)) {
      state.dead = true;
      return { ate: false, dead: true };
    }
    state.snake = [head, ...body];
    if (ate) {
      state.score += 1;
      placeFood();
      if (!state.food) { state.won = true; state.dead = true; }
    }
    return { ate, dead: state.dead };
  }

  return { state, turn, step };
}
