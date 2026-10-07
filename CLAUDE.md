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

- Najpierw branch roboczy, testy, potem push na `main`.
- Unit: `cd tests && node --test unit/*.test.js`.
- E2E: workflow `e2e-tests.yml` (workflow_dispatch) z niepustym
  `spec_filter` — nigdy całego zestawu. Spece z `tests/e2e/helpers/local-site.js`
  testują kod brancha; pozostałe chodzą po produkcji.
- Migracje tylko do przodu: `supabase/migrations/YYYY-MM-DD_NNN_*.sql`,
  stosowane po pushu na `main`; `schema.sql` aktualizuje CI.
- Bez fallbacków: żadnych aliasów starych adresów ani przekierowań.
- Komentarz w JS nie może zawierać `*/` (np. `editor-*/` w ścieżce).
