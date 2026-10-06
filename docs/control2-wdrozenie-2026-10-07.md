# Przełączenie na nowy Panel sterowania — 7 października 2026

## Wdrożone

- Przyciski Graj i Ustawienia rozgrywki w Moich grach otwierają zestaw 2.
- Podłączenie kodem, urządzenia udostępnione oraz TV prowadzą do nowych ekranów.
- Dawne adresy Control, Display, Host, Buzzer i Ustawień przekierowują do
  nowych odpowiedników, zachowując parametry połączenia oraz fragment adresu.
- Zatwierdzony polski plik MD jest treścią sekcji Panel sterowania i Ustawienia
  rozgrywki w manualu. Ikony pochodzą z silnika SVG aplikacji; tabele zachowują
  styl manuala. W wersjach EN/UK poprawiono zakończenie i opis osobnego outro;
  nie są jeszcze pełnym tłumaczeniem zatwierdzonego dokumentu polskiego.
- Historia Control 1 pozostaje bez zmian w bazie i ma etykietę
  „Archiwum — Control 1”. Nie zmieniono statusów ani wyników.
- Stare moduły i funkcje SQL pozostają do osobnego etapu sprzątania zgodnie
  z planem refaktoru. Nazwy folderów zestawu 2 pozostają na tym etapie.

## Worker po refaktorze

1. Konserwacja pobiera bezpośrednio `maintenance/index.html`, zamiast
   wyświetlać treść przekierowania katalogu.
2. Proxy zachowuje nagłówek Location przy odpowiedziach przekierowujących.
3. Uproszczona strona TV jest wybierana również przy bypass; jej osobna trasa
   oraz strona główna są mapowane bezpośrednio na index.html.
4. Bypass captchy obsługuje wszystkie trzy warianty adresu logowania.
5. Jawne `lang=pl` pozostaje w adresie. Wcześniejsze usuwanie tego parametru
   powodowało angielski manual w świeżej przeglądarce angielskiej.
6. Testy z podpisanym, krótkotrwałym tokenem omijają konserwację również
   na urządzeniach. Token nie zastępuje logowania ani uprawnień administratora.

Publikacje: [Control i manual](https://github.com/Andrish97/familiada/actions/runs/37542464452),
[styl tabel manuala](https://github.com/Andrish97/familiada/actions/runs/37542706423),
[poprawka języka Workera](https://github.com/Andrish97/familiada/actions/runs/37543430218).
Wszystkie trzy publikacje zakończyły się sukcesem.

## Sprawdzenie

Wybrane testy lokalne ścieżek, zasobów, przekierowań i manuala: **15/15**,
w tym faktyczna obsługa żądania `lang=pl` przez Worker.
Nie uruchamiano pełnego zestawu testów.

[Przebieg produkcyjny](https://github.com/Andrish97/familiada/actions/runs/37542562778):
7/8 przypadków zaliczone. Stare adresy, wejścia z Moich gier, TV, własne outro,
pełny finał, zakończenie bez finału i opóźnione potwierdzenie Display zaliczone.
Jedyny błąd dotyczył wyboru języka manuala; znaleziono i wdrożono poprawkę Workera,
po której powtórzono wyłącznie ten przypadek. Pierwsza powtórka potwierdziła
polską treść, ale ujawniła błędny selektor SVG w samym teście (silnik zastępuje
znacznik ikoną, zamiast umieszczać ją w środku). Po poprawieniu selektora
[test manuala](https://github.com/Andrish97/familiada/actions/runs/37543719775)
zaliczony bez ponowień. Łącznie **8/8 wybranych przypadków produkcyjnych
zaliczone po poprawkach**; nie powtarzano zaliczonych rozgrywek.

Odczytane z produkcyjnej bazy i dołączone do artefaktu statystyk:

| Przypadek | Rundy | Finał | Wynik końcowy | Zakończenie zapisane |
| --- | --- | --- | --- | --- |
| Pełny finał obu graczy | 300:0 | 135 | 435:0 | Tak |
| Bez finału | 90:0 | — | 90:0 | Tak |

Konserwacja pozostaje włączona. Nie usuwano starych danych, nie uruchamiano
migracji kasującej i nie wyłączano konserwacji automatycznie. Wcześniej otwarte
karty starego zestawu wymagają odświeżenia, aby załadować nowe strony.

## Uzupełnienie manuala po kontroli wdrożenia

Pierwsza publikacja nie zawierała pełnych tłumaczeń EN/UK ani stylu
Prowadzącego ze szkicu. Uzupełniono oba języki na podstawie zatwierdzonego
MD oraz przywrócono wyróżnienie Prowadzącego, grupowanie jego informacji,
notki, uwagi i wygląd przycisków z ikonami aplikacji. Wszystkie języki
mają 49 podsekcji, trzy tabele i osiem odwołań do ikon. Treść pozostałych
sekcji manuala porównano z poprzednią wersją i pozostaje identyczna.
Na życzenie użytkownika wszystkie tabele manuala mają jeden wspólny styl,
również w sekcji baz. Nie ma wyjątków zależnych od zakładki; opisy zawijają
się w komórkach i korzystają z tej samej typografii.

Źródła EN/UK: `docs/manual/control-game-settings.en.md` oraz
`docs/manual/control-game-settings.uk.md`. Polski MD pozostaje źródłem
zatwierdzonej treści.

[Publikacja pełnych sekcji i stylów](https://github.com/Andrish97/familiada/actions/runs/37545642002): sukces.
[Testy manuala na produkcji PL/EN/UK](https://github.com/Andrish97/familiada/actions/runs/37545795549):
**3/3**, bez ponowień. Sprawdzono treść Powtórzenia, styl Prowadzącego,
notki i uwagi, hydratację ikon SVG oraz limit własnego outro we wszystkich
językach. Wybrane testy lokalne: **7/7**. Nie powtarzano rozgrywek.

Po uwadze wizualnej użytkownika usunięto odrębny złoty styl przycisków
w nowych sekcjach. Używają istniejącego `m-code`, tak jak reszta manuala.
Pogrubienia korzystają z `m-strong`, tytuły notek z `b`, a listy nie dodają
wewnętrznych akapitów zwiększających odstępy. Nowy styl `m-host` pozostaje
wyłącznie wyróżnieniem informacji dla Prowadzącego.

Ostateczna decyzja użytkownika: nowy złoty styl przycisków obowiązuje
w całym manualu. Wspólne oznaczanie `m-control` rozpoznaje przyciski
we wszystkich trzech językach i działa także po zmianie języka.
Skróty, wymiary, adresy, wartości i przykładowe statusy zachowują `m-code`.
Słowo „Dalej” wypowiadane przez zawodnika nie jest oznaczane jako przycisk.
