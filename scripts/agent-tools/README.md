# Narzędzia pracy agenta (Claude / Codex)

| Plik | Do czego |
|---|---|
| `e2e-seq.sh` | Kolejne grupy e2e przez workflow `e2e-tests.yml` (`spec_filter`), każda dopiero gdy nic innego nie biegnie. `REF=<gałąź>` dla speców z `tests/e2e/helpers/local-site.js`. |
| `eslint-undef.config.mjs` | Lint tylko na niezdefiniowane identyfikatory (po regresji 2026-10-09: `ret` w polls.js): `npx eslint -c scripts/agent-tools/eslint-undef.config.mjs <pliki>` (eslint z globalnej instalacji). |
| `preview-poll-stub.js` | Podgląd strony z atrapą Supabase (fałszywy token w `localStorage`, podmiana `@supabase` z CDN, RPC z mapy). Wzór do podglądu dowolnej strony: zmień adres i mapy `DATA`/`RPC`. Gość: `user_metadata.is_guest = true`. |
| `qrcode.esm.js` | Paczka `qrcode@1.5.3` jako ESM — CDN bywa zablokowany w środowisku agenta. |

Uwagi:
- W atrapie RPC muszą zwracać `{data: wartość}` (bez tablicy), inaczej
  `guardResourceLock`/`game_validate` uznają odpowiedź za błąd i strona
  zostaje pusta albo za nakładką.
- Nakładkę blokady (`#resourceLockGuard`) można usunąć przed zrzutem.
- Lokalny Postgres do migracji: `docs/sql/local-db.md` (port 5499).

## Baza produkcyjna, przerwa techniczna i workflow z poziomu agenta

| Narzędzie | Do czego |
|---|---|
| `gh-run.sh <workflow> klucz=wartość…` | Uruchamia workflow (`workflow_dispatch`, `REF=` domyślnie `main`), czeka na koniec i wypisuje adnotacje przebiegu przez API GitHuba — działa także tam, gdzie host z logami Actions jest zablokowany. `LOGS=50` dodatkowo próbuje pobrać koniec logu. Wymaga `GITHUB_TOKEN`. |
| `gh-run.sh db-read.yml sql_file=scripts/db-read/<nazwa>.sql` | Odczyt produkcji: jedno SELECT bez `;`/`\`, sesja READ ONLY, wynik tylko liczby/bool/UUID/daty (`scripts/db-read.sh`). Repo publiczne — żadnych treści, nazw, e-maili. |
| `gh-run.sh db-read.yml sql_file=scripts/db-read/whoami.sql` | Kontrola roli: `agent_reader`, nie superużytkownik, bez `auth`/profili, bez zapisu. `check-auth-denied.sql` ma się nie udać. |
| `gh-run.sh db-read.yml sql_file=scripts/db-read/activity-now.sql` | Kto jest teraz na stronie (liczby) i gry z aktywną sesją Control — sprawdzać przed zmianą danych. |
| `gh-run.sh maintenance.yml action=status` | Stan przerwy technicznej i aktywność. |
| `gh-run.sh maintenance.yml action=on minutes=15 code=123456` | Przerwa z odliczaniem. **Tylko po wyraźnej zgodzie użytkownika na tę konkretną przerwę** (zasada w `CLAUDE.md`). Odmawia, gdy trwa praca: Control, edycja, głosy w ankietach (`scripts/db-read/maintenance-blockers.sql`; `force=true` tylko na polecenie). Po czasie sama się wyłącza (o ile nikt nie zmienił stanu). Przebieg czeka na zatwierdzenie właściciela (środowisko `maintenance`) i wymaga jednorazowego kodu TOTP od użytkownika (5 min, tylko raz; `scripts/totp-check.py`); po zatwierdzeniu ponownie sprawdza aktywność. |
| `gh-run.sh db-read.yml sql_file=scripts/db-read/maintenance-blockers.sql` | Co przerwałaby przerwa teraz (liczby, źródła jak panel admina, bez kont testowych/admina). |
| `gh-run.sh maintenance.yml action=off code=123456` | Wyłącza przerwę od razu (zatwierdzenie i kod jak przy `on`). |

Lokalnie odczyt na testowej bazie:
`PSQL_CMD="psql -h /var/tmp/pgfam -p 5499 -U postgres -d fam" scripts/db-read.sh scripts/db-read/<nazwa>.sql`.

