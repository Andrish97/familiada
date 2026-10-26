import { createLayoutTheme } from "./theme_layouts.js?v=v2026-10-26T14464";

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createLayoutTheme(baseSvg, bgLayer, config, "radar");
}
