// theme_classic.js
// Klasyczny motyw – SVG 1280×720 (tylko dekoracja)
// Wyświetlacze są rysowane osobno przez displays.js

const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
};
const rgbToHex = ({ r, g, b }) => `#${(r << 16 | g << 8 | b).toString(16).padStart(6, "0")}`;
const mix = (c1, c2, t) => ({ r: Math.round(c1.r + (c2.r - c1.r) * t), g: Math.round(c1.g + (c2.g - c1.g) * t), b: Math.round(c1.b + (c2.b - c1.b) * t) });
const lighten = (c, t) => mix(c, { r: 255, g: 255, b: 255 }, t);
const darken  = (c, t) => mix(c, { r: 0, g: 0, b: 0 }, t);

const DEFAULT_COLORS = { A: "#c4002f", B: "#2a62ff", BG: "#d21180" };

function computeDerived(c) {
  const A = hexToRgb(c.A), B = hexToRgb(c.B);
  return {
    A_dark: rgbToHex(darken(A, 0.35)),
    B_dark: rgbToHex(darken(B, 0.32)),
    A_lamp: rgbToHex(lighten(A, 0.25)),
    B_lamp: rgbToHex(lighten(B, 0.18)),
    B_glow: rgbToHex(lighten(B, 0.28)),
  };
}

function computeBg(c) {
  const G = hexToRgb(c.BG);
  const top = lighten(G, 0.18);
  const mid = lighten(G, 0.05);
  const bot = darken(G, 0.55);
  return `radial-gradient(150vw 90vh at 50% 25%, ${rgbToHex(top)} 0%, ${rgbToHex(mid)} 30%, ${rgbToHex(G)} 55%, ${rgbToHex(bot)} 100%)`;
}

const CONTROLS = {
  A: [
    { id: "lampA_glow",  attr: "opacity", on: "0.85", off: "0" },
    { id: "rect10834",   attr: "filter",  on: "url(#neonRed)", off: "none" },
    { id: "rect10834",   attr: "stroke-opacity", on: "1", off: "0.7" },
    { id: "circle10839", attr: "opacity", on: "0.98", off: "0" },    // lampA_on (fill:url(#lampGrad_A))
    { id: "circle10838", attr: "opacity", on: "0.20", off: "0.92" },   // lampA_off
    { id: "circle10840", attr: "opacity", on: "0.28", off: "0.14" },   // lampA_highlight
  ],
  B: [
    { id: "lampB_glow",  attr: "opacity", on: "0.85", off: "0" },
    { id: "rect10835",   attr: "filter",  on: "url(#neonBlue)", off: "none" },
    { id: "rect10835",   attr: "stroke-opacity", on: "1", off: "0.7" },
    { id: "circle10845", attr: "opacity", on: "0.98", off: "0" },    // lampB_on (fill:url(#lampGrad_B))
    { id: "circle10844", attr: "opacity", on: "0.20", off: "0.92" },   // lampB_off
    { id: "circle10846", attr: "opacity", on: "0.28", off: "0.14" },   // lampB_highlight
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

function buildSvgContent(d) {
  return `<defs id="defs11">
  <linearGradient id="rimGrad" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0"    stop-color="${d.A}"/>
    <stop offset="0.35" stop-color="${d.A_dark}"/>
    <stop offset="0.65" stop-color="${d.B_dark}"/>
    <stop offset="1"    stop-color="${d.B}"/>
  </linearGradient>
  <linearGradient id="innerGrad" x1="141.50781" y1="212.21851" x2="141.50781" y2="1060.5737" gradientTransform="matrix(1.1313709,0,0,0.56568542,1.5258789e-5,-18.413443)" gradientUnits="userSpaceOnUse">
    <stop offset="0"   stop-color="#e6eaef"/>
    <stop offset="1" stop-color="#bfc7cf"/>
  </linearGradient>
  <linearGradient id="silverGrad" x1="6.6645017" y1="3465.8503" x2="6.6645017" y2="3807.9612" gradientTransform="scale(4.5014618,0.22215006)" gradientUnits="userSpaceOnUse">
    <stop offset="0"    stop-color="#f6f7f9"/>
    <stop offset="0.55" stop-color="#d1d5db"/>
    <stop offset="1"    stop-color="#aab1bb"/>
  </linearGradient>
  <filter id="neonRed" x="-100%" y="-100%" width="300%" height="300%">
    <feDropShadow dx="0" dy="0" stdDeviation="6"  flood-color="${d.A_lamp}" flood-opacity="0.9"/>
    <feDropShadow dx="0" dy="0" stdDeviation="15" flood-color="${d.A_dark}" flood-opacity="0.5"/>
  </filter>
  <filter id="neonBlue" x="-100%" y="-100%" width="300%" height="300%">
    <feDropShadow dx="0" dy="0" stdDeviation="6"  flood-color="${d.B_glow}" flood-opacity="0.9"/>
    <feDropShadow dx="0" dy="0" stdDeviation="15" flood-color="${d.B_dark}" flood-opacity="0.5"/>
  </filter>
  <radialGradient id="lampGrad_A" cx="61.616001" cy="798.21082" r="34.048" fx="61.616001" fy="798.21082" gradientUnits="userSpaceOnUse">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.65"/>
    <stop offset="25%"  stop-color="${d.A_lamp}"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.35"/>
  </radialGradient>
  <radialGradient id="lampGrad_B" cx="1523.792" cy="798.21082" r="34.048" fx="1523.792" fy="798.21082" gradientUnits="userSpaceOnUse">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.65"/>
    <stop offset="25%"  stop-color="${d.B_lamp}"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.35"/>
  </radialGradient>
</defs>

<!-- Outer oval (rim) -->
<rect id="outerOval" x="17.21785" y="30.195477" width="1245.5643" height="622.78217" rx="336" fill="url(#rimGrad)" stroke="#ffffff" stroke-width="4.8" stroke-opacity="0.9" style="display:inline;fill:url(#rimGrad)"/>

<!-- Stadium lines -->
<g id="frameLines" transform="matrix(0.8,0,0,0.8,1.5258789e-5,-18.413443)">
  <line x1="1359.6935" y1="300.03058" x2="1501.7794" y2="217.99724" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="1359.6935" y1="599.96942" x2="1501.7794" y2="682.00275" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="240.30647"  y1="300.03058" x2="98.220573"  y2="217.99724" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="240.30647"  y1="599.96942" x2="98.220573"  y2="682.00275" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="1099.9388" y1="749.93884" x2="1099.9388" y2="839.23883" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="1099.9388" y1="150.06114" x2="1099.9388" y2="60.761143"  stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="500.06116"  y1="749.93884" x2="500.06116"  y2="839.23883" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="500.06116"  y1="150.06114" x2="500.06116"  y2="60.761143"  stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5" stroke-linecap="round"/>
</g>

<!-- Inner oval (light gradient) -->
<rect id="innerOval" x="160.09785" y="101.63547" width="959.80432" height="479.90216" rx="248" fill="url(#innerGrad)" style="display:inline;fill:url(#innerGrad);stroke-width:0.8"/>

<!-- Basebar with lamps -->
<g id="basebar" transform="matrix(0.8,0,0,0.8,1.5258789e-5,-18.413443)">
  <rect x="30" y="769.93884" width="1540" height="76" fill="url(#silverGrad)" id="rect10833"/>
  <rect id="rect10834" x="30" y="769.93884" width="770" height="76" fill="none" stroke="${d.A}" stroke-width="4" stroke-opacity="0.7" stroke-linejoin="round" style="display:inline"/>
  <rect id="rect10835" x="800" y="769.93884" width="770" height="76" fill="none" stroke="${d.B}" stroke-width="4" stroke-opacity="0.7" stroke-linejoin="round" style="display:inline"/>
  <text x="320" y="655" text-anchor="middle" font-family="Arial,sans-serif" font-size="25.6" font-weight="bold" fill="${d.A}" fill-opacity="0.85" letter-spacing="1.6">A</text>
  <text x="960" y="655" text-anchor="middle" font-family="Arial,sans-serif" font-size="25.6" font-weight="bold" fill="${d.B}" fill-opacity="0.85" letter-spacing="1.6">B</text>

  <!-- Lamps A (g10841) -->
  <g id="g10841">
    <circle cx="70.857597" cy="810.85724" r="24.8064" fill="#000000" opacity="0.2" id="circle10836"/>
    <circle id="lampA_glow" cx="68.912003" cy="807.93884" r="26.2656" fill="${d.A_lamp}" opacity="0" filter="url(#neonRed)"/>
    <circle id="circle10838" cx="68.912003" cy="807.93884" r="24.32" fill="#0a0a0a" opacity="0.95"/>
    <circle id="circle10839" cx="68.912003" cy="807.93884" r="24.32" fill="url(#lampGrad_A)" opacity="0"/>
    <circle id="circle10840" cx="62.102402" cy="800.64288" r="5.3504" fill="#ffffff" opacity="0.14"/>
    <circle cx="68.912003" cy="807.93884" r="26.32" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="2" opacity="0.95"/>
  </g>

  <!-- Lamps B (g10847) -->
  <g id="g10847">
    <circle cx="1533.0336" cy="810.85724" r="24.8064" fill="#000000" opacity="0.2" id="circle10842"/>
    <circle id="lampB_glow" cx="1531.088" cy="807.93884" r="26.2656" fill="${d.B_lamp}" opacity="0" filter="url(#neonBlue)"/>
    <circle id="circle10844" cx="1531.088" cy="807.93884" r="24.32" fill="#0a0a0a" opacity="0.95"/>
    <circle id="circle10845" cx="1531.088" cy="807.93884" r="24.32" fill="url(#lampGrad_B)" opacity="0"/>
    <circle id="circle10846" cx="1524.2784" cy="800.64288" r="5.3504" fill="#ffffff" opacity="0.14"/>
    <circle cx="1531.088" cy="807.93884" r="26.32" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="2" opacity="0.95"/>
  </g>
</g>

<!-- Watermark -->
<text x="1264" y="691.98657" text-anchor="end" font-family="sans-serif" font-size="14.4" fill="#ffffff" fill-opacity="0.25" letter-spacing="0.5">familiada.online</text>`;
}

function render(svg, bgLayer, d, colors, controls) {
  svg.setAttribute("viewBox", "0 0 1280 720");
  svg.innerHTML = buildSvgContent(d);
  applyControls(svg, controls);
  bgLayer.style.background = computeBg(colors);
}

export function createTheme(baseSvg, bgLayer, config = {}) {
  let colors   = { ...DEFAULT_COLORS, ...config.colors };
  let controls = { A: false, B: false, ...config.controls };

  const derived = computeDerived(colors);
  render(baseSvg, bgLayer, derived, colors, controls);

  return {
    name: "classic",
    displays: {
      big:        { cx: 640,    cy: 341.6 },
      leftPanel:  { cx: 88.7,   cy: 341.6 },
      rightPanel: { cx: 1191.4, cy: 341.6 },
      topPanel:   { cx: 640,    cy: 65.9  },
      long1:      { cx: 356.8,  cy: 628.0 },
      long2:      { cx: 923.2,  cy: 628.0 },
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
