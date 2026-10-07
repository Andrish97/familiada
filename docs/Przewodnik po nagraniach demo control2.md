# Przewodnik po nagraniach demo control2

Oct 1, 2026 · @Andrii Shum

Aktualizacja: 6 października 2026 — komplet 10 filmów w `tests/recordings/2026-10-06/`; wspólna galeria: `index.html`.


## Gotowe pliki i zakres wersji

- 01, 03–06: [przebieg 37389738480](https://github.com/Andrish97/familiada/actions/runs/37389738480). Przerwał się przed wysyłką maila w 08, bo stary skrypt oczekiwał ukrycia sekcji udostępnień.
- 08–10: [dogrywka 37393196812](https://github.com/Andrish97/familiada/actions/runs/37393196812), sukces. Po resecie limitów prawdziwy mail dotarł po około 56,6 s; odbiorca otworzył udostępnionego Prowadzącego.
- 07: [dogrywka 37395118136](https://github.com/Andrish97/familiada/actions/runs/37395118136), sukces po ponowieniu przejściowego błędu strony GitHuba. Scenariusz był wcześniej umieszczony na końcu kolejki; odtąd scenariusze są sortowane po numerze.
- 02: [dogrywka 37396346583](https://github.com/Andrish97/familiada/actions/runs/37396346583), sukces. Obejmuje całe wejście planszy finału, a dopiero potem cztery sekundy na obejrzenie gotowego ekranu.

Filmy 01, 03–06 i 08–10 pokazują stan sprzed ostatnich uwag do manuala: dźwięk miał jeszcze zmienioną nazwę, status „z listy” był też przekreślony, a Prowadzący zachowywał ostatnią rundę przy zakończeniu bez finału. Te trzy zmiany są już opublikowane i sprawdzone na produkcji ([3 zaliczone przypadki](https://github.com/Andrish97/familiada/actions/runs/37395415616)). Filmy 02 i 07 pochodzą z wersji po poprawkach.

Nagrania mają 60 klatek/s. Obok każdego znajduje się raport przechwytywania i odstępów klatek przeglądarki. Pierwszy wcześniejszy zapis miał około 76% powielonych klatek; w obecnych dłuższych nagraniach udział wynosi około 0,4–1,0%. Krótkie filmy mają większy udział, więc oceniaj je razem z liczbą klatek i obrazem.

## Jak z tego korzystać

Każde nagranie to osobny plik .mp4 (`tests/e2e/record-playthrough.js`, katalog `tests/recordings/` (zmienna `RECORD_OUT_DIR`)). Wszystkie urządzenia korzystają z produkcji. Dla każdego poniżej: ustawienia gry startowe, kolejność kroków z realnymi wartościami oraz **Na co zwrócić uwagę**. Obok filmów są raporty `.performance.json` z pomiarami animacji, klatek i pamięci runnera. Rozbieżność z opisem należy sprawdzić zarówno w aplikacji, jak i w skrypcie nagrywania.

Logo wchodzi z animacją przy dźwięku odsłonięcia pod koniec intro. Buzzer zapala się lokalnie przed wysłaniem sygnału, a zatwierdzenie przez operatora stanowi osobną akcję. Bez finału ekran końcowy pojawia się z reveal i przejściem rundy, a outro jest osobną akcją. W finale „Zakończ finał” pokazuje wynik (logo/punkty/nagrodę) z reveal i muzyką finału, zsynchronizowanymi na koniec; późniejsze „Zakończ grę” odtwarza tylko outro, bez ponownego przejścia planszy. Nagranie czeka na pełny dźwięk, a potem pozostawia wynik widoczny przez około 4 sekundy.

Tryb zakończenia zapisano w ustawieniach osobnych gier: 03 — punkty, 04 i 05 — nagroda. 04 kończy się poniżej progu finału, a 05 osiąga próg i dostaje nagrodę główną.

## 01 — rundy-mechanika.mp4

Klip łączy demo urządzeń/ustawień z pełną rozgrywką 2 rund (bez finału, pytania demo ord 1-2).

**Urządzenia i ustawienia (przed startem gry)**

- Druga karta Control na tę samą grę — pełnoekranowa blokada zasobu, widoczna ok. 2,5 s, potem ta DRUGA karta jest zamykana (sama blokada nie znika — to operator/skrypt zamyka tę kartę).
- QR na Wyświetlaczu: najpierw sam kod Prowadzącego, potem OBA kody naraz (Prowadzący + Buzzer), potem oba znikają.
- Źródło dźwięku przełączone na "Display" → Wyświetlacz pokazuje ekran odblokowania dźwięku, kliknięcie go zamyka.

**Podsumowanie i modal ustawień**

- "Dalej" → krok Podsumowania.
- Modal ustawień gry: zmiana nazwy drużyny A na "Mistrzowie Quizu" — podgląd WEWNĄTRZ modalu (osobny, mały "Wyświetlacz w trybie podglądu", własny iframe) śledzi wpisywany tekst na żywo, zanim jeszcze zapiszemy; to NIE jest prawdziwy Wyświetlacz (ten w Podsumowaniu pozostaje czarny, a nazwy drużyn pokazuje dopiero na etapie „Rozpocznij grę” po zapisaniu ustawień) ani ten sam widget co podgląd w Podsumowaniu na stronie Control (ten drugi odświeża się dopiero PO zapisaniu modala, nie na bieżąco). Dalej: suwak głośności "round\_transition" na 70%, zapis przez "Zapisz wszystko", zamknięcie modala kliknięciem w tło.
- Osobny suwak głośności "reveal" wprost w Podsumowaniu (bez modala), ustawiony na 40%.

**Runda 1**

- "Gotowe — przejdź do rozgrywki" → "Rozpocznij grę" → "Rozpocznij rundę".
- Zmiana języka interfejsu na angielski i z powrotem na polski (tytuł fazy na Hoście się tłumaczy).
- Wyścig Buzzerów — oba przyciski kliknięte w TYM SAMYM momencie, wygrywa jeden (niedeterministycznie), Control pokazuje jeden wspólny kafel "Zatwierdź: \[zwycięzca\]".
- Zatwierdzenie → 2× X (pudla obu drużyn, powrót do zwycięzcy wyścigu bez nowego zgłoszenia) → trafienie.
- Wyciszenie dźwięku na czas 3× X z rzędu (auto-kradzież), wznowione TUŻ PRZED odsłonięciem kradzieży — kradzież WYGRANA.
- "Zakończ rundę", dosłanianie 4 pozostałych odpowiedzi, "Przejdź do następnej rundy".

**Runda 2**

- B naciska Buzzer → widoczne RAZEM "Zatwierdź: Beta" + "Ponów naciśnięcie" → operator klika "Ponów naciśnięcie" (oba kafle znikają) → B naciska ponownie → zatwierdzenie.
- B trafia (kontrola B) → "Oddaj kontrolę" (dawny Pass, kontrola A) → A trafia → 4× X z rzędu (3. = auto-kradzież dla B, 4. = kradzież PRZEGRANA).
- "Zakończ rundę", dosłanianie, "Przejdź do zakończenia gry" (bo gra bez finału).

**Koniec gry**

- "Zakończ grę" → wejście logo z reveal przy początku osobnego outro, potem około 4 s na obejrzenie ekranu końcowego. Restart czeka na zakończenie dźwięku.
- "Zacznij od nowa" w topbarze → modal potwierdzenia → "Tak" → powrót do kroku "Urządzenia".

**Na co zwrócić uwagę**

- Druga karta Control: pełnoekranowa blokada, nie pusta/błędna strona.
- Oba kody QR (Prowadzący + Buzzer) widoczne RAZEM w jednym momencie, nie tylko pojedynczo.
- Ekran odblokowania dźwięku na Display pojawia się natychmiast po przełączeniu źródła.
- "Mistrzowie Quizu" pojawia się w PODGLĄDZIE WEWNĄTRZ MODALU zanim jeszcze klikniemy "Zapisz wszystko" (ten widget śledzi wpisywany tekst na żywo) — to INNY widget niż podgląd w Podsumowaniu Control (ten odświeża się dopiero po zapisie) i niż prawdziwy Wyświetlacz (który pokazuje nazwy drużyn przed startem i otrzymuje zmiany ustawień po ich zapisaniu).
- Tytuł fazy na Hoście faktycznie zmienia język i wraca.
- "Zatwierdź: \[nazwa\]" to JEDEN kafel naraz (nie dwa osobne), nazwa zgadza się z realnym zwycięzcą wyścigu na Buzzerze.
- Podczas wyciszenia (ikona głośnika przekreślona) dźwięk X-ów jest całkowicie cichy, wraca SŁYSZALNY tuż przed odsłonięciem kradzieży.
- "Ponów naciśnięcie" w rundzie 2: oba kafle znikają po kliknięciu, Buzzer B daje się nacisnąć ponownie i zostaje poprawnie przyjęty za drugim razem.
- Runda 2 kończy się przejściem wprost do zakończenia gry (bez finału), nie kolejną rundą.
- "Zacznij od nowa" wraca DOKŁADNIE do kroku "Urządzenia", nie do logowania ani gdzie indziej.

## 02 — rundy-progresja-final.mp4

**Ustawienia:** 3 pytania demo, `hasFinal: true`, próg domyślny (300 pkt) nieruszony.

**Runda 1** — A naciska Buzzer, zatwierdzenie, trafia TOPą odpowiedzią od razu (wygrywa pojedynek bez żadnego pudła), potem odkrywa WSZYSTKIE 6 odpowiedzi po kolei w fazie PLAY (bez X, bez kradzieży) — "Zakończ rundę".

**Runda 2** — B naciska, zatwierdzenie, B pudłuje (X) — BEZ resetu pojedynku, od razu druga próba należy do A (nie nowe zgłoszenie Buzzera) — A trafia odpowiedź #2 (NIE topową) i WYGRYWA pojedynek, bo B ma 0 pkt. Potem odkrywane są pozostałe odpowiedzi (#1, #3-#6) — "Zakończ rundę".

**Runda 3** — A naciska, zatwierdzenie, trafia topą od razu, odkrywa wszystkie 6 — "Zakończ rundę" trafia DOMYŚLNY próg 300 pkt dokładnie tu.

**Przejście do finału** — "Rozpocznij finał" → ekran wpisywania gracza 1 widoczny ok. 4 s, klip się kończy (pełny finał to osobne nagrania 04/05).

**Na co zwrócić uwagę:**

- Runda 2: po pudle B kolej NIE wraca do ponownego zgłaszania się na Buzzerze — druga próba idzie od razu do A.
- Wynik rundy 2 liczy się dla A mimo trafienia odpowiedzią NIE-topą — B po prostu ma 0 pkt z tej rundy.
- Po rundzie 3 gra NIE kończy się ekranem końcowym, tylko wchodzi w finał — to jest różnica względem scenariusza 03 (ten sam przebieg rund, inne ustawienie `hasFinal`).

## 03 — rundy-progresja-bez-finalu.mp4

Dokładnie ta sama progresja rund 1-3 co w scenariuszu 02 (`hasFinal` tym razem wyłączone), plus jeden dodatkowy, kluczowy moment.

**Runda 1-2** — identycznie jak w 02 (A wygrywa topą w rundzie 1, w rundzie 2 B pudłuje i A wygrywa odpowiedzią NIE-topą bez resetu pojedynku).

**Kluczowy moment — przeładowanie Control w środku rundy 2:** zaraz po tym, jak A wygrywa pojedynek odpowiedzią #2 (ale PRZED odkryciem pozostałych odpowiedzi), karta Control jest CAŁKOWICIE przeładowywana (F5). To jest dowód na żywo tego, po co powstała cała przebudowa Control na wspólną tabelę stanu (`game_state`) — stan gry nie żyje już tylko w pamięci przeglądarki operatora.

**Runda 3** — jak w 02, A wygrywa topą, odkrywa wszystko, "Zakończ rundę" trafia próg 300.

**Koniec gry** — ustawiony tryb „punkty”: „Przejdź do zakończenia gry” → przejście rundy i reveal → Wyświetlacz pokazuje **300 punktów**; następne „Zakończ grę” odtwarza osobne outro. Wynik pozostaje widoczny około 4 s po zakończeniu dźwięku.

**Na co zwrócić uwagę:**

- Zaraz po przeładowaniu Control MUSI pokażać "Runda 2" (nie ekran logowania, nie pusty stan, nie "Runda 1").
- Odpowiedź #2 (odkryta PRZED przeładowaniem) musi wrócić widoczna na ZIELONO od razu — to dowód, że to prawdziwe wznowienie stanu gry, nie tylko pusty ekran z napisem "Runda 2".
- Dalsze odkrywanie odpowiedzi (#1, #3-#6) po przeładowaniu musi działać normalnie, bez żadnych błędów czy duplikatów.
- Po rundzie 3 gra tym razem KOŃCZY SIĘ (ekran końcowy), nie wchodzi w finał — to jest różnica względem scenariusza 02.

## 04 — final-pelny.mp4

**Ustawienia:** `finalMinPoints: 280`, `finalTarget: 200`, tryb zakończenia **nagroda**. Prawdziwe pytania demo w całym finale.

**Dojazd do progu (3 rundy)** — rundy 1-2 proste (A wygrywa topą, pełne 100 pkt każda). Runda 3: B wygrywa pojedynek trafiając TOPą odpowiedzią, odkrywa też odp. #2, POTEM 3× X (pudła B) → auto-kradzież dla A → A kradnie WYGRANĄ (bank liczy się w całości). "Zakończ rundę" trafia próg (280), ale zostają nieodkryte odpowiedzi — doszłanianie reszty, potem kontekstowy przycisk "Przejdź do finału" (nie automatyczne pominięcie).

**Start finału** — "Rozpocznij finał" (muzyka finału, potem przejście rundy z reveal). Prowadzący przesuwa palcem, żeby lokalnie odsłonić zasłoniętą treść. To podgląd dla prowadzącego; kolejna zmiana gry przywraca zasłonę.

**Gracz 1 (15s)** — zegarek startuje przed wpisywaniem. 5 pytań: 2× dopasowanie, 1× zła odpowiedź, 2× puste pole. Po naturalnym wygaśnięciu: "Dalej" → mapowanie. Dopasowanie wymaga "Pokaż odpowiedź", następnie "Pokaż punkty". Brak odsłania zero i gra dźwięk błędu od razu przy „Pokaż odpowiedź”; dodatkowego kliknięcia punktów nie ma. Wpisana błędna odpowiedź odsłania tekst z reveal, a zero odsłania operator osobno przy „Pokaż punkty”.

**Przejście do gracza 2** — "Rozpocznij 2 rundę", Wyświetlacz pokazuje PEŁNE odkryte odpowiedzi gracza 1 (nie placeholdery), Prowadzący znowu demonstruje "peek" (zasłona wraca sama po akcji).

**Gracz 2 (20s)** — zegarek startuje przed wpisywaniem. Pytanie #1 oznaczone jako "Powtórzenie" (jedno kliknięcie z dźwiękiem; każde kolejne kliknięcie odtwarza go ponownie); z pozostałych czterech wpisywane są dwa dopasowania, reszta jest pusta. Po wygaśnięciu zegarka mapowane są **wszystkie pięć pytań**. Powtórzenie i braki odsłaniają zero automatycznie przy "Pokaż odpowiedź".

**Pełne zakończenie** — suma trafień wynosi **105**, mniej niż próg 200. Odkrywane są wszystkie 10 odpowiedzi obu graczy, łącznie z pytaniem #5 gracza 2. Po ostatnim odsłonięciu pojawia się przycisk „Zakończ finał”. Jego kliknięcie pokazuje nagrodę przy reveal i muzyce finału, kończących się razem.

**Koniec** — niższa nagroda **1167**: `(284 + 105) × 3` jest już widoczna przed „Zakończ grę”. Ten przycisk odtwarza tylko osobne outro; nagroda pozostaje bez kolejnego reveal. Nagranie czeka na koniec dźwięku i pozostawia nagrodę na ekranie około 4 s.

**Na co zwrócić uwagę:**

- Operator naprawdę WPISUJE tekst W TRAKCIE gdy zegarek odlicza (cyfry na ekranie się zmieniają w tle) — pole nie traci fokusu, nie resetuje się.
- Zegarek gracza 1 i gracza 2 wygasają NATURALNIE (operator nie klika "Zatrzymaj") — dźwięk końca czasu musi się odezwać.
- Prowadzący widzi treść przez gest "peek" mimo zasłoniętego ekranu — zasłona wraca sama po kolejnej akcji.
- Wyświetlacz po "Rozpocznij 2 rundę" pokazuje PRAWDZIWE, pełne odpowiedzi gracza 1, nie placeholdery/gwiazdki.
- "Powtórzenie" gra dźwięk; przy odsłonięciu odpowiedzi zero punktów pojawia się automatycznie.
- Finał obejmuje wszystkie 10 odpowiedzi. Suma 105 nie osiąga progu 200; na końcu pojawia się nagroda 1167 bez nagrody głównej.

## 05 — final-wczesne-zakonczenie.mp4

**Ustawienia:** te same 3 rundy co w 04 (`finalMinPoints: 280`), tryb zakończenia **nagroda**, `finalTarget: 30` — jedna trafiona odpowiedź wystarczy do osiągnięcia progu.

**Dojazd do finału** — identyczny jak w 04 (rundy 1-2 proste, runda 3 z kradzieżą WYGRANą, dosłanianie, "Przejdź do finału"). "Rozpocznij finał" (\~4s), Prowadzący demonstruje "peek".

**Gracz 1 — TYLKO jedna odpowiedź** — wpisywana jest WYŁĄCZNIE pierwsza odpowiedź (najwyżej punktowana z puli pytania), reszta pól zostaje pusta — zegarek w ogóle pominięty (nieobowiązkowy, "Dalej" działa niezależnie od tego, czy został uruchomiony). Od razu "Dalej" do mapowania.

**Wczesne zakończenie zatwierdzane przez operatora** — wybór dopasowania (zaznacz→potwierdź) → „Pokaż odpowiedź” → „Pokaż punkty” — ta jedna odpowiedź przekracza obniżony próg (30). Silnik pozostaje na mapowaniu, blokuje dalsze akcje i w kolumnie podpowiedzi informuje o osiągniętym progu. Przycisk zmienia się na „Zakończ finał”; dopiero jego kliknięcie pokazuje wynik. Pytania 2-5 gracza 1 i cały gracz 2 są pominięte.

**Koniec** — „Zakończ finał” pokazuje nagrodę główną **25960**: `(284 + 36) × 3 + 25000` z reveal i muzyką finału, kończącymi się razem. „Zakończ grę” uruchamia tylko osobne outro. Wynik pozostaje widoczny około 4 s po końcu dźwięku.

**Na co zwrócić uwagę:**

- Kafel wyboru dopasowania w mapowaniu MUSI być realnie zatwierdzony (dwa kliknięcia) — to miejsce miało realnego buga: pojedynczy klik tylko zaznaczał kafel bez zatwierdzenia, efektywne dopasowanie zostawało na domyślnym "Nie ma na liście" (MISS), suma nigdy nie trafiała progu i "Zakończ grę" nigdy się nie pojawiało.
- Po „Pokaż punkty” na tej jednej odpowiedzi mapowanie jest zablokowane, a podpowiedź informuje o osiągniętym progu. Operator klika „Zakończ finał”; nie ma dalszych pytań ani ekranu drugiego gracza.
- Pola gracza 1 (poza pierwszym) i cały ekran gracza 2 NIGDY się nie pojawiają na tym nagraniu — jeśli się pojawią, to znaczy że próg nie został trafiony (regresja).

## 06 — zerwanie-i-ponowne-podlaczenie.mp4

Dowód na żywo, że stan gry przeżywa rozłączenie każdego urządzenia niezależnie od Control — bez żadnej ręcznej resynchronizacji poza ponownym wejściem na URL urządzenia.

**Runda 1 w toku** — A naciska, zatwierdzenie, trafia odp. #1 (top, wygrywa pojedynek) — reszta rundy CELOWO zostaje nieodkryta.

**Zerwanie wszystkich trzech naraz** — Wyświetlacz, Prowadzący i Buzzer zamykane jednocześnie. Kontrolki czerwienieją po wygaśnięciu ostatnich heartbeatów (6,5 s od ostatniego pingu, z kontrolą co 250 ms). Akcje gry są wtedy wyszarzone i zablokowane, bez dodatkowego banera. Jednorazowy modal wymienia odłączone urządzenia i podpowiada sprawdzenie internetu oraz ponowne podłączenie przyciskami w górnym pasku. Kontrolki nie muszą zmienić koloru w tej samej klatce, bo ostatnie pingi urządzeń mają różne czasy.

Operator przed wykryciem awarii odsłania jeszcze odpowiedź #2. Po wykryciu próba odsłonięcia #3 jest blokowana. Po powrocie Wyświetlacza widać także odpowiedź #2 zapisaną podczas przerwy, bez jej ponownego odsłaniania.

**Ponowne podłączenie po kolei, przez modal** — Wyświetlacz → Prowadzący → Buzzer, każde przez modal "podłącz ponownie" (kod/QR/link), z pauzą na obejrzenie zielonej kropki i odzyskanego obrazu gry po każdym.

Gra pozostaje zablokowana po powrocie samego Wyświetlacza oraz samego Prowadzącego. Odblokowuje się dopiero po powrocie wszystkich wymaganych urządzeń. Akcje zapisane przed wykryciem rozłączenia pozostają w stanie gry; nie są cofane. Żądanie wysłane wcześniej może zakończyć zapis już po pojawieniu się czerwonej kontrolki — blokada nie anuluje operacji będącej w drodze do serwera. Wracające urządzenie pobiera aktualny stan, bez odgrywania pominiętych animacji. Akcja czekająca w kolejce jest sprawdzana ponownie przed wykonaniem. Biegnące zegary nie są pauzowane.

**Dokończenie rundy 1** — odkrycie pozostałych 4 odpowiedzi na już świeżo podłączonych urządzeniach, "Zakończ rundę".

**Runda 2, w całości na nowym Buzzerze** — B naciska Świeżo podłączony Buzzer, zatwierdzenie, pełne odkrycie 6 odpowiedzi, "Zakończ rundę" — dowód, że nowe urządzenie nie tylko świeci na zielono (sama obecność), ale FAKTYCZNIE bierze udział w rozgrywce.

**Koniec** — „Przejdź do zakończenia gry” pokazuje ekran końcowy z reveal i przejściem rundy; „Zakończ grę” odtwarza osobne outro, widoczny także około 4 s po zakończeniu dźwięku.

**Na co zwrócić uwagę:**

- Wszystkie trzy kontrolki muszą pokazać rozłączenie, a akcje gry pozostać zablokowane do powrotu ostatniego wymaganego urządzenia.
- Po ponownym podłączeniu każde urządzenie musi pokazać aktualny obraz gry, w tym odpowiedzi #1 i #2, bank i kontrolę drużyny. Odpowiedź #2 została zapisana po fizycznym rozłączeniu, ale przed jego wykryciem.
- Buzzer po ponownym podłączeniu musi REALNIE działać w rundzie 2 (kliknięcie faktycznie zgłasza drużynę w Control), nie tylko wyglądać na podłączony.

## 07 — blokada-logo.mp4

Logo gry jest blokowane ZEWNĘTRZNIE (dokładnie tym samym mechanizmem co kliknięcie "Edytuj" w edytorze logo) — PRZED otwarciem okna Control, więc ekran blokady jest widoczny już od pierwszej klatki nagrania, bez żadnego wstępu.

**Blokada** — Control pokazuje pełnoekranowy komunikat blokady zasobu, widoczny ok. 3,5 s.

**Zwolnienie i samoistne wznowienie** — blokada logo zostaje zwolniona z zewnątrz (nie przez kliknięcie w tym oknie Control) — ekran blokady znika SAM, Control wznawia się do kroku "Urządzenia" bez żadnej ręcznej interwencji operatora.

**Krótka runda** — po odzyskaniu Control pełne przejście przez urządzenia/podsumowanie, start gry i jedna pełna runda (A wygrywa, odkrywa wszystkie 6 odpowiedzi). „Przejdź do zakończenia gry” pokazuje logo z reveal i przejściem rundy, a „Zakończ grę” odtwarza osobne outro, widoczne około 4 s po końcu dźwięku.

**Na co zwrócić uwagę:**

- Ekran blokady musi zniknąć SAM, bez żadnego kliknięcia w oknie Control — to dowód, że Control nasłuchuje zwolnienia blokady z zewnątrz.
- Po zniknieć blokady Control pokazuje REALNY krok "Urządzenia", nie pusty ekran czy błąd.
- Runda po odzyskaniu działa bez żadnych widocznych usterek — to potwierdzenie, że odzyskanie nie zostawiło Control w połowicznym/zepsutym stanie.

## 08 — udostepnianie-urzadzenia-mailem.mp4

Celowo krótki, BEZ żadnej rozgrywki — sedno to sam krok Urządzeń i prawdziwy, działający e-mail.

**Wypełnienie formularza** — na kroku "Urządzenia", przycisk "Udostępnij" przy wierszu Prowadzącego → modal, wpisanie adresu `test2@familiada.online` (drugie konto testowe z tej samej puli co główny operator), "Dodaj".

**Potwierdzenie w UI** — modal pokazuje "Aktualnie udostępnione dla: test2" (nazwę istniejącego konta) — to potwierdzenie zapisu, nie dostarczenia maila.

**Prawdziwy e-mail** — nagranie czeka na dostarczenie maila (do 180s) z tematem zawierającym "Udostępniono urządzenie" i linkiem do `/host2?...`. Przed ponowną wysyłką na ten sam adres test resetuje limity wysyłki oraz blokadę ponownego udostępnienia.

**Odbiorca klika link** — zupełnie NOWE, osobne okno przeglądarki (inny kontekst niż reszta urządzeń) otwiera link z maila — strona Prowadzącego ładuje się normalnie, BEZ żadnego logowania (sam klucz w URL-u wystarcza).

**Na co zwrócić uwagę:**

- Potwierdzenie w modalu pojawia się natychmiast po "Dodaj", zanim jeszcze e-mail realnie dotrze.
- Mail faktycznie przychodzi (to nie atrapa/mock) — jeśli nagranie "wisi" długo w tym miejscu, to znaczy, że wysyłka maila nie działa.
- Link z maila otwarty w zupełnie NOWYM oknie działa od razu, bez ekranu logowania — to dowód, że udostępnianie działa dokładnie jak QR/kod, tylko dostarczone pocztą.

## 09 — fizyczny-przycisk-bez-prowadzacego.mp4

Krótki, pokazowy scenariusz (jedna odpowiedź) — sedno to mechanizm ręcznego wyboru drużyny, nie pełna runda.

**Włączenie opcji** — w ustawieniach: "Fizyczny przycisk" (wiersz Buzzera wyszarza się) i "Nie używaj tabletu prowadzącego" (wiersz Prowadzącego wyszarza się, kropki statusu obu znikają z topbara).

**Ręczny wybór drużyny (bez urządzenia Buzzer)** — ekran identyczny jak w trybie normalnym: operator klika "Alfa" (czysto lokalne zaznaczenie, zero zapisu) — pojawia się "Zatwierdź: Alfa", operator zmienia zdanie i klika "Beta" zamiast osobnego "Anuluj" — pojawia się "Zatwierdź: Beta", zaznacz→potwierdź.

**Pierwsza odpowiedź** — Beta trafia, przejmuje kontrolę, wynik (Bank) widoczny chwilę.

**Na co zwrócić uwagę:**

- Wiersze Buzzera/Prowadzącego w ustawieniach urządzeń wyszarzają się natychmiast po zaznaczeniu opcji, a ich kropki statusu znikają z topbara.
- Ekran pojedynku wygląda DOKŁADNIE jak w trybie normalnym (dwa kafle drużyn + "Zatwierdź"), różnica jest wyłącznie w tym, że oba kafle drużyn są KLIKALNE (operator wskazuje, nie urządzenie).
- Zmiana wyboru (Alfa → Beta) działa przez zwykłe kliknięcie drugiej drużyny, bez osobnego przycisku "Anuluj".

## 10 — mnoznik-rundy.mp4

**Ustawienia:** `finalMinPoints: 999` (celowo nieosiągalne — to czysty pokaz mnożnika, nie progresja do finału/końca gry). 4 różne pytania demo, każde w pełni odkryte (100 pkt bank).

**Rundy 1-3 (mnożnik ×1)** — trzy identyczne, pełne rundy: A wygrywa pojedynek, odkrywa wszystkie 6 odpowiedzi (bank 100), "Zakończ rundę". Po 3 rundach wynik Alfa = 300 (100×3×1).

**Runda 4 (mnożnik ×2)** — ta sama pełna runda (bank znowu dochodzi do 100), ale "Zakończ rundę" w tej rundzie ma mnożnik ×2 — wynik Alfa skończy 500 (300 + 100×2 = 500), NIE 400 (300+100).

**Na co zwrócić uwagę:**

- Po 3. rundzie wynik musi pokazywać dokładnie "Alfa: 300".
- W rundzie 4, TUŻ przed kliknięciem "Zakończ rundę", bank na ekranie pokazuje pełne 100 — to jest wartość PRZED przemnożeniem.
- Po "Zakończ rundę" w rundzie 4 wynik MUSI pokazać dokładnie "Alfa: 500", nigdy "Alfa: 400" — to jest dokładnie ten liczbowy dowód, że mnożnik rundy 4 (×2) faktycznie działa, nie tylko wyświetla się w ustawieniach.

## Następny komplet po uwagach z 6 października

Domyślny przebieg skrócono do sześciu filmów: **01, 03, 04, 05, 06 i 07**. Stary film 02 powtarza dojście do finału pokazane w 04/05; 08 (mail), 09 (fizyczny przycisk) i 10 (mnożnik) można nadal uruchomić osobno. Dotychczasowe filmy w galerii pozostają wcześniejszym kompletem do czasu pobrania nowych — aktualizacja skryptu nie oznacza, że nagrania już powstały.

W nowym 04 zwróć uwagę na wybór dopasowania klawiszami **1–6/W/O**, kolejne **Enter** odsłaniające odpowiedź i punkty oraz **N, Enter** przechodzące dalej. Drugi gracz pokazuje obsługę myszą, powrót do Powtórzenia, wpisanie tekstu usuwające znacznik i ponowne zaznaczenie po wyczyszczeniu pola. Pola i przyciski powinny pozostawać stabilne podczas pisania. Przy podpowiedziach treść ma się zmieniać, ale pasek skrótów i separator pozostają przypięte na dole. Podczas blokady akcji lista skrótów nie znika. Na zwykłym ekranie podpowiedź i skróty powinny być widoczne bez przewijania.

Nowy 05 wymaga uruchomienia timera mimo jednej wpisanej odpowiedzi. Pozostałe puste pola uniemożliwiają ręczny stop; skrypt czeka na naturalny koniec czasu. Osiągnięty próg nadal wymaga ręcznego Zakończ finał. Zatwierdzenie drużyny ma krótsze pauzy demonstracyjne, a działania nadal czekają na rzeczywistą dostępność przycisków.
# Nowy komplet po poprawkach z 6 października 2026

Gotowe filmy są w `tests/recordings/2026-10-06-poprawki/index.html`.
To osobny komplet, żeby nie pomylić go z poprzednimi nagraniami.

| Film | Zakres | Długość |
| --- | --- | --- |
| 01 — rundy, mechanika | Pojedynek, przycisk, odsłanianie, pudła, oddanie kontroli i kradzież. | 4:26 |
| 03 — progresja bez finału | Kolejne rundy i zakończenie gry bez finału. | 4:02 |
| 04 — pełny finał | Obaj gracze, wpisywanie, timer, dopasowanie, odsłanianie i skróty. | 7:07 |
| 05 — wczesne zakończenie finału | Próg punktów i ręczne zakończenie finału. | 5:06 |
| 06 — rozłączenie i powrót | Utrata połączenia urządzeń, blokada i powrót. | 3:25 |
| 07 — blokada logo | Domyślne logo podczas blokady i ponowne wczytanie Hosta w Podsumowaniu. | 2:28 |

Źródła: przebiegi `37504846098` (ukończone 01 i 03) i `37507776319`
(ukończone 04–07). Pierwszy zatrzymał się przed nagrywaniem 04 przy
ponownym logowaniu; brakujące cztery ukończył drugi przebieg.
Sprawdzono komplet sześciu plików, czas trwania oraz obecność ścieżek
obrazu i dźwięku. Podgląd aktywności wdrażany później nie zmienia tych filmów.

W scenariuszu 07 logo testowe pochodzi z `web/shared/data/logo_familiada.json`.
Wcześniejsza wersja nagrania tworzyła własny, sztuczny JSON z napisem
„FAMILIADA”, dlatego taki napis pojawiał się na środku Display. Nie był to
obraz logo pobranego z ustawień gry. Nowe nagranie pozwoli sprawdzić właściwy
plik logo; nie zmienia to scenariusza 04.
