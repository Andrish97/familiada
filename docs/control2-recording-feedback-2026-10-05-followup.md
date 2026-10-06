# Uwagi do nagrań i instrukcji — kolejna korekta

Źródło: uwagi przesłane w rozmowie oraz lokalne poprawki WIELKIMI LITERAMI w pliku „Control i Game Settings — sekcje do sprawdzenia.md”. Lista dotyczy nowego Panelu sterowania i nowych ekranów urządzeń. Pierwszego Wyświetlacza nie zmieniamy.

Punkt oznaczamy jako wykonany po poprawieniu i sprawdzeniu zachowania. Zmiana w kodzie, wdrożenie i ocena płynności nagrania to osobne informacje; nie zastępują się nawzajem.

## Nagrania i działanie gry

- [ ] 01. Wyświetlacz pozostaje czarny podczas podłączania urządzeń i Podsumowania. Aktywuje się wraz z nazwami drużyn dopiero na ekranie z przyciskiem „Rozpocznij grę”.
- [ ] 02. Przy zakończeniu zwykłej rundy reveal i przejście rundy grają razem, bez sekwencji jeden po drugim.
- [x] 03. Przywrócić poprzedni reveal, sprzed podmiany na `reveal_new`, i wyrównać jego głośność do pozostałych plików. Poprzedni plik odnaleźć w historii repozytorium.
- [x] 04. Okno utraty połączenia pokazuje przetłumaczony komunikat, nie klucz tłumaczenia.
- [ ] 05. Przycisk do pojedynku jest widoczny od ekranu „Rozpocznij grę”, ale nie można go nacisnąć przed rozpoczęciem aktywnego pojedynku.
- [x] 06. „Zacznij od nowa” nie jest blokowane przez dźwięki, animacje ani rozłączenie urządzeń. Restart musi bezpiecznie zakończyć poprzedni przebieg, bez późniejszych akcji z jego kolejki.
- [ ] 07. Przy rozpoczęciu rundy przejście rundy i reveal kończą się razem. Dłuższy dźwięk rozpoczyna się wcześniej; animacja zmiany planszy trwa podczas reveal.
- [ ] 08. Prowadzący dostaje informację, kiedy można oddać kontrolę drugiej drużynie.
- [x] 09. Na początku finału najpierw gra muzyka finału, następnie przejście rundy i reveal zsynchronizowane na koniec. Plansza zmienia się podczas reveal. To kolejność doprecyzowana w końcowej części uwag.
- [x] 10. Wskaźnik drużyny zwycięskiej pozostaje zapalony do końca gry, również na ekranie wyniku.
- [ ] 11. Odsłanianiu odpowiedzi towarzyszy przywrócony stary reveal. Sprawdzić rundy i finał, aby nie zostały niespójne reguły odtwarzania.
- [x] 12. Brak odpowiedzi odsłania odpowiedź i zero automatycznie, z samym dźwiękiem błędnej odpowiedzi. Pudło z wpisanym tekstem odsłania się jak normalna odpowiedź z reveal; zero odsłania operator osobno, wtedy gra dźwięk błędnej odpowiedzi. Powtórzenie daje zero.
- [x] 13. Suma finału jest stale pokazywana w banku na górze planszy, także przy przejściach i po ponownym podłączeniu.
- [x] 14. Od rozpoczęcia finału znika wynik drużyny przeciwnej. W jego miejscu pojawia się odliczanie; po zatrzymaniu lub wygaśnięciu zegara pozostaje puste miejsce. Wynik zwycięskiej drużyny pozostaje widoczny.
- [x] 15. Między graczami finału pozostaje dźwięk przejścia rundy. Nie odtwarzać muzyki finału w tym przejściu.
- [x] 16. „Zakończ finał” pokazuje logo, punkty albo kwotę z muzyką finału i reveal zsynchronizowanymi na koniec, bez przejścia rundy. „Zakończ grę” odtwarza tylko outro.
- [x] 17. Przy końcu gry bez finału (ustawienie bez finału, osiągnięcie progu lub wyczerpanie pytań) nie odsłaniać pozostałych odpowiedzi. Zablokować dalszą rozgrywkę; „Przejdź do zakończenia gry” gra przejście rundy z reveal i pokazuje wynik. Następne „Zakończ grę” odtwarza tylko outro.
- [x] 18. Podpowiedź „Wybierz subskrybenta…” umieścić pod listą „Aktualnie udostępnione dla”.
- [x] 19. Usunąć znikanie i ponowne pojawianie się listy „Aktualnie udostępnione dla”; ustalić przyczynę przebudowy lub warunkowego ukrywania.
- [ ] 20. Zdiagnozować pomijanie klatek animacji, sprawdzić renderer i zapis nagrań. Zweryfikować wdrożoną stronę; nie uznawać płynności na podstawie samych asercji gry.
- [x] 21. Wpisywanie nowej treści w polu oznaczonym jako powtórzenie zdejmuje oznaczenie. Samo ustawienie kursora nie zmienia powtórzenia. Umożliwić powrót do pominiętych pytań i poprawę odpowiedzi przed końcem czasu.

## Instrukcja — uwagi z lokalnego pliku

- [x] M01. Zachować dotychczasowe sekcje i nazwy systemu, bez nazw technicznych i bez treści o nagraniach.
- [x] M02. Usunąć podział urządzeń na „Krok 1/2/3”; pozostawić nagłówki „Wyświetlacz”, „Prowadzący i Przycisk”, „Dźwięk”.
- [x] M03. Telewizor, pominięcie Prowadzącego, fizyczny Przycisk i rozłączenie opisać jako pogrubione informacje we właściwych sekcjach, nie osobne kroki.
- [x] M04. Usunąć nieaktualny akapit o „Czarnym ekranie” i powtórzony opis HDMI. Nazwy drużyn opisać zgodnie z punktem 01.
- [x] M05. Przy nazwach przycisków przywrócić ikony: podłączenie urządzenia, ponowne rozpoczęcie gry oraz skróty klawiaturowe, z symbolami ⇧ i ⌘ dla Maca.
- [x] M06. Rozróżnić samodzielny TV i HDMI: przy HDMI wybrać właściwe wyjście dźwięku w systemie komputera; źródło „Wyświetlacz” służy odtwarzaniu na osobnym urządzeniu.
- [x] M07. Uzupełnić ponowne losowanie pytań rund i finału oraz link do sekcji Ustawień rozgrywki.
- [x] M08. Rozpoczęcie gry opisać przed rundami. Używać nazwy dźwięku obecnej w ustawieniach, zamiast „dźwięk większej zmiany planszy”.
- [x] M09. Informacje Prowadzącego umieścić przy odpowiednich etapach panelu i Wyświetlacza. Zasłona chroni pytania i odpowiedzi przed przypadkowym zobaczeniem przez graczy; po pojedynku pytanie jest jawne.
- [x] M10. Rozróżnić wpis gracza od wybranej odpowiedzi przy informacji „Gracz 1”. Opisać powrót do pytań i możliwość poprawienia powtórzenia.
- [x] M11. Outro opisać razem z pozostałymi dźwiękami; zamiast osobnej podsekcji podać limity kategorii: 5 s, 30 s i 2 minuty.
- [x] M12. Ujednolicić opis finału, zakończenia bez finału i restartu z poprawionym działaniem. Zachować notki „Ważne”, „Uwaga”, „Wskazówka”.
- [x] M13. Sekcję Ankiety pozostawić poza ponowną redakcją; zachować ostatnio dodany opis TV i QR.
- [x] M14. Dodać organizację finału: możliwość udziału zawodnika drugiej drużyny za zgodą zwycięzców oraz przygotowanie miejsca i słuchawek dla oczekującego gracza.
- [x] M15. Dla każdego gracza finału osobno opisać przygotowanie, wpisywanie i odsłanianie. Dodać uwagę o dobraniu liczby pytań do progu, żeby nie skończyć rund bez finału przypadkiem.

## Sprawdzenie i wdrożenie

- [x] Wybrane testy przejść, dźwięków, Przycisku, Wyświetlacza i wpisywania finału.
- [ ] Wdrożenie zmian na `main` i potwierdzenie publikacji strony oraz Workera.
- [ ] Testy produkcyjne właściwych przypadków, z resetem limitów i blokad przed ponowną wysyłką maila na ten sam adres.
- [ ] Nowe nagrania przypadków zmienionych przez tę listę i zapis pomiarów animacji.
- [x] Zaktualizowana osobna instrukcja MD i HTML do sprawdzenia.

## Dziennik pracy

Lista utworzona przed zmianami. Lokalne uwagi użytkownika w instrukcji zachowane; stan źródłowy należy zabezpieczyć przed jej redakcją.

W toku: reguły dźwięków i blokad, Wyświetlacz, powtórzenie, informacja Prowadzącego o oddaniu kontroli oraz udostępnianie. Pierwsze uruchomienie wybranych testów: 92 zaliczone, 12 niezaliczonych; część oczekiwań opisuje poprzednie reguły i wymaga aktualizacji. Nie jest to jeszcze wynik końcowy ani potwierdzenie wdrożenia. Kopia lokalnego manuala z uwagami została zapisana przed redakcją w `/tmp/control2-manual-feedback-original.md`.

2026-10-06: użytkownik potwierdza płynne działanie starego systemu na żywo i wskazuje nagranie jako przyczynę pomijania klatek. Wstrzymujemy zmiany wydajności renderera do porównania tego samego scenariusza produkcyjnego z `record_video=true` i `record_video=false`. Wycofano dodatkowe filtrowanie zapisów kropek SVG, żeby nie zmieniać renderowania na podstawie samego filmu. Anulowanie animacji przy restarcie pozostaje osobną poprawką funkcjonalną.

Sprawdzone lokalnie: przywrócony reveal ma głośność −16,43 LUFS (mediana porównanych dźwięków −16,15 LUFS); pomiary w `control2-reveal-loudness.json`. Wybrane testy przejść, dźwięków, banku i zegara finału oraz anulowania restartu przechodzą. Instrukcja MD i HTML została uzupełniona na podstawie lokalnych uwag; sekcja Ankiety zachowana. Wdrożenie i nowe nagrania pozostają do wykonania.

Porównanie nagrywania na tej samej wersji produkcyjnej `008a24cc0d1689f60d02befda98211ee9883e16e`, scenariusz `01-rundy-mechanika`: zapis filmu — Actions 37380727168; bez zapisu — Actions 37380767772. Przebiegi są szeregowe i nie wdrażamy zmian pomiędzy nimi. Wyniki nie są jeszcze dostępne.

Porównanie — przebieg z nagrywaniem 37380727168 zakończony poprawnie: FFmpeg zapisał 9693 klatki, w tym 7369 powielonych (około 76%), 48 odrzuconych. W logu jest ostrzeżenie o blokującej się kolejce wejścia X11 (`thread_queue_size=8`). Jednocześnie odstęp klatek przeglądarki p95=16,7 ms, maksimum=33,4 ms, zero przerw ponad 50 ms, minimum wolnej pamięci około 14,25 GB. To wskazuje na przechwytywanie filmu; nie dowodzi, że użytkownik ma taki problem na żywo. Wynik bez nagrywania jeszcze oczekiwany.

Przygotowana poprawka nagrywania: kolejka obrazu 128 pakietów zamiast 8, osobna kolejka dźwięku, krótsze buforowanie/probowanie dźwięku, 60 klatek/s oraz kodowanie bez oczekiwania na przyszłe klatki. Liczniki klatek powielonych i odrzuconych zapisujemy obok pomiarów przeglądarki. Zmiana wymaga osobnego sprawdzenia produkcyjnego. Dokumentacja opcji: https://ffmpeg.org/ffmpeg.html oraz https://ffmpeg.org/ffmpeg-devices.html#pulse.

Końcowy wybrany zestaw lokalny: 114 testów zaliczonych, zero niezaliczonych. Oddzielna kontrola MD/HTML potwierdziła zachowanie sekcji Ankiety bez zmian i usunięcie roboczych adnotacji.

Przebieg bez nagrywania 37380767772 również zakończony poprawnie. Porównanie tej samej wersji i scenariusza: z filmem p95=16,7 ms, maksimum=33,4 ms; bez filmu p95=16,8 ms, maksimum=33,3 ms. W obu zero przerw ponad 50 ms i dwa długie zadania. Nagrywanie nie pogorszyło istotnie pomiaru klatek przeglądarki; powielanie klatek następuje w przechwytywaniu/zapisie. Poprawkę nagrywania sprawdzamy przed pełnym kolejnym cyklem.

Stan po publikacji: poprawki punktów 01–19 i 21 wdrożone przez Pages 37383003127 (sukces). Checkboxy działania pozostają otwarte do zakończenia weryfikacji produkcyjnej. Testy produkcyjne: 37383587398 (in_progress). Pierwsze uruchomienie 37383354283 zatrzymał błędnie przekazany filtr powłoki, przed właściwą weryfikacją; filtr poprawiono. Nowe filmy po poprawkach jeszcze niegotowe.

## Dodatkowa uwaga TV — 2026-10-06

- [x] 22. Zastąpić obrazkowe logo tekstowym „FAMILIADA” w górnym pasku, jak na pozostałych stronach. Usunąć gradient strony: jednolite tło `#050914`. Pole kodu i złoty przycisk mają korzystać ze stylów systemu; zaznaczenie pola bez grubej obwódki. Zachować wygodne rozmiary i obsługę pilota.

Pierwszy film po naprawie zapisu (37383797709) jest gotowy: 60 klatek/s, 17474 klatki, 122 powielone i 120 odrzuconych (około 0,7% każde), zamiast około 76% powielonych. Zmiana istotnie poprawiła przechwytywanie; pełny cykl nagrań pozostaje do wykonania.

- [x] 23. Dodać zmianę języka w górnym pasku TV: Polski, English i Українська. Przetłumaczyć formularz, tytuł i wszystkie komunikaty; zachować wybór po odświeżeniu i przekazać język do otwieranego ekranu. Obsłużyć menu pilotem.

## Doprecyzowania — urządzenia i finał

- Wyłączenie Prowadzącego ma czyścić jego otwarty ekran i zatrzymywać lokalny zegar; gest odsłaniania nie może pokazać poprzedniego przebiegu. Nieaktywne urządzenie nie jest wymagane przez blokadę połączenia.
- Wyłączony Przycisk pozostaje nieaktywny. Baza również odrzuca naciśnięcie, żeby wcześniejsza otwarta strona nie mogła zmienić gry (migracja 299).
- Powtórzenie przy mapowaniu to znacznik braku odpowiedzi: bez osobnego dźwięku przy zaznaczeniu, przy odsłonięciu automatyczne zero i dźwięk błędnej odpowiedzi. Znacznik pozostaje widoczny operatorowi i Prowadzącemu.
- Przed odsłonięciem można zmienić każdą odpowiedź i jej przyporządkowanie: usunąć tekst, po usunięciu tekstu wybrać brak odpowiedzi lub powtórzenie albo uzupełnić brakującą odpowiedź. Zmiana tekstu unieważnia poprzedni wybór. Edycja jest możliwa przed rozpoczęciem zegara i po upływie czasu; istniejące blokady połączenia/przejść pozostają. Po odsłonięciu odpowiedź jest zamrożona.
- Wynik finału (logo/punkty/kwota) odsłania się podczas reveal. Reveal i muzyka finału kończą się razem; dłuższy dźwięk zaczyna pierwszy. Outro pozostaje osobną akcją.

Weryfikacja poprzedniego wdrożenia: produkcja 37383587398 — 7 przypadków zaliczonych, 1 niezaliczony (restart podczas intro; trwa sprawdzenie przyczyny). Pełny cykl nowych filmów nadal nieukończony.

Doprecyzowanie dostępności: tekst w polu blokuje brak odpowiedzi i powtórzenie; puste pole udostępnia tylko brak odpowiedzi oraz powtórzenie (gracz 2). Reguła obowiązuje w panelu i w silniku, także dla skrótów klawiaturowych.

Restart: ustalona przyczyna produkcyjnego błędu — opóźnione odczytanie długości intro ustawiało blokadę ponownie po jej zdjęciu przez restart. Stare przejścia i potwierdzenia blokady sprawdzają teraz generację przebiegu; po restarcie są ignorowane. Wybrane testy doprecyzowań: 78/78 zaliczonych. Zmiany oczekują na publikację i test produkcyjny.

Końcowy wybrany zestaw po doprecyzowaniach i korekcie restartu: 123/123 zaliczonych; pełnego zestawu nie uruchamiano.

Produkcja 37388520578: restart podczas intro, wyłączone otwarte urządzenia (w tym odrzucenie RPC naciśnięcia), wczesne zakończenie finału, własne outro i trzy przypadki TV zaliczone. Pełny finał dochodzi do wyniku 135, ale asercja outro obejmowała także poprawny, opóźniony reveal poprzedniego przejścia. Test poprawiono: najpierw czeka na zakończenie przejścia wyniku i sprawdza final_theme + reveal, potem czyści zapis dźwięków i sprawdza osobne outro. Osobny TV 37388921645: 2 zaliczone, błąd gotowości pilota poprawiony; ponowne sprawdzenie 37389506058.

Stan bieżący po doprecyzowaniach: poprawki opublikowane na main, Pages 37388305640 i 37389302752 — sukces; migracja bazy 299, Actions 37388305144 — sukces. Wybrane testy lokalne 123/123. Produkcyjny restart i wyłączone otwarte urządzenia zaliczone. TV po poprawce gotowości pilota: 37389506058 — sukces, trzy testy. Pełny finał ponownie sprawdzany przez 37389738165. Pełny cykl dziesięciu filmów (60 klatek/s, ze statystykami przechwytywania): 37389738480 — uruchomiony; nie jest jeszcze gotowy ani oceniony wizualnie.

Nowe uwagi w lokalnym manualu (kopię adnotacji zachowano przed redakcją): poprawione MD i HTML, nazwa dźwięku przywrócona jako Odsłanianie, przyciski i ikony przejrzane we wszystkich trzech językach instrukcji. Zatwierdzony fragment Ankiet przeniesiono do polskiej instrukcji; Ankiety usunięto z dokumentu do sprawdzenia. Status „z listy” jest zielony, a przekreślenie pozostaje tylko na wybranej odpowiedzi. Tablet Prowadzącego czyści się również przy zakończeniu bez finału. Wybrane testy Hosta: 3/3. Mnożniki nadal przyjmują dodatnie liczby całkowite — zapis 0,5 nie jest obsługiwany.

Nagrania: z 37389738480 dostępne 01–06; pełny finał ponownie sprawdzony przez 37389738165 (sukces). Dogrywka 37393196812 zakończona poprawnie — 08–10, w tym faktyczny e-mail otrzymany po około 56,6 s po resecie limitów. Przy kompletowaniu plików wykryto, że 07 było na końcu kolejki scenariuszy, więc awaria 08 zatrzymała pierwszy przebieg przed 07. Dogrywka 07: 37395118136. Skrypt sortuje odtąd scenariusze według numerów. Wcześniejsza informacja o gotowym komplecie 10 filmów była przedwczesna.

Końcowe potwierdzenie tej korekty: Pages 37395005185 i 37395413671 — sukces. Produkcyjne zasoby zawierają przyciski i ikony we wszystkich trzech językach oraz Odsłanianie w polskich ustawieniach. Produkcja 37395415616 — 3/3 zaliczone: nazwa w Podsumowaniu i Ustawieniach, status „z listy” bez przekreślenia, wybrana odpowiedź nadal przekreślona, czyszczenie Hosta przy końcu bez finału.

Dogrywka 07 zakończona sukcesem (37395118136, ponowienie po przejściowym błędzie GitHub Pages). Komplet 10 MP4 i raportów zebrany w ignorowanym przez Git katalogu `tests/recordings/2026-10-06/`, galeria `index.html`. Film 07 jest po ostatnich poprawkach manuala/Hosta; 01–06 i 08–10 pokazują wcześniejszą nazwę dźwięku i wygląd Hosta. Szczegóły wersji i źródła nagrań w przewodniku.

Weryfikacja instrukcji: wszystkie robocze uwagi z bieżącej korekty rozstrzygnięte, ikony pochodzą z zestawu aplikacji, przyciski poprawione w PL/EN/UK. HTML do przeglądu ma poprawne ścieżki obrazów i działające odnośniki do sekcji. Aktualna zmiana M13: po zatwierdzeniu Ankiet opublikowano polski fragment TV i usunięto Ankiety z plików do przeglądu. Nowe opisy Panelu i Ustawień rozgrywki pozostają osobnym materiałem do akceptacji.

Film 02 jest powtarzany przez 37396346583: skrypt czeka teraz na zakończenie wejścia planszy finału, a dopiero potem pozostawia ją przez cztery sekundy. Poprzedni stały czas czterech sekund mógł uciąć przejście. Pozostałych dziewięciu filmów nie powtarzamy.

Film 02, dogrywka 37396346583 — sukces. Lokalną galerię zaktualizowano do najnowszego pliku; jest komplet 10 MP4 i 10 raportów. Przewodnik wskazuje pochodzenie filmów i różnice wersji: 02 i 07 są po ostatniej korekcie nazwy i Hosta, pozostałe z wcześniejszego przebiegu. Nie twierdzimy, że starsze filmy przedstawiają ostatnie drobne zmiany instrukcji/Hosta.
