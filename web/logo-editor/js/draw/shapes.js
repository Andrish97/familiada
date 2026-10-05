// familiada/logo-editor/js/draw/shapes.js
// Kształty narzędzia „Kształty”: lista (ikony, czy mogą mieć wypełnienie)
// i geometria ścieżek SVG w prostokącie (x1,y1)-(x2,y2).

const svg = (inner) => `<svg viewBox="0 0 24 24" style="width:20px;height:20px">${inner}</svg>`;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2"';

// label = klucz tłumaczenia
export const SHAPES = [
  { id: "line", label: "logoEditor.draw.ui.shapes.line", hasFill: false, icon: svg(`<line x1="4" y1="20" x2="20" y2="4" ${STROKE} stroke-linecap="round"/>`) },
  { id: "rect", label: "logoEditor.draw.ui.shapes.rect", hasFill: true, icon: svg(`<rect x="4" y="6" width="16" height="12" rx="1" ${STROKE}/>`) },
  { id: "roundRect", label: "logoEditor.draw.ui.shapes.roundRect", hasFill: true, icon: svg(`<rect x="4" y="6" width="16" height="12" rx="4" ${STROKE}/>`) },
  { id: "ellipse", label: "logoEditor.draw.ui.shapes.ellipse", hasFill: true, icon: svg(`<ellipse cx="12" cy="12" rx="9" ry="6" ${STROKE}/>`) },
  { id: "triangle", label: "logoEditor.draw.ui.shapes.triangle", hasFill: true, icon: svg(`<polygon points="12,4 20,20 4,20" ${STROKE} stroke-linejoin="round"/>`) },
  { id: "diamond", label: "logoEditor.draw.ui.shapes.diamond", hasFill: true, icon: svg(`<polygon points="12,3 21,12 12,21 3,12" ${STROKE} stroke-linejoin="round"/>`) },
  { id: "pentagon", label: "logoEditor.draw.ui.shapes.pentagon", hasFill: true, icon: svg(`<polygon points="12,3 21,9 18,20 6,20 3,9" ${STROKE} stroke-linejoin="round"/>`) },
  { id: "hexagon", label: "logoEditor.draw.ui.shapes.hexagon", hasFill: true, icon: svg(`<polygon points="12,3 21,8 21,16 12,21 3,16 3,8" ${STROKE} stroke-linejoin="round"/>`) },
  { id: "star5", label: "logoEditor.draw.ui.shapes.star5", hasFill: true, icon: svg(`<polygon points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9" ${STROKE} stroke-linejoin="round"/>`) },
  { id: "arrow1", label: "logoEditor.draw.ui.shapes.arrow1", hasFill: false, icon: svg(`<path d="M5 12h14M14 7l5 5-5 5" ${STROKE} stroke-linecap="round" stroke-linejoin="round"/>`) },
  { id: "arrow2", label: "logoEditor.draw.ui.shapes.arrow2", hasFill: false, icon: svg(`<path d="M5 12h14M14 7l5 5-5 5M10 7L5 12l5 5" ${STROKE} stroke-linecap="round" stroke-linejoin="round"/>`) },
  { id: "arrow1Fill", label: "logoEditor.draw.ui.shapes.arrow1Fill", hasFill: true, icon: svg(`<path d="M12 19L19 12L12 5V9H5V15H12V19Z" ${STROKE} stroke-linejoin="round"/>`) },
  { id: "arrow2Fill", label: "logoEditor.draw.ui.shapes.arrow2Fill", hasFill: true, icon: svg(`<path d="M2 12 8.5 5V9h7V5L22 12l-6.5 7v-4h-7v4Z" ${STROKE} stroke-linejoin="round"/>`) },
  { id: "heart", label: "logoEditor.draw.ui.shapes.heart", hasFill: true, icon: svg(`<path d="M12 21C12 21 4 15 4 8.5 4 5 7 3 12 7c5-4 8-2 8 1.5 0 6.5-8 12.5-8 12.5z" ${STROKE} stroke-linejoin="round"/>`) },
  { id: "polygon", label: "logoEditor.draw.ui.shapes.polygon", hasFill: true, isPoly: true, icon: svg(`<polygon points="3,5 20,3 22,16 8,21" ${STROKE} stroke-linejoin="round"/>`) },
];

export const shapeById = (id) => SHAPES.find((s) => s.id === id) || SHAPES[1];

/** "M 1 2 L 3 4 Z" -> [["M",1,2],["L",3,4],["Z"]] (format fabric.Path). */
export function svgPathToArray(pathStr) {
  return (pathStr.match(/[a-zA-Z][^a-zA-Z]*/g) || []).map((token) => [
    token[0].toUpperCase(),
    ...token.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number),
  ]);
}

export function buildShapePath(shapeId, x1, y1, x2, y2, strokeWidth) {
  const cx = (x1+x2)/2, cy = (y1+y2)/2;
  const w = Math.abs(x2-x1) || 10, h = Math.abs(y2-y1) || 10;
  const r = Math.min(w,h)/2;
  const sw = strokeWidth || 6;
  const len = Math.hypot(x2-x1, y2-y1);

  switch(shapeId) {
    case "line": return `M ${x1} ${y1} L ${x2} ${y2}`;
    case "arrow1": return buildArrowPath(x1,y1,x2,y2,1,sw,false);
    case "arrow2": return buildArrowPath(x1,y1,x2,y2,2,sw,false);
    case "arrow1Fill": return buildArrowPath(x1,y1,x2,y2,1,sw,true);
    case "arrow2Fill": return buildArrowPath(x1,y1,x2,y2,2,sw,true);
    case "triangle": return `M ${cx} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
    case "diamond": return `M ${cx} ${y1} L ${x2} ${cy} L ${cx} ${y2} L ${x1} ${cy} Z`;
    case "pentagon": return buildPolygonPath(cx, cy, r, 5);
    case "hexagon": return buildPolygonPath(cx, cy, r, 6);
    case "star5": return buildStarPath(cx, cy, r, r*0.4, 5);
    case "heart": return buildHeartPath(cx, cy, Math.max(w,h));
    case "polygon": return `M ${x1} ${y1}`;
    default: return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
}

/**
 * Strzałka od (x1,y1) do (x2,y2). `unit` = szerokość jednego kafla
 * wyświetlacza w jednostkach sceny: grot ma co najmniej tyle, żeby dało się
 * go rozpoznać na kropkach, a grubość pełnej strzałki nie zależy od długości
 * (wcześniej rosła z długością, a grot cienkiej strzałki miał 1–2 kropki).
 */
export function buildArrowPath(x1, y1, x2, y2, dirCount, strokeW, isFilled, unit = 1040 / 30) {
  const dx = x2 - x1, dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx);
  const c = Math.cos(ang), s = Math.sin(ang);
  const sw = strokeW || 0;

  const tf = (pts) => pts.map(([px, py]) => [x1 + px*c - py*s, y1 + px*s + py*c]);
  const fp = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
  const poly = (pts) => { const p = tf(pts); return `M ${fp(p[0])} ${p.slice(1).map((q) => `L ${fp(q)}`).join(" ")} Z`; };
  // grot nie może zająć więcej niż część długości (przy krótkiej strzałce maleje)
  const maxHead = L * (dirCount === 2 ? 0.38 : 0.6);

  if (isFilled) {
    const sh = unit * 0.55 + sw * 1.5;            // połowa grubości trzonu
    const hl = Math.min(sh * 2.2, maxHead);       // długość grotu
    const hh = Math.max(sh * 2, sh + sw * 2);     // połowa szerokości grotu
    if (dirCount === 2) {
      return poly([
        [hl, -hh], [0, 0], [hl, hh], [hl, sh],
        [L - hl, sh], [L - hl, hh], [L, 0],
        [L - hl, -hh], [L - hl, -sh], [hl, -sh],
      ]);
    }
    return poly([[0, -sh], [L - hl, -sh], [L - hl, -hh], [L, 0], [L - hl, hh], [L - hl, sh], [0, sh]]);
  }

  // linia: otwarty kontur
  const hl = Math.min(Math.max(sw * 5, unit * 0.9), maxHead);
  const hh = hl * 0.5;
  const shaft = tf([[0, 0], [L, 0]]);
  const headE = tf([[L - hl, -hh], [L, 0], [L - hl, hh]]);
  let d = `M ${fp(shaft[0])} L ${fp(shaft[1])} M ${fp(headE[0])} L ${fp(headE[1])} L ${fp(headE[2])}`;
  if (dirCount === 2) {
    const headS = tf([[hl, -hh], [0, 0], [hl, hh]]);
    d += ` M ${fp(headS[0])} L ${fp(headS[1])} L ${fp(headS[2])}`;
  }
  return d;
}

function buildPolygonPath(cx,cy,r,sides) {
  let p="";
  for(let i=0;i<sides;i++){const a=(i/sides)*Math.PI*2-Math.PI/2; p+=(i===0?"M ":" L ")+`${cx+r*Math.cos(a)} ${cy+r*Math.sin(a)}`;}
  return p+" Z";
}

function buildStarPath(cx,cy,oR,iR,pts) {
  let p="";
  for(let i=0;i<pts*2;i++){const a=(i/(pts*2))*Math.PI*2-Math.PI/2; const r=i%2===0?oR:iR; p+=(i===0?"M ":" L ")+`${cx+r*Math.cos(a)} ${cy+r*Math.sin(a)}`;}
  return p+" Z";
}

function buildHeartPath(cx,cy,sz) { const s=sz/2; return `M ${cx} ${cy+s*0.7} C ${cx-s*1.2} ${cy-s*0.2}, ${cx-s*0.5} ${cy-s*1.2}, ${cx} ${cy-s*0.4} C ${cx+s*0.5} ${cy-s*1.2}, ${cx+s*1.2} ${cy-s*0.2}, ${cx} ${cy+s*0.7} Z`; }
