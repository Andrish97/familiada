# Lokalne e2e (bez produkcji)

Spece z `tests/e2e/` na **kodzie z dysku** i **lokalnej bazie** — przed
wdrożeniem migracji, bez kont testowych i bez dotykania produkcji.
Uzupełnienie cyklu z `CLAUDE.md` (nie zastępuje testów na produkcji).

```bash
scripts/agent-tools/local-e2e/setup.sh              # Postgres + migracje brancha + PostgREST
scripts/agent-tools/local-e2e/run.sh e2e/base-explorer.spec.js --grep "kosz"
```

Jak działa (`preload.cjs`, ładowany przez `NODE_OPTIONS=--require`):

- `www.familiada.online/*` → pliki `web/` z dysku (`/x` = `/x/index.html`).
- `api.familiada.online/rest/v1/*` → lokalny PostgREST (`:3555`) na
  Postgresie z `schema.sql` + migracje brancha (`setup.sh`).
- `/auth/v1/*` → atrapa: dowolny e-mail dostaje sesję z JWT podpisanym
  lokalnym kluczem; konto (`auth.users` + `profiles`) powstaje przy
  pierwszym użyciu, id = skrót e-maila.
- `loginAsTestUser` podmieniony: sesja od razu w `localStorage` (ekran
  `/login` wymaga Turnstile od Workera, którego tu nie ma).
- Inne hosty są odcinane (bez Workera, maili, Edge Functions, realtime).

Ograniczenia: brak maili (`@mailbox`), Workera, Storage i realtime;
`schema.sql` nie zawiera danych (np. szablonów demo) — poza politykami
limitów maili, które `setup.sh` dokłada. Spece zależne od tych usług
padną lokalnie także na kodzie z `main` — porównuj z przebiegiem na `main`
(worktree `origin/main` i `LB_REPO=<worktree>`).

Zmienne: `LB_REPO` (katalog repo ze stronami), `LB_CHROME` (Chromium,
domyślnie `/opt/pw-browsers/chromium`), `LB_PGRST`, `LB_SECRET`.
