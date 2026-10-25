import { createLayoutTheme } from "./theme_layouts.js?v=v2026-10-25T23195";

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createLayoutTheme(baseSvg, bgLayer, config, "radar");
}
