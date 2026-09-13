// host2/js/themes/classic.js
// Motyw domyślny — dzisiejszy wygląd Hosta (papier w linie, atrament,
// pismo odręczne Caveat) — bez żadnej zmiany. Jeden plik na motyw,
// żeby dodanie kolejnego (poza classic/modern) było kopiowaniem tego
// pliku, nie grzebaniem w wspólnym kodzie renderera.
//
// Każdy motyw wypisuje WSZYSTKIE wspólne zmienne jawnie, nawet neutralne
// (patrz ten sam komentarz w themes/modern.js) — inaczej przełączenie z
// motywu, który je ustawia, zostawiłoby ich wartość "przyklejoną".
export const hostTheme = {
  key: "classic",
  ruled: true,
  vars: {
    "--h-paper-bg": "#fffdf5",
    "--h-ink": "#111",
    "--h-font": '"Caveat-Variable", cursive',
    "--h-letter-spacing": "normal",
    "--h-line-height-mult": "1",
  },
};
