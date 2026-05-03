// theme_template.js
// Interfejs motywu – definicja API które musi spełniać każdy motyw

// Motyw otrzymuje:
//   baseSvg – element SVG warstwy 2 (base)
//   bgLayer – element DIV warstwy 3 (background)
//   config  – { colors: { A, B, BG }, controls: { A: bool, B: bool } }
//
// Motyw zwraca:
//   {
//     name: string,
//     displays: {
//       big:       { cx, cy },
//       leftPanel: { cx, cy },
//       rightPanel:{ cx, cy },
//       topPanel:  { cx, cy },
//       long1:     { cx, cy },
//       long2:     { cx, cy },
//     },
//     multiplier: number, // mnożnik rozmiaru wyświetlaczy
//     updateColors(colors)  – zmienia kolory
//     updateControls(controls) – zmienia stan kontrolek
//   }

export function createTheme(baseSvg, bgLayer, config = {}) {
  throw new Error("createTheme must be implemented by a theme module");
}
