# Familiada — Polls / Subscriptions / Tasks — DB Snapshot (canonical)

Last verified: **2026-02-03**

> Źródło: eksport CSV z Supabase (indexes / FK / policies / RPC). **Uwaga:** w dostarczonych CSV brakuje pełnej listy kolumn `public.*` z `information_schema.columns` — poniżej kolumny są **odtworzone z indeksów i FK** (wystarczające do UI-kontraktu, ale do pełnej migracji doślemy później export kolumn).

## Tables

## Tables

### `public.profiles`

- `created_at` timestamp with time zone NOT NULL DEFAULT now()
- `email` text NOT NULL
- `id` uuid NOT NULL
- `username` text NOT NULL

### `public.games`

- `created_at` timestamp with time zone NOT NULL DEFAULT now()
- `id` uuid NOT NULL DEFAULT gen_random_uuid()
- `name` text NOT NULL DEFAULT 'Nowa Familiada'::text
- `owner_id` uuid NOT NULL
- `poll_closed_at` timestamp with time zone NULL
- `poll_opened_at` timestamp with time zone NULL
- `share_key_buzzer` text NOT NULL DEFAULT gen_share_key(18)
- `share_key_control` text NOT NULL DEFAULT gen_share_key(24)
- `share_key_display` text NOT NULL DEFAULT gen_share_key(18)
- `share_key_host` text NOT NULL DEFAULT gen_share_key(18)
- `share_key_poll` text NOT NULL DEFAULT gen_share_key(18)
- `status` USER-DEFINED NOT NULL DEFAULT 'draft'::game_status
- `type` USER-DEFINED NOT NULL DEFAULT 'prepared'::game_type
- `updated_at` timestamp with time zone NOT NULL DEFAULT now()

### `public.poll_sessions`

- `closed_at` timestamp with time zone NULL
- `created_at` timestamp with time zone NOT NULL DEFAULT now()
- `game_id` uuid NOT NULL
- `id` uuid NOT NULL DEFAULT gen_random_uuid()
- `is_open` boolean NOT NULL DEFAULT true
- `question_id` uuid NOT NULL
- `question_ord` integer NOT NULL

### `public.poll_subscriptions`

- `accepted_at` timestamp with time zone NULL
- `cancelled_at` timestamp with time zone NULL
- `created_at` timestamp with time zone NOT NULL DEFAULT now()
- `declined_at` timestamp with time zone NULL
- `id` uuid NOT NULL DEFAULT gen_random_uuid()
- `opened_at` timestamp with time zone NULL
- `owner_id` uuid NOT NULL
- `status` text NOT NULL DEFAULT 'pending'::text
- `subscriber_email` text NULL
- `subscriber_user_id` uuid NULL
- `token` uuid NOT NULL DEFAULT gen_random_uuid()

### `public.poll_tasks`

- `cancelled_at` timestamp with time zone NULL
- `created_at` timestamp with time zone NOT NULL DEFAULT now()
- `declined_at` timestamp with time zone NULL
- `done_at` timestamp with time zone NULL
- `game_id` uuid NOT NULL
- `id` uuid NOT NULL DEFAULT gen_random_uuid()
- `opened_at` timestamp with time zone NULL
- `owner_id` uuid NOT NULL
- `poll_type` text NOT NULL
- `recipient_email` text NULL
- `recipient_user_id` uuid NULL
- `share_key_poll` text NOT NULL
- `status` text NOT NULL DEFAULT 'pending'::text
- `token` uuid NOT NULL

### `public.poll_text_entries`

- `answer_norm` text NOT NULL
- `answer_raw` text NOT NULL
- `created_at` timestamp with time zone NOT NULL DEFAULT now()
- `game_id` uuid NOT NULL
- `id` uuid NOT NULL DEFAULT gen_random_uuid()
- `poll_session_id` uuid NOT NULL
- `question_id` uuid NOT NULL
- `voter_token` text NOT NULL

### `public.poll_votes`

- `answer_id` uuid NULL
- `answer_ord` integer NOT NULL
- `created_at` timestamp with time zone NOT NULL DEFAULT now()
- `game_id` uuid NOT NULL
- `id` uuid NOT NULL DEFAULT gen_random_uuid()
- `poll_session_id` uuid NULL
- `question_id` uuid NULL
- `question_ord` integer NOT NULL
- `voter_token` text NOT NULL

### `public.answers`

- `created_at` timestamp with time zone NOT NULL DEFAULT now()
- `fixed_points` integer NOT NULL DEFAULT 0
- `id` uuid NOT NULL DEFAULT gen_random_uuid()
- `ord` integer NOT NULL
- `question_id` uuid NOT NULL
- `text` text NOT NULL

## Notes / Open items

- Enums shown as `USER-DEFINED` in `information_schema.columns` (e.g. `games.type`, `games.status`, device types) should be documented explicitly once we export `pg_type` enum labels.

- `poll_subscriptions.status` and `poll_tasks.status` currently default to `'pending'`. We will standardize allowed values (CHECK or enum) during cleanup.

- Foreign keys, indexes, RPC list, and RLS policies are tracked in this same file; update after we export `pg_policies`, `pg_indexes`, and `pg_constraint`.

### `profiles`

**Columns (inferred)**
- email
- id
- username (case-insensitive index: `lower(username)`)
- username

**Foreign keys**
_brak_

**Indexes / uniques**
- **profiles_email_key**: `CREATE UNIQUE INDEX profiles_email_key ON public.profiles USING btree (email)`
- **profiles_pkey**: `CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)`
- **profiles_username_ci_uq**: `CREATE UNIQUE INDEX profiles_username_ci_uq ON public.profiles USING btree (lower(username))`
- **profiles_username_unique**: `CREATE UNIQUE INDEX profiles_username_unique ON public.profiles USING btree (lower(username)) WHERE ((username IS NOT NULL) AND (username <> ''::text))`
- **profiles_username_uq**: `CREATE UNIQUE INDEX profiles_username_uq ON public.profiles USING btree (username)`

**RLS policies**
- **profiles_insert_own** `INSERT` roles={public}
  - using: `—`
  - with_check: `(auth.uid() = id)`
- **profiles_select_own** `SELECT` roles={public}
  - using: `(auth.uid() = id)`
  - with_check: `—`
- **profiles_self_read** `SELECT` roles={public}
  - using: `(id = auth.uid())`
  - with_check: `—`

### `subscriptions`

**Columns (inferred)**
- id
- subscriber_email (case-insensitive index: `lower(subscriber_email)`)
- owner_id
- subscriber_user_id

**Foreign keys**
- `owner_id` → `profiles.id` (subscriptions_owner_id_fkey)
- `subscriber_user_id` → `profiles.id` (subscriptions_subscriber_user_id_fkey)

**Indexes / uniques**
- **subscriptions_owner_idx**: `CREATE INDEX subscriptions_owner_idx ON public.subscriptions USING btree (owner_id)`
- **subscriptions_owner_sub_email_uq**: `CREATE UNIQUE INDEX subscriptions_owner_sub_email_uq ON public.subscriptions USING btree (owner_id, lower(subscriber_email)) WHERE (subscriber_email IS NOT NULL)`
- **subscriptions_owner_sub_user_uq**: `CREATE UNIQUE INDEX subscriptions_owner_sub_user_uq ON public.subscriptions USING btree (owner_id, subscriber_user_id) WHERE (subscriber_user_id IS NOT NULL)`
- **subscriptions_pkey**: `CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id)`
- **subscriptions_sub_email_idx**: `CREATE INDEX subscriptions_sub_email_idx ON public.subscriptions USING btree (lower(subscriber_email))`
- **subscriptions_sub_user_idx**: `CREATE INDEX subscriptions_sub_user_idx ON public.subscriptions USING btree (subscriber_user_id)`

**RLS policies**
- **subs_insert_owner** `INSERT` roles={public}
  - using: `—`
  - with_check: `(owner_id = auth.uid())`
- **subs_select_owner** `SELECT` roles={public}
  - using: `(owner_id = auth.uid())`
  - with_check: `—`
- **subs_select_subscriber** `SELECT` roles={public}
  - using: `(subscriber_user_id = auth.uid())`
  - with_check: `—`
- **subs_update_owner** `UPDATE` roles={public}
  - using: `(owner_id = auth.uid())`
  - with_check: `(owner_id = auth.uid())`
- **subs_update_subscriber_self** `UPDATE` roles={public}
  - using: `(subscriber_user_id = auth.uid())`
  - with_check: `(subscriber_user_id = auth.uid())`

### `subscription_invites`

**Columns (inferred)**
- id
- recipient_email (case-insensitive index: `lower(recipient_email)`)
- owner_id
- recipient_user_id
- token

**Foreign keys**
- `owner_id` → `profiles.id` (subscription_invites_owner_id_fkey)
- `recipient_user_id` → `profiles.id` (subscription_invites_recipient_user_id_fkey)

**Indexes / uniques**
- **subscription_invites_owner_idx**: `CREATE INDEX subscription_invites_owner_idx ON public.subscription_invites USING btree (owner_id)`
- **subscription_invites_pkey**: `CREATE UNIQUE INDEX subscription_invites_pkey ON public.subscription_invites USING btree (id)`
- **subscription_invites_recipient_email_idx**: `CREATE INDEX subscription_invites_recipient_email_idx ON public.subscription_invites USING btree (lower(recipient_email))`
- **subscription_invites_recipient_user_idx**: `CREATE INDEX subscription_invites_recipient_user_idx ON public.subscription_invites USING btree (recipient_user_id)`
- **subscription_invites_token_key**: `CREATE UNIQUE INDEX subscription_invites_token_key ON public.subscription_invites USING btree (token)`
- **subscription_invites_token_uq**: `CREATE UNIQUE INDEX subscription_invites_token_uq ON public.subscription_invites USING btree (token)`

**RLS policies**
- **sub_invites_delete_owner** `DELETE` roles={public}
  - using: `(owner_id = auth.uid())`
  - with_check: `—`
- **sub_invites_insert_owner** `INSERT` roles={public}
  - using: `—`
  - with_check: `(owner_id = auth.uid())`
- **sub_invites_select_owner** `SELECT` roles={public}
  - using: `(owner_id = auth.uid())`
  - with_check: `—`
- **sub_invites_select_recipient** `SELECT` roles={public}
  - using: `(recipient_user_id = auth.uid())`
  - with_check: `—`
- **sub_invites_update_owner** `UPDATE` roles={public}
  - using: `(owner_id = auth.uid())`
  - with_check: `(owner_id = auth.uid())`

### `poll_subscriptions`

**Columns (inferred)**
- id
- owner_id
- subscriber_email
- subscriber_user_id
- token

**Foreign keys**
_brak_

**Indexes / uniques**
- **poll_subscriptions_owner_idx**: `CREATE INDEX poll_subscriptions_owner_idx ON public.poll_subscriptions USING btree (owner_id)`
- **poll_subscriptions_pkey**: `CREATE UNIQUE INDEX poll_subscriptions_pkey ON public.poll_subscriptions USING btree (id)`
- **poll_subscriptions_sub_email_idx**: `CREATE INDEX poll_subscriptions_sub_email_idx ON public.poll_subscriptions USING btree (subscriber_email)`
- **poll_subscriptions_sub_user_idx**: `CREATE INDEX poll_subscriptions_sub_user_idx ON public.poll_subscriptions USING btree (subscriber_user_id)`
- **poll_subscriptions_token_uq**: `CREATE UNIQUE INDEX poll_subscriptions_token_uq ON public.poll_subscriptions USING btree (token)`

**RLS policies**
- **poll_subs_select_owner_or_subscriber** `SELECT` roles={public}
  - using: `((auth.uid() = owner_id) OR (auth.uid() = subscriber_user_id))`
  - with_check: `—`

### `poll_tasks`

**Columns (inferred)**
- game_id
- id
- recipient_email (case-insensitive index: `lower(recipient_email)`)
- owner_id
- recipient_user_id
- token

**Foreign keys**
- `owner_id` → `profiles.id` (poll_tasks_owner_id_fkey)
- `recipient_user_id` → `profiles.id` (poll_tasks_recipient_user_id_fkey)

**Indexes / uniques**
- **poll_tasks_game_idx**: `CREATE INDEX poll_tasks_game_idx ON public.poll_tasks USING btree (game_id)`
- **poll_tasks_owner_idx**: `CREATE INDEX poll_tasks_owner_idx ON public.poll_tasks USING btree (owner_id)`
- **poll_tasks_pkey**: `CREATE UNIQUE INDEX poll_tasks_pkey ON public.poll_tasks USING btree (id)`
- **poll_tasks_recipient_email_idx**: `CREATE INDEX poll_tasks_recipient_email_idx ON public.poll_tasks USING btree (lower(recipient_email))`
- **poll_tasks_recipient_user_idx**: `CREATE INDEX poll_tasks_recipient_user_idx ON public.poll_tasks USING btree (recipient_user_id)`
- **poll_tasks_token_key**: `CREATE UNIQUE INDEX poll_tasks_token_key ON public.poll_tasks USING btree (token)`
- **poll_tasks_token_uq**: `CREATE UNIQUE INDEX poll_tasks_token_uq ON public.poll_tasks USING btree (token)`

**RLS policies**
- **poll_tasks_delete_owner** `DELETE` roles={public}
  - using: `(owner_id = auth.uid())`
  - with_check: `—`
- **poll_tasks_insert_owner** `INSERT` roles={public}
  - using: `—`
  - with_check: `(owner_id = auth.uid())`
- **poll_tasks_select_owner** `SELECT` roles={public}
  - using: `(owner_id = auth.uid())`
  - with_check: `—`
- **poll_tasks_select_owner_or_recipient** `SELECT` roles={public}
  - using: `((auth.uid() = owner_id) OR (auth.uid() = recipient_user_id))`
  - with_check: `—`
- **poll_tasks_select_recipient** `SELECT` roles={public}
  - using: `(recipient_user_id = auth.uid())`
  - with_check: `—`
- **poll_tasks_update_owner** `UPDATE` roles={public}
  - using: `(owner_id = auth.uid())`
  - with_check: `(owner_id = auth.uid())`

### `poll_sessions`

**Columns (inferred)**
- created_at
- game_id
- id
- is_open
- question_id

**Foreign keys**
- `game_id` → `games.id` (poll_sessions_game_id_fkey)
- `question_id` → `questions.id` (poll_sessions_question_id_fkey)

**Indexes / uniques**
- **poll_sessions_game_idx**: `CREATE INDEX poll_sessions_game_idx ON public.poll_sessions USING btree (game_id)`
- **poll_sessions_game_open_idx**: `CREATE INDEX poll_sessions_game_open_idx ON public.poll_sessions USING btree (game_id, is_open, created_at DESC)`
- **poll_sessions_pkey**: `CREATE UNIQUE INDEX poll_sessions_pkey ON public.poll_sessions USING btree (id)`

**RLS policies**
- **poll_sessions_owner_read** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **poll_sessions_owner_select** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **poll_sessions_owner_write** `ALL` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid()))))`
- **poll_sessions_select_owner** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **ps_owner_all** `ALL` roles={public}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid()))))`

### `poll_text_entries`

**Columns (inferred)**
- game_id
- id
- poll_session_id
- question_id
- voter_token

**Foreign keys**
- `game_id` → `games.id` (poll_text_entries_game_id_fkey)
- `poll_session_id` → `poll_sessions.id` (poll_text_entries_poll_session_id_fkey)
- `question_id` → `questions.id` (poll_text_entries_question_id_fkey)

**Indexes / uniques**
- **poll_text_entries_pkey**: `CREATE UNIQUE INDEX poll_text_entries_pkey ON public.poll_text_entries USING btree (id)`
- **pte_by_question**: `CREATE INDEX pte_by_question ON public.poll_text_entries USING btree (question_id)`
- **pte_by_session**: `CREATE INDEX pte_by_session ON public.poll_text_entries USING btree (poll_session_id)`
- **pte_unique_per_q**: `CREATE UNIQUE INDEX pte_unique_per_q ON public.poll_text_entries USING btree (poll_session_id, question_id, voter_token)`

**RLS policies**
- **poll_text_entries_insert_owner_open** `INSERT` roles={authenticated}
  - using: `—`
  - with_check: `((EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1 FROM poll_sessions s WHERE ((s.id = poll_text_entries.poll_session_id) AND (s.game_id = poll_text_entries.game_id) AND (s.is_open = true)))))`
- **poll_text_entries_owner_read** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **poll_text_entries_owner_select** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **poll_text_entries_select_owner** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **poll_text_owner_select** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **pte_owner_delete** `DELETE` roles={public}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **pte_owner_read** `SELECT` roles={public}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`

### `poll_votes`

**Columns (inferred)**
- answer_id
- game_id
- id
- poll_session_id
- question_id
- question_ord
- voter_token

**Foreign keys**
- `answer_id` → `answers.id` (poll_votes_answer_id_fkey)
- `game_id` → `games.id` (poll_votes_game_id_fkey)
- `poll_session_id` → `poll_sessions.id` (poll_votes_poll_session_id_fkey)
- `question_id` → `questions.id` (poll_votes_question_id_fkey)

**Indexes / uniques**
- **poll_votes_by_answer**: `CREATE INDEX poll_votes_by_answer ON public.poll_votes USING btree (answer_id)`
- **poll_votes_by_session**: `CREATE INDEX poll_votes_by_session ON public.poll_votes USING btree (poll_session_id)`
- **poll_votes_game_idx**: `CREATE INDEX poll_votes_game_idx ON public.poll_votes USING btree (game_id)`
- **poll_votes_game_q_idx**: `CREATE INDEX poll_votes_game_q_idx ON public.poll_votes USING btree (game_id, question_ord)`
- **poll_votes_pkey**: `CREATE UNIQUE INDEX poll_votes_pkey ON public.poll_votes USING btree (id)`
- **poll_votes_session_idx**: `CREATE INDEX poll_votes_session_idx ON public.poll_votes USING btree (poll_session_id)`
- **poll_votes_unique_per_q**: `CREATE UNIQUE INDEX poll_votes_unique_per_q ON public.poll_votes USING btree (poll_session_id, question_id, voter_token)`

**RLS policies**
- **poll_votes_insert_owner_open** `INSERT` roles={authenticated}
  - using: `—`
  - with_check: `((EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_votes.game_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1 FROM poll_sessions s WHERE ((s.id = poll_votes.poll_session_id) AND (s.game_id = poll_votes.game_id) AND (s.is_open = true)))))`
- **poll_votes_owner_delete** `DELETE` roles={public}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_votes.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **poll_votes_owner_read** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_votes.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **poll_votes_owner_select** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_votes.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`
- **poll_votes_select_owner** `SELECT` roles={authenticated}
  - using: `(EXISTS ( SELECT 1 FROM games g WHERE ((g.id = poll_votes.game_id) AND (g.owner_id = auth.uid()))))`
  - with_check: `—`

## RPC (public) — related to polls/subscriptions

- `get_poll_bundle(p_key text)` → `jsonb`
- `get_poll_game(p_game_id uuid, p_key text)` → `jsonb`
- `poll_admin_can_close(p_game_id uuid)` → `jsonb`
- `poll_admin_preview(p_game_id uuid)` → `jsonb`
- `poll_claim_email_records()` → `void`
- `poll_close_and_normalize(p_game_id uuid, p_key text)` → `void`
- `poll_get_payload(p_game_id uuid, p_key text)` → `jsonb`
- `poll_go_resolve(p_token uuid)` → `record`
- `poll_go_sub_decline(p_token uuid)` → `bool`
- `poll_go_subscribe_email(p_token uuid, p_email text)` → `bool`
- `poll_go_task_action(p_token uuid, p_action text, p_email text)` → `bool`
- `poll_my_email()` → `text`
- `poll_open(p_game_id uuid, p_key text)` → `void`
- `poll_points_close_and_normalize(p_game_id uuid, p_key text)` → `void`
- `poll_points_vote(p_game_id uuid, p_key text, p_question_id uuid, p_answer_id uuid, p_voter_token text)` → `void`
- `poll_points_vote_batch(p_game_id uuid, p_key text, p_voter_token text, p_items jsonb)` → `void`
- `poll_points_vote_batch_owner(p_game_id uuid, p_items jsonb, p_voter_token text)` → `bool`
- `poll_results(p_key text)` → `jsonb`
- `poll_task_decline(p_token uuid)` → `text`
- `poll_task_done(p_token uuid)` → `text`
- `poll_task_opened(p_token uuid)` → `text`
- `poll_text_close_apply(p_game_id uuid, p_key text, p_payload jsonb)` → `void`
- `poll_text_submit(p_game_id uuid, p_key text, p_question_id uuid, p_voter_token text, p_answer_text text)` → `void`
- `poll_text_submit(p_game_id uuid, p_key text, p_question_id uuid, p_voter_token text, p_answer_raw text, p_answer_norm text)` → `void`
- `poll_text_submit_batch(p_game_id uuid, p_key text, p_voter_token text, p_items jsonb)` → `void`
- `poll_text_submit_batch_owner(p_game_id uuid, p_items jsonb, p_voter_token text)` → `bool`
- `poll_vote(p_key text, p_question_ord integer, p_answer_ord integer, p_voter_token text)` → `jsonb`
- `poll_vote(p_game_id uuid, p_key text, p_question_id uuid, p_answer_id uuid, p_voter_token text)` → `void`
- `poll_vote_game(p_game_id uuid, p_key text, p_question_id uuid, p_answer_id uuid, p_voter_token text)` → `void`
- `poll_vote_points(p_game_id uuid, p_key text, p_question_id uuid, p_answer_id uuid, p_voter_token text)` → `void`
- `polls_hub_list_my_subscribers()` → `record`
- `polls_hub_list_my_subscriptions()` → `record`
- `polls_hub_list_open_polls()` → `record`
- `polls_hub_list_polls()` → `record`
- `polls_hub_list_tasks()` → `record`
- `polls_hub_overview()` → `json`
- `polls_hub_share_poll(p_game_id uuid, p_recipients text[], p_allow_duplicates boolean)` → `record`
- `polls_hub_subscriber_remove(p_sub_id uuid)` → `bool`
- `polls_hub_subscription_cancel(p_sub_id uuid)` → `bool`
- `polls_hub_task_decline(p_task_id uuid)` → `bool`
- `profile_login_to_email(p_login text)` → `text`
- `profiles_username_immutable()` → `trigger`
- `sub_invite_accept(p_token uuid)` → `text`
- `sub_invite_reject(p_token uuid)` → `text`
- `subscribe_by_email(p_owner_username text, p_email text)` → `text`

## Notes / TODO
- Doeksportować pełne kolumny `public.*` (query `information_schema.columns`) — obecny plik ma kolumny tylko dla `auth`.
- Po weryfikacji statusów (pending/opened/done/…) dopisać w tym pliku sekcję **Status Canon** i zmapować ewentualne legacy.
- Po dopięciu maili: dodać sekcję Edge Function (nazwa, env, rate limits).
