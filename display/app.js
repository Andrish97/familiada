// Prosty generator “diodek” (divy), bez rysowania tekstu.
// Na razie chodzi o układ i wymiary siatek.

function el(tag, className, styleVars = {}) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  for (const [k, v] of Object.entries(styleVars)) n.style.setProperty(k, v);
  return n;
}

function createDot(isOn = false) {
  const d = el("div", "dot" + (isOn ? " on" : ""));
  return d;
}

/**
 * Tworzy moduł 5x7.
 * Zwraca { node, dots } gdzie dots to tablica 35 elementów (kolejność: wierszami).
 */
function create5x7Module() {
  const m = el("div", "module");
  const dots = [];
  for (let i = 0; i < 35; i++) {
    const d = createDot(false);
    dots.push(d);
    m.appendChild(d);
  }
  return { node: m, dots };
}

/**
 * Duża tablica: 30x10 modułów 5x7, z przerwą między modułami = jedna dioda
 */
function buildMainDisplay(root) {
  const grid = el("div", "modulesGrid");
  grid.style.gridTemplateColumns = `repeat(30, max-content)`;
  grid.style.gridTemplateRows = `repeat(10, max-content)`;

  // kolekcja dla ewentualnej animacji
  const modules = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 30; x++) {
      const mod = create5x7Module();
      modules.push(mod);
      grid.appendChild(mod.node);
    }
  }

  root.appendChild(grid);
  return { grid, modules };
}

/**
 * Mały górny: 3 "większe" moduły 5x7 (kropki ~3x)
 */
function buildSmallTop(root) {
  const wrap = el("div", "bigModulesRow", {
    "--dot": "24px",
    "--dotGap": "4px",
  });

  const modules = [];
  for (let i = 0; i < 3; i++) {
    const mod = create5x7Module();
    modules.push(mod);
    wrap.appendChild(mod.node);
  }

  root.appendChild(wrap);
  return { wrap, modules };
}

/**
 * Pasek: siatka 96x7 pikseli, piksel 1.5x większy niż main
 */
function buildPixelStrip(root) {
  const strip = el("div", "pixelGrid", {
    "--dot": "12px",   // 1.5x przy main=8px
    "--dotGap": "3px",
  });

  strip.style.gridTemplateColumns = `repeat(96, var(--dot))`;
  strip.style.gridTemplateRows = `repeat(7, var(--dot))`;

  const dots = [];
  for (let i = 0; i < 96 * 7; i++) {
    const d = createDot(false);
    dots.push(d);
    strip.appendChild(d);
  }

  root.appendChild(strip);
  return { strip, dots };
}

/* === DEMO: losowe “mruganie”, żeby było widać, że to żyje === */

function randomizeModule(mod, density = 0.18) {
  for (const d of mod.dots) {
    d.classList.toggle("on", Math.random() < density);
  }
}

function randomizeStrip(stripDots, density = 0.08) {
  for (const d of stripDots) {
    d.classList.toggle("on", Math.random() < density);
  }
}

/* === Init === */

const mainRoot = document.getElementById("mainDisplay");
const topRoot  = document.getElementById("smallTop");
const midRoot  = document.getElementById("smallMid");
const botRoot  = document.getElementById("smallBot");

const main = buildMainDisplay(mainRoot);
const smallTop = buildSmallTop(topRoot);
const strip1 = buildPixelStrip(midRoot);
const strip2 = buildPixelStrip(botRoot);

// Delikatna animacja testowa
setInterval(() => {
  // kilka losowych modułów na dużej tablicy
  for (let i = 0; i < 24; i++) {
    const m = main.modules[(Math.random() * main.modules.length) | 0];
    randomizeModule(m, 0.22);
  }

  // 3 duże moduły (bardziej “czytelne”)
  for (const m of smallTop.modules) randomizeModule(m, 0.28);

  // paski
  randomizeStrip(strip1.dots, 0.06);
  randomizeStrip(strip2.dots, 0.06);
}, 220);
