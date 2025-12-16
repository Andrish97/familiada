const byId = (id) => document.getElementById(id);
const screens = byId("screens");

const mainPanel   = byId("mainPanel");
const leftPanel   = byId("leftPanel");
const rightPanel  = byId("rightPanel");
const topPanel    = byId("topPanel");
const stripLPanel = byId("stripLPanel");
const stripRPanel = byId("stripRPanel");

const fsBtn = byId("fsBtn");
const stage = byId("stage");

// ===== Fullscreen =====
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await stage.requestFullscreen();
    else await document.exitFullscreen();
  } catch (e) {
    console.warn("Fullscreen error:", e);
  }
}
fsBtn.addEventListener("click", toggleFullscreen);

// ===== DOM helpers =====
function el(tag, cls){ const n=document.createElement(tag); if(cls) n.className=cls; return n; }
function createDot(){ return el("div","dot"); }
function clearHost(id){ const h=byId(id); h.innerHTML=""; return h; }
function rect(el){ return el.getBoundingClientRect(); }

function create5x7Module(){
  const m = el("div","module");
  const dots = [];
  for(let i=0;i<35;i++){ const d=createDot(); dots.push(d); m.appendChild(d); }
  return { node:m, dots };
}

function buildMainMatrix(root){
  const grid = el("div","modulesGrid");
  grid.style.gridTemplateColumns = "repeat(30, max-content)";
  grid.style.gridTemplateRows = "repeat(10, max-content)";
  const modules=[];
  for(let i=0;i<300;i++){ const mod=create5x7Module(); modules.push(mod); grid.appendChild(mod.node); }
  root.appendChild(grid);
  return { modules };
}

function buildBigDigits(root, count){
  const grid = el("div","modulesGrid");
  grid.style.gridTemplateColumns = `repeat(${count}, max-content)`;
  const modules=[];
  for(let i=0;i<count;i++){ const mod=create5x7Module(); modules.push(mod); grid.appendChild(mod.node); }
  root.appendChild(grid);
  return { modules };
}

function buildStrip96x7(root){
  const grid = el("div","pixelGrid");
  grid.style.gridTemplateColumns = "repeat(96, var(--dotSize))";
  grid.style.gridTemplateRows = "repeat(7, var(--dotSize))";
  const dots=[];
  for(let i=0;i<96*7;i++){ const d=createDot(); dots.push(d); grid.appendChild(d); }
  root.appendChild(grid);
  return { dots };
}

// ===== Build =====
const mainDisp  = buildMainMatrix(clearHost("mainMatrix"));
const leftDisp  = buildBigDigits(clearHost("leftScore"), 3);
const rightDisp = buildBigDigits(clearHost("rightScore"), 3);
const topDisp   = buildBigDigits(clearHost("topDigit"), 2);
const stripLD   = buildStrip96x7(clearHost("strip1"));
const stripRD   = buildStrip96x7(clearHost("strip2"));

// ===== Sizing vars =====
function setPanelVars(panelEl, kind, dotMain){
  // top/left/right = 3×, main = 1×, dolne = 1×
  const dot = (kind === "big") ? Math.round(dotMain * 3) : dotMain;

  const gap = Math.max(2, Math.round(dot * (kind === "big" ? 0.18 : 0.20)));
  const pad = Math.max(1, Math.round(dot * 0.10));
  const moduleGap = dot + gap;

  panelEl.style.setProperty("--dotSize", `${dot}px`);
  panelEl.style.setProperty("--dotGap", `${gap}px`);

  if (panelEl.classList.contains("hasSegments")) {
    panelEl.style.setProperty("--cellPad", `${pad}px`);
    panelEl.style.setProperty("--moduleGap", `${moduleGap}px`);
  }
}

// segment 5×7 w skali 1 (dotMain)
function segmentWidth(dotMain){
  const gap = Math.max(2, Math.round(dotMain * 0.20));
  const pad = Math.max(1, Math.round(dotMain * 0.10));
  return (5*dotMain + 4*gap + 2*pad);
}

function tooClose(a, b, minGap){
  return !(
    (a.right + minGap) < b.left ||
    (a.left - minGap) > b.right ||
    (a.bottom + minGap) < b.top ||
    (a.top - minGap) > b.bottom
  );
}

// ===== Anchors (stały offset od krawędzi) =====
function anchorPanels(edgePx){
  // MAIN center
  mainPanel.style.left="50%"; mainPanel.style.top="50%";
  mainPanel.style.right="auto"; mainPanel.style.bottom="auto";
  mainPanel.style.transform="translate(-50%,-50%)";

  // LEFT / RIGHT middle
  leftPanel.style.left=`${edgePx}px`; leftPanel.style.top="50%";
  leftPanel.style.right="auto"; leftPanel.style.bottom="auto";
  leftPanel.style.transform="translateY(-50%)";

  rightPanel.style.right=`${edgePx}px`; rightPanel.style.top="50%";
  rightPanel.style.left="auto"; rightPanel.style.bottom="auto";
  rightPanel.style.transform="translateY(-50%)";

  // TOP middle-top
  topPanel.style.left="50%"; topPanel.style.top=`${edgePx}px`;
  topPanel.style.right="auto"; topPanel.style.bottom="auto";
  topPanel.style.transform="translateX(-50%)";

  // BOTTOM corners
  stripLPanel.style.left=`${edgePx}px`; stripLPanel.style.bottom=`${edgePx}px`;
  stripLPanel.style.top="auto"; stripLPanel.style.right="auto";
  stripLPanel.style.transform="none";

  stripRPanel.style.right=`${edgePx}px`; stripRPanel.style.bottom=`${edgePx}px`;
  stripRPanel.style.top="auto"; stripRPanel.style.left="auto";
  stripRPanel.style.transform="none";
}

// ===== Size panels by dotMain =====
function sizePanels(dotMain){
  setPanelVars(mainPanel, "main", dotMain);
  setPanelVars(leftPanel, "big", dotMain);
  setPanelVars(rightPanel,"big", dotMain);
  setPanelVars(topPanel,  "big", dotMain);
  setPanelVars(stripLPanel,"main", dotMain);
  setPanelVars(stripRPanel,"main", dotMain);

  // MAIN: dokładny rozmiar z geometrii (żeby miało tło)
  const gapMain = Math.max(2, Math.round(dotMain * 0.20));
  const padMain = Math.max(1, Math.round(dotMain * 0.10));
  const moduleGapMain = dotMain + gapMain;

  const modW = 5*dotMain + 4*gapMain + 2*padMain;
  const modH = 7*dotMain + 6*gapMain + 2*padMain;

  const totalW = 30*modW + 29*moduleGapMain;
  const totalH = 10*modH + 9*moduleGapMain;

  const extra = (10+12)*2; // panel + surface padding

  mainPanel.style.width  = `${totalW + extra}px`;
  mainPanel.style.height = `${totalH + extra}px`;

  // STRIPS: 96x7 w 1×
  const stripW = 96*dotMain + 95*gapMain;
  const stripH = 7*dotMain + 6*gapMain;
  stripLPanel.style.width  = `${stripW + extra}px`;
  stripLPanel.style.height = `${stripH + extra}px`;
  stripRPanel.style.width  = `${stripW + extra}px`;
  stripRPanel.style.height = `${stripH + extra}px`;

  // BIG panele – shrink-to-fit
  leftPanel.style.width="max-content";
  rightPanel.style.width="max-content";
  topPanel.style.width="max-content";
}

// ===== Fit: dobierz dotMain, potem ewentualnie uiScale =====
function fit(){
  // 1) najpierw dobierz dotMain (rozmiar diod) tak, by W OGÓLE było sensownie
  let dotMain = 16;
  const minDot = 7;

  for (; dotMain >= minDot; dotMain--){
    sizePanels(dotMain);

    // offset > margines owalu (16px) — stały, a dystanse pilnujemy skalą
    anchorPanels(28);

    // reset skali warstwy
    document.documentElement.style.setProperty("--uiScale", "1");

    // wymuś layout
    document.body.offsetHeight;

    const panels = [mainPanel,leftPanel,rightPanel,topPanel,stripLPanel,stripRPanel];
    const rects = panels.map(rect);
    const minGap = segmentWidth(dotMain);

    const inViewport = rects.every(r => r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight);

    let ok = true;
    for(let i=0;i<rects.length;i++){
      for(let j=i+1;j<rects.length;j++){
        if(tooClose(rects[i], rects[j], minGap)) { ok=false; break; }
      }
      if(!ok) break;
    }

    if(inViewport && ok) break;
  }

  // 2) jeśli nadal ciasno (mały ekran), zmniejszaj całą warstwę screens
  //    (proporcje diod zostają idealne).
  let uiScale = 1;
  for(let i=0;i<30;i++){
    document.documentElement.style.setProperty("--uiScale", String(uiScale));
    document.body.offsetHeight;

    const panels = [mainPanel,leftPanel,rightPanel,topPanel,stripLPanel,stripRPanel];
    const rects = panels.map(rect);
    const minGap = segmentWidth(dotMain);

    const inViewport = rects.every(r => r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight);

    let ok = true;
    for(let a=0;a<rects.length;a++){
      for(let b=a+1;b<rects.length;b++){
        if(tooClose(rects[a], rects[b], minGap)) { ok=false; break; }
      }
      if(!ok) break;
    }

    if(inViewport && ok) break;
    uiScale *= 0.97;
  }

  console.log("[FIT] dotMain =", dotMain, "uiScale =", getComputedStyle(document.documentElement).getPropertyValue("--uiScale"));
}

addEventListener("resize", fit);
addEventListener("orientationchange", fit);
document.addEventListener("fullscreenchange", fit);
fit();

// ===== Demo =====
function randomizeModule(mod, density){ for(const d of mod.dots) d.classList.toggle("on", Math.random() < density); }
function randomizeDots(dots, density){ for(const d of dots) d.classList.toggle("on", Math.random() < density); }

setInterval(() => {
  for(let i=0;i<34;i++){
    const m = mainDisp.modules[(Math.random()*mainDisp.modules.length)|0];
    randomizeModule(m, 0.18);
  }
  for(const m of leftDisp.modules)  randomizeModule(m, 0.10);
  for(const m of rightDisp.modules) randomizeModule(m, 0.10);
  for(const m of topDisp.modules)   randomizeModule(m, 0.08);

  randomizeDots(stripLD.dots, 0.03);
  randomizeDots(stripRD.dots, 0.03);
}, 220);
