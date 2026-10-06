# Control 2 — uwagi po obejrzeniu nagrań, 6 października 2026

Źródło: nowa lista użytkownika z rozmowy. Dokument oddziela zgłoszenia od potwierdzonego stanu i propozycji. Na tym etapie zapisujemy wymagania i rozstrzygnięcia; zmiany działania gry będą wdrażane w kolejnym przebiegu. Pierwszego Wyświetlacza nie zmieniamy.

## Lista do realizacji

### 01. Zera obok nazw drużyn przed grą

- [ ] Na ekranie nazw drużyn przed rozpoczęciem właściwej planszy nie pokazywać zer w lewym i prawym polu wyników.
- Nazwy drużyn pozostają widoczne na etapie z przyciskiem Rozpocznij grę. Pola wyników aktywować dopiero na właściwym etapie rund.
- Sprawdzenie: gotowość przed grą, intro, pierwsza runda oraz restart.

### 02. Podpowiedź o oddaniu kontroli

- [ ] Informację o możliwości oddania kontroli wyświetlać na czerwono i podkreśloną **wyłącznie na tablecie Prowadzącego**. Podpowiedź w Control zachowuje zwykły styl.
- [ ] Uzupełnić opis tabletu Prowadzącego w manualu MD i HTML: znaczenie i wygląd tej podpowiedzi. Styl czerwony i podkreślenie nie dotyczą Panelu sterowania.
- Podpowiedź pozostaje w istniejącym miejscu; bez nowego banera.

### 03. Blokada rundy przy przejściu do zakończenia gry

- [ ] Gdy przycisk rundy brzmi Przejdź do zakończenia gry, zablokować pozostałe akcje rozgrywki: odpowiedzi, X, zegar i oddanie kontroli.
- Blokada musi obowiązywać również w obsłudze akcji, nie tylko wizualnie. Zachować dostęp do restartu i narzędzi panelu.
- Sprawdzenie: finał wyłączony i osiągnięty próg; brak dalszych pytań, także przy włączonym finale bez kwalifikacji.

### 04. Buzzer podczas przejścia planszy

- [ ] Przycisk ma przyjmować naciśnięcia dopiero po zakończeniu dźwięku i animacji wejścia rundy.
- [ ] Nagranie ma czekać na rzeczywistą gotowość, zamiast naciskać po arbitralnej pauzie.
- W kodzie istnieją blokady klienta i RPC `game_state_buzzer_press`. Nie uznajemy więc z góry, że to wyłącznie błąd skryptu. Sprawdzić okno pomiędzy zapisem nowego etapu a osobnym ustanowieniem blokady dźwięku, oraz odświeżenie stanu Przycisku.
- Sprawdzenie: próba naciśnięcia w pierwszej chwili przejścia, w środku animacji i po jej końcu. Odrzucona próba nie może rejestrować zgłoszenia ani odtwarzać buzzera.

### 05. Szybsze przejście od zgłoszenia drużyny do odpowiedzi

- [ ] Zachować bezpieczne zatwierdzenie drużyny, ale skrócić czas do dostępności X i odsłonięcia odpowiedzi.
- Potwierdzone: `ACCEPT_BUZZ` nie odtwarza kolejnego dźwięku. Zbadamy czas zapisu i odświeżenia panelu, a nie dodamy dodatkowego przejścia.
- Nagrania sztucznie wydłużają tę sekwencję: `armAndConfirmPaced` czeka 1,8 s przed potwierdzeniem i domyślnie 3,4 s po akcji. Te pauzy nie są wymaganym czasem reakcji aplikacji. Dla zatwierdzenia zgłoszenia należy zastosować krótszy przebieg demonstracyjny, z zachowaniem wymaganej gotowości.
- Propozycja: po zatwierdzeniu i potwierdzonym zapisie od razu udostępniać odpowiedzi/X; nie oczekiwać ponownie na dźwięk buzzera, który już zagrał przy naciśnięciu.

### 06. Końcówka skróconej odpowiedzi

- [ ] Przy urywaniu słowa skracać końcówkę jeszcze o jedną lub dwie samogłoski, jeśli na nich kończy się fragment przed kropką. Obsłużyć PL, EN i UK, wielkość liter oraz znaki narodowe.
- Zachować limity 17 znaków w rundach i 11 w finale, razem z kropką.
- Zachować poprzednią regułę: jeżeli granica wypada przy spacji lub interpunkcji, nie dopisywać kropki ani nie skracać prawidłowo zakończonego słowa. Pełny wpis pozostaje w panelu i na tablecie Prowadzącego.
- [ ] Zaktualizować uwagę o skracaniu w manualu MD i HTML po wdrożeniu.
- Sprawdzenie: urwane słowo kończące się jedną lub dwiema samogłoskami, końcówka spółgłoskowa, granica słowa, interpunkcja i odpowiedzi mieszczące się w całości.

### 07. Przejście między rundami finału

- [ ] Zmiana planszy ma trwać tyle, ile przypadający na nią dźwięk Odsłanianie. Następna czynność nie może ruszać przed rzeczywistym zakończeniem przejścia.
- Potwierdzić osobno rozpoczęcie pierwszej rundy finału, przejście do drugiego gracza i ekran wyniku. Sprawdzić czas samej animacji oraz moment jej uruchomienia, a nie tylko długość blokady w Control.
- [ ] Skrypt nagrania ma czekać na zakończenie wejścia planszy i gotowość pól/przycisków, bez stałego zastępczego opóźnienia.

### 08. Stabilne wpisywanie i obowiązkowy timer finału

- [ ] Przyciski Powtórzenie i timera nie mogą mrugać ani być zastępowane nowymi elementami DOM po każdym wpisanym znaku. Zachować fokus, pozycję kursora i zaznaczenie.
- [ ] Każda runda finału wymaga uruchomienia timera przed przejściem do dopasowania. Dalej zablokowane przed pierwszym uruchomieniem i podczas odliczania; warunek egzekwować także w silniku.
- [ ] Ręczne zatrzymanie dozwolone tylko wtedy, gdy żadne z pięciu pól tekstowych nie jest puste po usunięciu białych znaków. Dotyczy kliknięcia i skrótu. Sam znacznik Powtórzenie nie wypełnia pola tekstowego.
- Po naturalnym wygaśnięciu czasu można przejść dalej mimo braków. Zachować możliwość poprawienia i uzupełnienia wpisów przed odsłonięciem.
- [ ] Uaktualnić manual i scenariusz nagrania 05.
- Potwierdzone: obecne nagranie 05 rzeczywiście pomija timer i wpisuje tylko jedną odpowiedź. Nie jest to efekt ukrytego odliczania. Obecnie Dalej blokuje tylko uruchomiony timer; nie wymaga jego wcześniejszego startu. W obecnym graczu 2 powtórzenie jest traktowane jako wypełnienie przy sprawdzaniu wcześniejszego zatrzymania — nowa reguła ma to zmienić.
- Docelowe nagranie 05: start timera, jedna wpisana odpowiedź, naturalny koniec czasu, dopasowanie, osiągnięcie obniżonego progu i ręczne Zakończ finał. Wczesne zakończenie oznacza pominięcie dalszego odsłaniania po progu, a nie skrócenie czasu odpowiadania.

### 09. Przechodzenie tylko między pustymi polami

- [ ] Enter i strzałki mają wybierać kolejne/poprzednie puste pole, z obiegiem między pięcioma pytaniami. Nie nadpisywać istniejących odpowiedzi ani nie skakać do już uzupełnionych pól.
- Puste pole ze znacznikiem Powtórzenie pozostaje kandydatem do nowej odpowiedzi. Gdy nie ma pustych pól, pozostawić fokus w bieżącym miejscu.
- Poprawienie wpisanej odpowiedzi wymaga kliknięcia jej pola. Zachować zwykłe wpisywanie i działanie skrótów specjalnych.
- [ ] Uzupełnić opis klawiatury w manualu MD i HTML po wdrożeniu.

### 10. Powrót do pytania oznaczonego jako powtórzenie

- [x] Propozycja rozstrzygnięcia: pozostawić znacznik do ręcznego zdjęcia lub wpisania nowej odpowiedzi. Sam powrót do pytania, fokus albo brak nowej wypowiedzi nie powinny go kasować.
- Powtórzenie i brak odpowiedzi rozliczają się tak samo: zero punktów. Znacznik zachowuje informację dla operatora i prowadzącego o wcześniejszym zdarzeniu; nie wpływa na wynik.
- Wpisanie nowej treści nadal automatycznie usuwa powtórzenie. Jest to już sprawdzone testem produkcyjnym, ale obecne filmy nie pokazują tej czynności.
- [ ] W kolejnym nagraniu pokazać: powtórzenie → powrót do pola bez zmiany znacznika → nowy tekst usuwa znacznik → puste pole pozwala znów zaznaczyć powtórzenie.

### 11. Skróty bez konfliktu z językiem klawiatury

- [x] Zweryfikowane: Ctrl+Shift może przełączać układ klawiatury Windows. Przeglądarka nie daje gwarancji zablokowania skrótu systemowego. [Odpowiedź moderatora Microsoft](https://learn.microsoft.com/en-ie/answers/questions/3248977/how-to-delete-shortcut-ctrl-shift).
- Zatwierdzone przez użytkownika: **Ctrl+Enter na Windows/Linux, Cmd+Enter na Mac — timer**; **Shift+Enter w pustym polu gracza 2 — Powtórzenie**, oraz zestaw czynności poniżej. Rozszerzenie o inne etapy Control jest częścią planu. Skróty nie są jeszcze wdrożone.
- [ ] Obsłużyć wyłącznie dokładną kombinację i etapy wpisywania finału. Skrót timera nie może jednocześnie przenosić fokusu, zatwierdzać formularza ani wpisywać znaku. Uwzględnić powtarzanie klawisza i komponowanie tekstu.
- [ ] Usunąć reakcję na samo Ctrl+Shift/Cmd+Shift i zaktualizować podpowiedzi oraz manual. Nie gwarantować braku kolizji z indywidualnymi skrótami ustawionymi przez użytkownika.

#### Zatwierdzony zestaw czynności

| Czynność | Windows / Linux | Mac | Zakres |
|---|---|---|---|
| Start lub wcześniejsze zatrzymanie timera finału | Ctrl+Enter | Cmd+Enter | Wpisywanie gracza 1 lub 2; obowiązują reguły punktu 08. |
| Powtórzenie | Shift+Enter | Shift+Enter | Tylko puste pole gracza 2; przełączenie znacznika. |
| Następne puste pole | Enter lub ↓ | Enter lub ↓ | Wpisywanie finału, według punktu 09. |
| Poprzednie puste pole | ↑ | ↑ | Wpisywanie finału, według punktu 09. |
| Odpowiedź z listy | 1–6 | 1–6 | W rundach zaznaczenie; w mapowaniu natychmiastowy wybór dopasowania, bez dodatkowego potwierdzenia. Tylko dostępne pozycje. |
| Zatwierdzenie / odsłanianie | Enter | Enter | W rundach zatwierdza zaznaczony kafelek; w mapowaniu odsłania odpowiedź, a po zakończeniu przejścia — punkty. |
| Zaznaczenie pudła X | X | X | Pojedynek, rozgrywka i kradzież, jeśli pudło jest dostępne. |
| Zaznaczenie odliczania 3 sekund | T | T | Tylko etap rundy z dostępnym przyciskiem timera. |
| Zaznaczenie oddania kontroli | P | P | Tylko runda z dostępną możliwością oddania kontroli. |
| Zaznaczenie dalszego przejścia | N | N | Bieżący, widoczny przycisk nawigacji, zgodnie z tabelą etapów poniżej. |

#### Rozszerzenie na pozostałe etapy Control

| Etap / czynność | Skrót | Działanie |
|---|---|---|
| Urządzenia | N, następnie Enter | Wybranie i uruchomienie dostępnego Dalej. Nie pomija sprawdzania wymaganych urządzeń. |
| Podsumowanie | N, następnie Enter | Gotowe — przejdź do rozgrywki. |
| Podsumowanie: zmiana ustawień | E, następnie Enter | Zmień ustawienia. |
| Dostępny powrót do poprzedniego kroku | B, następnie Enter | Widoczny przycisk Wstecz; nie cofa stanu rozgrywki ani wyniku. |
| Rozpoczęcie gry / rundy / finału | N, następnie Enter | Widoczny przycisk rozpoczęcia właściwy dla bieżącego etapu. |
| Pojedynek | A albo B, następnie Enter | Zaznaczenie dostępnej drużyny i potwierdzenie jej zgłoszenia. Przy fizycznym przycisku dostępne są obie drużyny; w normalnym trybie C, następnie Enter zaznacza i zatwierdza przycisk potwierdzenia drużyny wskazanej przez Buzzer. Nie symuluje naciśnięcia urządzenia. |
| Mapowanie finału: odsłonięcie odpowiedzi | Enter | Pokaż odpowiedź po wyborze dopasowania. Mysz: dwuklik przycisku odsłaniania. |
| Mapowanie finału: odsłonięcie punktów | Kolejny Enter | Pokaż punkty po końcu odsłaniania odpowiedzi. Mysz: dwuklik przycisku odsłaniania punktów. |
| Mapowanie finału: brak odpowiedzi | O | Pojedynczy wybór Brak odpowiedzi, wyłącznie gdy pole tekstowe jest puste. Następny Enter odsłania brak i zero automatycznie. |
| Mapowanie finału: odpowiedź spoza listy | W | Natychmiastowy wybór Nie ma na liście (0 pkt), wyłącznie gdy istnieje wpisany tekst. Następny Enter odsłania dosłownie wpisaną odpowiedź. |
| Mapowanie gracza 2: powtórzenie | R | Pojedynczy wybór Powtórzenie przy pustym polu i przed odsłonięciem. Enter odsłania powtórzenie i zero automatycznie. W mapowaniu nie odtwarza dźwięku powtórzenia. Shift+Enter pozostaje skrótem podczas wpisywania gracza 2. |
| Koniec rundy / przejście do wyniku | N, następnie Enter | Widoczna, dostępna akcja końca rundy lub dalszego przejścia. |
| Zakończenie finału / gry | N, następnie Enter | Zakończ finał lub Zakończ grę, według aktualnego etapu i po zakończeniu obowiązujących blokad. |
| Końcowy powrót do listy gier | N, następnie Enter | Wróć do moich gier, gdy jest główną dostępną nawigacją. |
| Wyciszenie / włączenie dźwięku — globalnie w Control | M | Natychmiastowe przełączenie wyciszenia, bez Enter, we wszystkich krokach Control. Podczas edycji pola M pozostaje literą. Korzystać z osobnej obsługi wyciszenia, dostępnej także podczas przejścia/dźwięku. |
| Rozpoczęcie od nowa | Bez skrótu | Wyłącznie przycisk i istniejące potwierdzenie. R jest zarezerwowane dla Powtórzenia. |

#### Reguły działania i bezpieczeństwo wpisywania

- [ ] Litery i cyfry nie wywołują czynności przy aktywnym polu tekstowym, polu wyboru, suwaku ani edytowalnej treści. Nie odbieramy standardowej obsługi klawiatury tym elementom. Specjalne skróty wpisywania finału są obsługiwane osobno.
- [ ] Zaznaczenie kafelka wymagającego potwierdzenia to tylko zaznaczenie; Enter uruchamia jego istniejące zatwierdzenie. Dla zwykłego przycisku nawigacji zaznaczenie oznacza ustawienie fokusu, a Enter wykonuje standardowe kliknięcie. Jedno naciśnięcie nie może uruchamiać równocześnie obsługi własnej i natywnego kliknięcia.
- [ ] Mapowanie finału jest wyjątkiem od zaznaczania i potwierdzania: wybór z listy, wpisana odpowiedź, brak i powtórzenie działają jednym kliknięciem/odpowiednim klawiszem. Pokaż odpowiedź i Pokaż punkty pozostają dwuklikowe przy obsłudze myszą; klawiatura korzysta z wyboru opcji i kolejnych Enter. Nie dodawać osobnego zatwierdzania dopasowania.
- [ ] W mapowaniu Enter nie potwierdza drugi raz wybranej opcji. Pierwszy odsłania odpowiedź, kolejny odsłania punkty po zakończeniu przejścia. Brak/powtórzenie odsłaniają zero automatycznie, więc nie wymagają drugiego Enter. Dalsze przejście pozostaje pod N i Enter; Enter nie ma samoczynnie przechodzić do następnego pytania.
- [ ] Jeden wspólny mechanizm wyboru czynności według etapu. Wszystkie skróty korzystają z istniejących akcji i blokad, bez osobnej ścieżki omijającej zatwierdzenia lub silnik.
- [ ] Gdy otwarte jest okno ustawień, udostępniania albo potwierdzenia, skróty rozgrywki w tle są nieaktywne. W oknach pozostawić standardowe Tab / Shift+Tab i Enter na wybranym przycisku. Nie przechwytywać skrótów paska adresu, wyszukiwania ani narzędzi przeglądarki.
- [ ] Obsłużyć PL, EN i UK. Skróty literowe pozostają na tych samych fizycznych klawiszach przy zmianie układu klawiatury; wpisywanie liter narodowych i komponowanie tekstu pozostają normalne. Czytelne oznaczenia klawiszy pokazywać w podpowiedziach.
- [ ] Ignorować przytrzymanie klawisza powodujące kolejne zdarzenia. Ctrl/Cmd+Enter nie przenosi fokusu do innego pytania. Gdy czynność jest niedostępna, skrót jej nie wykonuje.
- [ ] Weryfikacja przy domyślnych ustawieniach: Chrome, Firefox i Opera na Windows; Safari, Chrome, Firefox i Opera na Macu. Dodatkowo sprawdzić układ polski i ukraiński oraz wpisywanie z aktywnym polem. Dokumentacja skrótów przeglądarek nie zastępuje testu naszej implementacji.

#### Dokumentacja i podpowiedzi

- [ ] Dodać zestaw do instrukcji Panelu sterowania w PL, EN i UK po wdrożeniu. Uaktualnić także robocze MD i HTML, z zachowaniem właściwego stylu przycisków i oznaczeń klawiszy.
- [ ] W istniejącej kolumnie podpowiedzi pokazywać skróty odpowiednie do bieżącego etapu, z nazwą aktualnej czynności zamiast ogólnego Dalej. Nie dodawać osobnego banera ani instrukcji obsługi operatora na tablecie Prowadzącego.
- [ ] Przy wpisywaniu finału wskazać timer, powtórzenie w rundzie 2 i przechodzenie między pustymi polami. Przy mapowaniu wskazać wybór dopasowania, odsłonięcie odpowiedzi/punktów i dalsze przejście.
- [ ] Przy mapowaniu wskazać O — Brak odpowiedzi, R — Powtórzenie oraz W — Nie ma na liście. Podpowiedzi i dostępność skrótów zależą od treści pola; po odsłonięciu odpowiedzi wybór jest zablokowany. Cyfry i litery w aktywnym polu pozostają tekstem.
- [ ] Wyjaśnić w instrukcji różnicę między zaznaczeniem skrótem a zatwierdzeniem Enter oraz powód, dla którego litery i cyfry podczas edycji pola nie uruchamiają akcji.
- [ ] Wyraźnie opisać wyjątek mapowania: 1–6 / W / O / R wybiera od razu; Enter odsłania, zamiast potwierdzać wybór. Uaktualnić myszowe instrukcje i testy: wybór opcji pojedynczy, odsłanianie dwuklikowe. W rundach 1–6 zaznacza odpowiedź, Enter odsłania zaznaczoną; X i T zaznaczają odpowiednie przyciski, Enter je uruchamia. N wybiera bieżące dalsze przejście, Enter przechodzi dalej.
- [ ] Uaktualnić scenariusze testów i opis nagrań. Pokazać przynajmniej zatwierdzenie drużyny, odpowiedź/X, timer finału, powtórzenie, nawigację pustych pól i obsługę dalszego przejścia z klawiatury.

### 12. Wysokość odpowiedzi gracza 2

- [ ] Pięć pól drugiego gracza, podgląd odpowiedzi pierwszego, timer i nawigacja mają mieścić się bez przewijania na normalnym ekranie operatora.
- Zmniejszyć wysokość i odstępy wierszy bez obcięcia odpowiedzi pierwszego gracza. Sprawdzić także dłuższe wpisy i podpowiedzi.
- Sprawdzenie: co najmniej 1366×768 i 1920×1080 przy standardowym powiększeniu; mniejsze ekrany nadal muszą umożliwiać dostęp do wszystkich elementów.

### 13. Logo Prowadzącego w nagraniu 07

- [ ] Sprawdzić moment utraty logo i brak jego przywrócenia w scenariuszu blokady edycji logo.
- Rozróżnić celowe czyszczenie materiałów Prowadzącego na poszczególnych etapach od braku powrotu jego logo. Nie uznawać problemu za naprawiony tylko dlatego, że sam Control odzyskał dostęp do zasobu.
- Sprawdzenie: stan przed blokadą, po zamknięciu edytora i po następnym przejściu gry.

### 14. Pusta lista udostępnionych urządzeń

- [ ] Tekst Nie udostępniono jeszcze żadnego urządzenia wyświetlać w delikatnym kafelku z przerywanym obrysem i mniejszą czcionką, zgodnie z istniejącym stylem pustych list gier społeczności lub subskrybentów ankiet.
- Zachować sekcję i jej miejsce po dodaniu/usunięciu udostępnienia, bez znikania i przeskakiwania układu.
- Sprawdzenie: pusta lista, jedno udostępnienie, odebranie ostatniego, urządzenia oraz bazy korzystające ze wspólnego okna.

### 15. Płynność nagrań

- [x] Użytkownik potwierdził po obejrzeniu filmów: nagrania są w końcu płynne.
- Zamknąć zgłoszenie dotyczące płynności samego przechwytywania. Zachować bieżące ustawienia i raporty klatek. Nie utożsamiać tego z potwierdzeniem poprawnej synchronizacji każdego przejścia — punkt 07 pozostaje otwarty.

## Kolejność następnego przebiegu

1. Blokady i synchronizacja: 03, 04, 07, obowiązkowy timer z 08.
2. Stabilne wpisywanie, skróty, nawigacja i wysokość finału: 08, 09, 11, 12.
3. Wyświetlanie, podpowiedzi, logo i puste listy: 01, 02, 06, 13, 14.
4. Krótsza demonstracja zatwierdzenia drużyny, pokazanie kasowania powtórzenia i poprawiony scenariusz 05: 05, 10.
5. Uaktualnić manual zgodnie z faktycznie wdrożonym zachowaniem; wybrane testy produkcyjne i nowe filmy. Raport dla każdego numeru: co zmieniono, jak sprawdzono i w którym filmie jest widoczne.

## Przebieg wdrożenia

Zmiany robocze: obowiązkowy timer i blokada jego wcześniejszego zatrzymania przy pustym polu; blokada innych działań przed końcem gry; zapis czasu blokady razem z nowym stanem rundy; zachowanie pól i przycisków podczas wpisywania; nawigacja po pustych polach; skróty 1–6/C/A/B/X/T/P/N/B/E/M oraz W/O/R w dopasowaniu. Poprawiono ukrycie zer przed grą, końcówki skracanych odpowiedzi, czerwone podkreślone podpowiedzi, wysokość wpisywania gracza 2, ponawianie wczytania logo Hosta i pustą listę udostępnień w Control oraz bazach. Manual PL/EN/UK zawiera nowe reguły i skróty; pełne nowe opisy Control 2 / Game Settings 2 nadal są osobnym dokumentem do sprawdzenia.

Wybrane testy jednostkowe: 134/134 przed wdrożeniem. Wynik produkcji i filmów zostanie dopisany po rzeczywistym zakończeniu przebiegu. Nie oznaczamy samych zmian kodu jako potwierdzenia z nagrania.

### Skrócony zestaw nagrań

Domyślnie uruchamiane są 01, 03, 04, 05, 06 i 07. Film 02 powtarza drogę do finału z 04/05; 09 (wariant bez Hosta i z fizycznym przyciskiem), 10 (mnożnik) i 08 (poczta) pozostają dostępne osobno, kiedy zmiana ich dotyczy. Testy automatyczne tych wariantów pozostają w repo — ograniczamy powtarzane nagrania, nie usuwamy zabezpieczeń regresji.

- 01: pojedynki, X, oddanie kontroli, kradzież i zakończenie po wyczerpaniu pytań.
- 03: progresja, próg bez finału, wynik w punktach oraz wznowienie Control.
- 04: cała droga do pełnego finału, oba timery, wszystkie rodzaje dopasowania, poprawianie powtórzenia oraz niższa nagroda.
- 05: timer z jednym wpisem, naturalny koniec czasu, wcześniejsze zakończenie finału i nagroda główna.
- 06: utrata urządzeń i powrót do tej samej rozgrywki.
- 07: blokada logo, zwolnienie i sprawdzenie powrotu logo na tablecie Prowadzącego.

Test literalnych ścieżek importów i zasobów: 1/1. Szerszy audyt struktury ma istniejący przed zmianami błąd oczekiwania dla /connect-device/tv; nie jest wynikiem tego przebiegu. Weryfikacja rzeczywistych przeglądarek na Windows/Mac pozostaje osobnym sprawdzeniem; produkcyjny runner sprawdza Chromium na Linux.

Doprecyzowanie użytkownika: punkt 02 dotyczy wyłącznie Hosta; czerwony styl w Control został cofnięty.

Punkt 13: ustalono konkretną przyczynę pustego logo filmu 07 — funkcja tworząca logo testowe używała dziesięciu wierszy samych spacji. Zastąpiono je widocznym napisem FAMILIADA i dodano produkcyjne sprawdzenie niepustych pikseli canvas Hosta po zwolnieniu blokady. Sam test odzyskania Control nie wystarczał.

Pierwszy rzeczywisty przebieg produkcyjny [37497958845](https://github.com/Andrish97/familiada/actions/runs/37497958845): 5/7 zaliczonych. Intro/buzzer, ustawienia, blokada logo, odzyskanie urządzeń i zakończenie bez finału przeszły. Dwa finały wykryły odrzucanie startu timera podczas kończenia zapisu pola. Poprawiono oczekiwanie na zapis tekstu dla kliknięcia i Ctrl/Cmd+Enter; będzie osobny przebieg potwierdzający.

Ustalona logika Hosta (doprecyzowanie użytkownika): logo ustawione w grze jest pobierane także przed pierwszym stanem Control. Przy aktywnej edycji logo Host pokazuje domyślne; wejście w Podsumowanie ustawień wymusza ponowne pobranie. Nowe RPC host2_logo_get_public uwzględnia 25-sekundowy czas ważności blokady, weryfikuje klucz Hosta i właściciela logo, bez zmiany odczytu starego Wyświetlacza. Migracja 302 przeszła izolowany preflight oraz wdrożenie produkcyjne: [37500814515](https://github.com/Andrish97/familiada/actions/runs/37500814515).
