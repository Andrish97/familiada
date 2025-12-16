// ---------- Fullscreen ----------
const fsBtn = document.getElementById("fsBtn");
const stage = document.getElementById("stage");

function requestFs(el) {
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  return Promise.reject(new Error("Fullscreen API not supported"));
}
function exitFs() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  return Promise.reject(new Error("Exit Fullscreen not supported"));
}
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) await requestFs(stage);
    else await exitFs();
  } catch (e) {
    console.warn("Fullscreen error:", e);
    // Fullscreen zwykle działa pewnie na https/localhost (nie zawsze na file:///)
  }
}
fsBtn.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", layoutAndRebuild);
document.addEventListener("webkitfullscreenchange", layoutAndRebuild);

// ---------- DOM helpers ----------
function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}
function createDot() {
  return el("div", "dot");
}

// ---------- builders ----------
function create5x7Module() {
  const m = el("div", "module");
  const dots = [];
  for (let i = 0; i < 35; i++) {
    const d = createDot();
    dots.push(d);
    m.appendChild(d);
  }
  return { node: m, dots };
}

function buildMainMatrix(root) {
  const grid = el("div", "modulesGrid");
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

function buildBigDigits(root, count) {
  const grid = el("div", "modulesGrid");
  grid.style.gridTemplateColumns = `repeat(${count}, max-content)`;
  grid.style.gridAutoRows = `max-content`;

  const modules = [];
  for (let i = 0; i < count; i++) {
    const mod = create5x7Module();
    modules.push(mod);
    grid.appendChild(mod.node);
  }
  root.appendChild(grid);
  return { modules };
}

function buildStrip96x7(root) {
  const grid = el("div", "pixelGrid");
  grid.style.gridTemplateColumns = `repeat(96, var(--dotSize))`;
  grid.style.gridTemplateRows = `repeat(7, var(--dotSize))`;

  const dots = [];
  for (let i = 0; i < 96 * 7; i++) {
    const d = createDot();
    dots.push(d);
    grid.appendChild(d);
  }
  root.appendChild(grid);
  return { dots };
}

// ---------- sizing logic (1× / 1.5× / 3×) ----------
function computeDotMainPx(mainPanelEl) {
  // mainPanelEl = .panel--main (ma stałe wymiary w CSS)
  const rect = mainPanelEl.getBoundingClientRect();

  // odejmujemy padding panelu i surface (2x: panel padding 10 + surface padding 12)
  const availableW = Math.max(200, rect.width - (10+12)*2 - 10);
  const availableH = Math.max(160, rect.height - (10+12)*2 - 10);

  let best = 8;

  for (let dot = 8; dot <= 26; dot++) {
    const gap = Math.max(2, Math.round(dot * 0.20));
    const pad = Math.max(1, Math.round(dot * 0.10)); // padding w segmencie (czarne tło wokół kropek)

    const modW = 5*dot + 4*gap + 2*pad;
    const modH = 7*dot + 6*gap + 2*pad;
    const moduleGap = dot + gap; // przerwa między segmentami ~ szerokość diody

    const totalW = 30*modW + 29*moduleGap;
    const totalH = 10*modH + 9*moduleGap;

    if (totalW <= availableW && totalH <= availableH) best = dot;
  }

  return best;
}

function setPanelVars(panelEl, dotSize, dotGap, moduleGap, cellPad) {
  panelEl.style.setProperty("--dotSize", `${dotSize}px`);
  panelEl.style.setProperty("--dotGap", `${dotGap}px`);
  panelEl.style.setProperty("--moduleGap", `${moduleGap}px`);
  panelEl.style.setProperty("--cellPad", `${cellPad}px`);
}

let mainDisp, leftDisp, rightDisp, topDisp, stripL, stripR;

function clearHost(id) {
  const host = document.getElementById(id);
  host.innerHTML = "";
  return host;
}

function layoutAndRebuild() {
  const mainPanel = document.getElementById("mainWrap");
  const dotMain = computeDotMainPx(mainPanel);

  const gapMain = Math.max(2, Math.round(dotMain * 0.20));
  const padMain = Math.max(1, Math.round(dotMain * 0.10));
  const moduleGapMain = dotMain + gapMain;

  const dotStrip = Math.round(dotMain * 1.5);
  const gapStrip = Math.max(2, Math.round(dotStrip * 0.22));

  const dotBig = Math.round(dotMain * 3);
  const gapBig = Math.max(3, Math.round(dotBig * 0.18));
  const padBig = Math.max(2, Math.round(dotBig * 0.10));
  const moduleGapBig = dotBig + gapBig;

  // MAIN (segmenty)
  setPanelVars(mainPanel, dotMain, gapMain, moduleGapMain, padMain);

  // LEFT/RIGHT/TOP (segmenty, 3×)
  setPanelVars(document.querySelector(".panel--left"),  dotBig, gapBig, moduleGapBig, padBig);
  setPanelVars(document.querySelector(".panel--right"), dotBig, gapBig, moduleGapBig, padBig);
  setPanelVars(document.querySelector(".panel--top"),   dotBig, gapBig, moduleGapBig, padBig);

  // STRIPS (bez segmentów, 1.5×, moduleGap i cellPad nie mają znaczenia)
  setPanelVars(document.querySelector(".panel--stripL"), dotStrip, gapStrip, 0, 0);
  setPanelVars(document.querySelector(".panel--stripR"), dotStrip, gapStrip, 0, 0);

  // przebudowa DOM
  mainDisp  = buildMainMatrix(clearHost("mainMatrix"));
  leftDisp  = buildBigDigits(clearHost("leftScore"), 3);
  rightDisp = buildBigDigits(clearHost("rightScore"), 3);
  topDisp   = buildBigDigits(clearHost("topDigit"), 2);
  stripL    = buildStrip96x7(clearHost("strip1"));
  stripR    = buildStrip96x7(clearHost("strip2"));
}

window.addEventListener("resize", layoutAndRebuild);
window.addEventListener("orientationchange", layoutAndRebuild);
layoutAndRebuild();

// ---------- demo: żeby było widać świecenie ----------
function randomizeModule(mod, density) {
  for (const d of mod.dots) d.classList.toggle("on", Math.random() < density);
}
function randomizeDots(dots, density) {
  for (const d of dots) d.classList.toggle("on", Math.random() < density);
}

setInterval(() => {
  for (let i = 0; i < 34; i++) {
    const m = mainDisp.modules[(Math.random() * mainDisp.modules.length) | 0];
    randomizeModule(m, 0.18);
  }
  for (const m of leftDisp.modules)  randomizeModule(m, 0.10);
  for (const m of rightDisp.modules) randomizeModule(m, 0.10);
  for (const m of topDisp.modules)   randomizeModule(m, 0.08);

  randomizeDots(stripL.dots, 0.03);
  randomizeDots(stripR.dots, 0.03);
}, 220);
