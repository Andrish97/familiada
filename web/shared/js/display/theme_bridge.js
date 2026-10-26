import { createLayoutTheme } from "./theme_layouts.js?v=v2026-10-26T14443";

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createLayoutTheme(baseSvg, bgLayer, config, "bridge");
}
