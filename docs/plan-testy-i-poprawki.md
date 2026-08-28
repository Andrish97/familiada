# Plan: testy e2e i audyt "wielu miejsc naraz" (karty/okna/urządzenia)

Status: 🔲 = do zrobienia | 🔄 = w trakcie | ✅ = zrobione

Kontekst: `tests/e2e/editor.spec.js` (20 testów) pokazało, że edytor gier
nie ma żadnej synchronizacji między kartami ani re-walidacji stanu gry
per-akcja — druga karta może cicho nadpisać/zignorować zmiany pierwszej.
Ten plik śledzi rozszerzenie tego audytu na resztę aplikacji i poprawki,
które z niego wynikają.

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

## Warstwa 1 — ogólny mechanizm blokady (budować JAKO PIERWSZE)

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

**To ma powstać jako pierwszy krok, przed poprawkami per-strona** —
dopiero mając gotowy ogólny mechanizm, każda strona z listy niżej dokłada
tylko jedno wywołanie `acquireResourceLock` + `showResourceLockedOverlay`
z własnym `resourceType`/`resourceId`/treścią, zamiast każda strona
wymyślała blokadę od nowa.

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
  cudzej blokady). Wołane na `visibilitychange`/`beforeunload` (best
  effort) — jeśli nie zdąży odpalić (crash karty), i tak wygasa przez TTL
  przy następnej próbie `acquire` kogoś innego.

**Kto i jak czyta**: RLS `SELECT` z tym samym warunkiem dostępu co RPC
(właściciel zasobu / `base_can_access()` dla bazy) — każdy uprawniony do
zasobu widzi czy jest zajęty, ale nie może nic zapisać poza RPC.

**Przepływ na stronie**:
1. Start strony (po `requireAuth`, przed renderem edytowalnej treści):
   `holder_tab_id` z `sessionStorage` (per-karta, przeżywa odświeżenie tej
   samej karty) → `acquire_edit_lock`.
2. `ok:false` → `showResourceLockedOverlay(...)`, treść nie ładowana;
   subskrypcja `rt(`edit-lock:${type}:${id}`).onBroadcast("RELEASED", ...)`
   żeby ponowić próbę natychmiast po zwolnieniu, bez czekania na kolejny
   heartbeat.
3. `ok:true` → renderuj normalnie, `setInterval` odnawiający co ~8s.
4. Zamknięcie/schowanie karty → `release_edit_lock` + broadcast
   `"RELEASED"` na kanale zasobu, żeby czekający dowiedzieli się od razu.

### Mapa zasobów (po zbudowaniu ogólnego mechanizmu)

| Zasób (klucz blokady) | Strona | Kiedy wdrożyć |
|---|---|---|
| `game_id` (edytor) | `js/pages/editor.js` | 🔲 **pierwsze** — razem z Warstwą 2 dla edytora |
| `game_id` (ustawienia) | `js/pages/game-settings.js` | 🔲 po edytorze |
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

0. **Ogólny mechanizm blokady** (`js/core/resource-lock.js`) — zbudować
   NAJPIERW, na wzorcu `guardDesktopOnly()` + `showGuestBlockedOverlay()`
   (patrz wyżej), zanim jakakolwiek strona dostanie Warstwę 1.
1. **Edytor gier** (`editor.js`) — dokończyć Warstwę 2 (fix "cichego
   sukcesu"), potem dołożyć Warstwę 1 (blokada `game_id`). Ma być
   "zamknięty" jako pierwszy, w pełni od obu stron.
2. **Ustawienia gry** (`game-settings.js`) — Warstwa 2 (fix nadpisywania
   `settings` + nieaktualnej listy pytań) + Warstwa 1.
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
| `js/pages/editor.js` | pytania/odpowiedzi gry | ✅ 20 testów e2e, 1 fix (Warstwa 2) zrobiony, 🔲 1 fix zaplanowany + Warstwa 1 |
| `js/pages/polls.js` | zamykanie ankiety | ✅ Warstwa 2 gotowa (guard w RPC), 🔲 Warstwa 1 do dodania |
| `js/pages/game-settings.js` | ustawienia gry (drużyny, wygląd, dźwięk, finał/rundy) | 🔲 2 realne bugi (Warstwa 2) + Warstwa 1 |
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

🔲 Poprawka (Warstwa 2, następna w kolejce): edycja pytania/odpowiedzi
usuniętej w innej karcie kończy się fałszywym "Zapisano." (UPDATE
trafiający w 0 wierszy nie jest rozpoznawany jako błąd). Ma być pierwszym
miejscem, gdzie wchodzi wspólny helper `updateChecked`.

🔲 Warstwa 1: blokada `game_id` na wejściu do edytora, po dokończeniu
Warstwy 2 — żeby edytor był "zamknięty" od obu stron zanim przejdziemy do
kolejnych stron z listy.

---

## Ustawienia gry (`js/pages/game-settings.js`) — 🔲 do zrobienia

Dwa realne problemy, gorsze niż w edytorze:

1. `saveAll()` nadpisuje CAŁĄ kolumnę `games.settings` (JSONB) lokalnym
   obiektem wczytanym raz przy starcie strony — zero kontroli wersji
   (brak porównania `updated_at`, brak merge). Dwie karty otwarte na tych
   samych ustawieniach → kto zapisze ostatni, bezpowrotnie kasuje zmiany
   drugiej karty, nawet z zupełnie innej zakładki ustawień (np. zapis
   zmiany dźwięku w karcie B wymazuje zmianę nazw drużyn zrobioną wcześniej
   w karcie A).
2. `allQuestions` (lista pytań do wyboru finału/kolejności rund) wczytywana
   raz przy starcie. Jeśli w międzyczasie w edytorze (inna karta) ktoś
   usunie pytanie, karta ustawień dalej trzyma jego stary obiekt na liście
   finałowej/rund — zapis wpisuje do `settings` odniesienie do już
   nieistniejącego pytania.

🔲 Warstwa 1: blokada `game_id` (osobny klucz niż edytor — otwarcie
ustawień nie blokuje edytora tej samej gry i odwrotnie).

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

Do zrobienia (razem, jako jeden pakiet):
1. Zaprojektować realny restore stanu (co najmniej: odczyt z
   localStorage przy starcie karty control, żeby przypadkowe
   odświeżenie/zamknięcie karty nie zerowało rozgrywki).
2. Blokada (Warstwa 1) drugiej aktywnej karty control dla tej samej gry
   (np. przez `device_presence` albo osobny heartbeat), z ostrzeganiem
   przed kolizją komend zamiast cichego działania dwóch kart naraz.
