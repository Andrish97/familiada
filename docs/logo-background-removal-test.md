# Test usuwania tła logo

Narzędzie jest dostępne w Ustawienia → Narzędzia → **Test obrazu IMAGE i usuwania tła**.
Obróbka działa lokalnie w przeglądarce: obraz nie jest wysyłany na serwer ani
zapisywany w bazie. Strona korzysta ze wspólnych stylów i renderera Hosta.

Można wczytać zwykły obraz albo zapis logo IMAGE w JSON. Dla zapisu IMAGE
narzędzie pobiera `imageData`/`imageUrl`, odczytuje `rotate`, `straighten` i
zapisany kadr `crop` v2, a następnie uruchamia porównanie usuwania tła na
przyciętym obrazie. Pasek obrotu, rozwijany suwak prostowania, cztery uchwyty
kadru oraz jego proporcja 26:11 odpowiadają edytorowi IMAGE. Obraz roboczy ma
limit 2560 px. Po zastosowaniu kadru strona używa wspólnego renderera Hosta
(`renderImageSource`) do przygotowania planszy 1280×720, a dopiero potem
sprawdza usuwanie tła. Renderer obsługuje też zapisane prostowanie obrazu.


## Przykłady i wykrywanie tła

Dziesięć widocznych kafelków pozwala od razu wybrać przykład: białe,
niebieskie, zielone i fioletowe jednolite tła, kremowe tło z cieniem, tło
wzorzyste i ciemne, białe detale, postrzępioną krawędź obiektu oraz obraz
używany w demach. Obraz demo jest wczytywany z
`web/logo/assets/demo-image.png` bez przenoszenia.
Pliki pozostałych próbek SVG są w
`web/settings/tools/logo-background-lab/samples/`; podczas budowania strony są
osadzane w scalonym HTML. Wzorzyste i ciemne obrazy
powinny dostać ostrzeżenie; jasny detal może zostać usunięty, jeśli ma kolor
zbliżony do tła.

Wykrywanie wstępne bierze medianę kolorów z czterech narożników. Równe tło
może mieć dowolny kolor; ocena nie odrzuca już tła za niską jasność. Różnica
do 14 poziomów kanału RGB oznacza równe tło, do 45 — ostrzeżenie, a większa
różnica oznacza tło niespełniające kryterium jednolitości.
To heurystyka: narożniki mogą być zasłonięte elementem logo, a środek obrazu
może mieć gradient, którego narożniki nie pokazują.

Jeśli co najmniej 75% próbek z narożników jest przezroczystych, narzędzie
pomija usuwanie tła. Sam obraz nadal przechodzi przez obrót, kadr i skalowanie
do 1280×720, ale jego przezroczystość pozostaje bez zmian.

## Usuwanie tła

Jedna metoda globalna usuwa piksele zbliżone do koloru tła w całym kadrze,
również w zamkniętych obszarach. Może więc wyciąć jasne detale podobne do
tła; wynik sprawdza się w podglądzie na szachownicy.

## Parametry

- Kolor tła: mediana narożników lub próbka wskazana kliknięciem na obrazie.
- Tolerancja: 20/255. Określa, które piksele stają się całkowicie przezroczyste.
- Miękkość krawędzi: 20/255. Wyznacza zakres przejścia do pełnej
  nieprzezroczystości.
- Wynik ma rozmiar 1280×720, zgodny z planszą Hosta.

Laboratorium pokazuje jedną metodę globalną z tolerancją i miękkością
ustawionymi początkowo na 20/20. W widoku „Oryginał” obrót, prostowanie, przesuwanie i cztery uchwyty kadru
mają ten sam wygląd i zachowanie co w edytorze logo. Obraz po kadrze jest skalowany do planszy Hosta
1280×720, a wynik globalnego usuwania tła aktualizuje się z bieżącego kadru.
Eksport PNG służy wyłącznie do oceny; narzędzie nie podmienia logo w grze ani
w ustawieniach.
