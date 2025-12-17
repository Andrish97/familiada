(() => {
  // ============================================================
  // 0) Bezpieczeństwo: JS nie rusza tła. Tło jest w style.css.
  // ============================================================

  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const VIEW = { W: 1600, H: 900, CX: 800, CY: 450 };

  // Wygląd scenografii (jak było)
  const COLORS = {
    big: "#2e2e32",
    cell: "#000000",
    dotOff: "#2e2e32",
  };

  // Kolory “zapalone”
  const LIT = {
    main: "#d7ff3d", // główny żółty lekko zielonkawy (na przyszłość)
    top: "#34ff6a",  // górny zielony
    left: "#ff2e3b", // lewy czerwony
    right: "#2bff65" // prawy zielony
  };

  // Geometria (jak było)
  const d = 4;
  const g = 1;
  const gapCells = d; // odstęp między kaflami = średnica
  const DOTS = { X: 5, Y: 7 };

  const Wgrid = (X, dDots, gap) => X * dDots + (X + 1) * gap;
  const Hgrid = (Y, dDots, gap) => Y * dDots + (Y + 1) * gap;

  // ============================================================
  // 1) Font loader + resolver
  // ============================================================

  const loadFont = async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Nie można wczytać fontu: ${url}`);
    return res.json();
  };

  const buildGlyphMap = (FONT) => {
    const map = new Map();
    for (const group of ["letters", "digits", "punctuation", "math", "special"]) {
      for (const [k, v] of Object.entries(FONT[group] || {})) map.set(k, v);
    }
    return map;
  };

  const resolveGlyph = (GLYPHS, ch) => {
    const v = GLYPHS.get(ch);
    if (!v) return GLYPHS.get(" ") || [0, 0, 0, 0, 0, 0, 0];
    if (typeof v === "string" && v.startsWith("@")) {
      return resolveGlyph(GLYPHS, v.slice(1));
    }
    return v;
  };

  const isDigit = (ch) => ch >= "0" && ch <= "9";

  // ============================================================
  // 2) Narzędzia do animacji (async)
  // ============================================================

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Plan kolejności pikseli w obrębie tile 5x7:
  // direction: "left" | "right" | "top" | "bottom"
  const orderPixelsEdge = (w, h, direction) => {
    const coords = [];
    if (direction === "left") {
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) coords.push([x, y]);
    } else if (direction === "right") {
      for (let x = w - 1; x >= 0; x--) for (let y = 0; y < h; y++) coords.push([x, y]);
    } else if (direction === "top") {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) coords.push([x, y]);
    } else { // bottom
      for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) coords.push([x, y]);
    }
    return coords;
  };

  // Matrix scan po całej macierzy (kolejność wiersze/kolumny)
  // dir: "tb" | "bt" | "lr" | "rl"
  const orderMatrix = (w, h, dir) => {
    const coords = [];
    if (dir === "tb") {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) coords.push([x, y]);
    } else if (dir === "bt") {
      for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) coords.push([x, y]);
    } else if (dir === "lr") {
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) coords.push([x, y]);
    } else { // rl
      for (let x = w - 1; x >= 0; x--) for (let y = 0; y < h; y++) coords.push([x, y]);
    }
    return coords;
  };

  // ============================================================
  // 3) Prymitywy wyświetlaczy
  // ============================================================

  // 3.1) Pojedynczy tile 5x7 (z ramką jak u Ciebie) + referencje do kółek
  const drawTile5x7 = (parent, x, y, dDots, gap, colors) => {
    const X = 5, Y = 7;
    const wInner = Wgrid(X, dDots, gap);
    const hInner = Hgrid(Y, dDots, gap);
    const wOuter = wInner + 2 * gap;
    const hOuter = hInner + 2 * gap;

    parent.appendChild(el("rect", { x, y, width: wOuter, height: hOuter, rx: 0, fill: colors.big }));
    parent.appendChild(el("rect", { x: x + gap, y: y + gap, width: wInner, height: hInner, rx: 0, fill: colors.cell }));

    const dots = Array.from({ length: Y }, () => Array.from({ length: X }, () => null));
    const r = dDots / 2;
    const step = dDots + gap;

    for (let j = 0; j < Y; j++) {
      for (let i = 0; i < X; i++) {
        const c = el("circle", {
          cx: x + gap + gap + r + i * step,
          cy: y + gap + gap + r + j * step,
          r,
          fill: colors.dotOff
        });
        parent.appendChild(c);
        dots[j][i] = c;
      }
    }

    return { x, y, wOuter, hOuter, dots };
  };

  // 3.2) Grid tiles (np. duży wyświetlacz 30x10 tiles)
  const drawTiled5x7 = (parent, x, y, tilesX, tilesY, dDots, gap, tileGap, colors) => {
    const wTileOuter = (Wgrid(5, dDots, gap) + 2 * gap);
    const hTileOuter = (Hgrid(7, dDots, gap) + 2 * gap);

    const W = tilesX * wTileOuter + (tilesX - 1) * tileGap + 2 * gap;
    const H = tilesY * hTileOuter + (tilesY - 1) * tileGap + 2 * gap;

    // Duża płyta (tło wyświetlacza)
    parent.appendChild(el("rect", { x, y, width: W, height: H, rx: 0, fill: colors.big }));

    const tiles = Array.from({ length: tilesY }, () => Array.from({ length: tilesX }, () => null));

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const gx = x + gap + tx * (wTileOuter + tileGap);
        const gy = y + gap + ty * (hTileOuter + tileGap);
        const group = el("g", {});
        parent.appendChild(group);
        tiles[ty][tx] = drawTile5x7(group, gx, gy, dDots, gap, colors);
      }
    }

    return { x, y, W, H, tiles, tilesX, tilesY };
  };

  // 3.3) Ciągły wyświetlacz kropkowy (np. dolne 95x7)
  const drawDotPanel = (parent, x, y, X, Y, dDots, gap, colors) => {
    const wInner = Wgrid(X, dDots, gap);
    const hInner = Hgrid(Y, dDots, gap);
    const wOuter = wInner + 2 * gap;
    const hOuter = hInner + 2 * gap;

    parent.appendChild(el("rect", { x, y, width: wOuter, height: hOuter, rx: 0, fill: colors.big }));
    parent.appendChild(el("rect", { x: x + gap, y: y + gap, width: wInner, height: hInner, rx: 0, fill: colors.cell }));

    const dots = Array.from({ length: Y }, () => Array.from({ length: X }, () => null));
    const r = dDots / 2;
    const step = dDots + gap;

    for (let j = 0; j < Y; j++) {
      for (let i = 0; i < X; i++) {
        const c = el("circle", {
          cx: x + gap + gap + r + i * step,
          cy: y + gap + gap + r + j * step,
          r,
          fill: colors.dotOff
        });
        parent.appendChild(c);
        dots[j][i] = c;
      }
    }

    return { x, y, wOuter, hOuter, dots, X, Y };
  };

  // ============================================================
  // 4) Renderowanie znaków
  // ============================================================

  const renderGlyphToTile = (tile, glyphRows, onColor, offColor) => {
    const W = 5, H = 7;
    for (let row = 0; row < H; row++) {
      const bits = (glyphRows[row] | 0);
      for (let col = 0; col < W; col++) {
        const mask = 1 << (W - 1 - col);
        const on = (bits & mask) !== 0;
        tile.dots[row][col].setAttribute("fill", on ? onColor : offColor);
      }
    }
  };

  const renderCharToTile = (GLYPHS, tile, ch, onColor, offColor) => {
    const glyph = resolveGlyph(GLYPHS, ch);
    renderGlyphToTile(tile, glyph, onColor, offColor);
  };

  // Tekst na potrójny (3 tiles) — DIGITS ONLY (reszta = spacja)
  const setTripleDigits = (GLYPHS, tripleTiles, text, onColor) => {
    const s = (text ?? "").toString();
    for (let i = 0; i < 3; i++) {
      const raw = s[i] ?? " ";
      const ch = isDigit(raw) ? raw : " ";
      renderCharToTile(GLYPHS, tripleTiles[i], ch, onColor, COLORS.dotOff);
    }
  };

  // Tekst na dot-panel 95x7: znaki 5x7 + 1 kol przerwy, wycentrowane
  const setLongTextCentered = (GLYPHS, panel, text, onColor) => {
    const s = (text ?? "").toString().toUpperCase();

    // Wyczyść
    for (let y = 0; y < panel.Y; y++) for (let x = 0; x < panel.X; x++) {
      panel.dots[y][x].setAttribute("fill", COLORS.dotOff);
    }

    // Buduj bitmapę (7 wierszy, szerokość dynamiczna)
    const glyphs = Array.from(s).map(ch => resolveGlyph(GLYPHS, ch));
    const charW = 5;
    const gapCol = 1;
    const totalW = glyphs.length === 0 ? 0 : (glyphs.length * charW + (glyphs.length - 1) * gapCol);

    const startX = Math.max(0, Math.floor((panel.X - totalW) / 2));
    const startY = 0; // 7 wysokie, więc zawsze od 0

    let xCursor = startX;
    for (const glyph of glyphs) {
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row] | 0;
        for (let col = 0; col < 5; col++) {
          const mask = 1 << (4 - col);
          const on = (bits & mask) !== 0;
          const px = xCursor + col;
          const py = startY + row;
          if (px >= 0 && px < panel.X && py >= 0 && py < panel.Y) {
            panel.dots[py][px].setAttribute("fill", on ? onColor : COLORS.dotOff);
          }
        }
      }
      xCursor += charW + gapCol;
    }
  };

  // ============================================================
  // 5) Animacje dla dużego wyświetlacza (tile-range)
  // ============================================================

  // Tile-range: indeks liniowy 0..(tilesX*tilesY-1), wierszami
  const tileIndexToXY = (tilesX, idx) => ({ x: idx % tilesX, y: Math.floor(idx / tilesX) });

  const iterTilesRange = (grid, range) => {
    const total = grid.tilesX * grid.tilesY;
    let from = 0, to = total - 1;
    if (range && typeof range === "object") {
      if (Number.isFinite(range.from)) from = Math.max(0, Math.min(total - 1, range.from | 0));
      if (Number.isFinite(range.to))   to   = Math.max(0, Math.min(total - 1, range.to   | 0));
      if (from > to) [from, to] = [to, from];
    }
    const out = [];
    for (let idx = from; idx <= to; idx++) {
      const { x, y } = tileIndexToXY(grid.tilesX, idx);
      out.push(grid.tiles[y][x]);
    }
    return out;
  };

  // Pojawianie się “popikselowo od strony” w obrębie każdego tile,
  // ale sterowane na grupie tiles (range).
  const animateTilesEdge = async (GLYPHS, tiles, targetChars, onColor, mode) => {
    // mode: { kind: "in"|"out", direction: "left|right|top|bottom", stepDelayMs }
    const dir = mode.direction;
    const order = orderPixelsEdge(5, 7, dir);
    const delay = Math.max(0, mode.stepDelayMs | 0);

    // Przygotuj docelowe bitmapy dla każdego tile
    const glyphRows = tiles.map((_, i) => resolveGlyph(GLYPHS, targetChars[i] ?? " "));

    if (mode.kind === "in") {
      // start: OFF
      for (let t = 0; t < tiles.length; t++) {
        renderGlyphToTile(tiles[t], [0,0,0,0,0,0,0], onColor, COLORS.dotOff);
      }
      // odsłanianie pikseli zgodnie z docelowym glifem
      for (const [x, y] of order) {
        for (let t = 0; t < tiles.length; t++) {
          const bits = glyphRows[t][y] | 0;
          const mask = 1 << (4 - x);
          const on = (bits & mask) !== 0;
          tiles[t].dots[y][x].setAttribute("fill", on ? onColor : COLORS.dotOff);
        }
        if (delay) await sleep(delay);
      }
    } else {
      // OUT: start z docelowym glifem, potem gaś
      for (let t = 0; t < tiles.length; t++) {
        renderGlyphToTile(tiles[t], glyphRows[t], onColor, COLORS.dotOff);
      }
      for (const [x, y] of order) {
        for (let t = 0; t < tiles.length; t++) {
          tiles[t].dots[y][x].setAttribute("fill", COLORS.dotOff);
        }
        if (delay) await sleep(delay);
      }
    }
  };

  // Matrix scan na poziomie całych tiles: w kolejności (np. góra→dół),
  // a wewnątrz tile: normalny render w jednym kroku (szybkie “przeskoki”).
  const animateTilesMatrix = async (GLYPHS, grid, range, text, onColor, mode) => {
    // mode: { kind:"in"|"out", dir:"tb"|"bt"|"lr"|"rl", tileDelayMs }
    const tiles = iterTilesRange(grid, range);
    const delay = Math.max(0, mode.tileDelayMs | 0);

    // mapujemy tekst na tiles w kolejności liniowej range
    const chars = Array.from(text ?? "").map(c => (c ?? " ").toString().toUpperCase());
    while (chars.length < tiles.length) chars.push(" ");
    const glyphRows = tiles.map((_, i) => resolveGlyph(GLYPHS, chars[i] ?? " "));

    // kolejność “matrix” po indeksach tiles w ramach range
    // Uwaga: range może wycinać kawałek; robimy prostą kolejność po liście tiles
    // wg dir jako “symulacja” (to jest praktyczne i działa sensownie).
    const N = tiles.length;
    let orderIdx = [...Array(N).keys()];
    if (mode.dir === "bt" || mode.dir === "rl") orderIdx.reverse();

    if (mode.kind === "in") {
      // start off
      for (let i = 0; i < N; i++) renderGlyphToTile(tiles[i], [0,0,0,0,0,0,0], onColor, COLORS.dotOff);
      // zapal tile po tile
      for (const i of orderIdx) {
        renderGlyphToTile(tiles[i], glyphRows[i], onColor, COLORS.dotOff);
        if (delay) await sleep(delay);
      }
    } else {
      // start on
      for (let i = 0; i < N; i++) renderGlyphToTile(tiles[i], glyphRows[i], onColor, COLORS.dotOff);
      // gaś tile po tile
      for (const i of orderIdx) {
        renderGlyphToTile(tiles[i], [0,0,0,0,0,0,0], onColor, COLORS.dotOff);
        if (delay) await sleep(delay);
      }
    }
  };

  // ============================================================
  // 6) Backend komendy (tekst → akcje)
  // ============================================================

  // Format (prosty, czytelny):
  //  TOP 123
  //  LEFT 045
  //  RIGHT 999
  //  LONG1 "HELLO, ŚWIAT!"
  //  LONG2 "TEST 123"
  //
  //  BIG SET from=0 to=299 text="..." color=main
  //  BIG EDGEIN from=0 to=299 dir=left step=8 text="..."
  //  BIG EDGEOUT from=0 to=299 dir=bottom step=8
  //  BIG MATRIXIN from=0 to=299 dir=tb delay=25 text="..."
  //  BIG MATRIXOUT from=0 to=299 dir=lr delay=20 text="..."
  //
  // Backend może wysyłać jedną linię na komendę.

  const parseKV = (parts) => {
    const kv = {};
    for (const p of parts) {
      const i = p.indexOf("=");
      if (i > 0) {
        const k = p.slice(0, i).trim();
        let v = p.slice(i + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        kv[k] = v;
      }
    }
    return kv;
  };

  // ============================================================
  // 7) Bootstrap: rysowanie sceny + API
  // ============================================================

  const bootstrap = async () => {
    const FONT = await loadFont("./font_5x7.json");
    const GLYPHS = buildGlyphMap(FONT);

    const center = $("center");
    const panels = $("panels");
    const basebar = $("basebar");
    const bottom = $("bottom");

    // ====== ŚRODEK (DUŻY WYŚWIETLACZ) — sterowalny tiles 30x10 ======
    const wSmall = Wgrid(DOTS.X, d, g);
    const hSmall = Hgrid(DOTS.Y, d, g);
    const centerW = 30 * wSmall + 29 * gapCells + 2 * g;
    const centerH = 10 * hSmall + 9 * gapCells + 2 * g;
    const centerX = VIEW.CX - centerW / 2;
    const centerY = VIEW.CY - centerH / 2;

    const big = drawTiled5x7(center, centerX, centerY, 30, 10, d, g, gapCells, COLORS);

    // ====== PANELE POTRÓJNE (3 tiles 5x7, skala dP=3*d) ======
    const dP = 3 * d;

    const wTileOuterP = (Wgrid(5, dP, g) + 2 * g);
    const panelW_old = 3 * wTileOuterP + 2 * gapCells + 2 * g;
    const shift = panelW_old / 4;

    const sideY = 390;
    const leftX = 10 + shift;
    const rightX = VIEW.W - panelW_old - 10 - shift;

    const topY = 65;
    const topX = VIEW.CX - panelW_old / 2;

    const drawTriple = (parent, x, y) => {
      const tiles = [];
      for (let i = 0; i < 3; i++) {
        const gx = x + g + i * (wTileOuterP + gapCells);
        const gg = el("g", {});
        parent.appendChild(gg);
        tiles.push(drawTile5x7(gg, gx, y + g, dP, g, COLORS));
      }
      // tło panelu (jak w drawTiled) — zachowujemy wygląd
      parent.insertBefore(el("rect", {
        x, y, width: panelW_old, height: (Hgrid(7, dP, g) + 2 * g) + 2 * g,
        rx: 0, fill: COLORS.big
      }), parent.firstChild);
      return tiles;
    };

    const leftTripleTiles = drawTriple(panels, leftX, sideY);
    const rightTripleTiles = drawTriple(panels, rightX, sideY);
    const topTripleTiles = drawTriple(panels, topX, topY);

    // ====== DÓŁ + PASEK (jak było) ======
    const dBottom = 1.5 * d;
    const Xb = 95, Yb = 7;

    const gapFromOval = 22;
    const gapBetween = 40;

    const ovalBottomY = 110 + 680;
    const yBottom = ovalBottomY + gapFromOval;

    const wInnerB = Wgrid(Xb, dBottom, g);
    const hInnerB = Hgrid(Yb, dBottom, g);
    const wBlock = wInnerB + 2 * g;
    const hBlock = hInnerB + 2 * g;

    const insetFactor = 0.20;
    const insetWanted = wBlock * insetFactor;
    const minGap = 10;
    const gapEff = Math.max(minGap, gapBetween - 2 * insetWanted);

    const totalW = 2 * wBlock + gapEff;
    const xLeft = VIEW.CX - totalW / 2;
    const xRight = xLeft + wBlock + gapEff;

    // pasek (dokładnie jak w Twoim oryginale)
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

    // Dolne panele jako sterowalne DOT PANEL 95x7
    const longLeft = drawDotPanel(bottom, xLeft, yBottom, Xb, Yb, dBottom, g, COLORS);
    const longRight = drawDotPanel(bottom, xRight, yBottom, Xb, Yb, dBottom, g, COLORS);

    // ============================================================
    // API: wyświetlacze
    // ============================================================

    const api = {
      // potrójne (digits only)
      setTop:   (txt) => setTripleDigits(GLYPHS, topTripleTiles, txt, LIT.top),
      setLeft:  (txt) => setTripleDigits(GLYPHS, leftTripleTiles, txt, LIT.left),
      setRight: (txt) => setTripleDigits(GLYPHS, rightTripleTiles, txt, LIT.right),

      // dolne podłużne (tekst + 1 kol przerwy, centrowane)
      setLong1: (txt, color = LIT.main) => setLongTextCentered(GLYPHS, longLeft, txt, color),
      setLong2: (txt, color = LIT.main) => setLongTextCentered(GLYPHS, longRight, txt, color),

      // big: bez animacji (ustaw “surowo” tiles range tekstem)
      bigSet: (range, text, color = LIT.main) => {
        const tiles = iterTilesRange(big, range);
        const chars = Array.from((text ?? "").toString().toUpperCase());
        while (chars.length < tiles.length) chars.push(" ");
        for (let i = 0; i < tiles.length; i++) {
          renderCharToTile(GLYPHS, tiles[i], chars[i] ?? " ", color, COLORS.dotOff);
        }
      },

      // big: animacje
      bigEdgeIn: async (range, direction, text, stepDelayMs = 8, color = LIT.main) => {
        const tiles = iterTilesRange(big, range);
        const chars = Array.from((text ?? "").toString().toUpperCase());
        while (chars.length < tiles.length) chars.push(" ");
        await animateTilesEdge(GLYPHS, tiles, chars, color, { kind: "in", direction, stepDelayMs });
      },
      bigEdgeOut: async (range, direction, stepDelayMs = 8) => {
        const tiles = iterTilesRange(big, range);
        const blanks = Array.from({ length: tiles.length }, () => " ");
        await animateTilesEdge(GLYPHS, tiles, blanks, LIT.main, { kind: "out", direction, stepDelayMs });
      },
      bigMatrixIn: async (range, dir, text, tileDelayMs = 25, color = LIT.main) => {
        await animateTilesMatrix(GLYPHS, big, range, text, color, { kind: "in", dir, tileDelayMs });
      },
      bigMatrixOut: async (range, dir, text, tileDelayMs = 25, color = LIT.main) => {
        await animateTilesMatrix(GLYPHS, big, range, text, color, { kind: "out", dir, tileDelayMs });
      },
    };

    // ============================================================
    // Komendy z backendu (tekst)
    // ============================================================

    const handleCommand = async (line) => {
      const raw = (line ?? "").toString().trim();
      if (!raw) return;

      // Proste wsparcie dla tekstów w cudzysłowach: TEXT="...."
      const parts = raw.split(/\s+/);
      const head = (parts[0] || "").toUpperCase();

      if (head === "TOP")   return api.setTop(parts.slice(1).join(""));
      if (head === "LEFT")  return api.setLeft(parts.slice(1).join(""));
      if (head === "RIGHT") return api.setRight(parts.slice(1).join(""));

      if (head === "LONG1") {
        const rest = raw.slice(5).trim();
        const txt = rest.startsWith('"') && rest.endsWith('"') ? rest.slice(1, -1) : rest;
        return api.setLong1(txt, LIT.main);
      }
      if (head === "LONG2") {
        const rest = raw.slice(5).trim();
        const txt = rest.startsWith('"') && rest.endsWith('"') ? rest.slice(1, -1) : rest;
        return api.setLong2(txt, LIT.main);
      }

      if (head === "BIG") {
        const op = (parts[1] || "").toUpperCase();
        const kv = parseKV(parts.slice(2));

        const range = {
          from: kv.from != null ? parseInt(kv.from, 10) : undefined,
          to:   kv.to   != null ? parseInt(kv.to, 10)   : undefined
        };

        const colorName = (kv.color || "main").toLowerCase();
        const color =
          colorName === "top" ? LIT.top :
          colorName === "left" ? LIT.left :
          colorName === "right" ? LIT.right :
          LIT.main;

        const text = kv.text ?? "";

        if (op === "SET") {
          api.bigSet(range, text, color);
          return;
        }

        if (op === "EDGEIN") {
          const dir = (kv.dir || "left").toLowerCase();
          const step = kv.step != null ? parseInt(kv.step, 10) : 8;
          await api.bigEdgeIn(range, dir, text, step, color);
          return;
        }

        if (op === "EDGEOUT") {
          const dir = (kv.dir || "left").toLowerCase();
          const step = kv.step != null ? parseInt(kv.step, 10) : 8;
          await api.bigEdgeOut(range, dir, step);
          return;
        }

        if (op === "MATRIXIN") {
          const dir = (kv.dir || "tb").toLowerCase();
          const delay = kv.delay != null ? parseInt(kv.delay, 10) : 25;
          await api.bigMatrixIn(range, dir, text, delay, color);
          return;
        }

        if (op === "MATRIXOUT") {
          const dir = (kv.dir || "tb").toLowerCase();
          const delay = kv.delay != null ? parseInt(kv.delay, 10) : 25;
          await api.bigMatrixOut(range, dir, text, delay, color);
          return;
        }
      }

      console.warn("Nieznana komenda:", raw);
    };

    // ============================================================
    // Demo start (żeby od razu było widać, że działa)
    // ============================================================

    api.setTop("123");
    api.setLeft("045");
    api.setRight("999");

    api.setLong1("FAMILIADA");
    api.setLong2("TEST 123");

    // Duży: animacja pokazowa na pierwszych 12 tile
    await api.bigEdgeIn({ from: 0, to: 11 }, "left", "0123456789AB", 6, LIT.main);

    // Eksporty do testów ręcznych
    window.scene = { api, handleCommand };
    console.log("scene.api gotowe. Możesz wołać np.:");
    console.log(`scene.handleCommand('TOP 777')`);
    console.log(`scene.handleCommand('LONG1 "ŻÓŁW, 123"')`);
    console.log(`scene.handleCommand('BIG EDGEIN from=0 to=29 dir=top step=6 text="012345678901234567890123456789"')`);
  };

  // Bootstrap po załadowaniu DOM
  window.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((e) => {
      console.error(e);
      // nawet jak font nie wstanie, nie psujemy strony
    });
  });

})();
