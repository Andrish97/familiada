# Test usuwania tła logo

Narzędzie jest dostępne w Ustawienia → Narzędzia → **Test usuwania tła logo**.
Strona ładuje się jako pojedynczy HTML. Działa lokalnie w przeglądarce: obraz
nie jest wysyłany na serwer ani zapisywany w bazie.

## Przykłady i wykrywanie tła

Pięć widocznych kafelków pozwala od razu wybrać przykład: jednolite białe tło,
kremowe tło z cieniem, tło wzorzyste, ciemne tło, logo z zamkniętym białym
detalem oraz obiekt z celowo postrzępioną krawędzią. Pliki źródłowe SVG są w
`web/settings/tools/logo-background-lab/samples/`; podczas budowania strony są
osadzane w scalonym HTML. Wzorzyste i ciemne obrazy
powinny dostać ostrzeżenie, a biały detal powinien pozostać przy metodzie
brzegowej.

Wykrywanie wstępne bierze medianę kolorów z czterech narożników. Różnica do
28 poziomów kanału RGB i jasność co najmniej 205/255 oznaczają równe, jasne
tło. Wynik pośredni (różnica do 45 i jasność od 160/255) dostaje ostrzeżenie.
Większa różnica lub ciemny kolor oznacza tło niespełniające prostych kryteriów.
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
