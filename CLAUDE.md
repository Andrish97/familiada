# Familiada — zasady pracy

Rozmawiamy po polsku. Kod: vanilla JS (moduły ES z `?v=`, wersje
przepisuje CI), Supabase, Cloudflare Worker. Strony w `web/`.

## Zanim zaczniesz

- Przeczytaj [`docs/wdrozenia.md`](docs/wdrozenia.md) — kolejka etapów,
  stan, zasady i odnośniki do sekcji z decyzjami. To jest plan; rozmowa
  nim nie jest.
- Decyzje użytkownika zapisuj od razu w sekcji „Decyzje” właściwego
  dokumentu (`docs/nawigacja-mapa-plan.md`, `docs/blokady-zasobow.md`).

## Tok pracy

- Zasady działania i kolejka: `docs/wdrozenia.md` (sekcje „Kolejka”,
  „Zasady działania”). Praca w tle bez pytania o zgodę.

- Najpierw branch roboczy, testy, potem push na `main`.
- Unit: `cd tests && node --test unit/*.test.js`.
- E2E: workflow `e2e-tests.yml` (workflow_dispatch) z niepustym
  `spec_filter` — nigdy całego zestawu. Spece z `tests/e2e/helpers/local-site.js`
  testują kod brancha; pozostałe chodzą po produkcji.
- **Konta testowe test9@ i test10@ — nie używać** (decyzja 2026-10-09: na nich
  równolegle chodzą inne testy);
  pula e2e: test1–test8.
- Migracje bezpieczne (dodające) od razu na `main`, potem testy.
- Migracje tylko do przodu: `supabase/migrations/YYYY-MM-DD_NNN_*.sql`,
  stosowane po pushu na `main`; `schema.sql` aktualizuje CI.
- Scalanie `main` z konfliktami wersji `?v=`: `python3 scripts/resolve-version-conflicts.py`
  (rozwiązuje tylko hunki z samymi wersjami), resztę ręcznie, potem
  `node scripts/version-assets.js`. **Nigdy `git checkout --ours -- web`** — zgubiło
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
