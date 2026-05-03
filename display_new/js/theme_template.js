// theme_NAZWA.js
// ============================================================
// STRUKTURA KAŻDEGO MOTYWU:
//
// 1a. KOLOWE BAZOWE   – A, B, BG (użytkownik ustawia przez COLOR)
// 1b. KOLOWE DERIVED  – policzone odcienie (opcjonalne)
// 1c. TŁO             – dowolny CSS background: solid, gradient, url(), cokolwiek
//                       TŁO POKRYWA CAŁY EKRAN (viewport), nie tylko obszar 1280x720
// 1d. KONTROLKI       – ON/OFF → zmiana atrybutu LUB podmiana fragmentu SVG
// 2. SVG TEMPLATE     – wklejasz z Inkscape, kolory → ${d.A}, ${d.B}...
//                       SVG BEZ TŁA, viewBox="0 0 1280 720"
// 3. WSPÓŁRZĘDNE      – sztywne {cx, cy} wyświetlaczy w układzie 1280x720
// ============================================================

const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
};
const rgbToHex = ({ r, g, b }) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
const mix     = (c1, c2, t) => ({ r: Math.round(c1.r + (c2.r - c1.r) * t), g: Math.round(c1.g + (c2.g - c1.g) * t), b: Math.round(c1.b + (c2.b - c1.b) * t) });
const lighten = (c, t) => mix(c, { r: 255, g: 255, b: 255 }, t);
const darken  = (c, t) => mix(c, { r: 0, g: 0, b: 0 }, t);

// ============================================================
// 1a. KOLOWE BAZOWE – użytkownik ustawia przez COLOR A/B/BACKGROUND
// ============================================================
const DEFAULT_COLORS = { A: "#c4002f", B: "#2a62ff", BG: "#d21180" };

// ============================================================
// 1b. KOLOWE DERIVED – policzone odcienie z bazowych (opcjonalne)
// ============================================================
function computeDerived(c) {
  const A = hexToRgb(c.A), B = hexToRgb(c.B);
  return {
    A_dark: rgbToHex(darken(A, 0.38)),
    B_dark: rgbToHex(darken(B, 0.35)),
    A_lamp: rgbToHex(lighten(A, 0.25)),
    B_lamp: rgbToHex(lighten(B, 0.18)),
    B_glow: rgbToHex(lighten(B, 0.28)),
  };
}

// ============================================================
// 1c. TŁO – CSS background pokrywający CAŁY EKRAN (viewport)
// ============================================================
// Użyj jednostek viewport (vw/vh) aby tło wypełniało całe okno przeglądarki.
// Możesz zwrócić: solid, gradient, url(), lub ich kombinację.
function computeBg(c) {
  // Przykład: radial-gradient na cały ekran
  const G = hexToRgb(c.BG);
  const top = lighten(G, 0.18);
  const mid = lighten(G, 0.05);
  const bot = darken(G, 0.55);
  return `radial-gradient(150vw 90vh at 50% 25%, ${rgbToHex(top)} 0%, ${rgbToHex(mid)} 30%, ${rgbToHex(G)} 55%, ${rgbToHex(bot)} 100%)`;

  // Inne przykłady:
  // return c.BG;                                          // solid
  // return `linear-gradient(to bottom, ${c.BG}, #000)`;    // gradient liniowy
  // return `url(bg.jpg) center/cover no-repeat`;           // obrazek
}

// ============================================================
// 1d. KONTROLKI – co się zmienia przy ON vs OFF
// ============================================================
// Każdy element to { id: "svgElementId", attr: "atrybut", on: "wartość", off: "wartość" }
// Lub: { id: "...", shape: { on: "<svg>...</svg>", off: "<svg>...</svg>" } }
const CONTROLS = {
  A: [
    // Przykład: { id: "lampA", attr: "opacity", on: "1", off: "0.2" },
  ],
  B: [
    // Przykład: { id: "lampB", attr: "opacity", on: "1", off: "0.2" },
  ],
};

function applyControls(svg, controls) {
  for (const side of ["A", "B"]) {
    const on = controls[side] === true;
    for (const rule of CONTROLS[side]) {
      const el = svg.querySelector(`#${rule.id}`);
      if (!el) continue;
      if (rule.shape) {
        el.innerHTML = on ? rule.shape.on : rule.shape.off;
      } else {
        el.setAttribute(rule.attr, on ? rule.on : rule.off);
      }
    }
  }
}

// ============================================================
// 2. SVG TEMPLATE – wklejasz z Inkscape, kolory → zmienne
//    UWAGA: SVG BEZ TŁA, viewBox="0 0 1280 720"
// ============================================================
function buildSvgContent(d) {
  return `<defs>
  <!-- Zdefiniuj gradienty używając zmiennych:
       ${d.A}, ${d.B}, ${d.A_dark}, ${d.B_dark}, ${d.A_lamp}, ${d.B_lamp}, ${d.B_glow}
  -->
</defs>

<!--
  Wklej tutaj SVG wyeksportowany z Inkscape (bez tagu <svg> i viewBox)
  Zamień kolory na zmienne:
    - kolor drużyny A:      ${d.A}, ${d.A_dark}, ${d.A_lamp}
    - kolor drużyny B:      ${d.B}, ${d.B_dark}, ${d.B_lamp}, ${d.B_glow}
    - dla tła: zostaw przezroczyste (fill="none" lub usuń), tło jest w .layer-bg
  Elementy sterowane przez KONTROLKI oznacz unikalnymi id
-->
`;
}

function render(svg, bgLayer, d, colors, controls) {
  svg.setAttribute("viewBox", "0 0 1280 720");
  svg.innerHTML = buildSvgContent(d);
  applyControls(svg, controls);
  bgLayer.style.background = computeBg(colors);
}

// ============================================================
// 3. WSPÓŁRZĘDNE WYŚWIETLACZY – sztywne {cx, cy} w układzie 1280×720
// ============================================================
// Użyj theme_builder.html aby przeciągnąć wyświetlacze i pobrać współrzędne.
export function createTheme(baseSvg, bgLayer, config = {}) {
  let colors   = { ...DEFAULT_COLORS, ...config.colors };
  let controls = { A: false, B: false, ...config.controls };

  const derived = computeDerived(colors);
  render(baseSvg, bgLayer, derived, colors, controls);

  return {
    name: "temat_xyz",  // <-- zmień na nazwę swojego motywu
    displays: {
      big:        { cx: 640,    cy: 360   },  // <-- użyj theme_builder.html
      leftPanel:  { cx: 79.4,   cy: 360   },  //     aby ustalić te wartości
      rightPanel: { cx: 1200.6, cy: 360   },
      topPanel:   { cx: 640,    cy: 79.7  },
      long1:      { cx: 356.8,  cy: 646.4 },
      long2:      { cx: 923.2,  cy: 646.4 },
    },
    multiplier: 1.0,
    updateColors(newColors) {
      Object.assign(colors, newColors);
      const d = computeDerived(colors);
      render(baseSvg, bgLayer, d, colors, controls);
    },
    updateControls(newControls) {
      Object.assign(controls, newControls);
      applyControls(baseSvg, controls);
    },
    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
  };
}
