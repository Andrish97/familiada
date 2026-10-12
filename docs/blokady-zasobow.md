# Blokady zasobów — jeden opis (stan faktyczny i mapa docelowa)

Jedyne źródło prawdy o blokadach. Starsze opisy w
`docs/plan-testy-i-poprawki.md` („Mapa zasobów”, „Model: zasób ma stan
busy/free”, „Krzyżowe blokady między zasobami”) są historią decyzji —
częściowo nieaktualną (np. Control opisany jako „krok 7, jeszcze nie”).
Zmiana blokady w kodzie albo w bazie = zmiana tego pliku i testu
(`tests/e2e/cross-resource-locks.spec.js`, `logo-editor.spec.js`).

Stan sprawdzony w kodzie 2026-10-07 (branch `ccr-4a2edd31-ekjnn8`,
`supabase/schema.sql`).

**Uwaga (E2, 2026-10-08):** sekcje 1–5 opisują stan **sprzed** wdrożenia
modelu docelowego (migracja 316, `resource-lock.js`) — zostają jako historia
i uzasadnienie. Obowiązuje sekcja 6 oraz „Kroki wdrożenia” (kroki 1–6
wdrożone; 7 — mapa `PAGES` — jeszcze nie). Najważniejsze różnice: TTL
**120 s** (nie 25 s), tryb `shared` / `exclusive` w `edit_locks`, zasób
`logos`, `guardResourceLocks()`, brak `findBusyContext` i
`guardResourceBusy`, reguły w bazie bez `holder_context`.

---

## 1. Mechanizm

| Element | Gdzie | Jak działa |
|---|---|---|
| Tabela `edit_locks` | baza | jeden wiersz na zasób (`resource_type`, `resource_id`); trzyma karta (`holder_tab_id`), użytkownik i **kontekst** (`holder_context`: która strona) |
| `acquire_edit_lock(typ, id, tab, kontekst)` | baza | zajmuje albo odnawia; przejmuje tylko blokadę wygasłą (`heartbeat_at` starszy niż **25 s**); odpowiedzi: `ok`, `locked`, `gone` (zasób nie istnieje), `forbidden` (brak prawa edycji) |
| `release_edit_lock` | baza | zwalnia blokadę tej karty |
| `guardResourceLock()` | `shared/js/core/resource-lock.js` | **blokada strony**: przy wejściu zajmuje zasób; zajęty → pełnoekranowy komunikat, sprawdzanie co 5 s + sygnał `RELEASED` → strona wczytuje się sama, gdy zasób się zwolni; odnawianie co **8 s**; `gone` / `forbidden` w trakcie → komunikat; zwolnienie na `pagehide` albo `release()` (zwraca Promise — strona wychodząca własnym przyciskiem czeka na nie przed nawigacją) |
| `guardResourceBusy()` | jw. | **czekanie bez trzymania**: strona tylko czyta zasób; zajęty → komunikat i wejście samo po zwolnieniu |
| `acquireResourceLock(s)()` | jw. | **blokada akcji** (krótka, na czas jednej operacji), wiele zasobów naraz: wszystkie albo żaden |
| `isResourceBusy(typ, id)` | jw. | sprawdzenie przed jednorazową akcją z listy (zmiana nazwy, reset, eksport) → okno z komunikatem |
| `findBusyContext(typ, konteksty)` | jw. | „czy jakikolwiek zasób typu X jest trzymany przez stronę Y” — używane tylko do puli logo (patrz 4) |
| `*_checked` RPC | baza | **druga warstwa**: zapis/usunięcie sprawdza blokady atomowo w bazie, niezależnie od tego, czy strona sprawdziła |

Komunikat mówi tylko, **jaki zasób** jest zajęty (gra / logo / baza) i,
dla puli logo, **dlaczego** (rozgrywka / ustawienia gry) — nigdy, która
karta. Blokuje też własną drugą kartę tego samego użytkownika.

### Dwa rodzaje trzymania

| Rodzaj | Ilu naraz | Przykład |
|---|---|---|
| **wyłączne** | jedna karta | edytor trzyma swoją grę / swoje logo; okno pytania w bazie trzyma pytanie |
| **współdzielone** *(docelowo, patrz 6)* | wiele kart naraz; wyklucza tylko trzymanie wyłączne tego samego zasobu albo jego części | Control i ustawienia kilku gier naraz trzymają pulę logo; kilku współpracowników ma otwartą tę samą bazę |

Dziś istnieje tylko trzymanie wyłączne (`edit_locks`: jeden wiersz na
zasób). Opis jest ułożony według tego, **kto trzyma** blokadę i **kto ją
rozpoznaje** (kto zostaje zatrzymany) — nie według tego, jak długo jest
trzymana.

## 2. Zasoby

| Typ | Co to | Kto trzyma |
|---|---|---|
| `game` | jedna gra (pytania, ustawienia, ankieta, rozgrywka) — **jeden wspólny klucz** dla wszystkich stron gry (migracja 255) | edytor pytań, ustawienia gry, ankieta gry, Control |
| `logo` | jedno logo | edytor logo |
| *(pula logo)* | wszystkie logo użytkownika — **dziś bez własnego wiersza**, wyprowadzana z blokad `game` z kontekstem `settings` / `control` (migracja 256) | — |
| `base_question`, `base_folder`, `base_tag` | element bazy pytań | akcje eksploratora bazy (krótkie blokady) |
| `base` | cała baza | **nikt** (typ istnieje w `acquire_edit_lock`, nieużywany — eksplorator blokuje elementy, nie całą bazę) |

## 3. Stan faktyczny: strony

| Strona | Trzyma (`guardResourceLock`, kontekst) | Czeka na (`guardResourceBusy`) | Dodatkowe sprawdzenia |
|---|---|---|---|
| Edytor pytań `/editor/?id=G` (`editor/js/editor.js:349`) | `game:G` (`editor`) | — | odrzucony zapis reguł gry → `showBlockingOverlay` |
| Ustawienia gry `/game-settings/?id=G` (`game-settings.js:1690`) | `game:G` (`settings`) | `logo` swojej gry (`:1711`) | — |
| Ankieta gry `/polls/?id=G` (`polls/js/polls.js:1298`) | `game:G` (`polls`) | — | — |
| Control `/control/?id=G` (`control/js/app.js:195`) | `game:G` (`control`) | `logo` swojej gry (`:214`) | — |
| Edytor logo `/logo/editor-*/?id=L` (`logo/js/editor-page.js`) | `logo:L` (`logo-editor`) | — | **pula**: `findBusyContext("game", ["settings","control"])` przy wejściu; odrzucony zapis (`update_logo_checked`) → komunikat i koniec edycji |
| Eksplorator bazy `/base-explorer/?base=B` | — (brak blokady strony) | — | blokady **okna** (zmiana nazwy, okno pytania, okno tagów) i **akcji** (usuń, przenieś, przypisz tag, kolejność, zapis tagów) na elementach: `base_question` / `base_folder` / `base_tag` (`actions.js:955–4415`, `tags-modal.js:235–553`, konteksty `base-explorer:*`) |
| Host (urządzenie) | — | — | `host2_logo_get_public`: logo w edycji (`logo:L` zajęte) → Host pokazuje „zajęte” zamiast logo |
| Głosowanie, QR, `poll-go` | — | — | celowo bez blokad (wielu naraz / tylko odczyt) |

## 4. Stan faktyczny: akcje jednorazowe i druga warstwa w bazie

| Akcja | Strona | Sprawdzenie na stronie | W bazie |
|---|---|---|---|
| Zmiana nazwy gry | lista gier (`games.js:399`) | `isResourceBusy(game)` | **brak** (zwykły `update`) |
| Reset ankiety do edycji | lista gier (`:823`) | `isResourceBusy(game)` | reguły `game_reset_poll_for_edit` (stan, nie blokady) |
| Eksport gry | lista gier (`:1636`) | `isResourceBusy(game)` | — (tylko odczyt) |
| Usunięcie kopii ze Społeczności | lista gier (`:1017`) | `isResourceBusy(game)` | **brak** — `market_remove_from_library` usuwa grę bez sprawdzenia `game:G` |
| Usunięcie gry | lista gier | — | `delete_resource_checked('game')`: ankieta otwarta **albo** `game:G` zajęte → odmowa |
| Zmiana nazwy logo | lista logo (`list.js:382`) | `isResourceBusy(logo)` | `update_logo_checked`: **pula** zajęta → odmowa (blokady `logo:L` nie sprawdza) |
| Zapis logo | edytor logo | — | `update_logo_checked`: jw. |
| Usunięcie logo | lista logo | — | `delete_resource_checked('logo')`: `logo:L` zajęte **albo** pula zajęta → odmowa |
| Nowe logo | lista logo (`list.js:417`) | pula (`findBusyContext`) | — (`insert`) |
| Zmiana nazwy bazy | lista baz | — | **brak** (`updateChecked` sprawdza tylko istnienie wiersza) |
| Usunięcie bazy | lista baz | — | `delete_resource_checked('base')`: zajęty dowolny element bazy → odmowa |

Osobna kategoria (nie blokady, tylko **stan** w bazie): reguły gry
(`game_validate`, `rules_state`, migracje 273–275) — np. pytań nie da się
zmienić przy otwartej ankiecie. Opisane w `docs/audyt-stron.md` (Games).

## 4a. Stan faktyczny: kto trzyma → kto rozpoznaje

| Zasób | Kto trzyma | Kto rozpoznaje (zostaje zatrzymany) | Kto **nie** rozpoznaje, a powinien |
|---|---|---|---|
| `game:G` | edytor pytań, ustawienia gry, ankieta gry, Control — na wyłączność, do wyjścia ze strony | wejście na te same cztery strony (komunikat „gra zajęta”); lista gier: zmiana nazwy, reset, eksport, usunięcie kopii (sprawdzenie strony); usunięcie gry (baza) | zmiana nazwy gry w bazie; usunięcie kopii ze Społeczności w bazie |
| `logo:L` | edytor logo — na wyłączność, do wyjścia ze strony | edytor logo w innej karcie; zmiana nazwy na liście (sprawdzenie strony); usunięcie logo (baza); Control i ustawienia gry, której to logo (czekają); Host (pokazuje „zajęte”) | zapis i zmiana nazwy logo w bazie (`update_logo_checked`) |
| pula logo (bez wiersza) | — nikt; wyprowadzana z `game:G` trzymanego przez ustawienia / Control | edytor logo: wejście i każdy zapis; lista logo: nowe logo, zmiana nazwy, usunięcie (baza) | — (ale rozpoznawanie idzie przez gry, nie przez pulę) |
| *(edycja dowolnego logo)* | — | — | Control i ustawienia gry nie sprawdzają, czy edytowane jest **inne** logo niż ich gry |
| `base_question`, `base_folder`, `base_tag` | eksplorator bazy: okna (zmiana nazwy, pytanie, tagi) i akcje (usuń, przenieś, przypisz tag, kolejność, zapis tagów) — na wyłączność | te same okna i akcje w innej karcie / u współpracownika; usunięcie bazy (baza) | — |
| `base:B` | **nikt** | — | zmiana nazwy bazy, zmiana udostępniania, usunięcie bazy — przy otwartym eksploratorze |

## 5. Rozbieżności (do naprawy)

1. **Pula logo nie jest zasobem.** Istnieje tylko jako zapytanie „czy
   jakaś gra jest otwarta w ustawieniach / Control” — w `update_logo_checked`,
   `delete_resource_checked('logo')`, `findBusyContext` w edytorze i na
   liście logo. Edytor logo musi przez to wiedzieć o grach.
2. **Asymetria puli.** Control / ustawienia gry blokują wszystkie logo, ale
   same wchodzą mimo edycji dowolnego logo (czekają tylko na logo swojej
   gry) — wtedy edytor logo zostaje wyrzucony przy najbliższym zapisie.
3. **`update_logo_checked` nie sprawdza `logo:L`.** Zmiana nazwy z listy
   pilnuje tego tylko po stronie strony (`isResourceBusy`).
4. **Bez drugiej warstwy w bazie**: zmiana nazwy gry (sprawdza tylko
   strona), zmiana nazwy bazy (nic), usunięcie kopii ze Społeczności
   (`market_remove_from_library` kasuje grę mimo zajętego `game:G`).
5. **Eksplorator bazy nie ma blokady strony** — dwie karty mogą mieć tę
   samą bazę otwartą; konflikt łapią dopiero blokady elementów przy akcji.
   (Decyzja z audytu bazy: „precyzyjne blokady każdego elementu” — zostaje,
   ale trzeba to tu opisać jako świadomy wyjątek albo zmienić.)
6. **Zmiana nazwy nie trzyma blokady na listach.** W eksploratorze bazy
   okno zmiany nazwy trzyma element, dopóki jest otwarte; na liście gier
   i logo jest tylko sprawdzenie przy zatwierdzeniu, a na liście baz nic —
   w czasie otwartego okna ktoś może wejść w edycję tego samego zasobu.
7. **Konteksty** są wolnym tekstem (`editor`, `settings`, `polls`,
   `control`, `logo-editor`, `base-explorer:*`) i w bazie znaczenie mają
   tylko `settings` / `control` (pula). Nigdzie nie ma ich listy.

## 6. Mapa docelowa (decyzje 2026-10-07)

Każda strona i każde okno **deklaruje w mapie stron** (`PAGES`,
`docs/nawigacja-mapa-plan.md`, sekcja 2), co trzyma; to, kto zostaje
zatrzymany, wynika z samych zasobów — jeden mechanizm, bez kontekstów
w regułach i bez wiedzy, która strona trzyma.

### Kto trzyma

| Kto | Trzyma |
|---|---|
| `/games/editor/?id=G`, `/polls/editor/?id=G` | `game:G` wyłącznie |
| `/games/settings/?id=G`, `/control/?id=G` | `game:G` wyłącznie **+ `logos` współdzielone** (cała pula logo użytkownika) |
| `/logo/editor/<typ>/?id=L` | `logo:L` wyłącznie |
| `/bases/explorer/?id=B` | **`base:B` współdzielone** (obecność — współpracownicy mogą mieć bazę otwartą naraz) + jak dziś elementy (`base_question` / `base_folder` / `base_tag`) wyłącznie w oknach i akcjach |
| okno zmiany nazwy (lista gier / logo / baz, eksplorator) | zasób, którego nazwę zmienia, wyłącznie — do zamknięcia okna |
| akcje całej bazy (zmiana nazwy, usunięcie) | `base:B` wyłącznie |
| udostępnianie bazy (dodanie / odebranie dostępu) | **nic** — nie zmienia zawartości bazy, więc działa przy otwartym eksploratorze |
| inne akcje z list (reset, usunięcie, przeniesienie…) | swój zasób wyłącznie, na czas zapisu |

### Kto rozpoznaje — i jaki komunikat

| Gdy zajęte… | Zatrzymany | Komunikat |
|---|---|---|
| `game:G` (ktoś trzyma) | wejście do edytora, ustawień, ankiety, Control tej gry; akcje na grze z listy | „Ta gra jest otwarta gdzie indziej” |
| dowolne `logo:L` (trwa edycja logo) | wejście do Control i ustawień **każdej** gry (biorą `logos`) | „Trwa edycja logo — zamknij edytor logo, żeby otworzyć rozgrywkę / ustawienia” |
| `logos` (otwarty Control lub ustawienia) | wejście do edytora logo; nowe logo, zmiana nazwy, usunięcie logo | „Trwa rozgrywka” / „Otwarte ustawienia gry” (powód z tego, kto trzyma `logos`) |
| `logo:L` (inna karta) | edytor tego logo, zmiana nazwy, usunięcie | „To logo jest edytowane gdzie indziej” |
| `base:B` współdzielone (eksplorator otwarty) | zmiana nazwy bazy, usunięcie bazy | „Baza jest otwarta — zmiana całej bazy niemożliwa” |
| odebrany dostęp do bazy | otwarty eksplorator osoby, której odebrano dostęp (`forbidden` przy odnowieniu blokady albo przy akcji) | „Odebrano Ci dostęp do tej bazy” |
| `base:B` wyłączne (trwa zmiana całej bazy: okno zmiany nazwy, usuwanie) | wejście do eksploratora tej bazy — **pełna blokada strony** (jak zajęta gra), strona wczytuje się sama po zwolnieniu | „Trwa zmiana całej bazy” |
| element bazy | to samo okno / akcja u innej osoby | jak dziś |

Kolejność sprawdzania przy wejściu do Control / ustawień: najpierw
`game:G` (komunikat o grze), potem `logos` (komunikat o edycji logo) —
pierwsza przeszkoda zatrzymuje i nie idziemy dalej.

### Baza: dwa poziomy zasobów (decyzja 2026-10-07)

- **`base:B`** — cała baza. Eksplorator trzyma ją współdzielenie (wielu
  współpracowników naraz) i **rozpoznaje** trzymanie wyłączne: akcja
  całej bazy (zmiana nazwy, usunięcie) → pełna blokada strony
  eksploratora. W drugą stronę: otwarty eksplorator → akcja całej
  bazy odmówiona.
- **Elementy** (`base_question`, `base_folder`, `base_tag`) — osobne
  zasoby, używane **tylko wewnątrz eksploratora** (okna i akcje); nie
  wchodzą w relację z `base:B` współdzielonym. Z `base:B` wyłącznym nie
  spotkają się, bo przy nim eksplorator jest zablokowany w całości.
- Eksplorator, któremu wygasło trzymanie (uśpiony laptop) i ktoś w tym
  czasie wziął `base:B` wyłącznie, przy odnowieniu dostaje `locked` →
  pełna blokada strony (tak samo jak inne strony przy utracie blokady).
- **Udostępnianie nie blokuje i nie jest blokowane** (decyzja
  2026-10-07): nie zmienia zawartości bazy, więc przy otwartym
  eksploratorze można dodać kolejnych edytujących i odebrać dostęp. Osoba,
  której odebrano dostęp, przy najbliższym odnowieniu blokady albo akcji
  dostaje `forbidden` → pełnoekranowy komunikat „Odebrano Ci dostęp do tej
  bazy” z wyjściem do listy baz.

### Blokady są trwałe — bez „przejmij kontrolę” (decyzja 2026-10-07)

- Blokada trwa, dopóki karta, która ją trzyma, jest otwarta. Nigdzie nie
  ma „przejmij kontrolę”, wymuszenia ani pomijania blokady — także przy
  usuwaniu gry. **Jedyny wyjątek: usunięcie konta** jest nadrzędne
  (`usuwanie-danych.md`); strony trzymające usunięte zasoby dostają `gone`.
- Dziś w kodzie nie ma przejmowania; jedyna droga utraty blokady to
  wygaśnięcie po 25 s bez odnowienia.
- **Luka do naprawy**: odnowienie (`resource-lock.js:232`) obsługuje
  tylko `gone` i `forbidden`, a ignoruje `locked`. Gdy karta w tle
  przestanie odnawiać (przeglądarka zwalnia liczniki ukrytych kart nawet
  do 1 na minutę; uśpiony komputer), blokada wygasa, inna karta ją bierze,
  a pierwsza po wybudzeniu dalej edytuje — dwie edycje naraz.
- Naprawa: odnowienie zwracające `locked` → pełna blokada strony;
  odnowienie od razu przy powrocie karty na wierzch; TTL dłuższy niż
  spowolnione liczniki w tle (np. 2 min) — zamknięta karta i tak zwalnia
  blokadę od razu (`pagehide`), TTL dotyczy tylko awarii.

### Blokady stanu i akcji — tak samo twarde jak blokady zasobów (decyzja 2026-10-07)

Zakres blokad obejmuje **trzy rodzaje** (jeden opis, jeden wygląd, jedna
druga warstwa w bazie): blokady zasobów (kto trzyma), blokady stanu
(strona nie może pracować w tym stanie gry) i **blokady akcji według
kryteriów danej gry** — każdy przycisk / akcja (graj, ustawienia,
ankieta, eksport, edycja, uruchomienie / zamknięcie ankiety, usunięcie…)
ma warunki zależne od typu i stanu gry (`game_rules_compute`:
edit / play / poll_entry / poll_open / poll_close / export). Akcja
niedozwolona: przycisk nieaktywny z powodem, a baza i tak odmawia.
Do spisania w tabeli: akcja → warunki → gdzie sprawdzane (strona, baza).


Poza blokadą zasobu (kto trzyma) są **reguły stanu** gry (`game_rules_compute`,
`rules_state`, migracje 273–275): np. pytań nie da się edytować przy
otwartej ankiecie; Control nie gra gry, która nie jest gotowa. Zasada:
- strona, której stan zasobu nie pozwala na jej pracę, **blokuje się
  w całości** (ten sam pełnoekranowy komunikat co przy zajętym zasobie,
  z wyjściem do strony nadrzędnej) — także gdy wejdzie się „mykiem”
  (ręcznie wpisany adres, stara zakładka, druga karta);
- nic nie da się zrobić — żadnych częściowo działających przycisków;
- baza odrzuca zapis niezależnie od strony (dziś: `guard_game_content`
  blokuje pytania i odpowiedzi przy otwartej ankiecie);
- jeśli stan zmieni się w trakcie (np. ankieta uruchomiona z innego
  miejsca), strona przy najbliższym odnowieniu / zapisie przechodzi
  w tę samą pełną blokadę.

**Wdrożone 2026-10-08 (E11g):** `guardGameState(gameId, akcja)`
(`shared/js/core/game-validate.js`) po blokadzie zasobu — edytor
(`edit`, reset zamkniętej ankiety już z blokadą), ustawienia gry i Control
(`play`, wcześniej w ogóle nie sprawdzały), strona ankiety (`poll_entry`).
Ten sam overlay co przy zajętym zasobie, wyjście do listy gier.

### Zgodność zasobów (reguła w bazie, jedna dla wszystkich)

- wyłączne `X` przeszkadza każdemu innemu trzymaniu `X`;
- współdzielone `X` nie przeszkadza innemu współdzielonemu `X`;
- współdzielone `logos` ↔ wyłączne `logo:L` (dowolne logo użytkownika)
  wykluczają się nawzajem;
- współdzielone `base:B` ↔ wyłączne `base:B` (akcje całej bazy)
  wykluczają się; współdzielone `base:B` **nie** wyklucza elementów bazy
  (na tym polega współpraca).

Druga warstwa w bazie (`*_checked`) stosuje tę samą regułę: zapis / zmiana
nazwy / usunięcie odmawia, gdy zasób albo jego „rodzic” (`logos`,
`base:B`) jest trzymany przez kogoś innego.

### Kroki wdrożenia

1. **Wdrożone (E2, migracja `2026-10-09_316_locks_shared_model.sql`).**
   `edit_locks.mode` (`exclusive` | `shared`), klucz (typ, id, karta) +
   częściowy indeks unikalny dla wyłącznych; zasób `logos` (id = użytkownik)
   i `base:B` także współdzielone; jedna reguła zgodności w
   `edit_lock_blockers()` (używana przez `acquire_edit_lock_mode`,
   `update_logo_checked`, `delete_resource_checked`,
   `rename_resource_checked`); stara `acquire_edit_lock(typ, id, karta,
   kontekst)` działa dalej jako trzymanie wyłączne; TTL 120 s
   (`edit_lock_ttl()`). Druga warstwa: zmiana nazwy gry / bazy / logo
   (`rename_resource_checked`), zapis i usunięcie logo, usunięcie gry i bazy
   odmawiają, gdy zasób albo jego „rodzic” jest trzymany przez **inną** kartę
   (parametr `p_tab_id` — własna karta nie przeszkadza sama sobie).
   `market_remove_from_library` idzie przez `delete_resource_checked` (312).
   Reguły nie używają `holder_context` (kolumna zostaje: statystyki aktywności
   i powód zajęcia puli logo w komunikatach). Test: `docs/sql/test-locks-316.sql`.
   *Poza zakresem:* widok aktywności w statystykach (migracje 303 / 307) dalej
   liczy blokady z progiem 25 s.
2. **Wdrożone.** `resource-lock.js`: `guardResourceLocks([{ type, id, mode,
   message }], opcje)` (wszystko albo nic, komunikat pierwszej przeszkody,
   wejście samo po zwolnieniu); odnowienie obsługuje `locked` → pełny overlay
   „Utracono blokadę” i odnawia od razu przy powrocie karty na wierzch;
   `guardResourceLock` to skrót dla jednego zasobu; `findBusyContext` i
   `guardResourceBusy` usunięte.
3. **Wdrożone.** Control i ustawienia gry: `game:G` wyłącznie + `logos`
   współdzielone (kolejność: gra, potem logo); komunikaty „Ta gra jest otwarta
   gdzie indziej” / „Trwa edycja logo — zamknij edytor logo, żeby otworzyć
   rozgrywkę / ustawienia”.
4. **Wdrożone.** Edytor logo trzyma `logo:L` wyłącznie; wejście przy
   trzymanym `logos` → „Trwa rozgrywka.” / „Otwarte ustawienia gry.” (powód z
   `blocker_context` odpowiedzi bazy; bez kontekstu: „Trwa rozgrywka albo
   otwarte ustawienia gry.”). Lista logo: nowe logo odmawia przy `logos`;
   zmiana nazwy i usunięcie — przez bazę.
5. **Wdrożone.** Eksplorator bazy trzyma `base:B` współdzielone (tylko rola
   edytora / właściciela; czytelnik nic nie trzyma); wyłączne `base:B` →
   pełna blokada „Trwa zmiana całej bazy”; `forbidden` → „Odebrano Ci dostęp do
   tej bazy”. Lista baz: okno zmiany nazwy trzyma `base:B` wyłącznie, usunięcie
   — na czas akcji. Udostępnianie nie trzyma długiej blokady zawartości; jego
   RPC musi jednak atomowo sprawdzić, że baza nadal istnieje i nie jest w trakcie
   destrukcyjnego usuwania (szczegóły w sekcji 7).
6. **Wdrożone.** Okna zmiany nazwy na liście gier, logo i baz trzymają zasób
   wyłącznie do zamknięcia okna (zajęty → alert, okno się nie otwiera).
7. Pola `locks` w mapie stron; test porównujący mapę z wywołaniami
   blokad w kodzie; e2e blokad (`cross-resource-locks.spec.js`,
   `logo-editor.spec.js`, bazy) na nową regułę i komunikaty. *Częściowo:*
   oczekiwania w `cross-resource-locks.spec.js`, `logo-editor.spec.js` i
   `control2.spec.js` dopasowane do nowych komunikatów (bez uruchomienia);
   brakuje nowych scenariuszy bazy (eksplorator ↔ zmiana nazwy / usunięcie
   bazy) i mapy `PAGES`.

## 7. Jedno drzewo zależności dla blokad, uprawnień i usuwania — E19

Decyzja/doprecyzowanie 2026-10-11. Zasób, jego blokady i jego potomne dane
mają jedną hierarchię. Kanoniczna tabela poniżej jest współdzielona z
[`e19-znajomi-plan.md`](e19-znajomi-plan.md), sekcja 7. Każdy nowy RPC
zmieniający potomka musi znać rodzica i sprawdzić jego stan w tej samej
transakcji.

| Korzeń / rodzic | Dzieci zasobowe | Kto trzyma blokadę dziś / docelowo | Propagacja do potomków |
|---|---|---|---|
| Konto właściciela | Gra | `game:G` wyłącznie w edytorze, ustawieniach, Control i stronie ankiety. | Usunięcie konta zamyka całe poddrzewo; otwarte karty dostają `gone`. |
| Gra | Przebieg ankiety, sesje pytań, głosy, zadania/udostępnienia | Obecne `game:G` obejmuje operacje stanu i edycji ankiety. Głosujący wielu równolegle nie trzymają blokady edycji. | Open/close/abort i usunięcie gry kończą albo usuwają właściwy przebieg oraz jego potomków; odrębne zadanie może dostać `forbidden` po odebraniu uprawnienia. |
| Gra → sesja runtime Control (dokładny rekord/klucz do zmapowania) | Stan podłączonych urządzeń, rekordy tymczasowe, udostępnienia i tokeny urządzeń | `game:G` wyłącznie w aktywnym Control; osobny TTL sesji runtime Control = 1 h bezczynności (nie mylić z heartbeat TTL blokady `edit_locks`). | Wygaśnięcie sesji kasuje powiązany Storage i unieważnia wszystkie tokeny udostępnień urządzeń z tej sesji; Control wraca do podłączania urządzeń. |
| Konto właściciela → baza | Elementy bazy i udostępnienia/role | `base:B` współdzielone w eksploratorze; akcje zawartości blokują konkretne elementy, akcje całej bazy — `base:B` wyłącznie. | Usunięcie bazy usuwa elementy, role, zadania i linki; odebranie roli blokuje dalsze odnowienie blokady (`forbidden`). |
| Konto | Znajomości, zaproszenia, subskrypcje | Relacje kontaktów są odrębnymi węzłami. Nie blokują automatycznie zasobu, do którego niezależne uprawnienie już nadano. | Usunięcie kontaktu usuwa zadania/wysłane zaproszenia zgodnie z typem relacji. Usunięcie konta zamyka jego relacje i zasoby. |

### Jedna reguła konfliktu, zależna od rodzaju operacji

| Operacja | Blokada / kontrola |
|---|---|
| Edycja treści lub zmiana stanu potomka | Deklaruje blokadę węzła, który zmienia, i sprawdza wymagane blokady przodków wg `edit_lock_blockers()`. Nie można zmodyfikować potomka, jeśli jego nadrzędny zasób jest w trakcie destrukcyjnej operacji. |
| Udostępnienie, zmiana roli, cofnięcie | Nie bierze długiej blokady całej zawartości. RPC w transakcji blokuje/odczytuje rodzica tak, by współbieżne usuwanie nie zostawiło osieroconego tokenu; sprawdza właściciela, stan/uruchomienie i uprawnienia. Cofnięcie natychmiast unieważnia liść. |
| Usunięcie albo wygaśnięcie rodzica | Zamyka tworzenie/zmiany potomków, przechodzi całe poddrzewo, unieważnia tokeny i zadania, anuluje jeszcze niewysłane maile przypisane do potomków, sprząta Storage. Usunięcie konta pozostaje nadrzędnym wyjątkiem: nie czeka na blokady. |
| Utrata dostępu przez współpracownika | Na najbliższym heartbeat albo akcji dostaje `forbidden`; usunięty zasób daje `gone`. Żaden potomny token nie powinien nadal zapewniać dostępu. |

Drzewo opisuje **zależność i propagację**, nie oznacza, że każda operacja
potomna ma blokować całą gałąź. Baza zachowuje współpracę: `base:B` shared
działa równolegle, a edycja elementu blokuje tylko ten element. Zmiana
udostępnienia nie wyklucza edycji treści, ale musi być atomowo bezpieczna
wobec usunięcia rodzica.

### Plan ujednolicenia z mapą stron

1. **Mapowanie istniejących danych — zweryfikowane 2026-10-11.**
   `game_sessions` to telemetria ukończonych/porzuconych przebiegów; `game_session_active`
   jest tylko prywatnym wskaźnikiem do wiersza telemetrii. `game_state` jest
   jedynym trwałym bieżącym stanem Control 2; wartość startowa ma
   `top_card='devices'`, `step='devices_display'`, `detail={}`. `device_presence`
   to heartbeat urządzeń (online liczone przez UI przez 6,5 s). `device_connect_codes`
   przechowuje tymczasowe kody parowania, ale obecnie ich rozwiązywanie zwraca
   globalny `games.share_key_*`. `shared_devices` jest starym grantem per
   właściciel/odbiorca/typ (unikat nie obejmuje gry), bez tokenu per odbiorca.
   Control nie zapisuje stanu gry do `localStorage`; jedyny jego wpis
   `sessionStorage` to znacznik animacji ekranu końcowego. Zasoby w bucketach
   Storage (logo/dźwięki) są zasobami gry, nie sesji Control i nie wolno ich
   usuwać przy jej wygaśnięciu. Brakuje osobnego rejestru runtime z TTL 1 h.
   Należy go dodać, a z nim wiązać udostępnienia i kody parowania. Wygaśnięcie
   ma zresetować `game_state` do ekranu podłączania urządzeń, zakończyć aktywny
   wpis telemetrii jako porzucony, usunąć wskaźnik przebiegu, kody parowania
   i granty/tokeny sesji oraz wyczyścić klucz animacji w `sessionStorage`.
2. Uzupełnić grafem `PAGES.locks` rodziców i dzieci oraz macierz operacji:
   wejście, edycja, zmiana stanu, share/grant, revoke, delete, expiry.
3. W `edit_lock_blockers()` / rodzinie RPC `*_checked` zapewnić wspólną
   walidację przodków, włączając gry, biegi ankiet i sesje Control, bazy i
   elementy. Nie zastępować locków stanem HTTP/klientowym.
4. Dodać blokadę wyścigu: równoległe tworzenie potomka i usuwanie rodzica
   muszą kończyć się albo kompletnym potomkiem, albo czystym usunięciem — nigdy
   osieroconym rekordem, aktywnym linkiem lub mailem do nieistniejącego zasobu.
5. Osobno wdrożyć TTL 1 h dla sesji Control; nie zmieniać TTL `edit_locks`
   (120 s / heartbeat) przez pomyłkę. Expiry powinno unieważnić share tokens,
   wyczyścić session Storage i zwolnić potomne blokady.
6. Testy macierzy: dla każdego poziomu gałęzi sprawdzić blokadę konkurencyjnej
   operacji, `forbidden`/`gone`, cofnięcie tokenu, usunięcie zadań i maili oraz
   cleanup Storage. Zaktualizować `PAGES.locks` i `cross-resource-locks.spec.js`.

Plan nie zmienia jeszcze istniejących zachowań runtime; E19 ma wdrożyć tę
macierz w sposób zgodny z decyzjami o współpracy w bazach i bez blokowania
głosujących.
# Decyzja wspólna 2026-10-11 — wypisanie = odmowa

Użytkownik rozszerzył zasadę na każde miejsce systemu. Rezygnacja
odbiorcy z przyjętej relacji/udostępnienia stosuje stan odmowy i jego
czas życia dla danego zasobu, niezależnie od strony/Go/starego RPC.
Uwzględnić przy przeglądzie grafu zależności i kaskad w E19: brak
reaktywacji starego tokenu, brak resetu karencji przez cofnięcie/usunięcie,
brak automatycznej akceptacji lub maila po wygaśnięciu. Flaga globalnego
wyłączenia maili pozostaje trwała i niezależna od wygaśnięcia relacji.
Szczegóły i bieżąca kolejność w e19-znajomi-plan.md; zapis decyzji nie
oznacza jeszcze wdrożenia wszystkich rodzajów zasobów.

### Uzupełnienie audytu Baz337/338 — 2026-10-11

`base_share_tasks.base_id` obecnie nie ma klucza obcego do
`question_bases`; usunięcie bazy nie usuwa fizycznie tych tasków.
Guards338 blokują decyzje po braku rodzica, listy odmów używają JOIN
do żyjącej bazy. W pkt7 grafu dopiąć fizyczne sprzątanie/kaskadę
oraz jednoznaczny stan Go po usunięciu; obecnych kontroli guarded
RPC nie traktować jako wykonanej fizycznej kaskady. Lock pary
poprzedza blokadę rodzica, potem rekordów task/share; cleanup zaproszeń
w invite dotyczy własnej pary po locku, bez globalnego DELETE przed nim.

### Węzły Ankiet340–344 — dopięcie grafu (2026-10-11)

| Ścieżka | Cykl i granica |
|---|---|
| Konto właściciela → gra → bieżący klucz ankiety → task → głosy taska | SHARE rodzica → UPDATE własnego taska przy głosowaniu, UPDATE rodzica → task przy decyzjach. Odmowa usuwa niepełne głosy; ostatni batch zapisuje komplet i done atomowo; późniejsza odmowa zablokowana. Owner remove kasuje głosy i zamyka task, zachowuje odmowę bieżącego runu. |
| Konto właściciela → poll_mail_budget_events (hash e-maila, czas zakolejkowania) | Jest dzieckiem konta, bez FK do gry/taska/kolejki. Dostarczenie/usunięcie kolejki, gry, taska lub subskrypcji nie zeruje limitu3/24h. Konto właściciela usuwa zdarzenia przez auth.users FK CASCADE; logiczny limit24h, fizyczne sprzątanie własnej pary przy insercie i godzinowe cron. Prywatna tabela, bez treści i surowego adresu. |

Nie mieszać blokad wierszy tej transakcji z heartbeat edit_locks: dwóch
odbiorców może głosować równolegle. Aktualizacja344 nie bierze wyłącznej
blokady rodzica po wcześniejszym SHARE, co zapobiega upgrade deadlock.
Usunięcie konta odbiorcy zachowuje swój obecny cleanup także po e-mailu
w delete_user_everything; pkt7 ma przetestować całą macierz, w tym dawne
email-taski i ponowne założenie konta. Fizyczna kaskada Baz pozostaje otwarta.

### Pkt7 — audyt po domknięciu maili (2026-10-11)

- friends_remove nadal fizycznie DELETE active; odmowa przy dobrowolnym
  zakończeniu musi znać osobę podejmującą decyzję niezależnie od pierwotnego
  kierunku zaproszenia. Własne undo przywraca pending, potem osobne accept.
- friends_cancel usuwa declined, a cooldown po odmowie ma klucz tylko
  requester→addressee. Cofnięcie nie może pozwolić obejść30 dni odwrotnym
  kierunkiem; token cofnięty nie może pozwalać undo/accept.
- _friend_drop_pair_tasks usuwa pending/opened poll/base tasks. Zbadać
  powiązane częściowe głosy oraz pending mail; zachować niezależne przyjęte
  uprawnienia do Baz/urządzeń, zgodnie z drzewem E19.
- _friend_mail_limit_until liczy rekordy friendships. Usunięcie rekordu
  może zgubić licznik; audyt trwałości obejmie również kontakty, tak jak
  zrobiona trwałość ankiet342. Samo ukrycie nie resetuje budżetu.
- Admin queue i zapis historii są dwiema operacjami. Awaria historii po
  queued nie może sugerować użytkownikowi bezpiecznego ponowienia wysyłki.

To wyniki przeglądu kodu, nie wykonane poprawki. Bazy bez FK, routing Go,
blokady rodziców i anonimowy token pozostają pozostałą częścią pkt7.

### Baza → zadanie: fizyczna kaskada345 przygotowana

FK i indeks base_id; cleanup starych orphanów w migracji po locku
question_bases→base_share_tasks. Taski pending/opened/accepted/declined/
cancelled kasują się z bazą, więc token/undo/accept nie może być reaktywowany
po usunięciu. Konto właściciela kaskaduje przez bazę do taska. Inne bazy
pozostają niezależne. PG16/rollback/regresje i wyścigi lokalnie ✓;
bramki wdrożenia jeszcze wymagane. To tylko krawędź zasobowa, nie rozwiązanie
oczekujących maili ani trwającej zewnętrznej wysyłki SMTP.

### Aktualizacja pkt7 — Bazy345 zamknięte, Znajomi346 po isolated

Kaskada345 zastosowana na produkcji: DB38173636101/log20:48:43 UTC,
rollbackowy smoke i rzeczywisty Base mail/Go main38173864796 ✓.
Wcześniejsze akapity o braku FK opisują stan sprzed345.

Znajomi346: lokalne i isolated38174631322 ✓. Aktor własnej odmowy
nie zależy od pierwotnego kierunku zaproszenia. Jeden lock nieuporządkowanej
pary poprzedza świeży odczyt/lock relacji; remove/reject/undo/accept/cancel
i resend używają tego samego helpera. Cancel zachowuje rekord, oba zegary
odmowy oraz budżet mailowy; nieważny token nie pozwala undo.
Przeniesienie ważnego budżetu do nowego tokenu odbywa się pod lockiem pary.
SQL346 i rzeczywista kontrola interfejsu jeszcze wymagane do zamknięcia.

Dalsza krawędź grafu: _friend_drop_pair_tasks nie usuwa głosów task:<id>,
a poll_share_send blokuje grę i czyta are_friends bez blokady pary.
W kolejnej paczce objąć tworzenie/czyszczenie tasków wspólną kolejnością
blokad oraz głosami i oczekującymi mailami; nie uznawać346 za jej wykonanie.

### Graf kontaktów i ankiet — audyt352 (2026-10-12)

Zadanie ma równocześnie rodziców: uruchomienie ankiety oraz kontakt,
z którego wynika udostępnienie. Stały ID odbiorcy po rejestracji/zmianie
adresu nie zastępuje referencji tego kontaktu. Cofnięcie źródła ma
unieważniać jego udostępnienia i usuwać niepełne głosy; konwersja
subskrybenta w znajomego ma zachować uprawnienie pod nową relacją.
Niezależne zadanie udostępnione przez Znajomych nie jest potomkiem starej
subskrypcji. Lokalne reprodukcje na351 wskazały brak tej referencji oraz
przypisanie dawnej relacji nowemu właścicielowi adresu. Szczegóły i
macierz do wdrożenia w E19, podsekcja352; brak wdrożenia tej krawędzi.

### Stan wykonania wspólnego grafu — 2026-10-12

Mapa w §7 jest wspólnym kontraktem. Wykonanie opiera się na FK, triggerach,
transakcyjnych RPC oraz wspólnych edit_locks; nie ma osobnego, ukończonego
silnika, który automatycznie obsługuje dowolny nowy rodzaj zasobu.
Każda nowa krawędź wymaga jawnej referencji rodzica, kontroli tworzenia,
blokad i sprawdzonej propagacji cofnięcia/usunięcia.

| Krawędź / mechanizm | Stan rzeczywisty |
|---|---|
| Blokady edycji oraz kontrole przodków | E2 wdrożone; dalszy przegląd spójności nowych krawędzi w E19 |
| Baza → zadanie udostępnienia | Fizyczny FK/kaskada345 wdrożona |
| Konto odbiorcy → udostępnienia i niepełne głosy |348/351 wdrożone; pełne anonimowe agregaty zachowane |
| Kontakt → zadanie ankiety |353 wdrożone: jawne źródło, cofnięcie, transfer w znajomość, Go/open/vote |
| Auth gościa → profil/klasyfikacja |354 wdrożone; main38233127443 success4/4 bez retry, błędne profile naprawione |
| Subskrypcja → pochodna propozycja znajomości |355 wdrożone; source close unieważnia pending/declined i zachowuje budżety; main38236412958 success1/1 z rzeczywistymi mailami |
| Znajomość lub ręczne nadanie → zaproszenie bazy | 357 zamknięte (DB38243208054, branch38244399918/main38245594773 success4/4 bez retry i3 realne SMTP): jawne źródło dla nowych wybranych Znajomych, zamknięcie pending/declined zachowuje budżety; ręczne i przyjęte role niezależne. |
| Zasób/konto → tokeny, cooldowny i oczekujące maile | Pozostały audyt i implementacja wspólnej ważności przed kolejką/dostarczeniem |

Całego grafu nie oznaczać jako zakończonego na podstawie jednej zielonej
paczki. Etapy353 i354 nie zastępują domknięcia pozostałych krawędzi.

### Przekazanie kopii — nowa gałąź E19C (2026-10-12)

Źródło decyzji: [`udostepnianie-kopii-plan.md`](udostepnianie-kopii-plan.md).
Gra/logo nadawcy → snapshot eksportu → propozycja dla konta odbiorcy →
własna gra/logo odbiorcy. Po wysłaniu snapshot należy do poddrzewa
odbiorcy; znajomość i własność źródła warunkują utworzenie, a późniejsze
usunięcie oryginału/konta nadawcy/znajomości nie cofa przekazanej kopii.
To przeniesienie danych do samodzielnego zasobu, z własnymi identyfikatorami
i plikami. Usunięcie konta odbiorcy sprząta jego propozycje i kopie.
Blokady i walidacja snapshotu zgodnie ze wspólnym eksportem/importem.

### Graf centrum adresu i nadrzędnej rezygnacji (decyzja2026-10-12)

Adres bez konta → globalna rezygnacja → subskrypcje/propozycje + bieżące zadania ankiet + granty mailowe urządzeń. Rezygnacja zamyka dzieci, brak widocznych list i brak nowych aktywnych dzieci podczas blokady; włączenie flagi nie przywraca zamkniętych źródeł ani budżetów. Root(mail) i wszystkie rodzice kontaktów/gier/sesji przed dziećmi i kolejką; uwzględnić dawne cleanup child-first, registration/email change oraz wyścig tworzenia z rezygnacją. Zakończone agregaty mają dotychczasowy wyjątek retencji.

Token stopki → czasowa sesja centrum → uprawnienie do konkretnego aktualnego źródła. Token pełnego centrum tylko w dostarczonym mailu, nigdy zwracany nadawcy. Historyczny token samego wypisania nie uzyskuje nowych uprawnień do cudzych danych. Pojawienie się konta na adresie kończy anonimowe zarządzanie i wymaga loginu. Zakres anulowania dla zarejestrowanych jest pytaniem otwartym; nie stosować go do zaakceptowanych ról Baz ani kopii bez odpowiedzi.

### Kolejka i źródło zaproszenia — lokalny kontrakt361 (2026-10-12)

Prototyp, jeszcze bez wdrożenia. Jedna skuteczna próba z dotychczasowego
RPC rezerwującego budżet daje jedną prywatną zgodę na zapis maila. Usunięcie
maila z kolejki nie pozwala jej ponownie wykorzystać. Cofnięcie źródła,
zmiana jego odbiorcy, roli lub sesji oraz wyłączenie maili unieważnia stare
zgody; przywrócenie nie ożywia wcześniejszej kolejki ani budżetu.

| Rodzina | Aktualny rodzic / źródło | Koniec ważności maila | Dostęp niezależny od maila |
|---|---|---|---|
| Znajomi | Kanoniczne konta → konkretne zaproszenie; ewentualna subskrypcja źródłowa | Decyzja, cofnięcie, zmiana tożsamości lub zamknięcie źródła | Tak; sama flaga konta wyłącza mail |
| Subskrybenci | Właściciel → konkretny adres bez konta → zaproszenie | Decyzja, zamknięcie, zmiana adresu lub rejestracja | Anonimowa globalna rezygnacja zamyka także relację |
| Ankiety | Właściciel → gra → bieżące uruchomienie → zadanie → źródło kontaktu | Koniec uruchomienia, decyzja/głos, cofnięcie źródła lub zmiana odbiorcy | Flaga konta nie usuwa zadania; anonimowa globalna rezygnacja zamyka je |
| Bazy | Właściciel → baza → oczekujące nadanie roli → źródło kontaktu | Decyzja, pięć dni, zmiana roli, cofnięcie źródła lub usunięcie rodzica | Przyjęta rola przeżywa usunięcie znajomości |
| Urządzenia | Właściciel → gra → konkretna sesja Control → grant urządzenia | Cofnięcie grantu, zakończenie/wygaśnięcie sesji (1h bez aktywności), usunięcie rodzica | Późniejsze usunięcie znajomości nie cofa nadanego grantu |

W każdej ścieżce: źródło → prywatna zgoda na próbę → kolejka → wybór
i świeża kontrola przed każdym dostawcą. Usunięcie źródła/rodzica usuwa
jego zgody i oczekującą kolejkę. Żywego zadania nie odtwarzamy przez sam
HTML/token starego maila. „Oczekuje” → „Otwarte” nie unieważnia maila.
Ponowienie nie przejmuje aktywnej wysyłki i nie usuwa przyszłego terminu.

Obsługa konta (Edge send-email) jest osobną ścieżką bez kolejki i blokad
powiadomień. Kontakt ma rzeczywisty raport/wiadomość jako źródło wyjątku;
zamówiony dostęp do centrum ma prywatny dowód. Podgląd SMTP szablonów
nie udaje tych źródeł: prywatny HMAC endpoint tylko do test14, bez obejścia
flagi, bez prawdziwego zgłoszenia/Telegrama. Kopie Gier/Logo E19C dostaną
osobną ścieżkę należącą do odbiorcy; usunięcie nadawcy nie kasuje paczki.

Lokalnie: świeży pełny schemat + wszystkie kontrakty360/361 oraz60
wyścigów (5 rodzin × tworzenie/delivery × cofnięcie/usunięcie/flaga ×
obie kolejności), także sprawdzenie odzyskania Auth przez stary child-first
zapis. To nie zamyka całego pkt7 ani produkcyjnych bramek.
