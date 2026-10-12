# Control — tryb testowy

Status: plan zatwierdzony, przygotowanie na branchu `codex/control-test-mode`.
Nie wdrażać Pages ani scalać do `main` na tym etapie.

## Decyzje użytkownika — 2026-10-12

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
   Urządzeń, Podsumowania i drugiego gracza finału, w tym drugiego wiersza
   odpowiedzi. Przy długiej zawartości podsumowania zapewnić dostęp do
   całości bez przewijania; szczegółowy układ jest jeszcze do wykonania.
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

## Kolejność wykonania

- [x] Spisać uzgodnienia i sprawdzić obecny sposób zapisu opcji urządzeń.
- [x] Wstępnie zmierzyć rzeczywisty renderer kroków Control z przykładowymi
  danymi przy 1280×720, 1366×768, 1400×900 i 1920×1080.
- [ ] Wyznaczyć minimalny czytelny rozmiar i próg blokady trybu; pomniejszenie
  ma być lekkie, nie dowolnie duże.
- [ ] Dodać przełącznik, zapis flagi, wzajemne blokowanie opcji i odtworzenie
  po odświeżeniu. Zachować tryb przy rozpoczęciu od nowa w tym panelu.
- [ ] Dodać pasek rzeczywistych iframe, wirtualny viewport i dopasowanie panelu.
- [ ] Dopasować podsumowanie bez przewijania, z dostępem do wszystkich treści.
- [ ] Dodać oznaczenie przebiegu w statystykach z istniejącego zapisu ustawień.
- [ ] Punktowe testy geometrii oraz E2E kodu brancha na produkcyjnej bazie:
  włączanie/wyłączanie, blokady, trzy połączenia, buzzer, dźwięk z Control
  i Wyświetlacza, odświeżenie, zmiana rozmiaru, finał gracza 2, statystyki.
- [ ] Zrzuty z przykładowymi danymi, w tym 1400 px i mobilna blokada 390 px.
- [ ] Krótka aktualizacja manuala PL/EN/UK, raport wyników i stan brancha.

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

- Dwie niezależne reguły geometrii. Robocza minimalna skala panelu 85%;
  punkt odniesienia 1100×680 obszaru panelu. Próg wyliczany z obu wymiarów
  okna i rzeczywistej wysokości topbara, nie ze stałej szerokości ekranu.
- Wspólny device guard przyjmuje dodatkowy warunek dopasowania Control.
  Próg testowy blokuje opcję osobno; przy zwężeniu aktywnego trybu nakładka
  wstrzymuje korzystanie bez usuwania zapisanej flagi.
- Podsumowanie ma sekcje wybierane przyciskami i strony po pięć pozycji
  dla długich list pytań i dźwięków. Wszystkie pozycje pozostają dostępne;
  nie są ukrywane przez obcięcie kontenera.
- Testy jednostkowe geometrii i page-init: 29/29. Wstępne ponowne pomiary
  64 przypadków renderera (osiem kroków, cztery rozmiary, dwa warianty):
  brak przewijania/wyjścia poza panel. Nadal wymagane sprawdzenie wszystkich
  sekcji podsumowania oraz rzeczywistego iframe/przepływu/statystyk w E2E.
