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
