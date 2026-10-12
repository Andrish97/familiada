# Control — tryb testowy

Status: tryb i korekta wdrożone; Pages38307255666 success, kontrola produkcyjna38307396879 success2/2. Integracja brancha38306861683 success1/1 (PL/EN/UK, urządzenia, statystyki).
Pages38300728957 success; kontrola main38301293181 success3/3 bez retry.
Branch38300241381 success2/2 przed publikacją. Brak migracji.

## Decyzje użytkownika — 2026-10-12

- Domyślne nazwy drużyn na Wyświetlaczu zmieniają język natychmiast po
  otrzymaniu ustawienia języka i wczytaniu słownika, niezależnie od animacji
  i dźwięków. Własne nazwy pozostają bez zmian. Starsze animacje nie mogą
  przywracać poprzednich nazw. Tę poprawkę użytkownik polecił wdrożyć
  bezpośrednio na main, bez testów (wyjątek od cyklu wdrożenia).

1. W kroku **Urządzenia** dodać przełącznik **Tryb testowy**. Pozwala
   sprawdzić rozgrywkę bez drugiego ekranu i osobnych urządzeń.
2. Włączenie otwiera od razu trzy urządzenia po prawej: Wyświetlacz,
   Prowadzący i Przycisk. Używać rzeczywistych stron urządzeń w iframe,
   z normalną komunikacją i potwierdzeniami animacji, nie atrap.
3. Wybranie trybu blokuje pozostałe sposoby podłączania urządzeń oraz
   warianty bez prowadzącego i z fizycznym przyciskiem. Ustawienie źródła
   dźwięku pozostaje dostępne; obowiązują normalne zasady odblokowania
   dźwięku Wyświetlacza. Nie omijać blokad rozgrywki.
4. Pasek zajmuje całą dostępną wysokość; każde z trzech urządzeń ma
   dokładnie jedną trzecią wysokości. Wyświetlacz może mieć proporcje
   **4:3**. Nie wymagać 16:9.
5. Urządzenia mają otrzymywać większą, wirtualną rozdzielczość i być
   proporcjonalnie pomniejszane do swoich pól. Mały rozmiar pola iframe
   nie może wymuszać mobilnego układu urządzenia. Roboczy punkt pomiarów:
   1024 × 768; docelowe dopasowanie potwierdzić zrzutami.
6. Control płynnie przesuwa się w lewo i dopasowuje do pozostałego miejsca.
   Czcionki zmniejszyć **lekko**, proporcjonalnie z pozostałymi elementami.
   Uwzględniać zarówno dostępną szerokość, jak i wysokość. Nie pomniejszać
   panelu dowolnie, aż stanie się nieczytelny.
7. **Żadnego przewijania ani obcinania** panelu lub urządzeń. Dotyczy też
   Urządzeń i drugiego gracza finału, w tym drugiego wiersza odpowiedzi.
   **Ostateczna korekta:** wyłącznie treść Podsumowania może się przewijać;
   przywrócić poprzedni układ sekcji, dolne przyciski poza przewijaniem.
8. **Za wąskie okno:** wykrywać brak miejsca od razu w kroku Urządzenia,
   pokazać krótki komunikat i zablokować wybór trybu testowego. Nie pozwalać
   włączyć układu, który wymagałby nadmiernego pomniejszenia. Próg wyznaczyć
   na podstawie pomiarów czytelnego panelu i trzech urządzeń; obecna blokada
   mobilnego Control sama nie wystarcza. Po poszerzeniu okna opcja ma być
   ponownie dostępna. Sprawdzić również zwężenie okna oraz odświeżenie,
   kiedy tryb jest już włączony: nie usuwać zapisanego wyboru; przy braku
   miejsca pokazać komunikat i wstrzymać korzystanie do poszerzenia okna.
   **Doprecyzowanie:** guard zwykłego Control i dostępność trybu testowego
   są osobnymi regułami. Guard Control ma zapewniać panel bez przewijania
   niezależnie od trybu. Tryb testowy dodatkowo wymaga miejsca na trzy
   urządzenia; niespełnienie jego progu blokuje tylko jego wybór, a nie
   zwykły Control, jeśli ten nadal się mieści. Nie zastępować wspólnego
   device guarda progiem trybu testowego ani nie podnosić przez niego
   minimalnego rozmiaru zwykłego Control.
9. Tryb ma przetrwać odświeżenie. Zapisać go **tak samo jak istniejące
   opcje urządzeń**, obok `noHostTablet` i `physicalBuzzer`, w istniejącym
   JSON-ie `game_state.detail.settings`, jako `testMode`. Nie dodawać
   tabel, kolumn ani migracji. Wcześniejszy pomysł wyłącznie lokalnego
   zapisu jest zastąpiony tym ustaleniem.
10. Statystyki mają odnotowywać tryb testowy w szczegółach przebiegu.
    Istniejący zapis ustawień sesji przejmuje cały JSON ustawień; wykorzystać
    ten mechanizm, bez migracji. Samo oznaczenie nie oznacza automatycznego
    wykluczenia przebiegu ze statystyk.
11. Nie przeładowywać urządzeń przy każdym renderze Control ani przy zmianie
    rozmiaru okna. Odświeżenie strony ma przywrócić trzy połączenia.
12. Na razie prace i testy na **branchu**, z produkcyjną bazą i rzeczywistymi
    kontami zgodnie z zasadami repo. Bez zmian schematu bazy i bez wdrożenia
    Pages. Manual na końcu: tylko krótka informacja potrzebna użytkownikowi
    w sekcji Urządzenia, we wszystkich obsługiwanych językach.
    **Aktualizacja zgody:** po punktowych zielonych testach na branchu,
    obejmujących także zapis trybu w statystykach, użytkownik zezwolił na
    wdrożenie. Następnie obowiązuje punktowa kontrola produkcyjna.

## Korekta układu — 2026-10-12

- Cały Control, łącznie z topbarem, dopasowuje się do lewego obszaru.
- Znajomi bezpośrednio przed ikonami urządzeń, w tej samej grupie przycisków; widoczni tylko w kroku Urządzenia (udostępnianie), potem ukryci.
- Urządzenia zajmują pełną wysokość okna przeglądarki, każde 1/3; bez zaokrągleń i marginesów zewnętrznych.
- Podsumowanie wraca do poprzedniego układu sekcji i dwóch podglądów. Tylko treść podsumowania może się przewijać; dolne przyciski pozostają widoczne. Zastępuje to wcześniejszy zakaz przewijania podsumowania i jego zakładki.
- Pozostałe kroki i urządzenia bez przewijania. Złagodzić guard według wymiarów mieszczącego się panelu; komunikat nie wspomina o przewijaniu.
- Dodatkowa krytyczna poprawka: puste nazwy z ustawień oznaczają domyślne Drużyna A/B w języku panelu. Zapisać je w stanie rozgrywki przed startem, także przy wznowieniu gry z pustymi nazwami; nazwy własne zachować. Nazwy domyślne odświeżają się przy zmianie języka (znaczniki defaultA/B w istniejącym JSON-ie teams; bez migracji). Pokazać na Wyświetlaczu w kroku Rozpocznij grę, bez zer wyniku.
- Stan: branch38306861683 success; publikacja i punktowa kontrola produkcji przed zamknięciem.

## Kolejność wykonania

- [x] Spisać uzgodnienia i sprawdzić obecny sposób zapisu opcji urządzeń.
- [x] Wstępnie zmierzyć rzeczywisty renderer kroków Control z przykładowymi
  danymi przy 1280×720, 1366×768, 1400×900 i 1920×1080.
- [x] Wyznaczyć minimalny czytelny rozmiar i próg blokady trybu; pomniejszenie
  ma być lekkie, nie dowolnie duże.
- [x] Dodać przełącznik, zapis flagi, wzajemne blokowanie opcji i odtworzenie
  po odświeżeniu. Zachować tryb przy rozpoczęciu od nowa w tym panelu.
- [x] Dodać pasek rzeczywistych iframe, wirtualny viewport i dopasowanie panelu.
- [x] Przywrócić podsumowanie z przewijaną treścią i stałymi dolnymi przyciskami.
- [x] Dodać oznaczenie przebiegu w statystykach z istniejącego zapisu ustawień.
- [x] Punktowe testy geometrii oraz E2E kodu brancha na produkcyjnej bazie:
  włączanie/wyłączanie, blokady, trzy połączenia, buzzer, dźwięk z Control
  i Wyświetlacza, odświeżenie, zmiana rozmiaru, finał gracza 2, statystyki.
- [x] Zrzuty z przykładowymi danymi, w tym 1400 px i mobilna blokada 390 px.
- [x] Krótka aktualizacja manuala PL/EN/UK, raport wyników i stan brancha.

## Dotychczasowe pomiary — ograniczenia

Materiały robocze: `docs/img/control-test-layout/`. To pomiary renderera
z przykładowymi danymi, a nie test połączonych urządzeń ani gotowego trybu.
Kroki rozgrywki w próbie nie wychodziły poza obszar karty. Podsumowanie
z długimi listami nadal wymagało przewijania, także po pomniejszeniu:
samo skalowanie nie rozwiązuje tego kroku. Przed zamknięciem wdrożenia
konieczne jest dopasowanie podsumowania i ponowne pomiary.

## Dziennik

- 2026-10-12: utworzono branch i zapisano pełne decyzje, w tym najnowszą
  blokadę wyboru przy zbyt wąskim oknie oraz lekkie skalowanie czcionek.
  Kod produktu nie jest jeszcze zmieniony, nie ma wdrożenia ani E2E trybu.
- 2026-10-12: rozdzielono regułę guarda zwykłego Control od dodatkowego
  progu trybu testowego; zero przewijania jest zasadą nadrzędną w obu
  układach. Zgoda na wdrożenie po testach brancha i potwierdzeniu statystyk.

### Pierwsza implementacja brancha

- Dwie niezależne reguły geometrii. Po korekcie minimalna skala panelu 80%;
  punkt odniesienia 1100×640 obszaru panelu, topbar skalowany razem. Próg wyliczany z obu wymiarów
  okna i rzeczywistej wysokości topbara, nie ze stałej szerokości ekranu.
- Wspólny device guard przyjmuje dodatkowy warunek dopasowania Control.
  Próg testowy blokuje opcję osobno; przy zwężeniu aktywnego trybu nakładka
  wstrzymuje korzystanie bez usuwania zapisanej flagi.
- Pierwsze wdrożenie (zastąpione korektą): Podsumowanie miało sekcje wybierane przyciskami i strony po pięć pozycji
  dla długich list pytań i dźwięków. Wszystkie pozycje pozostają dostępne;
  nie są ukrywane przez obcięcie kontenera.
- Testy jednostkowe geometrii i page-init: 29/29. Wstępne ponowne pomiary
  64 przypadków renderera (osiem kroków, cztery rozmiary, dwa warianty):
  brak przewijania/wyjścia poza panel. Nadal wymagane sprawdzenie wszystkich
  sekcji podsumowania oraz rzeczywistego iframe/przepływu/statystyk w E2E.


### Potwierdzenia brancha

- 38298166305 success2/2, bez retry: kod brancha na produkcyjnej bazie,
  pula4/5. Zapis statystyk rzeczywiście zawiera `settings.testMode=true`.
- 38298597313 success3/3, bez retry: ponownie tryb/statystyki oraz zwykła
  pełna runda z czterema urządzeniami i reload Control w drugiej rundzie.
  Unit467/467 w workflow. Zrzuty e2e-shots, zapis production-statistics-records.
- Podglądy w Podsumowaniu pozostają dwa, w sekcji Wygląd, każdy centrowany
  w swojej połowie. Są niezależne od trzech aktywnych urządzeń trybu.
- Domknięcie: kontrola wyłączenia/ponownego włączenia, zabezpieczenie zapisu
  przed podwójną akcją, powrót z guarda oraz zrzut Wyglądu i krótki manual.
  Ostatni punktowy przebieg tej wersji przed wdrożeniem.

- 2026-10-12: użytkownik potwierdził krótką wzmiankę w manualu i ukrycie
  przycisków pełnego ekranu w osadzonych urządzeniach trybu testowego.
  Zwykłe strony urządzeń zachowują pełny ekran. Wzmianka jest w PL/EN/UK;
  punktowy E2E sprawdza również niewidoczność przycisków we wszystkich iframe.
- 38299326792 success2/2 na f39b3220b3, bez retry: wyłączanie i ponowne
  włączanie, zwężenie, oba centrowane podglądy oraz zapis statystyk.


### Zamknięcie na produkcji

- Push main2c166c165e; wersje CI w b5af28c037. Pages **38300728957 success**.
- **38301293181 success3/3**, retries0, unit471/471, kod produkcyjny
  (`TEST_BRANCH_CODE=0`), pula4/5. Tryb i statystyki oraz zwykły pełny
  przebieg z reloadem w rundzie2 przeszły po wdrożeniu.
- Sprawdzone: trzy rzeczywiste urządzenia1024×768, brak pełnego ekranu
  w osadzeniu, osobne blokady, zapis/odświeżenie trybu, wyłączenie i ponowne
  włączenie, blokada przy zwężeniu i jej zdjęcie po powiększeniu,
  odblokowanie dźwięku Display, buzzer i rzeczywisty wpis statystyk.
- Oba podglądy w sekcji Wygląd osobno centrowane. Zrzuty produkcyjne:
  [Urządzenia](img/control-test-mode/devices-1400.png),
  [Podsumowanie](img/control-test-mode/summary-1400.png),
  [guard na telefonie](img/control-test-mode/guard-390.png).
- Manual PL/EN/UK: wzmianka o trybie oraz obsłudze sekcji i stron
  Podsumowania. Żadnych nowych tabel, kolumn ani migracji.
- Granice dowodu: punktowe E2E wykonano w Chromium. Pomiary renderera
  objęły kroki urządzeń/podsumowania/rund/wpisywania i mapowania obu graczy,
  dostępne sekcje podsumowania oraz wąskie okna zwykłego Control. To testy
  wybranych rozmiarów i przykładowych danych, nie deklaracja pomiaru
  każdego możliwego ekranu. Guard blokuje okna poniżej czytelnej skali.

## Decyzje — dźwięk i mute, 2026-10-12

- Mute wycisza globalnie bieżące i kolejne dźwięki, także gdy źródłem jest Wyświetlacz. Odtwarzanie i synchronizacja trwają w ciszy; odciszenie odsłania aktualny moment utworu, bez restartu.
- Dźwięk naciśnięcia Buzzera ma mieć poziom porównywalny z pozostałymi domyślnymi plikami. Zachować własne ustawienia głośności i własne pliki użytkowników.
- Fade wejścia/wyjścia korzysta z rzeczywistej pozycji audio, nie czasu od żądania play. Rozpoczyna się po potwierdzonym starcie odtwarzania; opóźnienie ładowania nie zużywa obwiedni dźwięku.
