// theme_modern.js


const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
};
const rgbToHex = ({ r, g, b }) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
const mix = (c1, c2, t) => ({ r: Math.round(c1.r + (c2.r - c1.r) * t), g: Math.round(c1.g + (c2.g - c1.g) * t), b: Math.round(c1.b + (c2.b - c1.b) * t) });
const lighten = (c, t) => mix(c, { r: 255, g: 255, b: 255 }, t);
const darken  = (c, t) => mix(c, { r: 0, g: 0, b: 0 }, t);

const DEFAULT_COLORS = { A: "#c4002f", B: "#2a62ff" };

function computeDerived(c) {
  const A = hexToRgb(c.A), B = hexToRgb(c.B);
  return {
    A: c.A,
    B: c.B,
    A_dark:  rgbToHex(darken(A, 0.38)),
    B_dark:  rgbToHex(darken(B, 0.35)),
    A_light: rgbToHex(lighten(A, 0.45)),
    A_mid:   rgbToHex(lighten(A, 0.15)),
    B_light: rgbToHex(lighten(B, 0.45)),
    B_mid:   rgbToHex(lighten(B, 0.15)),
  };
}

function setupLayers(bgLayer) {
  bgLayer.innerHTML = "";
  bgLayer.style.overflow = "hidden";
  return { main: bgLayer };
}

function updateBackground(layer, d, tA, tB, preset) {
  const A = hexToRgb(d.A);
  const B = hexToRgb(d.B);
  const A_dark = hexToRgb(d.A_dark);
  const B_dark = hexToRgb(d.B_dark);
  const A_mid = hexToRgb(d.A_mid);
  const A_light = hexToRgb(d.A_light);
  const B_mid = hexToRgb(d.B_mid);
  const B_light = hexToRgb(d.B_light);

  const c0 = rgbToHex(mix(A, B_light, tB));
  const c1 = rgbToHex(mix(A_dark, B_mid, tB));
  const c2 = rgbToHex(mix(B_dark, A_mid, tA));
  const c3 = rgbToHex(mix(B, A_light, tA));

  layer.style.background = preset.backdrop
    ? `radial-gradient(ellipse at 0% 40%, ${c0}55, transparent 65%), radial-gradient(ellipse at 100% 60%, ${c3}55, transparent 65%), ${preset.backdrop}`
    : `linear-gradient(135deg, ${c0}, ${c1}, ${c2}, ${c3})`;
  layer.style.opacity = "1";
}

// All variants share the same panel geometry, so switching themes preserves
// the board, totals and team names without changing the gameplay renderer.
const PRESETS = {
  modern: { accent: "#ffffff", rim: "#ffffff", radius: 20, stroke: 9, speed: 6 },
  neon: { accent: "#83fff4", rim: "#32e6d4", radius: 14, stroke: 3, speed: 5, backdrop: "#050c20" },
  studio: { accent: "#d4e7ff", rim: "#91a5c0", radius: 5, stroke: 5, speed: 9, backdrop: "#111b2e" },
  gold: { accent: "#ffe8ad", rim: "#d6aa55", radius: 26, stroke: 6, speed: 8, backdrop: "#20150c" },
};
const PANELS = [
  [647.93054, 516.98523, 550.53888, 59.4048],
  [81.530571, 516.98523, 550.53888, 59.4048],
  [18.479759, 291.31412, 190.35648, 92.044792],
  [1069.1637, 291.31412, 190.35648, 92.044792],
  [544.82178, 11.143076, 190.35648, 92.044792],
  [226.32941, 124.91698, 827.34125, 364.83914],
];
const LINE_INSETS = [268, 157, 113, 82, 57, 39, 33, 26, 20, 20, 26, 33, 39, 57, 82, 113, 157, 268];

function buildSvgContent(preset, name) {
  // A thin closed racetrack, rather than a translated rectangle. The gaps
  // travel along the top edge, round the end and back along the lower edge.
  // pathLength normalizes speed across rings of different widths.
  const stripes = LINE_INSETS.map((x, i) =>
    `<rect class="modern-stripe" x="${x}" y="${105.634 + i * 32.707}" width="${1280 - 2 * x}" height="3.4" rx="1.7" pathLength="1000" />`).join("");
  return `<defs>
<linearGradient id="linearGradient12">
    <stop style="stop-color:#000000;stop-opacity:1;" offset="0.47242647" id="stop12" />
    <stop style="stop-color:#000000;stop-opacity:0;" offset="1" id="stop15" />
  </linearGradient>
  <linearGradient href="#linearGradient12" id="linearGradient24" gradientUnits="userSpaceOnUse" x1="640" y1="-454.06543" x2="640" y2="1224.5049" />
  <linearGradient href="#linearGradient12" id="linearGradient25" gradientUnits="userSpaceOnUse" x1="640" y1="-454.06543" x2="640" y2="1224.5049" />
  <linearGradient href="#linearGradient12" id="linearGradient26" gradientUnits="userSpaceOnUse" x1="640" y1="-454.06543" x2="640" y2="1224.5049" />

    <linearGradient id="modern-rim" x2="0" y2="1">
      <stop offset="0" stop-color="${preset.accent}" />
      <stop offset="0.5" stop-color="${preset.rim}" />
      <stop offset="1" stop-color="${preset.accent}" stop-opacity="0.4" />
    </linearGradient>
  </defs>
  <style>
    .modern-stripes { fill: none; stroke: ${preset.accent}; stroke-width: 1.6; opacity: 0.3; }
    .modern-stripe { stroke-dasharray: 400 100; animation: modern-stripe-orbit ${preset.speed}s linear infinite; }
    ${LINE_INSETS.map((_, i) => `.modern-stripe:nth-child(${i + 1}) { animation-delay: -${(i * preset.speed / 18).toFixed(3)}s; }`).join("\n")}
    .modern-frames { fill: #000; stroke: url(#modern-rim); stroke-width: ${preset.stroke}; stroke-opacity: ${name === "modern" ? 0.3 : 0.8}; }
    @keyframes modern-stripe-orbit {
      from { stroke-dashoffset: 0; }
      to { stroke-dashoffset: -1000; }
    }
    @media (prefers-reduced-motion: reduce) {
      .modern-stripe { animation: none; }
    }
  </style>
  <g class="modern-stripes" aria-hidden="true">${stripes}</g>
<g id="g139" inkscape:label="ovals">
  <path id="rect3" style="display:inline;fill:url(#linearGradient24);fill-opacity:1;stroke:none" d="M 170.96484 1 C -34.15309 1 -199.28516 166.1301 -199.28516 371.24805 L -199.28516 399.18945 C -199.28516 604.3074 -34.15309 769.43945 170.96484 769.43945 L 1109.0352 769.43945 C 1314.1531 769.43945 1479.2852 604.3074 1479.2852 399.18945 L 1479.2852 371.24805 C 1479.2852 166.1301 1314.1531 1 1109.0352 1 L 170.96484 1 z M 565.0625 6.5410156 L 714.9375 6.5410156 C 728.7875 6.5410156 739.9375 17.691016 739.9375 31.541016 L 739.9375 38.460938 L 1063.3047 38.460938 C 1248.4236 38.460938 1397.4551 187.49238 1397.4551 372.61133 L 1397.4551 397.82812 C 1397.4551 582.94708 1248.4236 731.97656 1063.3047 731.97656 L 216.69531 731.97656 C 31.576371 731.97656 -117.45313 582.94707 -117.45312 397.82812 L -117.45312 372.61133 C -117.45312 187.49238 31.576371 38.460937 216.69531 38.460938 L 540.0625 38.460938 L 540.0625 31.541016 C 540.0625 17.691016 551.2125 6.5410156 565.0625 6.5410156 z " />
  <path id="rect2" style="display:inline;fill:url(#linearGradient25);fill-opacity:1;stroke:none" d="M 220.92969 41.929688 C 37.661927 41.929688 -109.87891 189.46857 -109.87891 372.73633 L -109.87891 397.70117 C -109.87891 580.96893 37.661926 728.50977 220.92969 728.50977 L 1059.0723 728.50977 C 1242.34 728.50977 1389.8809 580.96893 1389.8809 397.70117 L 1389.8809 372.73633 C 1389.8809 189.46857 1242.34 41.929688 1059.0723 41.929688 L 739.9375 41.929688 L 739.9375 73.136719 L 1020.9746 73.136719 C 1187.5817 73.136719 1321.709 207.26405 1321.709 373.87109 L 1321.709 396.56641 C 1321.709 563.17345 1187.5817 697.30078 1020.9746 697.30078 L 259.02539 697.30078 C 92.418345 697.30078 -41.708984 563.17345 -41.708984 396.56641 L -41.708984 373.87109 C -41.708984 207.26405 92.418345 73.136719 259.02539 73.136719 L 540.0625 73.136719 L 540.0625 41.929688 L 220.92969 41.929688 z " />
  <path id="rect5" style="display:inline;fill:url(#linearGradient26);fill-opacity:1;stroke:none" d="M 264.74023 77.818359 C 100.63229 77.818359 -31.482422 209.93503 -31.482422 374.04297 L -31.482422 396.39648 C -31.482422 560.50443 100.63229 692.62109 264.74023 692.62109 L 1015.2598 692.62109 C 1179.3677 692.62109 1311.4844 560.50443 1311.4844 396.39648 L 1311.4844 374.04297 C 1311.4844 209.93503 1179.3677 77.818359 1015.2598 77.818359 L 739.9375 77.818359 L 739.9375 82.791016 C 739.9375 87.642004 738.56987 92.160868 736.19727 95.986328 L 993.08203 95.986328 C 1147.4912 95.986328 1271.7988 220.29398 1271.7988 374.70312 L 1271.7988 395.73633 C 1271.7988 550.14548 1147.4912 674.45313 993.08203 674.45312 L 286.91797 674.45312 C 132.50881 674.45312 8.2011719 550.14548 8.2011719 395.73633 L 8.2011719 374.70312 C 8.2011719 220.29397 132.50881 95.986328 286.91797 95.986328 L 543.80273 95.986328 C 541.43013 92.160868 540.0625 87.642004 540.0625 82.791016 L 540.0625 77.818359 L 264.74023 77.818359 z " />
</g>

  <g class="modern-frames">${PANELS.map(([x, y, w, h]) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${preset.radius}" />`).join("")}</g>
  <text x="1078" y="654" text-anchor="end" font-family="sans-serif" font-size="14.4" fill="${preset.accent}" fill-opacity="0.25" letter-spacing="0.5">familiada.online</text>`;
}

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createModernTheme(baseSvg, bgLayer, config, "modern");
}

export function createModernTheme(baseSvg, bgLayer, config = {}, name = "modern") {
  const preset = PRESETS[name];
  const colors = { ...DEFAULT_COLORS, ...config.colors };
  const controls = { A: false, B: false, ...config.controls };
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  let currentA = controls.A ? 1 : 0;
  let currentB = controls.B ? 1 : 0;
  let animId = null;
  let previousTime = null;
  let destroyed = false;
  const layers = setupLayers(bgLayer);
  baseSvg.setAttribute("viewBox", "0 0 1280 720");
  baseSvg.setAttribute("data-display-theme", name);
  baseSvg.innerHTML = buildSvgContent(preset, name);

  function paint() {
    updateBackground(layers.main, computeDerived(colors), currentA, currentB, preset);
  }
  function startAnimation() {
    if (destroyed) return;
    if (reducedMotion?.matches) {
      if (animId !== null) cancelAnimationFrame(animId);
      animId = null;
      previousTime = null;
      currentA = controls.A ? 1 : 0;
      currentB = controls.B ? 1 : 0;
      paint();
      return;
    }
    if (animId !== null) return;
    const tick = (now) => {
      if (destroyed) return;
      // Frame-rate independent easing: the same transition on a TV at 30 Hz
      // and on a desktop at 120 Hz. No continuous JavaScript loop at rest.
      const delta = previousTime === null ? 16.67 : Math.min(now - previousTime, 64);
      previousTime = now;
      const step = 1 - Math.exp(-delta / 180);
      const targetA = controls.A ? 1 : 0;
      const targetB = controls.B ? 1 : 0;
      currentA += (targetA - currentA) * step;
      currentB += (targetB - currentB) * step;
      const changed = Math.abs(currentA - targetA) > 0.001 || Math.abs(currentB - targetB) > 0.001;
      if (!changed) { currentA = targetA; currentB = targetB; }
      paint();
      animId = changed ? requestAnimationFrame(tick) : null;
      if (!changed) previousTime = null;
    };
    animId = requestAnimationFrame(tick);
  }
  paint();

  return {
    name,
    displays: {
      big:        { cx: 640.0,    cy: 307.33656 },
      leftPanel:  { cx: 113.658,  cy: 337.33654 },
      rightPanel: { cx: 1164.342, cy: 337.33654 },
      topPanel:   { cx: 640.0,    cy: 57.165475 },
      long1:      { cx: 356.8,    cy: 546.68763 },
      long2:      { cx: 923.2,    cy: 546.68763 },
    },
    multiplier: 1.0,
    updateColors(newColors) {
      Object.assign(colors, newColors);
      paint();
    },
    updateControls(newControls) {
      Object.assign(controls, newControls);
      startAnimation();
    },
    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
    destroy() {
      destroyed = true;
      if (animId !== null) cancelAnimationFrame(animId);
      animId = null;
    },
  };
}
