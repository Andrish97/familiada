// theme_manager.js
// Menadżer motywów – ładowanie, przełączanie, THEME command

import { createTheme as createThemeClassic } from "./theme_classic.js";

const THEMES = {
  classic: createThemeClassic,
};

const DEFAULT_THEME = "classic";

export function createThemeManager(baseSvg, bgLayer) {
  let activeTheme = null;
  let activeName = null;

  const load = (name, config = {}) => {
    const key = name.toLowerCase();
    const factory = THEMES[key];
    if (!factory) throw new Error(`THEME: nieznany motyw "${name}". Dostępne: ${Object.keys(THEMES).join(", ")}`);
    activeTheme = factory(baseSvg, bgLayer, config);
    activeName = key;
    return activeTheme;
  };

  const getActive = () => activeName;
  const getActiveTheme = () => activeTheme;
  const getAvailable = () => Object.keys(THEMES);

  const updateColors = (colors) => {
    if (!activeTheme) return;
    activeTheme.updateColors?.(colors);
  };

  const updateControls = (controls) => {
    if (!activeTheme) return;
    activeTheme.updateControls?.(controls);
  };

  // Load default
  load(DEFAULT_THEME);

  return {
    load,
    getActive,
    getActiveTheme,
    getAvailable,
    updateColors,
    updateControls,
    getDefault: () => DEFAULT_THEME,
  };
}
