# Audyt sprzątania bazy (2026-10-23)

Stan: **audyt zrobiony, nic nie usunięto**. Lista do decyzji użytkownika.

## Metoda

1. Statycznie: każda funkcja, tabela i indeks z `supabase/schema.sql`
   sprawdzone pod kątem odwołań w kodzie aplikacji (`web/`, Worker
   `cloudflare/`, funkcje Edge `supabase/functions/`, `services/`) oraz
   w innych obiektach bazy (funkcje, triggery, polityki, widoki). Osobno
   sprawdzone odwołania w testach i skryptach. Jedyna dynamicznie składana
   nazwa RPC to `friends_${kind}` (`web/shared/js/core/contacts-page.js`).
   Zadania cron odtworzone z migracji (rola `agent_reader` nie ma dostępu
   do schematu `cron`).
2. Odczyt produkcji (`db-read.yml`, tylko liczby, bool i daty):
   - `cleanup-table-usage`: przebieg 39948672830,
   - `cleanup-function-usage`: przebieg 39948774387,
   - `cleanup-table-heap`: przebieg 39948877229,
   - `cleanup-index-usage`: przebieg 39949048844,
   - `cleanup-env`: przebieg 39949335999.

   Liczniki skanów są liczone od startu serwera, czyli 2026-10-21 06:01 UTC
   (`stats_reset` puste). Okno to tylko ~2 doby, więc samo „0 skanów” to
   słaby dowód. Duplikaty z A1 wynikają ze struktury, nie ze statystyk.
   Baza ma 324 MB. W `public` jest 735 funkcji, a w dumpie 587; różnica to
   najpewniej funkcje rozszerzeń (`vector`, `pg_trgm`), których dump nie
   zawiera.
   `track_functions` jest wyłączone, więc nie ma liczby wywołań funkcji.
   O tym, czy funkcja jest martwa, rozstrzyga brak odwołań w kodzie,
   a nie statystyki.

## A. Bezpieczne: usunięcie bez zmiany zachowania

### A1. Zduplikowane indeksy

Te indeksy dublują inne, więc każdy zapis aktualizuje je niepotrzebnie.

| Tabela | Usunąć | Zostaje |
|---|---|---|
| `questions` | `idx_questions_game`, `questions_game_idx` (`game_id`), `questions_game_ord_idx`, `questions_game_ord_uq`, constraint `questions_game_ord_unique` | `questions_game_ord_uniq` (UNIQUE `game_id, ord`) |
| `poll_votes` | `poll_votes_by_session`, `poll_votes_session_idx` | `poll_votes_unique_per_q` (`poll_session_id, …`) |
| `poll_votes` | `poll_votes_game_idx` (0 skanów) | `poll_votes_game_q_idx`, `idx_poll_votes_game_user_token` |
| `answers` | `answers_q_idx` | `answers_q_ord_uniq` |
| `poll_text_entries` | `pte_by_session` | `pte_unique_per_q` |
| `poll_sessions` | `poll_sessions_game_idx` | `poll_sessions_game_open_idx` |
| `qb_category_tags` / `qb_question_tags` / `qb_tags` / `user_logos` | `*_category_id_idx`, `*_question_id_idx`, `qb_tags_base_id_idx`, `user_logos_user_id_idx` | PK / UNIQUE zaczynające się od tej samej kolumny |
| `games` | `games_keys_poll_idx` | `games_share_keys_unique` (pierwsza kolumna `share_key_poll`) |

Żaden constraint nie jest `DEFERRABLE`, a w kodzie nie ma
`ON CONSTRAINT <nazwa>`, więc usunięcie duplikatu niczego nie zmienia.

### A2. Martwe funkcje

Te funkcje nie mają żadnego wywołującego w kodzie ani w bazie. Kolumna
„anon” mówi, czy dziś może je wywołać każdy (`EXECUTE` dla `anon`).

| Grupa | Funkcje | anon |
|---|---|---|
| Przykład | `rpc_example` | nie |
| Stare RPC ankiet (wskazane już w `ankiety-refaktor.md` §4 pkt 6, pominięte przy E14) | `poll_vote`, `poll_vote_points`, `poll_vote_by_ids_legacy`, `poll_text_submit_simple_legacy`, `poll_results`, `get_poll_bundle`, `poll_on_login`, `polls_action`, `polls_hub_gc`, `polls_hub_list_polls`, `polls_hub_list_open_polls`, `polls_hub_anon_voters_poll_points`, `polls_hub_anon_voters_poll_text`, `poll_admin_preview`, `poll_admin_delete_vote`, `poll_go_task_action`, `poll_close_and_normalize`, `poll_points_close_and_normalize`, `poll_text_close_apply`, `poll_task_send`, `poll_points_vote_batch_owner`, `poll_text_submit_batch_owner` | większość tak (SECURITY DEFINER) |
| Stare udostępnianie baz | `base_has_share`, `can_access_base`, `can_edit_base`, `list_shared_bases`, `share_base_by_email`, `base_share_by_email` | tak (poza dwiema ostatnimi) |
| Różne | `get_game_by_key`, `expire_my_device_shares`, `control_device_instance_status`, `control_device_slots_for_owner`, `storage_list_objects`, `_copy_game_send`, `_logo_image_path`, `_poll_text_tally_points`, `admin_config_get`, `admin_config_set` | część tak |
| Funkcje triggerów bez triggera | `enforce_max_answers`, `set_owner_id_on_games_insert`, `touch_state_at`, `update_lead_finder_updated_at` (tabele `lead_finder*` już nie istnieją), `update_marketing_updated_at` | (nie da się ich wywołać jako RPC) |

Dwie funkcje wymagają uwagi przy usuwaniu:
- `game_action_state` i `poll_admin_can_close` sprawdza test
  `tests/sql/poll-wording-402.sql`. Usunięcie wymaga poprawki tego testu.
- Odwołania w `scripts/db-read/*-acl-audit.*` i
  `scripts/screens/data` trzeba usunąć razem z funkcjami.

**Zostają** (wyglądały na martwe, ale nie są):
- triggery na `auth.users`: `handle_new_user`, `_guest_identity_metadata`,
  `_poll_identity_auth_trigger`, `_subscriber_identity_account_delete`
  (potwierdzone w `pg_trigger`);
- zadania cron: `_resource_clone_gc`, `_resource_copy_*_gc`,
  `control_runtime_expire_due`, `control2_session_events_cleanup`,
  `qb_trash_cleanup`, `storage_cleanup_cron`, `poll_mail_budget_expire_due`,
  `guest_cleanup_expired`, `market_cleanup_rejected`, `reset_email_limits`;
- narzędzia e2e i agenta: `e2e_*`, `acquire_edit_lock`,
  `list_base_shares`, `list_base_share_tasks_outgoing`,
  `control2_owner_session_events`, `agent_mail_window_counts`, `friends_*`
  (nazwa składana dynamicznie).

### A3. Martwa tabela

- `game_gen_queue`: ~11 wierszy (estymata), 0 zapisów od startu serwera, brak kodu i funkcji. Proces
  `process-game-queue` usunięto w migracji 112.

## B. Do decyzji: zmienia zachowanie albo usuwa dane

| # | Co | Stan na produkcji | Propozycja |
|---|---|---|---|
| B1 | `game_state_history` | ~10 MB (3,8 MB sterty + 6,1 MB TOAST). Każdy zapis `game_state_write` dodaje snapshot i przycina go do 20 na grę. Czyta ją tylko `game_state_undo`, której nikt nie wywołuje | Usunąć zapis w `game_state_write`, funkcję `game_state_undo` i tabelę (mniej zapisów przy każdym ruchu w Control) |
| B2 | Naprawa E21 | `e21_repair_runs`: 1 wpis (2026-10-21 01:30), zadanie cron samo się wyrejestrowało; `e21_demo_templates_before`: 9 wierszy (kopia szablonów sprzed poprawki) | Etap zamknięty: usunąć `e21_data_repair`, `e21_demo_*` i obie tabele (oraz pliki `scripts/db-read/e21-*`) |
| B3 | `shared_devices` (stare zapamiętane urządzenia) | Nic do niej nie pisze (0 INSERT w kodzie), zastąpiona przez `control_device_shares`. Nadal czyta ją `tasks_list`, a czyści ~8 funkcji | Usunąć odczyt z `tasks_list`, kasowania w funkcjach i tabelę. To większa migracja |
| B4 | `contact_reports` + `contact_report_messages` | Stary formularz (marzec). Funkcje zapisu nieużywane, tabele mają po ≤1 stronie danych. `admin_list_messages` (filtr `reports`) nadal czyta `contact_reports` | Sprawdzić w panelu, czy są tam stare zgłoszenia. Potem usunąć funkcje `submit_contact_report`, `find_report_and_append_message`, `admin_move_message`, `admin_update_contact_report`, odczyt w `admin_list_messages` i tabele |
| B5 | `mail_function_logs` | Największa tabela: 52 MB (24 MB sterty + 28 MB indeksów), ~91 tys. wierszy, retencja 1 miesiąc (cron `cleanup-mail-function-logs`). Indeksy `fn_created` (9,4 MB), `request` (2,4 MB) i `queue` (1,2 MB) mają 0 skanów w ~2 dobach; `level_created` (7,3 MB) ma 4 | Skrócić retencję (np. do 14 dni) i/lub usunąć nieużywane indeksy, jeśli panel admina ich nie potrzebuje |
| B6 | `marketing_search_logs` | 3,5 MB sterty na 12 wierszy (rozdęcie po 23 tys. usunięć) | `VACUUM FULL` na tej tabeli (krótka blokada, tabela tylko dla Lead Findera) |
| B7 | `cron_embed_missing_market_games` | Brak wywołującego: zadanie `embed-missing-market-games` od migracji 111 woła `invoke_embed_missing_market_games` | Usunąć po potwierdzeniu listy zadań w `cron.job` (wymaga właściciela) |
| B8 | Indeksy z 0 skanów od startu serwera | `games_keys_control/display/host_idx` (~0,9 MB), `market_games_embedding_ivfflat_idx` (1 MB), `market_games_questions_text_trgm_idx` (1 MB), `qb_questions_payload_text_idx` | Zostawić; ponowić odczyt `cleanup-index-usage` po ~2 tygodniach. Mogą obsługiwać rzadkie ścieżki (wyszukiwanie w Marketplace) |

Nie są śmieciami: tabele `marketing_*` (Lead Finder działa, panel admina),
`demo_template_data`, `schema_migrations`.

`public_kv` (≤1 wiersz, objęta testem 446) jest nieużywana od usunięcia
klucza TinyMCE w migracji 124. Można ją dołączyć do A3 po sprawdzeniu
zawartości.

## Uwagi

- Zadań cron nie da się odczytać rolą `agent_reader`. Pełna lista wymaga
  właściciela (`select jobname, schedule, active from cron.job`).
- Liczności z `n_live_tup` to estymaty. Dla tabel nigdy nieanalizowanych
  rozstrzyga rozmiar sterty (`cleanup-table-heap`).

## Decyzje

- (brak — czeka na użytkownika)
