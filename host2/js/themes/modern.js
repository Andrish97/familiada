// host2/js/themes/modern.js
// Motyw "tablet": czarne tło, bez linijowania papieru, tekst neutralny
// biały (kolorowe znaczniki z render.js — hostGreen/hostRed/hostYellow —
// zostają swoimi stałymi kolorami niezależnie od motywu, patrz css/host.css),
// czcionka systemowa zamiast odręcznego Caveat.
export const hostTheme = {
  key: "modern",
  ruled: false,
  vars: {
    "--h-paper-bg": "#0a0a0c",
    "--h-ink": "#f5f5f7",
    "--h-font": '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    "--baseline-shift": "0",
    "--ios-text-shift": "0px",
  },
};
