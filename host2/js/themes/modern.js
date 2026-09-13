// host2/js/themes/modern.js
// Motyw "tablet": czarne tło, bez linijowania papieru, tekst neutralny
// biały (kolorowe znaczniki z render.js — hostGreen/hostRed/hostYellow —
// zostają swoimi stałymi kolorami niezależnie od motywu, patrz css/host.css),
// JetBrains Mono (samohostowana, patrz css/host.css's @font-face) zamiast
// odręcznego Caveat — z lekko poszerzonymi odstępami (monospace bez tego
// wygląda ściśniej niż zmienna szerokość znaków, do której przyzwyczaja
// klasyczny motyw).
export const hostTheme = {
  key: "modern",
  ruled: false,
  vars: {
    "--h-paper-bg": "#0a0a0c",
    "--h-ink": "#f5f5f7",
    "--h-font": '"JetBrainsMono-Variable", ui-monospace, "SF Mono", Consolas, monospace',
    "--h-letter-spacing": "0.05em",
    "--baseline-shift": "0",
    "--ios-text-shift": "0px",
  },
};
