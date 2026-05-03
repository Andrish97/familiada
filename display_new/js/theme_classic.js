// theme_classic.js
// Klasyczny motyw – 3 sekcje: kolory → SVG template → współrzędne

// ============================================================
// 1. KOLOWE (input + derived)
// ============================================================
const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
};
const rgbToHex = ({ r, g, b }) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
const mix = (c1, c2, t) => ({ r: Math.round(c1.r + (c2.r - c1.r) * t), g: Math.round(c1.g + (c2.g - c1.g) * t), b: Math.round(c1.b + (c2.b - c1.b) * t) });
const lighten = (c, t) => mix(c, { r: 255, g: 255, b: 255 }, t);
const darken  = (c, t) => mix(c, { r: 0, g: 0, b: 0 }, t);

const DEFAULT_COLORS = { A: "#c4002f", B: "#2a62ff", BG: "#d21180" };

// ============================================================
// 1b. TŁO – dowolna deklaracja CSS background
// ============================================================

// Funkcja przyjmuje kolory bazowe, zwraca string CSS dla .layer-bg
// Może to być solid, gradient, url(), cokolwiek:
//   background: "#1a1a2e"
//   background: "linear-gradient(to bottom, #0f0c29, #302b63, #24243e)"
//   background: "radial-gradient(1400px 700px at 50% 25%, #e00 0%, #000 100%)"
function computeBg(c) {
  const G = hexToRgb(c.BG);
  const top = lighten(G, 0.18);
  const mid = lighten(G, 0.05);
  const bot = darken(G, 0.55);
  return `radial-gradient(150vw 90vh at 50% 25%, ${rgbToHex(top)} 0%, ${rgbToHex(mid)} 30%, ${rgbToHex(G)} 55%, ${rgbToHex(bot)} 100%)`;
}

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
// 2. SVG TEMPLATE – zmienne zamiast kolorów w niektórych miejscach
// ============================================================
function buildSvgContent(d) {
  return `<defs>
  <linearGradient id="rimGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0"    stop-color="${d.A}"/>
    <stop offset="0.35" stop-color="${d.A_dark}"/>
    <stop offset="0.65" stop-color="${d.B_dark}"/>
    <stop offset="1"    stop-color="${d.B}"/>
  </linearGradient>
  <linearGradient id="rimShine" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"   stop-color="#ffffff" stop-opacity="0.25"/>
    <stop offset="45%"  stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="55%"  stop-color="#000000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>
  </linearGradient>
  <linearGradient id="innerGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"   stop-color="#e6eaef"/>
    <stop offset="0.4" stop-color="#d1d8e0"/>
    <stop offset="1"   stop-color="#bfc7cf"/>
  </linearGradient>
  <linearGradient id="innerShine" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"   stop-color="#ffffff" stop-opacity="0.35"/>
    <stop offset="35%" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="1"   stop-color="#000000" stop-opacity="0.08"/>
  </linearGradient>
  <linearGradient id="silverGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0"    stop-color="#f6f7f9"/>
    <stop offset="0.45" stop-color="#e0e3e8"/>
    <stop offset="0.55" stop-color="#c8cdd5"/>
    <stop offset="1"    stop-color="#aab1bb"/>
  </linearGradient>
  <filter id="neonBlue" x="-60%" y="-120%" width="220%" height="340%">
    <feDropShadow id="neonDS1" dx="0" dy="0" stdDeviation="4"  flood-color="${d.B_glow}" flood-opacity="0.95"/>
    <feDropShadow id="neonDS2" dx="0" dy="0" stdDeviation="10" flood-color="${d.B_glow}" flood-opacity="0.60"/>
  </filter>
  <radialGradient id="lampGrad_A" cx="35%" cy="30%" r="70%">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.7"/>
    <stop offset="20%"  stop-color="${d.A_lamp}"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.4"/>
  </radialGradient>
  <radialGradient id="lampGrad_B" cx="35%" cy="30%" r="70%">
    <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.7"/>
    <stop offset="20%"  stop-color="${d.B_lamp}"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.4"/>
  </radialGradient>
</defs>

<!-- Owale -->
<rect id="outerOval" x="-1.1" y="39.4" width="1282.2" height="641.1" rx="320.6" fill="url(#rimGrad)"/>
<rect x="0" y="40" width="1280" height="640" rx="320" fill="none" stroke="url(#rimShine)" stroke-width="8" stroke-opacity="0.7"/>
<rect id="innerOval" x="160" y="120" width="960" height="480" rx="240" fill="url(#innerGrad)"/>
<rect x="162" y="122" width="956" height="476" rx="238" fill="none" stroke="url(#innerShine)" stroke-width="4" stroke-opacity="0.5"/>

<!-- Linie stadionu -->
<g id="frameLines" stroke-linecap="round">
  <line x1="1087.9" y1="240"   x2="1215.8" y2="166.1" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5"/>
  <line x1="1087.9" y1="480"   x2="1215.8" y2="553.9" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5"/>
  <line x1="192.2"  y1="240"   x2="64.2"    y2="166.1" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5"/>
  <line x1="192.2"  y1="480"   x2="64.2"    y2="553.9" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5"/>
  <line x1="880"    y1="600"   x2="880"     y2="680.6" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5"/>
  <line x1="880"    y1="120"   x2="880"     y2="39.4"  stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5"/>
  <line x1="400"    y1="600"   x2="400"     y2="680.6" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5"/>
  <line x1="400"    y1="120"   x2="400"     y2="39.4"  stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.5"/>
</g>

<!-- Basebar -->
<rect x="24" y="616" width="1232" height="60.8" fill="url(#silverGrad)"/>
<rect id="basebarOutlineA" x="24" y="616" width="616" height="60.8" fill="none" stroke="${d.A}" stroke-width="6" stroke-opacity="0.55" stroke-linejoin="round"/>
<rect id="basebarOutlineB" x="640" y="616" width="616" height="60.8" fill="none" stroke="${d.B}" stroke-width="6" stroke-opacity="0.55" stroke-linejoin="round"/>
<rect x="25" y="617" width="1230" height="58.8" fill="none" stroke="#f6f7f9" stroke-width="1.5" stroke-opacity="0.7"/>
<text x="320" y="655" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="${d.A}" fill-opacity="0.85" letter-spacing="2">A</text>
<text x="960" y="655" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="${d.B}" fill-opacity="0.85" letter-spacing="2">B</text>

<!-- Lampki -->
<g id="lampA">
  <circle cx="68.16" cy="646.4" r="20.01" fill="#000" opacity="0.20"/>
  <circle id="lampA_glow" cx="66.56" cy="644.48" r="21.61" fill="${d.A_lamp}" opacity="0"   filter="url(#neonBlue)"/>
  <circle id="lampA_off"  cx="66.56" cy="644.48" r="19.2"  fill="#0a0a0a"  opacity="0.92"/>
  <circle id="lampA_on"   cx="66.56" cy="644.48" r="19.2"  fill="url(#lampGrad_A)" opacity="0"/>
  <circle id="lampA_highlight" cx="61.18" cy="638.72" r="4.22" fill="#fff" opacity="0.14"/>
  <circle cx="66.56" cy="644.48" r="21.2" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="2" opacity="0.95"/>
  <circle cx="66.56" cy="644.48" r="19.2" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
</g>
<g id="lampB">
  <circle cx="1213.44" cy="646.4" r="20.01" fill="#000" opacity="0.20"/>
  <circle id="lampB_glow" cx="1211.84" cy="644.48" r="21.61" fill="${d.B_lamp}" opacity="0"   filter="url(#neonBlue)"/>
  <circle id="lampB_off"  cx="1211.84" cy="644.48" r="19.2"  fill="#0a0a0a"  opacity="0.92"/>
  <circle id="lampB_on"   cx="1211.84" cy="644.48" r="19.2"  fill="url(#lampGrad_B)" opacity="0"/>
  <circle id="lampB_highlight" cx="1206.46" cy="638.72" r="4.22" fill="#fff" opacity="0.14"/>
  <circle cx="1211.84" cy="644.48" r="21.2" fill="none" stroke="rgba(255,255,255,0.42)" stroke-width="2" opacity="0.95"/>
  <circle cx="1211.84" cy="644.48" r="19.2" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
</g>

<!-- Watermark -->
<text x="1260" y="708" text-anchor="end" font-family="sans-serif" font-size="18" fill="#ffffff" fill-opacity="0.25" letter-spacing="0.5">familiada.online</text>`;
}

// ============================================================
// 3. KONTROLKI – które elementy SVG zmieniają opacity przy ON/OFF
// ============================================================
const CONTROLS = {
  A: [
    { id: "lampA_glow",      attr: "opacity", on: "0.85", off: "0" },
    { id: "lampA_off",       attr: "opacity", on: "0.20", off: "0.92" },
    { id: "lampA_on",        attr: "opacity", on: "0.98", off: "0" },
    { id: "lampA_highlight", attr: "opacity", on: "0.28", off: "0.14" },
  ],
  B: [
    { id: "lampB_glow",      attr: "opacity", on: "0.85", off: "0" },
    { id: "lampB_off",       attr: "opacity", on: "0.20", off: "0.92" },
    { id: "lampB_on",        attr: "opacity", on: "0.98", off: "0" },
    { id: "lampB_highlight", attr: "opacity", on: "0.28", off: "0.14" },
  ],
};

function applyControls(svg, controls) {
  for (const side of ["A", "B"]) {
    const on = controls[side] === true;
    for (const entry of CONTROLS[side]) {
      const el = svg.querySelector(`#${entry.id}`);
      if (!el) continue;
      el.setAttribute(entry.attr, on ? entry.on : entry.off);
    }
  }
}

function render(svg, bgLayer, d, colors, controls) {
  svg.setAttribute("viewBox", "0 0 1280 720");
  svg.innerHTML = buildSvgContent(d);
  applyControls(svg, controls);
  bgLayer.style.background = computeBg(colors);
}

// ============================================================
// 4. WSPÓŁRZĘDNE WYŚWIETLACZY – sztywne 1280×720
// ============================================================
export function createTheme(baseSvg, bgLayer, config = {}) {
  let colors   = { ...DEFAULT_COLORS, ...config.colors };
  let controls = { A: false, B: false, ...config.controls };

  const derived = computeDerived(colors);
  render(baseSvg, bgLayer, derived, colors, controls);

  return {
    name: "classic",
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
