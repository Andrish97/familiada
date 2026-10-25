import { createLayoutTheme } from "./theme_layouts.js?v=v2026-10-25T23423";

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createLayoutTheme(baseSvg, bgLayer, config, "bridge");
}
