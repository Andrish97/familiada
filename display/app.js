(() => {
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const el = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };

  const VIEW = { W: 1600, H: 900, CX: 800, CY: 450 };

  // Wygląd scenografii (nie ruszamy)
  const COLORS = { big: "#2e2e32", cell: "#000000", dotOff: "#2e2e32" };

  // Kolory świecenia
  const LIT = {
    main: "#d7ff3d", // główny żółty lekko zielonkawy (duży + dolne)
    top: "#34ff6a",  // górny zielony
    left: "#ff2e3b", // lewy czerwony
    right: "#2bff65" // prawy zielony
  };

  // Geometria (jak było)
  const d = 4;
  const g = 1;
  const gapCells = d;
  const DOTS = { X: 5, Y: 7 };
  const Wgrid = (X, dDots, gap) => X * dDots + (X + 1) * gap;
  const Hgrid = (Y, dDots, gap) => Y * dDots + (Y + 1) * gap;

  // ---------------- Font ----------------
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
    if (typeof v === "string" && v.startsWith("@")) return resolveGlyph(GLYPHS, v.slice(1));
    return v;
  };

  const isDigit = (ch) => ch >= "0" && ch <= "9";

  // ---------------- Timing / anim helpers ----------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const orderPixelsEdge = (w, h, direction) => {
    const coords = [];
    if (direction === "left")      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) coords.push([x, y]);
    else if (direction === "right")for (let x = w - 1; x >= 0; x--) for (let y = 0; y < h; y++) coords.push([x, y]);
    else if (direction === "top")  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) coords.push([x, y]);
    else                           for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) coords.push([x, y]);
    return coords;
  };

  // ---------------- Rendering primitives ----------------
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

    return { x, y, dots };
  };

  const drawTiled5x7 = (parent, x, y, tilesX, tilesY, dDots, gap, tileGap, colors) => {
    const wTileOuter = (Wgrid(5, dDots, gap) + 2 * gap);
    const hTileOuter = (Hgrid(7, dDots, gap) + 2 * gap);

    const W = tilesX * wTileOuter + (tilesX - 1) * tileGap + 2 * gap;
    const H = tilesY * hTileOuter + (tilesY - 1) * tileGap + 2 * gap;

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

    return { tiles, tilesX, tilesY };
  };

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

    return { dots, X, Y };
  };

  // ---------------- Glyph render ----------------
  const renderGlyphToTile = (tile, glyphRows, onColor, offColor) => {
    for (let row = 0; row < 7; row++) {
      const bits = (glyphRows[row] | 0);
      for (let col = 0; col < 5; col++) {
        const mask = 1 << (4 - col);
        const on = (bits & mask) !== 0;
        tile.dots[row][col].setAttribute("fill", on ? onColor : offColor);
      }
    }
  };

  const renderCharToTile = (GLYPHS, tile, ch, onColor, offColor) => {
    const glyph = resolveGlyph(GLYPHS, ch);
    renderGlyphToTile(tile, glyph, onColor, offColor);
  };

  // ---------------- Small displays rules ----------------
  // górny + boczne: digits only (API ma to wymuszać)
  const setTripleDigits = (GLYPHS, tiles3, text, onColor) => {
    const s = (text ?? "").toString();
    for (let i = 0; i < 3; i++) {
      const raw = s[i] ?? " ";
      const ch = isDigit(raw) ? raw : " ";
      renderCharToTile(GLYPHS, tiles3[i], ch, onColor, COLORS.dotOff);
    }
  };

  // podłużne: max 15 symboli, 1 kol przerwy, centrowanie
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

  // ---------------- Big display addressing ----------------
  // Koordynaty segmentów 5x7: user używa "col:row" 1-based
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
    renderGlyphToTile(t, [0,0,0,0,0,0,0], LIT.main, COLORS.dotOff);
  };

  // Pole (field) = prosty “string” po tile’ach w prawo
  const makeField = (name, col1, row1, len) => ({ name, col1, row1, len });

  const writeField = (GLYPHS, big, field, text, color = LIT.main) => {
    const s = (text ?? "").toString().toUpperCase();
    for (let i = 0; i < field.len; i++) {
      const ch = s[i] ?? " ";
      putCharAt(GLYPHS, big, field.col1 + i, field.row1, ch, color);
    }
  };

  // Animacja “popikselowa” na polu (range tile)
  const animateFieldEdgeIn = async (GLYPHS, big, field, direction, text, stepDelayMs = 6, color = LIT.main) => {
    const s = (text ?? "").toString().toUpperCase();
    const coords = orderPixelsEdge(5, 7, direction);
    const tiles = [];
    const glyphs = [];
    for (let i = 0; i < field.len; i++) {
      const t = tileAt(big, field.col1 + i, field.row1);
      if (!t) continue;
      tiles.push(t);
      glyphs.push(resolveGlyph(GLYPHS, s[i] ?? " "));
      renderGlyphToTile(t, [0,0,0,0,0,0,0], color, COLORS.dotOff);
    }

    for (const [x, y] of coords) {
      for (let ti = 0; ti < tiles.length; ti++) {
        const bits = glyphs[ti][y] | 0;
        const mask = 1 << (4 - x);
        const on = (bits & mask) !== 0;
        tiles[ti].dots[y][x].setAttribute("fill", on ? color : COLORS.dotOff);
      }
      if (stepDelayMs) await sleep(stepDelayMs);
    }
  };

  // ---------------- Special: rysowanie X w 3x3 tile ----------------
  // Wzór:
  // ⇖⎵⇗
  //  █
  // ⇙⎴⇘
  const drawBigX_3x3 = (GLYPHS, big, col1, row1, color = LIT.main) => {
    putCharAt(GLYPHS, big, col1 + 0, row1 + 0, "⇖", color);
    putCharAt(GLYPHS, big, col1 + 1, row1 + 0, "⎵", color);
    putCharAt(GLYPHS, big, col1 + 2, row1 + 0, "⇗", color);

    putCharAt(GLYPHS, big, col1 + 1, row1 + 1, "█", color);

    putCharAt(GLYPHS, big, col1 + 0, row1 + 2, "⇙", color);
    putCharAt(GLYPHS, big, col1 + 1, row1 + 2, "⎴", color);
    putCharAt(GLYPHS, big, col1 + 2, row1 + 2, "⇘", color);
  };

  // ============================================================
  // BIG MODES (szkielet): LOGO / ROUNDS / FINAL / WIN
  // ============================================================

  const BIG_MODES = {
    LOGO: "LOGO",
    ROUNDS: "ROUNDS",
    FINAL: "FINAL",
    WIN: "WIN",
  };

  // Definicje pól (na razie minimalny zestaw + generatory)
  const BigLayouts = {
    LOGO: {
      // Tu później wrzucisz “symbol gdzie” jako lista {col,row,ch}
      // np. fixed: [{col:1,row:1,ch:"◣"}, ...]
      fixed: [],
      fields: {}
    },

    ROUNDS: {
      fixed: [
        // napis SUMA (od 18:8 wg opisu)
        // To jest stałe w trybie ROUNDS
      ],
      fields: {
        // 5 rund: cyferki 1..5 od 5:2 do 5:6 (czyli col=5, rows 2..6)
        // Traktuję to jako 5 pól jednoznakowych:
        R1: makeField("R1", 5, 2, 1),
        R2: makeField("R2", 5, 3, 1),
        R3: makeField("R3", 5, 4, 1),
        R4: makeField("R4", 5, 5, 1),
        R5: makeField("R5", 5, 6, 1),

        // SUMA label
        SUMA_LABEL: makeField("SUMA_LABEL", 18, 8, 4),

        // Pole na 3 symbole (23:8 do 25:8)
        SUMA_VAL: makeField("SUMA_VAL", 23, 8, 3),

        // Uwaga: teksty 17-znakowe i 2-znakowe mają tu być “siatką 5 pól”
        // Zrobiłem generatory poniżej w initMode().
      },
      // “X” komórki:
      // 1A) 1:8-3:10 => start col=1,row=8 (3x3)
      // 2A) 1:5-3:7  => start 1,5
      // 3A) 1:2-3:4  => start 1,2
      // 1B) 28:8-30:10 => start 28,8
      // 2B) 28:5-30:7  => start 28,5
      // 3B) 28:2-30:4  => start 28,2
      xCells: {
        "1A": { col1: 1, row1: 8 },
        "2A": { col1: 1, row1: 5 },
        "3A": { col1: 1, row1: 2 },
        "1B": { col1: 28, row1: 8 },
        "2B": { col1: 28, row1: 5 },
        "3B": { col1: 28, row1: 2 },
      }
    },

    FINAL: {
      fields: {
        // SUMA label od 8:11
        SUMA_LABEL: makeField("SUMA_LABEL", 8, 11, 4),
        // SUMA 3 znaki od 8:16 do 8:18 => col 16 len 3
        SUMA_VAL: makeField("SUMA_VAL", 16, 8, 3),
        // Reszta pól (11-znakowe, 2-znakowe) dopełnimy generatorem jak w ROUNDS
      }
    },

    WIN: {
      // Tu będzie “większa czcionka” złożona z symboli.
      // Wstępnie zostawiamy API hook, bo musimy doprecyzować mapowanie “dużych cyfr”
      fields: {}
    }
  };

  // Wyczyść duży
  const clearBig = (big) => {
    for (let row = 1; row <= big.tilesY; row++) {
      for (let col = 1; col <= big.tilesX; col++) clearTileAt(big, col, row);
    }
  };

  // Inicjalizacja trybu (ustawia stałe elementy + buduje pola)
  const initBigMode = (GLYPHS, big, mode) => {
    clearBig(big);

    if (mode === BIG_MODES.ROUNDS) {
      // wpisz SUMA
      writeField(GLYPHS, big, BigLayouts.ROUNDS.fields.SUMA_LABEL, "SUMA", LIT.main);

      // generator: 5 pól tekstowych po 17 znaków:
      // “od 7:2 do 22:2 i tak dalej co 1 rządek” => przyjmuję:
      // start col=7, len=16? ale napisałeś 17 symboli, więc len=17
      // kończy na col=23, więc 7..23 => 17. To pasuje.
      // czyli: col=7, len=17
      for (let r = 0; r < 5; r++) {
        const row1 = 2 + r;
        for (let k = 0; k < 5; k++) {
          const name = `T${r+1}_${k+1}`;
          // 5 pól w wierszu — tu potrzebujemy ich rozstawu (nie podałeś wprost).
          // Zostawiamy je w jednej “puli” do ustawienia później.
          // Na razie: tworzę je jako placeholdery bez użycia.
          BigLayouts.ROUNDS.fields[name] = makeField(name, 7, row1, 17);
        }
      }

      // generator: 5 pól po 2 symbole od 24:2 do 25:2 … co rządek
      for (let r = 0; r < 5; r++) {
        const row1 = 2 + r;
        for (let k = 0; k < 5; k++) {
          const name = `P2_${r+1}_${k+1}`;
          BigLayouts.ROUNDS.fields[name] = makeField(name, 24, row1, 2);
        }
      }

      // rundy 1..5 (cyfra)
      writeField(GLYPHS, big, BigLayouts.ROUNDS.fields.R1, "1");
      writeField(GLYPHS, big, BigLayouts.ROUNDS.fields.R2, "2");
      writeField(GLYPHS, big, BigLayouts.ROUNDS.fields.R3, "3");
      writeField(GLYPHS, big, BigLayouts.ROUNDS.fields.R4, "4");
      writeField(GLYPHS, big, BigLayouts.ROUNDS.fields.R5, "5");
    }

    if (mode === BIG_MODES.FINAL) {
      writeField(GLYPHS, big, BigLayouts.FINAL.fields.SUMA_LABEL, "SUMA", LIT.main);
      // Resztę pól dopełnimy, jak wejdziemy w FINAL konkretnie (jest ich dużo).
    }

    if (mode === BIG_MODES.LOGO) {
      // fixed layout: lista elementów {col,row,ch}
      for (const it of (BigLayouts.LOGO.fixed || [])) putCharAt(GLYPHS, big, it.col, it.row, it.ch, LIT.main);
    }

    if (mode === BIG_MODES.WIN) {
      // Na razie czyszczenie; duża czcionka i liczba 5-cyfrowa do dopięcia.
    }
  };

  // ============================================================
  // Backend commands (tekstowe) + API
  // ============================================================

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

  const bootstrap = async () => {
    const FONT = await loadFont("./font_5x7.json");
    const GLYPHS = buildGlyphMap(FONT);

    const center = $("center");
    const panels = $("panels");
    const basebar = $("basebar");
    const bottom = $("bottom");

    // ---------------- BIG (30x10 tiles 5x7) ----------------
    const wSmall = Wgrid(DOTS.X, d, g);
    const hSmall = Hgrid(DOTS.Y, d, g);
    const centerW = 30 * wSmall + 29 * gapCells + 2 * g;
    const centerH = 10 * hSmall + 9 * gapCells + 2 * g;
    const centerX = VIEW.CX - centerW / 2;
    const centerY = VIEW.CY - centerH / 2;

    const big = drawTiled5x7(center, centerX, centerY, 30, 10, d, g, gapCells, COLORS);

    // ---------------- Triple displays (digits-only API) ----------------
    const dP = 3 * d;
    const wTileOuterP = (Wgrid(5, dP, g) + 2 * g);
    const panelW_old = 3 * wTileOuterP + 2 * gapCells + 2 * g;
    const shift = panelW_old / 4;

    const sideY = 390;
    const leftX = 10 + shift;
    const rightX = VIEW.W - panelW_old - 10 - shift;

    const topY = 65;
    const topX = VIEW.CX - panelW_old / 2;

    const drawTriplePanel = (parent, x, y) => {
      parent.appendChild(el("rect", {
        x, y,
        width: panelW_old,
        height: (Hgrid(7, dP, g) + 2 * g) + 2 * g,
        rx: 0,
        fill: COLORS.big
      }));

      const tiles = [];
      for (let i = 0; i < 3; i++) {
        const gx = x + g + i * (wTileOuterP + gapCells);
        const gg = el("g", {});
        parent.appendChild(gg);
        tiles.push(drawTile5x7(gg, gx, y + g, dP, g, COLORS));
      }
      return tiles;
    };

    const leftTriple = drawTriplePanel(panels, leftX, sideY);
    const rightTriple = drawTriplePanel(panels, rightX, sideY);
    const topTriple = drawTriplePanel(panels, topX, topY);

    // ---------------- Bottom: two long dot panels 95x7 ----------------
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

    // Pasek (jak było)
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

    const long1 = drawDotPanel(bottom, xLeft, yBottom, Xb, Yb, dBottom, g, COLORS);
    const long2 = drawDotPanel(bottom, xRight, yBottom, Xb, Yb, dBottom, g, COLORS);

    // ---------------- API (twarde reguły) ----------------
    let currentBigMode = BIG_MODES.LOGO;

    const api = {
      // digits-only
      topDigits:   (ddd) => setTripleDigits(GLYPHS, topTriple, ddd, LIT.top),
      leftDigits:  (ddd) => setTripleDigits(GLYPHS, leftTriple, ddd, LIT.left),
      rightDigits: (ddd) => setTripleDigits(GLYPHS, rightTriple, ddd, LIT.right),

      // long strings max 15
      long1: (txt) => setLongTextCenteredMax15(GLYPHS, long1, txt, LIT.main),
      long2: (txt) => setLongTextCenteredMax15(GLYPHS, long2, txt, LIT.main),

      // big modes
      bigMode: (mode) => {
        const m = (mode ?? "").toString().toUpperCase();
        if (!BIG_MODES[m]) throw new Error(`Nieznany tryb big: ${mode}`);
        currentBigMode = m;
        initBigMode(GLYPHS, big, currentBigMode);
      },

      // big field ops
      bigWriteField: (name, text) => {
        const layout = BigLayouts[currentBigMode];
        const field = layout?.fields?.[name];
        if (!field) throw new Error(`Nie ma pola "${name}" w trybie ${currentBigMode}`);
        writeField(GLYPHS, big, field, text, LIT.main);
      },

      bigEdgeInField: async (name, dir, text, step = 6) => {
        const layout = BigLayouts[currentBigMode];
        const field = layout?.fields?.[name];
        if (!field) throw new Error(`Nie ma pola "${name}" w trybie ${currentBigMode}`);
        await animateFieldEdgeIn(GLYPHS, big, field, dir, text, step, LIT.main);
      },

      // big: X cells (ROUNDS)
      bigSetX: (cellName, on) => {
        if (currentBigMode !== BIG_MODES.ROUNDS) throw new Error("X tylko w trybie ROUNDS");
        const cell = BigLayouts.ROUNDS.xCells[cellName];
        if (!cell) throw new Error(`Nieznana komórka X: ${cellName}`);
        if (on) drawBigX_3x3(GLYPHS, big, cell.col1, cell.row1, LIT.main);
        else {
          // czyścimy 3x3
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) clearTileAt(big, cell.col1 + dx, cell.row1 + dy);
        }
      },

      // debug low-level
      _put: (col, row, ch) => putCharAt(GLYPHS, big, col, row, ch, LIT.main),
      _clearBig: () => clearBig(big),
    };

    // ---------------- Backend commands (tekst) ----------------
    // Przykłady:
    //  TOP 123
    //  LEFT 045
    //  RIGHT 999
    //  LONG1 "FAMILIADA"
    //  BIG MODE ROUNDS
    //  BIG FIELD T1_1 "ODP1............."  (na razie placeholder)
    //  BIG FIELD SUMA_VAL "123"
    //  BIG FIELD-ANIM SUMA_VAL dir=left step=6 text="321"
    //  BIG X 2A ON

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

        if (op === "MODE") {
          return api.bigMode(parts[2] || "");
        }

        if (op === "FIELD") {
          const name = parts[2];
          const rest = raw.split(/\s+/).slice(3).join(" ").trim();
          const txt = rest.startsWith('"') && rest.endsWith('"') ? rest.slice(1, -1) : rest;
          return api.bigWriteField(name, txt);
        }

        if (op === "FIELD-ANIM") {
          const name = parts[2];
          const kv = (() => {
            // reszta po name jako k=v
            const tail = parts.slice(3);
            const kv0 = {};
            for (const p of tail) {
              const i = p.indexOf("=");
              if (i > 0) {
                const k = p.slice(0, i);
                let v = p.slice(i + 1);
                if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
                kv0[k] = v;
              }
            }
            return kv0;
          })();
          const dir = (kv.dir || "left").toLowerCase();
          const step = kv.step ? parseInt(kv.step, 10) : 6;
          const text = kv.text ?? "";
          return api.bigEdgeInField(name, dir, text, step);
        }

        if (op === "X") {
          const cellName = (parts[2] || "").toUpperCase();
          const state = (parts[3] || "").toUpperCase();
          return api.bigSetX(cellName, state === "ON" || state === "1" || state === "TRUE");
        }
      }

      console.warn("Nieznana komenda:", raw);
    };

    // ---------------- Start state ----------------
    api.topDigits("123");
    api.leftDigits("045");
    api.rightDigits("999");
    api.long1("FAMILIADA");
    api.long2("SUMA 000");

    api.bigMode("ROUNDS"); // żeby od razu zobaczyć SUMA i rundy 1..5

    // eksporty
    window.scene = { api, handleCommand, BIG_MODES };
    console.log("scene.api gotowe.");
    console.log(`Przykład: scene.handleCommand('TOP 777')`);
    console.log(`Przykład: scene.handleCommand('LONG1 "ŻÓŁW, 123"')  // utnie do 15`);
    console.log(`Przykład: scene.handleCommand('BIG MODE ROUNDS')`);
    console.log(`Przykład: scene.handleCommand('BIG X 2A ON')`);
  };

  window.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((e) => console.error(e));
  });
})();
