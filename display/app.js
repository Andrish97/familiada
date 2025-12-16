// ---------- Fullscreen ----------
const fsBtn = document.getElementById("fsBtn");
const stage = document.getElementById("stage");

function requestFs(el) {
  if (el.requestFullscreen) return el.requestFullscreen();
  // Safari (starsze)
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
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      await requestFs(stage);
    } else {
      await exitFs();
    }
  } catch (e) {
    console.warn("Fullscreen error:", e);
    // UWAGA: fullscreen zwykle działa tylko na https albo localhost
  }
}
fsBtn.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", () => {
  fsBtn.textContent = document.fullscreenElement ? "⤢" : "⛶";
  layoutAndRebuild();
});
document.addEventListener("webkitfullscreenchange", () => {
  fsBtn.textContent = document.webkitFullscreenElement ? "⤢" : "⛶";
  layoutAndRebuild();
});

// ---------- Helpers ----------
function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}
function createDot(isOn = false) {
  return el("div", "dot" + (isOn ? " on" : ""));
}

function create5x7Module(className) {
  const m = el("div", className);
  const dots = [];
  for (let i = 0; i < 35; i++) {
    const d = createDot(false);
    dots.push(d);
    m.appendChild(d);
  }
  return { node: m, dots };
}

// ---------- Builders ----------
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

function buildStrip96x7(root) {
  const grid = el("div", "pixelGrid");
  grid.style.gridTemplateColumns = `repeat(96, var(--dotStrip))`;
  grid.style.gridTemplateRows = `repeat(7, var(--dotStrip))`;

  const dots = [];
  for (let i = 0; i < 96 * 7; i++) {
    const d = createDot(false);
    d.style.width = "var(--dotStrip)";
    d.style.height = "var(--dotStrip)";
    dots.push(d);
    grid.appendChild(d);
  }
  root.appendChild(grid);
  return { dots };
}

// ---------- Sizing (ważne) ----------
function computeDotMainPx(mainWrapEl) {
  const rect = mainWrapEl.getBoundingClientRect();

  // realna przestrzeń na samą matrycę (odliczamy paddingi i trochę bufora)
  const availableW = Math.max(200, rect.width - 40);
  const availableH = Math.max(160, rect.height - 40);

  let best = 8;

  for (let dot = 8; dot <= 22; dot++) {
    const gap = Math.max(2, Math.round(dot * 0.20));
    const modW = 5 * dot + 4 * gap;
    const modH = 7 * dot + 6 * gap;
    const moduleGap = dot + gap;

    const totalW = 30 * modW + 29 * moduleGap;
    const totalH = 10 * modH + 9 * moduleGap;

    if (totalW <= availableW && totalH <= availableH) best = dot;
  }
  return best;
}

function applyDotSizing(dotMain) {
  const root = document.documentElement;

  const gapMain = Math.max(2, Math.round(dotMain * 0.20));
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

// ---------- Rebuild ----------
let mainDisp, leftDisp, rightDisp, topDisp, stripL, stripR;

function clearHost(id) {
  const host = document.getElementById(id);
  host.innerHTML = "";
  return host;
}

function layoutAndRebuild() {
  const mainWrap = document.getElementById("mainWrap");
  const dotMain = computeDotMainPx(mainWrap);
  applyDotSizing(dotMain);

  mainDisp = buildMainMatrix(clearHost("mainMatrix"));
  leftDisp = buildBigDigits(clearHost("leftScore"), 3);
  rightDisp = buildBigDigits(clearHost("rightScore"), 3);
  topDisp = buildBigDigits(clearHost("topDigit"), 2);
  stripL = buildStrip96x7(clearHost("strip1"));
  stripR = buildStrip96x7(clearHost("strip2"));
}

window.addEventListener("resize", layoutAndRebuild);
window.addEventListener("orientationchange", layoutAndRebuild);
layoutAndRebuild();

// ---------- Demo (żeby było widać, że świeci) ----------
function randomizeModule(mod, density = 0.16) {
  for (const d of mod.dots) d.classList.toggle("on", Math.random() < density);
}
function randomizeDots(dots, density = 0.04) {
  for (const d of dots) d.classList.toggle("on", Math.random() < density);
}

setInterval(() => {
  for (let i = 0; i < 34; i++) {
    const m = mainDisp.modules[(Math.random() * mainDisp.modules.length) | 0];
    randomizeModule(m, 0.18);
  }
  for (const m of leftDisp.modules) randomizeModule(m, 0.10);
  for (const m of rightDisp.modules) randomizeModule(m, 0.10);
  for (const m of topDisp.modules) randomizeModule(m, 0.08);
  randomizeDots(stripL.dots, 0.03);
  randomizeDots(stripR.dots, 0.03);
}, 220);
