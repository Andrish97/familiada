# Familiada — zasady pracy (AGENTS.md — dla Codexa; treść = CLAUDE.md)

Rozmawiamy po polsku. Kod: vanilla JS (moduły ES z `?v=`, wersje
przepisuje CI), Supabase, Cloudflare Worker. Strony w `web/`.

## Zanim zaczniesz

- **Przekazanie z 2026-10-10:** [`docs/przekazanie.md`](docs/przekazanie.md) — co
  zrobione, następny krok (E19 krok 3), otwarte sprawy.

- Przeczytaj [`docs/wdrozenia.md`](docs/wdrozenia.md) — kolejka etapów,
  stan, zasady i odnośniki do sekcji z decyzjami. To jest plan; rozmowa
  nim nie jest.
- Decyzje użytkownika zapisuj od razu w sekcji „Decyzje” właściwego
  dokumentu (`docs/nawigacja-mapa-plan.md`, `docs/blokady-zasobow.md`,
  `docs/ujednolicenie-wygladu.md`, `docs/e19-znajomi-plan.md`, `docs/ankiety-refaktor.md`).

## Tok pracy

- Zasady działania i kolejka: `docs/wdrozenia.md` (sekcje „Kolejka”,
  „Zasady działania”). Praca w tle bez pytania o zgodę.

- Najpierw branch roboczy, testy, potem push na `main`.
- Unit: `cd tests && node --test unit/*.test.js`.
- E2E: workflow `e2e-tests.yml` (workflow_dispatch) z niepustym
  `spec_filter` — nigdy całego zestawu. Spece z `tests/e2e/helpers/local-site.js`
  testują kod brancha; pozostałe chodzą po produkcji.
- **Konta testowe test4@, test5@, test9@ i test10@ — NIE UŻYWAĆ** w e2e ani
  ręcznie (decyzja 2026-10-09: test9/test10 — testy drugiej sesji; test4/test5 —
  odstąpione użytkownikowi do jego równoległych testów). Wykluczone w
  `EXCLUDED_TEST_ACCOUNTS` (`tests/e2e/helpers/login.js`); pula e2e: test1–3,
  test6–8 (test6/7/8 przypisane też na stałe w `subscriptions.spec.js`).
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
