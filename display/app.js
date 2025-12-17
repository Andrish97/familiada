(() => {
  const NS = "http://www.w3.org/2000/svg";
  const $  = (id) => document.getElementById(id);
  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const VIEW = { W: 1600, H: 900, CX: 800, CY: 450 };

  // ===== WYGLĄD (zostaje taki sam) =====
  const COLORS = {
    big:  "#2e2e32",
    cell: "#000000",
    dotOff: "#2e2e32"
  };

  // ===== KOLORY “ZAPALONE” (dla 3 potrójnych) =====
  const LIT = {
    top:   "#34ff6a", // zielony (górny)
    left:  "#ff2e3b", // czerwony (lewy)
    right: "#2bff65"  // zielony (prawy)
  };

  // ===== FONT 5x7 (Twoje dane) =====
  const FONT = {
    meta: { name: "familiada-5x7", width: 5, height: 7 },
    letters: {
      "A":[14,17,17,17,31,17,17],
      "Ą":[14,17,17,31,17,17,2],
      "B":[30,9,9,15,9,9,30],
      "C":[14,17,16,16,16,17,14],
      "Ć":[2,4,14,16,16,16,14],
      "D":[30,9,9,9,9,9,30],
      "E":[31,16,16,30,16,16,31],
      "Ę":[30,16,28,16,16,30,1],
      "F":[31,16,16,30,16,16,16],
      "G":[15,16,16,19,17,17,14],
      "H":[17,17,17,31,17,17,17],
      "I":[14,4,4,4,4,4,14],
      "J":[1,1,1,1,1,17,14],
      "K":[17,18,20,24,20,18,17],
      "L":[16,16,16,16,16,16,31],
      "Ł":[8,8,8,12,24,8,15],
      "M":[17,27,21,17,17,17,17],
      "N":[17,25,25,21,19,19,17],
      "Ń":[2,4,17,25,21,19,17],
      "O":[14,17,17,17,17,17,14],
      "Ó":[2,4,14,17,17,17,14],
      "P":[30,17,17,30,16,16,16],
      "Q":[14,17,17,17,21,18,13],
      "R":[30,17,17,30,20,18,17],
      "S":[14,17,16,14,1,17,14],
      "Ś":[2,4,14,16,14,1,30],
      "T":[31,4,4,4,4,4,4],
      "U":[17,17,17,17,17,17,14],
      "V":[17,17,17,17,17,10,4],
      "W":[17,17,17,17,21,21,10],
      "X":[17,17,10,4,10,17,17],
      "Y":[17,17,10,4,4,4,4],
      "Z":[31,1,2,4,8,16,31],
      "Ź":[2,4,15,1,6,8,15],
      "Ż":[31,1,2,31,8,16,31]
    },
    digits: {
      "1":[4,12,4,4,4,4,14],
      "2":[14,17,1,2,4,8,31],
      "3":[31,1,2,6,1,17,14],
      "4":[2,6,10,18,31,2,2],
      "5":[31,16,30,1,1,17,14],
      "6":[6,8,16,30,17,17,14],
      "7":[31,1,2,4,8,8,8],
      "8":[14,17,17,14,17,17,14],
      "9":[14,17,17,15,1,2,12],
      "0":"@O"
    },
    punctuation: {
      ".":[0,0,0,0,0,24,24],
      ",":[0,0,0,0,0,8,16],
      ":":[24,24,0,0,0,24,24],
      ";":[24,24,0,0,0,8,16],
      "-":[0,0,0,14,0,0,0],
      "—":[0,0,0,31,31,0,0],
      "?":[14,17,1,2,4,0,4],
      "!":[4,4,4,4,4,0,4]
    },
    math: {
      "+":[0,4,4,31,4,4,0],
      "=":[0,31,0,31,0,0,0],
      "/":[1,2,4,8,16,0,0]
    },
    special: {
      " ":[0,0,0,0,0,0,0],
      "▒":[10,21,10,21,10,21,10],
      "█":[31,31,31,31,31,31,31],
      "░":[10,0,10,0,10,0,10],
      "◣":[16,24,28,30,31,31,31],
      "◤":[31,31,31,30,28,24,16],
      "◥":[31,31,31,15,7,3,1],
      "◢":[1,3,7,15,31,31,31],
      "⇖":[0,24,28,30,15,7,3],
      "⇗":[0,3,7,15,30,28,24],
      "⇘":[24,28,30,15,7,3,0],
      "⇙":[3,7,15,30,28,24,0],
      "⧗":[31,31,14,4,14,31,31],
      "⎴":[27,17,0,0,0,0,0],
      "⎵":[0,0,0,0,0,17,27],
      "✓":[0,1,2,20,8,0,0],
      "✗":[17,10,4,10,17,0,0],
      "←":[4,2,31,2,4,0,0],
      "→":[4,8,31,8,4,0,0]
    }
  };

  // ===== GEOMETRIA DOTÓW (zostaje jak było) =====
  const d = 4;           // średnica (środek)
  const g = 1;           // odstęp / margines
  const gapCells = d;    // odstęp między kaflami = średnica
  const DOTS = { X: 5, Y: 7 };

  const Wgrid = (X, d, g) => X * d + (X + 1) * g;
  const Hgrid = (Y, d, g) => Y * d + (Y + 1) * g;

  // ===== POMOCNIKI FONTU =====
  const buildGlyphMap = () => {
    const map = new Map();
    for (const group of ["letters","digits","punctuation","math","special"]) {
      for (const [k, v] of Object.entries(FONT[group] || {})) map.set(k, v);
    }
    return map;
  };
  const GLYPHS = buildGlyphMap();

  const resolveGlyph = (ch) => {
    const v = GLYPHS.get(ch);
    if (!v) return GLYPHS.get(" ") || [0,0,0,0,0,0,0];
    if (typeof v === "string" && v.startsWith("@")) {
      const key = v.slice(1);
      return resolveGlyph(key);
    }
    return v;
  };

  // ===== RYSOWANIE: wersja “sterowalna” dla pojedynczego kafla 5x7 =====
  const drawSingleDisplay5x7 = (parent, x, y, dDots, g, colors) => {
    const X = 5, Y = 7;
    const wInner = Wgrid(X, dDots, g);
    const hInner = Hgrid(Y, dDots, g);
    const wOuter = wInner + 2 * g;
    const hOuter = hInner + 2 * g;

    // rama
    parent.appendChild(el("rect", { x, y, width: wOuter, height: hOuter, rx: 0, fill: colors.big }));
    // tło komórki
    parent.appendChild(el("rect", { x: x + g, y: y + g, width: wInner, height: hInner, rx: 0, fill: colors.cell }));

    // kropki (zapisujemy referencje)
    const dots = Array.from({ length: Y }, () => Array.from({ length: X }, () => null));
    const r = dDots / 2;
    const step = dDots + g;

    for (let j = 0; j < Y; j++) {
      for (let i = 0; i < X; i++) {
        const c = el("circle", {
          cx: x + g + g + r + i * step,
          cy: y + g + g + r + j * step,
          r,
          fill: colors.dotOff
        });
        parent.appendChild(c);
        dots[j][i] = c;
      }
    }

    return { wOuter, hOuter, dots };
  };

  // ===== POTRÓJNY PANEL: 3 kafle obok siebie =====
  const drawTriplePanel = (parent, x, y, dDots, g, gap, colors) => {
    const tiles = [];
    const wSmall = Wgrid(5, dDots, g) + 2 * g; // outer
    const hSmall = Hgrid(7, dDots, g) + 2 * g; // outer

    for (let tx = 0; tx < 3; tx++) {
      const gx = x + tx * (wSmall + gap);
      const tileGroup = el("g", {});
      parent.appendChild(tileGroup);
      const tile = drawSingleDisplay5x7(tileGroup, gx, y, dDots, g, colors);
      tiles.push(tile);
    }
    return { tiles, w: 3 * wSmall + 2 * gap, h: hSmall };
  };

  const renderCharToTile = (tile, ch, onColor, offColor) => {
    const glyph = resolveGlyph(ch);
    const W = FONT.meta.width;  // 5
    const H = FONT.meta.height; // 7

    for (let row = 0; row < H; row++) {
      const bits = glyph[row] | 0;
      for (let col = 0; col < W; col++) {
        const mask = 1 << (W - 1 - col);
        const on = (bits & mask) !== 0;
        tile.dots[row][col].setAttribute("fill", on ? onColor : offColor);
      }
    }
  };

  const setTripleText = (triple, text, onColor) => {
    const s = (text ?? "").toString();
    for (let i = 0; i < 3; i++) {
      const ch = s[i] ? s[i].toUpperCase() : " ";
      renderCharToTile(triple.tiles[i], ch, onColor, COLORS.dotOff);
    }
  };

  // ====== RYSUJEMY TO CO BYŁO (1:1) ======
  // ŚRODEK (jak było) – zostawiamy, nie robimy mu jeszcze funkcji
  const center = $("center");

  const wSmall = Wgrid(DOTS.X, d, g);
  const hSmall = Hgrid(DOTS.Y, d, g);
  const centerW = 30 * wSmall + 29 * gapCells + 2 * g;
  const centerH = 10 * hSmall +  9 * gapCells + 2 * g;

  const centerX = VIEW.CX - centerW / 2;
  const centerY = VIEW.CY - centerH / 2;

  // oryginalne kafle środka (bez “sterowania” na razie)
  const drawDotsRaw = (parent, x, y, X, Y, dDots, g, color) => {
    const r = dDots / 2, step = dDots + g;
    for (let j = 0; j < Y; j++) for (let i = 0; i < X; i++) {
      parent.appendChild(el("circle", {
        cx: x + g + r + i * step,
        cy: y + g + r + j * step,
        r, fill: color
      }));
    }
  };

  const drawTiledRaw = (parent, x, y, tilesX, tilesY, dotX, dotY, dDots, g, gap, colors) => {
    const wSmall = Wgrid(dotX, dDots, g);
    const hSmall = Hgrid(dotY, dDots, g);
    const W = tilesX * wSmall + (tilesX - 1) * gap + 2 * g;
    const H = tilesY * hSmall + (tilesY - 1) * gap + 2 * g;

    parent.appendChild(el("rect", { x, y, width: W, height: H, rx: 0, fill: colors.big }));

    for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
      const cx = x + g + tx * (wSmall + gap);
      const cy = y + g + ty * (hSmall + gap);
      parent.appendChild(el("rect", { x: cx, y: cy, width: wSmall, height: hSmall, rx: 0, fill: colors.cell }));
      drawDotsRaw(parent, cx, cy, dotX, dotY, dDots, g, colors.dotOff);
    }
    return { W, H };
  };

  drawTiledRaw(center, centerX, centerY, 30, 10, DOTS.X, DOTS.Y, d, g, gapCells, { ...COLORS });

  // ===== PANELE (teraz funkcjonalne – 3 potrójne) =====
  const panels = $("panels");
  const dP = 3 * d;

  const wSmallP = Wgrid(DOTS.X, dP, g);
  const panelW_old = 3 * wSmallP + 2 * gapCells + 2 * g;

  const shift = panelW_old / 4;
  const sideY = 390;
  const leftX  = 10 + shift;
  const rightX = VIEW.W - panelW_old - 10 - shift;

  const topY = 65;
  const topX = VIEW.CX - panelW_old / 2;

  // Zamiast “raw tiled 3x1” robimy 3 kafle 5x7 sterowalne,
  // ALE w tej samej skali dP (żeby wyglądało identycznie).
  const leftTriple  = drawTriplePanel(panels, leftX,  sideY, dP, g, gapCells, COLORS);
  const rightTriple = drawTriplePanel(panels, rightX, sideY, dP, g, gapCells, COLORS);
  const topTriple   = drawTriplePanel(panels, topX,   topY,  dP, g, gapCells, COLORS);

  // ===== DÓŁ + PASEK (zostaje jak było) =====
  const basebar = $("basebar");
  const bottom  = $("bottom");

  const dBottom = 1.5 * d;
  const Xb = 95, Yb = 7;

  const gapFromOval = 22;
  const gapBetween  = 40;

  const ovalBottomY = 110 + 680;
  const yBottom = ovalBottomY + gapFromOval;

  const wInnerB = Wgrid(Xb, dBottom, g);
  const hInnerB = Hgrid(Yb, dBottom, g);
  const wBlock  = wInnerB + 2 * g;
  const hBlock  = hInnerB + 2 * g;

  const insetFactor = 0.20;
  const insetWanted = wBlock * insetFactor;
  const minGap = 10;
  const gapEff = Math.max(minGap, gapBetween - 2 * insetWanted);

  const totalW = 2 * wBlock + gapEff;
  const xLeft  = VIEW.CX - totalW / 2;
  const xRight = xLeft + wBlock + gapEff;

  // pasek
  const barX = 50, barW = 1500;
  const barPadY = 12;
  const barY = yBottom - barPadY;
  const barH = hBlock + barPadY * 2;

  basebar.appendChild(el("rect", {
    x: barX, y: barY, width: barW, height: barH,
    fill: "url(#silverGrad)",
    stroke: "#4db4ff",
    "stroke-width": 10,
    "stroke-opacity": 0.65,
    filter: "url(#neonBlue)"
  }));
  basebar.appendChild(el("rect", {
    x: barX, y: barY, width: barW, height: barH,
    fill: "none",
    stroke: "#9fe0ff",
    "stroke-width": 2,
    "stroke-opacity": 0.95
  }));

  const gapCenterX = xLeft + wBlock + gapEff / 2;
  const sideOffset = barW * 0.22;

  const cutXs = [
    Math.max(barX + 18, gapCenterX - sideOffset),
    gapCenterX,
    Math.min(barX + barW - 18, gapCenterX + sideOffset),
  ];

  for (const lx of cutXs) {
    basebar.appendChild(el("line", {
      x1: lx, y1: barY, x2: lx, y2: barY + barH,
      stroke: "#4db4ff",
      "stroke-width": 10,
      "stroke-opacity": 0.55,
      filter: "url(#neonBlue)"
    }));
    basebar.appendChild(el("line", {
      x1: lx, y1: barY, x2: lx, y2: barY + barH,
      stroke: "#9fe0ff",
      "stroke-width": 2,
      "stroke-opacity": 0.95
    }));
  }

  // dolne bloki (jak było, “raw”)
  const drawFramedGridRaw = (parent, x, y, X, Y, dDots, g, colors) => {
    const wInner = Wgrid(X, dDots, g);
    const hInner = Hgrid(Y, dDots, g);
    const wOuter = wInner + 2 * g;
    const hOuter = hInner + 2 * g;

    parent.appendChild(el("rect", { x, y, width: wOuter, height: hOuter, rx: 0, fill: colors.big }));
    parent.appendChild(el("rect", { x: x + g, y: y + g, width: wInner, height: hInner, rx: 0, fill: colors.cell }));
    drawDotsRaw(parent, x + g, y + g, X, Y, dDots, g, colors.dotOff);

    return { wOuter, hOuter };
  };

  drawFramedGridRaw(bottom, xLeft,  yBottom, Xb, Yb, dBottom, g, { ...COLORS });
  drawFramedGridRaw(bottom, xRight, yBottom, Xb, Yb, dBottom, g, { ...COLORS });

  // ===== DEMO / API =====
  // Na start ustawiam przykładowe znaki na 3 potrójnych.
  setTripleText(topTriple,   "ABC", LIT.top);
  setTripleText(leftTriple,  "1-?", LIT.left);
  setTripleText(rightTriple, "ŻÓŁ", LIT.right);

  // Eksport do konsoli (żebyś mógł testować ręcznie):
  // window.scene.setTop("HEL") itd.
  window.scene = {
    setTop:   (txt) => setTripleText(topTriple,   txt, LIT.top),
    setLeft:  (txt) => setTripleText(leftTriple,  txt, LIT.left),
    setRight: (txt) => setTripleText(rightTriple, txt, LIT.right),
  };
})();
