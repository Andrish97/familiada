// theme_classic.js
// Klasyczny motyw – SVG 1280×720 (przeskalowane z 1600×900)

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
    A_dark: rgbToHex(darken(A, 0.38)),
    B_dark: rgbToHex(darken(B, 0.35)),
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
    { id: "lampA_glow",      attr: "opacity", on: "0.85", off: "0" },
    { id: "lampA_on",        attr: "opacity", on: "0.98", off: "0" },
    { id: "lampA_off",       attr: "opacity", on: "0.20", off: "0.92" },
    { id: "lampA_highlight", attr: "opacity", on: "0.28", off: "0.14" },
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

function buildSvgContent(d) {
  return `<defs>
  <linearGradient id="rimGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0"    stop-color="${d.A}"/>
    <stop offset="0.35" stop-color="${d.A_dark}"/>
    <stop offset="0.65" stop-color="${d.B_dark}"/>
    <stop offset="1"    stop-color="${d.B}"/>
  </linearGradient>
  <linearGradient id="innerGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"   stop-color="#e6eaef"/>
    <stop offset="1" stop-color="#bfc7cf"/>
  </linearGradient>
  <linearGradient id="silverGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"    stop-color="#f6f7f9"/>
    <stop offset="0.55" stop-color="#d1d5db"/>
    <stop offset="1"    stop-color="#aab1bb"/>
  </linearGradient>
  <filter id="neonBlue" x="-60%" y="-120%" width="220%" height="340%">
    <feDropShadow dx="0" dy="0" stdDeviation="4"  flood-color="${d.B_glow}" flood-opacity="0.95"/>
    <feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="${d.B_glow}" flood-opacity="0.60"/>
  </filter>
  <radialGradient id="lampGrad_A" cx="35%" cy="30%" r="70%">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.65"/>
    <stop offset="25%"  stop-color="${d.A_lamp}"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.35"/>
  </radialGradient>
  <radialGradient id="lampGrad_B" cx="35%" cy="30%" r="70%">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.65"/>
    <stop offset="25%"  stop-color="${d.B_lamp}"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.35"/>
  </radialGradient>
</defs>

<!-- Outer oval (rim) -->
<rect id="outerOval" x="17.2" y="48.6" width="1245.6" height="622.8" rx="336" fill="url(#rimGrad)" stroke="#ffffff" stroke-width="4.8" stroke-opacity="0.9"/>

<!-- Stadium lines -->
<g id="frameLines">
  <line x1="1087.8" y1="240"    x2="1201.4" y2="174.4" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3.6" stroke-linecap="round"/>
  <line x1="1087.8" y1="480"    x2="1201.4" y2="645.6" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3.6" stroke-linecap="round"/>
  <line x1="192.2"  y1="240"    x2="78.6"   y2="174.4" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3.6" stroke-linecap="round"/>
  <line x1="192.2"  y1="480"    x2="78.6"   y2="645.6" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3.6" stroke-linecap="round"/>
  <line x1="880"    y1="600"    x2="880"   y2="671.4" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3.6" stroke-linecap="round"/>
  <line x1="880"    y1="120"    x2="880"   y2="48.6"  stroke="#ffffff" stroke-opacity="0.9" stroke-width="3.6" stroke-linecap="round"/>
  <line x1="400"    y1="600"    x2="400"   y2="671.4" stroke="#ffffff" stroke-opacity="0.9" stroke-width="3.6" stroke-linecap="round"/>
  <line x1="400"    y1="120"    x2="400"   y2="48.6"  stroke="#ffffff" stroke-opacity="0.9" stroke-width="3.6" stroke-linecap="round"/>
</g>

<!-- Inner oval -->
<rect id="innerOval" x="160" y="120" width="960" height="480" rx="248" fill="url(#innerGrad)"/>

<!-- Basebar -->
<g id="basebar">
  <rect x="24" y="616" width="1232" height="60.8" fill="url(#silverGrad)"/>
  <rect id="basebarOutlineA" x="24" y="616" width="616" height="60.8" fill="none" stroke="${d.A}" stroke-width="4.8" stroke-opacity="0.55" stroke-linejoin="round"/>
  <rect id="basebarOutlineB" x="640" y="616" width="616" height="60.8" fill="none" stroke="${d.B}" stroke-width="4.8" stroke-opacity="0.55" stroke-linejoin="round"/>
  <rect x="25" y="617" width="1230" height="58.8" fill="none" stroke="#f6f7f9" stroke-width="1.2" stroke-opacity="0.7"/>
  <text x="320" y="655" text-anchor="middle" font-family="Arial, sans-serif" font-size="25.6" font-weight="bold" fill="${d.A}" fill-opacity="0.85" letter-spacing="1.6">A</text>
  <text x="960" y="655" text-anchor="middle" font-family="Arial, sans-serif" font-size="25.6" font-weight="bold" fill="${d.B}" fill-opacity="0.85" letter-spacing="1.6">B</text>
</g>

<!-- Lamps A -->
<g id="lampA">
  <circle cx="56.7" cy="648.8" r="19.84" fill="#000" opacity="0.20"/>
  <circle id="lampA_glow" cx="55.1" cy="646.4" r="21.12" fill="${d.A_lamp}" opacity="0" filter="url(#neonBlue)"/>
  <circle id="lampA_off" cx="55.1" cy="646.4" r="19.2" fill="#0a0a0a" opacity="0.92"/>
  <circle id="lampA_on" cx="55.1" cy="646.4" r="19.2" fill="url(#lampGrad_A)" opacity="0"/>
  <circle id="lampA_highlight" cx="49.7" cy="640.5" r="4.28" fill="#fff" opacity="0.14"/>
  <circle cx="55.1" cy="646.4" r="21.06" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="1.6" opacity="0.95"/>
</g>

<!-- Lamps B -->
<g id="lampB">
  <circle cx="1225.4" cy="648.8" r="19.84" fill="#000" opacity="0.20"/>
  <circle id="lampB_glow" cx="1224.9" cy="646.4" r="21.12" fill="${d.B_lamp}" opacity="0" filter="url(#neonBlue)"/>
  <circle id="lampB_off" cx="1224.9" cy="646.4" r="19.2" fill="#0a0a0a" opacity="0.92"/>
  <circle id="lampB_on" cx="1224.9" cy="646.4" r="19.2" fill="url(#lampGrad_B)" opacity="0"/>
  <circle id="lampB_highlight" cx="1219.4" cy="640.5" r="4.28" fill="#fff" opacity="0.14"/>
  <circle cx="1224.9" cy="646.4" r="21.06" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="1.6" opacity="0.95"/>
</g>

<!-- Display rectangles (dark panels) -->
<rect id="big"        x="234.4" y="186.4" width="811.2" height="347.2" rx="0" fill="#2e2e32"/>
<rect id="leftPanel"  x="2.3"   y="322.4" width="172.8" height="75.2"  rx="0" fill="#2e2e32"/>
<rect id="rightPanel" x="1105.4" y="322.4" width="172.8" height="75.2"  rx="0" fill="#2e2e32"/>
<rect id="topPanel"   x="553.6" y="46.7"  width="172.8" height="75.2"  rx="0" fill="#2e2e32"/>
<rect id="long1"      x="89.6"  y="625.6" width="534.4" height="41.6"  rx="0" fill="#2e2e32"/>
<rect id="long2"      x="656"   y="625.6" width="534.4" height="41.6"  rx="0" fill="#2e2e32"/>

<!-- Watermark -->
<text x="1260" y="708" text-anchor="end" font-family="sans-serif" font-size="14.4" fill="#ffffff" fill-opacity="0.25" letter-spacing="0.4">familiada.online</text>`;
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
      big:        { cx: 640,    cy: 360   },
      leftPanel:  { cx: 88.7,   cy: 360   },
      rightPanel: { cx: 1191.4, cy: 360   },
      topPanel:   { cx: 640,    cy: 84.3  },
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
