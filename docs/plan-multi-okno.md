# Plan: testy e2e i audyt "wielu miejsc naraz" (karty/okna/urządzenia)

Status: 🔲 = do zrobienia | 🔄 = w trakcie | ✅ = zrobione

Kontekst: `tests/e2e/editor.spec.js` (20 testów) pokazało, że edytor gier
nie ma żadnej synchronizacji między kartami ani re-walidacji stanu gry
per-akcja — druga karta może cicho nadpisać/zignorować zmiany pierwszej.
Ten plik śledzi rozszerzenie tego audytu na resztę aplikacji i poprawki,
które z niego wynikają.

---

## Mechanizm: wspólne wykrywanie "cichego sukcesu" — 🔲 do wdrożenia stopniowo

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
zmieniony/usunięty w innym miejscu, odśwież". Wprowadzać **stopniowo, przy
audycie/poprawce każdej strony z listy niżej**, zaczynając od edytora — nie
jako osobny, jednorazowy refaktor całej apki na raz.

---

## Pełna lista miejsc do audytu

Wszystkie strony, które faktycznie zapisują dane (na podstawie realnych
wywołań `.update/.upsert/.insert/.delete` w kodzie) i mogą ucierpieć na
otwarciu "w dwóch miejscach naraz" (dwie karty tej samej osoby, dwóch
różnych użytkowników, albo nieaktualne dane po zmianie gdzie indziej):

| Strona | Co edytuje | Status |
|---|---|---|
| `js/pages/editor.js` | pytania/odpowiedzi gry | ✅ 20 testów e2e, 1 fix zrobiony, 🔲 1 fix zaplanowany (patrz sekcja "Edytor gier") |
| `js/pages/polls.js` | zamykanie ankiety | ✅ sprawdzone, bezpieczne (guard status w samym RPC) |
| `js/pages/game-settings.js` | ustawienia gry (drużyny, wygląd, dźwięk, finał/rundy) | 🔲 2 realne bugi znalezione (patrz sekcja dedykowana) |
| `js/pages/builder.js` | lista gier — tworzenie/nazwa/usuwanie/duplikowanie | 🔲 nieprzejrzane |
| `js/pages/builder-import-export.js` | import/eksport całych gier | 🔲 nieprzejrzane |
| `js/pages/bases.js` | lista baz pytań, zarządzanie udostępnieniami | 🔲 nieprzejrzane |
| `base-explorer/` (`actions.js`, `state.js`, `tags-modal.js`, `export-modal.js`) | edycja bazy pytań | 🔲 zaplanowane osobno — patrz sekcja "Baza pytań" (CRUD, dwóch różnych użytkowników, uprawnienia) |
| `js/pages/generator.js` | generator gier (AI) — wpisuje pytania/odpowiedzi do gry | 🔲 nieprzejrzane — może kolidować z edytorem otwartym na tej samej grze |
| `logo-editor/js/main.js` | edytor logo (zapis do `user_logos`) | 🔲 nieprzejrzane |
| `js/pages/settings.js` | ustawienia konta użytkownika (nie gry) | 🔲 nieprzejrzane, niższy priorytet |
| `js/pages/polls-hub.js` | lista ankiet (hub) | 🔲 nieprzejrzane, niższy priorytet |
| `js/pages/subscriptions.js` | subskrypcja/płatności | 🔲 nieprzejrzane, niski priorytet |
| `js/pages/login.js`, `account.js`, `confirm.js` | logowanie / migracja gościa | ✅ przerobione wcześniej (deferred guest migration) |
| `control/` | prowadzenie rozgrywki — zapis/przywracanie stanu | 🔲 następne, inna kategoria (localStorage, nie DB) — patrz sekcja "Control" |

Kolejność pracy: **najpierw dokończyć edytor** (fix niżej), potem iść po
liście od góry, każdą stronę traktując jako osobny mini-audyt + ew.
poprawka z użyciem wspólnego mechanizmu opisanego wyżej.

---

## Edytor gier (`js/pages/editor.js`)

✅ 20 testów e2e (`tests/e2e/editor.spec.js`) — limity, import, kolejność
(`ord`), blokady stanu gry (`poll_open`/`ready`), dwie karty naraz.

✅ Poprawka: puste pole pytania — fallback do domyślnego tekstu (tak jak
już działało dla odpowiedzi), zamiast próby zapisania pustego stringa
i cichego desyncu UI/bazy przy błędzie constraintu `questions_text_len`.

🔲 Poprawka (następna w kolejce): edycja pytania/odpowiedzi usuniętej w
innej karcie kończy się fałszywym "Zapisano." (UPDATE trafiający w 0
wierszy nie jest rozpoznawany jako błąd). Ma być pierwszym miejscem, gdzie
wchodzi wspólny helper `updateChecked` opisany wyżej — żeby edytor był
"zamknięty" zanim przejdziemy do kolejnych stron z listy.

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

---

## Baza pytań (`base-explorer/`) — bardzo dokładny test + współdzielenie — 🔲 do zrobienia

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

## Control — zapis i przywracanie stanu rozgrywki — 🔲 NASTĘPNE (po liście wyżej)

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

Do zrobienia:
1. Zaprojektować realny restore stanu (co najmniej: odczyt z
   localStorage przy starcie karty control, żeby przypadkowe
   odświeżenie/zamknięcie karty nie zerowało rozgrywki).
2. Rozważyć wykrywanie drugiej aktywnej karty control dla tej samej gry
   (np. przez `device_presence` albo osobny heartbeat) i ostrzeganie
   przed kolizją komend.
