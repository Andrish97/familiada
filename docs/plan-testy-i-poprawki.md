# Plan: testy e2e i audyt "wielu miejsc naraz" (karty/okna/urządzenia)

Status: 🔲 = do zrobienia | 🔄 = w trakcie | ✅ = zrobione

Kontekst: `tests/e2e/editor.spec.js` (20 testów) pokazało, że edytor gier
nie ma żadnej synchronizacji między kartami ani re-walidacji stanu gry
per-akcja — druga karta może cicho nadpisać/zignorować zmiany pierwszej.
Ten plik śledzi rozszerzenie tego audytu na resztę aplikacji i poprawki,
które z niego wynikają.

**Sposób pracy**: każdy krok jest od razu testowany, nie dopiero na końcu.
Testy e2e (`tests/e2e/*.spec.js`, Playwright na produkcji) są dopisywane
przy tym samym kroku, co poprawka/nowa funkcja — nie osobno później.
Workflow `E2E Tests (Playwright)` w GitHub Actions jest celowo
**wyłącznie ręczny** (`workflow_dispatch`, patrz komentarz w
`.github/workflows/e2e-tests.yml` — loguje się na prawdziwe konta
produkcyjne), więc po dopisaniu testu jest on odpalany przez Actions API
(albo przez użytkownika ręcznie, jeśli o to poprosi), a wynik sprawdzany
przed przejściem do kolejnego kroku — nie zakładamy, że coś działa tylko
dlatego, że kod wygląda poprawnie.

---

## Dwie warstwy ochrony — 🔲 docelowy model

Jedna warstwa nie wystarczy, potrzebne są obie naraz:

**Warstwa 1 — blokada na wejściu (UX, "łatwa").** Przy otwarciu strony,
zanim cokolwiek się wyrenderuje (ten sam moment co dzisiejsze
`canEnterEdit()`/`guardDesktopOnly()`), sprawdź czy dany zasób (`game_id`,
`logo_id`, `base_id`) jest już otwarty w edycji gdzie indziej. Jeśli tak —
pełnoekranowy overlay "To jest właśnie edytowane gdzie indziej" +
przycisk "Wróć", w stylu `deviceGuard`, i **w ogóle nie ładujesz**
edytowalnej treści. To zatrzymuje 99% przypadków (przypadkowe otwarcie
drugiej karty) i jest proste do wdrożenia wszędzie tym samym mechanizmem.

**Warstwa 2 — zabezpieczenie samego zapisu (twarde, konieczne).** Warstwa 1
to tylko UX — nic nie stoi na przeszkodzie, żeby ominąć ją bezpośrednio
(np. druga karta otwarta ułamek sekundy wcześniej zanim blokada się
zarejestrowała, zerwane połączenie zostawiające "martwą" ale jeszcze
nie wygasłą blokadę, albo ktoś uderzający wprost w RPC/klienta z pominięciem
UI). Blokada na wejściu **nie chroni przed próbami** — chroni przed
przypadkiem, nie przed złą wolą ani wyścigiem czasowym przy samej
rejestracji blokady. Dlatego audyt i utwardzenie każdego miejsca zapisu
(patrz niżej: `updateChecked`, brak nadpisywania całych blobów, RLS jako
ostateczna linia obrony) jest **konieczne niezależnie od Warstwy 1**, nie
opcjonalne.

Obie warstwy razem: Warstwa 1 daje dobre UX (jasny komunikat zamiast
cichego rozjazdu), Warstwa 2 gwarantuje, że nawet gdy Warstwa 1 zawiedzie
lub zostanie ominięta, dane i tak się nie skorumpują ani nie zgubią cicho.

---

## Warstwa 1 — ogólny mechanizm blokady — ✅ zbudowany i przetestowany

Blokada ma być **jednym wspólnym mechanizmem dla całego projektu**, nie
osobną implementacją per strona — z **elastycznymi komunikatami** (tytuł,
treść, przyciski/akcje parametryzowane per wywołanie, tak jak już działa w
dwóch istniejących miejscach w kodzie, które są dokładnie tym wzorcem:

- `guardDesktopOnly()` (`js/core/device-guard.js`) — pełnoekranowy overlay
  (ciemne tło + blur, i18n tytuł/wiadomość, przycisk "Wróć"), pokazywany/
  chowany reaktywnie.
- `showGuestBlockedOverlay({ backHref, loginHref, showLoginButton })`
  (`js/core/guest-mode.js`) — ten sam dokładnie styl overlay, ale już
  parametryzowany: przyciski i ich cele (`backHref`/`loginHref`) i
  widoczność (`showLoginButton`) ustawiane per wywołanie, treść nadal z
  i18n (`guestGuard.*`).

Nowy moduł (roboczo `js/core/resource-lock.js`) ma się złożyć z dwóch
części, obie ogólne i reużywalne:

1. **Warstwa danych — tabela jako źródło prawdy** (heartbeat + TTL, na
   wzór już istniejącego `device_presence`), z jedną funkcją
   `acquireResourceLock({ resourceType, resourceId })` używaną identycznie
   niezależnie od tego czy to gra, logo, baza czy rozgrywka.
2. **Warstwa live — Broadcast dla natychmiastowego zwolnienia** (już
   gotowe `rt()` z `js/core/realtime.js`, ten sam mechanizm co synchronizacja
   języka w `polls.js`). Tabela zostaje źródłem prawdy (bo działa nawet
   zanim WS się połączy, i przetrwa restart karty), ale zwolnienie blokady
   dodatkowo rozsyła broadcast, żeby czekająca karta nie musiała czekać na
   najbliższy heartbeat/poll — dowiaduje się natychmiast. Świadomie NIE
   używamy wbudowanego Supabase Presence — to nowy, niesprawdzony jeszcze
   na tym self-hosted Supabase mechanizm, a `device_presence` (ten sam
   problem: kto jest online) już od dawna działa na tabeli+pollingu, więc
   zostajemy przy sprawdzonym wzorcu.
3. **Warstwa UI** — jeden `showResourceLockedOverlay({ title, message,
   backHref, ... })`, kopiujący dokładnie wzorzec `showGuestBlockedOverlay`
   (ten sam styl, ta sama struktura), ale z treścią/przyciskami
   parametryzowanymi per zasób — inny komunikat dla gry ("Ta gra jest
   edytowana w innej karcie"), inny dla bazy, inny dla logo, inny dla
   rozgrywki — zamiast jednego sztywnego tekstu na wszystko.

**Zbudowane i przetestowane** (`js/core/resource-lock.js`, migracja
`2026-08-28_253_edit_locks.sql` — tabela `edit_locks` + RPC
`acquire_edit_lock`/`release_edit_lock`), pierwszy konsument: edytor gry
(patrz sekcja "Edytor gier" niżej). Reszta stron z listy dokłada teraz
tylko jedno wywołanie `guardResourceLock({resourceType, resourceId,
message, backHref})` z własną treścią, zamiast wymyślać blokadę od nowa.

Po drodze e2e wyłapał realny bug we własnej implementacji: gdy karta
odzyskiwała dostęp po zwolnieniu blokady przez drugą kartę, chowałem
tylko overlay — ale strona już wcześniej przerwała renderowanie (`return`
przy pierwszej porażce), więc pod overlayem zostawała pusta, niewyrenderowana
treść. Fix: po odzyskaniu dostępu strona robi `location.reload()` zamiast
próbować "wznowić" stan w locie — świeży `boot()` przechodzi normalnie
przez `guardResourceLock` i realnie renderuje. Potwierdzone e2e (dwie
karty, zamknięcie pierwszej, druga wchodzi i widzi pytania).

### Szkic tabeli

```sql
CREATE TABLE edit_locks (
  resource_type  text        NOT NULL,  -- 'game_editor' | 'game_settings' | 'poll' | 'logo' | 'base' | 'control'
  resource_id    uuid        NOT NULL,
  holder_tab_id  text        NOT NULL,  -- losowe id karty z sessionStorage — NIE user_id,
                                         -- bo blokujemy też własną drugą kartę tego samego usera
  holder_user_id uuid        NOT NULL,  -- do komunikatu "zajęte przez X" i audytu
  acquired_at    timestamptz NOT NULL DEFAULT now(),
  heartbeat_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_type, resource_id)
);
```

**Kto i jak pisze** — wyłącznie przez SECURITY DEFINER RPC, nigdy
bezpośrednim INSERT/UPDATE z klienta (jak przy `device_presence`):

- `acquire_edit_lock(p_resource_type, p_resource_id, p_tab_id)` — jedna
  funkcja robi zarówno pierwsze zajęcie, jak i odnowienie heartbeatu
  (wywoływana identycznie co ~8s):
  1. Sprawdza, czy wołający w ogóle ma prawo edytować ten zasób (ten sam
     check co dziś przy zapisie: `owner_id = auth.uid()` dla gry/logo,
     `base_can_edit()` dla bazy) — inaczej odrzuca, zanim w ogóle dotknie
     blokady.
  2. Brak wiersza → wstawia, zwraca `{ok:true, acquired:true}`.
  3. Wiersz jest, ale `holder_tab_id` = własny → to odnowienie, aktualizuje
     `heartbeat_at`, zwraca `{ok:true}`.
  4. Wiersz jest, cudzy, ale `heartbeat_at` starszy niż próg (np. 25s, ok.
     3 pominięte heartbeaty — margines na zerwanie sieci) → przejmuje
     (jak dziś `device_presence` traktuje martwe urządzenia jako offline),
     zwraca `{ok:true, stolen:true}`.
  5. Wiersz jest, cudzy, świeży → zwraca `{ok:false, holder_user_id,
     acquired_at}` (dane do komunikatu "zajęte od X minut"), NIE
     nadpisuje nic.
  Cała logika w jednej instrukcji SQL (żeby dwie karty odpalające
  `acquire` w tej samej milisekundzie nie obie "wygrały").
- `release_edit_lock(p_resource_type, p_resource_id, p_tab_id)` — usuwa
  wiersz TYLKO jeśli `holder_tab_id` się zgadza (nikt nie może zwolnić
  cudzej blokady). Wołane na `pagehide` (best effort — CELOWO NIE na
  zwykłe schowanie karty/`visibilitychange`, bo alt-tab do innej aplikacji
  podczas edycji nie powinien oddawać blokady komuś innemu) — jeśli nie
  zdąży odpalić (crash karty), i tak wygasa przez TTL przy następnej
  próbie `acquire` kogoś innego.

**Kto i jak czyta**: RLS `SELECT` z tym samym warunkiem dostępu co RPC
(właściciel zasobu / `base_can_access()` dla bazy) — każdy uprawniony do
zasobu widzi czy jest zajęty, ale nie może nic zapisać poza RPC.

**Przepływ na stronie** (`guardResourceLock`, zaimplementowane dokładnie tak):
1. Start strony (po `requireAuth`, przed renderem edytowalnej treści):
   `holder_tab_id` z `sessionStorage` (per-karta, przeżywa odświeżenie tej
   samej karty) → `acquire_edit_lock`.
2. `ok:false` → overlay, wywołujący robi `return` (treść nie renderowana).
   W tle: subskrypcja broadcastu `"RELEASED"` + niezależny polling co ~5s
   (fallback gdyby broadcast nie doszedł — TTL 25s i tak w końcu zwolni).
   Gdy którekolwiek wykryje, że zasób jest wolny → `location.reload()`
   (nie samo chowanie overlayu — patrz fix wyżej).
3. `ok:true` → renderuj normalnie, `setInterval` odnawiający co ~8s.
4. Zamknięcie/nawigacja karty (`pagehide`) → `release_edit_lock` + broadcast
   `"RELEASED"` na kanale zasobu, żeby czekający dowiedzieli się od razu.

### Mapa zasobów (po zbudowaniu ogólnego mechanizmu)

**Korekta (istotna zmiana względem wcześniejszej wersji tej sekcji)**:
zasada ogólna, nie specyficzna dla gry — gdy dwie różne strony dotykają
**tego samego zasobu** (tu akurat: konkretnej gry o danym id, ale
zasada dotyczy każdego typu zasobu), nie są od siebie niezależne, jeśli
operują na tych samych, powiązanych danych. Konkretny przypadek: edytor
zmienia pytania, ustawienia wybierają z tych samych pytań finał/rundy —
więc obie strony dzielą **jeden wspólny klucz blokady dla tego zasobu**
(`game` + `resource_id`), nie osobny per strona. Kto pierwszy otworzy
dowolną stronę dotykającą danego zasobu, ten trzyma blokadę — każda inna
próba wejścia na TEN SAM zasób dostaje overlay "zajęte", niezależnie od
tego, która to konkretnie strona. Komunikat na overlayu rozróżnia tylko
TYP zasobu (gra/logo/baza), nie która strona trzyma blokadę. Wdrożone w
migracji
`2026-08-28_255_unify_game_edit_locks.sql` (collapse
`game_editor`/`game_settings`/`poll`/`control` → `game`) — ✅ **ZAMKNIĘTE**,
8/8 e2e zielonych na produkcji (run #66, `cross-resource-locks.spec.js`,
w tym testy "edytor blokuje ustawienia" i "ustawienia blokują edytor").

| Zasób (klucz blokady) | Strony | Kiedy wdrożyć |
|---|---|---|
| `game` | `js/pages/editor.js`, `js/pages/game-settings.js` | ✅ zrobione i przetestowane e2e (wspólny klucz) |
| `game` (ankieta) | `js/pages/polls.js` | ✅ dołączona do wspólnego klucza `game`, przetestowane e2e (run #67, 12/12) |
| `logo_id` | `logo-editor/js/main.js` | ✅ krok 4 zamknięty (Warstwa A + B), e2e zielone (run #68, 14/14) |
| `base_id` | `base-explorer/` | 🔲 **świadomie odłożone** do PO dogłębnym audycie i testach bazy (patrz sekcja "Baza pytań") |
| `game` (rozgrywka) | `control/` | 🔲 **świadomie odłożone**, osobny kompleksowy punkt razem z zapisem/przywracaniem stanu (patrz sekcja "Control") — dołączy do tego samego wspólnego klucza `game`, nie osobnego |

### Model: zasób ma stan `busy`/`free`

Jedna zasada dla wszystkiego: **jakiekolwiek użycie przełącza zasób w
`busy`**, a wszystkie POZOSTAŁE miejsca, gdzie ten sam zasób mógłby zostać
użyty, są wtedy blokowane — overlayem (gdy blokowana rzecz to WEJŚCIE na
inną stronę "wyłącznego edytora") albo alert-modalem (gdy blokowana rzecz
to JEDNORAZOWA AKCJA z listy/innej strony — rename, delete, reset,
"zagraj"). Bez wyjątku dla własnej drugiej karty tego samego użytkownika.

#### `game`

**Ustawia `busy`** (dzierży, dopóki żyje karta): `editor.js`,
`game-settings.js`, `polls.js` — ✅/🔄 zrobione. Control (rozgrywka) — 🔲
docelowo (krok 7), dziś NIE ustawia `busy` wcale (brak sygnału
żywotności) — to jedyna dziura w tym modelu, świadomie w kolejce.

**Gdy `busy`, blokowane:**
| Co | Jak |
|---|---|
| Wejście do `editor.js` | OVERLAY |
| Wejście do `game-settings.js` | OVERLAY |
| Wejście/akcja w `polls.js` (otwórz/zamknij/odpal) | OVERLAY |
| Wejście do Control ("Zagraj") | OVERLAY (docelowo, krok 7) |
| `builder.js` → zmiana nazwy (modal rename) | ALERT MODAL, akcja przerwana — ✅ zamknięte, e2e zielone (run #67) |
| `builder.js` → reset do draftu (`resetPollForEditing`) | ALERT MODAL, akcja przerwana — ✅ zamknięte, e2e zielone (run #67) |
| `builder.js` → usunięcie (`deleteGame`) | ALERT MODAL — ✅ już zrobione (krok 2.5) |
| `polls-hub.js` → anuluj task / usuń głos | ✅ **sprawdzone w kodzie, poza zakresem** — `poll_admin_delete_vote` dotyka tylko `poll_votes`/`poll_text_entries`, cancel tylko `poll_tasks`; żadne nie rusza `questions`/`answers`/`settings`/`games.status` — ta sama kategoria co głosowanie, nie wymaga busy-check |

**NIGDY nie ustawia i nie jest blokowane:** `poll-text.js`/`poll-points.js`
(głosujący — to celowe "wiele naraz"), `poll-qr.js`/`poll-go.js` (czysty
odczyt).

#### `logo`

Dwie NIEZALEŻNE warstwy `busy`:

**A. Konkretne logo #N busy**, gdy `logo-editor.js` je edytuje — 🔄
wdrożone (migracja 256, `guardResourceLock` w `btnEdit`, zwolnienie w
`closeEditor()`). Blokowane: druga karta otwierająca TO SAMO #N →
OVERLAY (`#resourceLockGuard`); usunięcie #N z listy →
`delete_resource_checked` (Warstwa 2); rename #N z listy → sprawdzenie
klient-side `isResourceBusy` przed `update_logo_checked`. ✅ e2e zielone (run #68).

**B. CAŁA pula logo usera busy**, gdy Control aktywny LUB
`game-settings.js` otwarte (dla dowolnej gry usera) — 🔄 wdrożone
(kolumna `holder_context` w `edit_locks`, `findBusyContext()` w
`resource-lock.js`, sprawdzane przed edycją/rename z listy i wewnątrz
`update_logo_checked`/`delete_resource_checked` jako Warstwa 2).
Blokowane: jakakolwiek edycja/usunięcie/rename DOWOLNEGO logo → ALERT
MODAL ("prowadzisz rozgrywkę" / "zmieniasz ustawienia rozgrywki").
`editor.js` NIE ustawia tej warstwy busy (rozstrzygnięte). ✅ e2e zielone (run #68).

#### `base`

Tylko warstwa A, bez odpowiednika warstwy B (baza nie jest referencowana
na żywo przez nic innego). `base-explorer/*` edytuje bazę #N → busy #N
(🔲 krok 6, po audycie). Blokowane: druga karta na #N → OVERLAY;
`bases.js` rename/delete #N → ALERT MODAL.

---

**Pętla `game` — ✅ ZAMKNIĘTA** (run #67, 12/12 e2e): `editor.js`,
`game-settings.js`, `polls.js` (wszystkie trzy trzymają wspólny lock),
`builder.js` (rename + reset + delete sprawdzają `busy`). Jedyna
świadomie zaakceptowana luka: Control jeszcze nie uczestniczy (krok 7).

**Krok 4 (`logo-editor.js`) — ✅ ZAMKNIĘTY, 14/14 e2e zielonych (run #68).** Warstwa
A + Warstwa B + migracja 256 (`holder_context`, `update_logo_checked`)
opisane wyżej przy zasobie `logo`. Po potwierdzeniu e2e: reszta wg
wcześniej ustalonej kolejności (baza — krok 6, Control — krok 7).

---

## Warstwa 2 — zabezpieczenie zapisu: wspólny mechanizm

W kilku miejscach powtarza się dokładnie ten sam błąd źródłowy:
Supabase/PostgREST `UPDATE ... WHERE id = X` trafiający w 0 wierszy (bo
rekord został usunięty w innym miejscu) **nie zwraca błędu** — UI musi to
sprawdzić samo (np. przez `.select()` po `.update()` i porównanie liczby
zwróconych wierszy), inaczej pokazuje fałszywe "Zapisano." mimo że nic się
nie zapisało.

Osobny, pokrewny wzorzec: **nadpisanie całego obiektu/blobu zamiast
pojedynczego pola** (np. `game-settings.js` zapisujący cały `settings`
JSONB naraz) — tu nie ma czego "wykryć" przez `.select()`, bo zapis się
udaje, tylko cicho kasuje zmiany zrobione w międzyczasie gdzie indziej.

Decyzja: zamiast łatać to osobno w każdym pliku od zera, wprowadzić **jeden
mały wspólny helper** w `js/core/` (roboczo: `updateChecked(table, match,
patch)` — robi `.update().select()` i rzuca błąd z rozpoznawalnym kodem,
gdy 0 wierszy) + **jeden wspólny klucz i18n** na komunikat "element został
zmieniony/usunięty w innym miejscu, odśwież". Wprowadzać stopniowo, przy
audycie/poprawce każdej strony, zaczynając od edytora.

---

## Kolejność pracy

0. **Ogólny mechanizm blokady** (`js/core/resource-lock.js`) — ✅ zbudowany,
   na wzorcu `guardDesktopOnly()` + `showGuestBlockedOverlay()` (patrz
   wyżej), pierwszy konsument (edytor) przetestowany e2e.
1. **Edytor gier** (`editor.js`) — ✅ **ZAMKNIĘTE**. Warstwa 1 (blokada
   `game_id`) i Warstwa 2 (`updateChecked`, fix "cichego sukcesu") obie
   zrobione, 21/21 testów e2e zielonych (run #52). Po drodze naprawione
   też dwa dodatkowe realne bugi znalezione przez testy: overlay chowany
   bez re-renderu treści (fix: `location.reload()`) i wyścig debounced/blur
   nadpisujący komunikat `ROW_GONE` (fix: `debounce().cancel()`).
2. **Ustawienia gry** (`game-settings.js`) — ✅ **ZAMKNIĘTE**. Warstwa 2
   (fix nadpisywania `settings` + nieaktualnej listy pytań) + Warstwa 1,
   3/3 testów e2e zielonych (run #56).
2.5. **Generyczny mechanizm krzyżowych blokad** (ustalony podczas
   dyskusji — patrz sekcja "Krzyżowe blokady między zasobami" niżej) —
   ✅ **ZAMKNIĘTE**. 6/6 testów e2e zielonych na produkcji (run #63):
   - `acquire_edit_lock`/`guardResourceLock` → wynik trójstanowy zamiast
     dwustanowego: `ok` / `locked` (zajęte przez kogoś) / **`gone`**
     (zasób w ogóle już nie istnieje — przegrany wyścig z usunięciem).
     Ten sam overlay co dziś (`#resourceLockGuard`), inny tekst
     (`resourceLock.goneTitle`/`goneMessage`) dla `gone`, bez pollingu
     odzyskania (to się nigdy nie "zwolni"). Migracja
     `2026-08-28_254_cross_resource_locks.sql`.
   - Generyczne RPC `delete_resource_checked(resource_type, resource_id)`
     — sprawdza i usuwa ATOMOWO w jednej transakcji (nie check-potem-
     -delete z dwóch round-tripów, bo to zostawiałoby wyścig). Dispatch
     per typ zasobu wewnątrz jednej funkcji — na razie `game` (blokuje
     przy `status='poll_open'` lub aktywnym `edit_locks` na wspólnym
     kluczu `game` — patrz korekta w "Mapa zasobów" niżej: edytor,
     ustawienia i docelowo ankieta/control dzielą JEDEN klucz, nie
     osobne) i `logo` (blokuje, gdy gra tego samego właściciela
     referencuje je w `settings.display.logoId` I ma teraz aktywny lock
     `game` — Control pominięty, bo nie ma jeszcze żadnego sygnału
     żywotności).
     Zastąpiono goły `.from(...).delete()` w `builder.js` (gra) i
     `logo-editor/js/main.js` (logo), z jawnym `alertModal` przy
     zablokowaniu zamiast cichej porażki.
   - Nowe testy: `tests/e2e/cross-resource-locks.spec.js` (6 testów —
     usuwanie gry blokowane przez `poll_open`/aktywny lock, usuwanie gry
     działa gdy nic nie blokuje, usuwanie logo blokowane przez otwarte
     ustawienia referencującej gry, usuwanie logo działa gdy nic nie
     blokuje, wykrycie `gone` przez heartbeat w edytorze niezależnie od
     tego, jaką drogą zasób zniknął).
   - Osobno, NIE zrobione w tym kroku: przegląd istniejących blokad-
     -tylko-frontowych opartych o stan trwały (znaleziona jedna:
     `canEnterEdit()`/`poll_open` w edytorze — Warstwa 1 istnieje,
     Warstwa 2 **zero**, RLS na `questions`/`answers` sprawdza wyłącznie
     `owner_id`) — to osobny problem od powyższego (stan zapisany w
     bazie, nie "żywa karta"), ale tej samej kategorii "usztywnienia" i
     wypłynie przy audycie każdej kolejnej strony, nie tylko edytora.

   Run #60 (pierwsze uruchomienie): 5/6 failed — wszystkie w testach, nie
   w aplikacji (mechanizm sam w sobie działał poprawnie, testy źle celowały
   w DOM):
   - **`.card` niejednoznaczny w builderze** — `builder.html` ma statyczny
     `<div class="card builder-card">` opakowujący `#grid` (kontener
     zakładki, nie karta gry) — goły `.card` łapał zarówno wrapper, jak i
     właściwą kartę (strict-mode violation). Fix: `#grid .card`.
   - **Domyślna aktywna zakładka w builderze to "Preparowana"** — gra
     `poll_text` w ogóle się nie renderuje, dopóki nie kliknie się
     zakładki `#tabPollText`; test tego nie robił. Fix: kliknięcie
     `#tabPollText` przed szukaniem karty.
   - **`.mSub` niejednoznaczny w logo-editorze** — `logo-editor.html` ma
     4 własne, statyczne modale (create/rename/preview/export), każdy z
     klasą `.mSub` zawsze obecną w DOM, niezależnie od `core/modal.js`.
     Fix: `.uni-modal .mSub` (scoped do dynamicznego modala
     confirmModal/alertModal).
   - **Brak jawnych timeoutów** na kliknięciach w teście "logo: działa
     normalnie" — ten sam wzorzec nieskończonego zawieszenia co
     wcześniej w `polls.spec.js` (akcje Playwrighta bez limitu na
     pojedynczą próbę). Fix: `{timeout: 10000}` na każdym kliknięciu +
     `toBeVisible` przed kliknięciem modala.
   Jedyny zielony test za pierwszym razem: wykrycie `gone` przez heartbeat
   w edytorze. Poprawki wypchnięte.

   Run #61 (po poprawkach): 3/6 passed — "działa normalnie" (gra), "logo
   zablokowane", "gone" już zielone. 3 nowe, znów wyłącznie testowe:
   - **`.mSub` niejednoznaczny też w builderze** — dokładnie ten sam
     wzorzec co w logo-editorze: `builder.html` ma własne statyczne
     modale (eksport do bazy/pliku, zmiana nazwy), każdy z zawsze obecną
     w DOM klasą `.mSub`. Fix: `.uni-modal .mSub` (te same 2 testy —
     poll_open i locked — co wcześniej naprawiły `.card`).
   - **Asynchroniczne canvas w siatce logo przesuwa kafelki** —
     `renderList()` w logo-editorze celowo renderuje najpierw kafelki
     bez podglądu, potem dorysowuje canvas asynchronicznie (kolejka) —
     inny, stały kafelek logo potrafił się znaleźć "na wierzchu" i
     przechwycić klik mimo że właściwy `.logoX` (dopasowany po dokładnym
     `data-key`) był widoczny. Fix: `{force: true}` na tym kliknięciu —
     uzasadnione, bo cel jest jednoznacznie potwierdzony przez `data-key`,
     problem jest czysto wizualny/czasowy, nie pomyłką w wyborze elementu.

   Run #62 (po poprawkach): **5/6 passed** — poll_open, locked, "działa
   normalnie" (gra), "logo zablokowane" i "gone" już zielone. Jedyny
   dalej czerwony: "logo: działa normalnie" — `{force: true}` z run #61
   okazał się niewystarczający: samo kliknięcie "przechodziło" (bez błędu
   przechwycenia), ale modal potwierdzenia nigdy się nie pojawiał —
   `force` nadal symuluje kliknięcie myszą po współrzędnych, więc trafiało
   w faktycznie zasłaniający kafelek (z hover/ruchem myszy po zatłoczonej
   siatce), nie w nasz `.logoX`. Fix: `tile.locator(".logoX").evaluate(el
   => el.click())` — wywołanie `.click()` bezpośrednio przez DOM, zero
   symulacji myszy, gwarantowane trafienie w dokładnie ten element.
   Run #63 (po poprawce): **✅ 6/6 passed na produkcji.** Mechanizm
   krzyżowych blokad (tri-state `gone`, `delete_resource_checked` dla
   `game`/`logo`) w pełni potwierdzony e2e — **moduł zamknięty**.
3. **Ankieta** (`polls.js`) — Warstwa 2 już ✅ gotowa (guard w RPC). Dołożona
   Warstwa 1 (`resourceType: "game"` — wspólny klucz z edytorem/
   ustawieniami, bo zamykanie ankiety zapisuje znormalizowane punkty do
   `answers.fixed_points`, tych samych danych co edytor/ustawienia).
   Sprawdzone (z kroku 2.5) czy `polls.js` jest konsumentem/celem
   krzyżowej relacji: usunięcie gry w trakcie `poll_open` już blokowane
   przez `delete_resource_checked` od kroku 2.5 (patrz "Zweryfikowane w
   kodzie" niżej) — nic nowego do zrobienia poza dopisaniem e2e. 🔄 e2e w
   toku.
4. **Edytor logo** (`logo-editor/`) — 🔄 wdrożone w kodzie: Warstwa 1 per
   konkretne logo + Warstwa 2 (`update_logo_checked`, rozszerzony
   `delete_resource_checked`) + reguła "cała pula logo busy przy
   Control/ustawieniach" (migracja 256, `holder_context`). ✅ e2e zielone (run #68).
5. Reszta z "Pełnej listy miejsc do audytu" niżej. `builder.js` (nie ma
   funkcji duplikowania gry — sprawdzone w kodzie, wcześniejszy wpis w
   planie był błędny) i `builder-import-export.js` (zero `.update`/
   `.upsert`/`.delete` w całym pliku — eksport tylko czyta, import zawsze
   tworzy nowe wiersze) — ✅ **oba już bezpieczne, nic do zrobienia**.
   `bases.js` — ✅ sprawdzone, rename/delete odłożone do kroku 6 (patrz
   wyżej). `generator.js` — ✅ poza zakresem (inna tabela, `market_games`).
   `polls-hub.js` — ✅ poza zakresem (nie rusza chronionych pól gry).
   **Krok 5 zamknięty** — nic więcej nie wymaga zmian poza tym co już
   odłożone do kroku 6. **Niski priorytet, bo nie dotykają żadnego z
   trzech zasobów**: `settings.js` (konto), `subscriptions.js` (płatności)
   — pominięte celowo.
6. **Baza pytań** (`base-explorer/`) — **najpierw** bardzo dogłębny audyt +
   testy (CRUD, dwóch różnych użytkowników, uprawnienia — sekcja niżej),
   **dopiero potem** Warstwa 1 (blokada `base_id`) i utwardzenie Warstwy 2
   na podstawie tego, co audyt znajdzie, PLUS usuwanie bazy przez
   `can_delete` (zapytana: czy jakiś zasób poza samą bazą się do niej
   odwołuje na żywo — do ustalenia przy audycie).
7. **Control** — odłożone jako osobny, kompleksowy punkt: blokada
   (Warstwa 1) i zapis/przywracanie stanu rozgrywki robione razem, nie
   osobno (sekcja niżej). Dzięki krokowi 2.5 zbudowanemu wcześniej, gdy
   dojdziemy do Control, cały mechanizm (`can_delete`, tri-state lock)
   już istnieje — Control tylko dopina swój sygnał żywotności jako
   kolejny `resource_type` w `edit_locks`, nie buduje niczego od zera.

---

## Pełna lista miejsc do audytu

Wszystkie strony, które faktycznie zapisują dane (na podstawie realnych
wywołań `.update/.upsert/.insert/.delete` w kodzie) i mogą ucierpieć na
otwarciu "w dwóch miejscach naraz" (dwie karty tej samej osoby, dwóch
różnych użytkowników, albo nieaktualne dane po zmianie gdzie indziej):

| Strona | Co edytuje | Status |
|---|---|---|
| `js/pages/editor.js` | pytania/odpowiedzi gry | ✅ **ZAMKNIĘTE** — 21 testów e2e (run #52, 21/21), Warstwa 1 + Warstwa 2 zrobione |
| `js/pages/polls.js` | zamykanie ankiety | ✅ **ZAMKNIĘTE** — Warstwa 2 (guard w RPC) + Warstwa 1 (`guardResourceLock`, `resourceType:"game"`, wspólny klucz z edytorem/ustawieniami) obie zrobione — ten wiersz był nieaktualny, sprawdzone bezpośrednio w kodzie 2026-09-02 |
| `js/pages/game-settings.js` | ustawienia gry (drużyny, wygląd, dźwięk, finał/rundy) | ✅ **ZAMKNIĘTE** — obie warstwy zrobione, 3/3 testów e2e (run #56, 3/3) |
| `logo-editor/js/main.js` | edytor logo (zapis do `user_logos`) | ✅ **ZAMKNIĘTE** — Warstwa 1 + Warstwa 2 (krok 4), 14/14 e2e (run #68) |
| `js/pages/builder.js` | lista gier — tworzenie/nazwa/usuwanie | ✅ **ZAMKNIĘTE** — rename/reset/delete sprawdzają busy; duplikowanie NIE istnieje (sprawdzone w kodzie) |
| `js/pages/builder-import-export.js` | import/eksport całych gier | ✅ import bezpieczny z natury (zawsze nowe wiersze); eksport dostał busy-check w `builder.js` (czyta grę/pytania/odpowiedzi w kilku zapytaniach po kolei — bez tego mógłby złapać rozjechany stan przy edycji w tym samym momencie) — ✅ e2e zielone (run #70, 16/16) |
| `js/pages/bases.js` | lista baz pytań, zarządzanie udostępnieniami | ✅ **ZAMKNIĘTE** (2026-09-02) — `renameBase` przez `updateChecked()`, `deleteBase` przez `delete_resource_checked('base', ...)` (blokuje, gdy coś w środku bazy ma aktywny lock) — patrz sekcja "Baza pytań" → "Rozszerzenie na bases.js" |
| `base-explorer/` (`actions.js`, `state.js`, `tags-modal.js`, `export-modal.js`) | edycja bazy pytań | ✅ **ZAMKNIĘTE** (2026-09-02) — audyt A/B/C, Warstwa 1 (precyzyjne locki) i Warstwa 2 (`updateChecked`/`updateCheckedMany`) zrobione — patrz sekcja "Baza pytań" |
| `js/pages/generator.js` | generator gier (AI) dla producentów/marketplace | ✅ **poza zakresem tego audytu** — sprawdzone w kodzie: pisze wyłącznie przez Edge Function do `market_games`, fizycznie innej tabeli niż `games`/`questions`/`answers` — zero możliwej kolizji z edytorem/ustawieniami/ankietą. Wcześniejszy wpis w planie był błędny |
| `js/pages/polls-hub.js` | lista ankiet (hub) — anuluje zadania ankietowe, usuwa głosy | ✅ **ZAMKNIĘTE (2026-09-02)** — krzyżowe blokady jako konsument/cel przeanalizowane, patrz sekcja "polls-hub.js: krzyżowe blokady — analiza" niżej |
| `js/pages/settings.js` | ustawienia konta użytkownika (nie gry) | 🔲 nieprzejrzane, niski priorytet — nie dotyka żadnego z trzech zasobów |
| `js/pages/subscriptions.js` | subskrypcja/płatności | 🔲 nieprzejrzane, niski priorytet — nie dotyka żadnego z trzech zasobów |
| `js/pages/login.js`, `account.js`, `confirm.js` | logowanie / migracja gościa | ✅ przerobione wcześniej (deferred guest migration) |
| `control/` | prowadzenie rozgrywki — zapis/przywracanie stanu | 🔲 **odłożone**, osobny kompleksowy punkt — patrz sekcja "Control" |

---

## Edytor gier (`js/pages/editor.js`)

✅ 20 testów e2e (`tests/e2e/editor.spec.js`) — limity, import, kolejność
(`ord`), blokady stanu gry (`poll_open`/`ready`), dwie karty naraz.

✅ Poprawka: puste pole pytania — fallback do domyślnego tekstu (tak jak
już działało dla odpowiedzi), zamiast próby zapisania pustego stringa
i cichego desyncu UI/bazy przy błędzie constraintu `questions_text_len`.

✅ Warstwa 1: blokada wejścia do edytora (`guardResourceLock`,
`resourceType: "game"` — wspólny klucz z `game-settings.js`, patrz
korekta w sekcji "Mapa zasobów" wyżej). Test e2e ("dwie karty — druga
karta jest blokowana overlayem zamiast cichej edycji, zwalnia się po
zamknięciu pierwszej") zielony na produkcji (run #50) — druga karta
dostaje overlay zamiast wejść w edycję, po zamknięciu pierwszej karty
druga wchodzi i poprawnie widzi obie pytania. Przy okazji wyłapał i
naprawił realny bug (patrz wyżej, sekcja "Warstwa 1 — ogólny mechanizm").
Dodatkowo: e2e potwierdza teraz też wykluczanie krzyżowe z
`game-settings.js` dla tego samego zasobu (`cross-resource-locks.spec.js`,
"edytor blokuje ustawienia" / "ustawienia blokują edytor").

✅ Warstwa 2: `updateQuestion`/`updateAnswer` idą teraz przez
`updateChecked()` (`js/core/db-guard.js`) — `.select()` po `.update()`
wykrywa 0 dopasowanych wierszy i rzuca `ROW_GONE` zamiast pozwalać
Supabase/PostgREST cicho "udać" zapis. Handlery zapisu pytania/odpowiedzi
łapią `ROW_GONE`, usuwają martwy element z lokalnego stanu, przerenderowują
i pokazują jawny komunikat zamiast fałszywego "Zapisano.". Niezależna
linia obrony od Warstwy 1 — chroni nawet gdy blokada zostanie ominięta
(bezpośrednie wywołanie RPC/klienta, usunięcie przez proces spoza UI).
Test e2e symuluje dokładnie to ominięcie.

Po drodze test wyłapał kolejny realny bug (niezależny od ROW_GONE): pole
tekstowe pytania/odpowiedzi miało DWA triggery zapisu — debounced (350ms
po "input") i natychmiastowy (na "blur") — bez anulowania pierwszego przez
drugi. Szybkie wpisanie tekstu i blur odpalało oba; ten z "blur" poprawnie
łapał `ROW_GONE`, ale spóźniony debounced zapis (na już zmienionym w
międzyczasie aktywnym stanie) kończył się sukcesem i cicho nadpisywał
komunikat z powrotem na "Zapisano.". Fix: `debounce()` dostał `.cancel()`,
wołane na "blur" przed natychmiastowym zapisem.

**✅ MODUŁ ZAMKNIĘTY** — 21/21 testów e2e zielonych na produkcji (run #52).
Obie warstwy ochrony zrobione i przetestowane. Następny w kolejności:
`game-settings.js`.

---

## Ustawienia gry (`js/pages/game-settings.js`) — ✅ ZAMKNIĘTE

Dwa realne problemy, gorsze niż w edytorze (oba naprawione):

1. `saveAll()` nadpisywało CAŁĄ kolumnę `games.settings` (JSONB) lokalnym
   obiektem wczytanym raz przy starcie strony — zero kontroli wersji.
   **Fix**: CAS (compare-and-swap) na całej kolumnie przez `updateChecked`
   (`js/core/db-guard.js`) — `.eq("settings", lastSavedSettingsRaw)` jako
   dodatkowy warunek `WHERE`. 0 dopasowanych wierszy = ktoś inny zapisał w
   międzyczasie → `ROW_GONE`, pokazywany jako jawny konflikt
   (`gameSettings.saveConflict`) zamiast cichego nadpisania.
   `lastSavedSettingsRaw` aktualizowane po każdym udanym zapisie.
2. `allQuestions` (lista pytań do wyboru finału/kolejności rund) wczytywana
   raz przy starcie — martwe id usuniętego gdzie indziej pytania mogło
   zostać zapisane do `settings`. **Fix**: `saveAll()` na starcie odświeża
   żywą listę pytań (`loadQuestions`) i filtruje `questions.final`/`rounds`
   z id, których już nie ma, PRZED jakąkolwiek walidacją/zapisem.

✅ Warstwa 1: blokada wejścia (`resourceType: "game"` — **wspólny klucz
z edytorem**, korekta względem wcześniejszej wersji tej sekcji: otwarcie
ustawień BLOKUJE edytor tej samej gry i odwrotnie, bo oba dotykają tego
samego zasobu — patrz "Mapa zasobów" wyżej), dokładnie ten sam
`guardResourceLock` co w edytorze.

✅ Testy e2e (`tests/e2e/game-settings.spec.js`, 3 testy: blokada dwóch
kart, konflikt CAS przy zapisie, filtrowanie martwego id pytania finału)
— **3/3 zielone na produkcji (run #56)**.

Pierwszy realny bug znaleziony przez testy — **regresja na produkcji**:
`updateChecked()` (`js/core/db-guard.js`) robił `.eq(col, val)` z `val`
będącym obiektem (`settings: lastSavedSettingsRaw` w CAS) — supabase-js
dla nie-prymitywów w `.eq()` robi zwykłe `String(val)`, czyli dosłowne
`"[object Object]"` zamiast JSON, co PostgREST odrzucał jako
`invalid input syntax for type json` (HTTP 400). Efekt: **każdy** zapis
ustawień gry był zepsuty na produkcji od razu po wdrożeniu Warstwy 2, nie
tylko scenariusz testowy. Fix: `updateChecked` teraz jawnie
`JSON.stringify()`-uje wartości obiektowe przed `.eq()` — PostgREST i tak
rzutuje string filtra na typ kolumny (jsonb), więc porównanie jest po
wartości, nie po tekście. Potwierdzone testem B (CAS) w run #56.

Drugi bug znaleziony przez testy — tym razem w samym teście, nie w
aplikacji: testy B i C sprawdzały `#gsUnsavedBadge` `toBeHidden()` zaraz
po kliknięciu Save, ale nic wcześniej nie ustawiało `isDirty`, więc odznaka
była ukryta od początku — asercja przechodziła, zanim asynchroniczny zapis
w ogóle się skończył (test czytał bazę zbyt wcześnie). Fix: czekanie na
`#btnSaveAll` przełączające się `disabled → enabled` (realny sygnał
zakończenia z własnego `try/finally` `saveAll()`, niezależny od stanu
dirty).

🔲 **Brakująca funkcja — blokada zmiany ustawień gdy gra jest w toku**:
zależna od Control, więc szczegóły i implementacja przeniesione do sekcji
"Control" niżej (nie robimy tu prowizorki na skróty). Na razie priorytet
to dokończenie testów Warstwy 1/2 dla tego modułu.

**✅ MODUŁ ZAMKNIĘTY** — 3/3 testów e2e zielonych na produkcji (run #56).
Obie warstwy ochrony zrobione i przetestowane. Następny w kolejności:
`polls.js`.

✅ **Rozszerzenie testów** — dopisane (`tests/e2e/game-settings.spec.js`,
11 nowych testów, 14 razem z A/B/C): drużyny (persystencja po
przeładowaniu), wygląd (zmiana koloru przez modal, reset sekcji), dźwięk
(walidacja "Własny bez pliku" blokuje zapis, zmiana głośności), finał
(walidacja "pick wymaga 5", wybór 5/6 + limit UI + wykluczenie z rund),
rundy (reorder strzałką), ustawienia gry (niepoprawny format
multiplikatorów nie nadpisuje), reset wszystkich ustawień, przycisk
Wstecz z niezapisanymi zmianami. Nieobjęte świadomie: tryb modalny
(`control-new`) — wymaga osobnej strony-hosta do symulacji iframe, niższy
priorytet.

Pierwsze uruchomienie (run #57): 9 passed, 1 flaky (kolor modal — jeden
nietłumaczony hiccup, przeszedł na retry, brak powtórki wzorca — flaka,
bez akcji), 4 failed. Diagnoza:

- **3 testy (finał×2, rundy) zawiesiły się dokładnie na `test.setTimeout`
  (60s)** — błąd testu, nie aplikacji: `.check()` na radiu z toggle-grupy
  (`gsHasFinal`/`gsFinalMode`/`gsRoundsMode`) czekał w nieskończoność, bo
  natywny `<input>` tych przełączników jest celowo niewidoczny
  (`.toggle-item input{opacity:0;width:0;height:0}` w
  `game-settings.css:342` — widoczny jest sąsiedni `.toggle-slider`), a
  akcje Playwrighta nie mają domyślnego limitu na pojedynczą próbę (ten
  sam mechanizm zawieszeń, co wcześniej w `polls.spec.js`). Fix: klik na
  `.toggle-item` (etykietę zawierającą input), nie na sam `<input>` —
  dokładnie to, co robi realny użytkownik klikając widoczny slider.
- **Prawdziwy błąd aplikacji, znaleziony przez test "Wstecz"**: odznaka
  "Niezapisane zmiany" (`#gsUnsavedBadge`) nigdy się nie pokazuje. `.badge`
  (`base.css`) ma domyślnie `display:none`, widoczne tylko wewnątrz
  `.has-badge` (wzorzec używany wszędzie indziej w projekcie —
  `builder.js`, `topbar-controller.js`, `polls-hub.js` — przełącznik
  liczbowej kropki na przycisku). `game-settings.js`'s `markDirty()`/
  `clearDirty()` przełączają tylko klasę `hidden` na samym badge'u, nigdy
  nie dotykając `.has-badge` — więc mimo poprawnego zdjęcia `hidden`,
  `.badge{display:none}` z `base.css` i tak wygrywa. Efekt: użytkownik
  nigdy nie widzi wizualnego sygnału "masz niezapisane zmiany" (same
  potwierdzenia przy wyjściu/zamknięciu nadal działają poprawnie, bo
  sprawdzają zmienną JS `isDirty`, nie CSS). Fix: dedykowana reguła
  `.gs-unsaved-badge:not(.hidden){display:inline-flex}` w
  `game-settings.css`, wyższa specyficzność niż bazowe `.badge`.

Poprawki wypchnięte, run #58: 11 passed, 1 flaky (drużyny — `saveAndWait`
złapał zapis szybszy niż okno assercji `toBeDisabled`, przeszedł na
retry, pojedynczy incydent — flaka, bez akcji), 2 failed:

- **"finał 5/6" — błąd testu**: `questions.rounds` wypełnia się dopiero
  przy realnym wejściu w zakładkę Rundy (`renderRounds()`), a test nigdy
  jej nie odwiedzał — asercja `toHaveLength(1)` była błędnym założeniem
  (realnie `rounds` zostawało puste, bo `roundsQuestionsMode` zostaje
  "random" i tak je ignoruje w rozgrywce). Fix: test teraz faktycznie
  wchodzi w zakładkę Rundy (przełącza na "pick", triggeruje
  auto-uzupełnienie) przed zapisem, żeby realnie sprawdzić wykluczenie
  pytań finałowych z puli rund, zamiast zgadywać stan który nigdy nie
  powstał.
- **"Wstecz" — błąd testu (cleanup)**: `deleteGame()` w `finally` padał na
  `/builder` z "Cannot read properties of undefined (reading 'from')" —
  `toHaveURL()` łapie tylko zmianę adresu, nie czeka aż `window.__sbClient`
  zdąży się ustawić na nowej stronie. Fix: `page.waitForLoadState(
  "networkidle")` po nawigacji, przed końcem testu.

Run #59 (po poprawkach z run #58): 13/14 passed — "finał 5/6" i "Wstecz"
już zielone, ale **ten sam wyścig `saveAndWait`/`toBeDisabled`**, wcześniej
uznany za pojedynczą flakę przy "drużynach", odpalił się teraz
konsekwentnie 2/2 na teście "kolor". Przy dwóch trafieniach to już nie
flaka do zignorowania, tylko realna słabość samego helpera: przy szybkim
zapisie całe przejście `disabled→enabled` potrafi się zamknąć, zanim
Playwright w ogóle zdąży sprawdzić stan `disabled` — asercja startuje już
po powrocie do `enabled` i nigdy go nie widzi. Fix: `saveAndWait()`
(i wszystkie równoważne miejsca w testach B/C/reset) czeka teraz na sam
**network response** zapisu (`PATCH /rest/v1/games`) przez
`page.waitForResponse()`, nie na stan przycisku — response nie da się
"przegapić" w ten sposób, bo Playwright przechwytuje go na poziomie
stosu sieciowego przeglądarki, nie przez polling DOM. Wypchnięte, czeka
na kolejne uruchomienie.

---

## Edytor logo (`logo-editor/`) — 🔲 do zrobienia

Znalezione przy okazji (nie dogłębny audyt, tylko obserwacja przy pytaniu
o komunikaty w projekcie):

- `logo-editor/js/draw.js:3060` (przycisk "Wyczyść") — jedyne miejsce w
  całym projekcie używające natywnego `confirm()` przeglądarki, jako
  fallback gdy `confirmModal()` (`core/modal.js`) rzuci wyjątek:
  ```js
  try { ok = await confirmModal({ text: t("logoEditor.draw.confirmClear") }); }
  catch(e) { ok = confirm(t("logoEditor.draw.ui.confirmClearFallback")); }
  ```
  Do sprawdzenia przy audycie: czy `confirmModal()` faktycznie rzuca w
  tym kontekście (kiedy i dlaczego), i czy fallback na natywny dialog jest
  nadal potrzebny, czy to relikt z wcześniejszego etapu.

Reszta (zapis do `user_logos`, Warstwa 1 blokady `logo_id`) — patrz wpis
w "Pełnej liście miejsc do audytu" i "Mapie zasobów" wyżej, kolejność
pracy: po `game-settings.js` i `polls.js`.

---

## Baza pytań (`base-explorer/`) — bardzo dogłębny audyt + współdzielenie — ✅ ZAMKNIĘTE (2026-09-02)

### Decyzja po audycie: precyzyjne blokady każdego elementu — ✅ zrobione (2026-09-01/02)

Wybrany został wariant zachowujący równoległą pracę nad różnymi elementami,
zamiast jednej blokady całej bazy. Klucze to `base_question` (treść,
odpowiedzi, punkty, folder i przypisania tagów), `base_folder` (nazwa,
położenie i kaskada usunięcia) oraz `base_tag` (nazwa, kolor i usunięcie).
Operacja obejmująca kilka elementów zajmuje posortowany zestaw blokad i przy
pierwszym konflikcie zwalnia już zajęte, dzięki czemu dwie karty nie tworzą
deadlocka.

Wiążąca specyfikacja momentu/zakresu blokady (ustalona z użytkownikiem):
1. Blokada zajmowana przy rozpoczęciu rzeczywistej edycji, nie przy samym
   wejściu na widok.
2. Konflikt = operacja zablokowana + komunikat; bez wymuszonego przejęcia.
3. Pytanie: blokada od otwarcia do zamknięcia/anulowania modala oraz na
   czas rename/tagowania/przenoszenia/usuwania.
4. Usunięcie folderu blokuje CAŁE poddrzewo (foldery + zagnieżdżone
   pytania), nie tylko sam folder — operacje na potomkach muszą
   respektować blokadę przodka.
5. Przeniesienie/reorder folderu blokuje całe przenoszone poddrzewo oraz
   miejsce docelowe potrzebne do bezpiecznej zmiany rodzica.
6. Przypisanie tagu do pytań blokuje zmieniany tag oraz wszystkie
   zmieniane pytania.
7. Zarządzanie tagiem (rename/kolor) blokuje wyłącznie ten jeden tag, nie
   wszystkie tagi widoczne w modalu przypisywania.
8. Tworzenie nowego elementu i kolizje `ord` przy równoczesnym INSERT nie
   dostają blokady (nowy wiersz nie ma jeszcze UUID) — to świadomie
   odłożona pozycja Warstwy 2 (atomowy RPC), nie tego etapu. To samo
   dotyczy kopiowania/duplikowania (źródło tylko odczytywane).
9. Utrata uprawnień w trakcie sesji (rola zdegradowana/dostęp cofnięty) —
   nieudany heartbeat (RPC zwraca `forbidden`) odbiera blokadę lokalnie
   (`lease.ok = false`) i blokuje kolejną próbę zapisu komunikatem,
   zamiast cicho kontynuować.

Punkty 4 i 5 są zrealizowane BEZ osobnego mechanizmu chodzenia po
łańcuchu przodków: każda operacja strukturalna na folderze (delete/move/
reorder) zawsze rozwija się do PEŁNEGO poddrzewa (wspólny helper
`collectSubtreeLockResources()` w `actions.js`) przed zajęciem blokad —
skoro operacja na folderze X zajmuje blokady na wszystkich jego
potomkach, każda równoległa próba dotknięcia dowolnego potomka trafia w
kolizję na tym samym kluczu tabeli `edit_locks`.

Punkt 6/7 wymagał korekty względem pierwszej wersji implementacji: modal
przypisywania tagów (`tags-modal.js`, tryb "assign") pierwotnie blokował
WSZYSTKIE tagi widoczne w modalu na cały czas otwarcia — to nadmiarowe i
niezgodne ze specyfikacją. Naprawione: przy otwarciu blokowane są tylko
PYTANIA (znane od razu), a blokada TAGU jest zajmowana dopiero przy
Zapisz, tylko dla tagów faktycznie przełączonych (`m.dirty`), i zwalniana
zaraz po zapisie — niezależnie od blokady pytań, która żyje przez cały
czas modala.

Migracja 257 rozszerza `can_edit_locked_resource()`/`acquire_edit_lock()`
o `base_question`/`base_folder`/`base_tag`, generyczne scoped leases
(`acquireResourceLock`/`acquireResourceLocks`) doszły do
`resource-lock.js`. Przy tej okazji poprawiony też pre-istniejący brak w
heartbeacie: ani `guardResourceLock`, ani (teraz) scoped warianty nie
reagowały na `forbidden` z RPC (tylko na `gone`) — dodane analogiczne
traktowanie obu w obu wariantach (punkt 9 wyżej).

Ostatni wynik E2E zapisany w tym planie przed implementacją locków to run
#77: 49 passed / 4 failed / 1 flaky, poprawione w `f997d8d`. Run #78
(pierwszy po tamtej poprawce) miał jeszcze jeden osobny, niezwiązany z
lockami failing test (`long-press anulowany przez ruch palca` w
`mobile.js`/`base-explorer.spec.js`).

**Run #79** (commit `fbee7cac` + auto-bumpy botów): **57/58 passed**.
Wszystkie trzy nowe testy lockowania (blokada pytania blokuje wejście do
edycji i zwalnia się po release; blokada zagnieżdżonego pytania blokuje
usunięcie CAŁEGO folderu — potwierdza rozwinięcie do poddrzewa; blokada
jednego, niedotykanego tagu NIE przeszkadza zapisać innego tagu w tym
samym modalu przypisywania — potwierdza poprawkę zakresu blokady tagów)
przeszły za pierwszym razem. Jedyny czerwony: ten sam `long-press
anulowany przez ruch palca` co w #78 — **próba naprawy z tej rundy
(świeże `document.querySelector()` przed każdym z trzech dispatchy +
dodany `pointerup`) NIE pomogła**, identyczny błąd (`.context-menu`
`count=1` zamiast `0`, deterministycznie w obu próbach). Statyczna
analiza `mobile.js`'s `addLongPress()` po raz drugi nie znalazła w nim
błędu — dodana tymczasowa diagnostyka (`console.log("[longpress-diag]"
...)` w `pointerdown`/`pointermove`/`pointerup`/`cancel()`, projekt i tak
przekazuje `console.*` do logów CI przez mechanizm `[e2e-diag]`) do
zdiagnozowania w KOLEJNYM runie, zamiast zgadywać trzeci raz.

**Run #80** (`spec_filter` = pełny `base-explorer.spec.js` + nowy
`bases.spec.js`): 64/66. Diagnostyka z run #79 w ogóle się nie pojawiła w
logach — `login.js`'s `instrumentPage()` przekazuje do `[e2e-diag]`
WYŁĄCZNIE `console:error`/`console:warning`, nie `console:log` — więc
`console.log(...)` był całkowicie niewidoczny. Przełączone na
`console.warn(...)`. Druga czerwona pozycja w tym runie
(`bases.spec.js`'s "zmiana nazwy bazy usuniętej...") okazała się błędem
w SAMYM TEŚCIE (zły szyk słów w regexie dopasowującym komunikat), nie w
aplikacji — log pokazał, że `renameBase()`/`updateChecked()` zadziałały
poprawnie; regex poprawiony.

**Run #81** (`spec_filter` zawężony do tych dwóch testów, zgodnie z
nową zasadą "odpalamy tylko to co dotyczy zmiany lub wcześniej nie
przeszło" — grep po fragmentach nazw obu testów naraz): `bases.spec.js`
✅, long-press dalej czerwony, ale tym razem **diagnostyka faktycznie
zadziałała i dała jednoznaczną odpowiedź**: sekwencja
`pointerdown → pointermove(dist:40, willCancel:true) → cancel()(timer
was: true) → pointerup` przebiega DOKŁADNIE poprawnie, `"TIMER FIRED"`
nigdy się nie pojawia -- callback `addLongPress()` nigdy się nie odpala.
Menu mimo to się otwiera, więc źródłem NIE jest ten kod. Wniosek:
przeglądarka ma WŁASNĄ, niezależną od tego JS-a detekcję przytrzymania
dotyku i potrafi sama wygenerować natywne zdarzenie `contextmenu` na tym
elemencie z WŁASNYM progiem czasowym — a listener tłumiący natywne menu
w `addLongPress()` sprawdzał dotąd tylko `fired` (nasz long-press się
udał), więc gdy MY uznaliśmy gest za przewijanie (`fired=false`),
natywne zdarzenie przechodziło dalej do zwykłego, desktopowego listenera
`contextmenu` na tym samym elemencie (`actions.js`) i menu się otwierało
mimo poprawnie anulowanego naszego timera. Naprawione: tłumienie
obejmuje teraz też okno czasowe od `pointerdown` na dotyku/rysiku
(`Date.now() - lastTouchDownAt < LONG_PRESS_MS + 300`), niezależnie od
tego czy dany gest zakończył się naszym long-pressem czy przewijaniem —
diagnostyka usunięta, zastąpiona realną poprawką. To wyjaśnia też,
dlaczego DWIE wcześniejsze próby naprawy samego TESTU (run #78, #79)
nie mogły zadziałać — problem nigdy nie był w teście ani w timingu
dispatchowania zdarzeń, tylko w zakresie warunku tłumienia natywnego
menu w aplikacji.

**Run #82**: ta sama poprawka (okno czasowe) DALEJ nie wystarczyła,
identyczny błąd. Prawdziwa przyczyna okazała się być KOLEJNOŚĆ
REJESTRACJI listenerów, nie logika warunku: `wireActions()` rejestruje
zwykły, desktopowy listener `contextmenu` (otwiera menu bezwarunkowo,
`e.preventDefault()` na starcie) na `listEl`/`treeEl`/`tagsEl` **przed**
wywołaniem `addLongPress()` na tym samym elemencie (linie 4573/3140/3369
vs 4589/4601/4614 w `actions.js`) — listenery tego samego typu na tym
samym elemencie odpalają się w kolejności rejestracji, więc desktopowy
opener zawsze wygrywał wyścig i otwierał menu, zanim tłumienie w
`addLongPress()` (zarejestrowane później) zdążyło zawołać
`preventDefault()`/`stopPropagation()` — a to i tak nie cofa już
wykonanego, wcześniejszego listenera na tym samym elemencie. Naprawione
przez rejestrację tłumienia w fazie **capture** (`addEventListener(...,
true)`) zamiast bubble — capture na danym elemencie zawsze wykonuje się
przed KAŻDYM listenerem bubble na nim, niezależnie od kolejności
rejestracji w kodzie, więc to rozwiązanie jest odporne na przyszłe
zmiany kolejności w `wireActions()`, nie tylko na obecny układ linii.

**Run #83** (commit `581a2a12`, `spec_filter` = `base-explorer.spec.js
--grep "long-press|usuniętego tuż przed Zapisz"`): capture-phase z run
#82 DALEJ nie wystarczyła dla testu "anulowany przez ruch palca"
(identyczny błąd, `.context-menu` count=1), plus NOWY, osobny błąd w
jednym z 3 testów Warstwy 2 (F2 rename pytania). Oba naprawione:

- **Long-press**: capture-phase (run #82) zakładała, że `listEl`
  (element z OBOMA listenerami "contextmenu" — naszym tłumiącym i
  desktopowym openerem) jest tylko ANCESTOR-em zdarzenia, którego target
  to `.row`-wiersz — wtedy capture rzeczywiście wygrywa z bubble. Ale gdy
  dany element JEST bezpośrednim `target`-em zdarzenia (tzw.
  `AT_TARGET`), DOM nie rozróżnia capture/bubble w ogóle — WSZYSTKIE
  listenery na nim (obu typów) odpalają się w kolejności REJESTRACJI. Bo
  desktopowy opener jest rejestrowany PRZED `addLongPress()` w kodzie
  (patrz wyżej), w tym trybie i tak wygrywał, capture-flag nie miał
  znaczenia. Naprawione przez **usunięcie całego wyścigu**: `addLongPress()`
  w `mobile.js` już NIE rejestruje własnego listenera "contextmenu" —
  zamiast tego eksportuje `isTouchContextMenuWindow(el)` (true przez
  `LONG_PRESS_MS + 300` ms od ostatniego dotykowego `pointerdown` na tym
  elemencie, niezależnie czy nasz long-press "się udał" czy został
  anulowany ruchem — dokładnie ten sam warunek co poprzednio, tylko bez
  osobnego listenera). Desktopowy opener w `actions.js` (3 miejsca:
  `listEl`/`treeEl`/`tagsEl`) woła ten helper jako PIERWSZĄ instrukcję i
  wychodzi wcześniej, jeśli `true` — jest to teraz JEDYNY listener
  "contextmenu" na każdym z tych elementów, więc pytanie "który wygra
  wyścig" przestaje w ogóle istnieć (nie ma z kim wygrywać).
- **F2 rename pytania → ROW_GONE**: modal pokazywał ogólny komunikat
  "Nie udało się zmienić." zamiast `resourceLock.goneMessage`. Przyczyna:
  `renameByKey()`'s gałąź `"q:"` (`actions.js`) NAJPIERW robi osobny
  odczyt świeżego payloadu (`.select("payload").eq("id",id).single()`),
  ZANIM w ogóle dojdzie do `updateChecked()` — gdy pytanie już nie
  istnieje (usunięte tuż przed Zapisz, jak w teście), `.single()` na 0
  wierszach rzuca PostgREST-owy `PGRST116` ("Cannot coerce the result to
  a single JSON object"), który NIE jest `ROW_GONE` i leci dalej jako
  zwykły, nieobsłużony błąd do ogólnego catch-a. `updateChecked()` na tej
  gałęzi w ogóle nie zdążał się wykonać. Naprawione: `.single()` →
  `.maybeSingle()` + jawne sprawdzenie `if (!fresh)` pokazujące
  `resourceLock.goneMessage` — ten sam komunikat co przy `ROW_GONE` z
  samego UPDATE-u niżej, tylko wykryty wcześniej, na etapie odczytu.
- Trzeci czerwony wynik tego runu ("Edytuj tag" ROW_GONE) okazał się
  jednorazowym flakiem infrastruktury (`page.waitForURL(/builder/)`
  timeout PODCZAS LOGOWANIA, przed dotarciem do właściwego testu) —
  przeszedł na retry #1 bez żadnej zmiany w kodzie, niepowiązany z
  aplikacją.

**Run #84** (ten sam `spec_filter`): F2 rename, Ctrl+E, edycja tagu i
"long-press otwiera menu" — WSZYSTKIE zielone (naprawy z run #83
potwierdzone). "long-press anulowany przez ruch palca" DALEJ czerwony,
identyczny objaw. Zamiast zgadywać po raz kolejny, dodana tymczasowa
diagnostyka `console.warn("[lp-diag]...")` w trzech punktach
(`addLongPress()`'s timer, `pointermove`'s `cancel()`, i na wejściu
`listEl`'s listenera "contextmenu") i odpalona w kolejnym, zawężonym do
JEDNEGO tego testu runie.

**Run #85** (`spec_filter` = `base-explorer.spec.js --grep "long-press
anulowany"`) — diagnostyka dała OSTATECZNĄ, jednoznaczną odpowiedź:
jedyny log jaki się pojawił w OBU próbach to `[lp-diag] pointermove
cancel: dist=40 timerWas=true` — nasz `pointermove` poprawnie anulował
AKTYWNY timer. Log `"TIMER FIRED"` NIGDY się nie pojawił (nasz callback
nigdy nie wywołał menu) i log `"[lp-diag] contextmenu event on
listEl"` (na wejściu JEDYNEGO listenera "contextmenu") RÓWNIEŻ nigdy się
nie pojawił — czyli żadne zdarzenie "contextmenu", natywne ani nasze,
nigdy nie dotarło do żadnego z tych dwóch miejsc. Mimo to
`.context-menu` dalej pokazywało count=1.

**Prawdziwa przyczyna, znaleziona dzięki tej dwuznaczności**: `.context-menu`
to nie efemeryczny element tworzony przy otwarciu menu — to STATYCZNY
`<div id="contextMenu" class="context-menu" hidden></div>` obecny w
`base-explorer.html` OD ZAŁADOWANIA STRONY. `showContextMenu()`/
`hideContextMenu()` (`context-menu.js`) przełączają wyłącznie atrybut
`hidden` i `innerHTML` tego jednego węzła — nigdy go nie tworzą ani nie
usuwają. `page.locator(".context-menu").toHaveCount(0)` dopasowuje po
klasie CSS, niezależnie od atrybutu `hidden` — więc ta asercja **nie
mogła przejść NIGDY, niezależnie od poprawności aplikacji**. To
wyjaśnia, dlaczego żadna z wcześniejszych, skądinąd słusznych napraw
(run #81 okno czasowe, run #82 capture-phase, run #83 jeden listener
zamiast wyścigu) nigdy nie dawała rezultatu na TYM konkretnym teście —
gonili prawdziwy, ale niezwiązany z tym testem problem (błąd w teście, a
nie w aplikacji). Naprawione: asercja zmieniona na
`await expect(page.locator(".context-menu")).toBeHidden()` — sprawdza
widoczność (respektuje `hidden`), nie liczność węzłów w DOM. Diagnostyka
`[lp-diag]` usunięta z `mobile.js`/`actions.js` (spełniła swoją rolę);
sam refaktor "jeden listener zamiast wyścigu" z run #83 pozostawiony —
to wciąż uzasadnione uproszczenie/zabezpieczenie na wypadek prawdziwego
touchscreena, tylko nie było źródłem TEGO konkretnego, zawsze czerwonego
wyniku.

### Rozszerzenie na `bases.js` (hub z listą baz) — ✅ zrobione (2026-09-02)

Warstwa 1/2 opisana wyżej chroni to, co dzieje się WEWNĄTRZ już otwartej
bazy w base-explorerze. Osobna, wcześniej niezaadresowana luka: sama
strona-hub `bases.js` (lista "Moje"/"Udostępnione", przyciski zmiany
nazwy/usunięcia całej bazy) nie miała ŻADNEJ ochrony ani ŻADNEGO
pokrycia e2e — `resourceType: "base"` istniał w schemacie od dawna, ale
nie był używany w żadnym miejscu kodu.

Ryzyko: `qb_questions`/`qb_categories`/`qb_tags`/`question_base_shares`
mają `ON DELETE CASCADE` od `question_bases` — usunięcie całej bazy przez
właściciela na `bases.html`, podczas gdy `editor` ma akurat otwarty modal
edycji pytania (trzyma `base_question` lock) w tej samej bazie, kasowałoby
to pytanie spod ręki edytującego bez żadnego ostrzeżenia.

Naprawione, tym samym wzorcem co już istniejący dla gry/logo:
- **Migracja 258** — nowa gałąź `p_resource_type = 'base'` w
  `delete_resource_checked()`: właściciel-only (RLS i tak to wymusza, ale
  RPC sprawdza jawnie), blokuje usunięcie, jeśli KTÓRYKOLWIEK
  `base_question`/`base_folder`/`base_tag` należący do tej bazy ma teraz
  aktywny wiersz w `edit_locks` (sprawdzane przez `EXISTS` po
  `qb_questions.base_id`/`qb_categories.base_id`/`qb_tags.base_id`, bo
  `edit_locks` nie trzyma `base_id` bezpośrednio).
- `bases.js`'s `deleteBase()` woła teraz `sb().rpc("delete_resource_checked",
  {p_resource_type:"base", ...})` zamiast gołego `.delete()` — dokładnie
  ten sam kształt co usuwanie gry w `builder.js`. Nowy komunikat
  `bases.delete.inUse` (pl/en/uk).
- `bases.js`'s `renameBase()` przepisany na `updateChecked()`
  (`js/core/db-guard.js`) — `ROW_GONE` (baza usunięta w międzyczasie)
  pokazuje teraz `resourceLock.goneMessage` zamiast cichego "sukcesu"
  bez efektu.

Nowy plik `tests/e2e/bases.spec.js` (strona nie miała wcześniej żadnego):
codzienna funkcjonalność (tworzenie przez kafelek "+", zmiana nazwy przez
podwójny klik, usunięcie przez "x"+potwierdzenie, widoczność udostępnionej
bazy u DRUGIEGO, prawdziwego konta z właściwą rolą) + dwa testy ochrony
(usunięcie zablokowane, gdy drugi user edytuje coś w środku — i explicit
kontrola negatywna, że samo współdzielenie/istnienie treści BEZ aktywnej
blokady nie przeszkadza usunąć; zmiana nazwy bazy usuniętej tuż przed
zapisem pokazuje komunikat zamiast cichego sukcesu).

**Kolejność: najpierw pełny audyt i testy (A/B/C niżej), Warstwa 1
(precyzyjne blokady elementów opisane wyżej) i utwardzenie Warstwy 2
dopiero na końcu** — świadomie odłożone, żeby ochrona była oparta na tym,
co audyt faktycznie znajdzie, a nie zgadywana z góry.

Baza pytań ma realny, wielo-użytkownikowy model uprawnień w bazie danych
(`question_base_shares.role`: `viewer` | `editor`, enum
`base_share_role`), egzekwowany przez RLS na `qb_questions`/
`qb_categories`/`qb_tags` przez funkcje `base_can_access()` (SELECT —
właściciel LUB dowolna rola współdzielenia) i `base_can_edit()`
(INSERT/UPDATE/DELETE — właściciel LUB rola `editor`, `viewer` odrzucany
na poziomie bazy, nie tylko UI). Warto sprawdzić realnie na żywo, nie
tylko czytając RLS. `question_bases_update` (zmiana samej nazwy bazy)
dodatkowo dopuszcza WYŁĄCZNIE właściciela — nawet `editor` tego nie
zmieni; to osobny, węższy przypadek do sprawdzenia.

Uwaga do Warstwy 1 dla bazy: blokada całej bazy na raz byłaby prostsza,
ale wykluczałaby legalną jednoczesną pracę właściciela + `editor`-a nad
różnymi pytaniami w tej samej bazie — zdecydowane (patrz sekcja "Decyzja
po audycie" wyżej) na precyzyjne blokady per element zamiast tego.

### Warstwa 2 dla base-explorera — ✅ zrobione (2026-09-02)

Ostatnia otwarta dziura w module: `updateChecked()`/`ROW_GONE` (ten sam
wzorzec co już zamknięty dla `editor.js` — patrz sekcja "Edytor gier")
nie był używany nigdzie w `actions.js`/`tags-modal.js` — gołe
`.from(...).update(...)` cicho "udawały" zapis, gdy element zniknął w
międzyczasie (np. Warstwa 1 ominięta przez bezpośrednie wywołanie
klienta/RPC, albo usunięty zanim ktokolwiek zdążył zająć blokadę).
Naprawione, podmienione na `updateChecked()`
(`js/core/db-guard.js`) w pięciu miejscach:
- `renameByKey()` — obie gałęzie (folder i pytanie).
- `state._api.openQuestionModal` — zapis `payload` po Zapisz w modalu.
- `tags-modal.js`'s `saveL2Tag()` — gałąź `mode:"edit"` (rename/kolor
  istniejącego tagu; tworzenie nowego tagu to INSERT, nie ma tego
  problemu).

Dwa miejsca operują na WIELU wierszach naraz (`.in("id", [...])`), gdzie
`updateChecked()`'s pojedyncze `.eq()` nie pasuje — dodany nowy,
współdzielony wariant `updateCheckedMany(table, ids, patch)` (też w
`db-guard.js`): porównuje liczbę zwróconych wierszy z liczbą żądanych id,
wykrywając częściowy, cichy brak skutku (np. połowa przenoszonego
zaznaczenia zniknęła w międzyczasie). Użyty w:
- `moveItemsTo()` — bulk update `qb_questions.category_id` i
  `qb_categories.parent_id`.
- `applyCategoryOrder()` — per-wiersz w istniejącej pętli (`ord`+
  `parent_id`), czyli de facto `updateChecked()` w każdej iteracji.

Wszystkie miejsca łapią `ROW_GONE` i pokazują
`t("resourceLock.goneMessage")` (ten sam komunikat co Warstwa 1 dla
`gone`) zamiast fałszywego potwierdzenia zapisu. Testy e2e: nowy opis
"Warstwa 2 (updateChecked, ROW_GONE)" w `base-explorer.spec.js` — 3
testy pokrywające 3 różne kształty wywołania (`updateChecked` przez F2 i
przez question-modal, `saveL2Tag`'s edit branch) symulując ominięcie
blokady bezpośrednim usunięciem tuż przed kliknięciem Zapisz.
Świadomie NIE dodany osobny test dla `updateCheckedMany()`
(`moveItemsTo`/drag&drop) — symulacja D&D w tym pliku jest jednym,
atomowym `page.evaluate()` (dragstart→drop bez przerwy, patrz komentarz
przy `simulateDragDrop()`), bez naturalnego miejsca na wstrzyknięcie
usunięcia MIĘDZY zajęciem blokady a samym zapisem; pokrycie przez
identyczność wzorca kodu z już przetestowanym `updateChecked()`
uznane za wystarczające.

`deleteItems`/`deleteTags`/`applyTagToDraggedItems` świadomie NIE
dostały tego traktowania — DELETE trafiający w 0 wierszy nie jest
"cichym sukcesem" (nic do skasowania = nic się nie stało, inna kategoria
ryzyka niż nadpisanie przy UPDATE), a INSERT (przypisanie tagu) nie ma
analogicznego trybu cichej porażki.

**Baza pytań (`base-explorer/` + `bases.js`) — ✅ moduł w pełni zamknięty
i potwierdzone zielonym CI (run #86, 2026-09-02)**: audyt (A/B/C),
Warstwa 1 (precyzyjne locki per pytanie/folder/tag, rozszerzone na
`bases.js`'s rename/delete) i Warstwa 2 (`updateChecked`/
`updateCheckedMany`) — cały kod + testy zacommitowane, wypchnięte i
zielone. Run #83/#84/#85 (patrz opis wyżej) znalazły i naprawiły PO
KOLEI: long-press race (run #83, pojedynczy listener zamiast wyścigu),
F2 rename ROW_GONE (run #83, `.maybeSingle()`), i na końcu (run #85) samą
przyczynę uporczywie czerwonego testu "long-press anulowany przez ruch
palca" — błędną asercję w SAMYM TEŚCIE (`toHaveCount(0)` na statycznym,
zawsze obecnym w DOM elemencie `#contextMenu`, zamiast `toBeHidden()`).
Aplikacja przez cały czas działała poprawnie w tym scenariuszu — żadna z
wcześniejszych aplikacyjnych napraw (okno czasowe, capture-phase, jeden
listener) nie była zbędna per se, ale żadna z nich nie mogła naprawić
tego konkretnego testu, bo test nie mógł przejść niezależnie od kodu
aplikacji. **Run #86** (commit `614e83ac` po autobocie, `spec_filter`
= `base-explorer.spec.js --grep "long-press|usuniętego tuż przed
Zapisz"`) — zielony, `conclusion: success`, krok "Run E2E tests" bez
błędów.

### Runda 15 — zgłoszenie użytkownika po "zamknięciu" modułu: 2 realne bugi UI, testami nieuktyte

Powyższe "moduł zamknięty" okazało się przedwczesne — audyt A/B/C i
Warstwy 1/2 (dane w DB) były rzeczywiście pokryte, ale **stan samego UI**
(disabled przycisków toolbara, layout drawera na mobile) nie miał
żadnego testu regresyjnego, mimo że to dokładnie ten rodzaj bugów, który
psuje się najciszej (appka "działa", dane się nie psują, tylko UI kłamie
o tym co jest zaznaczone/dostępne). Użytkownik trafnie zauważył, że
edytor bazy pytań był pisany iteracyjnie na czacie z GPT (przed
włączeniem Claude do tego repo) i ma dużo takich "szwów" — miejsc, gdzie
ten sam efekt (aktualizacja UI po zmianie selekcji) był powielany ręcznie
w wielu miejscach zamiast być scentralizowany, więc część miejsc go po
prostu nie doniosła.

**Bug 1 — toolbar nie aktualizuje `disabled` po ODZNACZENIU.**
`base-explorer/js/actions.js` ma dedykowany `scheduleRenderList()`
(`renderToolbar(state); renderList(state);`) używany PO zaznaczeniu
wiersza w liście — to działało. Ale co najmniej 5 miejsc, które
ODZNACZAJĄ selekcję (klik w puste tło listy — `e.target === listEl`,
globalny listener `Escape`, start/koniec marquee-selection na liście,
touch-marquee na liście) wołały WYŁĄCZNIE `renderList(state)` (albo samo
zdejmowanie klas `.is-selected` z DOM), nigdy `renderToolbar(state)`.
Efekt dokładnie taki jak zgłoszony: zaznaczasz coś (toolbar poprawnie się
odblokowuje), potem odznaczasz (wiersz wizualnie traci podświetlenie, ale
"Usuń"/"Zmień nazwę"/... zostają klikalne, bo toolbar nigdy nie dostał
komunikatu że selekcja zniknęła). Strona drzewa (`scheduleRenderTree()`)
nie miała tego problemu — tam każda zmiana selekcji, w tym odznaczenie,
zawsze leci przez pełne `renderAll(state)`.

Naprawa scentralizowana zamiast łatana punktowo (żeby nie zostawić
kolejnego, sensownego z pozoru miejsca bez tego wywołania w przyszłości):
`renderList()` w `render.js` sam woła `renderToolbar()` na wejściu.
`renderToolbar()` jest tani i idempotentny poza pierwszym wywołaniem
(buduje DOM przycisków raz, `dataset.ready==="1"`, dalej tylko
aktualizuje `disabled`/tooltips/chipsy wyszukiwania) — podwójne wywołanie
w ramach jednego `renderAll()` (który i tak woła oba osobno) jest
nieszkodliwe. To gwarantuje poprawny stan toolbara przy KAŻDYM
`renderList()`, niezależnie od tego które z wielu miejsc w `actions.js`
je wywołało.

Nowy test regresyjny: `tests/e2e/base-explorer.spec.js`, "regresja:
toolbar aktualizuje disabled po ODZNACZENIU (Escape / klik w puste tło),
nie tylko po zaznaczeniu" — zaznacza pytanie (toolbar enabled), Escape
(toolbar disabled), zaznacza ponownie, klik w puste tło pod jedynym
wierszem listy (toolbar disabled).

**Bug 2 — drawer na mobile zasłania toolbar.** `#toolbar` (search +
przyciski) jest w `base-explorer.html` OSOBNYM elementem, siedzącym
POD globalnym topbarem strony, ale NAD `<main class="explorer">`
(który dopiero zawiera `.explorer-left`/`.explorer-right`). Drawer
(`.explorer-left` na mobile, `position:fixed`) i jego overlay miały
`top: var(--topbar-h, 60px)` — czyli liczyły tylko wysokość globalnego
topbara strony, kompletnie pomijając wysokość samego `#toolbar`. Efekt:
otwarty drawer zaczynał się dokładnie tam, gdzie zaczynał się toolbar, i
go w całości zasłaniał (łącznie z przyciskiem, który go otwiera/zamyka).

Naprawa: `initDrawer()` w `mobile.js` mierzy realną,
`getBoundingClientRect().height` toolbara przy każdym otwarciu drawera
(zmienna, bo toolbar zawija się do 2 wierszy poniżej pewnej szerokości) i
ustawia `--be-toolbar-h` na `document.body`. CSS
(`.explorer-left`/`.drawer-overlay` w media query mobile) liczy
`top: calc(var(--topbar-h, 60px) + var(--be-toolbar-h, 96px))` zamiast
samego `--topbar-h`.

Nowy test regresyjny: `tests/e2e/base-explorer.spec.js`, "regresja:
otwarty drawer nie zasłania toolbara" — po otwarciu drawera sprawdza
bounding boxy `#toolbar` i `#explorerLeft`, asercja że drawer zaczyna się
na/poniżej dołu toolbara (brak nakładania w pionie).

Świadomie NIE przeprowadzono w tej rundzie pełnego przeglądu "czy są
jeszcze inne miejsca w `base-explorer/`, gdzie zmiana stanu pomija
odświeżenie zależnego UI" — dwa zgłoszone bugi naprawione punktowo (Bug 1
scentralizowany na poziomie `renderList()`, więc realnie zamyka całą
klasę "selekcja zmienia się, toolbar nie wie"), ale np. `renderTags()`
(panel tagów po lewej) czy `renderTree()` mogą mieć analogiczne,
niezgłoszone jeszcze luki tego samego autorstwa (kod pisany na czacie z
GPT) — to świadomie odłożone, do zgłoszenia/audytu na żądanie, nie
domysłem "na wszelki wypadek".

### A) Sam edytor bazy — dokładność jak w `editor.spec.js`
- CRUD pytań/odpowiedzi/kategorii/tagów (`page.js`, `render.js`,
  `actions.js`, `question-modal.js`, `tags-modal.js`) — limity, puste
  pola, kolejność, duplikaty tagów/kategorii.
- Import/eksport (`export-modal.js`) — analogicznie do importu w
  edytorze gier: co się dzieje przy błędnym formacie, czy nadpisuje czy
  dokleja istniejące dane.
- Menu kontekstowe (`context-menu.js`) — akcje dostępne z klawiatury/PPM
  na elementach, które w międzyczasie zniknęły (usunięte gdzie indziej).
- Widok mobilny (`mobile.js`) — te same operacje, inny layout/przepływ
  wejścia w edycję pytania.

### B) Równoległa edycja przez DWÓCH RÓŻNYCH użytkowników (nie dwie karty tego samego) — ✅ pokryte testami (Runda 13)
W odróżnieniu od edytora gier (tylko właściciel), tu trzeba realnie
zalogować DWA różne konta testowe na tej samej, współdzielonej bazie:
- Właściciel + `editor` edytują **to samo pytanie** niemal jednocześnie —
  które wygrywa (ostatni zapis), czy drugi użytkownik dostaje jakikolwiek
  sygnał, że coś się zmieniło pod nim. **Zweryfikowane**: ostatni Zapisz
  wygrywa i cicho nadpisuje CAŁY `payload` (żadnej sygnalizacji konfliktu,
  żadnej wersji/timestampu do porównania) — `question-modal.js`'s
  `openQuestionModal()` ładuje `payload` świeżo przy OTWARCIU modala, ale
  `.update({payload})` przy zapisie nadpisuje bezwarunkowo, niezależnie od
  tego co zmieniło się w międzyczasie. Test: `tests/e2e/base-explorer.spec.js`.
- Jeden usuwa pytanie/kategorię/tag, którego drugi używa/edytuje w tej
  samej chwili. **Zweryfikowane**: ten sam wzorzec "cichego sukcesu" co w
  edytorze gier faktycznie tu występuje — UPDATE na już usuniętym wierszu
  trafia w 0 wierszy bez błędu, modal zamyka się normalnie, nic nie
  wskrzesza usuniętego pytania.
- Właściciel usuwa dostęp (`question_base_shares` DELETE) drugiemu
  użytkownikowi W TRAKCIE, gdy ten ma bazę otwartą. **Zweryfikowane**:
  RLS blokuje kolejny zapis natychmiast (na poziomie bazy, niezależnie od
  klienta) — ale UI **nie komunikuje tego w żaden sposób** (przyciski
  zostają wyrenderowane jako enabled, żadnego live-refresh roli). To
  udokumentowany, świadomie nie naprawiany teraz brak UX, nie luka
  bezpieczeństwa.

### C) Granica uprawnień odczyt/edycja — ✅ pokryte testami (Runda 13)
- `viewer` nie może dodać/edytować/usunąć pytania, kategorii ani tagu —
  potwierdzić, że to faktycznie blokuje RLS (próba bezpośrednio przez
  RPC/klienta, nie tylko brak przycisku w UI). **Zweryfikowane** dla
  `qb_categories` (już było), doszło pokrycie `qb_questions`/`qb_tags`.
- Zmiana roli `editor` → `viewer` w locie (właściciel obniża uprawnienia
  gdy tamten ma bazę otwartą). **Zweryfikowane**: `base_can_edit()`
  sprawdza rolę na żywo z DB przy KAŻDYM zapytaniu (nie cache'owaną w
  żadnym tokenie/sesji), więc kolejny zapis z już otwartej karty jest
  odrzucany od razu — tylko UI o tym nie wie bez odświeżenia (ten sam
  brak co wyżej).
- Próba `editor`-a (nie tylko `viewer`-a) wywołania akcji właściciela
  (zmiana nazwy bazy) — powinno być odrzucone już na poziomie
  `qb_bases_update` (tylko `owner_id`). **Zweryfikowane**: `UPDATE` przez
  nie-właściciela nie rzuca błędu (RLS `USING` po prostu nie dopasuje
  żadnego wiersza), więc asercja sprawdza że nazwa w DB fizycznie się nie
  zmieniła, nie że poleciał wyjątek — inny kształt "porażki" niż przy
  INSERT (`WITH CHECK`), warto pamiętać przy kolejnych testach RLS tego
  typu. Zarządzanie udostępnieniami (`qb_shares_write`) przez `editor`-a
  NIE zostało jeszcze przetestowane — mniejsze ryzyko (edytor bazy pytań
  nie ma w UI żadnego przycisku do zarządzania dostępem), zostawione
  jako mniejsza, otwarta pozycja.

### Wyniki audytu funkcjonalnego (2026-08-30) — ✅ zrobione, przed Warstwą 1

Pełny audyt A) (cały `base-explorer/`: `actions.js` 4715 linii + wszystkie
pozostałe pliki modułu + RLS/FK w `schema.sql`), zweryfikowany ręcznie
linia po linii (nie tylko wynik subagenta). Znalezione bugi to błędy kodu
niezależne od wielu kart naraz — naprawione PRZED projektowaniem locka,
bo lock by ich nie rozwiązał:

**Krytyczne (naprawione):**
- `actions.js:4375` — `let t = null` w `run()` przesłaniało zaimportowaną
  funkcję tłumaczeń `t` (temporal dead zone) → `ReferenceError` przy
  KAŻDYM eksporcie ("Utwórz grę" było całkowicie martwe). Zmienna
  przemianowana na `tickTimer`.
- `actions.js:2045-2089` (`reorderFoldersByDrop`) — tryb before/after
  drag&drop folderów w drzewie nie miał żadnej walidacji cyklu (w
  przeciwieństwie do trybu "into"/`moveItemsTo`) — przeciągnięcie folderu
  na jego bezpośrednie dziecko ustawiało mu `parent_id` na samego siebie.
  Dodano identyczny self/descendant check jak w `moveItemsTo`.
- `actions.js:1059-1084` (`renameByKey`) — F2 na pytaniu brał `payload` z
  lokalnego cache (`state.questions`/`_viewQuestions`) i nadpisywał nim
  CAŁY wiersz — realny lost-update przy równoległej edycji tego samego
  pytania gdzie indziej. Teraz pobiera świeży `payload` z DB tuż przed
  zapisem (ten sam wzorzec co `openQuestionModal`).

**Poważne (naprawione):**
- `deleteTags()` nie czyściła `state._allQuestionTagMap`/`_allCategoryTagMap`/
  `_derivedCategoryTagMap` (jedyne miejsce modyfikujące tagi bez tego) —
  kropki tagów przy folderach po usunięciu tagu pokazywały "duszka".
- `createFolderHere`/`createQuestionHere` sprawdzały tylko `canWrite`, nie
  `canMutateHere` — menu kontekstowe w widoku META (gdzie
  `isReadOnlyView()` w `context-menu.js` nie uwzględniało METY) realnie
  tworzyło wiersze w DB z pominięciem zamierzonej blokady widoków
  wirtualnych. Naprawione dwustronnie: obie funkcje używają teraz
  `canMutateHere`, a `isReadOnlyView()` uwzględnia też `VIEW.META`.
- `deleteItems()` usuwało folder, ale FK `qb_questions.category_id` ma
  `ON DELETE SET NULL` (nie CASCADE) — pytania z usuwanego folderu po
  cichu "spadały" do widoku Wszystkie zamiast zniknąć razem z folderem.
  Teraz jawnie zbiera i kasuje wszystkie pytania w całym poddrzewie
  usuwanych folderów.
- `tags-modal.js`: `openTagsModal()` podpinało listenery X/Zapisz PRZED
  utworzeniem swojego Promise (dopiero po dwóch `await` niżej) — klik w
  trakcie wolnej sieci wywoływał `resolvePromise(result)` gdy
  `resolvePromise` było wciąż `null`, zawieszając Promise na zawsze.
  Promise + resolver tworzone teraz na samym początku funkcji.
- Ctrl+C (kopiuj) w globalnym skrócie klawiszowym nie sprawdzało
  `canWrite` (w przeciwieństwie do tej samej akcji z toolbara/menu
  kontekstowego) — dodano check dla spójności (niegroźne samo w sobie,
  bo nic nie zapisuje do DB).

**Świadomie odłożone (nie są "corruption przy wielu kartach" w wąskim
sensie, RLS je backstopuje):**
- Race na `ord` przy równoczesnym tworzeniu (`nextOrdForFolder`/
  `nextOrdForQuestion`, read-then-insert bez unique indexu) — realnie
  rozwiąże/ograniczy dopiero Warstwa 1 (blokada `base_id`), nie osobna
  łatka.
- Brak jakiegokolwiek realtime/synchronizacji między kartami (cały moduł
  żyje wyłącznie w pamięci karty aż do ręcznego odświeżenia) — to jest
  dokładnie uzasadnienie dla Warstwy 1, nie osobny fix.
- `applyCategoryOrder` (drag-reorder) robi pętlę osobnych `UPDATE` per
  folder, nietransakcyjnie — przy błędzie sieci w połowie zostaje
  częściowo zaktualizowane drzewo. Wymagałoby RPC/transakcji — osobne
  zadanie hardeningowe.
- Brak walidacji reguł biznesowych na poziomie DB (max 6 odpowiedzi,
  punkty 0–100, limity długości) — cała walidacja kliencka, RLS pilnuje
  *kto* pisze, nie *co*. Osobne zadanie (CHECK constrainty/triggery).
- `state.role` pobierana raz przy starcie strony i nigdy nie odświeżana
  (`setRole()` wołane wyłącznie w `page.js:83`) — jeśli właściciel cofnie
  komuś dostęp w trakcie sesji, UI tego nie zauważa (dopiero realny zapis
  odbije się od RLS). Niska szkodliwość dzięki RLS, nie priorytet.
- Drobne: niespójny limit długości tekstu pytania (`question-modal.js`
  bez `maxlength` vs `safeQuestionText()` = 200 znaków przy F2), unikalność
  nazwy tagu case-insensitive w UI vs case-sensitive w DB (`qb_tags_base_id_name_key`),
  zahardkodowane polskie "Nowy folder"/"Nowe pytanie" zamiast `t()`,
  `addDoubleTap` na mobile porównujące dokładnie ten sam węzeł DOM (gubi
  rozpoznanie po re-renderze).
- Znaleziono przy okazji (nie z audytu, przy budowie testów): skrót
  Ctrl+T (`actions.js:4688-4696`) wywołuje `openTagsModal(state, { mode: "assign" })`
  BEZ przekazania `selection: {qIds, cIds}` — modal zawsze startuje z
  pustym zaznaczeniem (`sel.qIds=[]`), więc tri-state zawsze pokazuje
  "none" niezależnie od realnych przypisań. Ścieżka z menu kontekstowego
  ("Tagi…") działa poprawnie. Nie naprawione — osobny, drobny bug do
  ujęcia przy następnym przebiegu.

E2e: całość żyje w jednym pliku `tests/e2e/base-explorer.spec.js` (na
żądanie scalone z trzech roboczych plików w jeden), podzielonym na 4
`test.describe` bloki, 31 testów łącznie — 🔄 e2e w toku (jeszcze nie
uruchomione na CI):

1. **"naprawy z audytu"** (5 testów) — regresja 1:1 na pierwszych 3
   krytycznych + 2 poważnych bugach: eksport, cykl folderów,
   stale-payload rename, cascade usuwania folderu, hang modala tagów.
2. **"codzienna funkcjonalność panelu"** (14 testów, na żądanie
   "przetestować cały panel", nie tylko już znalezione bugi) —
   question-modal CRUD + limity, tagi tri-state + duplikaty, wyszukiwanie
   tekstowe i po `#tagu`, wytnij/kopiuj/wklej, drag&drop pytania na folder
   w liście, oraz DWA REALNE konta testowe —
   `TEST_USERNAME`/`TEST_USERNAME_2` — dla `editor`/`viewer` na
   współdzielonej bazie, w tym próba zapisu viewera bezpośrednio przez
   klienta z pominięciem UI. `loginAsTestUser()` w `helpers/login.js`
   dostał opcjonalny `{ username }` do logowania drugiego konta. Przy
   pisaniu tych testów znaleziony i naprawiony KOLEJNY samodzielny bug:
   `Ctrl+A` (`actions.js` w keydown handlerze) filtrował wiersze po
   atrybucie `data-key`, którego żaden wiersz nigdy nie miał (wszystkie
   mają `data-kind`+`data-id`) — zaznacz-wszystko było od zawsze
   całkowicie martwe, naprawione przez użycie istniejącego
   `currentRowKeys()`.
3. **"question-modal.js (edycja pytania)"** (6 testów, na żądanie —
   modale edycji/eksportu są "bardzo ważne", wcześniejsze pokrycie było
   za płytkie) — edycja istniejącej odpowiedzi (nie duplikuje), usuwanie
   odpowiedzi, obcinanie tekstu do 17 znaków, clamp punktów 0–100 w locie,
   anulowanie (X) nie zapisuje zmian, pusta treść blokuje zapis. Przy
   pisaniu znaleziony i naprawiony KOLEJNY samodzielny bug: `qSave` w
   ogóle nie sprawdzał, czy treść pytania jest niepusta (tylko
   punkty/sumę) — dodana walidacja + klucz tłumaczenia
   `baseExplorer.question.errors.textRequired` (pl/en/uk).
4. **"export-modal.js ('Utwórz grę')"** (6 testów) — dynamiczne
   włączanie/wyłączanie "Utwórz" przy zmianie liczby zaznaczonych,
   oznaczenie ok/bad pytań przy przełączaniu typu gry, PUNKTACJA
   faktycznie zeruje punkty w utworzonej grze, PREPAROWANA zachowuje
   tekst+punkty (pełny round-trip przez realne
   `games`/`questions`/`answers`), zamknięcie X nie tworzy gry, baza z
   <10 pytań pokazuje błąd i blokuje przycisk.

Łącznie z pierwotnymi 3 krytycznymi (eksport/cykl/rename) znalezione i
naprawione zostały 4 dodatkowe, samodzielne bugi: `deleteTags` nie
czyściła cache tagów, obejście blokady widoków wirtualnych (META),
osierocone pytania po usunięciu folderu, hang modala tagów, martwy
Ctrl+A, brak walidacji pustej treści pytania.

**Runda 4 (na żądanie: "więcej, więcej, więcej")** — dobito pozostałe
białe plamy z listy: `render.js` przeczytany w całości (sort, breadcrumbs,
resize kolumn — bez nowych bugów), audyt marquee selection (bez bugów).
Dodano 7 kolejnych testów w tym samym pliku: sortowanie po nazwie/typie
(toggle asc/desc, foldery zawsze przed pytaniami), nawigacja breadcrumbs,
Ctrl+D (duplikuj), reorder rodzeństwa w drzewie (przypadek POPRAWNY, nie
cykl), kopiowanie folderu z zagnieżdżonym podfolderem i pytaniem
(`copyFolderSubtree`), przeciągnięcie kilku zaznaczonych elementów naraz
(folder + pytanie razem). Łącznie 39 testów w `base-explorer.spec.js`.

Przy tej turze znalezione i naprawione DWA kolejne samodzielne bugi:
- **`state.js`'s `createState()`** nie inicjalizowała `treeOpen` z
  `"root"` w środku — `render.js`'s `renderTree()` liczy `rootOpen =
  treeOpen.has("root")`, więc świeżo wczytana strona pokazywała drzewo z
  samym zwiniętym "Root ▶" i ZEREM widocznych folderów najwyższego
  poziomu, dopóki user ręcznie nie kliknął strzałki — auto-rozwijanie
  ścieżki do aktualnego folderu też nigdy nie dodawało "root" samo z
  siebie. Naprawione przez `treeOpen: new Set(["root"])` w
  `createState()`. To by też złamało wcześniej wypchnięty test cyklu
  folderów (zakładał, że folder widoczny bez rozwijania roota) — złapane
  i naprawione zanim ktokolwiek uruchomił e2e na CI.
- **Ctrl+T** (`actions.js`, zgłoszone wcześniej jako "nienaprawione") —
  wywoływał `openTagsModal()` bez przekazania zaznaczenia; naprawione
  przez przekierowanie na tę samą, poprawną ścieżkę co przycisk toolbara
  (`state._api.openAssignTagsModal()`).

**Świadomie NIE naprawione, bo to zadanie na Warstwę 1 (lock), nie
osobna łatka**: przy audycie potwierdzono, że dwie ŻYWE sesje edytujące
question-modal.js dla TEGO SAMEGO pytania — obie otwierają modal (świeży
fetch), pierwsza dodaje odpowiedź i zapisuje, druga (dalej pracując na
swojej, już nieaktualnej kopii) też zapisuje — nadpisze zmiany pierwszej.
`fetchQuestionById()` przed otwarciem modala chroni tylko przed stale
cache'em SPRZED otwarcia, nie przed równoległym zapisem W TRAKCIE gdy
modal jest otwarty u obu naraz. To jest dokładnie ten typ problemu, po
który sięgamy po lock per-pytanie — nie koduję tego jako "oczekiwany"
test (nie chcę testu, który asertuje utratę danych jako sukces), tylko
zapisuję tu jako potwierdzenie, że rekomendacja z audytu (lock
per-pytanie, nie tylko per-baza) wciąż stoi.

Kontynuacja tej samej rundy: systematyczne porównanie toolbar/menu
kontekstowe/klawiatura znalazło TRZECI samodzielny bug — klawisz
**Delete w widoku wyszukiwania (SEARCH) cicho nic nie robił**. Kod miał
dwie bramki z rzędu: `canDeleteHere` (poprawnie przepuszcza SEARCH,
blokuje tylko META) i zaraz potem zbędną drugą `canMutateHere` (blokuje
WSZYSTKIE widoki wirtualne, więc też SEARCH) — toolbar i menu kontekstowe
używają tylko pierwszej, więc obie działały poprawnie w SEARCH, a sam
klawisz Delete nie. Usunięto zbędną drugą bramkę (`deleteItems()` i tak
niezależnie sprawdza `canWrite` w środku). Dodany test: 40 testów łącznie.

Kontynuacja: systematyczne porównanie znalazło CZWARTY bug, poważniejszy
niż Delete/SEARCH — menu kontekstowe "Usuń" w widoku **META nie miało
ŻADNEJ blokady widoku** (tylko `!editor || selectedRealCount===0`),
podczas gdy toolbar i klawisz Delete oba świadomie blokują usuwanie w
META przez `canDeleteHere`. Prawoklik → Usuń w META FAKTYCZNIE kasował
element, mimo że reszta UI to blokowała — realny bypass zamierzonego
zabezpieczenia, nie tylko martwy klawisz. Naprawione: `canDeleteHere`
wyeksportowane z `actions.js`, `context-menu.js` używa go teraz wprost
zamiast własnej, niepełnej kopii logiki (TAG ma nadal swoją odrębną
ścieżkę "zdejmij tagi zamiast kasuj").

### Runda 5 — pierwszy realny przebieg CI (run #71, 31 testów na starym commicie f3f4e61): 20 failed / 11 passed

Uruchomiony PRZED poprawkami z rund 4 (drzewo/Ctrl+T/Delete), więc część
failów była już znana i naprawiona. Ale analiza logów (nie tylko
"czerwone/zielone") ujawniła TRZY DALSZE, wcześniej nieznane, realne
bugi w aplikacji — dokładnie to, po co robi się to ćwiczenie:

1. **`openExportModal()` zawężał całą pulę pytań w modalu do samego
   zaznaczenia** (`actions.js`) — `opts.questions` i `opts.preselectIds`
   były budowane z TYCH SAMYCH, tylko zaznaczonych wierszy. Mechanizm
   "dopełnij zaznaczenie do 10" w `export-modal.js`'s `open()` dopełnia
   z `allQuestions` (=`opts.questions`), więc gdy zaznaczono mniej niż
   10, nie było skąd dopełnić — `#xCreate` zostawał TRWALE wyłączony.
   Eksport z pojedynczego zaznaczonego pytania (najczęstsza ścieżka:
   "Utwórz grę" z listy) był w praktyce niemożliwy przy < 10 zaznaczonych
   naraz. Naprawione: `opts.questions` to teraz cała `state._allQuestions`,
   `preselectIds` zostaje ograniczone do realnego zaznaczenia.

2. **Kolejne dwa (z czterech łącznie w całym module) wystąpienia bugu z
   rundy 1** ("`let t` przesłania zaimportowaną funkcję tłumaczeń `t`")
   — tym razem złapane przez realny `pageerror: t is not a function` w
   logach CI, nie przez inspekcję kodu:
   - `tags-modal.js`'s `renderAssignList()`: `tags.map((t) => ...)`
     przesłaniało `t` wewnątrz callbacku, który wywoływał
     `t("baseExplorer.tags.partial")` przy stanie "częściowym" (some) —
     dokładnie scenariusz, który mój własny test wywołuje. Crash za
     każdym razem gdy zaznaczenie miało mieszany stan przypisania tagu.
   - `render.js`'s `renderTags()`: `tags.map((t) => ...)` z
     `t.name || t("baseExplorer.defaults.tag")` — nie złapane przez CI
     (moje tagi zawsze miały nazwę), ale ten sam wzorzec, znaleziony
     prewencyjnie przy przeglądzie. Naprawione tak samo (zmienna pętli
     `tag` zamiast `t`).
   - `render.js`'s `tagDotsHtml()`: `const t = byId.get(tid); ...
     t?.name || t("...")` — NAJGROŹNIEJSZY wariant: crashuje nie tylko
     przy pustej nazwie, ale przy KAŻDYM `tid` który nie rozwiąże się do
     realnego tagu (np. martwe odniesienie do usuniętego tagu). Naprawione.
   Sprawdzone systematycznie (grep) wszystkie pliki importujące `t` w
   całym module — te 4 to komplet, żadnych innych nie znaleziono.

3. **Wyścig przy zamykaniu modala pytania/zmiany nazwy vs. faktyczny
   zapis do DB** — `question-modal.js`'s i `openRenameModal()`'s
   `close()` (chowa overlay) są SYNCHRONICZNE na klik Zapisz, ale
   prawdziwy `UPDATE`/`PATCH` do `qb_questions` leci ASYNCHRONICZNIE już
   PO zamknięciu (w `state._api.openQuestionModal`/`renameSelectedPrompt`,
   nie w samym modalu) — więc "overlay się schował" nie gwarantuje, że
   zapis doleciał do bazy. To ten sam klasyczny wzorzec flakiness, już
   wcześniej łapany i naprawiany w innych plikach tego projektu
   (`game-settings.spec.js`, `cross-resource-locks.spec.js`). Naprawione
   w TEŚCIE (nie w aplikacji — to poprawne zachowanie UX, tylko test
   musi czekać na właściwy sygnał): 5 testów dostało
   `page.waitForResponse()` na PATCH do `qb_questions` opakowany razem z
   klikiem Zapisz, zamiast polegać na zniknięciu overlayu.

4. **Luka w konfiguracji CI, nie w kodzie**: test "viewer współdzielonej
   bazy" failował, bo toolbar był WŁĄCZONY dla "viewera" — okazało się,
   że `TEST_USERNAME_2` nie jest ustawione jako sekret w CI, więc
   `loginAsTestUser(page2, context2, {username: process.env.TEST_USERNAME_2})`
   cicho spadało na fallback `TEST_USERNAME` — "drugie konto" logowało
   się jako TO SAMO konto co właściciel, więc oczywiście toolbar był
   enabled (bo to naprawdę był owner, nie viewer). Naprawione w
   `helpers/login.js`: jawnie podany, ale pusty `{ username }` teraz
   rzuca głośny, czytelny błąd zamiast cichego fallbacku na złe konto.
   **Akcja dla usera**: trzeba dodać `TEST_USERNAME_2` jako sekret w
   ustawieniach repo/CI (patrz `tests/README.md`), żeby te dwa testy
   (`editor współdzielonej bazy`/`viewer współdzielonej bazy`) w ogóle
   miały sens.

**Nierozwiązane, wymaga ponownego live-runu do diagnozy**: test
"przeciągnięcie pytania na folder w liście przenosi je" failował z
gołym `Test timeout of 60000ms exceeded` bez żadnego konkretnego
asercji-fail — może to być realny bug w obsłudze drop (np. w
`moveItemsTo`), albo znana już w tym projekcie klasa flakiness
drag&drop (por. wcześniejszy problem z canvas w logo-editor). Do
zdiagnozowania po kolejnym przebiegu CI na aktualnym HEAD.

**Wciąż niesprawdzone / kolejna runda jeśli będzie potrzebna**: mobile
long-press/double-tap jako e2e (tylko czytanie kodu), reszta macierzy
toolbar/menu-kontekstowe/klawiatura × widoki/role (znaleziono 4 rozjazdy
— Ctrl+C, tworzenie w META, Delete w SEARCH, Usuń w META — nie
przeszukano w pełni systematycznie), sortowanie po dacie (pominięte —
trudne do kontrolowania w teście bez mockowania zegara), interakcje
kombinacji filtrów (szukaj+tag+meta jednocześnie).

### Runda 6 — drugi przebieg CI (run #72, 40 testów na HEAD po rundzie 5): 22 failed / 18 passed

Znów uruchomiony przed pełnym zestawem najnowszych poprawek (test view
tego HEAD-a), ale tym razem OBIE realne przyczyny okazały się leżeć w
samych testach/konfiguracji CI, nie w aplikacji:

1. **Wyścig: skrót klawiszowy Ctrl+E/Ctrl+G/Ctrl+D wciśnięty od razu po
   `row.click()`, zanim zdąży odpalić się debounce toolbara.**
   `scheduleRenderList()` w `actions.js` (komentarz w kodzie: "krótko:
   pozwala na dblclick") aktualizuje atrybut `disabled` przycisków
   toolbara dopiero **180ms** po kliknięciu wiersza — sam `state.selection`
   aktualizuje się synchronicznie, ale DOM (i tym samym
   `btn.disabled`, które sprawdzają handlery `Ctrl+E`/`Ctrl+G`/`Ctrl+D`
   przed kliknięciem przycisku toolbara) nie. Testy robiły
   `await row.click(); await page.keyboard.press("Control+e")` bez
   żadnego odstępu — skrót trafiał na wciąż-`disabled` przycisk i po
   cichu nic nie robił, więc `#questionOverlay`/`#exportOverlay` nigdy
   się nie otwierały. To dokładnie wyjaśnia wszystkie 6 failów
   `question-modal.js`, 5/6 failów `export-modal.js` (jedyny który
   przeszedł używa menu kontekstowego, które czyta `state.selection`
   bezpośrednio, nie przez DOM) i `Ctrl+D duplikuje`. Naprawione W
   TEŚCIE (nie w aplikacji — debounce jest celowy): nowy helper
   `pressToolbarShortcut(page, dataAct, keys)` czeka aż konkretny
   przycisk toolbara faktycznie stanie się `enabled`, dopiero potem
   wciska skrót. Podmienione we wszystkich 15 miejscach w pliku.
2. **`TEST_USERNAME_2` mimo dodania jako sekret repo NIE trafiał do
   testów** — sam sekret w ustawieniach GitHub nic nie daje, dopóki
   workflow jawnie go nie zmapuje na zmienną środowiskową.
   `.github/workflows/e2e-tests.yml`'s krok "Run E2E tests" miał w `env:`
   tylko `E2E_BYPASS_SECRET`/`TEST_USERNAME`/`TEST_PASSWORD` —
   `TEST_USERNAME_2` nigdy tam nie było, więc rundy 5 fix w
   `login.js` (głośny błąd zamiast cichego fallbacku) poprawnie
   wykrywał brak i wysadzał testy `editor`/`viewer współdzielonej bazy`
   z czytelnym komunikatem zamiast mylącego fail-a — ale to dalej
   oznaczało failing testy, bo zmienna fizycznie nie docierała. Dodano
   `TEST_USERNAME_2: ${{ secrets.TEST_USERNAME_2 }}` do `env:`.

**Runda 7 — asymetria "Edytuj pytanie" naprawiona na żądanie.**
`context-menu.js`'s "Edytuj pytanie" blokowało się w SEARCH/TAG/META
(`readOnlyView`), podczas gdy toolbar i Ctrl+E nigdy tego nie robiły —
ta sama zasada co przy "Tagi" (editTags) niżej: edycja treści
konkretnego pytania po id nie zależy od aktualnego widoku, w
przeciwieństwie do tworzenia/przenoszenia. Usunięto `readOnlyView` z
tego warunku, dopisano test regresji. Dodano też test sortowania po
dacie (wcześniej pominięty jako "trudny bez mockowania zegara" — błędny
osąd, wystarczyło ustawić `created_at`/`updated_at` wprost przy
insertowaniu wierszy testowych). 42 testy łącznie.

**Runda 8 — dwie kolejne pozycje z listy "świadomie odłożonych" zamknięte
na żądanie ("trzeba będzie się zająć tymi wszystkimi rzeczami")**:
- **Niespójny limit treści pytania** — `question-modal.js`'s `qText` nie
  miał żadnego limitu, podczas gdy F2 (`safeQuestionText()` w
  `actions.js`) przycinał do 200 znaków to samo pole. Dodano
  `maxlength="200"` w `base-explorer.html` + twardy clamp w JS (ten sam
  wzorzec co już istniał dla `qAnsText`/17 znaków) — oba wejścia do tego
  pola mają teraz ten sam limit. Test regresji dodany.
- **Martwy kod usunięty**: `uniqLower`/`parseSearchInputToTokens`/
  `resolveTagIdsByNames`/`filterExistingTagNames` (`actions.js`) i
  `setViewSearch`/`setSearchTokens`/`clearSearchTokens` (`state.js`) —
  zero wywołań w całym module, potwierdzone grepem. Realna logika
  parsowania `#tagów` w wyszukiwarce żyje gdzie indziej
  (`tryConsumeHashTagTokenFromInput`). Przy okazji usunięto też martwe
  pole `searchRaw`/`tagNames` z `createState()`. 43 testy łącznie.

Wciąż otwarte z listy "do zajęcia się": brak walidacji reguł
biznesowych na poziomie DB (wymaga CHECK constraintów/migracji),
nietransakcyjny `applyCategoryOrder` (wymaga RPC), rola nieodświeżana na
żywo, case-sensitive nazwa tagu vs case-insensitive sprawdzenie w UI
(wymagałoby migracji na unikalny indeks funkcyjny `lower(name)`), mobile
e2e, kombinacja filtrów META+TAG, pełna macierz
toolbar/menu-kontekstowe/klawiatura.

Pozostałe niezdiagnozowane z tej rundy (niepewne bez pełnej treści logu
dla failów 1–15, których narzędzie do logów CI nie zwróciło — tylko
ostatnie ~7 miało pełny szczegół): test #1 (eksport przez menu
kontekstowe, 10 realnych pytań) i trzy testy drag&drop/reorder w drzewie
(`drag&drop folderu w tryb before/after`, `przeciągnięcie pytania na
folder w liście`, `reorder rodzeństwa w drzewie`) oraz `sortowanie po
typie` — żaden z nich pasuje do wzorca "toolbar 180ms", więc ich
przyczyna wciąż nieznana. Do zdiagnozowania po kolejnym przebiegu CI —
jeśli po naprawie z rundy 6 dalej failują, to prawdopodobnie realne,
osobne problemy (może faktycznie CI-owy flakiness drag&drop, znany już
wcześniej w tym projekcie).

### Runda 9 — trzeci przebieg CI (run #73, 40 testów na commicie f8d92833, sprzed rund 7–8): 33 passed / 7 failed

Potwierdza, że naprawa z rundy 6 (debounce toolbara + `TEST_USERNAME_2`)
zadziałała drastycznie: 22 faile → 7. Z tych 7:

- **5 to te same, wciąż niezdiagnozowane z rundy 6** (eksport przez menu
  kontekstowe, drag&drop folderu before/after, przeciągnięcie pytania na
  folder, reorder rodzeństwa w drzewie, sortowanie po typie) —
  niezmienione, więc potwierdzone jako niezwiązane z debounce'em.
  Wciąż do zdiagnozowania (potrzebny pełny log, nie tylko tail — do
  zrobienia po kolejnym przebiegu na najnowszym HEAD-zie).
- **2 nowe, oba w `export-modal.js`**: "eksport typu PUNKTACJA zeruje
  punkty..." i "eksport typu PREPAROWANA zachowuje tekst i punkty...".
  Obydwa padały w `findGameByName()` z błędem PostgREST `JSON object
  requested, multiple (or no) rows returned` — czyli zapytanie po
  `name` zwracało **więcej niż jeden wiersz** w `games`.

**Zdiagnozowane i naprawione — realny bug aplikacji, nie testu.**
`actions.js`'s `openExportModal()` tworzył grę **DWA RAZY** przy każdym
eksporcie:
1. Raz wewnątrz `opts.run` (linia ~4381) — callback przekazany do
   `exportModal.open()`, wołany przez `xCreate`'s click handler w
   `export-modal.js`, który **czeka** na jego zakończenie przed
   zamknięciem modala i zwraca `{ gameId }` jako `result`.
2. Drugi raz **zaraz po** `await exportModal.open(opts)` (stara linia
   ~4402): `const gameId = await importGame(payload, ownerId);` — ten
   sam `payload`, ten sam `ownerId`, druga wstawka do `games`.

W testach obie gry miały identyczną nazwę (`xName` z formularza), więc
`findGameByName()`'s `.maybeSingle()` poprawnie wysadzał się na
"multiple rows" — to nie był bug testu, tylko trafne wykrycie
prawdziwego problemu: **każde użycie "Utwórz grę" w bazie pytań tworzyło
dwie gry zamiast jednej**, każde jednakowo poprawnie wypełnione (stąd w
ręcznym użyciu łatwo to przeoczyć — druga, "cicha" gra po prostu wisiała
w liście gier). Naprawiono: usunięto drugie wywołanie `importGame()`,
`gameId` bierzemy teraz z `res.result?.gameId` (wynik z kroku 1).

Wciąż otwarte po tej rundzie: te same 5 niezdiagnozowanych testów z
rundy 6 (potrzebny pełny log po przebiegu na aktualnym HEAD-zie, commit
13e9290d + ten fix, 43 testy).

### Runda 10 — pełny log run #73, wszystkie 7 failów zdiagnozowane

Ściągnięty pełny log joba (nie tylko tail) ujawnił, że lista "5
niezdiagnozowanych z rundy 6" była nieaktualna — jeden z nich to ten sam
bug co w rundzie 9:

- **Test #1 ("eksport przez menu kontekstowe faktycznie tworzy grę")** —
  DOKŁADNIE ten sam duplikat gry co w rundzie 9 (`findGameByName`'s
  "multiple rows"). Już naprawiony razem z rundą 9, bez dodatkowych
  zmian w teście.
- **Test "sortowanie po typie"** — realna przyczyna znaleziona:
  `render.js`'s `.title-text` dla WIERSZA FOLDERU to
  `${svgFolder()} ${esc(name)}` — SVG ikona nie ma własnego tekstu, więc
  `textContent` tego spana to spacja-separator + nazwa, np. `" Z-folder"`
  zamiast `"Z-folder"`. To zamierzony odstęp wizualny ikona↔etykieta
  (tak samo jak w drzewie, linia ~472/892), nie bug aplikacji — ujawnił
  się tylko dlatego, że ten jeden test miesza w jednej asercji tytuł
  folderu (z ikoną) i tytuł pytania (bez ikony) i porównuje oba
  dokładnie. Naprawione w teście: `titles()` teraz `.map(s => s.trim())`
  przed porównaniem.
- **3 testy drag&drop (folder-cykl, pytanie→folder w liście, reorder
  rodzeństwa w drzewie)** — wszystkie failowały identycznie: gołe "Test
  timeout of 60000ms exceeded" bez JAKIEGOKOLWIEK innego komunikatu, na
  obu próbach (initial + retry), mimo że aplikacja używa naciwnego HTML5
  D&D (`draggable="true"` + `dragstart`/`dragover`/`drop`), a handlery
  drop nie robią nic, co mogłoby zawiesić samo wywołanie `dragTo()`
  (żadne `await` w handlerze drop nie blokuje zwrotu Playwrighta — ten
  kończy się, gdy przeglądarka skończy własną, natywną sekwencję
  przeciągania, niezależnie od tego, czy handler aplikacji już
  wykonał swoje). Brak jakiegokolwiek call-logu przy 60s timeout (zamiast
  np. "waiting for element to be stable") silnie sugeruje, że to sam
  `.dragTo()` się zawiesza na poziomie CDP -- znana klasa niestabilności
  natywnego D&D w headless Chromium na CI, nie bug aplikacji. Nie dało
  się tego dalej zdiagnozować bez `trace`/`video` (świadomie wyłączone w
  `playwright.config.js` — mogłyby nagrać nagłówek z sekretem, patrz
  `tests/README.md`), a artefakt ze screenshotami/`error-context.md`
  jest na Azure Blob Storage, zablokowanym przez politykę proxy tego
  środowiska. Naprawione minimalnie w testach: dodano jawny
  `timeout: 20000` do wszystkich 4 wywołań `.dragTo()` w pliku (3
  failujące + 1 już przechodzący, dla spójności) — krótszy niż
  `test.setTimeout(60_000)`, więc kolejny hang da konkretny błąd
  Playwrighta z call logiem zamiast pustego "Test timeout" bez żadnej
  wskazówki. Jeśli po tym nadal będą failować identycznie (pusty
  call log / prawdziwy hang CDP), to potwierdzi środowiskową
  niestabilność, nie aplikację — do rozważenia wtedy: retry z osobnym
  odczekaniem, albo (jeśli to się nie zmieni) świadome pominięcie D&D
  w CI na rzecz manualnego QA tej ścieżki.

Wszystkie 7 failów z run #73 ma teraz wyjaśnienie i albo realną naprawę
(2× duplikat gry — bug aplikacji), albo naprawę/utwardzenie w teście
(sortowanie po typie, 4× dragTo z jawnym timeout). Do zrobienia:
poprosić o kolejny przebieg E2E na najnowszym HEAD-zie (43 testy) i
sprawdzić, czy testy D&D przechodzą, czy nadal timeoutują (tym razem z
konkretnym komunikatem).

### Runda 11 — run #74 (commit 46f639aa, 43 testy): 37 passed / 4 failed / 2 flaky

Duży postęp (7→4 failed) i jeden ważny obalony wniosek z rundy 10.

**Sortowanie po typie — potwierdzone naprawione.**

**Nowy, realny bug testu znaleziony i naprawiony: wyścig z nawigacją po
eksporcie.** `openExportModal()` (`actions.js`) po udanym eksporcie robi
`location.href = "../builder"` — to zamierzone zachowanie appki (przejście
do buildera nowo utworzonej gry). Trzy testy w `export-modal.js`
(eksport przez menu kontekstowe, PUNKTACJA, PREPAROWANA) od razu po tym
odpytują `window.__sbClient` (przez `findGameByName`/
`getGameQuestionsWithAnswers`/`deleteGame`/`deleteBase`) bez czekania,
aż nawigacja się dokończy i builder.html zdąży postawić WŁASNY
`window.__sbClient` przy starcie. Objawy w run #74:
- Test menu kontekstowego (test #1) failował **za każdym razem** (2/2) z
  `TypeError: Cannot read properties of undefined (reading 'from')`
  wewnątrz `deleteBase()` w `finally` — sam eksport i asercje przeszły,
  tylko sprzątanie się wywaliło. To potwierdza, że duplikat gry z rund
  9-10 jest naprawiony NAPRAWDĘ (żadnego "multiple rows" tu już nie ma).
- PUNKTACJA i PREPAROWANA failowały **raz na dwie próby** (2 flaky w
  podsumowaniu) z tym samym błędem, w tym samym miejscu -- czysty wyścig
  czasowy, stąd niedeterminizm.

Naprawione w testach: nowy helper `waitForSbClient(page)`
(`page.waitForFunction(() => !!window.__sbClient, {timeout: 10000})`),
wpięty przed każdym `page.evaluate` w `deleteBase()`, `deleteGame()` i
`findGameByName()` -- niemal zerowy koszt, gdy klient już istnieje (co
jest normą wszędzie indziej w pliku), realna ochrona akurat tu, gdzie
appka robi pełną nawigację w trakcie testu.

**Obalona hipoteza z rundy 10 o `dragTo()` jako miejscu zawieszenia.**
3 testy D&D (folder-cykl, pytanie→folder, reorder rodzeństwa) failują
DOKŁADNIE tak samo jak w rundzie 9 -- gołe "Test timeout of 60000ms
exceeded", zero call logu -- **mimo dodanego `timeout: 20000` do
`dragTo()`**. Gdyby to `dragTo()` się zawieszał, jawny, krótszy niż
`test.setTimeout` timeout MUSIAŁBY dać konkretny błąd Playwrighta po
20s zamiast pełnych 60s ciszy -- Playwright egzekwuje timeouty akcji
po swojej stronie (nie czeka na odpowiedź przeglądarki, żeby je
odmierzyć). Skoro tego nie widać, to nie jest zwykła "akcja się nie
udaje" -- to wygląda na to, że **cała karta/proces renderera Chromium
przestaje w ogóle odpowiadać na protokół CDP** podczas natywnego D&D w
tym środowisku CI, co jest poważniejsze niż zwykła niestabilność
pojedynczej akcji. Przejrzano handlery `dragover`/`drop` w `actions.js`
pod kątem pętli nieskończonych/kosztownych operacji wywoływanych przy
KAŻDYM zdarzeniu `dragover` (które CDP potrafi generować znacznie
gęściej niż prawdziwa mysz) -- nic oczywistego nie znaleziono
(`clearDropTarget`/`setDropTarget`/`pulseEl` to tanie, ograniczone
operacje DOM).

Bez `trace`/`video` nie da się tego dalej wiarygodnie zdiagnozować z tego
środowiska (żadne dalsze polowanie na źródło w kodzie appki nie ma sensu
bez realnego podglądu, co dzieje się w przeglądarce w chwili zawieszenia).
**Decyzja użytkownika: włączyć `video`** (samo nagranie ekranu, BEZ
przechwytywania nagłówków/sieci -- w odróżnieniu od `trace`, które
faktycznie mogłoby złapać sekret). Ustawione w `playwright.config.js`
jako `video: "retain-on-failure"` (nagrywa tylko failujące testy, zero
kosztu dla reszty) + zaktualizowany komentarz w `tests/README.md`.
`trace` zostaje wyłączone jak dotychczas.

Do zrobienia po kolejnym przebiegu CI: jeśli 3 testy D&D nadal
timeoutują, ściągnąć nagranie wideo z artefaktu i zobaczyć, co faktycznie
dzieje się na ekranie w chwili zawieszenia (czy modal/wiersz się w ogóle
rusza, czy przeglądarka wygląda na całkiem zamrożoną, czy coś nietypowego
pojawia się tuż przed zawieszeniem).

### Runda 12 — run #76 (video włączone): D&D naprawdę zamarza, wideo obejrzane, mechanizm testu wymieniony

Ściągnięcie artefaktu przez narzędzia w tym środowisku dalej zablokowane
(`gateway answered 403... policy denial` na Azure Blob Storage — twarda
polityka sieci, nie coś przejściowego, potwierdzone przez
`$HTTPS_PROXY/__agentproxy/status`). Użytkownik ściągnął artefakt ręcznie
z GitHub UI i obejrzał nagrania dla wszystkich 3 failujących testów
(pierwsza próba, bez retry): **we wszystkich trzech obraz jest identyczny
-- strona się ładuje, źródłowy wiersz zostaje zaznaczony (dragstart się
odpalił, appka poprawnie zareagowała), a potem dosłownie NIC się nie
dzieje aż do końca nagrania.** Zero ruchu kursora, zero podświetlenia
drop-targetu, zero czegokolwiek -- pełna cisza przez pozostałe ~55s.

To rozstrzyga sprawę: `dragTo()` faktycznie zawiesza się w tym
konkretnym środowisku CI (headless Chromium, GitHub Actions
`ubuntu-latest`) na poziomie natywnej, CDP-owej symulacji przeciągania --
zaraz po `dragstart` (który jest realnym zdarzeniem przeglądarki i
faktycznie dotarł do appki), coś w dalszej części sekwencji (`dragover`
w stronę celu, `drop`) nigdy nie zostaje wygenerowane przez Playwrighta.
Ciekawostka, której nie udało się w pełni wyjaśnić: `timeout: 20000`
przekazany do `dragTo()` (realna, udokumentowana opcja -- sprawdzona w
typings `playwright-core`) i tak nigdy nie odpalił WŁASNEGO błędu w 3
kolejnych przebiegach (#74, #75 bez tej opcji jeszcze, #76 z nią) --
zawsze goły "Test timeout of 60000ms" po pełnych 60s. Dokładny mechanizm
tego wewnątrz Playwrighta pozostaje niejasny, ale nie ma to już
znaczenia przy naprawie poniżej.

**Naprawione przez całkowite ominięcie `dragTo()`.** Appka i tak
operuje wyłącznie na zwykłych zdarzeniach DOM (`dragstart`/`dragenter`/
`dragover`/`drop`/`dragend` z `dataTransfer`) -- żaden z handlerów w
`actions.js` nie sprawdza, czy to był "prawdziwy" natywny gest
przeciągania OS-owego. Nowy helper `simulateDragDrop(page,
sourceSelector, targetSelector, {targetOffsetX, targetOffsetY})`
dispatchuje te zdarzenia ręcznie w `page.evaluate()` (z prawdziwym
`new DataTransfer()`, prawidłowymi `clientX`/`clientY` liczonymi z
`getBoundingClientRect()` -- dokładnie to, czego oczekują handlery
`dragover` przy liczeniu stref before/after/into), całkowicie omijając
CDP-ową symulację myszy Playwrighta, która się zawiesza. Podmienione we
wszystkich 4 miejscach w pliku (3 failujące + multi-drag, który już
przechodził -- dla spójności, żeby nie trzymać dwóch różnych mechanizmów
D&D w jednym pliku testów).

Do zrobienia: poprosić o kolejny przebieg E2E (43 testy) i sprawdzić,
czy `simulateDragDrop` naprawdę usuwa zawieszenia. Jeśli tak -- audyt
base-explorera od strony testów jest kompletny (43/43), gotowe do
przejścia do Warstwy 1 (lock) dla zasobu `base`.

### Runda 13 — dopisane testy punktów B), C) i mobile.js (11 nowych, 54 łącznie)

Na żądanie użytkownika ("nie wydaje mi się że wszytko już ogarneliśmy") --
poprzednia runda zamykała tylko punkt A) (sam edytor). Dopisano:

**6 testów punktu B)/C)** (nowy blok "współdzielenie i uprawnienia dwóch
różnych użytkowników", realne DWA konta -- `TEST_USERNAME`/
`TEST_USERNAME_2`, nie dwa konteksty tego samego): edycja tego samego
pytania niemal jednocześnie (ostatni zapis cicho nadpisuje), usunięcie
pytania gdy drugi ma je otwarte do edycji (zapis w 0 wierszy, cicho),
cofnięcie dostępu w trakcie sesji (RLS blokuje natychmiast, UI nie),
degradacja roli editor→viewer na żywo (to samo), `viewer` blokowany też
na `qb_questions`/`qb_tags` (nie tylko `qb_categories` jak dotąd), próba
zmiany nazwy bazy przez `editor`-a (RLS: 0 zmienionych wierszy, nie
błąd -- inny kształt niż blokada INSERT). Wszystkie te zachowania były
tylko opisane w planie jako "do sprawdzenia" -- teraz są zweryfikowane i
zablokowane testem regresji. Żadne z nich nie ujawniło nowego bugu
aplikacji -- to udokumentowanie istniejącego, świadomego stanu (brak
detekcji konfliktu, brak live-refresh roli), nie naprawa.

**5 testów `mobile.js`** (zero pokrycia wcześniej): drawer (otwórz/
zamknij + auto-zamknięcie po kliknięciu wiersza), long-press otwiera
menu kontekstowe (zamiennik PPM), long-press anulowany ruchem palca
>10px NIE otwiera menu (test regresji na `MOVE_THRESHOLD`), podwójny tap
na pytaniu otwiera modal edycji, podwójny tap na folderze nawiguje do
środka. Symulowane ręcznie przez `page.evaluate()`
(`PointerEvent`/`TouchEvent` z odpowiednim `pointerType`/`Touch`), nie
przez natywną emulację dotyku Playwrighta -- ta sama ostrożność co przy
`simulateDragDrop()` w rundzie 12 (CDP-owa symulacja gestów okazała się
niewiarygodna w tym CI, więc dispatch zdarzeń DOM bezpośrednio jest
bezpieczniejszym wyborem od razu, bez czekania na kolejny failujący
przebieg).

Wciąż otwarte po tej rundzie (świadomie mniejszy priorytet): zarządzanie
udostępnieniami (`qb_shares_write`) przez `editor`-a nieprzetestowane
(brak przycisku w UI do tego, mniejsze ryzyko). Główna, wciąż niezaczęta
pozycja to jak zawsze **Warstwa 1 (lock) dla zasobu `base`** -- audyt
funkcjonalny i testy regresji (A, B, C) są teraz kompletne, mechanizm
blokady jeszcze nie istnieje.

### Runda 14 — run #77 (54 testy): 49 passed / 4 failed / 1 flaky -- prawdziwy bug we WŁASNYM `simulateDragDrop`

Duży postęp: D&D już się NIE wiesza (dawne 60s hangi teraz kończą się w
~19s z konkretnym błędem) -- ale 3 testy D&D failują z NOWYM powodem, i
tym razem to bug w teście napisanym w Rundzie 12, nie w appce ani w
Playwright/CDP.

**Znaleziony i naprawiony: `simulateDragDrop()` trzymał referencje do
elementów sprzed `dragstart`.** Dla wiersza, który NIE był wcześniej
zaznaczony (2 z 3 failujących testów; trzeci -- reorder rodzeństwa --
też), appka wewnątrz handlera `dragstart` woła
`selectionSetSingle()` + `renderList()`/`renderAll()`, co wymienia węzły
DOM listy/drzewa. `simulateDragDrop` łapał `source`/`target` przez
`document.querySelector()` RAZ na samym początku i używał tych samych
referencji do kolejnych `dragenter`/`dragover`/`drop` -- po
`renderList()` te referencje były już ODŁĄCZONE od drzewa dokumentu, więc
dispatchowane na nich zdarzenia przestawały bąbelkować do listenera na
`#list`/`#tree` (delegacja zdarzeń). Efekt: drop nic nie robił, zero
błędu, zero zmiany w DB -- appka nigdy nawet nie dowiedziała się o próbie
dropu. Dlatego jedyny wcześniej-zawsze-przechodzący test D&D
(multi-drag) nie łapał tego bugu -- on jawnie zaznacza wiersz PRZED
przeciągnięciem (`.click()`), więc `renderList()` w dragstart nigdy się
nie odpalał, referencje zostawały ważne. Naprawione: `simulateDragDrop`
teraz szuka elementu selektorem OD NOWA tuż przed KAŻDYM dispatchem
(`dragstart`/`dragenter`/`dragover`/`drop`/`dragend`), nigdy nie
cache'uje węzła DOM między krokami.

**Dodatkowo znaleziony i naprawiony: ten sam problem klasy "dwa osobne
round-tripy" w nowym teście mobile.** "long-press anulowany przez ruch
palca" failował deterministycznie (2/2, nie flaky) -- `pointerdown` i
`pointermove` były dispatchowane w DWÓCH osobnych `page.evaluate()`,
więc narzut samego round-tripu CDP między nimi mógł przekroczyć 500ms i
timer long-pressa zdążył się odpalić PRZED dotarciem ruchu anulującego.
Naprawione: oba zdarzenia w jednym atomowym `page.evaluate()`, ten sam
wzorzec co przy `simulateDragDrop`.

**Dodatkowo naprawiony pre-istniejący flaky test (nie z tej rundy):**
"Delete działa w widoku wyszukiwania" -- klik confirm zamyka modal
synchronicznie, ale sam DELETE leci asynchronicznie po nim (ten sam,
wielokrotnie już spotykany w tym pliku wzorzec). Dodano
`page.waitForResponse` na DELETE do `qb_questions` przed odczytem z DB.

Do zrobienia: kolejny przebieg E2E (54 testy) -- jeśli te 4 poprawki
się utrzymają, audyt base-explorera od strony testów będzie faktycznie
kompletny (A, B, C + mobile), gotowe do Warstwy 1.

---

## Krzyżowe blokady między zasobami — mechanizm ✅ zamknięty, reszta kategorii otwarta

Generyczny mechanizm (tri-state `gone`, `delete_resource_checked` dla
`game`/`logo`) opisany niżej jest **zbudowany i przetestowany e2e (6/6,
run #63)** — patrz krok 2.5 w "Kolejności pracy" wyżej. To, co zostaje
otwarte w tej kategorii: Problem 1 (utwardzenie `poll_open` w RLS —
osobny, niezależny dług), dołożenie kolejnych typów zasobów do
`delete_resource_checked` w miarę audytu (`base` na razie pominięty,
Control czeka na własny sygnał żywotności), i pytanie produktowe o
edycję treści logo w trakcie rozgrywki (nierozstrzygnięte).

Inna kategoria niż Warstwa 1/2 opisane wyżej — tamte chronią **ten sam
zasób** otwarty w dwóch miejscach naraz. Tu chodzi o **parę różnych
zasobów**, gdzie stan/istnienie jednego wpływa na bezpieczeństwo drugiego
(np. usunięcie logo, którego gra używa w ustawieniach; usunięcie gry,
której ankieta jest właśnie otwarta).

**Ustalona zasada (nie sama referencja!)**: blokujemy edycję/usunięcie X
tylko gdy jednocześnie: (a) jakiś zasób Y odwołuje się do X w swoich
danych, ORAZ (b) Y ma **teraz aktywną, żywą stronę/sesję** — nie samo
"X jest gdzieś wpisane, ale nikt tam teraz nie siedzi". Ten drugi,
"martwy" przypadek i tak jest już bezpieczny dzięki Warstwie 2 (odśwież
i przefiltruj martwe odniesienie przed zapisem/renderem, tak jak zrobione
dla `questions.final/rounds` w `game-settings.js`) — nie trzeba go
blokować, wystarczy że się nie wykrzacza.

### Dwa osobne problemy — nie mylić ze sobą

Rozmowa wyłoniła dwie **niezależne** kategorie, przypadkiem obie nazwane
"blokadą", ale różne w naturze i różnie naprawiane:

1. **Blokady stanowe, dziś tylko front** — sprawdzenie trwałej flagi w
   bazie (np. `games.status === 'poll_open'`), zaimplementowane WYŁĄCZNIE
   jako zwykła funkcja JS (`canEnterEdit()`), bez żadnego odpowiednika po
   stronie serwera. Nie ma tu nic "żywego" ani żadnej karty/sesji — to
   zwykły dług: stan już istnieje w bazie, tylko nikt go nie sprawdza przy
   zapisie. Naprawa: RLS/RPC, niezależnie od reszty tej sekcji. Znaleziona
   na razie jedna instancja (`poll_open`), ale przy audycie każdej
   kolejnej strony trzeba aktywnie szukać kolejnych — nie ma powodu
   sądzić, że to jedyna.
2. **Krzyżowe blokady żywe** — referencja do innego zasobu + ten inny
   zasób ma aktualnie aktywną sesję/kartę (`edit_locks`). To jest właściwy
   temat tej sekcji, model opisany niżej.

### Zweryfikowane w kodzie (nie zgadywane)

| Para zasobów | Warstwa 1 (UX) dziś | Warstwa 2 (twarda) dziś | Status |
|---|---|---|---|
| Pytania/odpowiedzi gry ↔ status ankiety tej samej gry (`poll_open`) | ✅ `canEnterEdit()` (`game-validate.js`) blokuje wejście do edytora | ❌ **BRAK** — RLS `questions_owner_write`/`answers_owner_write` sprawdza wyłącznie `owner_id`, zero warunku na `games.status` | **Potwierdzona luka** — bezpośrednie wywołanie RPC/klienta może dowolnie edytować pytania/odpowiedzi gry z żywą, otwartą ankietą, korumpując dane pod głosującymi |
| Usunięcie gry, gdy jej ankieta jest `poll_open` (żywi głosujący) | ✅ `delete_resource_checked('game', …)` blokuje (`reason: 'poll_open'`) | ✅ sama funkcja RPC (SECURITY DEFINER, atomowo) | **Rozwiązane już w kroku 2.5** (migracja 254) — potwierdzone e2e (`cross-resource-locks.spec.js`, test "usuwanie gry: zablokowane, gdy jej ankieta jest otwarta") |
| Usunięcie gry, gdy `edit_locks` pokazuje aktywną blokadę (pierwotnie osobne `game_editor`/`game_settings`/`poll`, po korekcie wspólny klucz `game`) | ✅ `delete_resource_checked('game', …)` blokuje | ✅ Warstwa 2 = sama funkcja RPC (SECURITY DEFINER, atomowo) | **Rozwiązane** (migracje 254 + 255) — to był pierwszy wątek tej rozmowy — "blokada usuwania przy użyciu" |
| Logo ↔ gra referencująca je w `settings.display.logoId` | ❌ brak | ❌ brak (potwierdzone: **zero FK** `user_logos`↔`games`, czysty JSONB) | Patrz niżej — rozbite na dwie połowy z osobnymi zależnościami |
| Pytania bazy (`qb_questions`) ↔ gra utworzona z eksportu bazy | n/d | n/d | **Sprawdzone, brak ryzyka**: `base-explorer/js/export-modal.js` robi jednorazową kopię do nowych wierszy `games`/`questions` — zero trwałego powiązania po utworzeniu, więc "bazy są najłatwiejsze" się potwierdza |
| Baza pytań ↔ wielu użytkowników (`editor`/`viewer`) | — | — | Inny typ zagrożenia (uprawnienia, nie żywotność) — zostaje w sekcji "Baza pytań" wyżej, już zaplanowane osobno |

### Logo ↔ gra — konkretny przypadek z rozmowy

Zawężona zasada: blokuj usunięcie/edycję logo **tylko** gdy gra, która je
referencuje, ma teraz aktywny lock `game` (edytor/ustawienia/ankieta —
wspólny klucz, patrz korekta w "Mapa zasobów" niżej) **lub**
jest w trakcie rozgrywki (Control live). Rozpada się na dwie połowy,
obie zależne od rzeczy już wpisanych w plan, ale jeszcze niezrobionych:

1. "Logo ↔ otwarte ustawienia gry" — wymaga najpierw własnej Warstwy 1
   dla logo-editora (`resourceType: "logo"`, wciąż 🔲 w mapie zasobów
   wyżej). Da się zbudować od razu po tym kroku.
2. "Logo ↔ trwająca rozgrywka" — **niemożliwe do zbudowania teraz**: Control
   nie ma dziś żadnego sygnału żywotności dla samej karty control (już
   wcześniej znalezione przy audycie `game-settings.js` — zero
   heartbeatu/presence, `control/js/presence.js` śledzi tylko
   display/host/buzzer). Czeka na zbudowanie Control od podstaw.

Otwarte pytanie (do decyzji, nie zakładam): czy **edycja treści** logo
(nie usunięcie) podczas aktywnego wyświetlania na żywo w ogóle powinna
być blokowana, czy to pożądana funkcja (aktualizacja wyglądu w trakcie
pokazu)? To decyzja produktowa, nie techniczna.

### Model ogólny — ✅ ustalony w rozmowie, do zbudowania jako krok 2.5

Zamiast N osobnych łatek per para zasobów — jeden mechanizm, tym samym
duchem co `resource-lock.js`/`updateChecked` (jedna implementacja,
wszędzie reużywana):

1. **`acquire_edit_lock`/`guardResourceLock` → wynik trójstanowy**:
   `ok` / `locked` (zajęte przez kogoś — dzisiejszy przypadek) /
   **`gone`** (zasób w ogóle już nie istnieje — przegrany wyścig z
   usunięciem gdzie indziej). Ten sam overlay z `resource-lock.js`, inny
   tekst dla `gone` ("Ten zasób został usunięty" + powrót) niż dla
   `locked` ("Edytowane gdzie indziej").
2. **Generyczne RPC `can_delete(resource_type, resource_id)`** — dispatch
   do resolvera "kto się do mnie odwołuje" per typ (różne ścieżki:
   FK dla pytań, `settings->display->logoId` dla logo, itd.), sprawdza
   `edit_locks` po stronie każdego znalezionego odwołującego się zasobu.
   Blokuje usunięcie jawnym `alertModal` (nie overlay — to jednorazowa
   akcja na klik "Usuń", nie strona), jeśli coś żywego korzysta.
   Wywoływane zamiast dzisiejszego gołego `.from(...).delete()` w
   `builder.js` (gra), `logo-editor/js/main.js` (logo), docelowo też
   `bases.js`/`base-explorer` (baza).
3. **Per-strona, przy każdym kolejnym audycie (krok 3+ w "Kolejności
   pracy"), dwa dodatkowe pytania** poza zwykłą Warstwą 1/2:
   - *Jako konsument*: czy ta strona odwołuje się do czegoś, co może jej
     zniknąć pod ręką (potrzebuje `gone` z punktu 1, albo odśwież-i-
     -filtruj jak już zrobione dla pytań w `game-settings.js`)?
   - *Jako cel*: czy ta strona ma akcję usuwania/zmiany, którą trzeba
     przepuścić przez `can_delete` z punktu 2, bo coś innego może z niej
     aktywnie korzystać?
   Lista stron do sprawdzenia pod tym kątem **nie jest zamknięta** —
   rośnie w miarę audytu. Na pewno dotyczy stron-hubów typu
   `polls-hub.js` (może mieć własne, jeszcze nieznalezione relacje), nie
   tylko stron już wymienionych wyżej.

Control zostaje ostatni w kolejności tak czy inaczej (potrzebuje własnego
big-bang projektu stanu rozgrywki), ale dzięki zbudowaniu punktów 1–2
WCZEŚNIEJ, gdy do niego dojdziemy, cały mechanizm już istnieje — Control
dopina tylko swój sygnał żywotności jako kolejny `resource_type` w
`edit_locks`, zamiast wymyślać to od zera na końcu.

### Zależności między konkretnymi parami (skrót)

- Poll-open hardening pytań/odpowiedzi (RLS) — Problem 1, da się zrobić
  **od razu**, niezależnie od reszty, czysto techniczny dług.
- Blokada usuwania gry przy aktywnym `edit_locks` / otwartej ankiecie —
  da się zrobić od razu przez `can_delete`, korzysta z już istniejącej
  tabeli `edit_locks`.
- Logo ↔ ustawienia gry — czeka na Warstwę 1 dla logo (już w kolejce,
  krok 4).
- Logo ↔ Control, i cokolwiek innego "↔ trwająca rozgrywka" — czeka na
  fundament Control (presence/heartbeat), trafia jako jego rozszerzenie
  (krok 7), nie osobny byt.

### `polls-hub.js`: krzyżowe blokady — analiza — ✅ ZAMKNIĘTE (2026-09-02)

Odpowiedź na oba pytania z punktu 3 wyżej ("jako konsument" / "jako cel"),
dla `js/pages/polls-hub.js` konkretnie:

**Jako cel (czy hub ma akcję, którą trzeba przepuścić przez blokadę
`game`)**: NIE. Jedyne zapisy w tym pliku idą przez RPC-e
(`poll_admin_delete_vote`, `polls_hub_share_poll`,
`polls_hub_task_decline`, `polls_hub_tasks_mark_emailed`) i wszystkie
operują wyłącznie na `poll_votes`/`poll_text_entries`/`poll_tasks`/
`poll_subscriptions` — tabelach bookkeepingowych, prywatnych dla huba.
Żadna z nich nie dotyka `questions`/`answers`/`games.settings` — czyli
kolumn, które faktycznie chroni wspólny klucz `game` (edytor/ustawienia/
zamknięcie ankiety). Nie ma więc czego blokować: hub nie koliduje z
edytującym te same dane, bo po prostu nie zapisuje do tych samych
wierszy/kolumn.

**Jako konsument (czy hub odwołuje się do czegoś, co może zniknąć pod
ręką — usunięta gra)**: TAK, referuje `game_id` (`selectedPollId`/
`sharePollId`), ale to już bezpiecznie obsłużone PO STRONIE SERWERA —
sprawdzone w `supabase/schema.sql`:
- `poll_admin_delete_vote(p_game_id, ...)` — `IF NOT EXISTS (SELECT 1
  FROM games WHERE id = p_game_id AND owner_id = u) THEN RETURN
  jsonb_build_object('ok', false, 'error', 'not_owner')` — gra usunięta
  = ten sam kod co "nie twój", RPC nie rzuca, nie kasuje niczego po
  cichu.
- `polls_hub_share_poll(p_game_id, ...)` — analogiczne `if not found
  then return jsonb_build_object('ok', false, 'error', 'game not
  found')`.
- Obie ścieżki w JS **już prawidłowo sprawdzały** (`saveShareModal`) albo
  **NIE sprawdzały wcale** (delete-vote handler w `renderDetailsList`,
  linia ~904) wartości `data?.ok` przed kontynuowaniem — to nie jest
  problem blokad między zasobami, tylko zwykły, mniejszy bug tej samej
  kategorii co Warstwa 2 gdzie indziej (ignorowanie wyniku zapisu).
  Naprawione przy okazji tej analizy:
  - `poll_admin_delete_vote`'s wynik jest teraz sprawdzany
    (`data?.ok === false` → rzuca, pokazuje `MSG.deleteVoteFail()`)
    zanim kod zrobi follow-up update na `poll_tasks`.
  - Ten follow-up update (`status: 'cancelled'`) przepisany na
    `updateChecked("poll_tasks", {id, owner_id}, patch)` zamiast gołego
    `.update()` — gdyby wiersz zniknął (np. kaskadowe usunięcie razem z
    grą), rzuci zamiast cicho nic nie robić.
  - `polls_hub_task_decline`'s zwracana wartość (`boolean` — `found`)
    była całkowicie ignorowana — teraz sprawdzana, `false`/`null` rzuca
    błąd zamiast fałszywie zamykać modal potwierdzenia jako sukces.
  - `polls_hub_tasks_mark_emailed`'s wynik świadomie NIE dostał tego
    traktowania — to najlepszej-próby bookkeeping PO wysłaniu maila
    (już i tak w bloku bez krytycznego znaczenia dla użytkownika, sam
    plik już ma podobne, świadomie nieblokujące try/catch obok niego).

**Wniosek**: `polls-hub.js` nie potrzebuje Warstwy 1 (nie jest ani
konsumentem, ani celem krzyżowej blokady zasobu `game` w sensie, który
mógłby coś popsuć) — wcześniejszy wpis w planie "poza zakresem" był
słuszny, tylko nieprzeanalizowany do końca. Dwa drobne bugi (ignorowane
wyniki RPC/update) naprawione przy okazji, bez nowego pliku e2e — żaden
z nich nie dotyczy modelu blokad, więc nie pasuje do żadnego istniejącego
zestawu testów lockowania, a dodawanie osobnego pliku dla dwóch
jednolinijkowych poprawek "sprawdź wynik przed kontynuacją" uznane za
nieproporcjonalne; pokrycie przez samą oczywistość zmiany (ten sam wzorzec
`if (error) throw` już wszędzie indziej w tym pliku).

---

## Control — 🔲 ODŁOŻONE, osobny kompleksowy punkt

Świadomie nieruszane teraz — blokada (Warstwa 1) i zapis/przywracanie
stanu rozgrywki mają być zaprojektowane i wdrożone **razem**, nie osobno,
bo są ze sobą powiązane (np. blokada nie ma sensu bez realnego stanu do
przejęcia po drugiej stronie). Wracamy do tego po zamknięciu edytora,
ustawień, ankiety, logo i bazy pytań.

Znalezione podczas wstępnego przeglądu `control/js/store.js`:

- Cały stan rozgrywki (wynik, runda, faza, drużyny, timer finału) żyje
  wyłącznie w `localStorage` (`familiada:control:v5:<gameId>`), zapisywany
  przy każdej zmianie (`emit()` → `localStorage.setItem`).
- **Nic w całym repo nigdy tego nie odczytuje z powrotem** — brak
  `localStorage.getItem(KEY)` przy starcie, brak nasłuchu na zdarzenie
  `storage`. Odświeżenie karty control w trakcie gry zeruje cały postęp
  bez ostrzeżenia i bez możliwości odzyskania.
- `control/js/presence.js` śledzi tylko urządzenia display/host/buzzer —
  NIE samą kartę control. Dwie karty control tej samej gry (ten sam
  komputer albo dwa różne) działają całkowicie niezależnie, każda z
  własnym stanem w pamięci, i obie mogą wysyłać komendy do tych samych
  fizycznych urządzeń bez żadnej koordynacji ani wzajemnego ostrzeżenia.
- **Powiązane, znalezione przy audycie `game-settings.js`**: martwy klucz
  i18n `control.ingameGuard` (`title: "Gra w toku"`, `message: "Nie
  możesz zmieniać ustawień podczas trwającej gry..."`, `unlock: "Odblokuj
  ustawienia"`) istnieje w `translation/{pl,en,uk}.js`, ale **zero
  wystąpień w kodzie JS** — funkcja "zablokuj ustawienia gry, gdy jest
  aktualnie prowadzona na żywo" była wyraźnie zaprojektowana (tekst UI już
  gotowy) i nigdy nie dopięta. Bez tego zmiana np. drużyn/dźwięku/
  multiplikatorów w `game-settings.js` w trakcie rozgrywki rozjeżdża się
  z tym, co `control/` już wczytał do pamięci na starcie sesji.

Do zrobienia (razem, jako jeden pakiet):
1. Zaprojektować realny restore stanu (co najmniej: odczyt z
   localStorage przy starcie karty control, żeby przypadkowe
   odświeżenie/zamknięcie karty nie zerowało rozgrywki).
2. Blokada (Warstwa 1) drugiej aktywnej karty control dla tej samej gry
   (np. przez `device_presence` albo osobny heartbeat), z ostrzeganiem
   przed kolizją komend zamiast cichego działania dwóch kart naraz.
3. Ten sam mechanizm z punktu 2 (karta control "melduje się" jako
   aktywna) daje za darmo sygnał "gra jest w toku" — wykorzystać go do
   dokończenia `control.ingameGuard` w `game-settings.js`: blokada
   wejścia/zapisu ustawień, gdy control dla tej gry jest aktywny,
   z realnym przyciskiem "Odblokuj ustawienia" (tekst UI już istnieje).
   Świadomie NIE robimy tego wcześniej jako prowizorki na `display`/
   `host` presence — to tylko przybliżenie i dokładałoby dług techniczny
   zamiast go spłacać.
