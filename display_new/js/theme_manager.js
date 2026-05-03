// theme_manager.js
// Menadżer motywów – rejestr z themes.json, dynamiczne ładowanie, THEME command

let THEMES = {};
let DEFAULT_THEME = "classic";

async function initRegistry() {
  try {
    const res = await fetch("./display_new/js/themes.json");
    const json = await res.json();
    DEFAULT_THEME = json.default ?? DEFAULT_THEME;
    for (const entry of json.themes) {
      const mod = await import(entry.module);
      THEMES[entry.key] = mod.createTheme;
    }
  } catch (e) {
    console.warn("[theme_manager] Fallback do static:", e.message);
  }
  if (Object.keys(THEMES).length === 0) {
    const { createTheme: createThemeClassic } = await import("./theme_classic.js");
    THEMES.classic = createThemeClassic;
  }
}

export async function createThemeManager(baseSvg, bgLayer) {
  await initRegistry();

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
  const getDefault = () => DEFAULT_THEME;

  const updateColors = (colors) => {
    if (!activeTheme) return;
    activeTheme.updateColors?.(colors);
  };

  const updateControls = (controls) => {
    if (!activeTheme) return;
    activeTheme.updateControls?.(controls);
  };

  load(DEFAULT_THEME);

  return {
    load,
    getActive,
    getActiveTheme,
    getAvailable,
    updateColors,
    updateControls,
    getDefault,
  };
}
