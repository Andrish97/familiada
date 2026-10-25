import { createLayoutTheme } from "./theme_layouts.js?v=v2026-10-25T22074";

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createLayoutTheme(baseSvg, bgLayer, config, "ribbon");
}
