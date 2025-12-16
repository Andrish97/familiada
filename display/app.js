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
  const mainW = 30*segW + 29*segW
