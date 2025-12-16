// ===== Fullscreen =====
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

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const byId = (id) => document.getElementById(id);

function el(tag, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}
function createDot() { return el("div", "dot"); }

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
  for (let i = 0; i < 300; i++) {
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

function clearHost(id) {
  const host = byId(id);
  host.innerHTML = "";
  return host;
}

function rect(el) {
  return el.getBoundingClientRect();
}
function overlapsOrTooClose(a, b, minGapPx) {
  return !(
    (a.right + minGapPx) < b.left ||
    (a.left - minGapPx) > b.right ||
    (a.bottom + minGapPx) < b.top ||
    (a.top - minGapPx) > b.bottom
  );
}

function setPanelVars(panelEl, { dot, gap, moduleGap, cellPad }) {
  panelEl.style.setProperty("--dotSize", `${dot}px`);
  panelEl.style.setProperty("--dotGap", `${gap}px`);
  if (moduleGap != null) panelEl.style.setProperty("--moduleGap", `${moduleGap}px`);
  if (cellPad != null) panelEl.style.setProperty("--cellPad", `${cellPad}px`);
}

// ===== Elementy =====
const mainPanel = byId("mainPanel");
const topPanel = byId("topPanel");
const leftPanel = byId("leftPanel");
const rightPanel = byId("rightPanel");
const stripLPanel = byId("stripLPanel");
const stripRPanel = byId("stripRPanel");
const ringEl = $(".megaRing");
const centerGroup = byId("centerGroup");

// ===== Budowa (raz) =====
let mainDisp, leftDisp, rightDisp, topDisp, stripLD, stripRD;

function rebuildOnce() {
  mainDisp  = buildMainMatrix(clearHost("mainMatrix"));
  leftDisp  = buildBigDigits(clearHost("leftScore"), 3);
  rightDisp = buildBigDigits(clearHost("rightScore"), 3);
  topDisp   = buildBigDigits(clearHost("topDigit"), 2);
  stripLD   = buildStrip96x7(clearHost("strip1"));
  stripRD   = buildStrip96x7(clearHost("strip2"));
}
rebuildOnce();

// ===== Relacyjny layout: dobierz dotMain tak, by nic nie nachodziło =====
function applySizing(dotMain) {
  const gapMain = Math.max(2, Math.round(dotMain * 0.20));
  const padMain = Math.max(1, Math.round(dotMain * 0.10));
  const moduleGapMain = dotMain + gapMain;

  const dotBig = Math.round(dotMain * 3);
  const gapBig = Math.max(3, Math.round(dotBig * 0.18));
  const padBig = Math.max(2, Math.round(dotBig * 0.10));
  const moduleGapBig = dotBig + gapBig;

  // POPRAWKA: dolne paski = skala 1× jak główny
  const dotStrip = dotMain;
  const gapStrip = gapMain;

  // ustaw zmienne per panel
  setPanelVars(mainPanel,  { dot: dotMain, gap: gapMain, moduleGap: moduleGapMain, cellPad: padMain });
  setPanelVars(topPanel,   { dot: dotBig,  gap: gapBig,  moduleGap: moduleGapBig,  cellPad: padBig });
  setPanelVars(leftPanel,  { dot: dotBig,  gap: gapBig,  moduleGap: moduleGapBig,  cellPad: padBig });
  setPanelVars(rightPanel, { dot: dotBig,  gap: gapBig,  moduleGap: moduleGapBig,  cellPad: padBig });
  setPanelVars(stripLPanel,{ dot: dotStrip, gap: gapStrip });
  setPanelVars(stripRPanel,{ dot: dotStrip, gap: gapStrip });

  // Rozmiary głównej matrycy (30x10 modułów 5x7) – żeby panel “pasował” do zawartości
  const modW = 5*dotMain + 4*gapMain + 2*padMain;
  const modH = 7*dotMain + 6*gapMain + 2*padMain;
  const totalW = 30*modW + 29*moduleGapMain;
  const totalH = 10*modH + 9*moduleGapMain;

  // Panel ma jeszcze paddingi: panel(10*2) + surface(12*2)
  const extra = (10 + 12) * 2;
  mainPanel.style.width = `${totalW + extra}px`;
  mainPanel.style.height = `${totalH + extra}px`;

  // Owal skalujemy “z mainem” – stała relacja: trochę większy niż panel
  const ringPad = Math.round(dotMain * 22); // relacja do dotMain (reguluj jak chcesz)
  const ringW = totalW + extra + ringPad*2;
  const ringH = totalH + extra + Math.round(ringPad*1.25)*2;
  centerGroup.style.width = `${ringW}px`;
  centerGroup.style.height = `${ringH}px`;
  ringEl.style.width = `${ringW}px`;
  ringEl.style.height = `${ringH}px`;
}

function layoutAnchors() {
  // “Przypięcie” do krawędzi (stały margines w px ekranu)
  const edge = 18;
  topPanel.style.left = "50%";
  topPanel.style.top = `${edge}px`;
  topPanel.style.transform = "translateX(-50%)";

  leftPanel.style.left = `${edge}px`;
  leftPanel.style.top = `${edge + 56}px`;

  rightPanel.style.right = `${edge}px`;
  rightPanel.style.top = `${edge + 56}px`;

  stripLPanel.style.left = `${edge}px`;
  stripLPanel.style.bottom = `${edge}px`;

  stripRPanel.style.right = `${edge}px`;
  stripRPanel.style.bottom = `${edge}px`;

  // centrum
  centerGroup.style.left = "50%";
  centerGroup.style.top = "50%";
  centerGroup.style.transform = "translate(-50%,-50%)";
}

function fitAll() {
  layoutAnchors();

  // zaczynamy od ambitnego dotMain i schodzimy, aż będzie “czysto”
  let dotMain = 16;            // start większy
  const minDot = 7;            // nie schodźmy do absurdów
  const minGapBetweenPanels = 22;

  for (; dotMain >= minDot; dotMain--) {
    applySizing(dotMain);

    // wymuś layout
    // eslint-disable-next-line no-unused-expressions
    document.body.offsetHeight;

    const rCenter = rect(centerGroup);
    const rTop    = rect(topPanel);
    const rL      = rect(leftPanel);
    const rR      = rect(rightPanel);
    const rSL     = rect(stripLPanel);
    const rSR     = rect(stripRPanel);

    const bad =
      overlapsOrTooClose(rCenter, rTop,  minGapBetweenPanels) ||
      overlapsOrTooClose(rCenter, rL,    minGapBetweenPanels) ||
      overlapsOrTooClose(rCenter, rR,    minGapBetweenPanels) ||
      overlapsOrTooClose(rCenter, rSL,   minGapBetweenPanels) ||
      overlapsOrTooClose(rCenter, rSR,   minGapBetweenPanels) ||
      overlapsOrTooClose(rSL,     rSR,   minGapBetweenPanels);

    if (!bad) break;
  }
}

window.addEventListener("resize", fitAll);
window.addEventListener("orientationchange", fitAll);
document.addEventListener("fullscreenchange", fitAll);
fitAll();

// ===== Demo świecenia (żeby widać było, że działa) =====
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

  randomizeDots(stripLD.dots, 0.03);
  randomizeDots(stripRD.dots, 0.03);
}, 220);
