# Familiada — Supabase schema snapshot (polls/subscriptions/tasks)

**Canonical single-file snapshot for repo.**  
Last verified: **2026-02-03** (Europe/Warsaw)

> Source: exported `information_schema.columns`, FK list, `pg_indexes`, and `pg_policies` that you pasted in chat.

---

## Scope (tables covered)

Core to polls/subscriptions/tasks (and the minimal dependencies they reference):

- `public.profiles`
- `public.games`
- `public.poll_sessions`
- `public.poll_votes`
- `public.poll_text_entries`
- `public.poll_tasks`
- `public.poll_subscriptions`
- `public.answers` (needed for `poll_votes.answer_id` and fixed points)
- (Referenced but not expanded here): `public.questions`

---

## TABLE: public.profiles

### Columns
- `id uuid NOT NULL` — **PK**, matches `auth.uid()`
- `email text NOT NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `username text NOT NULL`

### Indexes / uniques
- `profiles_pkey` — UNIQUE (id)
- `profiles_email_key` — UNIQUE (email)
- **Potential duplicates (see “Cleanup candidates”)**
  - `profiles_username_uq` — UNIQUE (username)
  - `profiles_username_ci_uq` — UNIQUE (lower(username))
  - `profiles_username_unique` — UNIQUE (lower(username)) WHERE username not null/empty

### RLS policies
- `profiles_insert_own` — INSERT, roles `{public}`, check: `(auth.uid() = id)`
- `profiles_select_own` — SELECT, roles `{public}`, using: `(auth.uid() = id)`
- `profiles_self_read` — SELECT, roles `{public}`, using: `(id = auth.uid())`

---

## TABLE: public.games

### Columns
- `id uuid NOT NULL DEFAULT gen_random_uuid()` — **PK**
- `owner_id uuid NOT NULL`
- `name text NOT NULL DEFAULT 'Nowa Familiada'`
- `type game_type NOT NULL DEFAULT 'prepared'`
- `status game_status NOT NULL DEFAULT 'draft'`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- `poll_opened_at timestamptz NULL`
- `poll_closed_at timestamptz NULL`
- `share_key_poll text NOT NULL DEFAULT gen_share_key(18)`
- `share_key_control text NOT NULL DEFAULT gen_share_key(24)`
- `share_key_display text NOT NULL DEFAULT gen_share_key(18)`
- `share_key_host text NOT NULL DEFAULT gen_share_key(18)`
- `share_key_buzzer text NOT NULL DEFAULT gen_share_key(18)`

### Indexes / uniques
- `games_pkey` — UNIQUE (id)
- `games_owner_idx` — (owner_id)
- `games_keys_poll_idx` — (share_key_poll)
- `games_keys_control_idx` — (share_key_control)
- `games_keys_display_idx` — (share_key_display)
- `games_keys_host_idx` — (share_key_host)
- `games_share_keys_unique` — UNIQUE (share_key_poll, share_key_control, share_key_display, share_key_host, share_key_buzzer)
- **Potential duplicate**
  - `games_created_at_idx` — (created_at DESC)
  - `games_created_idx` — (created_at DESC)

### RLS policies
- `games_owner_insert` — INSERT `{public}`, check: `(owner_id = auth.uid())`
- `games_owner_select` — SELECT `{authenticated}`, using: `(owner_id = auth.uid())`
- `games_owner_update` — UPDATE `{authenticated}`, using/check: `(owner_id = auth.uid())`
- `games_owner_delete` — DELETE `{public}`, using: `(owner_id = auth.uid())`
- `games_select_by_keys` — SELECT `{public}`, using:
  - allows select if any share_key_* equals JWT claim `share_key` from `request.jwt.claims`

---

## TABLE: public.poll_sessions

### Columns
- `id uuid NOT NULL DEFAULT gen_random_uuid()` — **PK**
- `game_id uuid NOT NULL`
- `question_ord int NOT NULL`
- `is_open boolean NOT NULL DEFAULT true`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `closed_at timestamptz NULL`
- `question_id uuid NOT NULL`

### Foreign keys
- `poll_sessions_game_id_fkey`: `game_id` → `games.id`
- `poll_sessions_question_id_fkey`: `question_id` → `questions.id`

### Indexes
- `poll_sessions_pkey` — UNIQUE (id)
- `poll_sessions_game_idx` — (game_id)
- `poll_sessions_game_open_idx` — (game_id, is_open, created_at DESC)

### RLS policies (duplicates exist)
- `poll_sessions_owner_read` — SELECT `{authenticated}` owner of game
- `poll_sessions_owner_select` — SELECT `{authenticated}` owner of game
- `poll_sessions_select_owner` — SELECT `{authenticated}` owner of game
- `poll_sessions_owner_write` — ALL `{authenticated}` owner of game (using/check)
- `ps_owner_all` — ALL `{public}` owner of game (using/check)

> Note: multiple policies overlap heavily; consider reducing to one SELECT + one ALL for owner.

---

## TABLE: public.poll_votes

### Columns
- `id uuid NOT NULL DEFAULT gen_random_uuid()` — **PK**
- `game_id uuid NOT NULL`
- `question_ord int NOT NULL`
- `answer_ord int NOT NULL`
- `voter_token text NOT NULL`
- `poll_session_id uuid NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `question_id uuid NULL`
- `answer_id uuid NULL`

### Foreign keys
- `poll_votes_game_id_fkey`: `game_id` → `games.id`
- `poll_votes_poll_session_id_fkey`: `poll_session_id` → `poll_sessions.id`
- `poll_votes_question_id_fkey`: `question_id` → `questions.id`
- `poll_votes_answer_id_fkey`: `answer_id` → `answers.id`

### Indexes / uniques
- `poll_votes_pkey` — UNIQUE (id)
- `poll_votes_game_idx` — (game_id)
- `poll_votes_game_q_idx` — (game_id, question_ord)
- `poll_votes_by_answer` — (answer_id)
- `poll_votes_by_session` — (poll_session_id)
- `poll_votes_session_idx` — (poll_session_id) **(duplicate of poll_votes_by_session)**
- `poll_votes_unique_per_q` — UNIQUE (poll_session_id, question_id, voter_token)

### RLS policies
- `poll_votes_insert_owner_open` — INSERT `{authenticated}`, check:
  - user is game owner AND session is open
- `poll_votes_owner_read` / `poll_votes_owner_select` / `poll_votes_select_owner` — SELECT for owner (duplicates)
- `poll_votes_owner_delete` — DELETE for owner

---

## TABLE: public.poll_text_entries

### Columns
- `id uuid NOT NULL DEFAULT gen_random_uuid()` — **PK**
- `game_id uuid NOT NULL`
- `poll_session_id uuid NOT NULL`
- `question_id uuid NOT NULL`
- `voter_token text NOT NULL`
- `answer_raw text NOT NULL`
- `answer_norm text NOT NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`

### Foreign keys
- `poll_text_entries_game_id_fkey`: `game_id` → `games.id`
- `poll_text_entries_poll_session_id_fkey`: `poll_session_id` → `poll_sessions.id`
- `poll_text_entries_question_id_fkey`: `question_id` → `questions.id`

### Indexes / uniques
- `poll_text_entries_pkey` — UNIQUE (id)
- `pte_by_session` — (poll_session_id)
- `pte_by_question` — (question_id)
- `pte_unique_per_q` — UNIQUE (poll_session_id, question_id, voter_token)

### RLS policies (duplicates exist)
- `poll_text_entries_insert_owner_open` — INSERT `{authenticated}`, check:
  - user is game owner AND session open
- multiple owner SELECT policies (`poll_text_entries_owner_read`, `poll_text_entries_owner_select`, `poll_text_entries_select_owner`, `poll_text_owner_select`)
- `pte_owner_delete` — DELETE owner
- `pte_owner_read` — SELECT owner

---

## TABLE: public.poll_tasks

### Columns
- `id uuid NOT NULL DEFAULT gen_random_uuid()` — **PK**
- `owner_id uuid NOT NULL`
- `recipient_user_id uuid NULL`
- `recipient_email text NULL`
- `game_id uuid NOT NULL`
- `poll_type text NOT NULL`
- `share_key_poll text NOT NULL`
- `token uuid NOT NULL DEFAULT gen_random_uuid()`
- `status text NOT NULL DEFAULT 'pending'`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `opened_at timestamptz NULL`
- `done_at timestamptz NULL`
- `declined_at timestamptz NULL`
- `cancelled_at timestamptz NULL`

### Foreign keys
- `poll_tasks_owner_id_fkey`: `owner_id` → `profiles.id`
- `poll_tasks_recipient_user_id_fkey`: `recipient_user_id` → `profiles.id`

- `poll_tasks_game_id_fkey`: `game_id` → `games.id` (ON DELETE CASCADE)

### Indexes / uniques
- `poll_tasks_pkey` — UNIQUE (id)
- `poll_tasks_owner_idx` — (owner_id)
- `poll_tasks_game_idx` — (game_id)
- `poll_tasks_recipient_user_idx` — (recipient_user_id)
- `poll_tasks_recipient_email_idx` — (lower(recipient_email))
- `poll_tasks_token_key` — UNIQUE (token) *(constraint-backed)*

### RLS policies
- INSERT: `poll_tasks_insert_owner` — `{public}`, check `(owner_id = auth.uid())`
- SELECT: several overlapping policies:
  - `poll_tasks_select_owner`
  - `poll_tasks_select_recipient`
  - `poll_tasks_select_owner_or_recipient`
- UPDATE: `poll_tasks_update_owner` — owner only
- DELETE: `poll_tasks_delete_owner` — owner only

---

## TABLE: public.poll_subscriptions

### Columns
- `id uuid NOT NULL DEFAULT gen_random_uuid()` — **PK**
- `owner_id uuid NOT NULL`
- `subscriber_user_id uuid NULL`
- `subscriber_email text NULL`
- `token uuid NOT NULL DEFAULT gen_random_uuid()`
- `status text NOT NULL DEFAULT 'pending'`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `opened_at timestamptz NULL`
- `accepted_at timestamptz NULL`
- `declined_at timestamptz NULL`
- `cancelled_at timestamptz NULL`

### Foreign keys
- `poll_subscriptions_owner_id_fkey`: `owner_id` → `profiles.id` (ON DELETE CASCADE)
- `poll_subscriptions_subscriber_user_id_fkey`: `subscriber_user_id` → `profiles.id` (ON DELETE SET NULL)

### Indexes / uniques
- `poll_subscriptions_pkey` — UNIQUE (id)
- `poll_subscriptions_owner_idx` — (owner_id)
- `poll_subscriptions_sub_user_idx` — (subscriber_user_id)
- `poll_subscriptions_sub_email_idx` — (subscriber_email)
- `poll_subscriptions_token_uq` — UNIQUE (token)

### RLS policies
- `poll_subs_select_owner_or_subscriber` — SELECT `{public}`, using:
  - `(auth.uid() = owner_id) OR (auth.uid() = subscriber_user_id)`

> Note: you currently do **not** have INSERT/UPDATE/DELETE policies listed here; likely actions are via SECURITY DEFINER RPC.

---

## TABLE: public.answers

### Columns
- `id uuid NOT NULL DEFAULT gen_random_uuid()` — **PK**
- `question_id uuid NOT NULL`
- `ord int NOT NULL`
- `text text NOT NULL`
- `fixed_points int NOT NULL DEFAULT 0`
- `created_at timestamptz NOT NULL DEFAULT now()`

### Foreign keys
- `answers_question_id_fkey`: `question_id` → `questions.id`

### Indexes / uniques
- `answers_pkey` — UNIQUE (id)
- `answers_q_idx` — (question_id)
- `answers_q_ord_uniq` — UNIQUE (question_id, ord)

### RLS policies (duplicates exist)
- `answers_owner_select` — SELECT `{authenticated}`, owner of game via questions→games
- `answers_owner_write` — ALL `{authenticated}`, owner of game
- `answers_owner_all` — ALL `{public}`, owner of game (overlaps)

---

## Cleanup candidates (recommended DB hygiene)

These are **non-breaking** cleanups (drop duplicates), but do them only after verifying nothing references the index names explicitly:

### Duplicate UNIQUE indexes
- `answers_q_ord_uniq` vs `answers_q_ord_uq` → **resolved** (kept constraint-backed `answers_q_ord_uniq`)
- `poll_tasks_token_key` vs `poll_tasks_token_uq` → keep **constraint-backed** `poll_tasks_token_key` (drop `poll_tasks_token_uq` if present)

### Duplicate non-unique indexes
- `games_created_at_idx` vs `games_created_idx` → keep one
- `poll_votes_by_session` vs `poll_votes_session_idx` → keep one

### Multiple username uniques in profiles
You likely want **one** canonical rule:
- keep **case-insensitive** unique: `UNIQUE (lower(username))` with condition `username <> ''`
- drop exact-case unique if you don't want `Andrzej` and `andrzej` both possible.

---

## Canonical status enums (to enforce later)

Currently `status` columns are plain `text` with defaults.
Recommend standardizing to these sets (then add CHECK constraints later):

### poll_tasks.status
- `pending | opened | done | declined | cancelled`

### poll_subscriptions.status
- `pending | accepted | declined | cancelled`

> (You already track timestamps: `opened_at/accepted_at/declined_at/cancelled_at` — good.)

---

## Open questions / missing items to verify

1) **FKs missing from export**:
   - `poll_tasks.game_id` → `games.id` (expected)
   - `poll_subscriptions.owner_id` → `profiles.id` (expected)
   - `poll_subscriptions.subscriber_user_id` → `profiles.id` (expected)

2) **Public voting vs owner-only inserts**:
   - `poll_votes` and `poll_text_entries` inserts currently require *game owner*.
   - If anonymous/public voters should insert, RLS must be adapted or handled via SECURITY DEFINER RPC.

3) **share_key_poll duplication**
   - `poll_tasks.share_key_poll` duplicates `games.share_key_poll`. Decide if snapshot-on-send is intended.

---
