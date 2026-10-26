import { ARTWORK } from "./theme_artwork.js?v=v2026-10-26T00204";

const BACKGROUNDS = { wings: "#152238", radar: "#103d43", cabinet: "#352719", ribbon: "#36233f", bridge: "#252e35" };
const DISPLAYS = {
  big: { cx: 640, cy: 307.33656 }, leftPanel: { cx: 113.658, cy: 337.33654 },
  rightPanel: { cx: 1164.342, cy: 337.33654 }, topPanel: { cx: 640, cy: 57.165475 },
  long1: { cx: 356.8, cy: 546.68763 }, long2: { cx: 923.2, cy: 546.68763 },
};
const rgb = hex => {
  const h = String(hex).replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) || 0);
};
const blend = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
const hex = values => "#" + values.map(x => x.toString(16).padStart(2, "0")).join("");
function tint(original, bg, metal) {
  const c = rgb(original), lum = (.2126 * c[0] + .7152 * c[1] + .0722 * c[2]) / 255;
  const t = lum < .08 ? -.7 : lum < .2 ? -.35 : lum < .4 ? .10 : lum < .65 ? .30 : .58;
  const target = blend(bg, t < 0 ? [0, 0, 0] : [255, 255, 255], Math.abs(t));
  return hex(blend(target, c, metal ? .48 : .20));
}
const STYLE = `<style>
[data-display-theme] .display-theme-indicator { transition: color .25s, filter .25s; }
[data-display-theme] .display-theme-indicator.a { color: var(--display-team-a-off); }
[data-display-theme] .display-theme-indicator.b { color: var(--display-team-b-off); }
.display-control-a .display-theme-indicator.a { color: var(--display-team-a); filter: drop-shadow(0 0 6px currentColor); }
.display-control-b .display-theme-indicator.b { color: var(--display-team-b); filter: drop-shadow(0 0 6px currentColor); }
.display-control-a .wing-light.a, .display-control-b .wing-light.b { stroke-width: 7; }
.display-control-a .radar-light.a, .display-control-b .radar-light.b { stroke-width: 8; }
.modern-slot { stroke-dasharray: 1000 1000; stroke-dashoffset: 0; animation: modern-slot-flow 12s linear infinite; animation-delay: -3s; }
@keyframes modern-slot-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -2000; } }
@media (prefers-reduced-motion: reduce) {
  [data-display-theme] .display-theme-indicator { transition: none; }
  .modern-slot { animation: none; stroke-dashoffset: -500; }
}
</style>`;

export function createLayoutTheme(baseSvg, bgLayer, config = {}, name) {
  const modern = name === "modern";
  const colors = { A: "#c4002f", B: "#2a62ff", BG: BACKGROUNDS[name] || "#d21180", ...config.colors };
  const controls = { A: false, B: false, ...config.controls };
  const motion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  let currentA = controls.A ? 1 : 0, currentB = controls.B ? 1 : 0;
  let frame = null, previousTime = null, destroyed = false;
  bgLayer.innerHTML = "";
  bgLayer.style.background = "#000";
  bgLayer.style.opacity = "1";
  baseSvg.setAttribute("viewBox", "0 0 1280 720");
  baseSvg.setAttribute("data-display-theme", name);
  baseSvg.innerHTML = STYLE + ARTWORK[name];
  // Capture immutable source colors once. Color updates never rebuild the SVG,
  // restart the slot animation, or touch the six content displays.
  const attributes = [];
  for (const el of baseSvg.querySelectorAll("[fill],[stroke],[stop-color]")) {
    if (el.closest("mask") || el.closest("#team,#red,#blue")) continue;
    for (const attr of ["fill", "stroke", "stop-color"]) {
      const original = el.getAttribute(attr);
      if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(original || "") || /^#(?:000|000000|fff|ffffff)$/i.test(original)) continue;
      attributes.push({ el, attr, original, metal: !!el.closest("#gold,#steel") });
    }
  }
  const backdrop = baseSvg.querySelector('rect[width="1280"][height="720"]');
  const teamStops = [...baseSvg.querySelectorAll("#team stop")];
  function paintModern() {
    const A = rgb(colors.A), B = rgb(colors.B);
    const left = blend(A, B, currentB), right = blend(B, A, currentA);
    const stops = [blend(left, [255, 255, 255], .10), blend(blend(left, right, .5), [0, 0, 0], .15), blend(right, [255, 255, 255], .10)];
    teamStops.forEach((el, i) => el.setAttribute("stop-color", hex(stops[i])));
    bgLayer.style.background = `linear-gradient(90deg, ${hex(stops[0])}, ${hex(stops[1])}, ${hex(stops[2])})`;
  }
  function paint() {
    const A = rgb(colors.A), B = rgb(colors.B);
    const bg = modern ? blend(blend(A, B, .5), [0, 0, 0], .5) : rgb(colors.BG || BACKGROUNDS[name]);
    baseSvg.style.setProperty("--display-team-a", colors.A);
    baseSvg.style.setProperty("--display-team-b", colors.B);
    baseSvg.style.setProperty("--display-team-a-off", hex(blend(bg, A, .25)));
    baseSvg.style.setProperty("--display-team-b-off", hex(blend(bg, B, .25)));
    for (const { el, attr, original, metal } of attributes) el.setAttribute(attr, tint(original, bg, metal));
    for (const [id, c] of [["red", A], ["blue", B]]) {
      const stops = baseSvg.querySelectorAll(`#${id} stop`);
      stops[0]?.setAttribute("stop-color", hex(blend(c, bg, .20)));
      stops[1]?.setAttribute("stop-color", hex(blend(blend(c, bg, .35), [0, 0, 0], .45)));
    }
    if (modern) { backdrop?.setAttribute("fill", "url(#team)"); paintModern(); }
    else {
      const background = colors.BG || BACKGROUNDS[name];
      backdrop?.setAttribute("fill", background);
      bgLayer.style.background = background;
    }
  }
  function animateControl() {
    if (destroyed || !modern) return;
    if (motion?.matches) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; previousTime = null;
      currentA = controls.A ? 1 : 0; currentB = controls.B ? 1 : 0;
      paintModern(); return;
    }
    if (frame !== null) return;
    const tick = now => {
      if (destroyed) return;
      const delta = previousTime === null ? 16.67 : Math.min(now - previousTime, 64);
      previousTime = now;
      const amount = 1 - Math.exp(-delta / 180);
      const a = controls.A ? 1 : 0, b = controls.B ? 1 : 0;
      currentA += (a - currentA) * amount; currentB += (b - currentB) * amount;
      const moving = Math.abs(currentA - a) > .001 || Math.abs(currentB - b) > .001;
      if (!moving) { currentA = a; currentB = b; previousTime = null; }
      paintModern();
      frame = moving ? requestAnimationFrame(tick) : null;
    };
    frame = requestAnimationFrame(tick);
  }
  function syncControls() {
    baseSvg.classList.toggle("display-control-a", controls.A === true);
    baseSvg.classList.toggle("display-control-b", controls.B === true);
  }
  paint(); syncControls();
  motion?.addEventListener?.("change", animateControl);
  return {
    name, displays: structuredClone(DISPLAYS), multiplier: 1,
    getColors: () => ({ ...colors }), getControls: () => ({ ...controls }),
    updateColors(next) { Object.assign(colors, next); paint(); },
    updateControls(next) { Object.assign(controls, next); syncControls(); animateControl(); },
    destroy() {
      destroyed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      motion?.removeEventListener?.("change", animateControl);
    },
  };
}
