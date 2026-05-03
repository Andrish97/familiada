// theme_NAZWA.js
// ============================================================
// STRUKTURA KAŻDEGO MOTYWU:
//
// 1a. KOLOWE BAZOWE   – A, B, BG (użytkownik ustawia przez COLOR)
// 1b. KOLOWE DERIVED  – policzone odcienie (opcjonalne)
// 1c. TŁO             – dowolny CSS background: solid, gradient, url(), cokolwiek
// 1d. KONTROLKI       – ON/OFF → atrybut LUB podmiana SVG (shape)
// 2. SVG TEMPLATE      – wklejasz z Inkscape, kolory → ${d.A}, ${d.B_glow}…
//                        SVG BEZ TŁA, viewBox="0 0 1280 720"
// 3. WSPÓŁRZĘDNE       – sztywne {cx, cy} + multiplier → output
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
// 1a. KOLOWE BAZOWE – to użytkownik ustawia przez COLOR A/B/BACKGROUND
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
// 1c. TŁO – dowolny CSS background dla .layer-bg
// ============================================================
// Zwróć STRING CSS – co tam chcesz:
//   SOLID:      return c.BG
//   GRADIENT:   return `linear-gradient(...)` lub `radial-gradient(...)`
//   IMAGE:      return `url(...) center/cover no-repeat`
//   MULTI:      return `color, url(...), linear-gradient(...)` (stacked)
//
// Możesz użyć kolorów bazowych c.A, c.B, c.BG albo derived.
function computeBg(c) {
  const G = hexToRgb(c.BG);
  const top = lighten(G, 0.10);
  const bot = darken(G, 0.85);
  return `radial-gradient(1400px 700px at 50% 25%, ${rgbToHex(top)} 0%, ${rgbToHex(G)} 40%, ${rgbToHex(bot)} 100%)`;
}

// ============================================================
// 1d. KONTROLKI – co się zmienia przy ON vs OFF
//     Regułka może zmieniać atrybut LUB wymieniać fragment SVG (shape)
// ============================================================
const CONTROLS = {
  A: [
    // Zmiana atrybutu:
    { id: "lampA_glow",      attr: "opacity", on: "0.85", off: "0" },
    { id: "lampA_on",        attr: "opacity", on: "0.98", off: "0" },
    { id: "lampA_off",       attr: "opacity", on: "0.20", off: "0.92" },
    { id: "lampA_highlight", attr: "opacity", on: "0.28", off: "0.14" },

    // Przykładowa podmiana kształtu:
    // { id: "shapeContainer", shape: {
    //     on:  `<path d="M0 0 L10 10 L20 0" fill="${d.A}"/>`,
    //     off: `<circle cx="10" cy="5" r="8" fill="#333"/>`,
    // }},
  ],
  B: [
    { id: "lampB_glow",      attr: "opacity", on: "0.85", off: "0" },
    { id: "lampB_on",        attr: "opacity", on: "0.98", off: "0" },
    { id: "lampB_off",       attr: "opacity", on: "0.20", off: "0.92" },
    { id: "lampB_highlight", attr: "opacity", on: "0.28", off: "0.14" },
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
  <!-- gradienty z policzonymi kolorami -->
</defs>

<!-- Tutaj wklejasz SVG z Inkscape -->
<!-- Kolory zamieniasz na ${d.A}, ${d.B}, ${d.A_dark}, ${d.B_glow} itd. -->
`;
}

function render(svg, d, colors, controls) {
  svg.setAttribute("viewBox", "0 0 1280 720");
  svg.innerHTML = buildSvgContent(d);
  applyControls(svg, controls);
}

// ============================================================
// 3. WSPÓŁRZĘDNE WYŚWIETLACZY – sztywne, ręcznie wpisane 1280×720
// ============================================================
export function createTheme(baseSvg, bgLayer, config = {}) {
  let colors   = { ...DEFAULT_COLORS, ...config.colors };
  let controls = { A: false, B: false, ...config.controls };

  const derived = computeDerived(colors);
  render(baseSvg, derived, colors, controls);
  bgLayer.style.background = computeBg(colors);

  return {
    name: "nazwa_motywu",
    displays: {
      big:        { cx: 640,    cy: 360   },
      leftPanel:  { cx: 79.4,   cy: 360   },
      rightPanel: { cx: 1200.6, cy: 360   },
      topPanel:   { cx: 640,    cy: 79.7  },
      long1:      { cx: 356.8,  cy: 646.4 },
      long2:      { cx: 923.2,  cy: 646.4 },
    },
    multiplier: 1.0,
    updateColors(newColors) {
      Object.assign(colors, newColors);
      const d = computeDerived(colors);
      render(baseSvg, d, colors, controls);
      bgLayer.style.background = computeBg(colors);
    },
    updateControls(newControls) {
      Object.assign(controls, newControls);
      applyControls(baseSvg, controls);
    },
    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
  };
}
