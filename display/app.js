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
const byId = (id) => document.getElementById(id);
function el(tag, cls){ const n=document.createElement(tag); if(cls) n.className=cls; return n; }
function createDot(){ return el("div","dot"); }
function rect(el){ return el.getBoundingClientRect(); }

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

// ===== LED builders =====
function create5x7Module(){
  const m = el("div","module");
  const dots = [];
  for(let i=0;i<35;i++){
    const d=createDot();
    dots.push(d);
    m.appendChild(d);
  }
  return { node:m, dots };
}

function buildMainMatrix(root){
  const grid = el("div","modulesGrid");
  grid.style.gridTemplateColumns = "repeat(30, max-content)";
  grid.style.gridTemplateRows = "repeat(10, max-content)";
  const modules=[];
  for(let i=0;i<300;i++){
    const mod=create5x7Module();
    modules.push(mod);
    grid.appendChild(mod.node);
  }
  root.appendChild(grid);
  return { modules };
}

function buildBigDigits(root, count){
  const grid = el("div","modulesGrid");
  grid.style.gridTemplateColumns = `repeat(${count}, max-content)`;
  const modules=[];
  for(let i=0;i<count;i++){
    const mod=create5x7Module();
    modules.push(mod);
    grid.appendChild(mod.node);
  }
  root.appendChild(grid);
  return { modules };
}

function buildStrip96x7(root){
  const grid = el("div","pixelGrid");
  grid.style.gridTemplateColumns = "repeat(96, var(--dotSize))";
  grid.style.gridTemplateRows = "repeat(7, var(--dotSize))";
  const dots=[];
  for(let i=0;i<96*7;i++){
    const d=createDot();
    dots.push(d);
    grid.appendChild(d);
  }
  root.appendChild(grid);
  return { dots };
}

function clearHost(id){
  const host = byId(id);
  host.innerHTML="";
  return host;
}

function setPanelVars(panelEl, kind, dotMain){
  // kind: main|big|strip
  // dolne = 1× (jak główny)
  const dot = (kind==="big") ? Math.round(dotMain*3) : dotMain;

  const gap = Math.max(2, Math.round(dot * (kind==="big" ? 0.18 : 0.20)));
  const pad = Math.max(1, Math.round(dot * 0.10));
  const moduleGap = dot + gap;

  panelEl.style.setProperty("--dotSize", `${dot}px`);
  panelEl.style.setProperty("--dotGap", `${gap}px`);

  if(panelEl.classList.contains("hasSegments")){
    panelEl.style.setProperty("--cellPad", `${pad}px`);
    panelEl.style.setProperty("--moduleGap", `${moduleGap}px`);
  }
}

// ===== Elements =====
const mainPanel   = byId("mainPanel");
const leftPanel   = byId("leftPanel");
const rightPanel  = byId("rightPanel");
const topPanel    = byId("topPanel");
const stripLPanel = byId("stripLPanel");
const stripRPanel = byId("stripRPanel");

// ===== Build once =====
let mainDisp, leftDisp, rightDisp, topDisp, stripLD, stripRD;
function rebuild(){
  mainDisp  = buildMainMatrix(clearHost("mainMatrix"));
  leftDisp  = buildBigDigits(clearHost("leftScore"), 3);
  rightDisp = buildBigDigits(clearHost("rightScore"), 3);
  topDisp   = buildBigDigits(clearHost("topDigit"), 2);
  stripLD   = buildStrip96x7(clearHost("strip1"));
  stripRD   = buildStrip96x7(clearHost("strip2"));
}
rebuild();

// ===== Sizing =====
function sizePanels(dotMain){
  setPanelVars(mainPanel,   "main",  dotMain);
  setPanelVars(leftPanel,   "big",   dotMain);
  setPanelVars(rightPanel,  "big",   dotMain);
  setPanelVars(topPanel,    "big",   dotMain);
  setPanelVars(stripLPanel, "strip", dotMain);
  setPanelVars(stripRPanel, "strip", dotMain);

  // MAIN panel size from matrix math (żeby zawsze miało tło i się nie rozciągało)
  const gapMain = Math.max(2, Math.round(dotMain * 0.20));
  const padMain = Math.max(1, Math.round(dotMain * 0.10));
  const moduleGapMain = dotMain + gapMain;

  const modW = 5*dotMain + 4*gapMain + 2*padMain;
  const modH = 7*dotMain + 6*gapMain + 2*padMain;

  const totalW = 30*modW + 29*moduleGapMain;
  const totalH = 10*modH + 9*moduleGapMain;

  const extra = (10+12)*2; // panel padding + surface padding

  mainPanel.style.width  = `${totalW + extra}px`;
  mainPanel.style.height = `${totalH + extra}px`;

  // STRIPS 96x7 (1×)
  const dotStrip = dotMain;
  const gapStrip = Math.max(2, Math.round(dotStrip * 0.20));
  const stripW = 96*dotStrip + 95*gapStrip;
  const stripH = 7*dotStrip + 6*gapStrip;

  stripLPanel.style.width  = `${stripW + extra}px`;
  stripLPanel.style.height = `${stripH + extra}px`;
  stripRPanel.style.width  = `${stripW + extra}px`;
  stripRPanel.style.height = `${stripH + extra}px`;

  // big panele: shrink-to-fit
  leftPanel.style.width = "max-content";
  rightPanel.style.width = "max-content";
  topPanel.style.width = "max-content";
}

// ===== Anchors (DO KRAWĘDZI, stały offset) =====
function positionPanels(){
  // Offset od krawędzi ma być “trochę większy niż margines owalu”.
  // Owal ma w CSS ~16px, więc dajemy np. 28px.
  const EDGE = 28;

  // MAIN center
  mainPanel.style.left = "50%";
  mainPanel.style.top = "50%";
  mainPanel.style.right = "auto";
  mainPanel.style.bottom = "auto";
  mainPanel.style.transform = "translate(-50%,-50%)";

  // LEFT middle-left
  leftPanel.style.left = `${EDGE}px`;
  leftPanel.style.right = "auto";
  leftPanel.style.top = "50%";
  leftPanel.style.bottom = "auto";
  leftPanel.style.transform = "translateY(-50%)";

  // RIGHT middle-right
  rightPanel.style.right = `${EDGE}px`;
  rightPanel.style.left = "auto";
  rightPanel.style.top = "50%";
  rightPanel.style.bottom = "auto";
  rightPanel.style.transform = "translateY(-50%)";

  // TOP middle-top
  topPanel.style.left = "50%";
  topPanel.style.right = "auto";
  topPanel.style.top = `${EDGE}px`;
  topPanel.style.bottom = "auto";
  topPanel.style.transform = "translateX(-50%)";

  // BOTTOM corners
  stripLPanel.style.left = `${EDGE}px`;
  stripLPanel.style.right = "auto";
  stripLPanel.style.bottom = `${EDGE}px`;
  stripLPanel.style.top = "auto";
  stripLPanel.style.transform = "none";

  stripRPanel.style.right = `${EDGE}px`;
  stripRPanel.style.left = "auto";
  stripRPanel.style.bottom = `${EDGE}px`;
  stripRPanel.style.top = "auto";
  stripRPanel.style.transform = "none";
}

// ===== FIT: zmniejsz dotMain aż spełni warunki =====
function fit(){
  let dotMain = 18;
  const minDot = 7;

  let lastGood = null;

  for(; dotMain >= minDot; dotMain--){
    sizePanels(dotMain);
    positionPanels();

    // wymuś layout
    document.body.offsetHeight;

    const minGap = segmentWidth(dotMain);

    const panels = [mainPanel, leftPanel, rightPanel, topPanel, stripLPanel, stripRPanel];
    const rects = panels.map(rect);

    // muszą być w viewport (z marginesem 0)
    const inViewport = rects.every(r =>
      r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
    );

    // żadna para nie może być bliżej niż minGap
    let ok = true;
    for(let i=0;i<rects.length;i++){
      for(let j=i+1;j<rects.length;j++){
        if(tooClose(rects[i], rects[j], minGap)){
          ok = false;
          break;
        }
      }
      if(!ok) break;
    }

    if(inViewport && ok){
      lastGood = dotMain;
      break;
    }
  }

  // Jeśli NIE da się upchnąć (bardzo małe okno), ustaw minimalne sensowne i przynajmniej niech będzie przewidywalnie.
  if(lastGood === null){
    sizePanels(minDot);
    positionPanels();
  }
}

window.addEventListener("resize", fit);
window.addEventListener("orientationchange", fit);
document.addEventListener("fullscreenchange", fit);
fit();

// ===== Demo świecenia =====
function randomizeModule(mod, density){
  for(const d of mod.dots) d.classList.toggle("on", Math.random() < density);
}
function randomizeDots(dots, density){
  for(const d of dots) d.classList.toggle("on", Math.random() < density);
}

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
