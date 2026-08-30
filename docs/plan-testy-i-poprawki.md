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
| `js/pages/polls.js` | zamykanie ankiety | ✅ Warstwa 2 gotowa (guard w RPC), 🔲 Warstwa 1 do dodania |
| `js/pages/game-settings.js` | ustawienia gry (drużyny, wygląd, dźwięk, finał/rundy) | ✅ **ZAMKNIĘTE** — obie warstwy zrobione, 3/3 testów e2e (run #56, 3/3) |
| `logo-editor/js/main.js` | edytor logo (zapis do `user_logos`) | ✅ **ZAMKNIĘTE** — Warstwa 1 + Warstwa 2 (krok 4), 14/14 e2e (run #68) |
| `js/pages/builder.js` | lista gier — tworzenie/nazwa/usuwanie | ✅ **ZAMKNIĘTE** — rename/reset/delete sprawdzają busy; duplikowanie NIE istnieje (sprawdzone w kodzie) |
| `js/pages/builder-import-export.js` | import/eksport całych gier | ✅ import bezpieczny z natury (zawsze nowe wiersze); eksport dostał busy-check w `builder.js` (czyta grę/pytania/odpowiedzi w kilku zapytaniach po kolei — bez tego mógłby złapać rozjechany stan przy edycji w tym samym momencie) — ✅ e2e zielone (run #70, 16/16) |
| `js/pages/bases.js` | lista baz pytań, zarządzanie udostępnieniami | ✅ `createBase`/`exportBase`/`importBase` bezpieczne z natury (nowe wiersze/odczyt). 🔲 `renameBase`/`deleteBase` piszą bez busy-check — **celowo odłożone do kroku 6**, bo `base-explorer.js` jeszcze nie trzyma żadnego locka `base` do sprawdzenia (dodać RAZEM z Warstwą 1 tam) |
| `base-explorer/` (`actions.js`, `state.js`, `tags-modal.js`, `export-modal.js`) | edycja bazy pytań | 🔲 dogłębny audyt najpierw, Warstwa 1 dopiero potem — patrz sekcja "Baza pytań" |
| `js/pages/generator.js` | generator gier (AI) dla producentów/marketplace | ✅ **poza zakresem tego audytu** — sprawdzone w kodzie: pisze wyłącznie przez Edge Function do `market_games`, fizycznie innej tabeli niż `games`/`questions`/`answers` — zero możliwej kolizji z edytorem/ustawieniami/ankietą. Wcześniejszy wpis w planie był błędny |
| `js/pages/polls-hub.js` | lista ankiet (hub) — anuluje zadania ankietowe, usuwa głosy | ✅ **sprawdzone, poza zakresem** — patrz wiersz przy zasobie `game` wyżej |
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

## Baza pytań (`base-explorer/`) — bardzo dogłębny audyt + współdzielenie — 🔲 do zrobienia

**Kolejność: najpierw pełny audyt i testy (A/B/C niżej), Warstwa 1
(blokada `base_id`) i utwardzenie Warstwy 2 dopiero na końcu** — świadomie
odłożone, żeby ochrona była oparta na tym, co audyt faktycznie znajdzie, a
nie zgadywana z góry.

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

Uwaga do Warstwy 1 dla bazy: blokada całej bazy na raz jest prostsza, ale
wyklucza legalną jednoczesną pracę właściciela + `editor`-a nad różnymi
pytaniami w tej samej bazie — decyzja do podjęcia po audycie B) niżej,
kiedy będzie jasne jak bardzo to w praktyce przeszkadza.

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

### B) Równoległa edycja przez DWÓCH RÓŻNYCH użytkowników (nie dwie karty tego samego)
W odróżnieniu od edytora gier (tylko właściciel), tu trzeba realnie
zalogować DWA różne konta testowe na tej samej, współdzielonej bazie:
- Właściciel + `editor` edytują **to samo pytanie** niemal jednocześnie —
  które wygrywa (ostatni zapis), czy drugi użytkownik dostaje jakikolwiek
  sygnał, że coś się zmieniło pod nim.
- Jeden usuwa pytanie/kategorię/tag, którego drugi używa/edytuje w tej
  samej chwili (ten sam wzorzec "cichego sukcesu" co w edytorze gier —
  do sprawdzenia, czy tu też występuje).
- Właściciel usuwa dostęp (`question_base_shares` DELETE) drugiemu
  użytkownikowi W TRAKCIE, gdy ten ma bazę otwartą i coś edytuje — czy
  kolejna akcja jest poprawnie odrzucona (RLS powinno to i tak zablokować
  na poziomie bazy), i czy UI to w ogóle komunikuje, czy tylko cicho
  nic się nie dzieje.

### C) Granica uprawnień odczyt/edycja
- `viewer` nie może dodać/edytować/usunąć pytania, kategorii ani tagu —
  potwierdzić, że to faktycznie blokuje RLS (próba bezpośrednio przez
  RPC/klienta, nie tylko brak przycisku w UI), i że UI w ogóle nie
  pokazuje kontrolek edycji dla `viewer` (albo pokazuje, ale klik kończy
  się czytelnym błędem, nie cichą porażką).
- Zmiana roli `editor` → `viewer` w locie (właściciel obniża uprawnienia
  gdy tamten ma bazę otwartą) — czy klient to zauważa, czy trzeba
  odświeżyć stronę, żeby przestać móc "edytować" coś, co i tak nie
  zapisze się w bazie.
- Próba `viewer`-a wywołania akcji właściciela (np. zmiana nazwy bazy,
  zarządzanie udostępnieniami) — powinno być odrzucone już na poziomie
  `qb_bases_update`/`qb_shares_write` (tylko `owner_id`).

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

E2e: `tests/e2e/base-explorer.spec.js` (5 testów, po jednym na każdy
naprawiony bug: eksport, cykl folderów, stale-payload rename, cascade
usuwania folderu, hang modala tagów) — 🔄 e2e w toku (jeszcze nie
uruchomione na CI).

**Runda 2 (na żądanie: "przetestować cały panel", nie tylko już znalezione
bugi)** — dodano `tests/e2e/base-explorer-crud.spec.js` (15 testów:
question-modal CRUD + limity, tagi tri-state + duplikaty, wyszukiwanie
tekstowe i po `#tagu`, wytnij/kopiuj/wklej, drag&drop pytania na folder w
liście, oraz DWA REALNE konta testowe — `TEST_USERNAME`/`TEST_USERNAME_2`
— dla `editor`/`viewer` na współdzielonej bazie, w tym próba zapisu
viewera bezpośrednio przez klienta z pominięciem UI). `loginAsTestUser()`
w `helpers/login.js` dostał opcjonalny `{ username }` do logowania
drugiego konta. Przy pisaniu tych testów znaleziony i naprawiony KOLEJNY
samodzielny bug: `Ctrl+A` (`actions.js` w keydown handlerze) filtrował
wiersze po atrybucie `data-key`, którego żaden wiersz nigdy nie miał
(wszystkie mają `data-kind`+`data-id`) — zaznacz-wszystko było od zawsze
całkowicie martwe, naprawione przez użycie istniejącego `currentRowKeys()`.
🔄 e2e w toku. Kolejne rundy będą dochodzić w miarę potrzeby (drag&drop
folderów międzysobą poza cyklem, widok META z lewego panelu, mobile
long-press/double-tap) — nie ma sztywnego celu liczby testów, chodzi o
realne pokrycie funkcji panelu.

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
