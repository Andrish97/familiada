# Audyt stron — jak robimy (metoda)

Strony powstawały „w czacie tekstowym GPT” — są nieczytelne i często
zbugowane. Audytujemy je po kolei, jedna strona na raz. Zrobione:
**logo-editor**, **bases** (2026-09-26). Następna: **games**.

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

## Games — sugestie użytkownika na start

- (uzupełniane przez użytkownika)
