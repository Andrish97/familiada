// theme_manager.js
// Menadżer motywów – rejestr z themes.json, dynamiczne ładowanie, THEME command
import { t } from "../../translation/translation.js?v=v2026-06-09T17333";

let THEMES = {};
let THEME_META = [];
let DEFAULT_THEME = "classic";

async function initRegistry() {
  try {
    const res = await fetch("./display/js/themes.json");
    const json = await res.json();
    DEFAULT_THEME = json.default ?? DEFAULT_THEME;
    THEME_META = json.themes.map(e => ({ key: e.key, label: e.label }));
    for (const entry of json.themes) {
      const mod = await import(entry.module);
      THEMES[entry.key] = mod.createTheme;
    }
  } catch (e) {
    console.warn("[theme_manager] Fallback do static:", e.message);
  }
  if (Object.keys(THEMES).length === 0) {
    const { createTheme: createThemeClassic } = await import("./theme_classic.js?v=v2026-06-09T17333");
    THEMES.classic = createThemeClassic;
    THEME_META = [{ key: "classic", label: "display.theme.classic" }];
  }
}

export async function createThemeManager(baseSvg, bgLayer) {
  await initRegistry();

  let activeTheme = null;
  let activeName = null;

  const load = (name, config = {}) => {
    const key = name.toLowerCase();
    const factory = THEMES[key];
    if (!factory) throw new Error(`THEME: nieznany motyw "${name}". Dostępne: ${getAvailableLabels().map(m => m.label).join(", ")}`);
    activeTheme = factory(baseSvg, bgLayer, config);
    activeName = key;
    return activeTheme;
  };

  const getActive = () => activeName;
  const getActiveTheme = () => activeTheme;
  const getAvailable = () => Object.keys(THEMES);
  const getDefault = () => DEFAULT_THEME;

  const getAvailableLabels = () => THEME_META.map(m => ({ key: m.key, label: t(m.label) }));
  const getThemeLabel = (key) => {
    const m = THEME_META.find(x => x.key === key);
    return m ? t(m.label) : key;
  };

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
    getAvailableLabels,
    getThemeLabel,
    updateColors,
    updateControls,
    getDefault,
  };
}
