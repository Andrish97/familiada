function el(tag, className, styleVars = {}) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  for (const [k, v] of Object.entries(styleVars)) n.style.setProperty(k, v);
  return n;
}

function createDot(isOn = false) {
  return el("div", "dot" + (isOn ? " on" : ""));
}

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

/* 30x10 modułów 5x7 */
function buildMainMatrix(root) {
  const grid = el("div", "modulesGrid", {
    "--dot": "8px",
    "--dotGap": "2px",
  });
  grid.style.gridTemplateColumns = `repeat(30, max-content)`;
  grid.style.gridTemplateRows = `repeat(10, max-content)`;

  const modules = [];
  for (let i = 0; i < 30 * 10; i++) {
    const mod = create5x7Module();
    modules.push(mod);
    grid.appendChild(mod.node);
  }
  root.appendChild(grid);
  return { grid, modules };
}

/* “duże” moduły 5x7 do cyfr (np. 3 cyfry na bokach) */
function buildBigDigits(root, digitsCount, dotPx) {
  const wrap = el("div", "modulesGrid", {
    "--dot": `${dotPx}px`,
    "--dotGap": `${Math.max(3, Math.round(dotPx * 0.18))}px`,
  });
  wrap.style.gridTemplateColumns = `repeat(${digitsCount}, max-content)`;
  wrap.style.gridAutoRows = `max-content`;
  wrap.style.gap = `${Math.round(dotPx * 0.7)}px`;

  const modules = [];
  for (let i = 0; i < digitsCount; i++) {
    const mod = create5x7Module();
    modules.push(mod);
    wrap.appendChild(mod.node);
  }
  root.appendChild(wrap);
  return { wrap, modules };
}

/* pasek 96x7 (SUMA / podpis) */
function buildStrip96x7(root, dotPx) {
  const grid = el("div", "pixelGrid", {
    "--dot": `${dotPx}px`,
    "--dotGap": `${Math.max(2, Math.round(dotPx * 0.25))}px`,
  });
  grid.style.gridTemplateColumns = `repeat(96, var(--dot))`;
  grid.style.gridTemplateRows = `repeat(7, var(--dot))`;

  const dots = [];
  for (let i = 0; i < 96 * 7; i++) {
    const d = createDot(false);
    dots.push(d);
    grid.appendChild(d);
  }
  root.appendChild(grid);
  return { grid, dots };
}

/* demo “życia” */
function randomizeModule(mod, density = 0.18) {
  for (const d of mod.dots) d.classList.toggle("on", Math.random() < density);
}
function randomizeDots(dots, density = 0.08) {
  for (const d of dots) d.classList.toggle("on", Math.random() < density);
}

/* init */
const mainRoot = document.getElementById("mainMatrix");
const leftRoot = document.getElementById("leftScore");
const rightRoot = document.getElementById("rightScore");
const topRoot = document.getElementById("topDigit");
const sumRoot = document.getElementById("sumStrip");

const main = buildMainMatrix(mainRoot);

// zbliżone proporcje do zdjęcia: boki = 3 cyfry, góra = 1-2 cyfry
const left = buildBigDigits(leftRoot, 3, 16);
const right = buildBigDigits(rightRoot, 3, 16);
const top = buildBigDigits(topRoot, 2, 14);

// dolny podpis jak “SUMA 0” – na razie tylko kropki w pasku
const sum = buildStrip96x7(sumRoot, 10);

/* animacja testowa (żeby widać było, że to “wyświetlacze”) */
setInterval(() => {
  // trochę losu na głównym
  for (let i = 0; i < 28; i++) {
    const m = main.modules[(Math.random() * main.modules.length) | 0];
    randomizeModule(m, 0.22);
  }
  // boki i góra bardziej “stabilne”
  for (const m of left.modules) randomizeModule(m, 0.16);
  for (const m of right.modules) randomizeModule(m, 0.16);
  for (const m of top.modules) randomizeModule(m, 0.14);

  // pasek suma bardzo delikatnie
  randomizeDots(sum.dots, 0.05);
}, 220);
