# Próba typograficznego logo Hosta

Na tablecie otwórz `standalone.html` — to pojedynczy plik z osadzonym
fontem, oryginalnym SVG, stylem i skryptem, bez odwołań do innych lokalnych
plików. `index.html` pozostaje wersją źródłową podglądu.

Po zmianie źródeł wygeneruj samodzielny plik poleceniem
`node tests/preview/host-unbounded-logo/build-standalone.mjs`.

`render.js` rysuje napis i jego warstwy 3D na przezroczystym płótnie, a następnie
odkształca piksele całego rysunku:

1. Rozkłada napis na litery i stosuje rybie oko względem środka całego napisu.
   Środek napisu jest powiększony, a końce ściśnięte. Odkształcenie kształtów
   liter sprawia, że ich górne i dolne krawędzie układają się w przeciwne łuki,
   jak w oryginalnym logo.
2. Wysokość i szerokość niezależnie rozciągają kształt liter na osiach Y i X.
   Pozostałe suwaki regulują wagę, odstępy, rybie oko, kolor DOT,
   głębokość i kąt przesunięcia warstw 3D. Skala logo w podglądzie zmienia
   wyłącznie jego rozmiar na planszy porównawczej — nie zmienia geometrii
   liter ani parametrów logo.
3. Rysuje kopie liter z małym przesunięciem jako jednolitą, ciemniejszą
   bryłę pod licem; lico ma jednolity kolor DOT.
4. Piksele są próbkowane płynnie podczas deformacji; nie ma filtra rozmycia.

Kontrolki pozwalają dostrajać parametry bez edycji fontu. Dołączony lokalnie
font zmienny `Unbounded-Variable.ttf` pozwala regulować wagę; licencja OFL
znajduje się obok.

Wartości docelowe podglądu: waga 900, wysokość 133%, szerokość 82%, odstęp
11 px, rybie oko 0,50,
głębokość 12 px pod kątem 32° i skala podglądu 135%. Paleta pochodzi z
`web/assets/img/logo.svg`: lico `#ffcc00`, głębia `#aa8800`. Przy zmianie
koloru DOT głębia jest wyliczana jako DOT przyciemniony o jedną trzecią, co
zachowuje relację kolorów z oryginalnego logo.
