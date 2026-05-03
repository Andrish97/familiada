// theme_template.js
// Szablon motywu – definiuje wejścia/wyjścia i dostarcza API dla wyświetlaczy

import { createDisplays } from "./displays.js";
import { GEOMETRY } from "./display-geometry.js";

// Domyślne kolory – nadpisywane przez motyw
const DEFAULT_COLORS = {
  A: "#c4002f",
  B: "#2a62ff",
  BG: "#d21180",
};

// Domyślny stan kontrolek
const DEFAULT_CONTROLS = { A: false, B: false };

// Domyślny mnożnik wyświetlaczy
const DEFAULT_MULTIPLIER = 1.0;

export function createTheme(svg, displaysGroup, config = {}) {
  const colors = { ...DEFAULT_COLORS, ...config.colors };
  const controls = { ...DEFAULT_CONTROLS, ...config.controls };
  const multiplier = config.multiplier ?? DEFAULT_MULTIPLIER;

  const displays = createDisplays({ svgGroup: displaysGroup, multiplier });

  return {
    getColors: () => ({ ...colors }),
    getControls: () => ({ ...controls }),
    getMultiplier: () => multiplier,
    getDisplays: () => displays,
    getGeometry: () => GEOMETRY,

    updateColors(newColors) {
      Object.assign(colors, newColors);
    },

    updateControls(newControls) {
      Object.assign(controls, newControls);
    },

    updateMultiplier(m) {
      displays.setGlobalMultiplier(m);
    },
  };
}
