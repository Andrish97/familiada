(() => {
  const NS = "http://www.w3.org/2000/svg";
  const $  = (id) => document.getElementById(id);
  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const VIEW = { W: 1600, H: 900, CX: 800, CY: 450 };

  // Wygląd (nie zmieniamy)
  const COLORS = {
    big:   "#2e2e32",
    cell:  "#000000",
    dotOff:"#2e2e32"
  };

  // Kolory świecenia
  const LIT = {
    main:  "#d7ff3d", // główny żółty lekko zielonkawy
    top:   "#34ff6a", // górny zielony
    left:  "#ff2e3b", // lewy czerwony
    right: "#2bff65"  // prawy zielony
  };

  // Geometria (jak w oryginale)
  const d = 4;
  const g = 1;
  const gapCells = d;  // odstęp między kaflami = średnica
  const DOTS = { X: 5, Y: 7 };

  const Wgrid = (X, dDots, gap) => X * dDots + (X + 1) * gap;
  const Hgrid = (Y, dDots, gap) => Y * dDots + (Y + 1) * gap;

  // ---------- Fullscreen button ----------
  const initFullscreenButton = () => {
    const fsBtn = document.getElementById("fsBtn");
    if (!fsBtn) return;

    const ICON_ENTER = "⛶";
    const ICON_EXIT  = "⧉";

    const sync = () => {
      const on = !!document.fullscreenElement;
      fsBtn.textContent = on ? ICON_EXIT : ICON_ENTER;
      fsBtn.classList.toggle("on", on);
      fsBtn.title = on ? "Wyjście z pełnego ekranu" : "Pełny ekran";
    };

    fsBtn.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch (e) {
        console.warn("Fullscreen error:", e);
      }
      sync();
    });

    document.addEventListener("fullscreenchange", sync);
    sync();
  };

  // ---------- Font loaders ----------
  const loadJson = async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Nie można wczytać: ${url}`);
    return res.json();
  };

  const buildGlyphMap = (FONT) => {
    const map = new Map();
    for (const group of ["letters","digits","punctuation","math","special"]) {
      for (const [k, v] of Object.entries(FONT[group] || {})) map.set(k, v);
    }
    return map;
  };

  const resolveGlyph = (GLYPHS, ch) => {
    const v = GLYPHS.get(ch);
    if (!v) return GLYPHS.get(" ") || [0,0,0,0,0,0,0];
    if (typeof v === "string" && v.startsWith("@")) return resolveGlyph(GLYPHS, v.slice(1));
    return v;
  };

  const isDigit = (ch) => ch >= "0" && ch <= "9";

  // ---------- Drawing primitives (1:1 z Twoim oryginałem) ----------
  // Rysuje kropki i zwraca referencje [7][5]
  const drawDotsStored = (parent, x, y, X, Y, dDots, gap, color) => {
    const dots = Array.from({ length: Y }, () => Array.from({ length: X }, () => null));
    const r = dDots / 2;
    const step = dDots + gap;

    for (let j = 0; j < Y; j++) {
      for (let i = 0; i < X; i++) {
        const c = el("circle", {
          cx: x + gap + r + i * step,
          cy: y + gap + r + j * step,
          r,
          fill: color
        });
        parent.appendChild(c);
        dots[j][i] = c;
      }
    }
    return dots;
  };

  // Oryginalny kafel: rect(cell) + kropki; bez osobnej ramki
  const drawCell5x7 = (parent, x, y, dDots, gap, colors) => {
    const wSmall = Wgrid(5, dDots, gap);
    const hSmall = Hgrid(7, dDots, gap);

    parent.appendChild(el("rect", { x, y, width: wSmall, height: hSmall, rx: 0, fill: colors.cell }));
    const dots = drawDotsStored(parent, x, y, 5, 7, dDots, gap, colors.dotOff);
    return { x, y, wSmall, hSmall, dots };
  };

  // Oryginalny tiled display: duży rect + komórki
  const drawTiledDisplay5x7 = (parent, x, y, tilesX, tilesY, dDots, gap, tileGap, colors) => {
    const wSmall = Wgrid(5, dDots, gap);
    const hSmall = Hgrid(7, dDots, gap);

    const W = tilesX * wSmall + (tilesX - 1) * tileGap + 2 * gap;
    const H = tilesY * hSmall + (tilesY - 1) * tileGap + 2 * gap;

    parent.appendChild(el("rect", { x, y, width: W, height: H, rx: 0, fill: colors.big }));

    const tiles = Array.from({ length: tilesY }, () => Array.from({ length: tilesX }, () => null));

    for (let ty = 0; ty < tilesY; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const cx = x + gap + tx * (wSmall + tileGap);
        const cy = y + gap + ty * (hSmall + tileGap);
        tiles[ty][tx] = drawCell5x7(parent, cx, cy, dDots, gap, colors);
      }
    }

    return { x, y, W, H, tiles, tilesX, tilesY, wSmall, hSmall, tileGap, gap };
  };

  // Framed grid (dolne bloki) – jak w oryginale, ale z referencjami
  const drawFramedDotPanel = (parent, x, y, X, Y, dDots, gap, colors) => {
    const wInner = Wgrid(X, dDots, gap);
    const hInner = Hgrid(Y, dDots, gap);
    const wOuter = wInner + 2 * gap;
    const hOuter = hInner + 2 * gap;

    parent.appendChild(el("rect", { x, y, width: wOuter, height: hOuter, rx: 0, fill: colors.big }));
    parent.appendChild(el("rect", { x: x + gap, y: y + gap, width: wInner, height: hInner, rx: 0, fill: colors.cell }));

    const dots = drawDotsStored(parent, x + gap, y + gap, X, Y, dDots, gap, colors.dotOff);
    return { x, y, X, Y, dots, wOuter, hOuter };
  };

  // ---------- Glyph render into tile (5x7 dots) ----------
  const renderCharToTile = (GLYPHS, tile, ch, onColor, offColor) => {
    const glyph = resolveGlyph(GLYPHS, ch);
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row] | 0;
      for (let col = 0; col < 5; col++) {
        const mask = 1 << (4 - col);
        const on = (bits & mask) !== 0;
        tile.dots[row][col].setAttribute("fill", on ? onColor : offColor);
      }
    }
  };

  const clearTile = (tile) => {
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      tile.dots[row][col].setAttribute("fill", COLORS.dotOff);
    }
  };

  // ---------- Small displays rules ----------
  const setTripleDigits = (GLYPHS, tripleTiles, text, onColor) => {
    const s = (text ?? "").toString();
    for (let i = 0; i < 3; i++) {
      const raw = s[i] ?? " ";
      const ch = isDigit(raw) ? raw : " ";
      renderCharToTile(GLYPHS, tripleTiles[i], ch, onColor, COLORS.dotOff);
    }
  };

  // Podłużne: max 15 znaków, przerwa 1 kolumna, centrowane
  const setLongTextCenteredMax15 = (GLYPHS, panel, text, onColor) => {
    let s = (text ?? "").toString().toUpperCase();
    if (s.length > 15) s = s.slice(0, 15);

    // clear
    for (let y = 0; y < panel.Y; y++) for (let x = 0; x < panel.X; x++) {
      panel.dots[y][x].setAttribute("fill", COLORS.dotOff);
    }

    const glyphs = Array.from(s).map(ch => resolveGlyph(GLYPHS, ch));
    const charW = 5;
    const gapCol = 1;
    const totalW = glyphs.length === 0 ? 0 : (glyphs.length * charW + (glyphs.length - 1) * gapCol);
    const startX = Math.max(0, Math.floor((panel.X - totalW) / 2));

    let xCursor = startX;
    for (const glyph of glyphs) {
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row] | 0;
        for (let col = 0; col < 5; col++) {
          const mask = 1 << (4 - col);
          const on = (bits & mask) !== 0;
          const px = xCursor + col;
          if (px >= 0 && px < panel.X) panel.dots[row][px].setAttribute("fill", on ? onColor : COLORS.dotOff);
        }
      }
      xCursor += charW + gapCol;
    }
  };

  // ---------- Big addressing helpers ----------
  const tileAt = (big, col1, row1) => {
    const x = (col1 | 0) - 1;
    const y = (row1 | 0) - 1;
    if (x < 0 || y < 0 || x >= big.tilesX || y >= big.tilesY) return null;
    return big.tiles[y][x];
  };

  const putCharAt = (GLYPHS, big, col1, row1, ch, color = LIT.main) => {
    const t = tileAt(big, col1, row1);
    if (!t) return;
    renderCharToTile(GLYPHS, t, ch, color, COLORS.dotOff);
  };

  const clearTileAt = (big, col1, row1) => {
    const t = tileAt(big, col1, row1);
    if (!t) return;
    clearTile(t);
  };

  const clearBig = (big) => {
    for (let r = 1; r <= big.tilesY; r++) for (let c = 1; c <= big.tilesX; c++) clearTileAt(big, c, r);
  };

  // ---------- X 3x3 (środek ⧗) ----------
  // ⇖⎵⇗
  //  ⧗
  // ⇙⎴⇘
  const drawBigX_3x3 = (GLYPHS, big, col1, row1, color = LIT.main) => {
    putCharAt(GLYPHS, big, col1 + 0, row1 + 0, "⇖", color);
    putCharAt(GLYPHS, big, col1 + 1, row1 + 0, "⎵", color);
    putCharAt(GLYPHS, big, col1 + 2, row1 + 0, "⇗", color);

    putCharAt(GLYPHS, big, col1 + 1, row1 + 1, "⧗", color);

    putCharAt(GLYPHS, big, col1 + 0, row1 + 2, "⇙", color);
    putCharAt(GLYPHS, big, col1 + 1, row1 + 2, "⎴", color);
    putCharAt(GLYPHS, big, col1 + 2, row1 + 2, "⇘", color);
  };

  // ============================================================
  // WIN font (JSON) + tight centering in horizontal, vertical fixed 2..8
  // ============================================================

  const measureWinDigit = (pat) => {
    const H = 7;
    const rows = Array.from({ length: H }, (_, i) => (pat[i] ?? ""));
    const W = Math.max(...rows.map(r => r.length), 0);

    let left = W, right = -1;
    for (let x = 0; x < W; x++) {
      let any = false;
      for (let y = 0; y < H; y++) {
        const ch = rows[y][x] ?? " ";
        if (ch !== " ") { any = true; break; }
      }
      if (any) { if (x < left) left = x; if (x > right) right = x; }
    }
    if (right < left) return { left: 0, w: 0 };
    return { left, w: right - left + 1 };
  };

  // Rysuje jedną cyfrę WIN w kolumnach starting col1, wysokość zawsze 7 (rowTop1..rowTop1+6)
  const drawWinDigitTight = (GLYPHS, big, WIN_DIGITS, col1, rowTop1, digit, color = LIT.main) => {
    const pat = WIN_DIGITS[digit];
    if (!pat) return 0;

    const H = 7;
    const rows = Array.from({ length: H }, (_, i) => (pat[i] ?? ""));
    const { left, w } = measureWinDigit(pat);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const srcX = left + x;
        const ch = rows[y][srcX] ?? " ";
        const col = col1 + x;
        const row = rowTop1 + y;

        if (ch === " ") clearTileAt(big, col, row);
        else putCharAt(GLYPHS, big, col, row, ch, color);
      }
    }
    return w;
  };

  // Pole WIN: kolumny 1..30, rzędy 2..8
  const drawWinNumber5 = (GLYPHS, big, WIN_DIGITS, number, color = LIT.main) => {
    let s = (number ?? "").toString().replace(/\D/g, "");
    if (s.length > 5) s = s.slice(-5);
    s = s.padStart(5, "0");

    const fieldW = 30;
    const fieldH = 7;
    const rowTop1 = 2;
    const gap = 1;

    // czyść całe pole WIN
    for (let y = 0; y < fieldH; y++) {
      for (let x = 0; x < fieldW; x++) {
        clearTileAt(big, 1 + x, rowTop1 + y);
      }
    }

    // policz tight widths
    const widths = s.split("").map(d => {
      const pat = WIN_DIGITS[d];
      return pat ? measureWinDigit(pat).w : 0;
    });

    const totalW = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
    const startCol1 = 1 + Math.max(0, Math.floor((fieldW - totalW) / 2));

    let cx = startCol1;
    for (let i = 0; i < 5; i++) {
      const w = drawWinDigitTight(GLYPHS, big, WIN_DIGITS, cx, rowTop1, s[i], color);
      cx += w + gap;
    }
  };

  // ============================================================
  // Big modes
  // ============================================================

  const BIG_MODES = { LOGO: "LOGO", ROUNDS: "ROUNDS", FINAL: "FINAL", WIN: "WIN" };

  // Minimalny layout (szkielet) – rozbudujemy jak wejdziemy w ROUNDS/FINAL na serio
  const BigLayouts = {
    LOGO: { fixed: [] },
    ROUNDS: {
      // X-cells (3x3)
      xCells: {
        "1A": { col1: 1,  row1: 8 },
        "2A": { col1: 1,  row1: 5 },
        "3A": { col1: 1,  row1: 2 },
        "1B": { col1: 28, row1: 8 },
        "2B": { col1: 28, row1: 5 },
        "3B": { col1: 28, row1: 2 }
      }
    },
    FINAL: {},
    WIN: {}
  };

  const initBigMode = (GLYPHS, big, mode) => {
    clearBig(big);

    if (mode === BIG_MODES.LOGO) {
      for (const it of (BigLayouts.LOGO.fixed || [])) {
        putCharAt(GLYPHS, big, it.col, it.row, it.ch, LIT.main);
      }
    }

    // ROUNDS / FINAL na razie tylko czyste tło – dopiszemy pola potem
  };

  // ============================================================
  // Bootstrap: rysowanie sceny (tło + wyświetlacze)
  // ============================================================

  const bootstrap = async () => {
    // Fonts
    const FONT5x7 = await loadJson("./font_5x7.json");  // musi być poprawny JSON (bez trailing commas)
    const GLYPHS  = buildGlyphMap(FONT5x7);

    // WIN font json: { meta, digits: { "0":[...], ... } }
    const FONTWIN = await loadJson("./font_win.json");
    const WIN_DIGITS = FONTWIN?.digits || {};

    // SVG layers
    const center  = $("center");
    const panels  = $("panels");
    const basebar = $("basebar");
    const bottom  = $("bottom");

    // ===== ŚRODEK (30x10) – geometria jak w oryginale, więc nie przesunie się =====
    const wSmall = Wgrid(5, d, g);
    const hSmall = Hgrid(7, d, g);
    const centerW = 30 * wSmall + 29 * gapCells + 2 * g;
    const centerH = 10 * hSmall +  9 * gapCells + 2 * g;

    const centerX = VIEW.CX - centerW / 2;
    const centerY = VIEW.CY - centerH / 2;

    const big = drawTiledDisplay5x7(center, centerX, centerY, 30, 10, d, g, gapCells, COLORS);

    // ===== PANELE (potrójne 3x1) – też jak w oryginale =====
    const dP = 3 * d;
    const wSmallP = Wgrid(5, dP, g);
    const panelW = 3 * wSmallP + 2 * gapCells + 2 * g;

    const shift = panelW / 4;
    const sideY = 390;
    const leftX  = 10 + shift;
    const rightX = VIEW.W - panelW - 10 - shift;
    const topY = 65;
    const topX = VIEW.CX - panelW / 2;

    const leftPanel  = drawTiledDisplay5x7(panels, leftX,  sideY, 3, 1, dP, g, gapCells, COLORS);
    const rightPanel = drawTiledDisplay5x7(panels, rightX, sideY, 3, 1, dP, g, gapCells, COLORS);
    const topPanel   = drawTiledDisplay5x7(panels, topX,   topY,  3, 1, dP, g, gapCells, COLORS);

    // helper: wyciągnij 3 kafle z panelu (y=0)
    const triple = (panel) => [panel.tiles[0][0], panel.tiles[0][1], panel.tiles[0][2]];

    const leftTriple  = triple(leftPanel);
    const rightTriple = triple(rightPanel);
    const topTriple   = triple(topPanel);

    // ===== DÓŁ + PASEK (jak u Ciebie) =====
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
      Math.min(barX + barW - 18, gapCenterX + sideOffset)
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

    const long1 = drawFramedDotPanel(bottom, xLeft,  yBottom, Xb, Yb, dBottom, g, COLORS);
    const long2 = drawFramedDotPanel(bottom, xRight, yBottom, Xb, Yb, dBottom, g, COLORS);

    // ===== API =====
    let currentBigMode = BIG_MODES.LOGO;

    const api = {
      // digits-only
      topDigits:   (ddd) => setTripleDigits(GLYPHS, topTriple,   ddd, LIT.top),
      leftDigits:  (ddd) => setTripleDigits(GLYPHS, leftTriple,  ddd, LIT.left),
      rightDigits: (ddd) => setTripleDigits(GLYPHS, rightTriple, ddd, LIT.right),

      // long max 15
      long1: (txt) => setLongTextCenteredMax15(GLYPHS, long1, txt, LIT.main),
      long2: (txt) => setLongTextCenteredMax15(GLYPHS, long2, txt, LIT.main),

      // big mode
      bigMode: (mode) => {
        const m = (mode ?? "").toString().toUpperCase();
        if (!BIG_MODES[m]) throw new Error(`Nieznany tryb big: ${mode}`);
        currentBigMode = m;
        initBigMode(GLYPHS, big, currentBigMode);
      },

      // WIN
      bigWin: (num) => {
        if (currentBigMode !== BIG_MODES.WIN) api.bigMode("WIN");
        drawWinNumber5(GLYPHS, big, WIN_DIGITS, num, LIT.main);
      },

      // X (ROUNDS)
      bigSetX: (cellName, on) => {
        if (currentBigMode !== BIG_MODES.ROUNDS) api.bigMode("ROUNDS");
        const cell = BigLayouts.ROUNDS.xCells[(cellName ?? "").toUpperCase()];
        if (!cell) throw new Error(`Nieznana komórka X: ${cellName}`);
        if (on) drawBigX_3x3(GLYPHS, big, cell.col1, cell.row1, LIT.main);
        else {
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) clearTileAt(big, cell.col1 + dx, cell.row1 + dy);
        }
      },

      _clearBig: () => clearBig(big)
    };

    // ===== Backend command decoder =====
    // TOP 123
    // LEFT 045
    // RIGHT 999
    // LONG1 "FAMILIADA"
    // BIG MODE WIN
    // BIG WIN 01234
    // BIG X 2A ON
    const handleCommand = async (line) => {
      const raw = (line ?? "").toString().trim();
      if (!raw) return;

      const parts = raw.split(/\s+/);
      const head = (parts[0] || "").toUpperCase();

      if (head === "TOP")   return api.topDigits(parts.slice(1).join(""));
      if (head === "LEFT")  return api.leftDigits(parts.slice(1).join(""));
      if (head === "RIGHT") return api.rightDigits(parts.slice(1).join(""));

      if (head === "LONG1") {
        const rest = raw.slice(5).trim();
        const txt = rest.startsWith('"') && rest.endsWith('"') ? rest.slice(1, -1) : rest;
        return api.long1(txt);
      }
      if (head === "LONG2") {
        const rest = raw.slice(5).trim();
        const txt = rest.startsWith('"') && rest.endsWith('"') ? rest.slice(1, -1) : rest;
        return api.long2(txt);
      }

      if (head === "BIG") {
        const op = (parts[1] || "").toUpperCase();

        if (op === "MODE") return api.bigMode(parts[2] || "");
        if (op === "WIN")  return api.bigWin(parts[2] || "");

        if (op === "X") {
          const cellName = parts[2] || "";
          const state = (parts[3] || "").toUpperCase();
          const on = (state === "ON" || state === "1" || state === "TRUE");
          return api.bigSetX(cellName, on);
        }
      }

      console.warn("Nieznana komenda:", raw);
    };

    // ===== Demo start =====
    api.topDigits("123");
    api.leftDigits("045");
    api.rightDigits("999");
    api.long1("FAMILIADA");
    api.long2("SUMA 000");
    api.bigWin("01234");

    window.scene = { api, handleCommand, BIG_MODES };
    console.log("scene.api gotowe.");
    console.log(`Przykład: scene.handleCommand('BIG WIN 98765')`);
  };

  window.addEventListener("DOMContentLoaded", () => {
    initFullscreenButton();
    bootstrap().catch((e) => console.error(e));
  });
})();
