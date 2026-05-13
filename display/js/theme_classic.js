// theme_classic.js
const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
};
const rgbToHex = ({ r, g, b }) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
const mix = (c1, c2, t) => ({ r: Math.round(c1.r + (c2.r - c1.r) * t), g: Math.round(c1.g + (c2.g - c1.g) * t), b: Math.round(c1.b + (c2.b - c1.b) * t) });
const lighten = (c, t) => mix(c, { r: 255, g: 255, b: 255 }, t);
const darken  = (c, t) => mix(c, { r: 0, g: 0, b: 0 }, t);

const DEFAULT_COLORS = { A: "#c4002f", B: "#2a62ff", BG: "#d21180" };

function computeDerived(c) {
  return {
    A: c.A,
    B: c.B,
    BG: c.BG,
    A_dark: rgbToHex(darken(hexToRgb(c.A), 0.38)),
    B_dark: rgbToHex(darken(hexToRgb(c.B), 0.35)),
  };
}

function computeBg(c) {
  const G = hexToRgb(c.BG);
  const top = lighten(G, 0.18);
  const mid = lighten(G, 0.05);
  const bot = darken(G, 0.55);
  return `radial-gradient(150vw 90vh at 50% 25%, ${rgbToHex(top)} 0%, ${rgbToHex(mid)} 30%, ${rgbToHex(G)} 55%, ${rgbToHex(bot)} 100%)`;
}

function applyControls(svg, controls, d) {
  const OFF_COLOR = "#2e2e32";
  if (!d) return;
  
  // Tylko grupy indykatorów g7 (A) i g6 (B) są dynamiczne
  const indicatorMap = { A: "g7", B: "g6" };
  for (const [side, id] of Object.entries(indicatorMap)) {
    const on = controls[side] === true;
    const color = on ? d[side] : OFF_COLOR;
    const el = svg.querySelector(`#${id}`);
    if (el) {
      el.querySelectorAll("circle, rect, path").forEach(child => child.setAttribute("fill", color));
    }
  }
}

function buildSvgContent(d) {
  return `<defs id="defs11">
  <!-- RIM GRADIENT -->
  <linearGradient
       id="rimGrad"
       x1="13.12235"
       y1="81.530251"
       x2="1120.418"
       y2="81.530251"
       gradientTransform="matrix(1.1292055,0,0,0.56677018,1.5258789e-5,-18.413443)"
       gradientUnits="userSpaceOnUse">
    <stop offset="0"    stop-color="${d.A}"/>
    <stop offset="0.35" stop-color="${d.A_dark}"/>
    <stop offset="0.65" stop-color="${d.B_dark}"/>
    <stop offset="1"    stop-color="${d.B}"/>
  </linearGradient>

  <linearGradient id="innerGrad" x1="141.50781" y1="212.21851" x2="141.50781" y2="1060.5737" gradientTransform="matrix(1.1313709,0,0,0.56568542,1.5258789e-5,-18.413443)" gradientUnits="userSpaceOnUse">
    <stop offset="0"   stop-color="#e6eaef" />
    <stop offset="1" stop-color="#bfc7cf" />
  </linearGradient>

  <linearGradient id="silverGrad" x1="6.6645017" y1="3465.8503" x2="6.6645017" y2="3807.9612" gradientTransform="scale(4.5014618,0.22215006)" gradientUnits="userSpaceOnUse">
    <stop offset="0"    stop-color="#f6f7f9" />
    <stop offset="0.55" stop-color="#d1d5db" />
    <stop offset="1"    stop-color="#aab1bb" />
  </linearGradient>
</defs>

<!-- OWAL ZEWNĘTRZNY -->
<rect id="outerOval" x="17.21785" y="30.195477" width="1245.5643" height="622.78217" rx="336" fill="url(#rimGrad)" stroke="#ffffff" stroke-width="4.8" stroke-opacity="0.9" />

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

<rect id="innerOval" x="160.09785" y="101.63547" width="959.80432" height="479.90216" rx="248" fill="url(#innerGrad)" style="stroke-width:0.8"/>

<g id="basebar" transform="matrix(0.8,0,0,0.8,1.5258789e-5,-18.413443)">
  <rect x="30" y="769.93884" width="1540" height="76" fill="url(#silverGrad)" id="rect10833" />
  <rect id="rect10834" x="30" y="769.93884" width="770" height="76" fill="none" stroke="${d.A}" stroke-width="6" stroke-opacity="0.55" stroke-linejoin="round" />
  <rect id="rect10835" x="800" y="769.93884" width="770" height="76" fill="none" stroke="${d.B}" stroke-width="6" stroke-opacity="0.55" stroke-linejoin="round" />

  <rect x="1486" y="781.93884" width="66" height="52" rx="0" fill="#000000" id="rect4" />
  <g id="g4" transform="translate(71,1.25e-5)">
    <circle cx="1420" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="1427" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="1434" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="1469" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="1476" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="1420" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="1427" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="1476" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="1420" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="1420" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="1420" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="1420" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="1427" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="1476" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="1420" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="1427" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="1434" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="1469" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="1476" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="1462" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="1469" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="1476" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="1476" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="1476" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="1469" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="1462" cy="828.93884" r="3" fill="#2e2e32" />
  </g>
  <g id="g6" transform="matrix(1.25,0,0,1.25,0,23.016813)">
    <circle cx="1441" cy="786.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1434" cy="793.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1427" cy="800.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1427" cy="807.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1427" cy="814.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1434" cy="821.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1441" cy="828.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1448" cy="786.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1455" cy="786.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1441" cy="793.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1448" cy="793.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1455" cy="793.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1462" cy="793.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1434" cy="800.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1441" cy="800.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1448" cy="800.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1455" cy="800.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1462" cy="800.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1469" cy="800.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1434" cy="807.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1441" cy="807.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1448" cy="807.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1455" cy="807.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1462" cy="807.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1469" cy="807.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1434" cy="814.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1441" cy="814.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1448" cy="814.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1455" cy="814.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1462" cy="814.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1469" cy="814.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1441" cy="821.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1448" cy="821.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1455" cy="821.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1462" cy="821.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1448" cy="828.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
    <circle cx="1455" cy="828.93884" r="3" fill="#2e2e32" transform="matrix(0.8,0,0,0.8,56.8,-18.41344)" />
  </g>

  <rect x="48.25" y="781.93884" width="66" height="52" rx="0" fill="#000000" id="rect5" />
  <g id="g3" transform="translate(-71,1.25e-5)">
    <circle cx="124" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="131" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="166" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="173" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="180" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="124" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="173" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="180" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="180" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="180" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="180" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="124" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="173" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="180" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="124" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="131" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="166" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="173" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="180" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="138" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="131" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="124" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="124" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="124" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="131" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="138" cy="828.93884" r="3" fill="#2e2e32" />
  </g>
  <g id="g7" transform="translate(-71,1.25e-5)">
    <circle cx="159" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="166" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="173" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="173" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="173" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="166" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="159" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="145" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="152" cy="786.93884" r="3" fill="#2e2e32" />
    <circle cx="138" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="145" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="152" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="159" cy="793.93884" r="3" fill="#2e2e32" />
    <circle cx="131" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="138" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="145" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="152" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="159" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="166" cy="800.93884" r="3" fill="#2e2e32" />
    <circle cx="131" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="138" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="145" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="152" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="159" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="166" cy="807.93884" r="3" fill="#2e2e32" />
    <circle cx="131" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="138" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="145" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="152" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="159" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="166" cy="814.93884" r="3" fill="#2e2e32" />
    <circle cx="138" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="145" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="152" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="159" cy="821.93884" r="3" fill="#2e2e32" />
    <circle cx="145" cy="828.93884" r="3" fill="#2e2e32" />
    <circle cx="152" cy="828.93884" r="3" fill="#2e2e32" />
  </g>
</g>

<text x="1264" y="691.98657" text-anchor="end" font-family="sans-serif" font-size="14.4" fill="#ffffff" fill-opacity="0.25" letter-spacing="0.5">familiada.online</text>`;
}

function render(svg, bgLayer, d, colors, controls) {
  svg.setAttribute("viewBox", "0 0 1280 720");
  svg.innerHTML = buildSvgContent(d);
  applyControls(svg, controls, d);
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
      applyControls(baseSvg, controls, computeDerived(colors));
    },
    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
  };
}
