const fsBtn = document.getElementById("fsBtn");
const dbg = document.getElementById("dbg");

fsBtn.onclick = async () => {
  try{
    if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch(e){ console.warn(e); }
};

const E = {
  main:  document.getElementById("frameMain"),
  left:  document.getElementById("frameLeft"),
  right: document.getElementById("frameRight"),
  top:   document.getElementById("frameTop"),
  bl:    document.getElementById("frameBL"),
  br:    document.getElementById("frameBR"),
};

// ======= “Projektowe” wymiary RELATYWNE =======
// Ustalmy bazę w jednostkach “segment 5x7” skali 1.
// segmentW = 1 unit, segmentH = 1 unit (umownie), a reszta jako mnożniki.
//
// MAIN: 30x10 segmentów (modułów) + przerwy między segmentami.
// SIDE/TOP: 3 segmenty obok siebie (to jest ważna poprawka!)
// STRIP: dwa dolne to 96x7 “pikseli”, ale jako RAMA przyjmujemy proporcję długiego paska.
// (Tu na razie rama – bez diod)

function computeLayoutScale(vw, vh){
  // Ustalmy:
  // - segW = 1 unit
  // - gap = segW (min odstęp) -> też zależny od skali
  // W praktyce skala S przelicza unit->px.

  const segW = 1;
  const segH = 1;

  // Parametry “konstrukcyjne” (w unitach)
  const gapU = 1;            // min odstęp = 1 segment
  const edgeU = 1;           // margines od krawędzi (w unitach, stały w tej samej skali)

  // MAIN: 30 segmentów + 29 przerw (przerwa = 1 segW, jak chciałeś)
  // To jest uproszczenie: w realu przerwa to “szerokość diody”, ale Ty teraz chcesz operować segmentami.
  const mainW = 30*segW + 29*segW;
  const mainH = 10*segH + 9*segW;

  // SIDE/TOP: 3 segmenty w rzędzie + 2 przerwy
  const sideW = 3*segW + 2*segW;
  const sideH = 1*segH;

  // STRIP: rama proporcjonalna do 96x7, ale w unitach:
  // przyjmijmy: width=96 "punktów", height=7 "punktów"
  // i przeliczmy to na segmenty: 1 segment ~ 5 "punktów" szerokości
  // => 96/5 = 19.2 segmentu szerokości, wysokość 7/7=1 segment wysokości
  const stripW = 19.2*segW; // długi
  const stripH = 1*segH;

  // Teraz ograniczenia:

  // Szerokość: left + gap + main + gap + right musi wejść
  // left/right przy krawędziach: potrzebują edgeU z lewej i prawej
  const neededW = edgeU + sideW + gapU + mainW + gapU + sideW + edgeU;

  // Wysokość: top + gap + main + gap + bottom strip
  // bottom strips są w rogach, więc w pionie liczy się max wysokość stripu
  const neededH = edgeU + sideH + gapU + mainH + gapU + stripH + edgeU;

  // Skala S = min( vw/neededW , vh/neededH )
  const S = Math.min(vw / neededW, vh / neededH);

  return { S, edgeU, gapU, mainW, mainH, sideW, sideH, stripW, stripH };
}

function px(u, S){ return u * S; }

function layout(){
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const L = computeLayoutScale(vw, vh);
  const S = L.S;

  // jeśli S > 1, nie powiększamy ponad 1:1 (opcjonalnie)
  const Sc = Math.min(S, 1);

  const edge = px(L.edgeU, Sc);
  const gap  = px(L.gapU, Sc);

  const mainW = px(L.mainW, Sc);
  const mainH = px(L.mainH, Sc);

  const sideW = px(L.sideW, Sc);
  const sideH = px(L.sideH, Sc);

  const stripW = px(L.stripW, Sc);
  const stripH = px(L.stripH, Sc);

  // MAIN center
  E.main.style.width = `${mainW}px`;
  E.main.style.height = `${mainH}px`;
  E.main.style.left = `calc(50% - ${mainW/2}px)`;
  E.main.style.top  = `calc(50% - ${mainH/2}px)`;

  // LEFT middle-left
  E.left.style.width = `${sideW}px`;
  E.left.style.height = `${sideH}px`;
  E.left.style.left = `${edge}px`;
  E.left.style.top  = `calc(50% - ${sideH/2}px)`;

  // RIGHT middle-right
  E.right.style.width = `${sideW}px`;
  E.right.style.height = `${sideH}px`;
  E.right.style.left = `${vw - edge - sideW}px`;
  E.right.style.top  = `calc(50% - ${sideH/2}px)`;

  // TOP middle-top
  E.top.style.width = `${sideW}px`;
  E.top.style.height = `${sideH}px`;
  E.top.style.left = `calc(50% - ${sideW/2}px)`;
  E.top.style.top  = `${edge}px`;

  // BOTTOM LEFT
  E.bl.style.width = `${stripW}px`;
  E.bl.style.height = `${stripH}px`;
  E.bl.style.left = `${edge}px`;
  E.bl.style.top  = `${vh - edge - stripH}px`;

  // BOTTOM RIGHT
  E.br.style.width = `${stripW}px`;
  E.br.style.height = `${stripH}px`;
  E.br.style.left = `${vw - edge - stripW}px`;
  E.br.style.top  = `${vh - edge - stripH}px`;

  dbg.textContent = `S=${Sc.toFixed(3)} edge=${edge.toFixed(1)} gap=${gap.toFixed(1)}`;
}

window.addEventListener("resize", layout);
window.addEventListener("fullscreenchange", layout);
layout();
