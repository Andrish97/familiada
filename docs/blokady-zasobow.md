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

### Zakresy blokad — jak długo trzymana

| Zakres | Trzymana | Funkcja | Konflikt pokazany jako | Gdzie dziś |
|---|---|---|---|---|
| **strona** | od wejścia do wyjścia ze strony (cała sesja edycji) | `guardResourceLock` | pełnoekranowy komunikat, wejście samo po zwolnieniu | edytor pytań, ustawienia gry, ankieta gry, Control, edytor logo |
| **okno** | od otwarcia do zamknięcia okna edycji; `lease.ok` sprawdzane tuż przed zapisem (heartbeat może je stracić: `gone` / `forbidden`) | `acquireResourceLock(s)` | okno się nie otwiera (alert) / zapis przerwany komunikatem | eksplorator bazy: zmiana nazwy pytania/folderu (`base-explorer:rename`), okno pytania (`:question-modal`), okno tagów (`:tags-edit`, `:tags-assign`) |
| **akcja** | tylko na czas jednego zapisu (wszystkie zasoby naraz albo żaden, stała kolejność = bez zakleszczeń) | `acquireResourceLocks` | alert, akcja przerwana | eksplorator bazy: usuń, przenieś, przypisz tag, kolejność folderów, usuń tagi, zapis tagów (`:tags-assign-save`) |
| **sprawdzenie** | nic nie trzyma — jedno pytanie „wolne?” przed akcją | `isResourceBusy` | alert | lista gier (zmiana nazwy, reset, eksport, usunięcie kopii), lista logo (zmiana nazwy) |
| **czekanie** | nic nie trzyma — wejście czeka na zwolnienie | `guardResourceBusy` | pełnoekranowy komunikat | Control i ustawienia gry czekają na logo swojej gry |
| **baza** | nic nie trzyma — RPC odrzuca zapis / usunięcie | `*_checked` | alert z powodem | usuwanie gry / logo / bazy, zapis logo |

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
6. **Ta sama czynność, różne zakresy.** Zmiana nazwy w eksploratorze bazy
   trzyma blokadę **okna** przez cały czas otwartego okna; zmiana nazwy
   gry i logo na listach tylko **sprawdza** przy zatwierdzeniu (ktoś może
   zająć zasób, kiedy okno jest otwarte); zmiana nazwy bazy na liście nie
   robi nic.
7. **Konteksty** są wolnym tekstem (`editor`, `settings`, `polls`,
   `control`, `logo-editor`, `base-explorer:*`) i w bazie znaczenie mają
   tylko `settings` / `control` (pula). Nigdzie nie ma ich listy.

## 6. Mapa docelowa

Każda strona **deklaruje w mapie stron** (`PAGES` w
`docs/nawigacja-mapa-plan.md`, sekcja 2) zasoby, które trzyma; konflikt
rozstrzyga jeden mechanizm po samych zasobach — bez wiedzy, która strona
je trzyma, i bez kontekstów w regułach.

| Strona | `locks` (do wyjścia ze strony) | `waits` |
|---|---|---|
| `/games/editor/?id=G` | `game:G` | — |
| `/games/settings/?id=G` | `game:G`, `logos` | — |
| `/polls/editor/?id=G` | `game:G` | — |
| `/control/?id=G` | `game:G`, `logos` | — |
| `/logo/editor/<typ>/?id=L` | `logo:L` | — |
| `/bases/explorer/?id=B` | (decyzja: `base:B` albo jak dziś tylko elementy) | — |
| akcje z list | sprawdzenie tego samego zasobu w RPC `*_checked` | |

**`logos`** — nowy typ zasobu: „cała pula logo użytkownika” (`resource_id`
= id użytkownika). Zgodność:

- `logo:L` zajęte, gdy ktoś inny trzyma `logo:L` **albo** `logos`,
- `logos` zajęte, gdy ktoś inny trzyma `logos` **albo dowolne** `logo:L`
  użytkownika.

Skutki:

- edytor logo pyta tylko o `logo:L` — o grach nie wie nic,
- `update_logo_checked` / `delete_resource_checked('logo')` sprawdzają
  `logo:L` + `logos` (bez szukania gier po kontekście),
- Control / ustawienia gry biorą `game:G` + `logos` jedną operacją
  (`acquireResourceLocks` — wszystkie albo żaden) i **nie wejdą, dopóki
  edytowane jest jakiekolwiek logo** (dziś czekają tylko na logo swojej
  gry) — **do potwierdzenia**,
- `guardResourceBusy(logo swojej gry)` w Control i ustawieniach znika
  (zawiera się w `logos`),
- zmiana nazwy gry / bazy i usunięcie kopii ze Społeczności przez RPC
  sprawdzające blokadę (druga warstwa jak przy usuwaniu).

**Zasada zakresów** (ta sama czynność = ten sam zakres w całej aplikacji):

| Czynność | Zakres |
|---|---|
| strona edycji zasobu (edytor, ustawienia, ankieta, Control, edytor logo, eksplorator bazy) | **strona** |
| okno, w którym zmienia się zasób (zmiana nazwy — na każdej liście i w eksploratorze, okno pytania, okno tagów) | **okno** (+ druga warstwa w bazie przy zapisie) |
| jednorazowa akcja bez okna (usuń, przenieś, reset, przypisz tag, kolejność) | **akcja** (+ druga warstwa w bazie) |
| odczyt, który musi być spójny (eksport) | **sprawdzenie** |

W mapie stron (`PAGES`) zakres jest częścią deklaracji, np.
`rename: { scope: "okno", resource: "game" }`.

### Kroki wdrożenia

1. Migracja: `acquire_edit_lock` zna `logos` i zgodność `logo:L` ↔ `logos`;
   `update_logo_checked`, `delete_resource_checked('logo')` po nowej
   regule; `rename_resource_checked` dla gry i bazy; sprawdzenie
   `game:G` w `market_remove_from_library`.
2. `resource-lock.js`: `guardResourceLocks()` (blokada strony na kilka
   zasobów naraz, ten sam komunikat i wejście po zwolnieniu).
3. Control i ustawienia gry: `game:G` + `logos`; bez `guardResourceBusy`.
4. Edytor i lista logo: bez `findBusyContext`; komunikat „logo zajęte”
   rozróżnia tylko powód (edycja w innej karcie / rozgrywka / ustawienia).
5. Okna zmiany nazwy na listach (gry, logo, bazy) na zakres **okno**;
   pola `locks` / `scope` w mapie stron; test, który porównuje mapę z wywołaniami
   blokad w kodzie stron.
6. Testy e2e blokad (`cross-resource-locks.spec.js`, `logo-editor.spec.js`)
   na nową zgodność; usunięcie `findBusyContext` i kontekstów z reguł.
