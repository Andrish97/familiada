# Control i Game Settings — sekcje do sprawdzenia

Stan opisu: 5 października 2026. Osobny materiał do przeglądu przed włączeniem do instrukcji. Podstawa: [przewodnik po nagraniach](Przewodnik%20po%20nagraniach%20demo%20control2.md) i [Rundown Control](Rundown%20Control.html), uzupełnione o wdrożony kod Control 2 i Game Settings 2.

## Control — przygotowanie gry

1. Otwórz Control wybranej gry. Podłącz Wyświetlacz, Prowadzącego i Przycisk przez link, kod lub QR. Możesz pokazać jednocześnie QR Prowadzącego i Przycisku na Wyświetlaczu.
2. Jeśli korzystasz z fizycznego przycisku albo nie używasz tabletu prowadzącego, zaznacz odpowiednie opcje. Pominięte urządzenia nie są wymagane do prowadzenia gry.
3. Wybierz źródło dźwięku: Control albo Wyświetlacz. Przy źródle „Wyświetlacz” odblokuj dźwięk na tym urządzeniu. Dźwięki mają grać tylko na wybranym źródle.
4. Przejdź do Podsumowania. Sprawdź drużyny, wygląd planszy, zasady i dźwięki. Otwórz ustawienia, jeśli potrzebujesz zmian.
5. Rozpocznij grę. Nazwy drużyn są widoczne już przed startem rozgrywki. Intro i reveal są osobnymi dźwiękami; reveal towarzyszy większej zmianie planszy.

Kontrolki urządzeń znajdują się w górnym pasku. Udostępnienie urządzenia e-mailem daje odbiorcy link do podłączenia; zapis odbiorcy na liście nie oznacza jeszcze dostarczenia wiadomości.

## Control — pojedynek i runda

- Przycisk rozświetla się lokalnie przy naciśnięciu, przed wysłaniem zgłoszenia. Dźwięk zwycięskiego zgłoszenia gra raz, bez powtórzenia przy zatwierdzeniu przez operatora.
- Operator zatwierdza zgłoszoną drużynę albo wybiera „Ponów naciśnięcie”. W trybie fizycznego przycisku wskazuje drużynę ręcznie i zatwierdza wybór.
- Trafienie odsłania odpowiedź, a następnie aktualizuje bank. Pudło dodaje X. Trzecie pudło w rozgrywce uruchamia kradzież dla drugiej drużyny.
- Wygrana kradzież przyznaje bank drużynie kradnącej; przegrana pozostawia go drużynie prowadzącej rozgrywkę.
- „Zakończ rundę” rozlicza bank z mnożnikiem. Jeśli pozostały zakryte odpowiedzi, operator je odsłania. Podczas tego odsłaniania wskazanie „Gra:” nie jest pokazywane.
- Po odsłonięciu reszty przechodzisz do następnej rundy, finału albo zakończenia gry. Wyczerpanie pytań prowadzi do zakończenia gry także wtedy, gdy nie osiągnięto progu.

### Zakończenie bez finału

Po rozliczeniu rundy i odsłonięciu pozostałych odpowiedzi wybierz przejście do zakończenia gry. „Zakończ grę” zmienia planszę na ekran końcowy z reveal i osobnym outro. Nie powtarza dźwięku zakończenia rundy. Restart i dalsze działania czekają na zakończenie blokady dźwiękowej.

Ekran końcowy zależy od ustawienia: logo albo punkty zwycięzcy. Bez finału tryb nagrody pokazuje punkty; przy remisie pojawia się logo.

## Control — finał

1. „Rozpocznij finał” uruchamia dźwięk finału, następnie reveal i planszę finału.
2. Wpisz pięć odpowiedzi gracza 1. Zegar jest opcjonalny; po uruchomieniu odlicza czas gracza. „Dalej” prowadzi do mapowania odpowiedzi.
3. Wybierz i zatwierdź dopasowanie. Przy trafieniu użyj „Pokaż odpowiedź”, następnie „Pokaż punkty”. Brak odpowiedzi, pudło i powtórzenie odsłaniają zero automatycznie przy odsłanianiu odpowiedzi, z dźwiękiem błędu.
4. Jeśli próg nie został osiągnięty, przejdź po pięciu pytaniach do drugiego gracza. Jego ekran wpisywania pokazuje także odpowiedzi gracza 1. Oznacz powtórzenia i zmapuj odpowiedzi gracza 2.
5. Po odsłonięciu ostatnich punktów drugiego gracza pojawia się „Zakończ finał”. Kliknięcie pokazuje wynik: logo, punkty albo nagrodę, wraz z reveal i dźwiękiem przejścia rundy.
6. Następne „Zakończ grę” odtwarza tylko outro. Wynik pozostaje widoczny i nie otrzymuje drugiego reveal.

### Wcześniejsze osiągnięcie progu

Dotyczy obu graczy. Po odsłonięciu punktów osiągających próg dalsze mapowanie jest blokowane. Informacja o osiągnięciu progu znajduje się w kolumnie podpowiedzi. Przycisk zmienia się na „Zakończ finał”; nie ma automatycznego przejścia. Kliknięcie pokazuje wynik z reveal i dźwiękiem przejścia rundy, tak samo jak przy pełnym zakończeniu. Dopiero „Zakończ grę” uruchamia outro.

### Prowadzący i długość odpowiedzi

W finale Prowadzący może lokalnie odsłonić treść gestem przesunięcia zasłony. Kolejna zmiana stanu gry przywraca zasłonę. Ten gest nie odsłania odpowiedzi na Wyświetlaczu.

Wyświetlacz mieści 17 znaków odpowiedzi w rundach i 11 w finale. Hint przy wpisywaniu wyjaśnia ograniczenie prezentacji. Kropka pojawia się, gdy skrócenie urywa słowo; jeśli następny znak to spacja lub interpunkcja, pozostaje odpowiednio 17 albo 11 znaków bez dodanej kropki. Demo ma pełne odpowiedzi do 17 znaków; w finale mogą być skracane do 11.

## Control — blokady i powrót urządzeń

Utrata wymaganej obecności urządzenia jest wykrywana po 6,5 s od jego ostatniego pingu. Pojawia się jednorazowy modal z nazwami odłączonych urządzeń, informacją o sprawdzeniu internetu i ponownym podłączeniu przyciskami w górnym pasku. Akcje gry są blokowane do powrotu wszystkich wymaganych urządzeń.

Akcje zapisane przed wykryciem przerwy pozostają w grze. Wysłane żądanie może zakończyć zapis już po wykryciu rozłączenia; blokada nie cofa zapisu ani nie anuluje żądania w drodze. Akcja oczekująca w kolejce jest sprawdzana ponownie przed wykonaniem. Wracające urządzenie pobiera aktualny stan bez odgrywania pominiętych animacji. Biegnący zegar nie jest pauzowany.

Osobno działają blokada drugiej karty Control, blokada zajętych zasobów logo oraz blokada działań na czas dźwięków. „Zacznij od nowa” wymaga potwierdzenia i wraca do przygotowania urządzeń.

## Game Settings — ustawienia gry

- **Drużyny i wygląd:** nazwy drużyn, kolory, logo i wygląd Wyświetlacza. Podgląd wewnątrz modalu śledzi edytowane wartości przed zapisem; podgląd w Podsumowaniu Control odświeża się po zapisie.
- **Rundy i finał:** włączenie finału, próg przejścia do finału, cel punktowy finału i parametry rozgrywki. Próg wejścia do finału i cel punktowy samego finału to dwa różne ustawienia.
- **Ekran końcowy:** logo, punkty lub nagroda. Nagroda w finale uwzględnia punkty rund i finału, mnożnik nagrody oraz premię za osiągnięcie celu.
- **Dźwięki:** każda kategoria ma wybór pliku i głośność. Intro, przejście rundy, reveal, buzzer i outro są odrębnymi kategoriami. Domyślne pliki znajdują się w folderach kategorii jako wariant „Klasyczny”.
- **Outro:** osobne ustawienie dźwięku zakończenia gry, z limitem własnego pliku do 120 sekund. Jest dostępne również w Podsumowaniu Control, z odtwarzaniem i zatrzymaniem podglądu. Własny plik jest zapisywany dla gry i wraca po ponownym otwarciu ustawień.

Zapisz zmiany przez „Zapisz wszystko”. Edycja podglądu przed zapisem nie jest zatwierdzeniem ustawień gry.

## Co sprawdzić na nagraniach

| Nagranie | Najważniejsze elementy |
|---|---|
| 01 | Wpisywanie w ustawieniach, suwaki i podgląd; pojedynczy dźwięk buzzera; brak migania „Dalej”; ponowienie zgłoszenia; kradzież i logo końcowe. |
| 02–03 | Przejścia kolejnych rund; wznowienie Control po przeładowaniu w 03; finał w 02 i końcowe punkty w 03. |
| 04 | Gest odsłonięcia Prowadzącego; odpowiedzi gracza 1 podczas wpisywania gracza 2; brak/pudło/powtórzenie; pełny finał, niższa nagroda, osobne outro. |
| 05 | Próg w pierwszej rundzie finału, blokada i podpowiedź, ręczne „Zakończ finał”, nagroda główna przed outro. |
| 06 | Modal rozłączenia, blokada, aktualny stan po ponownym podłączeniu i działanie nowego Przycisku. |
| 07–08 | Blokada logo i samoistne wznowienie; układ udostępniania i prawdziwy link z e-maila. |
| 09–10 | Ręczny wybór drużyny i pomijane urządzenia; mnożnik czwartej rundy. |

Sprawdź płynność ruchu i brak przeskakiwania klatek na rzeczywistych filmach. Zaliczone asercje E2E same nie potwierdzają jakości animacji. Pełny cykl nagrań jest w trakcie; ten dokument nie oznacza akceptacji wizualnej wszystkich punktów.
