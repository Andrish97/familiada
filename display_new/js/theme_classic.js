// theme_classic.js
// Klasyczny motyw – obecnym wygląd Familiady
// Generuje: base SVG (warstwa 2) + background (warstwa 3)
// Zwraca: pozycje wyświetlaczy + mnożnik

import { GEOMETRY } from "./display-geometry.js";

const NS = "http://www.w3.org/2000/svg";

const el = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
};

const rgbToHex = ({ r, g, b }) =>
  `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;

const mix = (c1, c2, t) => ({
  r: Math.round(c1.r + (c2.r - c1.r) * t),
  g: Math.round(c1.g + (c2.g - c1.g) * t),
  b: Math.round(c1.b + (c2.b - c1.b) * t),
});

const lighten = (c, t) => mix(c, { r: 255, g: 255, b: 255 }, t);
const darken = (c, t) => mix(c, { r: 0, g: 0, b: 0 }, t);

function computeDerived(colors) {
  const A = hexToRgb(colors.A);
  const B = hexToRgb(colors.B);
  const G = hexToRgb(colors.BG);
  return {
    A_dark: rgbToHex(darken(A, 0.38)),
    B_dark: rgbToHex(darken(B, 0.35)),
    A_lamp: rgbToHex(lighten(A, 0.25)),
    B_lamp: rgbToHex(lighten(B, 0.18)),
    B_glow: rgbToHex(lighten(B, 0.28)),
    bgGradient: (() => {
      const bg0 = lighten(G, 0.10);
      const bg1 = mix(G, darken(G, 0.75), 0.55);
      const aAcc = mix(bg0, A, 0.18);
      const bAcc = mix(bg0, B, 0.16);
      return `radial-gradient(1400px 700px at 50% 25%, ` +
        `${rgbToHex(mix(aAcc, bAcc, 0.50))} 0%, ` +
        `${rgbToHex(bg0)} 30%, ` +
        `${rgbToHex(bg1)} 70%, ` +
        `${rgbToHex(darken(G, 0.85))} 100%)`;
    })(),
  };
}

export function createTheme(baseSvg, bgLayer, config = {}) {
  const { base, ovals, lines, basebar, lamps } = GEOMETRY;
  const { W, H, CX, CY } = base;

  let colors = {
    A: config.colors?.A ?? "#c4002f",
    B: config.colors?.B ?? "#2a62ff",
    BG: config.colors?.BG ?? "#d21180",
  };

  let controls = {
    A: config.controls?.A ?? false,
    B: config.controls?.B ?? false,
  };

  const lampGradIds = { A: `lampGrad_A_${Date.now()}`, B: `lampGrad_B_${Date.now()}` };
  let lampElements = {};

  function buildDefs(defs, derived) {
    // rimGrad
    const rimGrad = el("linearGradient", { id: "rimGrad", x1: "0", y1: "0", x2: "1", y2: "0" });
    rimGrad.appendChild(el("stop", { offset: "0", "stop-color": colors.A }));
    rimGrad.appendChild(el("stop", { offset: "0.35", "stop-color": derived.A_dark }));
    rimGrad.appendChild(el("stop", { offset: "0.65", "stop-color": derived.B_dark }));
    rimGrad.appendChild(el("stop", { offset: "1", "stop-color": colors.B }));
    defs.appendChild(rimGrad);

    // innerGrad
    const innerGrad = el("linearGradient", { id: "innerGrad", x1: "0", y1: "0", x2: "0", y2: "1" });
    innerGrad.appendChild(el("stop", { offset: "0", "stop-color": "#e6eaef" }));
    innerGrad.appendChild(el("stop", { offset: "1", "stop-color": "#bfc7cf" }));
    defs.appendChild(innerGrad);

    // silverGrad
    const silverGrad = el("linearGradient", { id: "silverGrad", x1: "0", y1: "0", x2: "0", y2: "1" });
    silverGrad.appendChild(el("stop", { offset: "0", "stop-color": "#f6f7f9" }));
    silverGrad.appendChild(el("stop", { offset: "0.55", "stop-color": "#d1d5db" }));
    silverGrad.appendChild(el("stop", { offset: "1", "stop-color": "#aab1bb" }));
    defs.appendChild(silverGrad);

    // neonBlue
    const filter = el("filter", { id: "neonBlue", x: "-60%", y: "-120%", width: "220%", height: "340%" });
    filter.appendChild(el("feDropShadow", { id: "neonDS1", dx: "0", dy: "0", stdDeviation: "4", "flood-color": derived.B_glow, "flood-opacity": "0.95" }));
    filter.appendChild(el("feDropShadow", { id: "neonDS2", dx: "0", dy: "0", stdDeviation: "10", "flood-color": derived.B_glow, "flood-opacity": "0.60" }));
    defs.appendChild(filter);

    // Lamp gradients
    for (const id of ["A", "B"]) {
      const gid = lampGradIds[id];
      const lampColor = id === "A" ? derived.A_lamp : derived.B_lamp;
      const grad = el("radialGradient", { id: gid, cx: "35%", cy: "30%", r: "70%" });
      grad.appendChild(el("stop", { offset: "0%", "stop-color": "#ffffff", "stop-opacity": "0.65" }));
      grad.appendChild(el("stop", { offset: "25%", "stop-color": lampColor }));
      grad.appendChild(el("stop", { offset: "100%", "stop-color": "#000000", "stop-opacity": "0.35" }));
      defs.appendChild(grad);
    }
  }

  function buildOvals(svg) {
    const { outer, inner } = ovals;
    svg.appendChild(el("rect", {
      id: "outerOval",
      x: outer.x, y: outer.y, width: outer.w, height: outer.h, rx: outer.rx,
      fill: "url(#rimGrad)", stroke: "#ffffff", "stroke-width": "6", "stroke-opacity": "0.9",
    }));
    svg.appendChild(el("rect", {
      id: "innerOval",
      x: inner.x, y: inner.y, width: inner.w, height: inner.h, rx: inner.rx,
      fill: "url(#innerGrad)",
    }));
  }

  function buildFrameLines(svg) {
    const g = el("g", { id: "frameLines" });
    for (const ln of lines) {
      g.appendChild(el("line", {
        x1: ln.x1, y1: ln.y1, x2: ln.x2, y2: ln.y2,
        stroke: "#ffffff", "stroke-opacity": "0.9", "stroke-width": "4.5", "stroke-linecap": "round",
      }));
    }
    svg.appendChild(g);
  }

  function buildBasebar(svg) {
    const { x, y, w, h } = basebar;
    const halfW = w / 2;
    svg.appendChild(el("rect", { x, y, width: w, height: h, fill: "url(#silverGrad)" }));
    svg.appendChild(el("rect", {
      id: "basebarOutlineA",
      x, y, width: halfW, height: h,
      fill: "none", stroke: colors.A, "stroke-width": "6", "stroke-opacity": "0.55", "stroke-linejoin": "round",
    }));
    svg.appendChild(el("rect", {
      id: "basebarOutlineB",
      x: x + halfW, y, width: halfW, height: h,
      fill: "none", stroke: colors.B, "stroke-width": "6", "stroke-opacity": "0.55", "stroke-linejoin": "round",
    }));
    svg.appendChild(el("rect", {
      x: x + 1, y: y + 1, width: w - 2, height: h - 2,
      fill: "none", stroke: "#f6f7f9", "stroke-width": "1.5", "stroke-opacity": "0.7",
    }));
  }

  function buildLamp(svg, id, lampConfig) {
    const { cx, cy, r } = lampConfig;
    const gid = lampGradIds[id];
    const g = el("g", { id: `lamp${id}` });
    g.appendChild(el("circle", {
      cx: cx + r * 0.08, cy: cy + r * 0.12, r: r * 1.02,
      fill: "#000", opacity: "0.20",
    }));
    const glow = el("circle", {
      id: `lamp${id}_glow`,
      cx, cy, r: r * 1.08,
      fill: id === "A" ? colors.A : colors.B, opacity: controls[id] ? "0.85" : "0", filter: "url(#neonBlue)",
    });
    const offBody = el("circle", {
      id: `lamp${id}_off`,
      cx, cy, r, fill: "#0a0a0a", opacity: controls[id] ? "0.20" : "0.92",
    });
    const onBody = el("circle", {
      id: `lamp${id}_on`,
      cx, cy, r, fill: `url(#${gid})`, opacity: controls[id] ? "0.98" : "0",
    });
    const highlight = el("circle", {
      id: `lamp${id}_highlight`,
      cx: cx - r * 0.28, cy: cy - r * 0.30, r: r * 0.22,
      fill: "#fff", opacity: controls[id] ? "0.28" : "0.14",
    });
    g.appendChild(el("circle", {
      cx, cy, r: r + 2,
      fill: "none", stroke: "rgba(255,255,255,0.42)", "stroke-width": "2", opacity: "0.95",
    }));
    g.appendChild(glow);
    g.appendChild(offBody);
    g.appendChild(onBody);
    g.appendChild(highlight);
    svg.appendChild(g);
    lampElements[id] = { glow, offBody, onBody, highlight };
  }

  function renderBase() {
    baseSvg.innerHTML = "";
    baseSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const derived = computeDerived(colors);
    const defs = el("defs");
    buildDefs(defs, derived);
    baseSvg.appendChild(defs);
    buildOvals(baseSvg);
    buildFrameLines(baseSvg);
    buildBasebar(baseSvg);
    buildLamp(baseSvg, "A", lamps.A);
    buildLamp(baseSvg, "B", lamps.B);
    baseSvg.appendChild(el("text", {
      x: W - 20, y: H - 12, "text-anchor": "end",
      "font-family": "sans-serif", "font-size": "18", fill: "#ffffff", "fill-opacity": "0.25", "letter-spacing": "0.5",
    })).textContent = "familiada.online";
  }

  function renderBg() {
    const derived = computeDerived(colors);
    bgLayer.style.background = derived.bgGradient;
  }

  // Initial render
  renderBase();
  renderBg();

  return {
    name: "classic",
    displays: {
      big:       { cx: CX, cy: CY },
      leftPanel: { cx: GEOMETRY.displays.leftPanel.cx, cy: GEOMETRY.displays.leftPanel.cy },
      rightPanel:{ cx: GEOMETRY.displays.rightPanel.cx, cy: GEOMETRY.displays.rightPanel.cy },
      topPanel:  { cx: GEOMETRY.displays.topPanel.cx, cy: GEOMETRY.displays.topPanel.cy },
      long1:     { cx: GEOMETRY.displays.long1.cx, cy: GEOMETRY.displays.long1.cy },
      long2:     { cx: GEOMETRY.displays.long2.cx, cy: GEOMETRY.displays.long2.cy },
    },
    multiplier: 1.0,

    updateColors(newColors) {
      Object.assign(colors, newColors);
      renderBase();
      renderBg();
    },

    updateControls(newControls) {
      Object.assign(controls, newControls);
      renderBase();
    },

    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
  };
}
