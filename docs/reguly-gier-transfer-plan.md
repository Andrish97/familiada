# Centralne reguły gier oraz import i eksport — plan

**Stan:** implementacja autoryzowana przez użytkownika (2026-10-20) i wykonana
na branchu — migracje 404–407, kod JS, testy; przebieg wdrożenia w §9 i w
Dzienniku `wdrozenia.md`. Wcześniejsze zapisy „tylko planowanie” i „zatrzymanie
przed implementacją” są nieaktualne.  
**Zakres:** jedno źródło reguł dla gotowości i dozwolonych akcji gry, uproszczenie
modalów tworzenia gry z Base Explorera oraz jednolite reguły importu/eksportu,
z uzgodnioną automatyczną normalizacją danych do limitów.
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
  bazy; nie znosi limitu sumy punktów w centralnej ocenie gotowości gry:
  dla preparowanej suma w pytaniu wynosi najwyżej 100 (decyzja 2026-10-20).
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

### Ustalona grywalność preparowanej — decyzja 2026-10-20

Gra typu `prepared` jest grywalna, gdy spełnia **wszystkie cztery warunki
jednocześnie**:

1. Ma co najmniej **10 pytań**.
2. Każde pytanie ma **od 3 do 6 odpowiedzi włącznie**.
3. Każda odpowiedź ma **co najmniej 4 punkty**.
4. Suma punktów wszystkich odpowiedzi **w każdym pytaniu osobno nie
   przekracza 100**.

Suma nie musi wynosić dokładnie 100. Warunki dotyczą grywalności, nie
możliwości utworzenia lub zapisania szkicu. Modal Base Explorera pokazuje
braki informacyjnie i nie blokuje tworzenia szkicu.

### Dalsze decyzje dotyczące punktacji i ochrony gry — 2026-10-20

- Punkty ankiety są jej udziałami procentowymi: **całość wskazań na pytanie
  mapujemy proporcjonalnie na 100**. Przy 100 wskazaniach liczba wskazań
  odpowiada punktom. Procent wyświetlany w podliczaniu ma wyjaśniać tę samą
  punktację, nie być drugim, inaczej zaokrąglonym wynikiem. Liczymy całość
  przed odrzuceniem słabych odpowiedzi/wyborem sześciu; pominięcie części
  odpowiedzi nie zwiększa udziałów pozostałych. **Dalsza decyzja:** przy
  niecałkowitych udziałach dopuszczamy niedobór punktów, np. 33/33/33 i sumę
  99. Nie dobijamy do 100 przez arbitralne rozbijanie równych głosów; suma
  punktów odpowiedzi zapisanych do gry nie może przekroczyć 100.
- **Zaokrąglanie — decyzja 2026-10-20:** jednakowa liczba głosów w pytaniu
  zawsze daje jednakowy procent. Dla udziału `100 * liczba_głosów / N`, gdzie
  N jest liczbą pełnych ankiet w bieżącym uruchomieniu: brak głosów daje 0%;
  dodatni udział poniżej 1% pokazujemy jako 1%; wszystkie pozostałe udziały
  ucinamy do pełnej liczby całkowitej (`floor`). Bez rozdzielania reszt
  i bez odejmowania punktów dla rozbicia remisu. Przykłady: 0,8% → 1%,
  3,9% → 3%, 4% → 4%, 33⅓% → 33%. Kwalifikacja od 4% dotyczy tak
  otrzymanej wartości; 3,9% nie kwalifikuje się.
  Do gry trafiają wyłącznie wybrane, kwalifikujące się odpowiedzi, a ich
  punkty są równe procentowi. Minimum 1% nie przyznaje punktów odpowiedziom
  poniżej progu 4%. Suma procentów wszystkich surowych pozycji może przez
  podnoszenie drobnych udziałów do 1 przekroczyć 100; nie jest to suma punktów
  gry i nie może być użyta do ponownej normalizacji. Suma punktów wybranych
  odpowiedzi nadal jest ≤100. JS i SQL stosują ten sam algorytm.
- **Remis na granicy szóstki — decyzja 2026-10-20:** w podliczaniu tekstowym,
  gdy szósta i kolejna odpowiedź mają **dokładnie tyle samo głosów**, pojawia
  się pojedynczy przycisk zmiany wyboru w remisie. Dla dwóch kandydatów
  zamienia szóstą i siódmą odpowiedź; następne kliknięcie przywraca poprzedni
  wybór. Widok jasno pokazuje, która odpowiedź wejdzie do gry, a która
  zostanie pominięta. Nie wymaga to zmiany głosów ani punktów.
  Kolejność kandydatów w podliczaniu wynika z liczby głosów malejąco,
  z zapisanym porządkiem jako rozstrzygnięciem identycznych liczebności.
  Jednakowy procent po ucięciu przy różnych liczbach głosów **nie uprawnia**
  do pominięcia odpowiedzi z większą liczbą głosów na rzecz mniej popularnej.
  Np. przy 200 pełnych ankietach 10 i 11 głosów daje po 5%, ale przy
  wyborze szóstki pierwszeństwo ma 11 głosów, bez przycisku zamiany.
  Jest to odrębne od rozgrywki: po zatwierdzeniu odpowiedzi zapisane z tą
  samą punktacją są remisujące, niezależnie od tego, czy równość wynikała
  z identycznych liczebności, czy z ucięcia procentu. Zgodnie z ustaloną
  definicją najwyżej punktowanej odpowiedzi liczą się zapisane punkty;
  sam plik transferu nie przechowuje liczby głosów.
  Uogólnienie dla większej grupy remisowej: wszystkie odpowiedzi ponad nią
  pozostają wybrane, a przycisk cyklicznie zmienia zestaw z remisowej grupy
  w pozostałych miejscach do sześciu. Każdy dopuszczalny zestaw musi być
  osiągalny; nie wolno ograniczyć się do dwóch pozycji i ukryć innych
  równorzędnych kandydatów. Domyślny wybór jest widoczny, użytkownik może
  go zmienić przed zatwierdzeniem. Przycisk nie występuje, jeżeli nie ma
  remisu przecinającego granicę sześciu kwalifikujących się odpowiedzi.
  Wybór jest częścią szkicu podliczania i końcowego zapisu. Po scaleniu
  tekstów przeliczyć liczebności i kwalifikację, zachować wybór, jeśli nadal
  jest poprawny, a zmianę wymuszoną nowym rankingiem pokazać w podsumowaniu.
  SQL waliduje wybrany zestaw względem aktualnego rankingu, remisu i limitu
  sześciu; frontend nie może pozwolić ominąć lepszej odpowiedzi spoza remisu.
- **Minimalna liczba głosów — ostateczne doprecyzowanie 2026-10-20:**
  podliczanie ankiety punktowej i tekstowej jest dozwolone od **10 pełnych
  oddanych ankiet w bieżącym uruchomieniu**. Przy 0–9 akcja „Podlicz” jest
  zablokowana; próg jest sprawdzany przed rozpoczęciem podliczania, nie
  dopiero przy zatwierdzaniu wyniku. Oddanie ankiety obejmuje odpowiedź na
  wszystkie pytania; każde pytanie otrzymuje więc tyle samo głosów. Liczymy
  pełne wypełnienia, nie sumę wierszy odpowiedzi ani osobne progi pytań.
  To zmienia wcześniejszy zapis o swobodnym wejściu do podliczania. Bramka
  liczby głosów jest odrębna od min. 3 odpowiedzi z udziałem ≥4% na pytanie:
  przy ≥10 pełnych wypełnieniach można wejść do podliczania i scalać teksty,
  nawet jeśli wynik nie spełnia jeszcze warunków zatwierdzenia. UI i SQL
  korzystają ze wspólnej reguły; zapis wyniku ponownie sprawdza próg, aby
  starszy klient lub usunięcie głosów w międzyczasie nie ominęły ograniczenia.
- **Usuwamy sztuczne obniżanie punktów w celu rozbijania remisów.** Różne
  odpowiedzi mogą mieć tyle samo punktów. **Doprecyzowanie użytkownika:**
  trafienie dowolnej odpowiedzi o maksymalnej wartości oznacza trafienie
  najwyżej punktowanej. Przy 40/40/20 obie odpowiedzi za 40 kończą pojedynek
  tak samo. Odpowiedzi sortujemy malejąco po punktach, remisy zachowują
  zapisany ord; kolejność wyświetlania nie rozstrzyga zwycięstwa. Tożsamość
  kafli/odsłonięć pozostaje oparta na ID/ord, nie na wartości punktów.
- Aktywna rozgrywka Control blokuje edycję i pozostałe kolidujące operacje
  także po zamknięciu karty, do zakończenia/wygaszenia przebiegu. Godzinę
  liczymy od ostatniej aktywności operatora, nie od samego zamknięcia karty.
  Nie utożsamiać tego z krótką blokadą strony (120 s). Brak takiej ochrony
  w innych wejściach/operacjach niż ustawienia jest rozbieżnością do poprawy
  w centralnej bramce JS/SQL. Istniejący jawny przepływ zakończenia sesji
  w ustawieniach pozostaje osobną operacją.

### Reguły do zinwentaryzowania i ujednolicenia

- Typy i aliasy: `poll_text`, `poll_points`, `prepared`, `market` oraz wszystkie
  typy/aliasy znalezione w schemacie, danych, plikach transferu, migracjach,
  testach i kodzie stron.
- Gotowość do rozgrywki: dla „Preparowanej” obowiązuje pełna reguła czterech
  warunków powyżej. Pozostałe typy oceniamy według ich własnego kontraktu;
  nie przenosimy wymagań grywalności do bramki tworzenia szkicu.
- Gotowość do ankiety tekstowej i punktowej oraz osobne akcje otwarcia,
  głosowania, stop/wznów i podliczenia.
- Edycja gry i wyniki ankiety: kiedy edycja jest zablokowana, kiedy dozwolona
  po potwierdzeniu resetu oraz które wyniki/punktacja zostaną skasowane.
- Podliczanie: wspólna reguła kwalifikacji obu typów. Zgodnie z ostatnim
  uzgodnieniem odpowiedź kwalifikuje się od **4% włącznie**; wynik procentowy
  jest zaokrąglany zgodnie z ustaloną regułą, a do zamknięcia wymagane są co
  najmniej 3 kwalifikujące odpowiedzi na pytanie po scaleniu i ponownym
  przeliczeniu. Dla tekstowej listę ogranicza także limit sześciu odpowiedzi;
  wejście do podliczania wymaga ≥10 pełnych oddanych ankiet, ale nie wymaga
  jeszcze spełnienia kwalifikacji odpowiedzi do zamknięcia. Szczegółowy
  porządek progowania/scalania musi wynikać z jednego algorytmu wspólnego
  dla JS i SQL.
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
- **Decyzja 2026-10-20 — kopie `market`:** wszystkie akcje transferu takich
  kopii są zablokowane, również po usunięciu oryginału z Marketplace.
  Lokalna kopia zachowuje typ `market` i pozostaje widoczna w bibliotece;
  źródło usunięte oznaczamy jako archiwalne. Usunięcie/wycofanie pozycji
  Marketplace nie ma tworzyć edytowalnej preparowanej. Etykieta archiwalna
  jest informacją o dostępności źródła, nie nowym typem gry.

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
  preparowanej sprawdza ≥10 pytań, 3–6 odpowiedzi tylko w pytaniach mających
  odpowiedzi, punkty 0–100 i sumę ≤100. Agregat `ans` pomija pytania bez
  odpowiedzi, więc ta bramka może przepuścić preparowaną z takim pytaniem.
  Nie sprawdza też minimum 4 punktów na odpowiedź. Bieżący `game_rules_compute`
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
tekstowych odpowiedzi z zamkniętej ankiety jest już sprawdzony w audycie A
(§8): obecny reset zachowuje ich treść, zeruje punkty i cofa status do szkicu.
Nie usuwa jednak surowych głosów ani sesji. **Decyzja 2026-10-20:** docelowy
reset edycji ma działać jak normalny reset ankiety: usuwa głosy, surowe
odpowiedzi, sesje głosowania i szkic podliczania, unieważnia stare linki,
zaproszenia i kody QR oraz wszystkie zależne dostępy do tego uruchomienia.
Gra ma status `draft`, bez aktywnej ankiety i zatwierdzonego wyniku; treść
pytań i odpowiedzi zostaje, przypisana punktacja jest zerowana. „Zamknięta
ankieta” oznacza tu brak możliwości głosowania, a nie zachowanie statusu
`ready`. Ten sam reset obowiązuje w edytorze i przy zmianie typu, po takim
samym potwierdzeniu i z ochroną aktywnej rozgrywki Control.

### Znalezione obecne zachowania

- `web/shared/js/core/game-transfer-format.js` eksportuje format `.famgame` i
  kopie wysyłane. `gameTransferType()` dopuszcza tylko trzy źródłowe typy:
  `poll_text`, `poll_points`, `prepared`; `market` i nieznane wartości
  zamienia po cichu na `poll_text`. Dla `market` ustalono blokadę wszystkich
  akcji transferu kopii, także archiwalnej; nie usuwać `market` z bazy.
- Wspólny mechanizm powielania (`web/shared/js/core/resource-clone-plan.js`,
  `supabase/migrations/2026-10-13_365_resource_clone_common.sql`) obecnie
  odrzuca źródłową grę o statusie innym niż `draft` lub `ready`. Ankiety
  `poll_open` i `poll_stopped` nie dają się więc teraz powielić, mimo że
  docelowo mają tworzyć bezpieczny szkic bez bieżących głosów.
- Odczyt SQL `_resource_clone_read` zawiera status w `game.status`; dopiero
  `gameExportSnapshot()` pomija go w definicji kopii. `_game_import_package`
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
  zaokrągla w dół (`floor`) i ogranicza do 0–100, brakujące ustawia na 0;
  odpowiedzi ankiety tekstowej usuwa. Import tworzy szkic i sam nie wymaga
  gotowości do gry.
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
- Typ rozpoznany zachować zgodnie z mapą wersji. Zwykły import/eksport nie ma
  fallbacków ani zgadywania typu po nazwie gry. Niejasne dane historyczne
  obsługuje wyłącznie opisana niżej jawna ścieżka odzyskania do
  `prepared`/`draft`, z informacją o wyniku i odzyskanych danych.
- **Decyzja 2026-10-20 — normalizacja bez pytania:** za długie teksty
  obcinać do docelowych limitów (nazwa 80, pytanie 100, odpowiedź 17
  znaków). Punkty ujemne, nienumeryczne, nieskończone lub poza zakresem
  0–100 zamieniać na 0, a nie ograniczać do najbliższej granicy (101 → 0).
  Przy ponad sześciu odpowiedziach najpierw normalizować punkty, następnie
  sortować malejąco po punktach i zachować pierwsze sześć; przy remisie
  zachować kolejność wejściową. Nie usuwać pytań ani zmieniać zaznaczenia.
  Ta sama polityka obowiązuje we wspólnym kontrakcie transferu i przy
  odzyskiwaniu historycznego pakietu. Operacje nie wymagają podglądu,
  ręcznych poprawek ani dodatkowego potwierdzenia; ewentualny raport zmian
  jest informacyjny. Nie daje to zgody na dopisywanie treści zastępczych,
  zgadywanie typu ani oznaczanie niepoprawnego wyniku jako zamkniętego.
  Gotowość po normalizacji nadal wylicza centralny silnik reguł.
- **Decyzja 2026-10-20 — długość pytania:** limit zmniejszamy z 200 do
  **100 znaków**. Odpowiedź pozostaje ograniczona do **17 znaków**.
  Docelowo te same limity obowiązują w edytorze, Base Explorerze, transferze
  i serwerowych ścieżkach zapisu. Nadmiar treści obcinamy zgodnie z powyższą
  polityką, bez pytania. Przed zaostrzeniem ograniczenia bazy zinwentaryzować
  istniejące pytania dłuższe niż 100 znaków, po czym obciąć je migracją
  bez pytania, również w istniejących ankietach; uwzględnić ochronę sesji
  Control. Obecny kod nadal
  stosuje 200/17: `question-form.js` (`LIMITS.Q_TEXT/A_TEXT`, `wireTextLimit`)
  oraz ograniczenia SQL `questions_text_len`/`answers_text_len`. Limit 17
  jest więc już egzekwowany w UI i w schemacie bazy; zmiana 100 jest planem.
- **Decyzja 2026-10-20 — odpowiedzi i podpowiedzi:** w ankiecie tekstowej
  oraz wszędzie, gdzie edytujemy odpowiedzi (edytor gry, wspólny formularz
  Base Explorera i korekta przy podliczaniu), egzekwować limit 17 znaków
  także przy wklejaniu i zapisie. Przy polach pokazać stałą, przetłumaczoną
  podpowiedź: „Maksymalnie 17 znaków. Dłuższe odpowiedzi zostaną przycięte.
  Znaki nieobsługiwane przez czcionkę 5×7, np. emoji, zostaną pominięte
  podczas podliczania ankiety.” W edytorze zamiast zapowiedzi automatycznej
  korekty ankiety podpowiedź ma informować: „Usuń nieobsługiwane znaki,
  aby zapisać odpowiedź.”
  Informacja ma być widoczna przy zwykłym wpisywaniu odpowiedzi, nie tylko
  w modalu importu. **Późniejsze doprecyzowanie użytkownika:** edytor nie
  dopuszcza zapisania odpowiedzi zawierającej niedozwolone znaki; walidacja
  dotyczy także wspólnego formularza Base Explorera i ręcznej korekty wyniku.
  W ankiecie tekstowej głos jest przyjmowany, a niedozwolone znaki usuwa się
  automatycznie podczas podliczania, przed grupowaniem odpowiedzi i liczeniem
  punktacji. Zastępuje to wcześniejsze ustalenie o samym informowaniu
  i pomijaniu symboli dopiero w rendererze. Surowy wpis pozostaje źródłem
  audytowym; do zatwierdzonego wyniku trafia oczyszczona treść. Podpowiedź
  głosującego musi uprzedzać o tej korekcie.
  Dozwolone znaki wyznacza **`web/shared/fonts/display/font_5x7.json`**:
  wszystkie kategorie poza `meta`, zgodnie z budowaniem mapy w `fonts.js`.
  Uwzględnić NFC i zamianę na wielkie litery stosowaną przez renderer,
  aby nie odrzucać małych liter mających obsługiwany wielki odpowiednik,
  w tym polskich i ukraińskich. Nie stosować osobnej listy ASCII ani uznawać
  pustego zastępczego glifu za dowód obsługi nieznanego znaku. JS i SQL
  korzystają z tego samego zestawu pochodzącego z fontu, bez ręcznego
  utrzymywania dwóch rozbieżnych list. Limit i walidacja serwerowa mają być spójne
  także dla bezpośrednich wywołań wszystkich RPC oddających głosy tekstowe.
  Przy implementacji ujednolicić liczenie znaków JS/SQL i bezpieczne obcinanie
  Unicode; obecne `slice`/`maxlength` liczą jednostki UTF-16.
- **Doprecyzowanie 2026-10-20 — oba edytory i finał:** wszystkie powyższe
  zasady odpowiedzi obowiązują jednakowo **w edytorze pytań baz oraz
  w edytorze pytań gry**: limit 17 znaków, walidacja według fontu 5×7,
  blokada zapisu niedozwolonych znaków oraz widoczne podpowiedzi. Dotyczy
  tworzenia, edycji i wklejania odpowiedzi, nie tylko jednej strony.
  W obu edytorach przy wpisywaniu odpowiedzi pokazać także komunikat:
  **„W finale wyświetlacz mieści 11 znaków. Dłuższe odpowiedzi zostaną
  na nim skrócone.”** Nie jest to nowy limit zapisu odpowiedzi: w bazie
  i grze zachowujemy do 17 znaków; finał skraca wyłącznie prezentację,
  zgodnie z istniejącym `displayText.js:clipDisplayText` i polami 11-znakowymi
  w `control/display/js/scene.js`. Nie zmieniać tożsamości odpowiedzi,
  trafienia ani punktacji z powodu skrótu. Te same zasady dopuszczalnych
  znaków objąć walidacją serwerową zapisu pytań/odpowiedzi obu edytorów,
  a migracyjną inwentaryzacją i oczyszczaniem objąć również istniejące
  odpowiedzi w bazach pytań. Filtr fontu nadal dotyczy tylko odpowiedzi.
- Po oczyszczeniu przy podliczaniu jednakowe odpowiedzi grupować ze
  zsumowaniem ich wskazań (np. tekst z emoji i ten sam tekst bez emoji).
  Ponownie przeliczyć ranking, kwalifikację od 4% i wybór szóstki. Odpowiedź
  złożona wyłącznie z usuniętych znaków nie może stać się pustą, kwalifikującą
  odpowiedzią ani otrzymać placeholdera. Nie usuwać przez to surowych głosów
  ani zmieniać mianownika wszystkich wskazań/próbki pełnych ankiet; nadal
  obowiązuje centralna walidacja minimum trzech kwalifikujących odpowiedzi.
- Audyt powyższej decyzji: ankieta `polls/vote/text/index.html` ma
  `maxlength=17`, a `poll-text.js` obcina wpis i pakowany tekst do 17;
  podpowiedź mówi dziś tylko „Maksymalnie 17 znaków”. Edytor i Base Explorer
  używają `question-form.js:wireTextLimit`; komunikat o obcinaniu istnieje
  w edytorze w modalu TXT, nie jako wspólna podpowiedź pól. Renderer
  `shared/js/display/fonts.js:resolveGlyph` zastępuje brakujący glif spacją
  (lub pustą bitmapą), nie usuwa go z zapisanego tekstu. SQL ma ograniczenie
  `answers_text_len` dla zapisanych odpowiedzi i kontrolę 17 w anonimowym
  RPC 362; starsze `poll_text_submit` i `poll_text_submit_batch_owner`
  nie mają własnej kontroli długości `answer_raw` — uwzględnić te ścieżki
  przy centralizacji, nie polegać wyłącznie na polu HTML.
- Eksport zamkniętej ankiety zachowuje typ ankiety i zamknięty wynik. Eksport
  otwartej/zatrzymanej ankiety najpierw informuje o utracie bieżących głosów,
  a po potwierdzeniu zapisuje szkic tego samego typu.
- Eksport preparowanej zachowuje typ `prepared`; jej gotowość wylicza silnik
  reguł. Nie ma konwersji gotowej ankiety punktowej/tekstowej na preparowaną.
- Dane wymagające tajności lub związane z sesją/urządzeniami pozostają poza
  formatem, tak jak obecnie; jawnie dokumentować wyłączenia.
- Odczytowa kontrola przed migracją limitu pytań (wykonana przez
  użytkownika w bazie; wynik przekazany 2026-10-20):

  ```sql
  SELECT
    count(*) FILTER (WHERE char_length(text) > 100) AS pytania_ponad_100,
    max(char_length(text)) AS najdluzsze_pytanie
  FROM public.questions;
  ```

  Wynik: **11 pytań ponad 100 znaków; najdłuższe ma 197 znaków**.
  Użytkownik przekazał również podgląd wszystkich 11: jedno pole zawiera
  pytanie i wklejoną tabelę odpowiedzi z punktacją, pozostałe 10 to pytania
  długości 101–129. Obcięcie może przerwać słowo lub zdanie; obowiązuje
  uzgodnione mechaniczne skrócenie do 100, bez parafrazowania ani zgadywania
  odpowiedzi z treści pytania. Nie kopiujemy treści ani nazw gier do planu.
  To częściowy audyt danych tabeli pytań gier; nie potwierdza zgodności
  wszystkich baz pytań i historycznych pakietów/snapshotów. Przed wdrożeniem
  powtórzyć odczyt, bo liczba rekordów może się zmienić.
- **Decyzja 2026-10-20:** zamknięta ankieta przenosi pytania, zatwierdzone
  odpowiedzi i punkty oraz swój zamknięty wariant. Nie zachowujemy liczby
  głosów ani historii/tożsamości głosujących; nie tworzymy fikcyjnych głosów
  lub sesji na podstawie punktacji. Importowany wynik pozostaje grywalnym
  wynikiem, a nie odtworzoną ankietą z tymi samymi respondentami.
- Import nie może odrzucać gry tylko dlatego, że jest niegotowa do rozgrywki.
  Po imporcie centralny silnik pokazuje braki. Jeżeli z historycznego pliku
  da się odzyskać grę i jej pytania, niejasność typu/stanu prowadzi do jawnego
  odzyskania preparowanej w szkicu. Jeśli nie da się odczytać nawet gry i jej
  pytań, import zgłasza błąd i nie tworzy zastępczej pustej gry.

### Migracja starych gier i odzyskiwanie — decyzja 2026-10-20

- Przy wdrożeniu nowych reguł przygotować **migrację naprawczą danych dla
  wszystkich użytkowników**, obejmującą historyczne gry niezgodne z obecnym
  kontraktem. Nie ograniczać ujednolicenia do nowych importów ani kont
  aktualnie zalogowanych. Konkretne przypadki i liczebności ustalić odczytem
  danych przed napisaniem migracji.
- Rozpoznane, jednoznaczne typy i stany normalizować zgodnie z kontraktem.
  Poprawnych typów nie zmieniać tylko dlatego, że szkic nie jest jeszcze
  grywalny. Rozpoznany typ kopii `market` pozostaje osobnym typem w bazie.
- **Doprecyzowanie 2026-10-20:** migrację wykonać w nocnym oknie wdrożenia;
  rozpoznane ankiety pozostawić bez przebudowy głosów, statusu i istniejących
  wyników. **Późniejsza decyzja użytkownika: pytania obciąć migracją do
  100 znaków we wszystkich istniejących grach, także ankietach niezależnie
  od statusu, bez pytania.** Zastępuje to wcześniejszy zakaz zmiany treści
  ankiet w tym konkretnym zakresie. Celem jest zgodność z Control już przy
  pierwszym uruchomieniu, bez wymagania ręcznej edycji. Zachować ID, kolejność
  pytań i powiązania z odpowiedziami/głosami; samo skrócenie nie resetuje
  ankiety ani nie przelicza punktów. Inwentaryzacja ma również objąć pytania
  w bazach i zapisanych pakietach/snapshotach, które mogą ponownie dostarczyć
  dłuższą treść; wszystkie ścieżki tworzenia gry mają respektować 100.
  Nowe reguły podliczania dotyczą przyszłego
  podliczania. Nie przeliczać automatycznie zamkniętych ankiet starym/nowym
  progiem i nie zmieniać ich na preparowane. Zakaz ten nie znosi jawnej
  obsługi niejednoznacznych, historycznych pakietów.
- **Późniejsza decyzja 2026-10-20 — migracja znaków odpowiedzi:** z tekstów
  odpowiedzi istniejących gier usunąć znaki niedozwolone według fontu 5×7,
  bez pytania i dla wszystkich użytkowników, również w zamkniętych ankietach
  i kopiach `market`. Ten drugi wyjątek od ochrony istniejącej treści dotyczy
  **wyłącznie odpowiedzi**. Nie filtrować według fontu pytań, nazw gier ani
  opisów; skrócenie pytań do 100 pozostaje osobną, wcześniejszą decyzją.
  Użyć tego samego zestawu glifów i normalizacji co w walidacji edytora
  i automatycznej korekcie podczas podliczania. Zachować ID i kolejność
  odpowiedzi, przypisane punkty, status, powiązania i głosy; samo czyszczenie
  tekstu nie powoduje resetu ani przeliczenia historycznej punktacji.
  Surowe wpisy ankiety zachowują rolę audytową; do wyniku tekstowego trafia
  treść oczyszczona podczas podliczania. Inwentaryzacja ma wykazać również
  odpowiedzi, które po usunięciu znaków byłyby puste, i kolizje tekstów.
  Nie wstawiać fikcyjnych tekstów ani nie usuwać w ciemno rekordów z punktami
  i głosami. Jeśli takie przypadki występują, ich konkretna obsługa wymaga
  rozstrzygnięcia przed wykonaniem migracji (`answers_text_len` nie dopuszcza
  pustej odpowiedzi). Nadal respektować ochronę aktywnych sesji Control.
- Sama pora nocna nie gwarantuje braku aktywnej rozgrywki. Zalecenie do
  planu operacyjnego: przed zmianą treści sprawdzić trwałe sesje Control,
  odróżnić wygasłe od niewygasłych; niewygasłe odłożyć do wygaśnięcia zamiast
  uszkodzić wznowienie. Dokładna godzina/strefa i sposób dokończenia takiej
  paczki pozostają do ustalenia przed wdrożeniem, nie są teraz harmonogramem.
- Gdy historyczny typ/stan jest niejasny, ale można odczytać definicję gry
  i jej pytania, wynik to **`prepared`, `status=draft`**. Nie zgadywać rodzaju
  ankiety po nazwie ani nie wymagać ręcznego wybierania między typami ankiet.
  Ta sama jawna reguła odzyskania dotyczy historycznych plików importu.
- Zachować odczytane pytania i ich kolejność oraz możliwe do odzyskania
  odpowiedzi i punkty. Nie dopisywać pytań/odpowiedzi i nie przydzielać
  wymyślonych punktów w celu sztucznego spełnienia progów grywalności.
  Braki mają być widoczne jako braki szkicu. Odzyskiwany pakiet podlega
  uzgodnionej wyżej normalizacji tekstów, nadmiarowych odpowiedzi i punktów,
  bez pytania. Dla rozpoznanych ankiet obowiązuje opisany wyżej wyjątek
  skrócenia pytań do 100, bez przebudowy ich głosów i wyników.
- Migracja istniejącej gry naprawia ten sam rekord, zachowując właściciela
  i ID. Nie jest powielaniem. Ma być powtarzalna bez kolejnych zmian i dawać
  zestawienie napraw, konwersji, braków oraz przypadków nieodzyskiwalnych.
  Po naprawie przeliczyć centralną gotowość i `rules_state`.
- Nie utożsamiać zgodności modelu z grywalnością. Migracja ma ujednolicić
  zapis; wynik może pozostać niegotowym szkicem. Nieodczytywalnych rekordów
  nie usuwać automatycznie; wykazać je w raporcie naprawy.
- Zakres wykonany w E21 (migracja 407, §9). Zatrzymanie przed implementacją
  zniesione przez użytkownika 2026-10-20.

## 5. Plan prac

| Etap | Praca | Rezultat / kryterium zakończenia |
|---|---|---|
| A | Inwentaryzacja typów, statusów, akcji, warunków w JS/SQL oraz wszystkich ścieżek transferu; próbki starych typów i rzeczywistych pakietów | Tabele obecne → docelowe, przykłady strat/konwersji i lista rozbieżności; bez zmian aplikacji |
| B | Uzgodnienie tabeli reguł dla gotowości, akcji, edycji po ankiecie, podliczania oraz polityki historycznych/nieznanych typów | Zamknięte decyzje domenowe; rozdzielenie twardych blokad od rekomendacji |
| C | Zdefiniowanie wspólnego kontraktu wyników i kodów reguł; SQL pozostaje autorytatywny dla zapisu, JS nie duplikuje progów | Jednoznaczny kontrakt wejścia/wyjścia i przejście stanu; testy jednostkowe kontraktu |
| D | Przebudowa modalа Base Explorera według §2; poprawa metadanych bazy do roli sugestii | Dokładne zaznaczenie tworzy szkic; oznaczenia informacyjne; brak bramki 10/kompletności/sumy 100 |
| E | Integracja gier, edytora, ankiet, Control i kafli z centralnym kontraktem | Każdy przycisk pokazuje wynik centralnej reguły; serwer odrzuca niedozwolone przejście tym samym kodem |
| F | Ujednolicenie kwalifikacji podliczania i zamykania dla obu typów; ponowne obliczenie po scaleniu | Podliczanie dopiero od 10 pełnych ankiet, wspólna bramka UI/SQL; zatwierdzenie wymaga dodatkowo progu 4% włącznie i min. 3 odpowiedzi na pytanie w jednym algorytmie |
| G | Dodanie „Zmień typ” obok powielania; ta sama bramka `edit` i ta sama ścieżka resetu co w edytorze; konwersja tego samego rekordu do szkicu wybranego typu | Ankieta otwarta/zatrzymana blokuje akcję; zamknięta wymaga identycznego potwierdzenia resetu; podgląd strat/braków przed zapisem |
| H | Wdrożenie wersjonowanego transferu; jawna obsługa kopii `market`; usunięcie cichych fallbacków; ten sam kontrakt dla wysyłania kopii i poprawa bramki zgłoszenia Marketplace | Dokładnie pięć wariantów zwykłego transferu; wysyłka znajomym wyłącznie szkiców tego samego typu; Marketplace przyjmuje gotową `prepared` lub zamkniętą ankietę jako snapshot `prepared` |
| H1 | Migracja naprawcza historycznych gier wszystkich użytkowników według §4, na podstawie odczytu danych; jawne odzyskiwanie niejasnych plików jako `prepared`/`draft` | Ujednolicony model bez zgadywania; odzyskane pytania/odpowiedzi/punkty, zachowane ID i właściciele istniejących gier, przeliczone reguły i raport napraw; szkice nie muszą być grywalne |
| I | Punktowe testy DB/JS/E2E dla reguł, akcji, zmiany typu oraz importu/eksportu/wysyłki | Macierz scenariuszy zielona; brak pełnych przebiegów bez potrzeby; dokumentacja formatu zaktualizowana |

## 6. Scenariusze kontrolne wymagane przed zamknięciem

- W Base Explorerze utworzenie gry z 0, 1, 9 i 10 zaznaczonymi pytaniami; z
  pytaniem niekompletnym; z punktami poniżej 4; oraz z sumą inną niż 100. W
  każdym przypadku utworzenie ma zachować wybrany zestaw, a wynik gotowości ma
  wskazać braki bez blokowania.
- Klasyfikacja sugestii „Preparowana” bez odpowiedzi i z niepełnymi odpowiedziami
  nie blokuje dodania do gry.
- Reguły gotowości typu `prepared`: odpowiedź z 3 punktami jest brakiem,
  odpowiedź z 4 punktami przechodzi próg per odpowiedź; suma w pytaniu do
  100 włącznie jest dopuszczalna, powyżej 100 blokuje gotowość.
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
- Zaokrąglanie: 0 głosów → 0%; dodatni udział <1% → 1%; 1,9% → 1%,
  3,9% → 3% (nie kwalifikuje), 4% → 4%; 10/10/10 przy 30 pełnych
  ankietach → 33/33/33. Równe głosy zawsze dają równe procenty; brak
  rozdziału reszt i brak przekroczenia 100 punktów w zapisanym wyniku.
  Liczne surowe pozycje <1% nie mogą sztucznie otrzymać punktów do gry.
- Granica szóstki: remis dokładnie dwóch kandydatów, remis większej grupy
  przecinający jedno lub kilka wolnych miejsc, wszystkie dopuszczalne
  zestawy osiągalne jednym cyklicznym przyciskiem, trwałość wyboru po
  odświeżeniu oraz walidacja SQL. Równe procenty z różnych liczebności
  nie dają przycisku zamiany. Po scaleniu lub zmianie liczby głosów
  przeliczyć ranking i poprawność wyboru; bez remisu przycisk znika.
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
- Normalizacja transferu bez potwierdzenia: teksty na granicy i ponad
  limitami 80/100/17; 7+ odpowiedzi z nierosnącymi i nieuporządkowanymi
  punktami; remisy rozstrzygane kolejnością wejściową; punkty -1, 101,
  nienumeryczne i nieskończone → 0 przed sortowaniem. Przy <=6 odpowiedziach
  nie zmieniać kolejności tylko z powodu normalizacji. To osobna reguła od
  świadomego wyboru szóstki podczas podliczania ankiety.
- Pola odpowiedzi: wpisywanie i wklejanie 17/18 znaków w ankiecie tekstowej,
  edytorze, Base Explorerze i podliczaniu; stała informacja o przycięciu
  i automatycznej korekcie znaków podczas podliczania. Edytor i serwer
  odrzucają zapis odpowiedzi z niedozwolonym znakiem. W głosowaniu tekstowym
  odpowiedź z emoji trafia do podliczania, gdzie jest automatycznie
  oczyszczana; po połączeniu jednakowych wyników liczby wskazań sumują się,
  a pusty wynik nie kwalifikuje się. Przykłady z polskimi/ukraińskimi małymi
  literami i Unicode złożonym; zgodność z fontem 5×7, brak uszkodzonych par
  UTF-16, spójny limit JS/SQL i walidacja wszystkich ścieżek zapisu.
- Parzystość obu edytorów: identyczne zachowanie w bazach pytań i w grze
  dla tworzenia, edycji i wklejania; w obu widoczne informacje o limicie 17,
  dozwolonych znakach z fontu 5×7 i pojemności finału 11. Odpowiedzi długości
  11, 12 i 17 zachowują zapisany tekst do 17 znaków; finał skraca wyłącznie
  wyświetlanie do 11 według obecnego algorytmu. Skrót nie zmienia ID,
  dopasowania/trafienia ani punktów. Migracja obejmuje odpowiedzi baz i gier,
  nie filtruje treści pytań według fontu.
- Migracja danych obejmuje wielu różnych właścicieli, zachowuje ich ID gier
  i własność, jest idempotentna i nie zmienia poprawnych szkiców wyłącznie
  z powodu braków grywalności. Niejasny historyczny typ z czytelnymi pytaniami
  daje preparowaną w szkicu, z odzyskanymi odpowiedziami/punktami; brak
  możliwości odczytu gry/pytań daje raport problemu, nie fikcyjną nową grę.
- Migracja limitu pytań: treści 100 znaków pozostają bez zmian, treści 101
  i 200 znaków zostają obcięte do 100 bez pytania; objąć wszystkie typy
  i statusy, także istniejące ankiety i kopie `market`. Zachować ID, głosy,
  status i punktację; uwzględnić ochronę aktywnej sesji Control. Ponowne
  wykonanie nie wprowadza dalszych zmian; po wdrożeniu żadna ścieżka zapisu
  nie może odtworzyć treści ponad limit.
- Migracja znaków: oczyszczenie istniejących odpowiedzi wszystkich typów
  i statusów według fontu 5×7; pytania i nazwy gier nie podlegają temu
  filtrowi. Zachowane ID, ord, punkty, status i głosy; ponowne wykonanie
  bez dalszych zmian. Raport przed migracją wykrywa pusty wynik i kolizje,
  bez automatycznego usuwania rekordów ani arbitralnego sumowania punktów.
- Remisy w Control: osobno trafienie pierwszej i drugiej odpowiedzi za 40
  w zestawie 40/40/20 kończy pojedynek, daje właściwe punkty i możliwość
  oddania kontroli. Po odświeżeniu i ponownym podłączeniu urządzeń kolejność,
  tożsamość oraz stan odsłonięcia pozostają spójne. Remis punktów nie skleja
  kafli ani nie nalicza punktów dwukrotnie. Osobno sprawdzić dotychczasową
  zasadę remisu dwóch odpowiedzi poniżej maksimum w pojedynku.
- Reset edycji i zmiany typu: stare głosy, sesje ankiet, linki, zadania
  i kody QR nie mogą działać po resecie; zostaje draft z punktami 0.
  Aktywny przebieg Control blokuje te operacje również po zamknięciu karty,
  do zakończenia lub godzinnego wygaśnięcia.
- Próg pełnych ankiet: przy 0 i 9 akcja „Podlicz” jest odrzucona, od 10
  można rozpocząć podliczanie. Nie wystarczy wyłączyć przycisku: bezpośrednie
  wejście i operacja SQL również muszą przestrzegać progu. Przy 10 wynik
  nadal wymaga kwalifikacji odpowiedzi na każde pytanie, a scalanie może
  tę kwalifikację zmienić. Jedno wypełnienie 10-pytaniowej ankiety liczy się
  jako jeden komplet, nie 10 głosów do progu. Zapis całego kompletu zachowuje
  atomowość/idempotencję także przy retry i starszych punktach wejścia;
  usunięcie głosów po wejściu do podliczania wymaga ponownej oceny przy zapisie.

## 7. Rozstrzygnięcia po audycie

1. **Rozstrzygnięte 2026-10-20:** wspólny kontrakt automatycznie obcina
   za długie teksty, zeruje niepoprawne punkty i przy nadmiarze odpowiedzi
   zachowuje sześć najwyżej punktowanych; bez pytania. Szczegóły w §4.
2. **Polityka rozstrzygnięta 2026-10-20:** migracja naprawcza starych gier
   obejmie wszystkich użytkowników; niejasne, ale odzyskiwalne dane →
   `prepared`/`draft`. Do odczytu pozostają rzeczywiste aliasy, stany i ich
   liczebności oraz konkretny zakres napraw, bez zgadywania typu ankiety.
3. **Rozstrzygnięte 2026-10-20:** maksymalna suma punktów w pytaniu
   „Preparowanej” pozostaje 100 (`<=100`), nie wymagamy dokładnie 100.
   Modal Base Explorera nie egzekwuje tego limitu przy tworzeniu szkicu.
4. **Rozstrzygnięte 2026-10-20:** udział liczymy względem wszystkich głosów,
   przed kwalifikacją i wyborem szóstki; dodatni udział <1% daje 1%, pozostałe
   wartości ucinamy. Ranking szóstki według liczby głosów, rzeczywisty remis
   na jej granicy rozstrzyga użytkownik; w rozgrywce liczą się zapisane punkty.
   Szczegóły w §3; JS i SQL muszą stosować identyczny algorytm.

Znane reguły gry i transferu są uzgodnione. Po dodaniu oczyszczania znaków
pozostaje sprawdzić, czy istnieją odpowiedzi puste po korekcie lub kolizje
tekstów; ich obsługę rozstrzygnąć na podstawie wyniku audytu (§4).
Odczyt rzeczywistych danych i zakres operacji naprawczych to pozostałe zadania
audytu danych, a nie ponownie otwarte decyzje o regułach gry.

## 8. Audyt A — kod na `37830910ab` (2026-10-20)

Audyt statyczny JS, migracji i aktualnego `supabase/schema.sql`; bez zmian
aplikacji, uruchamiania SQL na produkcji, testów pełnych i wdrożenia.
Małe, bezstanowe wywołania funkcji JS potwierdziły mapping eksportu i przykład
punktacji poniżej. Historyczne testy odczytano jako opis obecnego kontraktu;
nie były uruchamiane. Raport dodano przy korekcie błędnego opisu starszej
bramki Marketplace i miejsca utraty statusu kopii.

**Granica dowodu:** środowisko nie ma skonfigurowanych poświadczeń do bazy.
Użytkownik wykonał zapytanie o długości pytań i przekazał wynik oraz podgląd
11 rekordów (§4); jest to częściowy odczyt danych, bez samodzielnego dostępu
agenta do bazy. Nie odczytano pakietów przechowywanych w produkcji ani
liczebności historycznych wariantów. Przed migracją pozostaje
odczyt agregatów typ/status, typów w `market_games.payload` i zapisanych
snapshotach oraz próbek historycznych plików. Brak próbek nie dowodzi, że
aliasy nie występują. Część kodowa etapu A jest zakończona; audyt danych
produkcyjnych poza przekazanym wynikiem długości pytań pozostaje niezweryfikowany.

### 8.1. Źródła i granice autorytetu

| Skrót | Obecne źródło |
|---|---|
| R | `game_rules_compute`, `game_action_state`, `game_poll_close_check`, reset i przejścia ankiet: [315](../supabase/migrations/2026-10-09_315_poll_stop_tally.sql); opakowanie `game_validate`: [273](../supabase/migrations/2026-09-27_273_game_validate.sql); zapis `rules_state`: [275](../supabase/migrations/2026-09-27_275_games_rules_state.sql); UI: [game-validate.js](../web/shared/js/core/game-validate.js) |
| T | Aktualna matematyka SQL: [392](../supabase/migrations/2026-10-18_392_poll_tally_minimum_share.sql); JS: [poll-tally-math.js](../web/shared/js/core/poll-tally-math.js), [poll-tally.js](../web/polls/js/poll-tally.js); akcje: [polls.js](../web/polls/js/polls.js) |
| B | [export-modal.js](../web/bases/explorer/js/export-modal.js), [actions.js](../web/bases/explorer/js/actions.js), [base-export-validate.js](../web/shared/js/core/base-export-validate.js) |
| F | [game-transfer-format.js](../web/shared/js/core/game-transfer-format.js), [games-import-export.js](../web/games/js/games-import-export.js), atomowy importer/normalizator: [364](../supabase/migrations/2026-10-13_364_game_import_atomic.sql) |
| C | [resource-clone-plan.js](../web/shared/js/core/resource-clone-plan.js), `_resource_clone_read/write`: [365](../supabase/migrations/2026-10-13_365_resource_clone_common.sql), wysłanie/odbiór: [367](../supabase/migrations/2026-10-13_367_resource_clone_send.sql), orkiestracja: [duplicate.js](../cloudflare/maintenance-worker/src/lib/resource-copy/duplicate.js) |
| M | [marketplace.js](../web/marketplace/js/marketplace.js), `market_submit_game`: [280](../supabase/migrations/2026-09-30_280_marketplace_security.sql), `market_add_to_library`: [055](../supabase/migrations/2026-03-11_055_game_type_market_backfill.sql) |
| E | Lista/eksport do bazy: [games.js](../web/games/js/games.js); edytor: [editor.js](../web/games/editor/js/editor.js); formularz i TXT: [question-form.js](../web/shared/js/core/question-form.js), [text-import.js](../web/shared/js/core/text-import.js) |

`rules_state` jest cachem wyniku R, nie osobną definicją reguł. `game_validate`
dokłada dynamiczne `poll_close`, zależne od głosów. Warunki właściciela,
oczekującej kopii i blokady zasobu są osobnymi bramkami: obecne R nie składa
ich w jeden wynik akcji. Guard treści dotyczy tabel pytań/odpowiedzi i
klientów `authenticated`/`anon`; operacje `SECURITY DEFINER` potrzebują własnych
kontroli. Nie wolno zakładać, że samo wywołanie R zabezpiecza każdy zapis.

### 8.2. Macierz typ/status/akcja

`P` = `prepared`, `AP` = `poll_points`, `AT` = `poll_text`, `M` = `market`.
`ready` oznacza zamknięcie dla ankiety; P ma gotowość wyliczaną z treści.
W docelowej kolumnie „reguła” chodzi o wspólny kontrakt, egzekwowany przez SQL
przy zapisie/przejściu i odczytywany przez UI. Nie jest to nowa decyzja o progach.

| Typ / status / akcja | Obecne warunki i rozbieżność | Docelowa reguła | Źródło prawdy: obecnie → docelowo |
|---|---|---|---|
| P / draft, ready / graj | ≥10 pytań; każde 3–6 odpowiedzi; 0–100 pkt; suma ≤100. Zero punktów przechodzi; brak minimum 4 | Wszystkie warunki łącznie: ≥10 pytań; każde pytanie 3–6 odpowiedzi; każda odpowiedź ≥4 pkt; suma odpowiedzi w każdym pytaniu ≤100. Gotowość niezależna od etykiety statusu | R; UI RULES/komentarz wspomina sumę 100 → wspólna gotowość, SQL |
| AP, AT / draft, open, stopped / graj | Odmowa do `ready` | Rozgrywka po poprawnym zamknięciu | R → wspólna akcja play |
| AP, AT / ready / graj | Sam status wystarcza; brak ponownej oceny treści/wyniku w `play` | Nowe zamknięcie autorytatywnie weryfikuje wynik według wspólnego kontraktu; migracja zachowuje głosy, status i punktację istniejących ankiet; pytania skraca do 100 znaków | R → wspólny kontrakt zamknięcia/play |
| M / draft, ready / graj | Nowsze R liczy treść jak P; starsze `game_action_state.can_play` zawsze false; lista Marketplace w Grach włącza Graj po samym zaznaczeniu, Control ma guard R | Osobny typ kopii pozostaje; przycisk i strona korzystają z centralnego wyniku | R + E/stała UI, historyczna funkcja → wspólna gotowość |
| P / draft, ready / edytuj | Tak, bez resetu | Ta sama centralna akcja edit, uprawnienia i locki | R + E/lock → wspólna akcja + SQL |
| AP, AT / draft / edytuj | Tak, bez resetu | Jak obecnie; nie wymaga gotowości | R + E → wspólna akcja + SQL |
| AP, AT / open, stopped / edytuj | Odmowa; guard pytań/odpowiedzi blokuje oba stany | Blokada obu stanów | R + guard treści → wspólna akcja + SQL |
| AP, AT / ready / edytuj | `needs_reset`; lista i edytor mają osobne potwierdzenia, to samo RPC resetu | Jedno dozwolenie, potwierdzenie i reset, wspólne ze zmianą typu | R + E + `game_reset_poll_for_edit` → wspólna akcja/reset SQL |
| M / dowolny / edytuj, zmień typ | Nowsze R i guard treści odmawiają; starsze `can_edit` nie rozróżnia M | Zakaz edycji/konwersji M | R → wspólna akcja + SQL |
| Trzy typy źródłowe / dowolny / zmień typ | Brak dedykowanej akcji i atomowej operacji konwersji | Ten sam rekord; dokładnie edit i jego reset; otwarta/zatrzymana zablokowana; szkic wybranego typu z raportem strat | Brak → wspólna akcja edit/konwersja SQL |
| AT / draft / wejdź w ankietę, otwórz | ≥10 pytań, odpowiedzi nie są wymagane | Jedna reguła gotowości ankiety i przejścia | R + `poll_open`/trigger `assert_game_answers_minmax` → wspólny kontrakt + SQL |
| AP / draft / wejdź w ankietę, otwórz | ≥10 pytań i każde 3–6 odpowiedzi | Jak wyżej; punkty stałe nie są bramką otwarcia | R + trigger → wspólny kontrakt + SQL |
| AP, AT / open, stopped, ready / wejdź na stronę ankiety | `poll_entry` pozwala niezależnie od aktualnych braków | Osobna akcja wejścia, nie bramka zamknięcia | R + guard strony → wspólna akcja |
| AP, AT / ready / uruchom ponownie | R sprawdza ponownie gotowość do ankiety; UI potwierdza, wywołuje abort i otwarcie | Jawny reset/nowe uruchomienie, autorytatywna walidacja SQL | R + E/T + RPC → wspólne przejście |
| P, M / dowolny / ankieta | R odmawia; `_poll_open_unchecked` jawnie wyklucza tylko P (CHECK statusu blokuje M) | Jawny zakaz obu typów w kontrakcie | R + RPC + CHECK → wspólna akcja + SQL |
| AP, AT / open / głosuj | Typ, otwarta sesja, aktualny klucz i uprawnienie zadania/anonima; anonim dodatkowo idempotencja i 30 s | Zachować bramki tożsamości/sesji; dozwolenie głosowania z centralnej akcji | RPC/guard głosów, migracje 309/330/362 → wspólna akcja + te zabezpieczenia SQL |
| AP, AT / open→stopped / zatrzymaj; stopped→open / wznów | R sprawdza stan; RPC idempotentnie przyjmuje też już osiągnięty stan. Zachowuje głosy/klucz | Wspólne przejścia; rozróżnić niedostępny przycisk i bezpieczne retry RPC | R + `poll_stop/resume` → wspólny kontrakt SQL/UI |
| AP, AT / stopped / wejdź w podliczanie | Przycisk zależy od `poll_close.ok`; zbyt słaby surowy wynik blokuje wejście. Sam handler `enterTally` sprawdza tylko stopped; brak osobnego progu 10 pełnych ankiet | Wejście od 10 pełnych ankiet; przy 0–9 „Podlicz” zablokowane. Kwalifikacja odpowiedzi do zamknięcia nie blokuje wejścia przy ≥10, aby umożliwić scalanie tekstów | R + T/UI → osobna akcja wejścia, wspólna bramka UI/SQL |
| AP / stopped / zatwierdź wynik | R liczy ≥3 odpowiedzi z ≥3 pkt metodą największych reszt; normalizacja 392 zeruje udział zaokrąglony <3%. UI po wejściu ustawia poprawność na true | ≥3 odpowiedzi z zaokrąglonym udziałem ≥4%, jedna matematyka podglądu i SQL | `game_poll_close_check` + T + `poll_points_tally` → wspólna kwalifikacja/zamknięcie SQL |
| AT / stopped / scal, zatwierdź | R sprawdza ≥3 różne surowe teksty; właściwy zapis przelicza scalony payload, próg ≥3%, top 6, min. 3; remisy punktów obniża | Procent: dodatni <1 → 1, pozostałe floor; równe głosy → równe punkty; ≥4% i ≥3 kwalifikujące; limit 6. Przy remisie głosów na granicy szóstki jawny cykliczny wybór użytkownika; po scaleniu przeliczenie | R + T + `poll_text_tally_apply` → wspólna kwalifikacja/zamknięcie i walidacja wyboru SQL |
| AP, AT / open, stopped, ready / przerwij-resetuj | `poll_abort` usuwa głosy, teksty, sesje, zadania i kody QR; nowy klucz; draft; punkty 0, treść odpowiedzi zostaje | Osobna jawna akcja; zakres wspólnego resetu §8.6 | RPC 315 → wspólny kontrakt resetu SQL |
| Trzy źródłowe / draft, ready / eksport pliku | Dozwolony bez bramki gotowości; zamknięta ankieta staje się P; brak statusu/wersji | Dokładnie pięć wariantów; zamknięty poll zachowuje typ/wynik; P jako szkic | R + F → wspólny transfer; SQL autorytatywny dla importu |
| AP, AT / open, stopped / eksport pliku | Przycisk zablokowany; sama funkcja F umie zrobić pakiet bez głosów, bez ostrzeżenia; AP zeruje punkty tylko dla draft | Ostrzeżenie o utracie bieżących głosów; szkic tego samego typu | R + F → osobna akcja eksportu + transfer |
| Trzy źródłowe / draft, ready / powiel | UI używa export; SQL pozwala tylko draft/ready; closed poll → P/draft | Wspólny transfer; zamknięty poll zachowuje zamknięty wariant, P szkic | R/UI + C/F → osobna akcja + transfer i SQL |
| AP, AT / open, stopped / powiel | SQL `_resource_clone_read` odmawia, także UI blokuje | Dozwolone jako szkic tego samego typu bez bieżących głosów; locki/uprawnienia nadal obowiązują | C + R/UI → osobna akcja + transfer i SQL |
| Trzy źródłowe / draft, ready / wyślij znajomemu | Bramka jak Powiel; zamknięta ankieta też może być wysłana jako P/draft. Konto zwykłe, aktywna znajomość, zakaz demo i pending | Wysyłka wyłącznie źródłowych szkiców; zamknięte ankiety niedopuszczone; reguła odrębna od Powiel | C/367 + R/UI → osobna akcja send + wspólny transfer |
| M / draft, ready / zwykły transfer | SQL kopii i zakładka Społeczności blokują eksport/kopie; R.export pozwala poza open/stopped; sam helper typu zmienia M na AT, a dla ready eksport kończy jako P | Wszystkie akcje transferu zablokowane; M pozostaje w bibliotece także po usunięciu oryginału, z oznaczeniem archiwalności | C + E kontra R/F → wspólna odmowa SQL/UI |
| Dowolne zaznaczenie w bazie / utwórz grę | ≥10 i wszystkie zaznaczone zgodne z typem; pusta preselekcja zaznacza całą pulę; metadane typu heurystyczne | Dokładne zaznaczenie także 0; informacyjne braki; bez bramki gotowości i automatycznego doboru | B → wspólny podgląd gotowości + transfer/import SQL |
| P / draft, ready; AP, AT / ready / zgłoś Marketplace | UI P tylko ≥10; SQL stary `can_play`, pomija pytania bez odpowiedzi i minimum 4; tytuł/język/opis/właściciel/demo/duplikaty osobno | Grywalna P albo zamknięty poll; wspólna gotowość, bez utraty odrębnych zabezpieczeń; snapshot P | M + stary R → osobna akcja Marketplace + centralna gotowość SQL |

Dodatkowe rozbieżności zabezpieczeń: `assert_game_answers_minmax` sprawdza
strukturę przy UPDATE statusu do open/stopped/ready, lecz nie jest pełną
bramką przejść; guard `poll_open→ready` nie obejmuje stopped→ready. Nowe RPC
podliczania mają własną walidację, starsze ścieżki zamykania nadal istnieją
w schemacie i trzeba objąć je kontraktem albo jawnie wycofać. `game_validate`
nie egzekwuje locka. SQL resetu edytora sam go nie sprawdza (lista robi
busy-check, edytor trzyma lock); przyszła konwersja nie może oprzeć się tylko
na takim sprawdzeniu klienta.

### 8.3. Macierz pól transferu

| Pole | Eksport pliku / definicja kopii obecnie | Import 364 / zapis obecnie | Docelowo |
|---|---|---|---|
| Nazwa | Zachowana; null/brak → nazwa domyślna, pusty string pozostaje; Powiel dopisuje lokalizowane „kopia” i dobiera unikalną nazwę | Trim, limit 80; pusta/brak → lokalizowany default, bez defaults „Gra”; Send dobiera nazwę w bibliotece odbiorcy | Limit 80; za długą nazwę obciąć automatycznie, bez pytania; zachować zasady nazewnictwa kopii |
| Typ | Trzy kanoniczne; nieznany/market → AT w helperze; każdy nie-P po normalizacji przy ready → P | Tylko trzy typy; reszta → AT, co usuwa odpowiedzi | Rozpoznany typ zachowany; niejasny historyczny pakiet z czytelną grą i pytaniami → jawne odzyskanie P/draft; nieodczytywalny → błąd; M ma osobną politykę |
| Status / znaczenie zamknięcia | Pominięty; rozpoznanie ready służy tylko konwersji do P | Zawsze draft; wejściowy status jest ignorowany | Pięć kombinacji §4; otwarta/zatrzymana → szkic z ostrzeżeniem; closed poll → zamknięty poll |
| Wersja | Brak `format_version` | Nie sprawdza wersji; dodatkowe pole jest pomijane | Wersja i nazwane migratory bez zgadywania |
| Pytania | Zachowana tablica w kolejności wejścia; `exportGame` pobiera po ord, SQL kopii po ord,id | Nowe ID i ord=pozycja w tablicy od 1; nie korzysta z wejściowego ord | Zachować kolejność znaczeniową i dokładny zbiór |
| Treść pytania | Bez obcinania w F; Base Explorer trimuje | Trim, limit 200, brak/pusta → „Pytanie {ord}” lub lokalizacja; nawet element null staje się placeholderem | Limit 100; nadmiar obciąć automatycznie bez pytania; nie dopisywać zastępczych pytań |
| Odpowiedzi | AT bez ready usuwa wszystkie; AP/draft zachowuje teksty i zeruje punkty; AP/open/stopped nie zeruje istniejących punktów; closed poll jako P zachowuje odpowiedzi/punkty | AT usuwa wszystkie niezależnie od wejścia; inne typy zachowują tylko pierwsze 6; brak tablicy → [] | Warianty szkicu/wyniku według §4; przy ponad 6 odpowiedziach po normalizacji punktów sortować malejąco i zostawić 6, bez pytania; remis według wejścia |
| Treść odpowiedzi | Zachowana w F; Base Explorer trimuje | Trim, limit 17; pusta/brak → „Odpowiedź {ord}” lub lokalizacja | Limit 17; nadmiar obciąć bez pytania; znaki według fontu 5×7: edytor odrzuca niepoprawny zapis, tekstowe oczyszczane przy podliczaniu; istniejące odpowiedzi oczyszcza migracja, bez filtrowania pytań |
| Punkty | `Number(x) || 0`; dla AP/draft 0; Base Explorer AP zawsze 0, P tylko istniejące `fixed_points` | `floor`, clamp 0–100, brak/niepoprawne → 0; przyjmuje też liczbowy string/wykładnik i true→1. Normalizator pakietu ignoruje alias `points` | Ujemne, nienumeryczne, nieskończone lub poza 0–100 → 0 przed sortowaniem, bez pytania; bez clamp do 100 i bez wymyślania grywalnej punktacji; odrębny kontrakt szkicu/wyniku |
| Kolejność odpowiedzi | F sortuje po ord, fallback wejście; SQL kopii wcześniej po ord,id | Ord=pozycja w tablicy; zapis nie sortuje po punktach | Przy <=6 zachować wejściową; przy >6 sortować malejąco po znormalizowanych punktach, remis według wejścia, zapisać wybraną szóstkę i jej ord |
| Wynik zamknięcia | Wyłącznie treść odpowiedzi i `fixed_points`, przez konwersję na P; brak dat/udziałów/liczebności | Brak odtworzenia zamkniętej ankiety/sesji | Zamknięty typ, zatwierdzone odpowiedzi i punkty; bez liczby głosów, głosujących i odtwarzania sesji |
| Bieżące głosy, surowe teksty, tokeny głosujących, sesje, zadania, klucze urządzeń/ankiety, runtime i statystyki rozgrywki | Pominięte | Nie są przyjmowane; nowe ID/klucze i właściciel z serwera | Nadal poza transferem; jawnie poinformować o utracie głosów aktywnej ankiety |
| Ustawienia, logo, dźwięki/pliki | Pominięte | Nowa gra `settings={}`, brak powiązań z cudzymi plikami | Nadal poza formatem zgodnie z zakresem |
| Język, opis, metadata, source_market_id, is_demo, received_from | Pominięte w zwykłym pliku | Zwykły import nie ufa takim polom; pochodzenie demo/kopii ustalają osobno C/SQL; nie przenosi folderów/tagów bazy | Jawna lista wyłączeń; nie utożsamiać metadanych Marketplace z plikiem |
| Struktura/rozmiar i retry | Eksport bez walidacji wersji; UI importu sprawdza JSON + game/questions | Obiekt game + tablica questions, limit 8 MiB JSONB; jedna transakcja; kwit/hash i request_id zabezpieczają retry/konflikt/usunięcie | Zachować atomowość i idempotencję, dołożyć ścisły kontrakt struktury/raport strat |

### 8.4. Różnice ścieżek i resetu

| Ścieżka | Co faktycznie przenosi / zmienia / pomija |
|---|---|
| Base Explorer → gra | B buduje osobny pakiet, potem `importGame`/364. Pytania w kolejności puli, nie kliknięć; foldery rozwijane do ID pytań. Nie przenosi kategorii/tagów. Jawna pusta preselekcja jest dziś nierozróżnialna od braku kontekstu i zaznacza wszystko. Typ 0 suwaka przy ponownym otwarciu dodatkowo wpada w `Number(value) || 2` i może wrócić do P |
| Gra → baza → gra | Pierwszy krok używa F, więc dziedziczy konwersje typu/odpowiedzi/punktów. W bazie powstaje unikalny folder nazwy gry, ord pytań 1..n i payload text/answers, bez statusu/typu gry; zapis partiami 200 z próbą sprzątania po błędzie, nie jedna transakcja SQL. Powrót przez B/364; zamknięcie ankiety nie przeżywa tego obiegu |
| Powiel / Send / Akceptuj | Worker bierze snapshot SQL zawierający status, przygotowuje F/C, zapis C deleguje do 364. Kopia ma nowe ID i draft. Send tworzy własny rekord odbiorcy od razu jako pending; Akceptuj odblokowuje ten rekord, nie importuje ponownie. Odmowa/wygaśnięcie usuwa oczekującą kopię. Pochodzenie/demo/history są poza plikiem; matcher demo porównuje obecną definicję eksportową i wymaga aktualizacji przy zmianie transferu |
| Zgłoszenie Marketplace | `p_payload` z UI ignorowany; SQL buduje snapshot z bazy po ord pytań/odpowiedzi, typ P dla zamkniętych ankiet. Tytuł 1–120, opis ≤500, język pl/en/uk w zewnętrznym rekordzie Marketplace, nie w zwykłym pakiecie. Nie jest to normalizacja importera 364 |
| Marketplace → biblioteka | `market_add_to_library`: nowe UUID, owner odbiorcy, type M, status ready, source_market_id; nazwa z tytułu limit 80, pytania 200, odpowiedzi 17; ord z tablic, brakujące punkty 0. Bez normalizatora 364; błędny punkt/liczba odpowiedzi może odrzucić transakcję zamiast zostać naprawiona. Ponowne dodanie nie duplikuje wpisu |
| Administracyjny Marketplace | `market_admin_upsert` nadal istnieje w SQL, tylko service_role po 280; zapisuje podany payload bez walidacji gry, ustawia origin=producer. W aktywnym Workerze admina nie znaleziono trasy wywołującej upsert; nie dowodzi to braku zewnętrznych wywołań. Zastane payloady trzeba zinwentaryzować osobno |
| Edytor: TXT/wklejanie | `parseQaText`: @nazwa, #pytanie, numerowane odpowiedzi /punkty; punkty opcjonalne. Zastępuje treść tego samego rekordu po potwierdzeniu; typ bez zmiany. `importPayload` usuwa odpowiedzi dla AT, zeruje punkty AP, limituje odpowiedzi do 6 i treści 200/17, uzupełnia puste; `points` jest tu obsługiwane dla P przez `game_import_content`, choć zwykły pakiet 364 ten alias pomija. Podgląd TXT pokazuje dane parsera, nie pełny raport normalizacji |
| Reset edycji zamkniętej ankiety | `game_reset_poll_for_edit` 315: draft, daty opened/closed null, wszystkie punkty 0; treść odpowiedzi AT/AP zostaje. Trigger usuwa szkic podliczania i ended_key. Surowe votes/entries, sesje, zadania i bieżący share_key pozostają; pełne ich kasowanie wykonuje dopiero `poll_abort`/nowe uruchomienie. „Reset wyników” nie oznacza obecnie usunięcia wszystkich danych ankiety |

Porządek odpowiedzi nie jest wyłącznie sprawą eksportu. F zachowuje ord,
import zapisuje kolejność tablicy. Podgląd/import-preview, finalne wyniki,
Marketplace i Control stosują `sortAnswersByPoints`: dodatnie punkty malejąco,
remisy po ord/wejściu, bez zmiany tablicy źródła. Edytor czyta zapisany ord.
Tekstowe podliczanie SQL natomiast faktycznie zapisuje nowy ord według rankingu;
punktowe aktualizuje punkty bez zmiany ord.

Różnica matematyki: aktualny JS i 392 kwalifikują zaokrąglony procent od
wszystkich uwzględnionych głosów progiem 3%, ale `game_poll_close_check` 315
punktowej liczy wynik największych reszt ≥3 pkt. Dla głosów `[190,5,5]` JS
pokazuje udziały `[95,3,3]`, a punkty `[95,3,2]`: trzy odpowiedzi przechodzą
próg udziału, lecz SQL bramki widzi tylko dwie. Tekstowe JS grupuje
trim/ucięcie17/lowercase, liczy udziały i reszty przed filtrem, wybiera top6
i obniża remisy punktów; SQL robi podobnie, ale remis punktów porządkuje
`remainder_rank`, JS kolejnością wejścia, a `textTallyPoints` zwraca wybrane
pozycje w kolejności źródłowej. Liczba kwalifikujących nie może być utożsamiona
z końcową wartością punktów po obniżaniu remisów. Próg 4 pkt P jest odrębną
regułą od progu 4% ankiety.

### 8.5. Historyczne typy, aliasy i ryzyka konwersji

| Wariant znaleziony w kodzie/historii | Obecna obsługa i wymaganie migracyjne |
|---|---|
| `fixed` | `games.js:uiTypeFromRow` oraz narzędzie zrzutów `homepage-screenshots.js` traktują jako P. Zwykły importer SQL nie zna aliasu i zmienia go na AT, tracąc odpowiedzi; podgląd importu pokazuje P. Wymaga jawnego migratora formatu, nie dodania enum |
| `poll` | Te same helpery zgadują AP po fragmencie „punkt” w nazwie, w pozostałych przypadkach AT. Podgląd importu Gier przekazuje tylko type, więc nazwa nie pomaga. Docelowo bez wiarygodnego typu wynik to odzyskana P/draft z odczytanymi pytaniami, odpowiedziami i punktami, bez heurystyki językowej |
| P z `source_market_id` | Starsze kopie Marketplace były P; 054 dodaje M, 055 backfilluje rekordy z source_market_id do M. To migracja pochodzenia, a nie usuwanie M |
| M bez `source_market_id` | Migracja 272 przekształca istniejące sieroty do P; trigger robi to przy utracie rodzica Marketplace. To rozbieżność: docelowo pozostawić M jako archiwalną kopię na liście, z blokadą transferu; bez konwersji do P |
| P po eksporcie zamkniętego AP/AT | Pakiet bez wersji/statusu/źródłowego typu jest nierozróżnialny od ręcznie preparowanej gry. Bez zewnętrznego pochodzenia nie odtwarzać typu ankiety automatycznie |
| `ready` / `poll_stopped` / `*_closed` | `ready` jest statusem, nie historycznym typem; stopped dodano w 315. Sloty demo `poll_text_closed`/`poll_points_closed` nie są wartościami game_type |
| `ready_prepared`, inne nieznane, brak typu | Nie znaleziono takiego enum ani jawnego migratora w przejrzanym kodzie. Nie tworzyć go. Importer/helper F zamieniają nieznane na AT; UI listy dla nieznanego pokazuje P; przy ready F dodatkowo kończy jako P. Zastąpić te fallbacki jawną migracją/odzyskaniem P/draft, jeśli da się odczytać grę i pytania; w przeciwnym razie zgłosić błąd |
| `points` kontra `fixed_points` | Alias pola, nie typu: TXT/edytor/narzędzie zrzutów akceptują points; normalizator zwykłego pakietu go ignoruje i zapisuje 0. Wersjonowany migrator musi rozróżnić te formaty |

Zgodnie z historią enum ma dokładnie P/AP/AT/M, bez innych wartości
game_type; obecne CHECK-i nie dopuszczają aliasów w `games.type`. JSONB i
zewnętrzne pliki takich ograniczeń nie mają. Historyczne testy
`gameTransferFormat.test.js`, `pollTallyMath.test.js` i SQL 364 utrwalają dziś
cichy fallback, konwersję closed→P i próg 3% — przy implementacji wymagają
zmiany oczekiwań na uzgodniony kontrakt, nie traktowania ich jako decyzji domenowej.

### 8.6. Stan rozstrzygnięć po audycie

Grywalność preparowanej jest rozstrzygnięta: **≥10 pytań, każde z 3–6
odpowiedziami, każda odpowiedź ≥4 pkt, suma w każdym pytaniu ≤100**.
Wszystkie warunki obowiązują jednocześnie; modal tworzenia szkicu nie
egzekwuje gotowości.

Polityka historycznych danych również jest ustalona: migracja naprawcza dla
wszystkich użytkowników i jawne odzyskanie niejasnej, odczytywalnej gry jako
preparowanej w szkicu. Brak gotowości nie jest powodem do dopisywania treści
ani sztucznego przydziału punktów. Pozostaje odczyt rzeczywistych danych
i rozpisanie konkretnych operacji naprawy.

Rozstrzygnięte w dalszej rozmowie 2026-10-20: całość wskazań mapujemy na
100, procent i punkty są tym samym wynikiem; bez sztucznego obniżania remisów;
transfer zamkniętego wyniku bez liczby głosów; M bez transferu, zachowane jako
archiwalne po usunięciu oryginału; migracja nocą, bez przebudowy głosów
i wyników ankiet. Później uzgodniono wyjątek dla treści: także istniejące
pytania ankietowe obciąć migracją do 100 znaków bez pytania (§4).
Reset przy edycji/konwersji ma pełny zakres normalnego resetu ankiety:
usunięte głosy i zależności, unieważnione linki, punkty 0, wynik draft.

Wyrównywanie jest doprecyzowane: zachowujemy równe punktacje za równe głosy,
dopuszczamy niedobór i nie przekraczamy 100. Minimalną próbę liczymy pełnymi
ankietami, bo użytkownik odpowiada na wszystkie pytania. Samo podniesienie
liczby głosów nie usuwa ułamków, np. 10/10/10 przy 30 pełnych ankietach
nadal daje po 33⅓%.

Minimum jest rozstrzygnięte: **10 pełnych oddanych ankiet przed rozpoczęciem
podliczania**; przy 0–9 akcja „Podlicz” jest niedostępna. To odrębna bramka
od kwalifikacji odpowiedzi potrzebnej do zatwierdzenia wyniku.

Zaokrąglenie i granica szóstki są rozstrzygnięte w §3: dodatni udział <1%
pokazujemy jako 1%, pozostałe ucinamy; równe liczby głosów mają równy wynik.
Remis głosów przecinający granicę szóstki daje cykliczny przycisk świadomego
wyboru odpowiedzi z grupy remisowej, bez zmiany ich punktacji.

**Polityka strat treści rozstrzygnięta 2026-10-20:** za długie teksty
obcinamy bez pytania; przy ponad sześciu odpowiedziach zostawiamy sześć
najwyżej punktowanych (remisy stabilnie według wejścia); punkty ujemne,
nienumeryczne lub poza zakresem zamieniamy na zero przed sortowaniem.
Nie wymagamy ręcznej korekty ani potwierdzania tych operacji. Jest to
odrębne od świadomego wyboru szóstki w podliczaniu. Znane decyzje domenowe
są zamknięte; odczyt danych produkcyjnych wykonano migracją 403 (§9).

### 8.7. Regulamin TVP i dodatkowe ryzyka sprawdzone 2026-10-20

- Audyt historycznego progu głosów: `web/shared/translation/pl.js` w starej
  treści Instrukcji opisuje zielony kafelek jako zebrane cele (zadania
  wykonane lub ≥10 głosów); analogiczny zapis jest w EN. To opis wskaźnika,
  nie dowód walidacji zamknięcia. W przejrzanych funkcjach SQL nie znaleziono
  osobnego minimum 10 pełnych ankiet: `game_poll_close_check` (273/315)
  i starsze `polls_hub_can_close_*` wymagają min. 3 różnych tekstów albo
  min. 3 odpowiedzi z punktacją ≥3 na pytanie. Jeszcze starsze
  `poll_admin_can_close` wymaga dla punktowej min. 2 odpowiedzi z głosami,
  dla tekstowej min. 3 różnych tekstów. `poll_text_tally_apply` sprawdza
  min. 3 odpowiedzi po przeliczeniu, bez odrębnego minimum respondentów.
  Trzy pełne ankiety z trzema różnymi wyborami mogły zatem spełnić bramkę
  zamknięcia. Minimum 10 pytań do uruchomienia jest jeszcze inną regułą.
- Kontrakt pełnego wypełnienia jest widoczny w formularzach i sprawdzaniu
  kompletnego pakietu w `poll_anonymous_submit` (liczba elementów i różnych
  pytań musi odpowiadać wszystkim pytaniom gry). Wdrożenie progu musi używać
  pełnych wypełnień bieżącego uruchomienia i nie zliczać częściowych zapisów
  ze starszych RPC jako osobnych kompletów. To wymaganie spójności zapisu,
  nie zmiana decyzji użytkownika o odpowiadaniu na wszystkie pytania.
- [Regulamin TVP z naboru 2025](https://s.tvp.pl/repository/attachment/3/5/4/354f69c09c8b430588d3c079410afb3d.pdf),
  §2 pkt 2.6/2.12 i §6: punkty odzwierciedlają wskazania stu ankietowanych.
  Nie podaje minimalnej liczby wskazań ani wymogu różnych punktacji;
  przypadek dwóch remisujących odpowiedzi nie jest opisany wprost.
- [Starszy regulamin TVP](https://s.tvp.pl/repository/attachment/6/8/f/68f09c03ff0781fa510c2fd90c3ba19b1569224834470.pdf),
  dział IV pkt 4–5: opisuje pomijanie rzadkich odpowiedzi, w przykładzie
  również z trzema wskazaniami. Nie nazywa tego uniwersalnym progiem 4.
  Wybieranie kilku wariantów odpowiedzi jest osobną zasadą. Nasz próg 4
  pozostaje decyzją aplikacji, nie potwierdzonym ogólnym przepisem teleturnieju.
- Wniosek dotyczący podliczania: brak podstaw w tych dokumentach do
  odejmowania punktów tylko po to, żeby każda odpowiedź miała inną wartość.
  Dwa warianty z 20 wskazaniami na 100 powinny mieć po 20 pkt zgodnie
  z zasadą punktów za wskazania; to wniosek z tej zasady, nie osobny przepis
  o remisach. Odrębną sprawą jest dzielenie 100 całkowitych punktów przy
  niecałkowitych udziałach, gdy liczba respondentów jest inna niż 100.
- `web/control/js/engine.js:topAnswer` wybiera pojedynczy rekord o największej
  punktacji, a `isTop` porównuje jego ord. Przy 40/40/20 tylko jedna z dwóch
  odpowiedzi za 40 kończy dziś pojedynek od razu. Samo usunięcie obniżania
  remisów w podliczaniu nie wystarczy. Docelowo zgodnie z doprecyzowaniem
  użytkownika oceniamy wartość wybranej odpowiedzi względem maksimum, a nie
  zgodność jej ord z jednym rekordem. Dalszy remis w `duelRegisterResult`
  wygrywa już pierwszy odpowiadający; tej odrębnej zasady nie zmieniono.
- Sprawdzono też UI Control (`ui.js:renderRounds`), sortowanie wspólne
  (`answer-order.js`), stan (`store.js`) oraz render Host/Display. Remisy
  mają już stabilny porządek po ord. Kafle są rozróżniane przez `ans:${ord}`,
  odsłonięcia przez ord, a finałowe mapowanie przez ID odpowiedzi; punkty
  nie są identyfikatorem. Nie znaleziono potrzeby sztucznego różnicowania
  punktacji dla działania panelu. Jest to wniosek z audytu kodu, przed
  punktowymi testami wykonania; poprawka musi objąć semantykę `isTop`.
- Sesje ankiety (`poll_sessions`) to uruchomienia głosowania dla pytań,
  powiązane z głosami; nie oznaczają sesji Control. Ich usuwanie przy resecie
  nie dotyczy czasu trwania rozgrywki. Reset ma usuwać całe uruchomienie
  ankiety i unieważniać jego dostępy, zgodnie z doprecyzowaniem w §4.
- `control_runtime_session_touch` przedłuża termin o godzinę po aktywności
  operatora. `resource-lock.js` zwalnia blokadę karty przy pagehide, a jej
  awaryjny TTL to 120 s. Trwały przebieg wskazuje `game_session_active`.
  `game-settings.js:guardActiveGameSession` i RPC
  `control_game_settings_status` chronią ustawienia po zamknięciu Control.
  Edytor nie ma takiej dodatkowej bramki: po zajęciu krótkiego locka sprawdza
  tylko `edit`, którego `game_rules_compute` nie wiąże z trwałą rozgrywką.
  Zgodnie z decyzją użytkownika rozszerzyć wspólną ochronę operacji w JS/SQL;
  na tym etapie stwierdzono lukę kodową, nie wykonano poprawki ani E2E.
- Archiwalny M wymaga poprawy więcej niż etykiety: trigger 272 zamienia go
  na P, FK biblioteki do usuniętej pozycji kasuje wpis, a `market_my_library`
  używa JOIN do istniejącego Marketplace. Trzeba zachować listowanie lokalnej
  kopii niezależnie od istnienia źródła i korzystać z jej zachowanej treści.
  Dawne kopie już zamienione na P mogą utracić informację o pochodzeniu;
  odtwarzać M tylko na podstawie dowodu, nie podobieństwa nazwy/treści.

**Punkt zatrzymania (historyczny):** raport A sprzed implementacji. Zniesiony
2026-10-20 — realizacja w §9.

## 9. Realizacja E21 (2026-10-20)

Autoryzacja użytkownika 2026-10-20: implementacja, migracje i wdrożenie E21.

### 9.1. Odczyt danych przed migracją (403, tylko odczyt)

Migracja diagnostyczna `2026-10-20_403_e21_data_audit_diagnostic.sql`
(log `latest.log` z 14:11 UTC, same liczby i ID): pytania gier >100 znaków:
**11** (maks. 197) w 4 szkicach preparowanych; pytania baz >100: **24**
(maks. 129); odpowiedzi baz >17 znaków: **546**, z niedozwolonymi znakami: 0;
odpowiedzi gier z niedozwolonymi znakami: **5** — wszystkie w jednym pytaniu
jednej gry (preparowana, szkic, bez głosów, punkty 30/10/15/20/5) i wszystkie
byłyby **puste po oczyszczeniu**; kolizji tekstów po oczyszczeniu: 0; surowe
wpisy ankiet z niedozwolonymi znakami: 9 (zostają jako źródło audytowe);
Marketplace i szablony demo bez naruszeń; niewygasłe sesje Control: 0.

### 9.2. Co wdrożono

| Obszar | Gdzie | Treść |
|---|---|---|
| Silnik reguł | 404, `game-rules.js`, `game-validate.js` | `readiness` (pełna lista braków), preparowana ≥4 pkt na odpowiedź, `change_type` = `edit`, akcje transferu `export`/`duplicate` (z `drops_votes`) i `send`; `game_validate` dokłada blokadę `controlActive` (sesja runtime niewygasła); JS `evaluateReadiness` z tymi samymi kodami (testy JS i SQL na tych samych przypadkach) |
| Edycja i reset | 404, `editGate` | Jedna bramka dla listy Gier, edytora i „Zmień typ”; reset zamkniętej ankiety = pełny reset uruchomienia (`_game_poll_reset`, wspólny z `poll_abort`); zapis treści z przeglądarki blokowany przy aktywnym Control |
| Zmień typ | 404 `game_change_type`, `change-type.js` | Ten sam rekord, bramka `edit`, potwierdzenie resetu przed wyborem typu, konwersje z tabeli §4, wynik — szkic |
| Znaki odpowiedzi | 404 `fam_display_has_glyph`/`fam_answer_*`, `fonts.js:hasDisplayGlyph`, `answer-text.js` | Znaki z `font_5x7.json` (migracja zawiera klucze fontu, zgodność pilnuje test), NFC, jednoznakowa wielka litera (np. „ß” → „SS” to dwa znaki — niedozwolone w JS i SQL jednakowo); czyszczenie: usunięcie znaków, białe znaki → jedna spacja, trim, 17 znaków. Ustawienia gry (nazwy drużyn) korzystają z tej samej funkcji |
| Oba edytory | `question-form.js`, edytor gry, modal bazy | Pytanie 100, odpowiedź 17 (pełne znaki, także przy wklejaniu), blokada zapisu znaków spoza fontu, podpowiedzi „Maksymalnie 17 znaków…” i „W finale wyświetlacz mieści 11 znaków…”; import TXT odrzuca niedozwolone znaki; serwer (`guard_game_text`, `guard_qb_question_text`) odrzuca zmieniane teksty |
| Base Explorer | `export-modal.js`, `actions.js` | Dokładne zaznaczenie (także 0–9 pytań), bez bramki, braki informacyjnie z silnika; metadane kategorii z tego samego silnika; pakiet v2 |
| Podliczanie | 405, `poll-tally-math.js`, `poll-tally.js` | N = pełne ankiety bieżącego uruchomienia, `poll_tally_source`; udział 0 / ≥1 / floor; kwalifikacja ≥4%; punkty = udział; wejście od 10 pełnych ankiet; zatwierdzenie ≥3 kwalifikujących; remis szóstki — cykliczny wybór zapisany w szkicu i walidowany w SQL; czyszczenie znaków przed grupowaniem; podpowiedź głosującego; status `ready` z przeglądarki tylko przez RPC podliczania; nieużywane starsze RPC głosów/zamykania odebrane rolom przeglądarki |
| Control | `engine.js` | Trafienie dowolnej odpowiedzi o maksymalnej punktacji kończy pojedynek |
| Transfer | 406, `game-transfer-format.js` | Pakiet v2, pięć wariantów, migrator v1 i jawne odzyskanie `prepared`/`draft`, normalizacja bez pytania (JS = SQL), zamknięty wynik tylko poprawny, Powiel otwartej/zatrzymanej ankiety jako szkic z ostrzeżeniem, Wyślij tylko szkice, `market` bez transferu |
| Marketplace | 404, 406, `marketplace.js`, `games.js` | Zgłoszenie przez centralne `play` (snapshot z zamkniętej ankiety bez odpowiedzi 0 pkt); kopia `market` zostaje po usunięciu pozycji (archiwalna w bibliotece, usuwanie `market_remove_archived_copy`); dodanie do biblioteki z normalizacją transferu |
| Naprawa danych | 407 `e21_data_repair()` | Nocne okno: `pg_cron` 01:30 UTC; pomija gry z niewygasłą sesją Control; pytania gier i baz → 100, odpowiedzi baz → 17 + znaki, odpowiedzi gier → znaki (tylko odpowiedzi); bez zmian ID/ord/punktów/głosów/statusu; przeliczenie `rules_state`; ograniczenia `questions_text_len` (≤100) i `answers_text_chars` zakładane po wyczyszczeniu; raport `e21_repair_runs`; zadanie usuwa się po zakończeniu |

### 9.3. Decyzje wykonawcze (w granicach ustaleń)

- Pusta odpowiedź w imporcie/kopii (także pusta po oczyszczeniu znaków) jest
  pomijana — bez tekstów zastępczych; pytanie bez treści czyni pakiet
  nieodczytywalnym (błąd importu), bo nie wolno ani dopisać treści, ani usunąć
  pytania.
- Zamknięty wariant w pakiecie musi spełniać warunki zamknięcia (≥10 pytań,
  3–6 odpowiedzi po ≥4 pkt, suma ≤100); inaczej szkic tego samego typu
  (`closed_downgraded`), zgodnie z zakazem oznaczania niepoprawnego wyniku
  jako zamkniętego.
- Odpowiedź ankiety punktowej poniżej 4% dostaje 0 pkt (zostaje w ankiecie
  i nie gra) — bez usuwania odpowiedzi z głosami.
- Godzina nocnego okna nie była zapisana: przyjęto 01:30 UTC (03:30 czasu
  polskiego letniego).

### 9.5. Wdrożenie i kontrola produkcji (2026-10-20)

- Push na `main`: kod i migracje 404–407 (ostatni commit wdrożenia
  `4107f8a`, wcześniej `f21133e`, `5b20b11`); log migracji: 404–407 `OK`
  (14:54–14:58 UTC); Worker i Pages zielone (`39443347173`, `39443346949`).
- Raport progu 4 pkt (404, odczyt): 180 gier preparowanych/market przestało
  być grywalnych przez `answerMinPoints`, w tym 125 kopii demo; szablon demo
  „prepared” (pl/en/uk) ma w każdym języku 4 odpowiedzi poniżej 4 pkt
  (szóste odpowiedzi za 2–3 pkt).
- E2E kontrolne na produkcji (punktowo): `39445535857` ✓ (`e21-rules`,
  `game-transfer-format`), `39446237907` (Podlicz punktowa/tekstowa,
  Base Explorer E21 ✓; zapis szkicu — test poprawiony), `39446733012` ✓
  (literówki/scalanie, cofnij, wyjście z podliczania, DOKŁADNIE),
  `39447096936` ✓ (`control2` „próg w rundzie”).
- Nocna naprawa danych (cron 01:30 UTC 2026-10-21) — wynik do dopisania
  z `e21_repair_runs`.

### 9.4. Otwarte

- **Decyzja użytkownika:** 5 odpowiedzi jednej gry (preparowana, szkic,
  bez głosów), które po oczyszczeniu byłyby puste — naprawa ich nie zmienia
  i wykazuje w raporcie; do czasu decyzji ograniczenie `answers_text_chars`
  nie jest zakładane. Użytkownik poprosił o SQL podglądu (przekazany w rozmowie).
- **Decyzja użytkownika:** szablon demo „prepared” i 125 kopii demo
  niegrywalnych po progu 4 pkt. Rekomendacja: usunąć z szablonu (i kopii bez
  zmian użytkownika) odpowiedzi poniżej 4 pkt — bez dopisywania punktów;
  pytania zostają z ≥3 odpowiedziami.
