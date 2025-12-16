// Fullscreen (wymaga kliknięcia – ograniczenie przeglądarek)
const fsBtn = document.getElementById("fsBtn");
const stage = document.getElementById("stage");

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await stage.requestFullscreen();
    else await document.exitFullscreen();
  } catch (e) {
    console.warn("Fullscreen error:", e);
  }
}
fsBtn.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  fsBtn.textContent = document.fullscreenElement ? "⤢" : "⛶";
  layoutAndRebuild();
});

function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}

function createDot(isOn = false) {
  return el("div", "dot" + (isOn ? " on" : ""));
}

/* --- Budowa modułów --- */
function create5x7Module(className = "module") {
  const m = el("div", className);
  const dots = [];
  for (let i = 0; i < 35; i++) {
    const d = createDot(false);
    dots.push(d);
    m.appendChild(d);
  }
  return { node: m, dots };
}

/* 30x10 modułów */
function buildMainMatrix(root) {
  const grid = el("div", "modulesGrid");
  grid.style.gridTemplateColumns = `repeat(30, max-content)`;
  grid.style.gridTemplateRows = `repeat(10, max-content)`;

  const modules = [];
  for (let i = 0; i < 30 * 10; i++) {
    const mod = create5x7Module("module");
    modules.push(mod);
    grid.appendChild(mod.node);
  }
  root.appendChild(grid);
  return { modules };
}

/* boki i góra: N “dużych” modułów 5x7 */
function buildBigDigits(root, count) {
  const row = el("div", "bigRow");
  row.style.setProperty("--bigCount", String(count));

  const modules = [];
  for (let i = 0; i < count; i++) {
    const mod = create5x7Module("bigModule");
    modules.push(mod);
    row.appendChild(mod.node);
  }
  root.appendChild(row);
  return { modules };
}

/* paski 96x7 */
function buildStrip96x7(root) {
  const grid = el("div", "pixelGrid");
  grid.style.gridTemplateColumns = `repeat(96, var(--dotStrip))`;
  grid.style.gridTemplateRows = `repeat(7, var(--dotStrip))`;

  const dots = [];
  for (let i = 0; i < 96 * 7; i++) {
    const d = createDot(false);
    // dla pasków dot ma mieć rozmiar strip — ustawimy to CSS-em przez inline var
    d.style.width = "var(--dotStrip)";
    d.style.height = "var(--dotStrip)";
    dots.push(d);
    grid.appendChild(d);
  }
  root.appendChild(grid);
  return { dots };
}

/* --- Dobór rozmiaru kropek tak, żeby środkowy był maksymalny --- */
function computeDotMainPx(mainWrapEl) {
  // ile mamy miejsca w mainWrap (pady są w CSS)
  const rect = mainWrapEl.getBoundingClientRect();

  // zostawmy mały bufor na obramowania/cienie
  const availableW = Math.max(200, rect.width - 40);
  const availableH = Math.max(160, rect.height - 40);

  // zależności wymiarów głównej matrycy:
  // moduł: (5*dot + 4*gap)
  // między modułami: moduleGap = dot + gap
  // szerokość: 30*modW + 29*moduleGap
  // wysokość: 10*modH + 9*moduleGap, gdzie modH = 7*dot + 6*gap

  // gap jako ułamek dot (potem zaokrąglimy)
  // spróbujmy znaleźć dot iteracyjnie (prosto, stabilnie)
  let best = 6;

  for (let dot = 6; dot <= 18; dot++) {
    const gap = Math.max(2, Math.round(dot * 0.2));
    const modW = 5*dot + 4*gap;
    const modH = 7*dot + 6*gap;
    const moduleGap = dot + gap;

    const totalW = 30*modW + 29*moduleGap;
    const totalH = 10*modH + 9*moduleGap;

    if (totalW <= availableW && totalH <= availableH) best = dot;
  }

  return best;
}

function applyDotSizing(dotMain) {
  const root = document.documentElement;

  const gapMain = Math.max(2, Math.round(dotMain * 0.2));
  const moduleGapMain = dotMain + gapMain;

  const dotStrip = Math.round(dotMain * 1.5);
  const gapStrip = Math.max(2, Math.round(dotStrip * 0.22));

  const dotBig = Math.round(dotMain * 3);
  const gapBig = Math.max(3, Math.round(dotBig * 0.18));

  root.style.setProperty("--dotMain", `${dotMain}px`);
  root.style.setProperty("--gapMain", `${gapMain}px`);
  root.style.setProperty("--moduleGapMain", `${moduleGapMain}px`);

  root.style.setProperty("--dotStrip", `${dotStrip}px`);
  root.style.setProperty("--gapStrip", `${gapStrip}px`);

  root.style.setProperty("--dotBig", `${dotBig}px`);
  root.style.setProperty("--gapBig", `${gapBig}px`);
}

/* --- Rebuild na resize/zmianę fullscreen --- */
let main, left, right, top, strip1, strip2;

function clearHost(id) {
  const host = document.getElementById(id);
  host.innerHTML = "";
  return host;
}

function layoutAndRebuild() {
  const mainWrap = document.getElementById("mainWrap");

  // 1) najpierw ustawmy mainWrap “jak największy” (CSS robi max-width/height)
  // 2) wylicz dotMain
  const dotMain = computeDotMainPx(mainWrap);
  applyDotSizing(dotMain);

  // 3) przebuduj DOM wyświetlaczy (żeby siatki miały nowe rozmiary)
  main = buildMainMatrix(clearHost("mainMatrix"));
  left = buildBigDigits(clearHost("leftScore"), 3);
  right = buildBigDigits(clearHost("rightScore"), 3);
  top = buildBigDigits(clearHost("topDigit"), 2);
  strip1 = buildStrip96x7(clearHost("strip1"));
  strip2 = buildStrip96x7(clearHost("strip2"));
}

window.addEventListener("resize", layoutAndRebuild);
window.addEventListener("orientationchange", layoutAndRebuild);
layoutAndRebuild();

/* --- demo: delikatne “życie” --- */
function randomizeModule(mod, density = 0.18) {
  for (const d of mod.dots) d.classList.toggle("on", Math.random() < density);
}
function randomizeDots(dots, density = 0.05) {
  for (const d of dots) d.classList.toggle("on", Math.random() < density);
}

setInterval(() => {
  // główny: trochę “szumu”
  for (let i = 0; i < 28; i++) {
    const m = main.modules[(Math.random() * main.modules.length) | 0];
    randomizeModule(m, 0.20);
  }

  // boki i góra stabilniej
  for (const m of left.modules) randomizeModule(m, 0.12);
  for (const m of right.modules) randomizeModule(m, 0.12);
  for (const m of top.modules) randomizeModule(m, 0.10);

  // dolne paski lekko
  randomizeDots(strip1.dots, 0.035);
  randomizeDots(strip2.dots, 0.035);
}, 220);
