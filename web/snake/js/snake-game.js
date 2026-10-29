// Logika węża (bez DOM): plansza cols x rows pól; ściany są przenikalne jak
// w starych telefonach (wąż wychodzi jedną krawędzią i wraca przeciwną),
// grę kończy tylko własny ogon. Jabłko wydłuża węża o jedno pole i daje punkt.
// Co BONUS_EVERY jabłek pojawia się bonus na BONUS_STEPS kroków: im szybciej
// zjedzony, tym więcej punktów (BONUS_MIN..BONUS_MAX); nie wydłuża węża i nie
// przyspiesza gry (tempo zależy tylko od jabłek).
// Strona rysuje stan na kafelkach dużej planszy Wyświetlacza (30x10).

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

export const BONUS_EVERY = 5;
export const BONUS_STEPS = 40;
export const BONUS_MIN = 5;
export const BONUS_MAX = 15;

/** Opóźnienie kroku (ms) -- wąż przyspiesza z każdym zjedzonym jabłkiem. */
export const stepDelay = (apples) => Math.max(MIN_DELAY, START_DELAY - apples * DELAY_STEP);

/** Punkty za bonus przy `left` pozostałych krokach. */
export const bonusPoints = (left) => BONUS_MIN + Math.round((BONUS_MAX - BONUS_MIN) * Math.max(0, left) / BONUS_STEPS);

export function createSnakeGame({ cols = 30, rows = 10, rng = Math.random } = {}) {
  const y0 = Math.floor(rows / 2);
  const state = {
    cols, rows,
    snake: [{ x: 4, y: y0 }, { x: 3, y: y0 }, { x: 2, y: y0 }],
    dir: "right",
    queue: [],
    food: null,
    bonus: null, // { x, y, left }
    apples: 0,
    score: 0,
    dead: false,
    won: false,
  };

  const same = (a, x, y) => !!a && a.x === x && a.y === y;
  const occupied = (x, y) => state.snake.some((s) => s.x === x && s.y === y) || same(state.food, x, y) || same(state.bonus, x, y);
  const freeCell = () => {
    const free = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!occupied(x, y)) free.push({ x, y });
    return free.length ? free[Math.floor(rng() * free.length)] : null;
  };
  const placeFood = () => { state.food = null; state.food = freeCell(); };
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

  /** Jeden krok. Zwraca { ate, bonus (zdobyte punkty bonusu albo 0), dead }. */
  function step() {
    if (state.dead) return { ate: false, bonus: 0, dead: true };
    if (state.queue.length) state.dir = state.queue.shift();
    const d = DIRS[state.dir];
    const head = { x: (state.snake[0].x + d.x + cols) % cols, y: (state.snake[0].y + d.y + rows) % rows };
    const ate = !!state.food && head.x === state.food.x && head.y === state.food.y;
    // Ogon odsuwa się w tym samym kroku, więc wolno wejść na jego pole (chyba że rośniemy).
    const body = ate ? state.snake : state.snake.slice(0, -1);
    if (body.some((s) => s.x === head.x && s.y === head.y)) {
      state.dead = true;
      return { ate: false, bonus: 0, dead: true };
    }
    state.snake = [head, ...body];
    let bonus = 0;
    if (same(state.bonus, head.x, head.y)) {
      bonus = bonusPoints(state.bonus.left);
      state.score += bonus;
      state.bonus = null;
    } else if (state.bonus && --state.bonus.left <= 0) {
      state.bonus = null;
    }
    if (ate) {
      state.apples += 1;
      state.score += 1;
      placeFood();
      if (!state.food) { state.won = true; state.dead = true; }
      else if (state.apples % BONUS_EVERY === 0) {
        const cell = freeCell();
        state.bonus = cell ? { ...cell, left: BONUS_STEPS } : null;
      }
    }
    return { ate, bonus, dead: state.dead };
  }

  return { state, turn, step };
}
