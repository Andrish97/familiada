# Audyt stron — jak robimy (metoda)

Strony powstawały „w czacie tekstowym GPT” — są nieczytelne i często
zbugowane. Audytujemy je po kolei, jedna strona na raz. Zrobione:
**logo-editor**, **bases**, **games** (2026-09-26), **editor** (2026-09-27),
**polls / polls-hub / poll-qr / poll-points / poll-text / poll-go**
(2026-09-29), **login / reset / confirm / account** (2026-09-29),
**privacy / manual** (2026-09-29), **404 / maintenance** (2026-09-29),
**subscriptions** (2026-09-30). Następna: do ustalenia.

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

## Login / reset / confirm / account — zrobione (2026-09-29)

Testy: `tests/e2e/guest-migration.spec.js` (dwa testy — migracja przez
`/account` i przez `/login`), `tests/e2e/account-email-resend.spec.js`.
Oba specy używają kodu front-endu z brancha przez `serveBranchCode()` i
prawdziwego produkcyjnego backendu. Po przejściu na branchu zostały
powtórzone na `main` po wdrożeniu (wyniki poniżej).

Realne błędy w aplikacji:
- **login.js**: rejestracja z aktywną sesją gościa (podanie e-maila +
  hasła) wołała `convertGuestToRegistered()`, która flipowała
  `profiles.is_guest = false` przez RPC `guest_convert_account`
  NATYCHMIAST po submicie — zanim e-mail został w ogóle potwierdzony.
  Dokładnie ten sam bug migracja 249 (2026-08-27) naprawiła dla
  `/account`, ale jej własny komentarz mówił wprost: „UWAGA: login.js
  celowo NIE jest tu zmieniane (...) To osobna, świadomie nienaprawiana w
  tym kroku ścieżka” — czyli świadomie odłożony dług, nie przeoczenie.
  Skutek: porzucona/niepotwierdzona rejestracja przez `/login` trwale
  zerowała `is_guest` i `guest_expires_at` → konto nie do sprzątnięcia
  przez `guest_cleanup_expired` (wymaga `is_guest=true`) i nie do
  zalogowania (e-mail nigdy niepotwierdzony) — martwe na zawsze. Naprawione
  przełączeniem `login.js` na tę samą, odroczoną architekturę co
  `/account`: `guest_stage_migration()` (hasło zahaszowane w
  `guest_migration_staging`) + `convertGuestToRegisteredEmailOnly()`,
  faktyczny flip dopiero w `guest_finalize_migration()` po potwierdzeniu
  (`confirm.js`). Stara, buggy `convertGuestToRegistered()` usunięta z
  `js/core/auth.js` (bez wywołań po tej zmianie).
- **account.js**: `handleEmailResend()` (przycisk „Wyślij ponownie” przy
  oczekującej zmianie e-maila) wołał `setEmailPendingUi(normalizedMail)` —
  `normalizedMail` to zmienna lokalna z zupełnie innej funkcji
  (`handleEmailSave`), więc w `handleEmailResend` była niezadeklarowana.
  Na żywo: `sb().auth.resend()` kończył się sukcesem (mail realnie
  wychodził), a zaraz potem `ReferenceError` wpadał w `catch` — użytkownik
  widział błąd mimo wysłanego maila, a cooldown antyspamowy
  (`account:email`) był bezwarunkowo zwalniany w tej samej gałęzi catch,
  czyli ochrona przed spamowaniem cudzej/własnej skrzynki była martwa dla
  tego przycisku. Naprawione podstawieniem właściwej zmiennej modułowej
  (`pendingEmail`).
- **account.js — komunikat sukcesu nadpisywany stanem ogólnym**: po
  poprawnym `auth.resend()` UI na moment pokazywało „Wysłano ponownie”, ale
  `refreshAuthEmailState()` → `setEmailPendingUi()` natychmiast zastępowało
  go tekstem „Zmiana e-maila jest w toku”. GoTrue, pending e-mail i JWT/UI
  były poprawne; błąd dotyczył kolejności renderowania statusu aplikacji,
  nie testu ani backendu. Ten sam problem dotyczył komunikatu po pierwszym
  zapisie e-maila. Naprawione ustawianiem jednoznacznego statusu sukcesu po
  odświeżeniu stanu auth i cooldownów.
- **[głębszy, wspólny dla login.js i account.js] user_metadata.is_guest
  nigdy nieczyszczone po migracji** — `enrichUser()` w `js/core/auth.js`
  liczy `is_guest` jako OR: `profiles.is_guest` LUB
  `user_metadata.is_guest`. Migracja 249 przestała flipować DB-ową flagę
  przedwcześnie, ale nikt nigdzie nie czyścił metadanych JWT
  (`raw_user_meta_data.is_guest`, ustawianych raz przy `signInGuest()`) —
  więc każde konto, które kiedykolwiek było gościem, wygląda na gościa
  NA ZAWSZE nawet po pełnej, potwierdzonej konwersji: `guest-info-modal.js`
  i `guest-migrate-reminder.js` nękają pełnoprawnego usera bez końca,
  `rating-system.js` blokuje mu oceny na stałe. Naprawione migracją 277
  (`guest_finalize_migration()` czyści też `raw_user_meta_data.is_guest`
  bezpośrednio w `auth.users` — funkcja już jest `SECURITY DEFINER` i tak
  dotyka tej tabeli dla hasła; ta sama poprawka defensywnie w
  `guest_convert_account()` na wypadek klienta z cache starej wersji
  strony) + jednorazowy backfill dla kont już zmigrowanych.
- **[drobne, naprawione]** brak blokady podwójnego wysłania: formularz
  ustawienia nazwy użytkownika na `/login` (`#usernameForm`) sprawdzał
  `isBusy`, ale nigdy nie ustawiał go na `true` — `saveUsername()` nie
  wołało `setBusy()` w ogóle, więc drugi Enter/klik w trakcie zapisu szedł
  współbieżnie. To samo dla `reset.js` — przycisk „Zapisz hasło” w ogóle
  nie miał blokady (jedyny taki przycisk w całym zestawie tych stron).
  Oba naprawione lokalnym flagowaniem + `disabled`.
- **[drobne, naprawione]** wyścig przy zapisie nazwy użytkownika: sprawdzenie
  dostępności (`ensureUsernameAvailable`) i sam `UPDATE` nie są atomowe —
  przy realnym wyścigu dwóch userów o tę samą nazwę łapał to dopiero unique
  index (`profiles_username_ci_uq`), pokazując surowy błąd Postgresa
  zamiast tłumaczonego `index.errUsernameTaken`. Naprawione mapowaniem kodu
  `23505` na ten sam komunikat.

Sprawdzone i bez błędów: klucze i18n (wszystkie użyte w
login/reset/confirm/account.js + .html istnieją w pl/en/uk), `uiLang`
init przed `t()` (już poprawnie `await initI18n()` na starcie wszystkich
czterech), matchowanie błędów RPC (`error.message`, nie `.code`, tam gdzie
to RAISE EXCEPTION), cooldowny (`cooldown_reserve`/`cooldown_email_reserve`
atomowe przez `FOR UPDATE` — double-submit na przyciskach z cooldownem nie
jest realną luką, w przeciwieństwie do formularzy bez cooldownu wyżej).

Weryfikacja końcowa (2026-09-29): wszystkie 217 kluczy użytych przez te
cztery strony istnieje w PL/EN/UK; testy jednostkowe 158/158. Scoped E2E na
branchu: `account-email-resend` 1/1 i `guest-migration` 2/2. Scoped E2E na
`main` po wdrożeniu: `account-email-resend` 1/1 i `guest-migration` 2/2.
Linki do konkretnych przebiegów są w raporcie końcowym audytu/Actions.

## Privacy / manual — zrobione (2026-09-29)

Testy: `tests/e2e/privacy-manual.spec.js` (5 scenariuszy, kod z brancha
przez `serveBranchCode`, publiczne strony i prawdziwy produkcyjny routing).
Sprawdzają PL/EN/UK, treść i opis SEO privacy, bezpieczny powrót do manuala,
tryb modalny bez sesji, klawiaturę, semantykę zakładek oraz Back/Forward.

Realne błędy w aplikacji:
- **privacy.js — otwarte przekierowanie przez `man`**: parametr powrotu był
  przypisywany wprost do `location.href`. Spreparowany link mógł wysłać
  użytkownika poza Familiadę albo użyć aktywnego schematu URL. Teraz adres
  jest parsowany przez `URL` i akceptowany wyłącznie dla tego samego origin;
  w pozostałych przypadkach wraca do bezpiecznego `games`.
- **manual.js — historia zakładek tylko zmieniała URL**: kliknięcia zapisywały
  hash, ale Back/Forward nie aktualizowało aktywnego przycisku ani panelu.
  Dodany listener `hashchange`, wspólna aktywacja panelu i test obu kierunków.
- **manual.js — modal bez sesji trafiał do logowania**: inline HTML celowo
  nie wymuszał auth dla iframe, lecz późniejsze `requireAuth()` ponownie
  przekierowywało. Pełna strona nadal wymaga konta; modal używa miękkiego
  `getUser()` i działa również bez sesji.
- **manual.js — wyścig i18n i podwójne listenery nawigacji**: inicjalizacja
  tłumaczeń była puszczona bez `await`, a te same przyciski podpinano przed
  i po auth. Start jest teraz jednym awaitowanym przepływem, a nawigacja
  jest wiązana raz.
- **Dostępność/i18n**: stałe polskie `aria-label="Zakładki"`, brak ról
  `tab`/`tabpanel`, `aria-selected` i obsługi strzałek/Home/End; privacy miało
  polski opis meta także w EN/UK. Dodane kompletne PL/EN/UK oraz semantyka
  i klawiatura zakładek. Poprawiona też literówka „Wskarówki”.

Zweryfikowano parytet kluczy: `manual` 38/38/38 i `privacy` 22/22/22 dla
PL/EN/UK. Testy jednostkowe repo: 158/158. Scoped E2E jest uruchamiany na
branchu i ponownie na `main` po wdrożeniu; linki do przebiegów znajdują się
w raporcie końcowym/Actions.

## 404 / maintenance — zrobione (2026-09-29)

Testy: `tests/e2e/maintenance-404.spec.js` (6 scenariuszy, kod obu stron z
brancha przez `serveBranchCode`; prawdziwy produkcyjny Worker dla kontraktu
404, deterministyczne odpowiedzi `maintenance-state.json` dla wszystkich
trybów maintenance). Sprawdzają status i cache 404, zasoby pod głębokim URL,
PL/EN/UK, treść standardową i własną, fallback brakującego tłumaczenia,
countdown z wieloma znacznikami `#timer` oraz wyłączenie maintenance.

Realne błędy w aplikacji:
- **maintenance pod zagnieżdżonym adresem było bez stylów i logiki** — Worker
  zwraca tę samą stronę dla dowolnej żądanej ścieżki, a HTML używał względnych
  `css/...` i `js/...`; przeglądarka dla `/foo/bar` żądała nieistniejących
  `/foo/css/...` i `/foo/js/...`. Zasoby są teraz absolutne. Analogicznie
  poprawiono względny adres `security-warning.js` na stronie 404.
- **pusta karta dla niepełnego komentarza administratora** — jeden istniejący
  wariant językowy wyłączał treść standardową, ale wejście w języku bez
  komentarza renderowało pustkę. Dodany fallback do istniejącego wariantu;
  bez żadnego komentarza wraca treść standardowa.
- **countdown** podmieniał tylko pierwszy `#timer`, a ukraińskie „sekунда”
  zawierało łacińskie litery. Wszystkie znaczniki są podmieniane i tekst UK
  poprawiono.
- **awaria i18n zostawiała szkielet** — inicjalizacja obu stron nie miała
  bezpiecznego zakończenia. `try/catch/finally` zawsze odsłania treść; 404
  zachowuje też język przy automatycznym powrocie na stronę główną.
- **CSP 404** — Worker ustawia restrykcyjne CSP i `nosniff`, ale zewnętrzna
  reguła nagłówków strefy Cloudflare zastępuje CSP i usuwa `nosniff` już po
  wykonaniu Workera. Potwierdziły to dwa powtarzalne przebiegi produkcyjne,
  więc nie był to timeout ani błąd UI. Dokument 404 ma teraz własne,
  restrykcyjne CSP w `meta`; przeglądarka egzekwuje je razem z globalnym CSP.
  Zmiana samej reguły strefy pozostaje poza kodem tego repozytorium.

Parytet tłumaczeń: `maintenance` 15/15/15 i `notFound` 8/8/8 dla PL/EN/UK;
testy jednostkowe repo: 158/158. Scoped E2E na branchu: 6/6, przebieg
https://github.com/Andrish97/familiada/actions/runs/36636718992. Pierwsze dwa
przebiegi diagnostyczne miały 5/6 i ujawniły opisane nadpisanie nagłówków
przez warstwę Cloudflare (36636255093, 36636567175), zamiast maskować je
retry. Wynik na `main` po wdrożeniu jest dopisywany w raporcie końcowym.

## Subscriptions — zrobione (2026-09-30)

Testy: `tests/e2e/subscriptions.spec.js` (5 scenariuszy, kod strony z brancha
przez `serveBranchCode`, prawdziwy produkcyjny backend i konta test7–test9).
Stary test z audytu 28 września nie był dowodem działania: uznawał zarówno
sukces, jak i błąd, warunkowo pomijał najważniejsze akcje i nie sprzątał
relacji/cooldownów. Został zastąpiony pełnym cyklem zaproszenie → akceptacja
→ anulowanie oraz osobnymi testami tokenu innego konta, walidacji formularza,
bezpiecznego powrotu i mobilnego PL/EN/UK.

Realne błędy w aplikacji:
- **token przypisany do innego konta kończył się `ReferenceError`** — gałąź
  potwierdzenia wołała `signOut()`, ale funkcja nie była importowana. Modal
  nie mógł wykonać wybranej przez użytkownika akcji. Import naprawiony i
  scenariusz sprawdzony na trzech prawdziwych kontach.
- **otwarte przekierowanie przez `ret`** — parametr był przypisywany wprost
  do `location.href`. Teraz przechodzi przez `URL`, musi mieć ten sam origin,
  a niepoprawna/zewnętrzna wartość wraca bezpiecznie do `/games`.
- **błędy RPC były traktowane jak sukces** — pobranie list i badge'y oraz
  usunięcie subskrybenta ignorowały `error` albo `data.ok=false`, przez co UI
  renderowało pustą listę lub odświeżało się jak po udanej akcji. Wszystkie
  te odpowiedzi są teraz jawnie sprawdzane.
- **pętla modali po awarii pobierania** — zamknięcie dowolnego modala
  bezwarunkowo uruchamiało `refreshData()`. Błąd pobrania otwierał alert,
  którego zamknięcie ponawiało błędne pobranie i ten sam alert bez końca.
  Zbędny globalny listener usunięto; udane akcje odświeżają dane wprost.
- **formularz zaproszenia był wielokrotnie wysyłalny i kasował błędną
  wartość** — Enter/klik podczas operacji uruchamiał następne RPC, a wrapper
  czyścił input niezależnie od wyniku. Dodano wspólną blokadę obu wersji
  formularza; pole jest czyszczone tylko po zapisaniu zaproszenia.
- **błąd wysyłki e-maila miał błędny komunikat** — po zapisaniu rekordu i
  nieudanym `send-mail` tekst błędu mógł zostać zmapowany na „Niepoprawny
  e-mail” albo ogólne „Nie udało się zaprosić”. UI rozróżnia teraz zapisane
  zaproszenie od niedostarczonej wiadomości, również przy ponowieniu.
- **wyścig i18n i dostępność** — logika strony mogła użyć `t()` przed
  zakończeniem `initI18n`. Start czeka teraz na i18n, awaria nie zostawia
  szkieletu. Ikonowe akcje mają tłumaczone nazwy dostępne, a mobilne zakładki
  role/`aria-selected`, powiązane panele i obsługę strzałek/Home/End.

Migracja 279 dodaje `e2e_poll_subscriptions_cleanup(uuid)`: usuwa relację i
pięciodniowy cooldown wyłącznie między dwoma kontami pasującymi do
`testN@familiada.online`; zwykły użytkownik nie może jej użyć. Dzięki temu
retry i ponowienie testu na `main` zaczynają oraz kończą z czystym stanem.

Weryfikacja branch: migracja 279 `APPLY/OK`, parytet sekcji tłumaczeń
`pollsHubSubscriptions` 178/178/178 dla PL/EN/UK, testy jednostkowe 158/158,
scoped E2E 5/5:
https://github.com/Andrish97/familiada/actions/runs/36638601261. Wynik na
`main` po wdrożeniu znajduje się w raporcie końcowym/Actions.

## Marketplace / Gry Społeczności — zrobione (2026-09-30)

Testy: `tests/e2e/marketplace.spec.js` (7 scenariuszy, kod strony z brancha
przez `serveBranchCode`, zablokowany service worker, prawdziwy produkcyjny
backend i konta testowe). Obejmują anonimowego użytkownika, konto i gościa,
listę/wyszukiwanie/filtr/sortowanie, wolną oraz błędną odpowiedź backendu,
deep-link i historię, klawiaturę, PL/EN, atomowe dodanie i powtórny klik,
kopię pytań, aktualizację oceny, wysłanie gry oraz prywatność oceniających.
Każdy zapisany stan jest usuwany w `finally`; retry nie dziedziczy danych.

Realne błędy w aplikacji i backendzie:
- **dowolny klient mógł wykonywać RPC administratora** — funkcje
  `market_admin_delete/review/upsert/...` były `SECURITY DEFINER` i miały
  domyślne `EXECUTE` dla PUBLIC. Anonim lub zwykłe konto mogło zatwierdzić,
  zmienić albo trwale usunąć cudzą grę. Dostęp odebrano PUBLIC/anon/auth i
  pozostawiono wyłącznie `service_role`, którego używa maintenance-worker.
- **oceniający byli publiczni** — polityka `mgr_select USING (true)`
  ujawniała `user_id`, ocenę i czas każdemu, a `market_game_raters` przez
  odwrócony warunek zwracało listę także anonimowi. RLS dopuszcza teraz
  własną ocenę i autora gry; RPC zwraca listę wyłącznie autorowi.
- **snapshot był kontrolowany przez przeglądarkę** — `market_submit_game`
  ufało dowolnemu `p_payload`, więc treść nie musiała odpowiadać wskazanej
  grze. RPC składa snapshot z tabel `games/questions/answers` w transakcji,
  odrzuca demo oraz za długi opis.
- **podwójne wysłanie tworzyło dwa zgłoszenia** — brak blokady backendowej
  pozwalał równoległym kliknięciom/retry wstawić wiele aktywnych snapshotów.
  Blokada transakcyjna po `game_id` i kontrola pending/published zwraca teraz
  `already_submitted`. Dodanie do biblioteki potwierdzono jako atomowe i
  idempotentne dzięki jednej funkcji oraz unikalności `(owner_id,
  source_market_id)`.
- **oceny nie dało się aktualizować w UI** — po pierwszej ocenie kontrolka
  znikała, mimo że RPC używa `ON CONFLICT DO UPDATE`; kafelek miał też zły
  selektor odświeżania. Gwiazdki pokazują bieżący wybór i pozwalają go
  zmienić, a data oceny odzwierciedla ostatnią aktualizację.
- **historia podglądu tworzyła pętle** — zamknięcie dopisywało kolejny wpis
  przez `pushState`, a `popstate` ponownie dopisywał detail URL. Po sekwencji
  otwórz/zamknij/otwórz Wstecz mógł zostawić modal otwarty. Zamknięcie używa
  `replaceState`, wejście z URL nie dubluje historii, parametry `lang`, `q`,
  `filter` i `sort` są zachowywane, a slug/UUID walidowane.
- **stare odpowiedzi i18n/wyszukiwania nadpisywały aktualny stan** — brak
  identyfikatora requestu pozwalał wolniejszemu wyszukiwaniu wygrać z
  nowszym. Dynamiczne szczegóły/lista nie renderowały się ponownie po zmianie
  języka, punkty miały polskie `pkt` na stałe. Dodano ochronę kolejności i
  pełne klucze PL/EN/UK.
- **powrót anonimowego był mylący** — kod ustawiał „Strona główna”, po czym
  `applyTranslations()` przywracało „Moje gry” ze starego `data-i18n`.
  Klucz i cel są teraz spójne. W całym polskim UI ujednolicono też jedyne
  „Strona startowa” do używanego wszędzie terminu „Strona główna”.
- **brak rzeczywistego filtrowania/sortowania i podstaw klawiatury** — dodano
  język oraz pięć porządków, trwałe parametry URL, loading/empty/error,
  semantyczne przyciski kart z focusem, role/nazwy modali i etykiety pól.

Migracja 280 naprawia RLS/RPC, źródło snapshotu, duplikaty i dodaje
`e2e_marketplace_cleanup(text)` ograniczone do własnych rekordów kont
`testN@familiada.online` i prefiksu `E2E-MKT-`. Migracja na branchu:
https://github.com/Andrish97/familiada/actions/runs/36691353176 (`APPLY/OK`).

Weryfikacja branch: testy jednostkowe 161/161; scoped E2E 7/7:
https://github.com/Andrish97/familiada/actions/runs/36692596832. Dwa wcześniejsze
przebiegi diagnostyczne ujawniły rzeczywiste nadpisanie etykiety powrotu i
błąd historii; osobno poprawiono błędny krok testu próbujący klikać kontrolkę
pod modalem. Wynik na finalnym `main` znajduje się w raporcie końcowym/Actions.

## Index / Strona główna — zrobione (2026-09-30)

Testy: `tests/e2e/index.spec.js` (8 scenariuszy, zablokowany service worker,
`serveBranchCode(context, { pages: ["index"] })`, prawdziwy backend i konta).
Zakres obejmuje anonima, gościa, pełne konto, nieprawidłową sesję, kontrakt
`get_app_rating_stats()`, wolne odpowiedzi, główne odnośniki, historię,
PL/EN/UK, mobilny viewport, klawiaturę i focus. Gość utworzony przez test jest
zawsze usuwany przez `guest_discard_current()` w `finally`.

Realne błędy aplikacji i treści:

- Inline-script w `<head>` ufał obiektowi przypominającemu sesję w
  `localStorage` i przekierowywał do `/games` bez `auth.getUser()`. Wygasły,
  uszkodzony lub ręcznie zapisany token był traktowany jak zalogowanie, a
  sprawdzenie profilu i nazwy użytkownika pomijane. Teraz decyzję podejmuje
  wyłącznie zweryfikowany użytkownik z `getUser()`.
- Landing pozostawał ukryty klasą `page-loading` aż do zakończenia kontroli
  sesji. Wolny/niedostępny Auth oznaczał pustą stronę. I18n oraz interfejs
  uruchamiają się teraz niezależnie, a niekrytyczna sesja i statystyki w tle.
- Tylko pierwszy CTA zachowywał język. Linki do Gier Społeczności, podłączania
  urządzenia, polityki prywatności i link w treści gubiły `lang`. Wszystkie
  lokalne linki aktualizują się po każdej zmianie języka.
- `setUiLang()` pozwalało wolniejszemu, starszemu importowi słownika nadpisać
  nowszy wybór przy szybkim PL → EN → UK; `pageshow` tworzył nieobsłużoną
  obietnicę. Dodano identyfikator żądania i prawidłowe `await`/`catch`.
- Dwanaście podglądów obrazów działało tylko myszą. Dodano role, etykiety,
  Enter/Spację, widoczny focus, fokus w dialogu, Escape i powrót fokusu.
  Wielokrotne kliknięcie nie otwiera dialogu ponownie.
- Dynamiczne tytuły CTA i etykieta nawigacji sekcji były na stałe po polsku.
  Dodano równoważne klucze PL/EN/UK. Usunięto martwy, wyłącznie polski kod
  teasera i żartów konsolowych, dla którego nie było elementów w HTML.
- FAQ błędnie twierdziło, że dane gościa są przechowywane w przeglądarce, że
  gość ma pełną funkcjonalność, konto wymaga tylko e-maila oraz że nie ma
  gotowych zestawów. Faktycznie gość ma tymczasowe konto i dane w backendzie,
  lecz dostęp zależy od lokalnej sesji; udostępnianie baz, subskrypcje i
  funkcje społecznościowe są wyłączone; rejestracja używa e-maila i hasła;
  Gry Społeczności pozwalają dodać gotową grę do biblioteki. Poprawiono
  PL/EN/UK oraz synchronizację JSON-LD z wyrenderowanym FAQ. Zgodnie z decyzją
  właściciela nie zmieniano tez ani zrzutów dotyczących produkcyjnego starego
  Control.

Backend: `get_app_rating_stats()` jest SQL `STABLE`, zwraca
`TABLE(avg_stars numeric, total_count bigint)`, czyli w supabase-js tablicę
jednego wiersza. SELECT na `app_ratings` jest publiczny przez RLS; RPC działa
dla anonima, gościa i pełnego konta. UI odrzuca brak wiersza oraz częściowe,
nienumeryczne lub poza-zakresowe dane. Audyt nie wymagał migracji.

Błąd infrastruktury testowej: `serveBranchCode(... pages:["index"])` nie
mapował trasy `/` na `index.html`, więc dwa pierwsze przebiegi cicho testowały
produkcyjny HTML. Dodano mapowanie `/` → branchowy `index.html` i regresję
jednostkową. Pierwszy fail zawierał też wyścig w teście po wylogowaniu;
scenariusze pełnej i fałszywej sesji rozdzielono.

Wyniki na branchu `audyt-index`: jednostkowe 166/166; ograniczony E2E fail
#36698569570 (6/7, izolacja testu), fail #36699453202 (7/8, ujawnione
testowanie `/` z produkcji), green #36700622309 (8/8 na kodzie brancha).
