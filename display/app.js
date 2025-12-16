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
  const grid = el("div", "modulesGrid", { "--dot":"10px", "--dotGap":"2px" });
  grid.style.gridTemplateColumns = `repeat(30, max-content)`;
  grid.style.gridTemplateRows = `repeat(10, max-content)`;

  const modules = [];
  for (let i = 0; i < 30 * 10; i++) {
    const mod = create5x7Module();
    modules.push(mod);
    grid.appendChild(mod.node);
  }
  root.appendChild(grid);
  return { modules };
}

/* “duże” 5x7 do cyfr */
function buildBigDigits(root, count, dotPx) {
  const wrap = el("div", "modulesGrid", {
    "--dot": `${dotPx}px`,
    "--dotGap": `${Math.max(3, Math.round(dotPx * 0.18))}px`,
  });
  wrap.style.gridTemplateColumns = `repeat(${count}, max-content)`;
  wrap.style.gap = `${Math.round(dotPx * 0.7)}px`;

  const modules = [];
  for (let i = 0; i < count; i++) {
    const mod = create5x7Module();
    modules.push(mod);
    wrap.appendChild(mod.node);
  }
  root.appendChild(wrap);
  return { modules };
}

/* 96x7 pikseli, piksel 1.5x większy niż main (main=10px => 15px) */
function buildStrip96x7(root, dotPx) {
  const grid = el("div", "pixelGrid", {
    "--dot": `${dotPx}px`,
    "--dotGap": `${Math.max(2, Math.round(dotPx * 0.22))}px`,
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
  return { dots };
}

/* --------- skalowanie na telefony --------- */
const rig = document.getElementById("rig");
const DESIGN_W = 980;
const DESIGN_H = 560;

function updateScale() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 24;
  const s = Math.min((vw - margin) / DESIGN_W, (vh - margin) / DESIGN_H);
  rig.style.setProperty("--scale", String(Math.min(1, s)));
}
window.addEventListener("resize", updateScale);
window.addEventListener("orientationchange", updateScale);
updateScale();

/* --------- fullscreen --------- */
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
  updateScale();
});

/* --------- budowa wyświetlaczy --------- */
const main = buildMainMatrix(document.getElementById("mainMatrix"));
const left = buildBigDigits(document.getElementById("leftScore"), 3, 20);
const right = buildBigDigits(document.getElementById("rightScore"), 3, 20);
const top = buildBigDigits(document.getElementById("topDigit"), 2, 18);

const strip1 = buildStrip96x7(document.getElementById("strip1"), 15);
const strip2 = buildStrip96x7(document.getElementById("strip2"), 15);

/* demo */
function randomizeModule(mod, density = 0.18) {
  for (const d of mod.dots) d.classList.toggle("on", Math.random() < density);
}
function randomizeDots(dots, density = 0.06) {
  for (const d of dots) d.classList.toggle("on", Math.random() < density);
}
setInterval(() => {
  for (let i = 0; i < 26; i++) {
    const m = main.modules[(Math.random() * main.modules.length) | 0];
    randomizeModule(m, 0.20);
  }
  for (const m of left.modules) randomizeModule(m, 0.14);
  for (const m of right.modules) randomizeModule(m, 0.14);
  for (const m of top.modules) randomizeModule(m, 0.12);

  randomizeDots(strip1.dots, 0.045);
  randomizeDots(strip2.dots, 0.045);
}, 220);
