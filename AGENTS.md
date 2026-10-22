# Familiada — zasady pracy (AGENTS.md — dla Codexa; treść = CLAUDE.md)

Rozmawiamy po polsku. Kod: vanilla JS (moduły ES z `?v=`, wersje
przepisuje CI), Supabase, Cloudflare Worker. Strony w `web/`.

## Zanim zaczniesz

- **Przekazanie z 2026-10-10:** [`docs/przekazanie.md`](docs/przekazanie.md) — co
  zrobione, aktualny następny krok i otwarte sprawy.

- Przeczytaj [`docs/wdrozenia.md`](docs/wdrozenia.md) — kolejka etapów,
  stan, zasady i odnośniki do sekcji z decyzjami. To jest plan; rozmowa
  nim nie jest.
- Decyzje użytkownika zapisuj od razu w sekcji „Decyzje” właściwego
  dokumentu (`docs/nawigacja-mapa-plan.md`, `docs/blokady-zasobow.md`,
  `docs/ujednolicenie-wygladu.md`, `docs/e19-znajomi-plan.md`, `docs/ankiety-refaktor.md`).
  Podręcznik (E13): `docs/podrecznik-plan.md` — plan uzgodniony 2026-10-20.
  Kopie Gier/Logo: `docs/udostepnianie-kopii-plan.md` (E19C).
  Test accounts — role i lease (E25): `docs/konta-testowe-plan.md`.
  Podręcznik (E13): plan rozdziałów `docs/podrecznik-plan.md`.
- **Kompletna mapa stron i nawigacji (decyzja 2026-10-17):** dodanie,
  usunięcie, zmiana adresu albo zachowania dowolnej strony wymaga równoczesnej
  aktualizacji centralnej mapy nawigacji `web/shared/js/core/nav-map.js`
  (`PAGES` i `pageIdForPath`), dokumentacji tras oraz powiązanych testów i
  generatorów, jeśli ich dotyczy. Dotyczy to także auth/sesji, przekierowań,
  urządzeń, powrotu, deep linków i stanów strony. Każda istniejąca trasa HTML
  musi być ujęta w inwentarzu mapy. Trasy techniczne, tokenowe, serwisowe,
  administracyjne i urządzeń, które nie należą do zwykłej nawigacji, wpisuj
  jawnie jako samodzielne z opisem ich roli i powodem wyłączenia z nawigacji;
  nie pomijaj ich po cichu. Zasada i audyt: `docs/nawigacja-mapa-plan.md`,
  `docs/audyt-initpage-trasy.md`.

## Cykl wdrożenia (decyzja 2026-10-10) — każda zmiana potwierdzona testem na produkcji

1. **Baza najpierw, bezpiecznie**: migracja dodająca (zgodna wstecz z
   działającym kodem) — lokalny Postgres + test SQL → push na `main` →
   sprawdzić log zastosowania (`supabase/migration_logs/latest.log`).
2. **Testy kodu z brancha na produkcyjnej bazie**: e2e z
   `serveBranchCode` (`tests/e2e/helpers/branch-code.js` — strony i cały
   front z plików brancha, baza/Worker/konta produkcyjne), workflow uruchomiony
   na branchu (`REF=<branch>`). Nowy katalog strony dopisać do `CODE_DIRS`.
3. **Wdrożenie Pages** (push na `main`) dopiero po zielonych testach z pkt 2.
4. **Testy kontrolne na produkcji** po wdrożeniu — te same, punktowe spece.
5. Etap jest zrobiony dopiero po pkt 4 (wpis w Dzienniku z numerem przebiegu).

Testy zawsze **punktowo** (wybrane spece / `--grep` na konkretne testy),
nigdy cały zestaw — szybciej; przy niejasnym błędzie dołożyć logi
szczątkowe (diagnostyka `[e2e-diag]`, zrzuty) zamiast puszczać więcej testów.
Migracje zmieniające zachowanie — razem z kodem, który ich wymaga (pkt 2
na branchu przed migracją jest wtedy niemożliwy: przetestować na lokalnym
Postgresie, wdrożyć razem i od razu testy kontrolne).

**Szybsze e2e (decyzja użytkownika 2026-10-22):**
- **Kilka speców w jednym przebiegu:** `spec_filter` trafia wprost do
  `npx playwright test`, więc podawaj kilka plików oddzielonych spacją
  (np. `spec_filter="e2e/a.spec.js e2e/b.spec.js"`) z `max_failures` > 1, żeby
  jeden błąd nie zatrzymał reszty — oszczędza przygotowanie maszyny na każdym
  przebiegu. Razem idą spece bez skrzynek (`@mailbox`) i bez kont na stałe;
  spece ze skrzynkami, kontami na stałe (test11/12/15) i ciężkie (Control,
  wyświetlacz) — osobno.
- **Nie powtarzać zielonych:** spec zielony na danym kodzie nie jest puszczany
  ponownie, jeśli późniejsze zmiany (scalenie, poprawka) nie dotknęły plików,
  które testuje. Przed kolejnym przebiegiem porównać diff z plikami speca.
- **Równolegle tylko na rozłącznych kontach:** dwa przebiegi naraz wyłącznie
  z rozłącznym `test_accounts` i bez `@mailbox`; przy pracy innej sesji
  na tych samych kontach/skrzynkach — nie równolegle.
- Powód ograniczeń: wspólne skrzynki testowe, limity wysyłki i cooldowny poczty,
  konta na stałe i mały serwer bazy — równoległe przebiegi dają fałszywe błędy.

## Wygląd (decyzja 2026-10-10)

- Zasady: **symetria, równowaga i spójność** — elementy podobne funkcjonalnie
  (kafle, wiersze, paski akcji, okna, karty, filtry, puste stany) wyglądają
  i zachowują się tak samo na wszystkich stronach. Źródło wzorców:
  [`docs/wzorce-ui.md`](docs/wzorce-ui.md) (etap ujednolicenia E18; reszta
  poprawek wstrzymana — lista w `docs/przekazanie.md`).
- **Zrzuty po wykonaniu (decyzja użytkownika 2026-10-11):** zmiany wyglądu
  dokumentować zrzutami z przykładowymi danymi (telefon 390 px i komputer
  1400 px). Kontynuować bez czekania na ocenę lub zatwierdzenie użytkownika.
- **System zrzutów `scripts/screens/` (decyzja użytkownika 2026-10-20):**
  każda zmiana strony w `web/` kończy się zrzutem tej strony. Najpierw
  dopasować scenę w `scripts/screens/scenes.cjs` (nowa strona/stan/okno =
  nowa scena) i dane w `scripts/screens/data/`, gdy strona potrzebuje nowych
  danych lub RPC (runner wypisuje „brak danych: rpc:…/table:…”). Potem
  `node scripts/screens/run.cjs --changed` (albo `--scenes=…`), obejrzeć
  zrzuty i pokazać je użytkownikowi. Prawdziwy kod strony, atrapa tylko
  warstwy Supabase; nigdy gałęzi „tylko dla zrzutów” w kodzie aplikacji.
  Instrukcja: [`docs/zrzuty-system.md`](docs/zrzuty-system.md).

## Tok pracy

- **Aktualizacje postępu (decyzja użytkownika 2026-10-12):** podczas pracy
  częściej przekazywać krótkie, konkretne aktualizacje (około30–60 sekund):
  bieżąca zmiana/sprawdzenie, wynik i następny krok. Aktualizacja nie kończy
  pracy i nie zastępuje wykonania planu.

- **Nadrzędna zasada ciągłości (decyzja użytkownika 2026-10-12):** realizować
  uzgodniony plan do końca bez oczekiwania na kolejne „kontynuuj”. Pytanie
  o postęp, odpowiedź ze statusem, zakończenie paczki ani skrócenie kontekstu
  nie kończą pracy. Po krótkiej aktualizacji wracać do bieżącego zadania,
  a po jego zamknięciu przechodzić do następnego z kolejki. Stan odtwarzać
  z dokumentów repo; nie wymagać nowej rozmowy. Przerwać wyłącznie na
  wyraźne polecenie użytkownika, przy rzeczywistej blokadzie wykonania
  albo kluczowej decyzji architektonicznej bez wystarczających ustaleń.
  Nie deklarować pracy w tle, jeśli żaden proces faktycznie nie działa.

- **Środowisko Codexa (decyzja użytkownika 2026-10-11):** można wykonywać
  cięższe zadania lokalne, w tym przeglądarkowe podglądy, SQL i testy.
  Nie obowiązuje wcześniejsze ograniczenie dla Termuxa. Zachować punktowe
  E2E i wymagane bramki wdrożenia; nie mnożyć ciężkich procesów bez potrzeby.

- Zasady działania i kolejka: `docs/wdrozenia.md` (sekcje „Kolejka”,
  „Zasady działania”). Praca w tle bez pytania o zgodę.

- **Kontynuacja (decyzja użytkownika 2026-10-11):** zawsze kontynuować bez
  pytania, także po zakończeniu paczki. Zatrzymać się tylko przy kluczowej
  decyzji architektonicznej, której brak w ustaleniach. Manual zawsze na końcu.
- Najpierw branch roboczy, testy, potem push na `main`.
- Unit: `cd tests && node --test unit/*.test.js`.
- E2E: workflow `e2e-tests.yml` (workflow_dispatch) z niepustym
  `spec_filter` — nigdy całego zestawu (`scripts/agent-tools/e2e-seq.sh`). Spece z `tests/e2e/helpers/local-site.js`
  testują kod brancha; pozostałe chodzą po produkcji.
- **Test accounts (decyzja użytkownika 2026-10-22, E25):** role `standard`,
  `noaccount`, `disposable`, `dedicated`, `guest`; zasoby `mail`, `heavy`.
  `dedicated` = konto przypisane na stałe do jednej czynności (rejestr w
  `tests/README.md` „Dedicated accounts”); brak wolnych → prośba do użytkownika.
  Spec deklaruje potrzeby (`test.use({ needs })` na górze pliku, wzór
  `tests/e2e/e2e-lease.spec.js`), worker
  wypożycza (lease) konta na wyłączność — równoległe przebiegi bez umawiania
  się. Nazwy `e2e.<role><NN>`, e-mail `e2e+<role><NN>@familiada.online`
  (jedna reguła Cloudflare `e2e@` + Subaddressing). Nazewnictwo po angielsku.
  Stare zasady (`test1`…`test17`, `testAccountUsername`, pula, `test_accounts`)
  wycofane — nie dopisywać nowych użyć. Zasady: `tests/README.md`
  „Test accounts”; plan i pakiety: `docs/konta-testowe-plan.md`.
- **Przepisywanie speców stopniowo (decyzja użytkownika 2026-10-22):** kto
  zmienia spec ze starymi kontami, przepisuje go na `helpers/e2e-test` w tym
  samym etapie (przewodnik: `tests/README.md` „Jak przepisać stary spec”);
  zapadka `unit/legacyTestAccounts.test.js` — przepisany plik usunąć
  z `unit/legacy-test-accounts.json`. Spece ze starymi kontami: jeden przebieg
  naraz jak dotąd. Reguły Cloudflare `testN@` usunięte (2026-10-22): poczta
  na `testN@` nie dochodzi — spece z pocztą przepisać na `e2e+` przed przebiegiem.
- **Odczyt produkcji bez migracji (2026-10-20):** workflow `db-read.yml`
  (`workflow_dispatch`, wejście `sql_file`) z plikiem `scripts/db-read/<nazwa>.sql`
  — jedno zapytanie SELECT bez `;` i `\`, sesja tylko do odczytu, wynik tylko
  liczby/bool/UUID/daty (`scripts/db-read.sh` odrzuca tekst i JSON), połączenie
  jako rola `agent_reader` (414: SELECT tylko na tabelach gier/baz/ankiet
  i aktywności, bez `auth`, profili, poczty; nie superużytkownik; nowa tabela
  do odczytu = GRANT w migracji). Repo jest
  publiczne: żadnych treści gier, nazw ani e-maili w logach. Migracje
  diagnostyczne już niepotrzebne. Z agenta: `scripts/agent-tools/gh-run.sh
  db-read.yml sql_file=…` (uruchamia, czeka, wypisuje wynik z adnotacji).
- **Przerwa techniczna (decyzja użytkownika 2026-10-20):** włącza i wyłącza
  ją **wyłącznie właściciel w panelu admina**. Agent nie ma do tego narzędzia.
  Agent ocenia, czy praca wymaga przerwy: zmiany jawne i nieszkodliwe dla
  użytkowników (dodające migracje, odczyty, wdrożenia zgodne wstecz) idą bez
  przerwy; gdy zmiana może zaszkodzić albo przerwać czyjąś pracę — prosi
  użytkownika o przerwę (powód i czas), wcześniej podaje, czy ktoś pracuje
  (`scripts/db-read/maintenance-blockers.sql`: gra w Control, edycja, osoby
  w edytorach/ustawieniach/Eksploratorze/logo/ankietach, głosy z 10 min),
  a pracę zaczyna dopiero, gdy `maintenance.yml` (tylko odczyt: stan przerwy
  i aktywność) potwierdzi, że przerwa jest włączona.
- Migracje bezpieczne (dodające) od razu na `main`, potem testy.
- Migracje tylko do przodu: `supabase/migrations/YYYY-MM-DD_NNN_*.sql`,
  stosowane po pushu na `main`; `schema.sql` aktualizuje CI.
- Scalanie `main` z konfliktami wersji `?v=`: `python3 scripts/resolve-version-conflicts.py`
  (po `git -c merge.conflictstyle=diff3 merge`; rozwiązuje tylko hunki, gdzie jedna strona zmieniła same wersje), resztę ręcznie, potem
  `node scripts/version-assets.js`; przed commitem unit (test `noConflictMarkers`). **Nigdy `git checkout --ours -- web`** ani `git add -A` przy nierozwiązanych konfliktach — zgubiło
  zmiany innych sesji (2026-10-09).
- Bez fallbacków: żadnych aliasów starych adresów ani przekierowań.
- Komentarz w JS nie może zawierać `*/` (np. `editor-*/` w ścieżce).

## Stan i wznawianie

- Po każdym kroku (commit, przebieg e2e, decyzja) wpis w „Dzienniku”
  w `docs/wdrozenia.md` — kolejna sesja kontynuuje z samych dokumentów.
- Pauza na prośbę użytkownika („poczekaj”, „nie wznawiamy”): przerwać
  biegnące e2e, wznowienie dopiero po „wracamy”.
- Narzędzia: `scripts/agent-tools/` (e2e po kolei, lint `no-undef`, podgląd
  stron z atrapą Supabase).
