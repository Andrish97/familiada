# Familiada — zasady pracy

Rozmawiamy po polsku. Kod: vanilla JS (moduły ES z `?v=`, wersje
przepisuje CI), Supabase, Cloudflare Worker. Strony w `web/`.

## Zanim zaczniesz

- Przekazanie z 2026-10-10: [`docs/przekazanie.md`](docs/przekazanie.md).
  `AGENTS.md` (Codex) ma te same zasady — zmieniaj oba pliki razem.

- Przeczytaj [`docs/wdrozenia.md`](docs/wdrozenia.md) — kolejka etapów,
  stan, zasady i odnośniki do sekcji z decyzjami. To jest plan; rozmowa
  nim nie jest.
- Decyzje użytkownika zapisuj od razu w sekcji „Decyzje” właściwego
  dokumentu (`docs/nawigacja-mapa-plan.md`, `docs/blokady-zasobow.md`,
  `docs/ujednolicenie-wygladu.md`, `docs/e19-znajomi-plan.md`, `docs/ankiety-refaktor.md`).

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
- **Konsultacja z użytkownikiem hurtowo**: zmiany wyglądu zbierać w paczki
  (wg wzorca, nie strona po stronie), pokazać zrzuty przed/po (telefon 390 px
  i komputer 1400 px) i pytać raz o całą paczkę — nie o każdy drobiazg.
  Funkcje i poprawki błędów — bez pytania.

## Tok pracy

- **Ograniczenie obciążenia lokalnego (decyzja 2026-10-11):** w tym
  środowisku ograniczać ciężkie zadania i testy symulacyjne — powodują lagi
  i awarie. Nie uruchamiać lokalnie przeglądarek e2e, rozbudowanych
  symulacji ani wielu ciężkich procesów naraz. E2E wykonywać punktowo
  w GitHub Actions; wymagane unit i testy SQL wykonywać pojedynczo,
  z ograniczoną współbieżnością, a cięższe sprawdzenia przenosić
  do odizolowanego runnera. Zachować wymagane bramki przed wdrożeniem.

- Zasady działania i kolejka: `docs/wdrozenia.md` (sekcje „Kolejka”,
  „Zasady działania”). Praca w tle bez pytania o zgodę.

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

## Limit i wznawianie (decyzja 2026-10-08)

- W trakcie pracy zawsze uzbrojone **jedno** przypomnienie `send_later` na
  **teraz + 3 h 1 min**. Przy każdym kroku (commit, przebieg e2e,
  odpowiedź) stare kasowane (`delete_trigger`), ustawiane nowe. Gdy limit
  zatrzyma pracę, ostatnie przypomnienie wznawia ją 3 h 1 min po ostatniej
  aktywności — od „Dziennika” w `docs/wdrozenia.md`.
- Pauza na prośbę użytkownika („poczekaj”, „nie wznawiamy”): przerwać
  biegnące e2e, żadnych przypomnień ani timerów, wznowienie dopiero po
  „wracamy”.
