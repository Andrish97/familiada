import { createModernTheme } from "./theme_modern.js?v=v2026-10-25T21522";

export function createTheme(baseSvg, bgLayer, config = {}) {
  return createModernTheme(baseSvg, bgLayer, config, "studio");
}
