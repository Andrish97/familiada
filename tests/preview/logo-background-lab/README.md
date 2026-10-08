# Test usuwania tła logo

Strona w Ustawieniach jest generowana jako pojedynczy HTML:

```sh
node tests/preview/logo-background-lab/build-settings-tool.mjs
```

Pięć przykładowych obrazów jest widocznych jako klikalne kafelki na stronie.
Pliki źródłowe SVG znajdują się w
`web/settings/tools/logo-background-lab/samples/` i są osadzane w scalonym
HTML podczas budowania. Przykłady sprawdzają białe tło, kremowe z cieniem,
nietypowe i ciemne tła, białe detale oraz celowo postrzępione krawędzie
głównego obiektu.
Nierówne i ciemne przykłady powinny zostać oznaczone jako niespełniające
prostych kryteriów. Jasne elementy odcięte od krawędzi pokazują zaletę
usuwania obszaru połączonego z brzegiem.

Strona równolegle porównuje trzy warianty:

- **Brzegowe, czysta krawędź** — usuwa kolor tła połączony z krawędzią i
  odbarwia częściowo przezroczyste piksele, żeby ograniczyć jasną obwódkę.
- **Globalne, czysta krawędź** — usuwa podobny kolor w całym obrazie; może
  wyciąć białe elementy logo.
- **Brzegowe, bez korekty** — zachowuje oryginalne kolory brzegów i pokazuje
  ewentualną obwódkę.

Wspólne parametry do oceny:

- kolor tła: mediana próbek z czterech rogów albo ręczne pobranie z obrazu;
- tolerancja: 20/255 na start, czyli próg uznania koloru za tło;
- miękkość krawędzi: 130/255 na start, czyli zakres przejścia do pełnej
  nieprzezroczystości;
- ocena tła: jasność mediany i różnica kolorów pomiędzy próbkami z rogów.

Ocena „równe i jasne” wymaga różnicy do 28 poziomów i jasności co najmniej
205/255. Różnica do 45 lub jasność co najmniej 160/255 oznacza ostrzeżenie;
większe różnice albo ciemne tło są oznaczane jako niezalecane dla prostego
wycinania. To heurystyka do oceny próbek, nie gwarancja dobrego wyniku dla
każdego logo. Wartości tolerancji i miękkości są robocze i wymagają obejrzenia
na rzeczywistych plikach.
