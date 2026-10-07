# Control2 — druga runda uwag do nagrań, 6 października 2026

Zaznaczenia oznaczają wprowadzone poprawki. Wyniki testów i oczekiwanie
na wizualną ocenę nowych filmów są opisane osobno na końcu.

- [x] 1. Usunąć podpowiedzi skrótów z ekranów rozpoczęcia rundy i innych
  ekranów wprowadzających, które nie mają kolumny podpowiedzi.
- [x] 2. Napis gestu odsłaniania na zasłonie Hosta: kolor kropek z ustawień
  oraz czcionka aktualnego motywu, również nowoczesnego.
- [x] 3. Pod rozdzielnikiem podpowiedzi dodać nagłówek „Skróty klawiszowe:”.
- [x] 4. Stała lista skrótów w mapowaniu, bez zmian zależnych od chwilowego
  zablokowania przycisków. Dwa warianty: gracz 1 i gracz 2; drugi ma Powtórzenie.
- [x] 5. Skrócić podpowiedzi przy odsłanianiu odpowiedzi i punktów.
- [x] 6. Sprawdzić i uporządkować wpisywanie gracza 2 w filmie 04.
- [x] 7. Film 05: sprawdzić długie odsłanianie 36 punktów oraz końcową
  planszę pojawiającą się za późno względem dźwięków i outro.
- [x] 8. Porównać ze starym Control; zmiana planszy ma dzielić czas reveal
  na dwie równe części: znikanie i pojawianie. Zachować uzgodnione dźwięki
  oraz synchronizację końców reveal i dźwięku towarzyszącego.
- [x] 9. Powiększyć niestandardowe logo na zasłonie Hosta.
- [x] 10. Usunąć angielski komunikat o zasłanianiu na dole Hosta w polskiej grze.

## Ustalenia z nagrań

W raportach wydajności 04 i 05 ostatnie odsłanianie punktów używa różnych
czasów docelowych: około 1824 ms w 04 i 4500 ms w 05. Animacja realizuje
zlecony czas; w 05 zapis FFmpeg ma 0 pominiętych klatek. Nie uznajemy
tego za potwierdzenie synchronizacji z faktycznym dźwiękiem. Sprawdzamy
pomiar czasu i wspólną kolejność przejść.

Wpisywanie gracza 2 w 04 zawiera sprawdzanie powtórzenia przez zaznaczenie,
wpisanie „Nowa odpowiedź”, wyczyszczenie i ponowne zaznaczenie. Scenariusz
wymaga czytelniejszego przebiegu; sam test zachowania przy zmianie treści
musi pozostać sprawdzony.

## Wprowadzone poprawki

1–4: skróty pozostają tylko w istniejącej kolumnie podpowiedzi. Nagłówek
ma dwukropek. Mapowanie pokazuje stały zestaw: 1–6, W, O, Enter, N, B, M;
gracz 2 dodatkowo R. Lista nie zależy od blokady ani wyboru odpowiedzi.
Usunięto również drugi, powielony zestaw przy wpisywaniu.

5: skrócono komunikaty odsłaniania do kolejnej czynności: sprawdzenie
dopasowania, pokazanie odpowiedzi, pokazanie punktów albo przejście dalej.

6: nagranie 04 nie miesza już wpisywania z demonstracją kasowania znacznika
powtórzenia. Sprawdzenie edycji pozostaje w teście produkcyjnym pełnego finału.

7–8: nowy Control i Display mierzą długość z dekodowanego pliku, zamiast
utrwalać pierwszy szacunek metadanych MP3. Pomiar jest przygotowywany przed
graczem; jego pamięć zależy od źródła dźwięku, więc podmiana pliku zmienia
pomiar. Stary Control i Display korzystają nadal ze swojego dotychczasowego
pomiaru. Przejścia planszy mają dwie równe połowy reveal: znikanie starej
planszy i pojawianie nowej. Przy dłuższym dźwięku towarzyszącym najpierw
czekają na początek reveal, a nie wykorzystują tego czasu na znikanie.
To dotyczy również wyniku końcowego oraz zasłaniania/odtwarzania gracza 1.
Różnica pomiarów w starych raportach nie dowodzi sama przyczyny: potwierdzenie
synchronizacji wymaga nowego przebiegu na produkcji.

9: logo niestandardowe jest dopasowane do obszaru rzeczywiście zajętego
przez jego piksele, zamiast do całej pustej siatki 150×70.

2, 10: napis na zasłonie korzysta z koloru DOT i czcionki motywu.
Zmiana języka odświeża też komunikaty gestów. Dolny komunikat już używał
klucza tłumaczenia; potwierdzenie braku angielskiego napisu wymaga przebiegu
z przełączeniem języka.

Weryfikacja lokalna: 24 testy dotyczące odsłaniania, intro/przejść, Hosta,
podpowiedzi i dekodowanego pomiaru czasu; bez pełnego zestawu testów.
Statusy na liście pozostają otwarte do weryfikacji produkcyjnej.

Dodatkowo potwierdzono błąd 05 testem regresji: jeśli ostatnie punkty i
„Zakończ finał” dotrą w jednym odczycie, stare odsłonięcie korzystało z
nowego dźwięku `final_theme` (około 4,5 s). Teraz zaległe punkty są uzupełniane
bez animacji, a animowane jest bieżące przejście do wyniku. Nie opóźnia go
ponowne odtwarzanie zaległej zmiany. Test lokalny odtwarza dokładnie ten
przypadek. Łącznie 25 wybranych testów lokalnych.

## Weryfikacja produkcyjna

- [Pierwszy przebieg](https://github.com/Andrish97/familiada/actions/runs/37527205815):
  pełny finał (10 pytań, powtórzenie, gracz 2) i zmiana języka Hosta przeszły.
  Komunikaty gestów sprawdzone po polsku, po angielsku i ponownie po polsku.
  Test wcześniejszego finału odczytał statystyki przed zakończeniem zapisu:
  ekran był już widoczny, ale w bazie jeszcze status `playing`.
- [Powtórzony test wcześniejszego finału](https://github.com/Andrish97/familiada/actions/runs/37528587088):
  przeszedł bez ponawiania po dodaniu oczekiwania na zatwierdzony zapis.
  Sprawdzono wynik 500:0, finał 200 punktów i nagrodę 26500.
- [Wdrożenie końcowych podpowiedzi](https://github.com/Andrish97/familiada/actions/runs/37528796752): zakończone poprawnie.
- [Nowe nagrania 04, 05 i 07](https://github.com/Andrish97/familiada/actions/runs/37529078347):
  uruchomione po testach, na produkcji. Galeria lokalna:
  `tests/recordings/2026-10-06-runda-2/index.html`. Pobranie i sprawdzenie
  obecności obrazu oraz dźwięku wykonywane automatycznie po zakończeniu.
  Wizualna ocena synchronizacji, wyglądu logo i czytelności przebiegu pozostaje
  do obejrzenia w tych nowych filmach; wyniki testów nie zastępują tej oceny.

## Dalsze ustalenia: wspólne potwierdzenie zakończenia

- Skróty ukryte także na ekranach urządzeń i podsumowania ustawień.
- Przy wpisywaniu gracza 2 Powtórzenie działa jednym kliknięciem. Każde
  kolejne kliknięcie odtwarza dźwięk ponownie; nie zdejmuje oznaczenia.
  Shift+Enter działa tak samo. Znacznik usuwa wpisanie tekstu.
- Panel czeka na rzeczywiste zakończenie rysowania Display przy każdej
  zmianie etapu lub akcji z dźwiękiem/animacją, a nie wyłącznie na czas pliku.
  Display potwierdza cały numer zmiany po zakończeniu `renderSnapshot` lub
  `renderDiff`. Równoległe animacje punktów i sumy mają jedno potwierdzenie,
  po zakończeniu obu. Błąd albo anulowanie rysowania nie wysyła potwierdzenia.
- Starsze potwierdzenie nie odblokowuje nowszej zmiany. Zagubioną odpowiedź
  Display ponawia bez ponownego uruchamiania animacji.
- Panel sprawdza też rzeczywisty stan odtwarzania dźwięków. Gdy dźwięk
  gra na Display, jego potwierdzenie czeka również na koniec odtwarzania.
- Dotyczy finału, rund, wejść plansz oraz zakończeń. Ostatnia punktowana
  odpowiedź kończy odsłanianie i animację sumy przed możliwością przejścia
  do wyniku. Przy zakończeniu rund bez finału nadal pomijamy odsłanianie
  pozostałych odpowiedzi. Restart zachowuje możliwość przerwania przebiegu.
- Buzzer czeka na to samo potwierdzenie; baza odrzuca zgłoszenie podczas
  niedokończonej zmiany planszy oraz przedwczesne zakończenie rund/finału.
- Migracja 305 dodaje osobną tabelę potwierdzeń i sprawdzanie klucza Display.
  Właściciel może odczytać postęp, ale zwykły klient nie może sam zapisać
  potwierdzenia do tabeli. Potwierdzenie usuwa się wraz ze stanem gry.
- Migracja i sprawdzenia SQL: przebieg
  https://github.com/Andrish97/familiada/actions/runs/37536059271 zakończony poprawnie.
- Lokalnie: 54 wybrane testy, w tym dwie równoległe animacje/jedna odpowiedź,
  anulowanie, spóźnione potwierdzenie i ponowne odtwarzanie Powtórzenia.
- Sprawdzenie produkcyjne obejmie dodatkowo celowe zatrzymanie odpowiedzi
  Display po zakończeniu animacji i dźwięku; panel oraz Buzzer mają pozostać
  zablokowane do doręczenia potwierdzenia.

### Wyniki po wdrożeniu wspólnego mechanizmu

- [Wdrożenie panelu i urządzeń](https://github.com/Andrish97/familiada/actions/runs/37539027794): poprawne.
- [Pierwsze cztery sprawdzenia produkcyjne](https://github.com/Andrish97/familiada/actions/runs/37537192566):
  wcześniejszy finał i zakończenie rund bez finału przeszły. Pełny finał ujawnił
  wyprzedzanie kliknięcia Powtórzenia przez późniejsze wpisywanie, gdy klik
  czekał na zapis poprzedniej edycji. Panel rezerwuje teraz tę akcję od razu;
  późniejsze wpisywanie nie może jej wyprzedzić i zgubić startu timera.
  Test opóźnionego potwierdzenia miał limit 20 s przy intro trwającym około
  20,7 s; oczekiwanie w teście dostosowano do pełnego intro.
- [Powtórzenie dwóch przypadków](https://github.com/Andrish97/familiada/actions/runs/37539470756):
  **2/2 przeszły bez ponawiania**. Pełny finał sprawdził ponowne odtworzenie
  dźwięku Powtórzenia z zachowaniem oznaczenia, zdjęcie oznaczenia przez tekst,
  oba timery i mapowanie obu graczy. Drugi test zatrzymał żądanie potwierdzenia
  po zakończeniu rysowania: Buzzer i kolejna odpowiedź operatora pozostawały
  niedostępne mimo zakończenia czasu dźwięku. Doręczenie odpowiedzi je odblokowało.
- Łącznie cztery wybrane scenariusze sprawdzone na rzeczywistej produkcji;
  bez uruchamiania całego zestawu E2E.
- Żądania potwierdzeń mają limit czasu sieciowego i ponawianie. Przekroczenie
  limitu **nie** oznacza zakończenia animacji i **nie** odblokowuje rozgrywki.
  Display nie zgłasza potwierdzenia dla tymczasowego stanu rev=0, który może
  być pokazany przed utworzeniem stanu gry przez operatora.
- Poprzednie nagrania 04/05/07 są już pobrane w galerii
  `tests/recordings/2026-10-06-runda-2/index.html`; mają obraz i dźwięk.
  Zostały nagrane przed dodaniem tego wspólnego potwierdzania i nowej obsługi
  Powtórzenia. Nie stanowią filmu z wersji opisanej w tej sekcji.

## Uwagi po ostatnim przeglądzie nagrań — 7 października

- Wspólny modal: nagłówek i dolny pasek pozostają nieruchome, przewija się
  wyłącznie treść. Wdrożono wspólny styl używany przez pozostałe modale.
- Ekran Urządzenia: przewijana jest tylko lista urządzeń; podpowiedź pozostaje
  widoczna, również podczas klikania odtwarzania dźwięku. Na zwykłym ekranie
  układ mieści urządzenia bez przewijania.
- Blokada akcji nie zmienia listy skrótów. W podpowiedziach finału skrócono
  treść; pasek skrótów i separator pozostają przy dolnej krawędzi, a opis
  kroku zajmuje miejsce nad nimi.
- Outro: „Wróć do moich gier” odblokowuje się po 30 sekundach od rozpoczęcia
  zakończenia, nawet jeśli dłuższy plik outro nadal gra. Nie zatrzymuje to
  muzyki ani nie odblokowuje pozostałych akcji. Powrót nie wyświetla pytania
  o opuszczenie gry; Control2 nie rejestruje też ostrzeżenia `beforeunload`.
- Poprzednie nagranie 07 używało testowego JSON-u z napisem „FAMILIADA”, a nie
  logo z ustawień. Test tworzy teraz logo na podstawie
  `web/shared/data/logo_familiada.json`; poprawiono opis w przewodniku.
- Nagranie 04 uruchomiono po wdrożeniu zmian:
  [przebieg na produkcji](https://github.com/Andrish97/familiada/actions/runs/37688425162).
  Film i raport są w `tests/recordings/2026-10-07-uwagi/`. Scenariusz przeszedł;
  raport zapisał 60,01 kl./s, 0 pominiętych klatek i 0 długich zadań Display.
  Film trwa 7:06.9. Pełnego zestawu testów nie uruchamiano.

## Układ Urządzeń i Podsumowania — 8 października

- Na szerokim ekranie karty Urządzeń mają ciaśniejsze odstępy i niższy kod
  parowania, żeby komplet mieścił się bez przewijania przy typowym rozmiarze
  okna. Test parowania sprawdza wysokość listy przy 1366×768.
- Podsumowanie jest podzielone na dwie kolumny. Podgląd Display jest
  wyśrodkowany, ograniczony do 640 px i zachowuje proporcje 16:9, a pozostałe
  ustawienia są rozłożone po obu stronach.
- W mapowaniu finału przywrócono pełną wysokość panelu podpowiedzi. Pasek był
  elementem widoku, który przesunął się wraz z kartą; nie był paskiem
  przewijania wymagającym usunięcia.
- Odsłuch dźwięku w Podsumowaniu nie blokuje przycisku przejścia do gry.
  Jedno kliknięcie uruchamia lub zatrzymuje podgląd; przejście zatrzymuje
  odsłuch. W Ustawieniach rozgrywki i Podsumowaniu
  przyciski odtwarzania oraz suwaki głośności mają wspólny wygląd; podczas
  odsłuchu ikona zmienia się z trójkąta na kwadrat zatrzymania.
- Jeśli źródłem dźwięku jest Wyświetlacz, przycisk rozpoczęcia gry pozostaje
  zablokowany do chwili odblokowania dźwięku na tym urządzeniu. Wyświetlacz
  zgłasza ten stan w heartbeat. Krótka informacja o blokadzie jest w
  podpowiedzi kafelka „Dźwięk” w kroku Urządzenia; Podsumowanie nie pokazuje
  dodatkowego komunikatu, więc jego przyciski nie zmieniają położenia. Przycisk
  odblokowania jest widoczny na Wyświetlaczu od początku do kliknięcia i znika
  dopiero po potwierdzeniu zgłoszenia przez serwer. Przy problemie z
  połączeniem zostaje dostępny do ponowienia. Jeśli Control utraci i odzyska
  połączenie podczas gry, ponownie wyświetla przycisk na Display i blokuje
  akcje aż do kliknięcia. Potwierdzenie wraca osobnym komunikatem realtime,
  więc blokada schodzi bez odświeżania strony; heartbeat pozostaje kontrolą
  zapasową.
- Przy losowym finale pytania są losowane najpierw z puli rund i usuwane z
  rund. Ponowne losowanie zwraca poprzednie pytania finału na koniec puli rund,
  po czym losuje nowy zestaw. Podsumowanie pokazuje obie pule po tym podziale.
- Potwierdzanie kafli rozgrywki opiera się na widocznym zaznaczeniu i kolejnym
  tapnięciu, a nie na natywnym podwójnym kliknięciu przeglądarki. Kafle używają
  `touch-action: manipulation`, aby dotyk działał tak samo przewidywalnie.
