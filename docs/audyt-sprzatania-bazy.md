# Audyt sprzątania bazy (2026-10-23)

Stan (2026-10-23): **wdrożone** — migracje 473–477 na produkcji (17:17 UTC),
kontrola `e26-after` zera, e2e produkcji zielone. Uwaga: weszły w czasie
zamrożenia schematu przeprowadzki (`przeprowadzka-serwera.md`). Sekcja
„Wykonanie” niżej.

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

### B1. `game_state_history` (~10 MB)
Zaplanowana w Control v2 (migracja 259) jako „lekkie cofnięcie”. Przycisk
cofania nigdy nie powstał, a `game_state_undo` nie ma wywołującego. Mimo to
każdy zapis stanu (`game_state_write`) kopiuje cały poprzedni stan do
historii i przycina ją do 20 na grę. Przez ~2 doby było to ~2,9 tys.
kopii i ~4,8 tys. usunięć. Decyzja: **usunąć** (zapis w `game_state_write`,
`game_state_undo`, tabela; lżejszy każdy ruch w Control) **albo zbudować
cofanie** w Control. Zmiana dotyka gorącej ścieżki gry, więc trzeba e2e
Control.

### B2. Pozostałości naprawy E21
Naprawa wykonała się raz (`e21_repair_runs`: 1 wpis, 2026-10-21 01:30)
i sama zdjęła się z crona. `e21_demo_templates_before` (9 wierszy) to
kopia szablonów demo sprzed poprawki, czyli jedyna droga „wstecz”.
Decyzja: czy kopia jest jeszcze potrzebna. Jeśli nie, usunąć tabele,
`e21_data_repair`, `e21_demo_*` i `scripts/db-read/e21-*`.

### B3. `shared_devices` (stare zapamiętane urządzenia, marzec)
Nic do niej nie pisze, bo zastąpiła ją `control_device_shares`. Czyta ją
już tylko `tasks_list` (część `device`), ale strona Zadań i tak filtruje
wynik do `kind = 'poll'`, więc w praktyce to martwy kod. Czyści ją ~8
funkcji (usuwanie konta, gry, e2e). Usunięcie nie zmienia niczego
widocznego, tylko dotyka wielu funkcji: większa migracja i test SQL.
W tej samej migracji można usunąć części `base`/`device` z `tasks_list`.

### B4. Stary formularz kontaktowy (`contact_reports`, `contact_report_messages`)
Zakładka „Zgłoszenia” w panelu korzysta z `reports` (`list_reports`).
Gałąź `list_messages(p_filter='reports')` czytająca `contact_reports` nie
jest wywoływana, bo panel obsługuje folder `reports` osobno. Funkcje zapisu
starego formularza są martwe. Tabele mają po ≤1 stronie danych, więc mogą
zawierać kilka starych zgłoszeń z e-mailami. Decyzja: usunąć dane czy
najpierw je przejrzeć lub przenieść. Potem usunąć 4 funkcje, gałąź
w `list_messages` i tabele.

### B5. `mail_function_logs` (52 MB, największa tabela)
Około 3,6 tys. wpisów na dobę, retencja 1 miesiąc. Panel (`/_admin_api/mail/logs`)
filtruje po `function_name` i `level` z sortowaniem po dacie, więc indeksy
`fn_created` i `level_created` są potrzebne (0 skanów to tylko krótkie okno).
Indeksów `request_id` (2,4 MB) i `queue_id` (1,2 MB) nie używa żadne
zapytanie, więc są do usunięcia. Odwrotnie: e2e czyta logi po
`recipient_email` bez indeksu (skan całej tabeli). Panel ukrywa wpisy
testowe (`hideTestRecipients`), ale tabela je przechowuje. Decyzje:
(a) retencja, np. 14 dni; (b) usunąć 2 nieużywane indeksy; (c) opcjonalnie
krótsza retencja dla adresów `e2e+…`.

### B6. `marketing_search_logs`
3,5 MB sterty na 12 wierszy (rozdęcie po ~23 tys. usunięć). `VACUUM FULL`
blokuje tylko tę tabelę na ułamek sekundy (Lead Finder). Bez wpływu na
użytkowników.

### B7. `cron_embed_missing_market_games` i `app_config.edge_service_role_jwt`
Od migracji 111 zadanie `embed-missing-market-games` woła
`invoke_embed_missing_market_games` (sekrety z Vault). Stara funkcja nie ma
wywołującego, ale migracja 450 ją jeszcze poprawiała. Czyta z
`app_config` klucze `edge_url` i `edge_service_role_jwt`, czyli być może
zapisany jawnie token `service_role` (migracja 110 wstawiła pusty, ale
mógł zostać uzupełniony). Tabela jest zamknięta RLS, a `ntfy_topic`
z niej nadal działa. Decyzja: po potwierdzeniu `cron.job` usunąć funkcję
i oba klucze. Jeśli token był wpisany, warto go uznać za do wymiany.

### B8. Indeksy z 0 skanów i polityka RLS po kluczach
`games_keys_control/display/host_idx` (~0,9 MB) obsługują tylko martwe
`get_game_by_key` i `poll_results` (A2) oraz politykę
`games_select_by_keys`. Ta polityka sprawdza claim `share_key` w JWT,
a żaden kod takiego tokenu nie wystawia, więc też jest pozostałością
(liczona przy każdym odczycie `games`). Po A2 można usunąć politykę i te 3
indeksy. Indeksy Marketplace (`embedding_ivfflat`, `questions_text_trgm`)
obsługują `market_find_similar_*` przy zgłaszaniu gier (rzadkie), więc
**zostają**. `qb_questions_payload_text_idx`: ponowić `cleanup-index-usage`
po ~2 tygodniach.

Nie są śmieciami: tabele `marketing_*` (Lead Finder działa, panel admina),
`demo_template_data`, `schema_migrations`.

`public_kv` (≤1 wiersz, objęta testem 446) jest nieużywana od usunięcia
klucza TinyMCE w migracji 124. Można ją dołączyć do A3 po sprawdzeniu
zawartości.

## Wykonanie (2026-10-23)

Ponowny audyt po „zaczynaj”: scalony `main` (nowa tylko migracja 472 —
przejmowanie urządzeń, bez związku z listami); analiza statyczna na świeżym
`schema.sql` — żaden usuwany obiekt nie zyskał użycia; odczyty produkcji
39990453597 (sterta) i 39990515391 (indeksy) — bez zmian względem audytu.

Różnice względem listy (dodane przy wykonaniu):
- `fam_clip_words` — używała jej tylko naprawa E21 (B2);
- `contact_reports_set_updated_at` — funkcja triggera starego formularza (B4);
- `_delete_user_data`: nie kasuje już zgłoszeń. **Decyzja użytkownika
  2026-10-23:** zgłoszenie zostaje także po usunięciu konta autora (słuszne
  zgłoszenie trzeba móc poprawić). Usunięcie konta ustawia
  `reports.author_account_deleted_at`, a panel admina pokazuje plakietkę
  „konto usunięte”. Zmienia to decyzję 3 z 2026-10-07 w `usuwanie-danych.md`;
- `e2e_shared_devices_cleanup` zostaje (spece), bez kasowania `shared_devices`
  i bez klucza `deleted` w wyniku;
- B6: `CLUSTER … USING marketing_search_logs_pkey` zamiast `VACUUM FULL`
  (migracje idą w jednej transakcji);
- B7: gdy zadanie cron nadal woła starą funkcję, migracja ją zostawia
  z ostrzeżeniem w logu (zamiast przerywać kolejkę migracji);
- skrypty audytu uprawnień (`*-acl-audit`, `public-read-audit`) bez zmian —
  dla usuniętych obiektów zwracają −1 / brak.

Migracje: 473 (A, B5–B8), 474 (B1), 475 (B2), 476 (B3 + oznaczanie
zgłoszeń usuniętego konta: kolumna `reports.author_account_deleted_at`,
`list_reports` z tym polem, uprawnienia jak w 443), 477 (B4). Panel admina
(`web/settings/js/settings.js`): plakietka „konto usunięte” na liście
zgłoszeń; zrzut `admin-reports-deleted-author` (komputer i telefon). Testy lokalne: `tests/sql/e26-cleanup-473-477.sql`
(przeniesienie 2 zgłoszeń / 5 wiadomości, kolizja numeru, zapis stanu gry,
tasks_list, usunięcie konta zostawia zgłoszenie z oznaczeniem) i `tests/sql/e26-b7-cron-473.sql` — OK.
Kontrola po wdrożeniu: `scripts/db-read/e26-after.sql` (oczekiwane zera).

## Uwagi

- Zadań cron nie da się odczytać rolą `agent_reader`. Pełna lista wymaga
  właściciela (`select jobname, schedule, active from cron.job`).
- Liczności z `n_live_tup` to estymaty. Dla tabel nigdy nieanalizowanych
  rozstrzyga rozmiar sterty (`cleanup-table-heap`).

## Decyzje

**2026-10-23 (użytkownik): zapisać do zrobienia, na razie nic nie robić.**
Start dopiero na wyraźne polecenie.

**Pierwszy krok po „zaczynaj” (decyzja użytkownika 2026-10-23):** ponowić
audyt, zanim powstanie jakakolwiek migracja, bo baza i kod mogły się
zmienić w międzyczasie:
1. scalić aktualny `main` i porównać nowe migracje (po 471) oraz zmiany
   w `web/`, Workerze i funkcjach Edge z listami A i B;
2. ponowić analizę statyczną (odwołania do każdej usuwanej funkcji,
   tabeli i indeksu) na świeżym `schema.sql`;
3. ponowić odczyty `db-read` (`cleanup-table-usage`, `cleanup-table-heap`,
   `cleanup-function-usage`, `cleanup-index-usage`, `cleanup-env`);
4. każdą różnicę względem tego dokumentu (nowe użycie, nowe dane, nowy
   obiekt) opisać tu i zgłosić użytkownikowi przed usuwaniem tego obiektu;
   resztę wykonywać według decyzji.

- **B1 — usunąć:** cofanie zostało wycofane („cofanie zostało cofnięte”).
  Usunąć zapis historii w `game_state_write`, funkcję `game_state_undo`
  i tabelę `game_state_history`; poprawić komentarze i dokumentację, które
  o nich wspominają (np. komentarz tabeli `game_state`).
- **B2 — wyczyścić:** kopia szablonów nie jest potrzebna. Usunąć
  `e21_demo_templates_before`, `e21_repair_runs`, `e21_data_repair`,
  `e21_demo_*` i pliki `scripts/db-read/e21-*`.
- **B3 — usunąć:** „urządzenia to sprawa chwilowa”, więc nie przenosić
  danych. Usunąć `shared_devices` (wiersze, tabelę, trigger
  `copy_pending_shared_devices`), kasowania w funkcjach i część `device`
  w `tasks_list`.
- **B4 — przenieść:** zgłoszenia z `contact_reports` i
  `contact_report_messages` przenieść do `reports` / `messages` (nowy
  model), potem usunąć stare funkcje, gałąź `list_messages('reports')`
  i stare tabele.
- **B5 — indeksy, retencja bez zmian:** logi zostają na 30 dni.
  Dodać indeks pod zapytanie e2e (`recipient_email`, `created_at`), żeby
  nie skanować całej tabeli. Usunąć nieużywane indeksy `request_id`
  i `queue_id`; `fn_created` i `level_created` zostają (filtry panelu).
- **B6 — zgoda:** `VACUUM FULL` na `marketing_search_logs`.
- **B7 — posprzątać:** usunąć `cron_embed_missing_market_games` oraz klucze
  `edge_url` i `edge_service_role_jwt` z `app_config`. Listę `cron.job`
  użytkownik sprawdzi, jeśli będzie trzeba. Migracja ma sama przerwać,
  gdy jakieś zadanie cron nadal woła starą funkcję.
- **B8 — posprzątać:** usunąć politykę `games_select_by_keys` i indeksy
  `games_keys_control/display/host_idx` (po usunięciu funkcji z A2).
  Indeksy Marketplace zostają.
- Część A: zaproponowana jako bezpieczna, wykonanie razem z resztą.
