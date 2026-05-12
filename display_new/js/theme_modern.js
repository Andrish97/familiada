// theme_modern.js
console.log("[Theme: Modern] Loaded v2.1 - Smooth Transitions");

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
  bgLayer.style.position = "relative";
  bgLayer.style.overflow = "hidden";

  const div = document.createElement("div");
  div.id = "bg-modern-main";
  div.style.position = "absolute";
  div.style.top = "0"; div.style.left = "0";
  div.style.width = "100%"; div.style.height = "100%";
  bgLayer.appendChild(div);
  return { main: div };
}

function updateBackground(layer, d, tA, tB) {
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

  layer.style.background = `linear-gradient(90deg, ${c0} 0%, ${c1} 35%, ${c2} 65%, ${c3} 100%)`;
}

function buildSvgContent(d) {
  return `<defs id="defs11">
  <linearGradient id="linearGradient12">
    <stop style="stop-color:#000000;stop-opacity:1;" offset="0.47242647" id="stop12" />
    <stop style="stop-color:#000000;stop-opacity:0;" offset="1" id="stop15" />
  </linearGradient>
  <linearGradient xlink:href="#linearGradient12" id="linearGradient24" gradientUnits="userSpaceOnUse" x1="640" y1="-454.06543" x2="640" y2="1224.5049" />
  <linearGradient xlink:href="#linearGradient12" id="linearGradient25" gradientUnits="userSpaceOnUse" x1="640" y1="-454.06543" x2="640" y2="1224.5049" />
  <linearGradient xlink:href="#linearGradient12" id="linearGradient26" gradientUnits="userSpaceOnUse" x1="640" y1="-454.06543" x2="640" y2="1224.5049" />
</defs>

<text x="1078" y="653.98657" text-anchor="end" font-family="sans-serif" font-size="14.4px" fill="#ffffff" fill-opacity="0.25" letter-spacing="0.5" style="stroke-width:0.8">familiada.online</text>

<g id="g138" inkscape:label="lines">
  <rect x="268.1817" y="661.65625" width="743.63672" height="3.3825312" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0756029;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="156.63016" y="628.94513" width="966.73987" height="3.3824761" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0862004;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="113.24883" y="596.23737" width="1053.5026" height="3.3824582" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0899852;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="82.262123" y="563.53015" width="1115.476" height="3.3824449" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0925939;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="57.472733" y="530.8233" width="1165.0547" height="3.382432" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0946291;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="38.880672" y="498.11667" width="1202.2389" height="3.3824196" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0961272;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="32.683315" y="465.41055" width="1214.6335" height="3.3824179" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0966214;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="26.48596" y="432.70444" width="1227.0282" height="3.3824143" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0971131;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="20.288601" y="399.99832" width="1239.423" height="3.3823981" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0976021;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="20.288601" y="367.29245" width="1239.423" height="3.3823981" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0976021;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="26.48596" y="334.58633" width="1227.0282" height="3.3824143" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0971131;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="32.683315" y="301.88019" width="1214.6335" height="3.3824179" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0966214;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="38.880672" y="269.17407" width="1202.2389" height="3.3824196" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0961272;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="57.472733" y="236.46744" width="1165.0547" height="3.382432" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0946291;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="82.262123" y="203.76054" width="1115.476" height="3.3824449" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0925939;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="113.24883" y="171.05334" width="1053.5026" height="3.3824582" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0899852;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="156.63016" y="138.34557" width="966.73987" height="3.3824761" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0862004;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
  <rect x="268.1817" y="105.63439" width="743.63672" height="3.3825312" rx="5" ry="5" style="display:inline;stroke:#ffffff;stroke-width:0.0756029;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill;fill:#ffffff;fill-opacity:0.23999999" />
</g>

<g id="g139" inkscape:label="ovals">
  <path id="rect3" style="display:inline;fill:url(#linearGradient24);fill-opacity:1;stroke:none" d="M 170.96484 1 C -34.15309 1 -199.28516 166.1301 -199.28516 371.24805 L -199.28516 399.18945 C -199.28516 604.3074 -34.15309 769.43945 170.96484 769.43945 L 1109.0352 769.43945 C 1314.1531 769.43945 1479.2852 604.3074 1479.2852 399.18945 L 1479.2852 371.24805 C 1479.2852 166.1301 1314.1531 1 1109.0352 1 L 170.96484 1 z M 565.0625 6.5410156 L 714.9375 6.5410156 C 728.7875 6.5410156 739.9375 17.691016 739.9375 31.541016 L 739.9375 38.460938 L 1063.3047 38.460938 C 1248.4236 38.460938 1397.4551 187.49238 1397.4551 372.61133 L 1397.4551 397.82812 C 1397.4551 582.94708 1248.4236 731.97656 1063.3047 731.97656 L 216.69531 731.97656 C 31.576371 731.97656 -117.45313 582.94707 -117.45312 397.82812 L -117.45312 372.61133 C -117.45312 187.49238 31.576371 38.460937 216.69531 38.460938 L 540.0625 38.460938 L 540.0625 31.541016 C 540.0625 17.691016 551.2125 6.5410156 565.0625 6.5410156 z " />
  <path id="rect2" style="display:inline;fill:url(#linearGradient25);fill-opacity:1;stroke:none" d="M 220.92969 41.929688 C 37.661927 41.929688 -109.87891 189.46857 -109.87891 372.73633 L -109.87891 397.70117 C -109.87891 580.96893 37.661926 728.50977 220.92969 728.50977 L 1059.0723 728.50977 C 1242.34 728.50977 1389.8809 580.96893 1389.8809 397.70117 L 1389.8809 372.73633 C 1389.8809 189.46857 1242.34 41.929688 1059.0723 41.929688 L 739.9375 41.929688 L 739.9375 73.136719 L 1020.9746 73.136719 C 1187.5817 73.136719 1321.709 207.26405 1321.709 373.87109 L 1321.709 396.56641 C 1321.709 563.17345 1187.5817 697.30078 1020.9746 697.30078 L 259.02539 697.30078 C 92.418345 697.30078 -41.708984 563.17345 -41.708984 396.56641 L -41.708984 373.87109 C -41.708984 207.26405 92.418345 73.136719 259.02539 73.136719 L 540.0625 73.136719 L 540.0625 41.929688 L 220.92969 41.929688 z " />
  <path id="rect5" style="display:inline;fill:url(#linearGradient26);fill-opacity:1;stroke:none" d="M 264.74023 77.818359 C 100.63229 77.818359 -31.482422 209.93503 -31.482422 374.04297 L -31.482422 396.39648 C -31.482422 560.50443 100.63229 692.62109 264.74023 692.62109 L 1015.2598 692.62109 C 1179.3677 692.62109 1311.4844 560.50443 1311.4844 396.39648 L 1311.4844 374.04297 C 1311.4844 209.93503 1179.3677 77.818359 1015.2598 77.818359 L 739.9375 77.818359 L 739.9375 82.791016 C 739.9375 87.642004 738.56987 92.160868 736.19727 95.986328 L 993.08203 95.986328 C 1147.4912 95.986328 1271.7988 220.29398 1271.7988 374.70312 L 1271.7988 395.73633 C 1271.7988 550.14548 1147.4912 674.45313 993.08203 674.45312 L 286.91797 674.45312 C 132.50881 674.45312 8.2011719 550.14548 8.2011719 395.73633 L 8.2011719 374.70312 C 8.2011719 220.29397 132.50881 95.986328 286.91797 95.986328 L 543.80273 95.986328 C 541.43013 92.160868 540.0625 87.642004 540.0625 82.791016 L 540.0625 77.818359 L 264.74023 77.818359 z " />
</g>

<g id="display_frames" style="stroke:#ffffff;stroke-opacity:0.24421053;stroke-width:9;stroke-dasharray:none;paint-order:stroke markers fill">
  <rect x="647.93054" y="516.98523" width="550.53888" height="59.4048" rx="20" ry="20" style="display:inline;fill:#090909;fill-opacity:1;stroke-width:9;stroke:#ffffff;stroke-opacity:0.24421053;stroke-dasharray:none;paint-order:stroke markers fill" />
  <rect x="81.530571" y="516.98523" width="550.53888" height="59.4048" rx="20" ry="20" style="display:inline;fill:#090909;fill-opacity:1;stroke-width:9;stroke:#ffffff;stroke-opacity:0.24421053;stroke-dasharray:none;paint-order:stroke markers fill" />
  <rect x="18.479759" y="291.31412" width="190.35648" height="92.044792" rx="20" ry="20" style="fill:#090909;fill-opacity:1;stroke-width:9;stroke:#ffffff;stroke-opacity:0.24421053;stroke-dasharray:none;paint-order:stroke markers fill" />
  <rect x="1069.1637" y="291.31412" width="190.35648" height="92.044792" rx="20" ry="20" style="fill:#090909;fill-opacity:1;stroke-width:9;stroke:#ffffff;stroke-opacity:0.24421053;stroke-dasharray:none;paint-order:stroke markers fill" />
  <rect x="544.82178" y="11.143076" width="190.35648" height="92.044792" rx="20" ry="20" style="display:inline;fill:#090909;fill-opacity:1;stroke:#ffffff;stroke-width:9;stroke-dasharray:none;stroke-opacity:0.244211;paint-order:stroke markers fill" />
  <rect x="226.32941" y="124.91698" width="827.34125" height="364.83914" rx="20" ry="20" style="display:inline;fill:#090909;fill-opacity:1;stroke-width:9;stroke:#ffffff;stroke-opacity:0.24421053;stroke-dasharray:none;paint-order:stroke markers fill" />
</g>`;
}

function render(svg, layers, d) {
  svg.setAttribute("viewBox", "0 0 1280 720");
  svg.innerHTML = buildSvgContent(d);
}

export function createTheme(baseSvg, bgLayer, config = {}) {
  let colors   = { ...DEFAULT_COLORS, ...config.colors };
  let controls = { A: false, B: false, ...config.controls };

  let currentA = controls.A ? 1 : 0;
  let currentB = controls.B ? 1 : 0;
  let animId = null;

  const layers = setupLayers(bgLayer);
  const derived = computeDerived(colors);

  function startAnimation() {
    if (animId) return;
    const tick = () => {
      const targetA = controls.A ? 1 : 0;
      const targetB = controls.B ? 1 : 0;
      
      let changed = false;
      const step = 0.08;
      
      if (Math.abs(currentA - targetA) > 0.001) {
        currentA += (targetA - currentA) * step;
        changed = true;
      } else {
        currentA = targetA;
      }
      
      if (Math.abs(currentB - targetB) > 0.001) {
        currentB += (targetB - currentB) * step;
        changed = true;
      } else {
        currentB = targetB;
      }
      
      const d = computeDerived(colors);
      updateBackground(layers.main, d, currentA, currentB);
      
      if (changed) {
        animId = requestAnimationFrame(tick);
      } else {
        animId = null;
      }
    };
    animId = requestAnimationFrame(tick);
  }

  render(baseSvg, layers, derived);
  updateBackground(layers.main, derived, currentA, currentB);

  return {
    name: "modern",
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
      const d = computeDerived(colors);
      render(baseSvg, layers, d);
      updateBackground(layers.main, d, currentA, currentB);
    },
    updateControls(newControls) {
      Object.assign(controls, newControls);
      startAnimation();
    },
    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
  };
}
