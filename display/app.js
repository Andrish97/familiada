const main  = document.getElementById("main");
const left  = document.getElementById("left");
const right = document.getElementById("right");
const topP  = document.getElementById("top");
const botL  = document.getElementById("botL");
const botR  = document.getElementById("botR");

const fsBtn = document.getElementById("fsBtn");

fsBtn.onclick = async () => {
  if (!document.fullscreenElement)
    await document.documentElement.requestFullscreen();
  else
    await document.exitFullscreen();
};

/*
GEOMETRIA WYŚWIETLACZY (w jednostkach dotMain)
------------------------------------------------
segment 5x7:
  width  = 5d + 4g + 2p
  height = 7d + 6g + 2p
gdzie:
  g = 0.2d
  p = 0.1d
*/

function segmentSize(d){
  const g = 0.2 * d;
  const p = 0.1 * d;
  return {
    w: 5*d + 4*g + 2*p,
    h: 7*d + 6*g + 2*p
  };
}

/* WYMIARY EKRANÓW */
function screenSizes(dot){
  const seg = segmentSize(dot);

  const mainW = 30*seg.w + 29*(seg.w*0.2);
  const mainH = 10*seg.h + 9 *(seg.w*0.2);

  return {
    main:  { w: mainW, h: mainH },
    side:  { w: 3*seg.w, h: seg.h },
    strip: { w: 96*dot,  h: 7*dot }
  };
}

/* MAKSYMALNY dotMain Z VIEWPORTU */
function computeDot(){
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  for(let d = 18; d >= 6; d--){
    const s = screenSizes(d);
    const gap = segmentSize(d).w;

    const fitsW =
      s.side.w + gap + s.main.w + gap + s.side.w <= vw;

    const fitsH =
      s.side.h + gap + s.main.h + gap + s.strip.h <= vh;

    if(fitsW && fitsH) return d;
  }
  return 6;
}

function layout(){
  const dot = computeDot();
  const s = screenSizes(dot);
  const gap = segmentSize(dot).w;
  const EDGE = 20;

  /* MAIN – środek */
  main.style.width  = s.main.w + "px";
  main.style.height = s.main.h + "px";
  main.style.left   = "50%";
  main.style.top    = "50%";
  main.style.transform = "translate(-50%,-50%)";

  /* LEFT */
  left.style.width  = s.side.w + "px";
  left.style.height = s.side.h + "px";
  left.style.left   = EDGE + "px";
  left.style.top    = "50%";
  left.style.transform = "translateY(-50%)";

  /* RIGHT */
  right.style.width  = s.side.w + "px";
  right.style.height = s.side.h + "px";
  right.style.right  = EDGE + "px";
  right.style.top    = "50%";
  right.style.transform = "translateY(-50%)";

  /* TOP */
  topP.style.width  = s.side.w + "px";
  topP.style.height = s.side.h + "px";
  topP.style.left   = "50%";
  topP.style.top    = EDGE + "px";
  topP.style.transform = "translateX(-50%)";

  /* BOTTOM */
  botL.style.width  = s.strip.w + "px";
  botL.style.height = s.strip.h + "px";
  botL.style.left   = EDGE + "px";
  botL.style.bottom = EDGE + "px";

  botR.style.width  = s.strip.w + "px";
  botR.style.height = s.strip.h + "px";
  botR.style.right  = EDGE + "px";
  botR.style.bottom = EDGE + "px";
}

window.addEventListener("resize", layout);
window.addEventListener("fullscreenchange", layout);
layout();
