// ===== Fullscreen =====
const fsBtn = document.getElementById("fsBtn");
const stage = document.getElementById("stage");

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await stage.requestFullscreen();
    else await document.exitFullscreen();
  } catch (e) {
    console.warn("Fullscreen error:", e);
    // fullscreen stabilnie działa na https albo localhost (np. Live Server)
  }
}
fsBtn.addEventListener("click", toggleFullscreen);

// ===== Helpers =====
const byId = (id) => document.getElementById(id);
function el(tag, cls){ const n=document.createElement(tag); if(cls) n.className=cls; return n; }
function createDot(){ return el("div","dot"); }
function rect(el){ return el.getBoundingClientRect(); }

// minimalny dystans: szerokość segmentu 5x7 w skali 1 (dotMain)
function segmentWidth(dotMain){
  const gap = Math.max(2, Math.round(dotMain * 0.20));
  const pad = Math.max(1, Math.round(dotMain * 0.10));
  return (5*dotMain + 4*gap + 2*pad);
}

// sprawdza czy A i B są bliżej niż minGap (albo nachodzą)
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
  // kind: main|big|strip ; dotMain = skala 1
  const dot = (kind==="big") ? Math.round(dotMain*3) : dotMain; // dolne = 1 (jak główny)
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
const mainPanel  = byId("mainPanel");
const leftPanel  = byId("leftPanel");
const rightPanel = byId("rightPanel");
const topPanel   = byId("topPanel");
const stripLPanel= byId("stripLPanel");
const stripRPanel= byId("stripRPanel");

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

// ===== Size panels based on dotMain =====
function sizePanels(dotMain){
  // ustaw zmienne per panel
  setPanelVars(mainPanel, "main", dotMain);
  setPanelVars(leftPanel, "big", dotMain);
  setPanelVars(rightPanel,"big", dotMain);
  setPanelVars(topPanel,  "big", dotMain);
  setPanelVars(stripLPanel,"strip", dotMain);
  setPanelVars(stripRPanel,"strip", dotMain);

  // policz rozmiary “treści” głównej matrycy
  const gapMain = Math.max(2, Math.round(dotMain * 0.20));
  const padMain = Math.max(1, Math.round(dotMain * 0.10));
  const moduleGapMain = dotMain + gapMain;

  const modW = 5*dotMain + 4*gapMain + 2*padMain;
  const modH = 7*dotMain + 6*gapMain + 2*padMain;

  const totalW = 30*modW + 29*moduleGapMain;
  const totalH = 10*modH + 9*moduleGapMain;

  // panel padding: panel(10*2) + surface(12*2)
  const extra = (10+12)*2;
  mainPanel.style.width  = `${totalW + extra}px`;
  mainPanel.style.height = `${totalH + extra}px`;

  // dolne paski: 96x7 w skali 1×
  const dotStrip = dotMain;
  const gapStrip = Math.max(2, Math.round(dotStrip * 0.20));
  const stripW = 96*dotStrip + 95*gapStrip;
  const stripH = 7*dotStrip + 6*gapStrip;
  stripLPanel.style.width  = `${stripW + extra}px`;
  stripLPanel.style.height = `${stripH + extra}px`;
  stripRPanel.style.width  = `${stripW + extra}px`;
  stripRPanel.style.height = `${stripH + extra}px`;

  // big panele (3 moduły i 2 moduły) – ich rozmiar zostawiamy auto (content),
  // ale żeby nie “pływało” po rebuildach: wymusimy shrink-to-fit
  leftPanel.style.width = "max-content";
  rightPanel.style.width = "max-content";
  topPanel.style.width = "max-content";
}

// ===== Position panels (anchored) =====
function positionPanels(dotMain){
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // margines owalu: w CSS mamy 16px, więc odstęp ekranów > to:
  const minGap = segmentWidth(dotMain);         // wymagany dystans miedzy panelami
  const edge = 16 + minGap;                     // “odstęp większy niż w owalu”

  // MAIN: środek
  mainPanel.style.left = "50%";
  mainPanel.style.top = "50%";
  mainPanel.style.transform = "translate(-50%,-50%)";

  // LEFT/RIGHT: środek boków
  leftPanel.style.left = `${edge}px`;
  leftPanel.style.top = "50%";
  leftPanel.style.transform = "translateY(-50%)";

  rightPanel.style.right = `${edge}px`;
  rightPanel.style.left = "auto";
  rightPanel.style.top = "50%";
  rightPanel.style.transform = "translateY(-50%)";

  // TOP: środek góry
  topPanel.style.left = "50%";
  topPanel.style.top = `${edge}px`;
  topPanel.style.transform = "translateX(-50%)";

  // BOTTOM: rogi
  stripLPanel.style.left = `${edge}px`;
  stripLPanel.style.bottom = `${edge}px`;
  stripLPanel.style.top = "auto";
  stripLPanel.style.transform = "none";

  stripRPanel.style.right = `${edge}px`;
  stripRPanel.style.left = "auto";
  stripRPanel.style.bottom = `${edge}px`;
  stripRPanel.style.top = "auto";
  stripRPanel.style.transform = "none";

  // Upewnij się, że nie wyjeżdża poza ekran (przy bardzo małych oknach)
  // (fit() i tak to skoryguje przez zmniejszenie dotMain)
}

// ===== Fit algorithm: choose dotMain so nothing is closer than one segment width =====
function fit(){
  // startujemy od dużych diod i schodzimy
  let dotMain = 18;
  const minDot = 7;

  for(; dotMain >= minDot; dotMain--){
    sizePanels(dotMain);
    positionPanels(dotMain);

    // wymuś layout
    // eslint-disable-next-line no-unused-expressions
    document.body.offsetHeight;

    const minGap = segmentWidth(dotMain);

    const panels = [mainPanel, leftPanel, rightPanel, topPanel, stripLPanel, stripRPanel];
    const rects = panels.map(rect);

    // warunek 1: wszystkie w viewport
    const inViewport = rects.every(r => r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight);

    // warunek 2: żadna para nie jest “za blisko”
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

    if(inViewport && ok) break;
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
