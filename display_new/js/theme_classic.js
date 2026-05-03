// theme_classic.js
// Klasyczny motif – statyczne SVG w HTML, w JS wyłącznie aktualizacja kolorów i kontrolek

const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
};

const rgbToHex = ({ r, g, b }) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
const mix = (c1, c2, t) => ({ r: Math.round(c1.r + (c2.r - c1.r) * t), g: Math.round(c1.g + (c2.g - c1.g) * t), b: Math.round(c1.b + (c2.b - c1.b) * t) });
const lighten = (c, t) => mix(c, { r: 255, g: 255, b: 255 }, t);
const darken = (c, t) => mix(c, { r: 0, g: 0, b: 0 }, t);

function computeDerived(colors) {
  const A = hexToRgb(colors.A), B = hexToRgb(colors.B), G = hexToRgb(colors.BG);
  const bg0 = lighten(G, 0.10);
  const bg1 = mix(G, darken(G, 0.75), 0.55);
  const aAcc = mix(bg0, A, 0.18), bAcc = mix(bg0, B, 0.16);
  return {
    A_dark: rgbToHex(darken(A, 0.38)),
    B_dark: rgbToHex(darken(B, 0.35)),
    A_lamp: rgbToHex(lighten(A, 0.25)),
    B_lamp: rgbToHex(lighten(B, 0.18)),
    B_glow: rgbToHex(lighten(B, 0.28)),
    bgGradient: `radial-gradient(1400px 700px at 50% 25%, ${rgbToHex(mix(aAcc, bAcc, 0.50))} 0%, ${rgbToHex(bg0)} 30%, ${rgbToHex(bg1)} 70%, ${rgbToHex(darken(G, 0.85))} 100%)`,
  };
}

function applyColors(svg, bgLayer, colors, derived) {
  // Rim gradient stops
  const s0 = svg.querySelector("#rimStop0");
  const s1 = svg.querySelector("#rimStop1");
  const s2 = svg.querySelector("#rimStop2");
  const s3 = svg.querySelector("#rimStop3");
  if (s0) s0.setAttribute("stop-color", colors.A);
  if (s1) s1.setAttribute("stop-color", derived.A_dark);
  if (s2) s2.setAttribute("stop-color", derived.B_dark);
  if (s3) s3.setAttribute("stop-color", colors.B);

  // Neon glow filter
  const ds1 = svg.querySelector("#neonDS1");
  const ds2 = svg.querySelector("#neonDS2");
  if (ds1) { ds1.setAttribute("flood-color", derived.B_glow); ds1.setAttribute("flood-opacity", "0.95"); }
  if (ds2) { ds2.setAttribute("flood-color", derived.B_glow); ds2.setAttribute("flood-opacity", "0.60"); }

  // Basebar outlines
  const obA = svg.querySelector("#basebarOutlineA");
  const obB = svg.querySelector("#basebarOutlineB");
  if (obA) obA.setAttribute("stroke", colors.A);
  if (obB) obB.setAttribute("stroke", colors.B);

  // Lamp gradients
  for (const id of ["A", "B"]) {
    const lampColor = id === "A" ? derived.A_lamp : derived.B_lamp;
    const grad = svg.querySelector(`#lampGrad_${id}`);
    if (!grad) continue;
    const stops = grad.querySelectorAll("stop");
    if (stops[1]) stops[1].setAttribute("stop-color", lampColor);
  }

  // Lamp glow circles (color, opacity updated in applyControls)
  for (const id of ["A", "B"]) {
    const lampColor = id === "A" ? derived.A_lamp : derived.B_lamp;
    const glow = svg.querySelector(`#lamp${id}_glow`);
    if (glow) glow.setAttribute("fill", lampColor);
  }

  // Background
  bgLayer.style.background = derived.bgGradient;
}

function applyControls(svg, controls) {
  for (const id of ["A", "B"]) {
    const on = controls[id] === true;
    const glow     = svg.querySelector(`#lamp${id}_glow`);
    const off      = svg.querySelector(`#lamp${id}_off`);
    const onCircle = svg.querySelector(`#lamp${id}_on`);
    const highlight= svg.querySelector(`#lamp${id}_highlight`);
    if (glow)      glow.setAttribute("opacity", on ? "0.85" : "0");
    if (off)       off.setAttribute("opacity", on ? "0.20" : "0.92");
    if (onCircle)  onCircle.setAttribute("opacity", on ? "0.98" : "0");
    if (highlight) highlight.setAttribute("opacity", on ? "0.28" : "0.14");
  }
}

export function createTheme(baseSvg, bgLayer, config = {}) {
  let colors = { A: config.colors?.A ?? "#c4002f", B: config.colors?.B ?? "#2a62ff", BG: config.colors?.BG ?? "#d21180" };
  let controls = { A: config.controls?.A ?? false, B: config.controls?.B ?? false };

  let derived = computeDerived(colors);
  applyColors(baseSvg, bgLayer, colors, derived);
  applyControls(baseSvg, controls);

  return {
    name: "classic",
    displays: {
      big:       { cx: 640,   cy: 360   },
      leftPanel: { cx: 79.4,  cy: 360   },
      rightPanel:{ cx: 1200.6, cy: 360  },
      topPanel:  { cx: 640,   cy: 79.7  },
      long1:     { cx: 356.8, cy: 646.4 },
      long2:     { cx: 923.2, cy: 646.4 },
    },
    multiplier: 1.0,
    updateColors(newColors) {
      Object.assign(colors, newColors);
      derived = computeDerived(colors);
      applyColors(baseSvg, bgLayer, colors, derived);
    },
    updateControls(newControls) {
      Object.assign(controls, newControls);
      applyControls(baseSvg, controls);
    },
    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
  };
}
