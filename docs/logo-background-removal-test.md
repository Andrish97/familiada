# Test usuwania tła logo

Narzędzie jest dostępne w Ustawienia → Narzędzia → **Test usuwania tła logo**.
Strona ładuje się jako pojedynczy HTML. Działa lokalnie w przeglądarce: obraz
nie jest wysyłany na serwer ani zapisywany w bazie.

## Przykłady i wykrywanie tła

Osiem widocznych kafelków pozwala od razu wybrać przykład: białe, jednolite
niebieskie i kremowe tło, tło wzorzyste i ciemne, białe detale, postrzępioną
krawędź obiektu oraz obraz używany w demach. Obraz demo jest wczytywany z
`web/logo/assets/demo-image.png` bez przenoszenia.
Pliki pozostałych próbek SVG są w
`web/settings/tools/logo-background-lab/samples/`; podczas budowania strony są
osadzane w scalonym HTML. Wzorzyste i ciemne obrazy
powinny dostać ostrzeżenie, a biały detal powinien pozostać przy metodzie
brzegowej.

Wykrywanie wstępne bierze medianę kolorów z czterech narożników. Równe tło
może mieć dowolny kolor; ocena nie odrzuca już tła za niską jasność. Różnica
do 14 poziomów kanału RGB oznacza równe tło, do 45 — ostrzeżenie, a większa
różnica oznacza tło niespełniające kryterium jednolitości.
To heurystyka: narożniki mogą być zasłonięte elementem logo, a środek obrazu
może mieć gradient, którego narożniki nie pokazują.

## Porównywane algorytmy

- **Brzegowe, czysta krawędź**: usuwa piksele podobne do tła, jeśli łączą się
  z krawędzią obrazu. Zrekonstruowany kolor krawędzi ogranicza jasną obwódkę;
  zamknięte białe detale pozostają.
- **Globalne, czysta krawędź**: usuwa podobne piksele w całym obrazie, także
  wewnątrz logo. Pokazuje ryzyko dla białych detali.
- **Brzegowe, bez korekty obwódki**: pokazuje wynik bez rekonstrukcji koloru
  półprzezroczystych pikseli.

## Parametry robocze do zatwierdzenia

- Kolor tła: mediana narożników lub próbka wskazana kliknięciem na obrazie.
- Tolerancja: 20/255. Określa, które piksele stają się całkowicie przezroczyste.
- Miękkość krawędzi: 130/255. Wyznacza zakres przejścia do pełnej
  nieprzezroczystości.
- Podgląd i eksport są ograniczone do 1600 px na dłuższym boku.

Powyższe wartości są startowe. Po obejrzeniu testów na rzeczywistych logo
trzeba zdecydować, czy lepiej sprawdza się usuwanie brzegowe oraz jakie
ustawić tolerancję i miękkość. Eksport PNG służy wyłącznie do oceny; narzędzie
nie podmienia logo w grze ani w ustawieniach.
