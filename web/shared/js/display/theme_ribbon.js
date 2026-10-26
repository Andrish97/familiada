import { createLayoutTheme } from "./theme_layouts.js?v=v2026-10-26T16023";

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createLayoutTheme(baseSvg, bgLayer, config, "ribbon");
}
