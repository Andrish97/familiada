// theme_NAZWA.js
// ============================================================
// STRUKTURA KAŻDEGO MOTYWU:
//
// 1. KOLOWE BAZOWE → derived (odcienie) + kontrolki (ON/OFF → kolor/kształt)
// 2. SVG TEMPLATE   – wklejony z Inkscape, kolory zamienione na zmienne (${d.A}, ${d.B_glow}…)
//                     SVG BEZ TŁA, viewBox="0 0 1280 720"
// 3. WSPÓŁRZĘDNE    – sztywne {cx, cy} dla 6 wyświetlaczy + multiplier → output
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
// 1b. KOLOWE DERIVED – policzone odcienie z bazowych
// ============================================================
function computeDerived(c) {
  const A = hexToRgb(c.A), B = hexToRgb(c.B), G = hexToRgb(c.BG);
  return {
    A_dark: rgbToHex(darken(A, 0.38)),
    B_dark: rgbToHex(darken(B, 0.35)),
    A_lamp: rgbToHex(lighten(A, 0.25)),
    B_lamp: rgbToHex(lighten(B, 0.18)),
    B_glow: rgbToHex(lighten(B, 0.28)),
    bgGradient: `radial-gradient(...)` // – policzony CSS gradient tła
  };
}

// ============================================================
// 1c. KONTROLKI – co się zmienia przy ON vs OFF
//     Regułka może zmieniać atrybut LUB wymieniać fragment SVG (shape)
// ============================================================
const CONTROLS = {
  A: [
    // Prosta zmiana atrybutu:
    { selector: "#lampA_glow",      attr: "opacity", on: "0.85", off: "0" },
    { selector: "#lampA_on",        attr: "opacity", on: "0.98", off: "0" },
    { selector: "#lampA_off",       attr: "opacity", on: "0.20", off: "0.92" },
    { selector: "#lampA_highlight", attr: "opacity", on: "0.28", off: "0.14" },

    // Przykładowa podmiana kształtu (shape):
    // { selector: "#shapeContainer", shape: {
    //     on:  `<path d="M0 0 L10 10 L20 0" fill="${d.A}"/>`,
    //     off: `<circle cx="10" cy="5" r="8" fill="#333"/>`,
    // }},
  ],
  B: [
    { selector: "#lampB_glow",      attr: "opacity", on: "0.85", off: "0" },
    { selector: "#lampB_on",        attr: "opacity", on: "0.98", off: "0" },
    { selector: "#lampB_off",       attr: "opacity", on: "0.20", off: "0.92" },
    { selector: "#lampB_highlight", attr: "opacity", on: "0.28", off: "0.14" },
  ],
};

function applyControls(svg, controls) {
  for (const side of ["A", "B"]) {
    const on = controls[side] === true;
    for (const rule of CONTROLS[side]) {
      const el = svg.querySelector(rule.selector);
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
//    UWAGA: bez tła (tło leci w bgLayer), viewBox="0 0 1280 720"
// ============================================================
function buildSvgContent(d) {
  return `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
<defs>
  <!-- gradienty z policzonymi kolorami -->
</defs>

<!-- Tutaj wklejasz SVG z Inkscape -->
<!-- Kolory zamieniasz na ${d.A}, ${d.B}, ${d.A_dark}, ${d.B_glow} itd. -->

</svg>`;
}

function render(svg, d, controls) {
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
  render(baseSvg, derived, controls);
  bgLayer.style.background = derived.bgGradient;

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
      render(baseSvg, d, controls);
      bgLayer.style.background = d.bgGradient;
    },
    updateControls(newControls) {
      Object.assign(controls, newControls);
      applyControls(baseSvg, controls);
    },
    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
  };
}
