# Blokady zasobów — jeden opis (stan faktyczny i mapa docelowa)

Jedyne źródło prawdy o blokadach. Starsze opisy w
`docs/plan-testy-i-poprawki.md` („Mapa zasobów”, „Model: zasób ma stan
busy/free”, „Krzyżowe blokady między zasobami”) są historią decyzji —
częściowo nieaktualną (np. Control opisany jako „krok 7, jeszcze nie”).
Zmiana blokady w kodzie albo w bazie = zmiana tego pliku i testu
(`tests/e2e/cross-resource-locks.spec.js`, `logo-editor.spec.js`).

Stan sprawdzony w kodzie 2026-10-07 (branch `ccr-4a2edd31-ekjnn8`,
`supabase/schema.sql`).

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

Dziś edytor przy niedozwolonym stanie od razu przenosi z komunikatem
(`editor.js:330`); do ujednolicenia z blokadą zasobu (ten sam overlay)
na wszystkich stronach gry: edytor, ustawienia, ankieta, Control.

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

1. Migracja: trzymanie współdzielone (np. `edit_locks` z kluczem
   (typ, id, karta) dla współdzielonych + kolumna `mode`), zasoby `logos`
   (id = użytkownik) i `base:B`; reguła zgodności w `acquire_edit_lock`;
   `update_logo_checked` / `delete_resource_checked` / nowe
   `rename_resource_checked` i sprawdzenie w `market_remove_from_library`
   po tej samej regule (udostępnianie bazy bez blokad); usunięcie
   `holder_context` z reguł.
2. `resource-lock.js`: `guardResourceLocks([...])` — strona trzyma kilka
   zasobów (wyłącznie / współdzielenie), pierwsza przeszkoda = jej
   komunikat, wejście samo po zwolnieniu; `findBusyContext` znika.
3. Control i ustawienia gry: `game:G` + `logos`; bez `guardResourceBusy`.
4. Edytor i lista logo: tylko `logo:L` (i rozpoznanie `logos`).
5. Eksplorator bazy: `base:B` współdzielone, pełna blokada przy
   `base:B` wyłącznym i komunikat przy odebranym dostępie; lista baz
   (zmiana nazwy, usunięcie): `base:B` wyłącznie.
6. Okna zmiany nazwy na listach trzymają zasób do zamknięcia okna.
7. Pola `locks` w mapie stron; test porównujący mapę z wywołaniami
   blokad w kodzie; e2e blokad (`cross-resource-locks.spec.js`,
   `logo-editor.spec.js`, bazy) na nową regułę i komunikaty.
