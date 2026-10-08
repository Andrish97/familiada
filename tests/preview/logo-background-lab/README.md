# Test usuwania tła logo

Strona w Ustawieniach jest generowana jako pojedynczy HTML:

```sh
node tests/preview/logo-background-lab/build-settings-tool.mjs
```

Dziesięć przykładowych obrazów jest widocznych jako klikalne kafelki na stronie.
Pliki źródłowe SVG znajdują się w
`web/settings/tools/logo-background-lab/samples/` i są osadzane w scalonym
HTML podczas budowania. Przykłady sprawdzają białe, niebieskie, zielone i
fioletowe jednolite tła, kremowe z cieniem,
nietypowe i ciemne tła, białe detale oraz celowo postrzępione krawędzie
głównego obiektu. Kafelek „Obraz z demo” wczytuje istniejący plik
`web/logo/assets/demo-image.png` bez jego przenoszenia.
Nierówne i ciemne przykłady powinny zostać oznaczone jako niespełniające
prostych kryteriów. Jasne elementy odcięte od krawędzi pokazują zaletę
usuwania obszaru połączonego z brzegiem.

Strona równolegle porównuje cztery warianty:

- **Brzegowe, czysta krawędź** — usuwa kolor tła połączony z krawędzią i
  odbarwia częściowo przezroczyste piksele, żeby ograniczyć jasną obwódkę.
- **Brzegowe + wnętrza** — poza krawędzią usuwa wszystkie odizolowane
  obszary koloru tła, także większe wnętrza liter i kształtów.
- **Globalne, czysta krawędź** — usuwa podobny kolor w całym obrazie; może
  wyciąć białe elementy logo.
- **Brzegowe, bez korekty** — zachowuje oryginalne kolory brzegów i pokazuje
  ewentualną obwódkę.

Wspólne parametry do oceny:

- kolor tła: mediana próbek z czterech rogów albo ręczne pobranie z obrazu;
- tolerancja: 20/255 na start, czyli próg uznania koloru za tło;
- miękkość krawędzi: 20/255 na start, czyli zakres przejścia do pełnej
  nieprzezroczystości;
- ocena tła: jasność mediany i różnica kolorów pomiędzy próbkami z rogów.

Jeśli próbki z narożników wskazują, że PNG ma już przezroczyste tło, wszystkie
warianty pokazują obraz bez zmian, a pobranie zachowuje oryginalny plik.

Ocena równego tła nie zależy od jasności: różnica próbek do 14 poziomów
oznacza równe tło, do 45 — ostrzeżenie, a większa — tło nierówne. To
heurystyka do oceny próbek, nie gwarancja dobrego wyniku dla każdego logo.
Tolerancja i miękkość nadal wymagają obejrzenia na rzeczywistych plikach.
