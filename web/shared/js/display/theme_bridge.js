import { createLayoutTheme } from "./theme_layouts.js?v=v2026-10-26T01354";

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createLayoutTheme(baseSvg, bgLayer, config, "bridge");
}
