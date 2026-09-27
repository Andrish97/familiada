# Audyt stron — jak robimy (metoda)

Strony powstawały „w czacie tekstowym GPT” — są nieczytelne i często
zbugowane. Audytujemy je po kolei, jedna strona na raz. Zrobione:
**logo-editor**, **bases**, **games** (2026-09-26). Następna: do ustalenia.

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
