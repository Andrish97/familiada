import { createLayoutTheme } from "./theme_layouts.js?v=v2026-10-26T14264";

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createLayoutTheme(baseSvg, bgLayer, config, "modern");
}
