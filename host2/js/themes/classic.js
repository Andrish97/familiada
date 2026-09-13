// host2/js/themes/classic.js
// Motyw domyślny — dzisiejszy wygląd Hosta (papier w linie, atrament,
// pismo odręczne Caveat) — bez żadnej zmiany. Jeden plik na motyw,
// żeby dodanie kolejnego (poza classic/modern) było kopiowaniem tego
// pliku, nie grzebaniem w wspólnym kodzie renderera.
export const hostTheme = {
  key: "classic",
  ruled: true,
  vars: {
    "--h-paper-bg": "#fffdf5",
    "--h-ink": "#111",
    "--h-font": '"Caveat-Variable", cursive',
  },
};
