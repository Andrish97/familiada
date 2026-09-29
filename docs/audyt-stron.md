# Audyt stron — jak robimy (metoda)

Strony powstawały „w czacie tekstowym GPT” — są nieczytelne i często
zbugowane. Audytujemy je po kolei, jedna strona na raz. Zrobione:
**logo-editor**, **bases**, **games** (2026-09-26), **editor** (2026-09-27),
**poll-qr / poll-points / poll-text / poll-go** (2026-09-29). Następna: do ustalenia.

## Kroki

1. **Lektura całości**: `<strona>.html`, `js/pages/<strona>.js`,
   `css/<strona>.css` + używane moduły z `js/core/`. Spisz listę błędów
   z konkretnym scenariuszem („co zrobić → co się psuje”), nie ogólniki.
2. **Weryfikuj po stronie bazy**: definicje RPC/tabel/RLS są w
   `supabase/migrations/` (większość w `2026-03-01_000_baseline.sql`).
   Sprawdzaj kształt odpowiedzi (RPC `RETURNS TABLE` → supabase-js daje
   **tablicę**), statusy, przeciążenia funkcji (dwie wersje z tą samą
   nazwą parametru = błąd PGRST203 w PostgREST).
3. **Klucze tłumaczeń**: każdy nowy tekst w `translation/pl.js`, `en.js`,
   `uk.js`. Szybki test: wypisz klucze `t("...")` i `data-i18n` ze strony
   i sprawdź, czy istnieją we wszystkich trzech plikach.
4. **Poprawki** — minimalne, w stylu kodu obok (komentarze po polsku,
   wyjaśniające DLACZEGO). Propozycje zmian UX są mile widziane.
5. **Testy e2e** w `tests/e2e/<strona>.spec.js` — na **prawdziwym
   backendzie i kontach testowych** (test1@…, test2@… przez
   `loginAsTestUser(page, context, { username: testAccountUsername(n) })`).
   **Bez atrap** Supabase.
6. **Testuj kod z brancha, nie z produkcji**:
   `tests/e2e/helpers/branch-code.js` → `serveBranchCode(context, { pages: ["<strona>"] })`
   serwuje stronę i cały front-end (`js/ css/ translation/ shared/`) z plików
   repo, a backend zostaje prawdziwy. W specu:
   `test.use({ serviceWorkers: "block" })` + `beforeEach` z `serveBranchCode`
   (drugi kontekst przeglądarki też musi go dostać — patrz `newUserContext`
   w `bases.spec.js`). Strona logowania zawsze idzie z produkcji.
7. **Uruchamianie**: workflow `e2e-tests.yml` (tylko workflow_dispatch) na
   swoim branchu, `spec_filter: "e2e/<strona>.spec.js"`. Kontener Claude nie
   ma dostępu do produkcji — testy tylko przez workflow. Po failu: logi joba
   (`[e2e-diag]` pokazuje RPC i błędy konsoli).

   **TWARDA ZASADA**: `spec_filter` PUSTE = job `e2e-grouped`, WSZYSTKIE
   grupy naraz (~40 min, cały zestaw). Nie odpalać tego przy audycie jednej
   strony — zawsze podawać `spec_filter` z konkretnym plikiem/kilkoma
   plikami/`--grep`. Kilka plików naraz OK, jeśli faktycznie dotyczą tego
   samego audytu (np. wszystkie specy jednej strony) — to nie to samo co
   cały zestaw. Po każdej poprawce odpalać PONOWNIE ten sam scoped batch i
   czytać `gh run view <id> --log-failed`, nie zgadywać.
8. **Wdrożenie**: push na `main` (użytkownik zgadza się na push na main).
   Push wdraża strony (`deploy-pages.yml`) i nakłada nowe migracje
   (`db-migrate.yml`, migracje forward-only, nazwa `YYYY-MM-DD_NNN_opis.sql`).
   Po wdrożeniu jeszcze raz workflow e2e na `main`.
9. **Raport dla użytkownika**: lista błędów (co było źle, jak objawiało się
   użytkownikowi), co poprawione, wynik testów, co zostaje do decyzji.

## Czego pilnować (typowe błędy z bases)

- Pełne `render()` po zwykłym kliknięciu → podwójne tapnięcie
  (`rename-gesture.js`) na dotyku nie działa, bo drugi tap trafia w nowy
  element. Zaznaczenie = przełączanie klasy, nie przebudowa listy.
- Komunikat ustawiony PRZED funkcją, która czyści formularz → znika.
- Kod przypadkiem zagnieżdżony w złym `if` (złe wcięcia).
- Brak blokady podwójnego wysłania (Enter + klik).
- Błędy async bez `catch` (auto-odświeżanie) → nieobsłużone odrzucenia,
  strona zostaje jako szkielet.
- Eksport/import niesymetryczne (coś eksportowane, a nie importowane albo
  odwrotnie); import nieatomowy bez sprzątania po błędzie.
- Style z innej strony (np. `polls-hub.css`), które nie są ładowane.

- RPC zwracające mniej, niż zakłada kod (games: `market_my_library` bez
  `payload` → podgląd zawsze „Brak pytań”).
- Regex `\w` w nazwach plików — to tylko ASCII, gubi polskie/ukraińskie litery.
- Spóźnione odpowiedzi async (szybkie klikanie A → B) nadpisujące stan B.
- Treść składana w JS nie tłumaczy się po zmianie języka — potrzebny
  listener `i18n:lang` z ponownym `render()`.
- Kilka zależnych zapisów z przeglądarki (reset, import) → jedno RPC albo
  sprzątanie po błędzie.

- **Setup testu robiący surowy `update` tabeli tam, gdzie prawdziwe UI woła
  RPC** → RPC ma efekty poboczne, których surowy update nie robi (np.
  `poll_open()` oprócz `status='poll_open'` zakłada wiersze `poll_sessions`,
  bez których głosowanie rzuca „No open session” — objaw wyglądał jak
  kolizja kont testowych, a to był brak seedowania sesji). Zawsze sprawdzać
  w `schema.sql`, co DOKŁADNIE robi RPC używane przez prawdziwe UI, i użyć
  tego samego RPC w setupie testu, nie odtwarzać go „na oko” samym update'em.
- **Błąd z RPC (`RAISE EXCEPTION`) matchowany po `error.code`** — kody typu
  `PGRST116` dotyczą tylko `.single()` na zapytaniach do tabel, NIE
  wyjątków z funkcji plpgsql. Matchować po `error.message` (treść z RAISE),
  inaczej warunek nigdy nie jest prawdziwy i zawsze wpada w domyślny/ogólny
  komunikat błędu.
- **Parametr RPC typu `uuid` testowany losowym stringiem** (np.
  `"invalid-token-123"`) → rzuca błąd rzutowania typu (ogólny komunikat),
  nie trafia w gałąź „nie znaleziono”. Do testowania „token nie istnieje”
  używać poprawnie sformatowanego, ale nieistniejącego UUID
  (`00000000-0000-0000-0000-000000000000`).
- **Test na nielogowanej/anonimowej stronie z asercją na polski tekst** —
  bez `loginAsTestUser` kontekst nie ma `localStorage.uiLang=pl` i
  renderuje się po `navigator.language` (w CI: en-US), więc twardy polski
  string w asercji (np. `button:has-text('Zaloguj')`) nie znajdzie
  elementu. Albo `context.addInitScript(() => localStorage.setItem("uiLang","pl"))`
  przed `goto`, albo regex obejmujący PL/EN/UK (tak jak w `polls.spec.js`).
- **`toContainText("a|b|c")` ze stringiem zamiast regexem** — to dosłowny
  substring, nie OR. Trzeba `toContainText(/a|b|c/)` (regex literal).
  Sprawdzać każdy oczekiwany tekst `grep`-em w `translation/*.js`, nie z
  pamięci — i sprawdzić, KTÓRA gałąź `if/else` faktycznie się wykona dla
  danych z testu, nie tylko która „powinna”.
- **`.catch()` na `sb.rpc(...)` bez `await`/destrukturyzacji** —
  `PostgrestFilterBuilder` to thenable, nie prawdziwy `Promise`, nie ma
  `.catch()`. Używać `try/catch` albo `const { data, error } = await
  sb.rpc(...)`.

## Games — zrobione (2026-09-26)

Testy: `tests/e2e/games.spec.js`. Migracja 272: `game_reset_poll_for_edit`
(atomowy reset ankiety, wspólny dla games.js i editor.js) oraz zamiana
osieroconych kopii gier ze Społeczności (`type='market'`,
`source_market_id` NULL) na grę preparowaną.

Migracja 273: `game_validate(p_game_id)` — jedyne miejsce z regułami „czy
wolno edytować / grać / wejść w ankietę / otworzyć / zamknąć ankietę /
eksportować”. Zwraca dla każdej akcji `{ok, code, params}`, strona tłumaczy
`gameValidate.<code>`. Używają go games, editor, polls, polls-hub i control
(`validateGame()` w `js/core/game-validate.js`); lokalne kopie reguł w
polls.js i stare funkcje JS usunięte. `game_action_state` zostaje w bazie
tylko dla starych wersji strony z cache.

Migracja 274 — Warstwa 2 (jak przy blokadach użycia): baza sama odrzuca
zapis łamiący reguły, nawet gdy strona go przepuści. Zapis pytań/odpowiedzi
wprost z przeglądarki przy otwartej ankiecie lub w kopii ze Społeczności →
`game_content_locked:<powód>`; zmiana statusu poll_open → ready bez
spełnionych warunków (`game_poll_close_check`, te same co
`game_validate().poll_close`) → `poll_close_blocked:<kod>:<nr pytania>`.
Funkcje SECURITY DEFINER (zamykanie, reset, biblioteka) przechodzą.
`gameRuleErrorMessage(e)` tłumaczy te błędy (edytor, ankiety). Bez
Warstwy 2 zostają: „graj” (control nie zapisuje nic jednorazowego przy
starcie — stan gry to wiele zapisów `game_state_write`) i ręczne ustawianie
statusu z pominięciem ankiety (testy tak przygotowują dane).

Migracja 275 — `games.rules_state`: zapisany wynik `game_rules_compute`
(to samo co `game_validate` bez zamknięcia ankiety, które zależy od głosów).
Aktualizują go triggery: BEFORE INSERT/UPDATE OF type, status, rules_state
na `games` (stan dla nowego statusu; ręczny zapis klienta nadpisany) oraz
AFTER … FOR EACH STATEMENT z tabelami przejść na `questions`/`answers`
(jedno przeliczenie na grę na polecenie — import 60 odpowiedzi = 1).
Przeliczenie istniejących gier z wyłączonym `trg_games_touch` (bez zmiany
`updated_at`). Lista gier bierze stan razem z grami: przyciski bez
dodatkowych zapytań, kafelek pokazuje, co blokuje następny krok
(`tileBlocker`), hub ankiet czyta `rules_state` zamiast pytać o każdą grę.
Edytor przy odrzuconym zapisie (274) pokazuje ten sam overlay co blokada
zasobu (`showBlockingOverlay` z resource-lock.js, bez wpisu w edit_locks).

## Editor — zrobione (2026-09-27)

Testy: `tests/e2e/editor.spec.js` (cały plik na kodzie z brancha, sekcje
„editor: audyt”). Migracja 276 (SECURITY INVOKER, więc RLS i Warstwa 2 z
274 obowiązują): `game_import_content` (import TXT = jedna transakcja,
wcześniej ~80 zapytań po skasowaniu starej treści), `game_question_delete`
+ `game_questions_renumber` (usunięcie i przenumerowanie razem).

Wspólny formularz pytania z modalem w base-explorer:
`js/core/question-form.js` (limity 200/17, pole punktów 0–100 same cyfry,
pasek SUMA, `questionProblems()`, `buildAnswerRow()` /
`buildAddAnswerTile()`) + `css/question-form.css` (wygląd z edytora). Oba
miejsca budują te same wiersze; różnice tylko z natury miejsca: edytor
zapisuje każde pole od razu (pusty tekst -> domyślny), modal ma „Zapisz”
(pusty tekst blokuje zapis), w bazie pytań punkty są opcjonalne i 0–6
odpowiedzi. `branch-code.js` serwuje też `base-explorer/`.

Nowe typowe błędy (dopisane z tej strony):
- Autozapis wpisujący znormalizowaną wartość (`trim`) z powrotem do pola
  w trakcie pisania — zjada spację przy każdej pauzie, przestawia kursor.
- Zapis async czytający „aktywny” element w chwili ZAKOŃCZENIA zamiast
  z chwili wywołania — tekst ląduje w innym rekordzie po przełączeniu.
- Przycisk w HTML bez podpiętego listenera („Wczytaj plik”).
- `location.href` od razu po `alertModal()` bez `await` — komunikat znika.
- Nawigacja przerywająca zapis w toku — przycisk wyjścia ma poczekać.
- Blokada podwójnego kliknięcia trzymana dłużej niż sam zapis — następne
  prawdziwe kliknięcie przepada.

## Poll-qr / poll-points / poll-text / poll-go — zrobione (2026-09-29)

Testy: `tests/e2e/poll-qr.spec.js`, `tests/e2e/poll-voting.spec.js`
(poll-points + poll-text), `tests/e2e/poll-go.spec.js`. Uwaga: te testy
poszły bezpośrednio na produkcję/`main` (spec_filter na workflow, bez
serveBranchCode) — inaczej niż krok 6 metody wyżej; ustalone tak z
użytkownikiem dla tego audytu, nie zmienia domyślnej metody dla kolejnych stron.

Realne błędy w aplikacji (nie w testach):
- **poll-qr.js**: `render(url)` na końcu pliku wołane bezwarunkowo nawet
  po nieudanej inicjalizacji device-mode (zły klucz/status/not_found) —
  nadpisywało komunikat błędu z catch-a napisem „Brak URL”. Naprawione
  flagą `deviceInitFailed`.
- **poll-points.js / poll-text.js / poll-go.js**: `initI18n(...).then(...)`
  bez `await` przed użyciem `t()`/`MSG.x()` w handlerze
  `DOMContentLoaded`/`init()` — wyścig: `t()` mógł się wykonać zanim
  `translations` się załadował (zwraca goły klucz, np.
  „pollText.alreadyVoted”), a elementy z `data-i18n` i tak dostawały
  nadpisane z powrotem na „Ładuję…” przez późniejszy `applyTranslations()`.
  Naprawione: `const i18nReady = initI18n(...).then(...)` + `await
  i18nReady;` na starcie.
- **poll-qr.js**: zły klucz ankiety w device-mode (`get_poll_game` rzuca
  `RAISE EXCEPTION 'forbidden'`) mapowany był po `error.code === "PGRST116"`
  (nigdy prawda dla RPC) — zamiast „Nieprawidłowy klucz” pokazywało ogólne
  „Brak URL lub nieprawidłowy klucz”. Naprawione matchowaniem po
  `error.message === "forbidden"`.

Błędy w testach (nie w aplikacji) — pełna lista w „Czego pilnować” wyżej:
setup wołający surowy update statusu miejsce RPC `poll_open()` (brak
`poll_sessions` → „No open session” przy głosowaniu, wyglądało jak kolizja
kont), `toContainText` ze stringiem zamiast regexem, twardy polski tekst na
niezalogowanej stronie bez ustawienia `uiLang`, nieprawidłowy format UUID
w teście „token nie istnieje”, `.catch()` na thenable z `sb.rpc()`.

