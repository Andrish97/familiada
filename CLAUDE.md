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
  Kopie Gier/Logo: `docs/udostepnianie-kopii-plan.md` (E19C).

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

## Wygląd (decyzja 2026-10-10)

- Zasady: **symetria, równowaga i spójność** — elementy podobne funkcjonalnie
  (kafle, wiersze, paski akcji, okna, karty, filtry, puste stany) wyglądają
  i zachowują się tak samo na wszystkich stronach. Źródło wzorców:
  [`docs/wzorce-ui.md`](docs/wzorce-ui.md) (etap ujednolicenia E18; reszta
  poprawek wstrzymana — lista w `docs/przekazanie.md`).
- **Zrzuty po wykonaniu (decyzja użytkownika 2026-10-11):** zmiany wyglądu
  dokumentować zrzutami z przykładowymi danymi (telefon 390 px i komputer
  1400 px). Kontynuować bez czekania na ocenę lub zatwierdzenie użytkownika.

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
- **Konta testowe test9@ i test10@ — NIE UŻYWAĆ** (testy drugiej sesji;
  `EXCLUDED_TEST_ACCOUNTS` w `tests/e2e/helpers/login.js`). Pula e2e:
  test1–test8 (test4/test5 wróciły do puli 2026-10-10).
- **Równoległe przebiegi e2e**: domyślnie jeden naraz. Lżejsze przebiegi
  wolno puszczać równolegle, gdy każdy dostaje **rozłączny zestaw kont**
  (wejście workflow `test_accounts`, np. `1,2,3` i `4,5,6`) i spece logują się
  tylko przez pulę. Spece z kontami na stałe albo `@mailbox` — pojedynczo
  (szczegóły: `tests/README.md`, „Pula kont”).
- **test15@familiada.online — dedykowane usuwanie konta**, poza zwykłą pulą. Odtwarzać przed testem i w `finally`, sprawdzać logowanie oraz automatyczny wyjątek admina. Konta11/12 (adres13 dla12) zostają do testów hasła/profilu/e-maila.
- **test14@familiada.online — skrzynka BEZ konta** (podpięta pod Worker jak
  inne, do testów „bez konta”: subskrybent tylko e-mail, urządzenie na e-mail
  bez konta). Nie zakładać na nim konta.
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
