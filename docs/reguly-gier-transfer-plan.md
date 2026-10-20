# Centralne reguły gier oraz import i eksport — plan

**Stan:** plan, bez zmian w aplikacji.  
**Zakres:** jedno źródło reguł dla gotowości i dozwolonych akcji gry, uproszczenie
modalów tworzenia gry z Base Explorera oraz jawne i bezstratne (albo jawnie
potwierdzane jako stratne) reguły importu/eksportu.  
**Kolejność:** audyt kontraktów → uzgodnienie rozbieżności → centralizacja reguł
→ integracja ekranów i walidacji serwerowej → audyt i poprawa transferu → testy
punktowe.

## 1. Uzgodniony cel

1. Aplikacja ma mieć jedno, nazwane źródło reguł opisujące:
   - czy gra nadaje się do ankiety, podliczenia lub rozgrywki;
   - czego brakuje i jak to naprawić;
   - które akcje są dozwolone w danym typie i stanie gry;
   - czy edycja wymaga resetu wyników ankiety.
2. Przyciski i strony pytają o wynik reguł, zamiast odtwarzać warunki lokalnymi
   `if`-ami. Baza pozostaje autorytatywna dla operacji zapisu i przejść stanu;
   UI korzysta z tego samego kontraktu i pokazuje te same powody.
3. Modal „Utwórz grę” w Base Explorerze ma służyć do wyboru pytań oraz typu
   docelowego. Nie jest bramką gotowości i nie odrzuca wybranych pytań.
4. Import i eksport mają jawnie zachowywać albo ujawniać każdą transformację.
   Nieznany lub historyczny typ nie może bez ostrzeżenia zmienić się w inny.

## 2. Reguły modalа tworzenia gry z Base Explorera

### Zachowanie zatwierdzone przez użytkownika

- Zaznaczenie oznacza dokładny zestaw pytań przekazany do nowej gry. Kliknięcie
  „Zrób grę” tworzy grę z aktualnie zaznaczonego zestawu; nie dobiera pytań
  automatycznie ani nie zmienia zaznaczenia.
- Można utworzyć szkic z mniej niż 10 pytaniami. Brak pytań lub niekompletne
  pytania nie blokują utworzenia; jeśli zestaw jest pusty, rezultat należy
  oznaczyć jako pusty/niegotowy, a nie po cichu uzupełniać.
- Typ gry nie jest filtrem pytań ani twardą walidacją przy tworzeniu. Oznaczenia
  przy typie i pytaniach informują, czego brakuje, aby później gra była gotowa.
- Modal nie sprawdza sumy 100 punktów. To dotyczy wyłącznie bramki tworzenia z
  bazy; nie znosi reguły sumy punktów w centralnej ocenie gotowości gry, jeśli
  ta reguła pozostanie po uzgodnieniu całego kontraktu.
- „Preparowana” w metadanych bazy jest sugestią/klasyfikacją, nie zakazem
  utworzenia. Brak odpowiedzi nie może sam w sobie ukryć ani zablokować tej
  możliwości.
- Istniejące transformacje właściwe typowi (np. ankieta tekstowa bez odpowiedzi)
  trzeba osobno ocenić w audycie transferu. Modal nie może przedstawiać ich jako
  niezmienionego przeniesienia danych.

### Docelowy interfejs

- Przycisk „Zrób grę” jest dostępny niezależnie od liczby pytań i ich
  kompletności. Może być nieaktywny wyłącznie podczas trwającego zapisu, aby
  zapobiec podwójnemu wysłaniu.
- Licznik pokazuje liczbę zaznaczonych pytań bez dopisku „minimum 10”.
- Każdy typ ma podsumowanie gotowości, np. „Brakuje 4 pytań do progu gry”,
  „Pytanie 2 nie ma 3 odpowiedzi”, „Odpowiedzi wymagają punktów”. Statusy są
  informacyjne; żaden nie wyłącza wyboru ani tworzenia.
- Przy pytaniu status wynika z reguł wybranego typu i pokazuje konkretny powód,
  nie tylko zielone/czerwone „OK”. Podsumowanie całej gry wyjaśnia, czy jest
  gotowa oraz jakie braki pozostaną do uzupełnienia.
- Po utworzeniu nowa gra zachowuje wybrany typ i zawartość zgodnie z jawną
  polityką transferu. Silnik gotowości oblicza status po utworzeniu; nie
  przerywa tworzenia.

### Obecny stan do zmiany

- `web/bases/explorer/js/export-modal.js` blokuje utworzenie przy mniej niż 10
  pytaniach oraz przy zaznaczonych pytaniach niezgodnych z typem. Warunek jest
  sprawdzany zarówno w UI, jak i przy obsłudze kliknięcia.
- Ten sam moduł pokazuje klasy `.ok`/`.bad`, lecz nie podaje pełnego katalogu
  powodów. Preselekcja przekazuje dokładnie wybrane ID; bez niej domyślnie
  zaznacza wszystkie pytania.
- `buildExportPayload()` zmienia treść według typu: `poll_text` pomija
  odpowiedzi, `poll_points` zapisuje `fixed_points:  0`, `prepared` zachowuje
  istniejące punkty. Te zmiany muszą być widoczne w decyzji o kontrakcie
  transferu, a nie mylone ze sprawdzeniem gotowości.
- `web/bases/explorer/js/actions.js` tworzy heurystyczne metadane kategorii:
  ankieta punktowa wymaga 3–6 odpowiedzi; preparowana dodatkowo wymaga wartości
  punktów i sumy ≤100. To nie jest to samo co gotowość gry. W szczególności
  wykluczenie preparowanej bez odpowiedzi przeczy uzgodnieniu, że typ w bazie
  jest sugestią.
- Komentarz w `actions.js` o automatycznym dobieraniu pytań poniżej 10 jest
  niespójny z aktualnym zachowaniem modala i wymaga korekty przy implementacji.

## 3. Jedno źródło reguł gry

### Kontrakt reguł

Reguły należy podzielić na czytelne funkcje domenowe, ale utrzymać w jednym
kontrakcie i wersjonowanym zestawie definicji:

1. `evaluateReadiness(gameSnapshot)` — kompletność względem typu, z wynikiem
   per pytanie i dla całej gry: `ready`, lista kodów braków, parametry oraz
   zakres, którego dotyczy brak.
2. `evaluateAction(gameState, action)` — dozwolenie akcji i powód: edycja,
   rozpoczęcie/otwarcie ankiety, wejście do głosowania, zatrzymanie, wznowienie,
   podliczenie/zamknięcie, rozgrywka, eksport. Stan obejmuje typ, status,
   zawartość, wyniki oraz uprawnienia/locki wymagane przez daną akcję.
3. `evaluatePollClosure(tallySnapshot)` — kwalifikacja odpowiedzi po
   scalaniu/edycji oraz możliwość zatwierdzenia wyników. Wejście do trybu
   podliczania jest osobną akcją i nie może korzystać z bramki zamknięcia.
4. Wynik ma stabilne kody maszynowe i parametry. UI mapuje kody na tłumaczenia;
   baza zwraca ten sam kod, a nie równoległy tekst lub inną interpretację.

Nie oznacza to przeniesienia autorytetu z bazy do przeglądarki. Klient może
liczyć podgląd z tego samego snapshotu/kontraktu, lecz RPC i ograniczenia bazy
ponownie weryfikują operację przed zapisem.

### Reguły do zinwentaryzowania i ujednolicenia

- Typy i aliasy: `poll_text`, `poll_points`, `prepared`, `market` oraz wszystkie
  typy/aliasy znalezione w schemacie, danych, plikach transferu, migracjach,
  testach i kodzie stron.
- Gotowość do rozgrywki: obecny próg 10 pytań, 3–6 odpowiedzi na pytanie,
  dozwolone zakresy i suma punktów; dla „Preparowane” uwzględnić ustaloną
  regułę minimum **4 punktów na każdą odpowiedź**. Próg 4 dotyczy przygotowania
  gry, a nie modalа Base Explorera.
- Gotowość do ankiety tekstowej i punktowej oraz osobne akcje otwarcia,
  głosowania, stop/wznów i podliczenia.
- Edycja gry i wyniki ankiety: kiedy edycja jest zablokowana, kiedy dozwolona
  po potwierdzeniu resetu oraz które wyniki/punktacja zostaną skasowane.
- Podliczanie: wspólna reguła kwalifikacji obu typów. Zgodnie z ostatnim
  uzgodnieniem odpowiedź kwalifikuje się od **4% włącznie**; wynik procentowy
  jest zaokrąglany zgodnie z ustaloną regułą, a do zamknięcia wymagane są co
  najmniej 3 kwalifikujące odpowiedzi na pytanie po scaleniu i ponownym
  przeliczeniu. Dla tekstowej listę ogranicza także limit sześciu odpowiedzi;
  wejście do podliczania pozostaje dozwolone nawet wtedy, gdy wynik nie może
  jeszcze zostać zamknięty. Szczegółowy porządek progowania/scalania musi
  wynikać z jednego algorytmu wspólnego dla JS i SQL.
- Eksport i kopiowanie jako odrębne akcje o własnych warunkach, nie utożsamiane
  z gotowością do rozgrywki.

### Miejsca obecnego rozproszenia

- `web/shared/js/core/game-validate.js`: typy, UI `RULES`, opakowanie RPC
  `game_validate` i tłumaczenie kodów.
- Migracje SQL, w szczególności `game_rules_compute`/`game_validate`,
  `games.rules_state`, blokady zapisu oraz `game_poll_close_check`.
- `web/shared/js/core/base-export-validate.js` i Base Explorer — osobna
  walidacja zawartości i heurystyki kategorii.
- `web/shared/js/core/poll-tally-math.js`, `web/polls/js/poll-tally.js` oraz
  funkcje SQL podliczania — kwalifikacja odpowiedzi i możliwość zamknięcia.
- `web/games/js/games.js`, edytor, ankiety, Control i inne strony — przyciski
  akcji korzystające z RPC, zapisanych `rules_state` lub lokalnych warunków.

Etap audytu ma stworzyć tabelę `akcja × typ × status × wymagania × źródło
obecnie × źródło docelowe`, zanim jakiekolwiek reguły zostaną przeniesione.
Wyniki powinny wskazać wyjątki świadome (np. stan ankiety), a nie tylko liczbę
powtórzeń warunku.

## 4. Audyt importu i eksportu

### Ustalony kontrakt typów i stanów

- Trzy typy źródłowej treści gry to `prepared`, `poll_points`, `poll_text`.
  Baza ma ponadto osobny typ `market` dla kopii pochodzących z Gier
  Społeczności. `market` zostaje w bazie; nie jest czwartym typem źródłowej
  treści ani jednym z pięciu wariantów pliku.
- Nie tworzymy typu `ready_prepared` ani osobnych typów „gotowa”/„szkic”.
  Historyczne typy inne niż te trzy źródłowe i `market` wymagają migracji lub
  jawnej obsługi. JSON nie może zamieniać `market` po cichu na `poll_text`.
- Transfer dopuszcza dokładnie pięć kombinacji:

  | Typ | Stan transferu | Znaczenie |
  |---|---|---|
  | `prepared` | szkic | Preparowana; gotowość wynika z reguł zawartości |
  | `poll_points` | szkic | Ankieta punktowa bez wyników zamknięcia |
  | `poll_text` | szkic | Ankieta tekstowa bez wyników zamknięcia |
  | `poll_points` | zamknięta | Zamknięta ankieta punktowa z wynikiem |
  | `poll_text` | zamknięta | Zamknięta ankieta tekstowa z wynikiem |

- „Gotowa preparowana” nie jest typem ani osobnym stanem transferu: to
  `prepared`, które spełnia centralne warunki gotowości. Nie dodajemy jej
  osobnej wartości enum ani wariantu JSON.
- Głosy z ankiety otwartej lub zatrzymanej nie są przenoszone. Eksport musi
  przed utworzeniem pliku wyświetlić jasną informację, że bieżące głosy nie
  zostaną zachowane; potwierdzenie prowadzi do szkicu tego samego typu.
- Wysyłka gry działa jak transfer przez eksport/import: wysyła wyłącznie szkic,
  zachowuje jego kanoniczny typ i stosuje te same reguły pól. Wysyłanie do
  Marketplace jest osobnym przepływem opisanym niżej: dopuszcza również
  zamknięte ankiety i tworzy snapshot preparowany. Zamknięte ankiety nie są
  wysyłane jako kopie do znajomych.
- Powielenie do własnej biblioteki korzysta z tego samego formatu i normalizacji
  transferu. Może przyjąć jako źródło także ankietę otwartą lub zatrzymaną;
  kopia ma wtedy ten sam typ ankiety w stanie szkicu, bez bieżących głosów.
  Zamknięte ankiety odpowiadają wariantom „zamknięta ankieta” z transferu,
  a `prepared` pozostaje szkicem, którego gotowość wynika z reguł. Warunki
  dopuszczenia źródła do „Wyślij znajomemu” pozostają osobną regułą akcji.

### Marketplace — obecna bramka wysyłania

- Frontend (`web/marketplace/js/marketplace.js`, `openSubmitModal`) pokazuje
  własne, nie-demo gry spoza Marketplace. Dla `prepared` sprawdza tylko liczbę
  pytań ≥10; ankietę tekstową/punktową pokazuje tylko przy `status=ready`.
  Dlatego lista może pokazać niekompletną preparowaną, którą później odrzuci
  backend.
- RPC `market_submit_game` ponownie sprawdza właściciela, brak pochodzenia z
  Marketplace, `is_demo=false`, duplikat oczekującego/opublikowanego zgłoszenia
  oraz `game_action_state(...).can_play`. Wymaga też ≥10 pytań i waliduje tytuł
  (1–120 znaków), opis (do 500) i język (`pl`, `en`, `uk`). To backend jest
  właściwą bramką bezpieczeństwa.
- RPC ignoruje przekazane z przeglądarki `p_payload` i buduje snapshot
  bezpośrednio z rekordu gry. Jeśli źródłem jest zamknięta ankieta, ustawia
  `payload.game.type = 'prepared'`; `prepared` zostaje `prepared`. Zatem
  zgłoszenie do Marketplace rzeczywiście pochodzi z gry preparowanej gotowej do
  gry albo z zamkniętej ankiety, ale sam snapshot Marketplace jest
  reprezentowany jako preparowany.
- Po dodaniu opublikowanej gry do biblioteki użytkownika jej lokalny rekord
  `games.type` jest `market`. To specjalna kopia, zwykle tylko do przeglądania,
  a nie typ ankiety lub nowy wariant JSON.
- Istotna rozbieżność do rozwiązania przy centralizacji: `market_submit_game`
  woła starsze `game_action_state`, a nie `game_validate`. Starsza reguła
  preparowanej sprawdza ≥10 pytań, 3–6 odpowiedzi, punkty 0–100 i sumę ≤100,
  ale nie sprawdza minimum 4 punktów na odpowiedź. Bieżący `game_rules_compute`
  również nie ma progu 4. Nowa reguła minimum 4 musi zostać uwzględniona w
  centralnym wyniku gotowości i bramce Marketplace; obecnie nie jest egzekwowana.

### Zmiana typu gry

Obok akcji powielania należy dodać akcję „Zmień typ”. Otwiera ona modal wyboru
jednego z trzech typów źródłowych. To jest edycja istniejącej gry, a nie
powielenie ani utworzenie nowej gry: konwersja aktualizuje ten sam rekord.

- Używa dokładnie tej samej reguły `edit`, co przycisk „Edytuj”, zarówno w UI,
  jak i w bazie. Nie tworzy własnej, luźniejszej bramki.
- Ankieta `poll_open` jest zablokowana dla zmiany typu tak samo jak dla edycji.
  `poll_stopped` również pozostaje zablokowana, jeśli wspólna reguła edycji ją
  blokuje. Typ `market` nie podlega edycji.
- Dla zamkniętej ankiety (`ready`) modal korzysta z tego samego
  `needs_reset`/potwierdzenia co edytor. Bez potwierdzenia nic się nie zmienia;
  po potwierdzeniu resetuje wyniki i przypisaną punktację tak jak zwykła edycja,
  a następnie zmienia typ i ustawia grę jako szkic docelowego typu.
- Dla szkicu zmiana typu może przejść bez resetu wyników ankiety, bo ich nie ma;
  nadal wykonuje konwersję danych z tabeli poniżej.
- Modal pokazuje podsumowanie konwersji i utraconych danych przed
  zatwierdzeniem. Reguły gotowości nie blokują zapisu konwersji; wynikowy szkic
  może wymagać dalszego uzupełnienia.

| Zmiana | Konwersja szkicu |
|---|---|
| Preparowana → punktowa | Zachować pytania i odpowiedzi, usunąć przypisane punkty stałe; ankieta zbiera nowe głosy |
| Preparowana/punktowa → tekstowa | Zachować pytania, usunąć odpowiedzi i punkty; odpowiedzi będą zbierane tekstowo |
| Tekstowa → punktowa | Zachować pytania; brak odpowiedzi oznaczyć jako braki do uzupełnienia |
| Tekstowa/punktowa → preparowana | Zachować pytania i istniejące odpowiedzi, jeśli są częścią źródła; brakujące punkty oznaczyć jako braki, bez automatycznego przydziału |
| Ten sam typ | Bez konwersji treści; wynik to szkic zgodny z wybraną operacją |

Konwersja zamkniętej ankiety prowadzi do szkicu dopiero po tej samej jawnej
akceptacji resetu, której wymaga zwykła edycja. Wyniki i przypisana punktacja
są wtedy czyszczone zgodnie z kontraktem edytora. Dokładny zakres zachowania
tekstowych odpowiedzi z zamkniętej ankiety wymaga sprawdzenia implementacji i
zostaje opisany w podsumowaniu modalа przed wdrożeniem.

### Znalezione obecne zachowania

- `web/shared/js/core/game-transfer-format.js` eksportuje format `.famgame` i
  kopie wysyłane. `gameTransferType()` dopuszcza tylko trzy źródłowe typy:
  `poll_text`, `poll_points`, `prepared`; `market` i nieznane wartości
  zamienia po cichu na `poll_text`. Dla `market` trzeba dodać jawne
  rozstrzygnięcie (np. blokada generycznego eksportu kopii, z osobną akcją
  pobrania źródłowej pozycji Marketplace), nie usuwać `market` z bazy.
- Wspólny mechanizm powielania (`web/shared/js/core/resource-clone-plan.js`,
  `supabase/migrations/2026-10-13_365_resource_clone_common.sql`) obecnie
  odrzuca źródłową grę o statusie innym niż `draft` lub `ready`. Ankiety
  `poll_open` i `poll_stopped` nie dają się więc teraz powielić, mimo że
  docelowo mają tworzyć bezpieczny szkic bez bieżących głosów.
- Obecny odczyt kopii używa pakietu bez statusu, a `_game_import_package`
  zawsze tworzy `draft`; dodatkowo `gameExportSnapshot()` zamienia zamkniętą
  ankietę na `prepared`. To nie realizuje ustalonego transferu pięciu
  wariantów: po centralizacji powielenie ma stosować ten sam jawny mapping
  stanów co import/eksport (otwarta/zatrzymana → szkic tego samego typu;
  zamknięta ankieta → zachowany typ i zamknięty wynik; preparowana → szkic).
- Gotowa ankieta (`status=ready`) jest obecnie eksportowana jako `prepared`, co
  zmienia jej typ. To koliduje z nowym kontraktem pięciu kombinacji i musi
  zostać zastąpione jawną obsługą zamkniętej ankiety tego samego typu.
- Eksport `poll_text` usuwa odpowiedzi. Eksport szkicu `poll_points` zeruje
  `fixed_points`. Pozostałe eksportowane odpowiedzi są sortowane po `ord` z
  kolejnością wejściową jako fallback.
- `supabase/migrations/2026-10-13_364_game_import_atomic.sql` normalizuje
  pakiet: przyjmuje trzy typy i nieznany typ zamienia na `poll_text`; przycina
  pytanie do 200 znaków i odpowiedź do 17; puste treści zastępuje tekstem
  domyślnym; dla typów innych niż tekstowy limituje odpowiedzi do 6; punkty
  zaokrągla/ogranicza do 0–100, brakujące ustawia na 0; odpowiedzi ankiety
  tekstowej usuwa. Import tworzy szkic i sam nie wymaga gotowości do gry.
- Typ bazy `market` jest osobnym typem kopii z Gier Społeczności (migracja
  `2026-03-11_054_game_type_market.sql`). Nie należy go mylić z nieobsługiwanym
  aliasem importowym; nie powinien jednak trafiać do generycznego JSON-u jako
  jeden z pięciu wariantów.

### Zakres pełnego audytu

Przed implementacją należy prześledzić wszystkie ścieżki, nie tylko plik
`.famgame`:

1. eksport/import z listy Gier;
2. tworzenie gry z Base Explorera;
3. wysyłanie i odbiór kopii gry oraz powielanie;
4. import/eksport JSON i każdą ścieżkę używaną przez Marketplace;
5. RPC i funkcje SQL normalizujące pakiet;
6. starsze formaty/typy i rzeczywiste rekordy w bazie.

Dla każdej ścieżki sporządzić macierz pól: nazwa, typ, kolejność, odpowiedzi,
punkty, status, język/metadata, wersja formatu; opisać: zachowywane,
przekształcane, pomijane, domyślne, limitowane i odrzucane dane. Należy też
sprawdzić, czy porządkowanie odpowiedzi jest tylko w eksporcie, czy wpływa na
zapis, podgląd i późniejszą rozgrywkę.

### Docelowa polityka transferu

- Plik zawiera wyłącznie trzy kanoniczne typy oraz pięć kombinacji wskazanych
  wyżej. `ready` preparowanej jest wynikiem reguł, nie osobnym typem/etykietą.
- Dodać jawne `format_version`; wersje historyczne konwertować przez osobne,
  nazwane migratory formatu, a nie fallback na typ tekstowy.
- Typ rozpoznany zachować zgodnie z mapą wersji. Typ nieznany/nieobsługiwany
  zgłaszać z nazwą typu i wskazaniem, czy można wybrać jawne mapowanie; nigdy
  nie zmieniać po cichu.
- Każde obcięcie, usunięcie, wypełnienie placeholderem, wyzerowanie punktów,
  ograniczenie liczby odpowiedzi lub konwersję typu: albo usunąć z normalizacji
  (jeśli format może zachować dane), albo pokazać przed importem dokładny
  raport strat i uzyskać potwierdzenie. Baza nadal waliduje limity bezpieczeństwa.
- Eksport zamkniętej ankiety zachowuje typ ankiety i zamknięty wynik. Eksport
  otwartej/zatrzymanej ankiety najpierw informuje o utracie bieżących głosów,
  a po potwierdzeniu zapisuje szkic tego samego typu.
- Eksport preparowanej zachowuje typ `prepared`; jej gotowość wylicza silnik
  reguł. Nie ma konwersji gotowej ankiety punktowej/tekstowej na preparowaną.
- Dane wymagające tajności lub związane z sesją/urządzeniami pozostają poza
  formatem, tak jak obecnie; jawnie dokumentować wyłączenia.
- Import nie może odrzucać gry tylko dlatego, że jest niegotowa do rozgrywki.
  Po imporcie centralny silnik pokazuje braki. Błędy struktury i nieobsługiwany
  typ są natomiast raportowane jawnie.

## 5. Plan prac

| Etap | Praca | Rezultat / kryterium zakończenia |
|---|---|---|
| A | Inwentaryzacja typów, statusów, akcji, warunków w JS/SQL oraz wszystkich ścieżek transferu; próbki starych typów i rzeczywistych pakietów | Tabele obecne → docelowe, przykłady strat/konwersji i lista rozbieżności; bez zmian aplikacji |
| B | Uzgodnienie tabeli reguł dla gotowości, akcji, edycji po ankiecie, podliczania oraz polityki historycznych/nieznanych typów | Zamknięte decyzje domenowe; rozdzielenie twardych blokad od rekomendacji |
| C | Zdefiniowanie wspólnego kontraktu wyników i kodów reguł; SQL pozostaje autorytatywny dla zapisu, JS nie duplikuje progów | Jednoznaczny kontrakt wejścia/wyjścia i przejście stanu; testy jednostkowe kontraktu |
| D | Przebudowa modalа Base Explorera według §2; poprawa metadanych bazy do roli sugestii | Dokładne zaznaczenie tworzy szkic; oznaczenia informacyjne; brak bramki 10/kompletności/sumy 100 |
| E | Integracja gier, edytora, ankiet, Control i kafli z centralnym kontraktem | Każdy przycisk pokazuje wynik centralnej reguły; serwer odrzuca niedozwolone przejście tym samym kodem |
| F | Ujednolicenie kwalifikacji podliczania i zamykania dla obu typów; ponowne obliczenie po scaleniu | Próg 4% włącznie i min. 3 odpowiedzi w jednym algorytmie; samo wejście w podliczanie nie jest blokowane |
| G | Dodanie „Zmień typ” obok powielania; ta sama bramka `edit` i ta sama ścieżka resetu co w edytorze; konwersja tego samego rekordu do szkicu wybranego typu | Ankieta otwarta/zatrzymana blokuje akcję; zamknięta wymaga identycznego potwierdzenia resetu; podgląd strat/braków przed zapisem |
| H | Wdrożenie wersjonowanego transferu; jawna obsługa kopii `market`; usunięcie cichych fallbacków; ten sam kontrakt dla wysyłania kopii i poprawa bramki zgłoszenia Marketplace | Dokładnie pięć wariantów zwykłego transferu; wysyłka znajomym wyłącznie szkiców tego samego typu; Marketplace przyjmuje gotową `prepared` lub zamkniętą ankietę jako snapshot `prepared` |
| I | Punktowe testy DB/JS/E2E dla reguł, akcji, zmiany typu oraz importu/eksportu/wysyłki | Macierz scenariuszy zielona; brak pełnych przebiegów bez potrzeby; dokumentacja formatu zaktualizowana |

## 6. Scenariusze kontrolne wymagane przed zamknięciem

- W Base Explorerze utworzenie gry z 0, 1, 9 i 10 zaznaczonymi pytaniami; z
  pytaniem niekompletnym; z punktami poniżej 4; oraz z sumą inną niż 100. W
  każdym przypadku utworzenie ma zachować wybrany zestaw, a wynik gotowości ma
  wskazać braki bez blokowania.
- Klasyfikacja sugestii „Preparowana” bez odpowiedzi i z niepełnymi odpowiedziami
  nie blokuje dodania do gry.
- Reguły gotowości typu `prepared`: odpowiedź z 3 punktami jest brakiem,
  odpowiedź z 4 punktami przechodzi próg per odpowiedź; osobno sprawdzić zakres
  sumy zgodnie z ostatecznie zatwierdzoną tabelą reguł.
- Każda akcja na każdym typie/statusie: edycja szkicu, edycja gotowej ankiety z
  resetem, blokada edycji aktywnej ankiety, uruchomienie, zatrzymanie/wznowienie,
  podliczanie, zamknięcie i rozgrywka.
- Zmiana typu na szkicu, otwartej, zatrzymanej i zamkniętej ankiecie: identyczne
  dozwolenie/blokada jak „Edytuj”; bez resetu nie zmienia stanu ani danych;
  zaakceptowany reset zamkniętej ankiety czyści te same wyniki i punktację co
  edytor, po czym konwertuje ten sam rekord do szkicu.
- Powielenie: szkic pozostaje szkicem, ankieta otwarta/zatrzymana może być
  powielona jako szkic tego samego typu bez głosów, zamknięta ankieta zachowuje
  swój wariant zamknięty, a preparowana jest szkicem; żadna kopia nie dziedziczy
  sesji ani bieżącego stanu głosowania.
- Podliczanie: dokładnie 3% i 4% po zaokrągleniu, mniej/więcej niż 6 pozycji,
  mniej niż 3 kwalifikujące odpowiedzi, oraz tekstowe scalanie które zmienia
  ranking/procent i pozwala ponownie spełnić próg.
- Import/eksport round-trip: wszystkie pięć dozwolonych kombinacji; eksport
  otwartej i zatrzymanej ankiety z ostrzeżeniem o utracie bieżących głosów;
  wysyłka szkicu zachowująca typ; konwersja każdego typu do pozostałych typów;
  pytanie
  z długą treścią, odpowiedź dłuższa niż limit, puste pole, brak punktów,
  wartości graniczne/poza zakresem, nadmiar odpowiedzi, typ historyczny,
  kopię typu `market` i próbę jej generycznego eksportu, typ nieznany, duplikat
  i przerwanie importu. Zamknięte wyniki są
  zachowane tylko przy eksporcie/importcie zamkniętej ankiety bez zmiany typu;
  jawna zmiana typu ostrzega o ich usunięciu.
- Sprawdzić, że błąd pojedynczego elementu nie zostawia częściowo utworzonej
  gry, a raport strat odzwierciedla dokładnie pakiet wejściowy.

## 7. Decyzje pozostawione do rozstrzygnięcia po audycie

1. Czy eksport ma przechowywać pełne treści ponad obecne limity i import dopiero
   zgłaszać niezgodność, czy format ma świadomie limitować dane.
2. Jakie dokładnie historyczne aliasy/typy (poza kanonicznymi typami źródłowymi
   i kopią `market`) oraz zapisy `ready`→`prepared` występują w produkcyjnych
   danych/pakietach i jakie migracje sprowadzą je do docelowego modelu.
3. Jak rozumieć sumę punktów w gotowości „Preparowanej” (obecnie limit SQL
   `<=100`, wcześniejsze założenia edytora mówią o sumie 100). Ta decyzja jest
   osobna od modalа Base Explorera, w którym sumy 100 nie sprawdzamy.
4. Dokładna kolejność przycinania do sześciu odpowiedzi i liczenia udziału
   procentowego przy końcowej kwalifikacji; JS i SQL muszą stosować identyczny
   algorytm.

Powyższe kwestie mają zostać rozstrzygnięte na podstawie wyników audytu przed
etapem C. Nie są powodem do zatrzymania samej inwentaryzacji.
