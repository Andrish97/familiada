// host2/js/themes/modern.js
// Motyw "tablet": czarne tło, bez linijowania papieru, tekst neutralny
// biały (kolorowe znaczniki z render.js — hostGreen/hostRed/hostYellow —
// zostają swoimi stałymi kolorami niezależnie od motywu, patrz css/host.css),
// JetBrains Mono (samohostowana, patrz css/host.css's @font-face) zamiast
// odręcznego Caveat — z szerszymi odstępami MIĘDZY LINIAMI (monospace bez
// linijowania papieru wygląda ściśnięcie w pionie; klasyczny motyw trzyma
// linię tekstu dopasowaną do linii papieru, tu tego ograniczenia nie ma).
//
// Każdy motyw wypisuje WSZYSTKIE wspólne zmienne jawnie (nawet gdy to
// wartość neutralna) — hostThemeManager.js nadpisuje tylko to, co dany
// motyw wymienia w vars, więc pominięcie zmiennej tutaj zostawiłoby
// wartość poprzedniego motywu "przyklejoną" po przełączeniu.
export const hostTheme = {
  key: "modern",
  ruled: false,
  vars: {
    "--h-paper-bg": "#0a0a0c",
    "--h-ink": "#f5f5f7",
    "--h-font": '"JetBrainsMono-Variable", ui-monospace, "SF Mono", Consolas, monospace',
    "--h-letter-spacing": "normal",
    "--h-line-height-mult": "1.4",
    "--baseline-shift": "0",
    "--ios-text-shift": "0px",
  },
};
