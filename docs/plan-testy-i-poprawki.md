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

| Zasób (klucz blokady) | Strona | Kiedy wdrożyć |
|---|---|---|
| `game_id` (edytor) | `js/pages/editor.js` | ✅ zrobione i przetestowane e2e |
| `game_id` (ustawienia) | `js/pages/game-settings.js` | ✅ zrobione i przetestowane e2e (run #56, 3/3) |
| `game_id` (ankieta) | `js/pages/polls.js` | 🔲 po ustawieniach (Warstwa 2 już ✅ gotowa — sam RPC ma guard) |
| `logo_id` | `logo-editor/js/main.js` | 🔲 po ankiecie |
| `base_id` | `base-explorer/` | 🔲 **świadomie odłożone** do PO dogłębnym audycie i testach bazy (patrz sekcja "Baza pytań") |
| `game_id` (rozgrywka) | `control/` | 🔲 **świadomie odłożone**, osobny kompleksowy punkt razem z zapisem/przywracaniem stanu (patrz sekcja "Control") |

Każdy zasób blokowany osobno pod własnym kluczem — otwarcie edytora gry
nie blokuje jej ustawień ani ankiety w innej karcie, i odwrotnie.
Blokada obejmuje też własne drugie okno tego samego użytkownika (prościej
i spójniej, niż robić wyjątek "to moja sesja" — to był oryginalny problem
zgłoszony dla edytora).

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
3. **Ankieta** (`polls.js`) — Warstwa 2 już ✅ gotowa (guard w RPC), dołożyć
   tylko Warstwę 1 dla spójności UX.
4. **Edytor logo** (`logo-editor/`) — audyt Warstwy 2 (nieprzejrzane) +
   Warstwa 1.
5. Reszta z "Pełnej listy miejsc do audytu" niżej (`builder.js`,
   `builder-import-export.js`, `bases.js`, `generator.js`, `settings.js`,
   `polls-hub.js`, `subscriptions.js`) — audyt Warstwy 2, Warstwa 1 gdzie
   ma to sens.
6. **Baza pytań** (`base-explorer/`) — **najpierw** bardzo dogłębny audyt +
   testy (CRUD, dwóch różnych użytkowników, uprawnienia — sekcja niżej),
   **dopiero potem** Warstwa 1 (blokada `base_id`) i utwardzenie Warstwy 2
   na podstawie tego, co audyt znajdzie.
7. **Control** — odłożone jako osobny, kompleksowy punkt: blokada
   (Warstwa 1) i zapis/przywracanie stanu rozgrywki robione razem, nie
   osobno (sekcja niżej).

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
| `logo-editor/js/main.js` | edytor logo (zapis do `user_logos`) | 🔲 nieprzejrzane + Warstwa 1 |
| `js/pages/builder.js` | lista gier — tworzenie/nazwa/usuwanie/duplikowanie | 🔲 nieprzejrzane |
| `js/pages/builder-import-export.js` | import/eksport całych gier | 🔲 nieprzejrzane |
| `js/pages/bases.js` | lista baz pytań, zarządzanie udostępnieniami | 🔲 nieprzejrzane |
| `base-explorer/` (`actions.js`, `state.js`, `tags-modal.js`, `export-modal.js`) | edycja bazy pytań | 🔲 dogłębny audyt najpierw, Warstwa 1 dopiero potem — patrz sekcja "Baza pytań" |
| `js/pages/generator.js` | generator gier (AI) — wpisuje pytania/odpowiedzi do gry | 🔲 nieprzejrzane — może kolidować z edytorem otwartym na tej samej grze |
| `js/pages/settings.js` | ustawienia konta użytkownika (nie gry) | 🔲 nieprzejrzane, niższy priorytet |
| `js/pages/polls-hub.js` | lista ankiet (hub) | 🔲 nieprzejrzane, niższy priorytet |
| `js/pages/subscriptions.js` | subskrypcja/płatności | 🔲 nieprzejrzane, niski priorytet |
| `js/pages/login.js`, `account.js`, `confirm.js` | logowanie / migracja gościa | ✅ przerobione wcześniej (deferred guest migration) |
| `control/` | prowadzenie rozgrywki — zapis/przywracanie stanu | 🔲 **odłożone**, osobny kompleksowy punkt — patrz sekcja "Control" |

---

## Edytor gier (`js/pages/editor.js`)

✅ 20 testów e2e (`tests/e2e/editor.spec.js`) — limity, import, kolejność
(`ord`), blokady stanu gry (`poll_open`/`ready`), dwie karty naraz.

✅ Poprawka: puste pole pytania — fallback do domyślnego tekstu (tak jak
już działało dla odpowiedzi), zamiast próby zapisania pustego stringa
i cichego desyncu UI/bazy przy błędzie constraintu `questions_text_len`.

✅ Warstwa 1: blokada `game_id` na wejściu do edytora (`guardResourceLock`,
`resourceType: "game_editor"`). Test e2e ("dwie karty — druga karta jest
blokowana overlayem zamiast cichej edycji, zwalnia się po zamknięciu
pierwszej") zielony na produkcji (run #50) — druga karta dostaje overlay
zamiast wejść w edycję, po zamknięciu pierwszej karty druga wchodzi i
poprawnie widzi obie pytania. Przy okazji wyłapał i naprawił realny bug
(patrz wyżej, sekcja "Warstwa 1 — ogólny mechanizm").

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

✅ Warstwa 1: blokada `game_id` (`resourceType: "game_settings"` — osobny
klucz niż edytor, otwarcie ustawień nie blokuje edytora tej samej gry i
odwrotnie), dokładnie ten sam `guardResourceLock` co w edytorze.

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

Poprawki wypchnięte, czeka na kolejne uruchomienie.

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
