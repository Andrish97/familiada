CREATE TABLE public.answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  ord integer NOT NULL,
  text text NOT NULL,
  fixed_points integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.device_presence (
  game_id uuid NOT NULL,
  device_type device_type NOT NULL,
  device_id text NOT NULL,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.device_state (
  game_id uuid NOT NULL,
  device_type device_type NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Nowa Familiada'::text,
  type game_type NOT NULL DEFAULT 'prepared'::game_type,
  status game_status NOT NULL DEFAULT 'draft'::game_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  poll_opened_at timestamp with time zone,
  poll_closed_at timestamp with time zone,
  share_key_poll text NOT NULL DEFAULT gen_share_key(18),
  share_key_control text NOT NULL DEFAULT gen_share_key(24),
  share_key_display text NOT NULL DEFAULT gen_share_key(18),
  share_key_host text NOT NULL DEFAULT gen_share_key(18),
  share_key_buzzer text NOT NULL DEFAULT gen_share_key(18),
  poll_share_updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.poll_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  question_ord integer NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  question_id uuid NOT NULL
);

CREATE TABLE public.poll_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  subscriber_user_id uuid,
  subscriber_email text,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  opened_at timestamp with time zone,
  accepted_at timestamp with time zone,
  declined_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  email_sent_at timestamp with time zone,
  email_send_count integer NOT NULL DEFAULT 0
);
CREATE TABLE public.poll_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  recipient_user_id uuid,
  recipient_email text,
  game_id uuid NOT NULL,
  poll_type text NOT NULL,
  share_key_poll text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  opened_at timestamp with time zone,
  done_at timestamp with time zone,
  declined_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  email_sent_at timestamp with time zone,
  email_send_count integer NOT NULL DEFAULT 0
);
CREATE TABLE public.poll_text_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  poll_session_id uuid NOT NULL,
  question_id uuid NOT NULL,
  voter_token text NOT NULL,
  answer_raw text NOT NULL,
  answer_norm text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  voter_user_id uuid
);

CREATE TABLE public.poll_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  question_ord integer NOT NULL,
  answer_ord integer NOT NULL,
  voter_token text NOT NULL,
  poll_session_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  question_id uuid,
  answer_id uuid,
  voter_user_id uuid
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  username text NOT NULL
);

CREATE TABLE public.qb_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  base_id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  ord integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone
);
CREATE TABLE public.qb_category_tags (
  category_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.qb_question_tags (
  question_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.qb_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  base_id uuid NOT NULL,
  category_id uuid,
  ord integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE TABLE public.qb_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  base_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'gray'::text,
  ord integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.question_base_shares (
  base_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role base_share_role NOT NULL DEFAULT 'viewer'::base_share_role,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.question_bases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Nowa baza pytań'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  ord integer NOT NULL,
  text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.user_flags (
  user_id uuid NOT NULL,
  demo boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.user_logos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT ''::text,
  type text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.answers ADD CONSTRAINT answers_ord_range CHECK (((ord >= 1) AND (ord <= 6)));
ALTER TABLE public.answers ADD CONSTRAINT answers_pkey PRIMARY KEY (id);

ALTER TABLE public.answers ADD CONSTRAINT answers_pts_non_negative CHECK ((fixed_points >= 0));
ALTER TABLE public.answers ADD CONSTRAINT answers_q_ord_uniq UNIQUE (question_id, ord);

ALTER TABLE public.answers ADD CONSTRAINT answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;

ALTER TABLE public.answers ADD CONSTRAINT answers_text_len CHECK (((char_length(text) >= 1) AND (char_length(text) <= 17)));
ALTER TABLE public.device_presence ADD CONSTRAINT device_presence_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public.device_presence ADD CONSTRAINT device_presence_pkey PRIMARY KEY (game_id, device_type, device_id);

ALTER TABLE public.device_state ADD CONSTRAINT device_state_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public.device_state ADD CONSTRAINT device_state_pkey PRIMARY KEY (game_id, device_type);

ALTER TABLE public.games ADD CONSTRAINT games_name_len CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)));
ALTER TABLE public.games ADD CONSTRAINT games_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.games ADD CONSTRAINT games_pkey PRIMARY KEY (id);

ALTER TABLE public.games ADD CONSTRAINT games_poll_status_ok CHECK ((((type = 'prepared'::game_type) AND (status = ANY (ARRAY['draft'::game_status, 'ready'::game_status]))) OR ((type <> 'prepared'::game_type) AND (status = ANY (ARRAY['draft'::game_status, 'poll_open'::game_status, 'ready'::game_status])))));

ALTER TABLE public.games ADD CONSTRAINT games_share_keys_unique UNIQUE (share_key_poll, share_key_control, share_key_display, share_key_host, share_key_buzzer);

ALTER TABLE public.games ADD CONSTRAINT games_status_check CHECK ((status = ANY (ARRAY['draft'::game_status, 'poll_open'::game_status, 'ready'::game_status])));

ALTER TABLE public.games ADD CONSTRAINT games_type_check CHECK ((type = ANY (ARRAY['poll_text'::game_type, 'poll_points'::game_type, 'prepared'::game_type])));

ALTER TABLE public.poll_sessions ADD CONSTRAINT poll_sessions_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public.poll_sessions ADD CONSTRAINT poll_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.poll_sessions ADD CONSTRAINT poll_sessions_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;

ALTER TABLE public.poll_subscriptions ADD CONSTRAINT poll_subscriptions_one_subscriber_chk CHECK ((((subscriber_user_id IS NOT NULL) AND (subscriber_email IS NULL)) OR ((subscriber_user_id IS NULL) AND (subscriber_email IS NOT NULL))));

ALTER TABLE public.poll_subscriptions ADD CONSTRAINT poll_subscriptions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.poll_subscriptions ADD CONSTRAINT poll_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE public.poll_subscriptions ADD CONSTRAINT poll_subscriptions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'declined'::text, 'cancelled'::text])));

ALTER TABLE public.poll_subscriptions ADD CONSTRAINT poll_subscriptions_subscriber_user_id_fkey FOREIGN KEY (subscriber_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_one_recipient_chk CHECK ((((recipient_user_id IS NOT NULL) AND (recipient_email IS NULL)) OR ((recipient_user_id IS NULL) AND (recipient_email IS NOT NULL))));

ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_pkey PRIMARY KEY (id);

ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_poll_type_check CHECK ((poll_type = ANY (ARRAY['poll_text'::text, 'poll_points'::text])));

ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'opened'::text, 'done'::text, 'declined'::text, 'cancelled'::text])));

ALTER TABLE public.poll_tasks ADD CONSTRAINT poll_tasks_token_key UNIQUE (token);

ALTER TABLE public.poll_text_entries ADD CONSTRAINT poll_text_entries_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public.poll_text_entries ADD CONSTRAINT poll_text_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.poll_text_entries ADD CONSTRAINT poll_text_entries_poll_session_id_fkey FOREIGN KEY (poll_session_id) REFERENCES poll_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.poll_text_entries ADD CONSTRAINT poll_text_entries_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;

ALTER TABLE public.poll_text_entries ADD CONSTRAINT poll_text_entries_voter_user_id_fkey FOREIGN KEY (voter_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_answer_id_fkey FOREIGN KEY (answer_id) REFERENCES answers(id) ON DELETE CASCADE;

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_pkey PRIMARY KEY (id);

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_poll_session_id_fkey FOREIGN KEY (poll_session_id) REFERENCES poll_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_question_id_fkey FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;

ALTER TABLE public.poll_votes ADD CONSTRAINT poll_votes_voter_user_id_fkey FOREIGN KEY (voter_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.poll_votes ADD CONSTRAINT pv_token_len CHECK (((char_length(voter_token) >= 8) AND (char_length(voter_token) <= 120)));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.qb_categories ADD CONSTRAINT qb_categories_base_id_fkey FOREIGN KEY (base_id) REFERENCES question_bases(id) ON DELETE CASCADE;

ALTER TABLE public.qb_categories ADD CONSTRAINT qb_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES qb_categories(id) ON DELETE CASCADE;

ALTER TABLE public.qb_categories ADD CONSTRAINT qb_categories_pkey PRIMARY KEY (id);

ALTER TABLE public.qb_category_tags ADD CONSTRAINT qb_category_tags_category_fk FOREIGN KEY (category_id) REFERENCES qb_categories(id) ON DELETE CASCADE;

ALTER TABLE public.qb_category_tags ADD CONSTRAINT qb_category_tags_pk PRIMARY KEY (category_id, tag_id);

ALTER TABLE public.qb_category_tags ADD CONSTRAINT qb_category_tags_tag_fk FOREIGN KEY (tag_id) REFERENCES qb_tags(id) ON DELETE CASCADE;

ALTER TABLE public.qb_question_tags ADD CONSTRAINT qb_question_tags_pkey PRIMARY KEY (question_id, tag_id);

ALTER TABLE public.qb_question_tags ADD CONSTRAINT qb_question_tags_question_id_fkey FOREIGN KEY (question_id) REFERENCES qb_questions(id) ON DELETE CASCADE;

ALTER TABLE public.qb_question_tags ADD CONSTRAINT qb_question_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES qb_tags(id) ON DELETE CASCADE;

ALTER TABLE public.qb_questions ADD CONSTRAINT qb_questions_base_id_fkey FOREIGN KEY (base_id) REFERENCES question_bases(id) ON DELETE CASCADE;

ALTER TABLE public.qb_questions ADD CONSTRAINT qb_questions_category_id_fkey FOREIGN KEY (category_id) REFERENCES qb_categories(id) ON DELETE SET NULL;

ALTER TABLE public.qb_questions ADD CONSTRAINT qb_questions_pkey PRIMARY KEY (id);

ALTER TABLE public.qb_questions ADD CONSTRAINT qb_questions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.qb_tags ADD CONSTRAINT qb_tags_base_id_fkey FOREIGN KEY (base_id) REFERENCES question_bases(id) ON DELETE CASCADE;

ALTER TABLE public.qb_tags ADD CONSTRAINT qb_tags_base_id_name_key UNIQUE (base_id, name);

ALTER TABLE public.qb_tags ADD CONSTRAINT qb_tags_pkey PRIMARY KEY (id);

ALTER TABLE public.question_base_shares ADD CONSTRAINT question_base_shares_base_id_fkey FOREIGN KEY (base_id) REFERENCES question_bases(id) ON DELETE CASCADE;

ALTER TABLE public.question_base_shares ADD CONSTRAINT question_base_shares_pkey PRIMARY KEY (base_id, user_id);

ALTER TABLE public.question_base_shares ADD CONSTRAINT question_base_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.question_bases ADD CONSTRAINT question_bases_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.question_bases ADD CONSTRAINT question_bases_pkey PRIMARY KEY (id);

ALTER TABLE public.questions ADD CONSTRAINT questions_game_id_fkey FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE public.questions ADD CONSTRAINT questions_game_ord_uniq UNIQUE (game_id, ord);

ALTER TABLE public.questions ADD CONSTRAINT questions_game_ord_unique UNIQUE (game_id, ord);

ALTER TABLE public.questions ADD CONSTRAINT questions_ord_positive CHECK ((ord >= 1));
ALTER TABLE public.questions ADD CONSTRAINT questions_pkey PRIMARY KEY (id);

ALTER TABLE public.questions ADD CONSTRAINT questions_text_len CHECK (((char_length(text) >= 1) AND (char_length(text) <= 200)));
ALTER TABLE public.user_flags ADD CONSTRAINT user_flags_pkey PRIMARY KEY (user_id);

ALTER TABLE public.user_flags ADD CONSTRAINT user_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.user_logos ADD CONSTRAINT user_logos_pkey PRIMARY KEY (id);

ALTER TABLE public.user_logos ADD CONSTRAINT user_logos_type_check CHECK ((type = ANY (ARRAY['GLYPH_30x10'::text, 'PIX_150x70'::text])));
ALTER TABLE public.user_logos ADD CONSTRAINT user_logos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX answers_q_idx ON public.answers USING btree (question_id);

CREATE UNIQUE INDEX answers_pkey ON public.answers USING btree (id);

CREATE UNIQUE INDEX answers_q_ord_uniq ON public.answers USING btree (question_id, ord);

CREATE UNIQUE INDEX device_presence_pkey ON public.device_presence USING btree (game_id, device_type, device_id);

CREATE UNIQUE INDEX device_state_pkey ON public.device_state USING btree (game_id, device_type);

CREATE INDEX games_created_at_idx ON public.games USING btree (created_at DESC);

CREATE INDEX games_keys_control_idx ON public.games USING btree (share_key_control);

CREATE INDEX games_keys_display_idx ON public.games USING btree (share_key_display);

CREATE INDEX games_keys_host_idx ON public.games USING btree (share_key_host);

CREATE INDEX games_keys_poll_idx ON public.games USING btree (share_key_poll);

CREATE INDEX games_owner_idx ON public.games USING btree (owner_id);

CREATE UNIQUE INDEX games_pkey ON public.games USING btree (id);

CREATE UNIQUE INDEX games_share_keys_unique ON public.games USING btree (share_key_poll, share_key_control, share_key_display, share_key_host, share_key_buzzer);

CREATE INDEX poll_sessions_game_idx ON public.poll_sessions USING btree (game_id);

CREATE INDEX poll_sessions_game_open_idx ON public.poll_sessions USING btree (game_id, is_open, created_at DESC);

CREATE UNIQUE INDEX poll_sessions_pkey ON public.poll_sessions USING btree (id);

CREATE INDEX poll_subscriptions_owner_idx ON public.poll_subscriptions USING btree (owner_id);

CREATE INDEX poll_subscriptions_sub_email_idx ON public.poll_subscriptions USING btree (subscriber_email);

CREATE INDEX poll_subscriptions_sub_user_idx ON public.poll_subscriptions USING btree (subscriber_user_id);

CREATE UNIQUE INDEX poll_subscriptions_pkey ON public.poll_subscriptions USING btree (id);

CREATE UNIQUE INDEX poll_subscriptions_token_uq ON public.poll_subscriptions USING btree (token);

CREATE INDEX poll_tasks_game_idx ON public.poll_tasks USING btree (game_id);

CREATE INDEX poll_tasks_owner_idx ON public.poll_tasks USING btree (owner_id);

CREATE INDEX poll_tasks_recipient_email_idx ON public.poll_tasks USING btree (lower(recipient_email));

CREATE INDEX poll_tasks_recipient_user_idx ON public.poll_tasks USING btree (recipient_user_id);

CREATE UNIQUE INDEX poll_tasks_pkey ON public.poll_tasks USING btree (id);

CREATE UNIQUE INDEX poll_tasks_token_key ON public.poll_tasks USING btree (token);

CREATE INDEX poll_text_entries_voter_user_idx ON public.poll_text_entries USING btree (voter_user_id);

CREATE INDEX pte_by_question ON public.poll_text_entries USING btree (question_id);

CREATE INDEX pte_by_session ON public.poll_text_entries USING btree (poll_session_id);

CREATE UNIQUE INDEX poll_text_entries_pkey ON public.poll_text_entries USING btree (id);

CREATE UNIQUE INDEX pte_unique_per_q ON public.poll_text_entries USING btree (poll_session_id, question_id, voter_token);

CREATE INDEX poll_votes_by_answer ON public.poll_votes USING btree (answer_id);

CREATE INDEX poll_votes_by_session ON public.poll_votes USING btree (poll_session_id);

CREATE INDEX poll_votes_game_idx ON public.poll_votes USING btree (game_id);

CREATE INDEX poll_votes_game_q_idx ON public.poll_votes USING btree (game_id, question_ord);

CREATE INDEX poll_votes_session_idx ON public.poll_votes USING btree (poll_session_id);

CREATE INDEX poll_votes_voter_user_idx ON public.poll_votes USING btree (voter_user_id);

CREATE UNIQUE INDEX poll_votes_pkey ON public.poll_votes USING btree (id);

CREATE UNIQUE INDEX poll_votes_unique_per_q ON public.poll_votes USING btree (poll_session_id, question_id, voter_token);

CREATE UNIQUE INDEX profiles_email_key ON public.profiles USING btree (email);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX profiles_username_ci_uq ON public.profiles USING btree (lower(username));

CREATE UNIQUE INDEX profiles_username_unique ON public.profiles USING btree (lower(username)) WHERE ((username IS NOT NULL) AND (username <> ''::text));

CREATE UNIQUE INDEX profiles_username_uq ON public.profiles USING btree (username);

CREATE INDEX qb_categories_base_id_idx ON public.qb_categories USING btree (base_id);

CREATE INDEX qb_categories_parent_id_idx ON public.qb_categories USING btree (parent_id);

CREATE UNIQUE INDEX qb_categories_pkey ON public.qb_categories USING btree (id);

CREATE INDEX qb_category_tags_category_id_idx ON public.qb_category_tags USING btree (category_id);

CREATE INDEX qb_category_tags_tag_id_idx ON public.qb_category_tags USING btree (tag_id);

CREATE UNIQUE INDEX qb_category_tags_pk ON public.qb_category_tags USING btree (category_id, tag_id);

CREATE INDEX qb_question_tags_question_id_idx ON public.qb_question_tags USING btree (question_id);

CREATE INDEX qb_question_tags_tag_id_idx ON public.qb_question_tags USING btree (tag_id);

CREATE UNIQUE INDEX qb_question_tags_pkey ON public.qb_question_tags USING btree (question_id, tag_id);

CREATE INDEX qb_questions_base_id_idx ON public.qb_questions USING btree (base_id);

CREATE INDEX qb_questions_category_id_idx ON public.qb_questions USING btree (category_id);

CREATE INDEX qb_questions_payload_text_idx ON public.qb_questions USING btree (lower((payload ->> 'text'::text)));

CREATE UNIQUE INDEX qb_questions_pkey ON public.qb_questions USING btree (id);

CREATE INDEX qb_tags_base_id_idx ON public.qb_tags USING btree (base_id);

CREATE UNIQUE INDEX qb_tags_base_id_name_key ON public.qb_tags USING btree (base_id, name);

CREATE UNIQUE INDEX qb_tags_pkey ON public.qb_tags USING btree (id);

CREATE INDEX question_base_shares_user_id_idx ON public.question_base_shares USING btree (user_id);

CREATE UNIQUE INDEX question_base_shares_pkey ON public.question_base_shares USING btree (base_id, user_id);

CREATE INDEX question_bases_owner_id_idx ON public.question_bases USING btree (owner_id);

CREATE UNIQUE INDEX question_bases_pkey ON public.question_bases USING btree (id);

CREATE INDEX questions_game_idx ON public.questions USING btree (game_id);

CREATE INDEX questions_game_ord_idx ON public.questions USING btree (game_id, ord);

CREATE UNIQUE INDEX questions_game_ord_uniq ON public.questions USING btree (game_id, ord);

CREATE UNIQUE INDEX questions_game_ord_unique ON public.questions USING btree (game_id, ord);

CREATE UNIQUE INDEX questions_game_ord_uq ON public.questions USING btree (game_id, ord);

CREATE UNIQUE INDEX questions_pkey ON public.questions USING btree (id);

CREATE UNIQUE INDEX user_flags_pkey ON public.user_flags USING btree (user_id);

CREATE INDEX user_logos_user_id_idx ON public.user_logos USING btree (user_id);

CREATE UNIQUE INDEX user_logos_one_active_per_user ON public.user_logos USING btree (user_id) WHERE (is_active = true);

CREATE UNIQUE INDEX user_logos_pkey ON public.user_logos USING btree (id);

CREATE UNIQUE INDEX user_logos_user_name_uniq ON public.user_logos USING btree (user_id, name);

ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.device_presence ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.device_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.poll_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.poll_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.poll_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.poll_text_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.qb_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.qb_category_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.qb_question_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.qb_questions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.qb_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.question_base_shares ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.question_bases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_flags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_logos ENABLE ROW LEVEL SECURITY;

CREATE POLICY answers_owner_select ON public.answers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (questions q
     JOIN games g ON ((g.id = q.game_id)))
  WHERE ((q.id = answers.question_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY answers_owner_write ON public.answers TO authenticated USING ((EXISTS ( SELECT 1
   FROM (questions q
     JOIN games g ON ((g.id = q.game_id)))
  WHERE ((q.id = answers.question_id) AND (g.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (questions q
     JOIN games g ON ((g.id = q.game_id)))
  WHERE ((q.id = answers.question_id) AND (g.owner_id = auth.uid())))));
null
CREATE POLICY device_presence_owner_read ON public.device_presence FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = device_presence.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY device_state_owner_read ON public.device_state FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = device_state.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY games_owner_select ON public.games FOR SELECT TO authenticated USING ((owner_id = auth.uid()));

CREATE POLICY games_owner_update ON public.games FOR UPDATE TO authenticated USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));

null
null
null
CREATE POLICY poll_sessions_owner_read ON public.poll_sessions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY poll_sessions_owner_select ON public.poll_sessions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY poll_sessions_owner_write ON public.poll_sessions TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY poll_sessions_select_owner ON public.poll_sessions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_sessions.game_id) AND (g.owner_id = auth.uid())))));
null
null
null
null
null
null
null
null
CREATE POLICY poll_text_entries_insert_owner_open ON public.poll_text_entries FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM poll_sessions s
  WHERE ((s.id = poll_text_entries.poll_session_id) AND (s.game_id = poll_text_entries.game_id) AND (s.is_open = true))))));
CREATE POLICY poll_text_entries_owner_read ON public.poll_text_entries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY poll_text_entries_owner_select ON public.poll_text_entries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY poll_text_entries_select_owner ON public.poll_text_entries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY poll_text_owner_select ON public.poll_text_entries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_text_entries.game_id) AND (g.owner_id = auth.uid())))));
null
null
CREATE POLICY poll_votes_insert_owner_open ON public.poll_votes FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_votes.game_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM poll_sessions s
  WHERE ((s.id = poll_votes.poll_session_id) AND (s.game_id = poll_votes.game_id) AND (s.is_open = true))))));
CREATE POLICY poll_votes_owner_read ON public.poll_votes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_votes.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY poll_votes_owner_select ON public.poll_votes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_votes.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY poll_votes_select_owner ON public.poll_votes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = poll_votes.game_id) AND (g.owner_id = auth.uid())))));
null
null
null
null
null
null
CREATE POLICY qb_category_tags_delete ON public.qb_category_tags FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (qb_categories c
     JOIN question_bases b ON ((b.id = c.base_id)))
  WHERE ((c.id = qb_category_tags.category_id) AND ((b.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM question_base_shares s
          WHERE ((s.base_id = b.id) AND (s.user_id = auth.uid()) AND (s.role = 'editor'::base_share_role)))))))));
CREATE POLICY qb_category_tags_insert ON public.qb_category_tags FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM ((qb_categories c
     JOIN qb_tags t ON ((t.base_id = c.base_id)))
     JOIN question_bases b ON ((b.id = c.base_id)))
  WHERE ((c.id = qb_category_tags.category_id) AND (t.id = qb_category_tags.tag_id) AND ((b.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM question_base_shares s
          WHERE ((s.base_id = b.id) AND (s.user_id = auth.uid()) AND (s.role = 'editor'::base_share_role)))))))));
CREATE POLICY qb_category_tags_select ON public.qb_category_tags FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (qb_categories c
     JOIN question_bases b ON ((b.id = c.base_id)))
  WHERE ((c.id = qb_category_tags.category_id) AND ((b.owner_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM question_base_shares s
          WHERE ((s.base_id = b.id) AND (s.user_id = auth.uid()) AND (s.role = ANY (ARRAY['editor'::base_share_role, 'viewer'::base_share_role]))))))))));
null
null
null
null
null
null
null
null
CREATE POLICY qb_bases_delete ON public.question_bases FOR DELETE TO authenticated USING ((owner_id = auth.uid()));

CREATE POLICY qb_bases_insert ON public.question_bases FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY qb_bases_select ON public.question_bases FOR SELECT TO authenticated USING (((owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM question_base_shares s
  WHERE ((s.base_id = question_bases.id) AND (s.user_id = auth.uid()))))));
CREATE POLICY qb_bases_update ON public.question_bases FOR UPDATE TO authenticated USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY questions_owner_select ON public.questions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = questions.game_id) AND (g.owner_id = auth.uid())))));
CREATE POLICY questions_owner_write ON public.questions TO authenticated USING ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = questions.game_id) AND (g.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM games g
  WHERE ((g.id = questions.game_id) AND (g.owner_id = auth.uid())))));
null
null
null
null
null
null
null
null
CREATE OR REPLACE FUNCTION public.assert_game_answers_minmax()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  qn int;
  bad_q int;
  an int;
begin
  -- Walidujemy tylko gdy zmieniasz status na poll_open (start) albo ready (zamykanie)
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status not in ('poll_open'::game_status, 'ready'::game_status) then
    return new;
  end if;

  -- gra preparowana nie ma sondażu, więc nie blokuj statusów z tej funkcji
  if new.type = 'prepared'::game_type then
    return new;
  end if;

  -- >= 10 pytań zawsze dla poll_text i poll_points
  select count(*) into qn
  from public.questions
  where game_id = new.id;

  if qn < 10 then
    raise exception 'assert_game_answers_minmax: need >=10 questions (have %)', qn;
  end if;

  -- poll_points: każde pytanie musi mieć 3..6 odpowiedzi (dla startu i zamknięcia)
  if new.type = 'poll_points'::game_type then
    select q.ord into bad_q
    from public.questions q
    where q.game_id = new.id
      and (
        (select count(*) from public.answers a where a.question_id = q.id) < 3
        or
        (select count(*) from public.answers a where a.question_id = q.id) > 6
      )
    order by q.ord
    limit 1;

    if bad_q is not null then
      select count(*) into an
      from public.answers a
      join public.questions q on q.id = a.question_id
      where q.game_id = new.id and q.ord = bad_q;

      raise exception 'assert_game_answers_minmax: question % must have 3..6 answers (have %)', bad_q, an;
    end if;
  end if;

  -- poll_text: tu nie walidujemy liczby odpowiedzi (bo w trakcie to teksty od ludzi),
  -- jedynie >=10 pytań.

  return new;
end $function$
CREATE OR REPLACE FUNCTION public.base_can_access(p_base_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and (
        b.owner_id = p_user_id
        or exists (
          select 1
          from public.question_base_shares s
          where s.base_id = b.id
            and s.user_id = p_user_id
        )
      )
  );
$function$
CREATE OR REPLACE FUNCTION public.base_can_edit(p_base_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and (
        b.owner_id = p_user_id
        or exists (
          select 1
          from public.question_base_shares s
          where s.base_id = b.id
            and s.user_id = p_user_id
            and s.role = 'editor'
        )
      )
  );
$function$
CREATE OR REPLACE FUNCTION public.base_has_share(p_base_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.question_base_shares s
    where s.base_id = p_base_id
      and s.user_id = p_user_id
  );
$function$
CREATE OR REPLACE FUNCTION public.base_is_owner(p_base_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and b.owner_id = p_user_id
  );
$function$
CREATE OR REPLACE FUNCTION public.buzzer_press_v2(p_game_id uuid, p_key text, p_team text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games%rowtype;
  updated int;
  winner text;
  locked boolean;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if p_key <> g.share_key_buzzer then raise exception 'bad key'; end if;
  if p_team not in ('A','B') then raise exception 'bad team'; end if;

  perform public.ensure_runtime_and_devices(p_game_id);

  update public.game_devices
  set buzzer_locked = true,
      buzzer_winner = p_team,
      buzzer_at     = now(),
      buzzer_state  = case when p_team='A' then 'PUSHED_A'::public.buzzer_ui_state else 'PUSHED_B'::public.buzzer_ui_state end
  where game_id = p_game_id
    and buzzer_locked = false;

  get diagnostics updated = row_count;

  select buzzer_winner, buzzer_locked into winner, locked
  from public.game_devices
  where game_id = p_game_id;

  return jsonb_build_object(
    'accepted', (updated = 1),
    'winner', winner,
    'locked', locked
  );
end $function$
CREATE OR REPLACE FUNCTION public.can_access_base(p_base_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and (
        b.owner_id = auth.uid()
        or exists (
          select 1
          from public.question_base_shares s
          where s.base_id = b.id
            and s.user_id = auth.uid()
        )
      )
  );
$function$
CREATE OR REPLACE FUNCTION public.can_edit_base(p_base_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.question_bases b
    where b.id = p_base_id
      and (
        b.owner_id = auth.uid()
        or exists (
          select 1
          from public.question_base_shares s
          where s.base_id = b.id
            and s.user_id = auth.uid()
            and s.role = 'editor'
        )
      )
  );
$function$
CREATE OR REPLACE FUNCTION public.control_set_devices_v2(p_game_id uuid, p_key text, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games%rowtype;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if p_key <> g.share_key_control then raise exception 'bad control key'; end if;

  perform public.ensure_runtime_and_devices(p_game_id);

  -- patch format (przykład):
  -- {
  --   display_app_mode:GRA,
  --   display_scene_mode:ROUNDS,
  --   display_last_cmd:RBATCH ...,
  --   host_hidden:false,
  --   host_text:Pytanie ...,
  --   buzzer_state:ON,
  --   buzzer_locked:false
  -- }

  update public.game_devices
  set
    display_app_mode  = coalesce((p_patch->>'display_app_mode')::public.display_app_mode, display_app_mode),
    display_scene_mode= coalesce((p_patch->>'display_scene_mode')::public.display_scene_mode, display_scene_mode),
    display_last_cmd  = coalesce(p_patch->>'display_last_cmd', display_last_cmd),

    host_hidden = coalesce((p_patch->>'host_hidden')::boolean, host_hidden),
    host_text   = coalesce(p_patch->>'host_text', host_text),

    buzzer_state  = coalesce((p_patch->>'buzzer_state')::public.buzzer_ui_state, buzzer_state),
    buzzer_locked = coalesce((p_patch->>'buzzer_locked')::boolean, buzzer_locked),
    buzzer_winner = coalesce(p_patch->>'buzzer_winner', buzzer_winner),
    buzzer_at     = coalesce((p_patch->>'buzzer_at')::timestamptz, buzzer_at)
  where game_id = p_game_id;
end $function$
CREATE OR REPLACE FUNCTION public.control_set_runtime_v2(p_game_id uuid, p_key text, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games%rowtype;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;
  if p_key <> g.share_key_control then raise exception 'bad control key'; end if;

  perform public.ensure_runtime_and_devices(p_game_id);

  update public.game_runtime
  set
    state = coalesce(p_patch->>'state', state),
    step  = coalesce(p_patch->>'step',  step),

    round_no = coalesce((p_patch->>'round_no')::int, round_no),
    multiplier = coalesce((p_patch->>'multiplier')::int, multiplier),

    team_a_name = coalesce(p_patch->>'team_a_name', team_a_name),
    team_b_name = coalesce(p_patch->>'team_b_name', team_b_name),
    team_a_score = coalesce((p_patch->>'team_a_score')::int, team_a_score),
    team_b_score = coalesce((p_patch->>'team_b_score')::int, team_b_score),

    active_question_ord = coalesce((p_patch->>'active_question_ord')::int, active_question_ord),

    revealed_answer_ords = coalesce(p_patch->'revealed_answer_ords', revealed_answer_ords),
    used_question_ords   = coalesce(p_patch->'used_question_ords', used_question_ords),

    round_sum = coalesce((p_patch->>'round_sum')::int, round_sum),
    strikes   = coalesce((p_patch->>'strikes')::int, strikes),

    playing_team = coalesce(p_patch->>'playing_team', playing_team),
    steal_team   = coalesce(p_patch->>'steal_team', steal_team),

    final = coalesce(p_patch->'final', final)
  where game_id = p_game_id;
end $function$
CREATE OR REPLACE FUNCTION public.control_set_state(p_game_id uuid, p_state game_fsm_state, p_patch jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_old public.game_fsm_state;
  v_row public.game_runtime%rowtype;
begin
  perform public.ensure_game_runtime(p_game_id);

  select state into v_old
  from public.game_runtime
  where game_id = p_game_id
  for update;

  if not public.fsm_can_transition(v_old, p_state) and v_old is distinct from p_state then
    raise exception 'FSM transition not allowed: % -> %', v_old, p_state
      using errcode = 'P0001';
  end if;

  update public.game_runtime gr
  set
    state = p_state,
    -- state_at ogarnie trigger touch_state_at() jeśli go dodałeś
    team_a_name = coalesce(p_patch->>'team_a_name', gr.team_a_name),
    team_b_name = coalesce(p_patch->>'team_b_name', gr.team_b_name),
    round_no = coalesce((p_patch->>'round_no')::int, gr.round_no),
    multiplier = coalesce((p_patch->>'multiplier')::int, gr.multiplier),
    team_a_score = coalesce((p_patch->>'team_a_score')::int, gr.team_a_score),
    team_b_score = coalesce((p_patch->>'team_b_score')::int, gr.team_b_score),
    active_question_ord = coalesce((p_patch->>'active_question_ord')::int, gr.active_question_ord),
    revealed_answer_ords = coalesce(p_patch->'revealed_answer_ords', gr.revealed_answer_ords),
    strikes = coalesce((p_patch->>'strikes')::int, gr.strikes),
    buzzer_locked = coalesce((p_patch->>'buzzer_locked')::boolean, gr.buzzer_locked),
    buzzer_winner = coalesce((p_patch->>'buzzer_winner')::public.team_code, gr.buzzer_winner),
    buzzer_at = coalesce((p_patch->>'buzzer_at')::timestamptz, gr.buzzer_at),
    playing_team = coalesce((p_patch->>'playing_team')::public.team_code, gr.playing_team),
    steal_team = coalesce((p_patch->>'steal_team')::public.team_code, gr.steal_team),
    round_sum = coalesce((p_patch->>'round_sum')::int, gr.round_sum),
    final_p1_answers = coalesce(p_patch->'final_p1_answers', gr.final_p1_answers),
    final_p2_answers = coalesce(p_patch->'final_p2_answers', gr.final_p2_answers),
    final_p1_points = coalesce(p_patch->'final_p1_points', gr.final_p1_points),
    final_p2_points = coalesce(p_patch->'final_p2_points', gr.final_p2_points),
    final_total = coalesce((p_patch->>'final_total')::int, gr.final_total)
  where gr.game_id = p_game_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$
CREATE OR REPLACE FUNCTION public.device_ping(p_game_id uuid, p_device_type device_type, p_key text, p_device_id text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games;
  did text;
  ok boolean := false;
begin
  select * into g from public.games where id = p_game_id;
  if not found then
    raise exception 'not found';
  end if;

  -- autoryzacja po kluczu dla danego typu urządzenia
  if p_device_type = 'display' and g.share_key_display = p_key then ok := true; end if;
  if p_device_type = 'host'    and g.share_key_host    = p_key then ok := true; end if;

  -- buzzer: jeśli masz share_key_buzzer, użyj. Jeśli nie masz, tymczasowo dopuszczamy share_key_host.
  if p_device_type = 'buzzer' then
    if coalesce(g.share_key_buzzer,'') <> '' and g.share_key_buzzer = p_key then ok := true; end if;
    if coalesce(g.share_key_buzzer,'') = ''  and g.share_key_host   = p_key then ok := true; end if;
  end if;

  if not ok then
    raise exception 'forbidden';
  end if;

  -- device_id: jeśli klient nie podał, generujemy
  did := nullif(trim(coalesce(p_device_id,'')), '');
  if did is null then
    did := encode(gen_random_bytes(8), 'hex');
  end if;

  insert into public.device_presence(game_id, device_type, device_id, last_seen_at, meta)
  values (p_game_id, p_device_type, did, now(), coalesce(p_meta,'{}'::jsonb))
  on conflict (game_id, device_type, device_id)
  do update set last_seen_at = excluded.last_seen_at,
                meta = excluded.meta;

  return jsonb_build_object('ok', true, 'device_id', did, 'ts', now());
end;
$function$
CREATE OR REPLACE FUNCTION public.device_ping_v2(p_game_id uuid, p_kind device_kind, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games%rowtype;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;

  if p_kind = 'display' and p_key <> g.share_key_display then raise exception 'bad key'; end if;
  if p_kind = 'host'    and p_key <> g.share_key_host    then raise exception 'bad key'; end if;
  if p_kind = 'buzzer'  and p_key <> g.share_key_buzzer  then raise exception 'bad key'; end if;

  perform public.ensure_runtime_and_devices(p_game_id);

  if p_kind = 'display' then
    update public.game_devices set seen_display_at = now() where game_id = p_game_id;
  elsif p_kind = 'host' then
    update public.game_devices set seen_host_at = now() where game_id = p_game_id;
  elsif p_kind = 'buzzer' then
    update public.game_devices set seen_buzzer_at = now() where game_id = p_game_id;
  end if;

  return jsonb_build_object('ok', true, 'ts', now());
end $function$
CREATE OR REPLACE FUNCTION public.device_state_get(p_game_id uuid, p_device_type device_type, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games;
  ok boolean := false;
  out jsonb;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;

  if p_device_type='display' and g.share_key_display = p_key then ok := true; end if;
  if p_device_type='host'    and g.share_key_host    = p_key then ok := true; end if;

  if p_device_type='buzzer' then
    if coalesce(g.share_key_buzzer,'') <> '' and g.share_key_buzzer = p_key then ok := true; end if;
    if coalesce(g.share_key_buzzer,'') = ''  and g.share_key_host   = p_key then ok := true; end if;
  end if;

  if not ok then raise exception 'forbidden'; end if;

  select state into out
  from public.device_state
  where game_id = p_game_id and device_type = p_device_type;

  return coalesce(out, '{}'::jsonb);
end;
$function$


CREATE OR REPLACE FUNCTION public.device_state_set_admin(p_game_id uuid, p_kind device_kind, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  ok boolean;
  out jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.games g
    where g.id = p_game_id and g.owner_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.device_state(game_id, kind)
  values (p_game_id, p_kind)
  on conflict (game_id, kind) do nothing;

  update public.device_state
  set state = coalesce(state, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb),
      updated_at = now()
  where game_id = p_game_id and kind = p_kind;

  select state into out
  from public.device_state
  where game_id = p_game_id and kind = p_kind;

  return coalesce(out, '{}'::jsonb);
end $function$
CREATE OR REPLACE FUNCTION public.device_state_set_public(p_game_id uuid, p_device_type device_type, p_key text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games;
  ok boolean := false;
  cur jsonb;
  merged jsonb;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;

  if p_device_type='display' and g.share_key_display = p_key then ok := true; end if;
  if p_device_type='host'    and g.share_key_host    = p_key then ok := true; end if;

  if p_device_type='buzzer' then
    if coalesce(g.share_key_buzzer,'') <> '' and g.share_key_buzzer = p_key then ok := true; end if;
    if coalesce(g.share_key_buzzer,'') = ''  and g.share_key_host   = p_key then ok := true; end if;
  end if;

  if not ok then raise exception 'forbidden'; end if;

  select state into cur
  from public.device_state
  where game_id = p_game_id and device_type = p_device_type;

  merged := coalesce(cur, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb);

  insert into public.device_state(game_id, device_type, state, updated_at)
  values (p_game_id, p_device_type, merged, now())
  on conflict (game_id, device_type)
  do update set state = excluded.state, updated_at = now();

  return jsonb_build_object('ok', true, 'updated_at', now(), 'state', merged);
end;
$function$


CREATE OR REPLACE FUNCTION public.display_auth(p_game_id uuid, p_key text)
 RETURNS TABLE(id uuid, name text, type game_type, status game_status)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select g.id, g.name, g.type, g.status
  from public.games g
  where g.id = p_game_id
    and g.share_key_display = p_key
  limit 1;
$function$
CREATE OR REPLACE FUNCTION public.display_logo_get_public(p_game_id uuid, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_owner uuid;
  v_ok boolean;
  v_logo jsonb;
begin
  -- walidacja: czy istnieje gra i czy klucz pasuje do display
  select (g.share_key_display = p_key), g.owner_id
    into v_ok, v_owner
  from public.games g
  where g.id = p_game_id;

  if v_ok is distinct from true then
    -- brak dostępu
    return null;
  end if;

  -- pobierz aktywne logo użytkownika
  select jsonb_build_object(
    'type', ul.type,
    'payload', ul.payload,
    'name', ul.name
  )
  into v_logo
  from public.user_logos ul
  where ul.user_id = v_owner and ul.is_active = true
  limit 1;

  return v_logo; -- null jeśli brak
end $function$
CREATE OR REPLACE FUNCTION public.enforce_max_answers()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  cnt int;
begin
  -- licz ile już jest odpowiedzi dla tego pytania
  select count(*) into cnt
  from public.answers a
  where a.question_id = new.question_id
    and (tg_op <> 'UPDATE' or a.id <> new.id);

  -- jeśli już jest 6, to kolejnej nie wolno
  if cnt >= 6 then
    raise exception 'max 6 answers per question';
  end if;

  return new;
end $function$
CREATE OR REPLACE FUNCTION public.ensure_device_state(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.device_state(game_id, kind) values
    (p_game_id, 'display'),
    (p_game_id, 'host'),
    (p_game_id, 'buzzer')
  on conflict (game_id, kind) do nothing;
end $function$


CREATE OR REPLACE FUNCTION public.ensure_game_rows(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  insert into public.game_runtime(game_id) values (p_game_id)
  on conflict (game_id) do nothing;

  insert into public.game_devices(game_id) values (p_game_id)
  on conflict (game_id) do nothing;
end $function$


CREATE OR REPLACE FUNCTION public.ensure_game_runtime(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.game_runtime(game_id)
  values (p_game_id)
  on conflict (game_id) do nothing;
end;
$function$


CREATE OR REPLACE FUNCTION public.ensure_runtime_and_devices(p_game_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.game_runtime(game_id) values (p_game_id)
  on conflict (game_id) do nothing;

  insert into public.game_devices(game_id) values (p_game_id)
  on conflict (game_id) do nothing;
end $function$


CREATE OR REPLACE FUNCTION public.fsm_can_transition(a game_fsm_state, b game_fsm_state)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (a,b) in (
    ('TOOLS_SETUP','TOOLS_LINKS'),
    ('TOOLS_LINKS','TEAM_NAMES'),
    ('TEAM_NAMES','GAME_READY'),
    ('GAME_READY','GAME_INTRO'),
    ('GAME_INTRO','ROUND_READY'),
    ('ROUND_READY','ROUND_TRANSITION_IN'),
    ('ROUND_TRANSITION_IN','ROUND_BUZZ'),
    ('ROUND_BUZZ','BUZZ_CONFIRM'),
    ('BUZZ_CONFIRM','ROUND_BUZZ'),
    ('BUZZ_CONFIRM','ROUND_PLAY'),
    ('ROUND_PLAY','ROUND_STEAL'),
    ('ROUND_PLAY','ROUND_END'),
    ('ROUND_STEAL','ROUND_END'),
    ('ROUND_END','ROUND_READY'),
    ('ROUND_END','FINAL_PREP'),
    ('FINAL_PREP','FINAL_P1_INPUT'),
    ('FINAL_P1_INPUT','FINAL_P1_REVEAL'),
    ('FINAL_P1_REVEAL','FINAL_HIDE_FOR_P2'),
    ('FINAL_HIDE_FOR_P2','FINAL_P2_INPUT'),
    ('FINAL_P2_INPUT','FINAL_P2_REVEAL'),
    ('FINAL_P2_REVEAL','FINAL_WIN'),
    ('FINAL_P2_REVEAL','FINAL_LOSE')
  );
$function$
CREATE OR REPLACE FUNCTION public.game_action_state(p_game_id uuid)
 RETURNS TABLE(game_id uuid, rev timestamp with time zone, can_edit boolean, needs_reset_warning boolean, can_play boolean, can_poll boolean, can_export boolean, reason_play text, reason_poll text)
 LANGUAGE sql
 STABLE
AS $function$
with g as (
  select id, type, status, updated_at
  from public.games
  where id = p_game_id
),
qs as (
  select id, ord
  from public.questions
  where game_id = p_game_id
),
ans as (
  select
    a.question_id,
    count(*) as cnt,
    min(coalesce(a.fixed_points,0)) as minp,
    max(coalesce(a.fixed_points,0)) as maxp,
    sum(coalesce(a.fixed_points,0)) as sump
  from public.answers a
  join qs on qs.id = a.question_id
  group by a.question_id
),
agg as (
  select
    coalesce((select count(*) from qs), 0) as qn,
    coalesce((select min(cnt) from ans), 0) as an_min,
    coalesce((select max(cnt) from ans), 0) as an_max,
    coalesce((select bool_or(sump > 100) from ans), false) as sum_too_big,
    coalesce((select bool_or(minp < 0) from ans), false) as neg_pts,
    coalesce((select bool_or(maxp > 100) from ans), false) as over_pts
)
select
  g.id as game_id,
  g.updated_at as rev,

  /* EDIT — zgodnie z canEnterEdit() */
  case
    when g.type = 'prepared' then true
    when g.status = 'poll_open' then false
    else true
  end as can_edit,

  /* warning resetu tylko dla poll_* w READY */
  (g.type <> 'prepared' and g.status = 'ready') as needs_reset_warning,

  /* PLAY — zgodnie z validateGameReadyToPlay() */
  case
    when g.type in ('poll_text','poll_points') then (g.status = 'ready')
    when g.type = 'prepared' then
      (select qn from agg) >= 10
      and (select an_min from agg) between 3 and 6
      and (select an_max from agg) between 3 and 6
      and not (select sum_too_big from agg)
      and not (select neg_pts from agg)
      and not (select over_pts from agg)
    else false
  end as can_play,

  /* POLL — zgodnie z validatePollEntry() + validatePollReadyToOpen() */
  case
    when g.type = 'prepared' then false
    when g.type = 'poll_text' then (select qn from agg) >= 10
    when g.type = 'poll_points' then
      (select qn from agg) >= 10
      and (select an_min from agg) between 3 and 6
      and (select an_max from agg) between 3 and 6
    else false
  end as can_poll,

  /* eksport: UI i tak może traktować jako true po zaznaczeniu */
  true as can_export,

  /* reason_play (opcjonalnie) */
  case
    when g.type in ('poll_text','poll_points') and g.status <> 'ready'
      then 'Gra dostępna dopiero po zamknięciu sondażu.'
    when g.type = 'prepared' and (select qn from agg) < 10
      then 'Musi być co najmniej 10 pytań.'
    when g.type = 'prepared' and not ((select an_min from agg) between 3 and 6 and (select an_max from agg) between 3 and 6)
      then 'Każde pytanie musi mieć 3–6 odpowiedzi.'
    when g.type = 'prepared' and (select neg_pts from agg)
      then 'Punkty nie mogą być ujemne.'
    when g.type = 'prepared' and (select over_pts from agg)
      then 'Odpowiedź nie może mieć > 100 pkt.'
    when g.type = 'prepared' and (select sum_too_big from agg)
      then 'Suma punktów w pytaniu nie może przekroczyć 100.'
    else null
  end as reason_play,

  /* reason_poll (opcjonalnie) */
  case
    when g.type = 'prepared'
      then 'Preparowany nie ma sondażu.'
    when (g.type in ('poll_text','poll_points') and (select qn from agg) < 10)
      then 'Musi być co najmniej 10 pytań.'
    when g.type = 'poll_points' and not ((select an_min from agg) between 3 and 6 and (select an_max from agg) between 3 and 6)
      then 'Każde pytanie musi mieć 3–6 odpowiedzi.'
    else null
  end as reason_poll
from g, agg;
$function$
CREATE OR REPLACE FUNCTION public.games_fill_share_keys()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.share_key_poll    := coalesce(new.share_key_poll,    public.gen_share_key(18));
  new.share_key_control := coalesce(new.share_key_control, public.gen_share_key(24));
  new.share_key_display := coalesce(new.share_key_display, public.gen_share_key(18));
  new.share_key_host    := coalesce(new.share_key_host,    public.gen_share_key(18));
  new.share_key_buzzer  := coalesce(new.share_key_buzzer,  public.gen_share_key(18));
  return new;
end;
$function$
CREATE OR REPLACE FUNCTION public.gen_share_key(n_bytes integer DEFAULT 24)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select encode(gen_random_bytes(n_bytes), 'hex');
$function$
CREATE OR REPLACE FUNCTION public.get_device_snapshot(p_game_id uuid, p_kind text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  g public.games%rowtype;
  d public.game_devices%rowtype;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;

  if p_kind = 'display' and p_key <> g.share_key_display then raise exception 'bad key'; end if;
  if p_kind = 'host' and p_key <> g.share_key_host then raise exception 'bad key'; end if;
  if p_kind = 'buzzer' and p_key <> g.share_key_buzzer then raise exception 'bad key'; end if;

  perform public.ensure_game_rows(p_game_id);

  select * into d from public.game_devices where game_id = p_game_id;

  return jsonb_build_object(
    'ok', true,
    'game', jsonb_build_object('id', g.id, 'name', g.name),
    'devices', to_jsonb(d)
  );
end $function$


CREATE OR REPLACE FUNCTION public.get_game_by_key(p_key text)
 RETURNS TABLE(id uuid, name text, type game_type, status game_status)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select g.id, g.name, g.type, g.status
  from public.games g
  where g.share_key_poll = p_key
     or g.share_key_control = p_key
     or g.share_key_display = p_key
     or g.share_key_host = p_key
  limit 1;
$function$
CREATE OR REPLACE FUNCTION public.get_poll_bundle(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  gid uuid;
  out jsonb;
begin
  select g.id into gid
  from public.games g
  where g.share_key_poll = p_key
  limit 1;

  if gid is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_key');
  end if;

  select jsonb_build_object(
    'ok', true,
    'game', jsonb_build_object(
      'id', g.id,
      'name', g.name,
      'type', g.type,
      'status', g.status
    ),
    'questions',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'ord', q.ord,
            'text', q.text,
            'answers', (
              select jsonb_agg(jsonb_build_object('ord', a.ord, 'text', a.text) order by a.ord)
              from public.answers a
              where a.question_id = q.id
            )
          ) order by q.ord
        )
        from public.questions q
        where q.game_id = g.id
      ), '[]'::jsonb)
  )
  into out
  from public.games g
  where g.id = gid;

  return out;
end $function$
CREATE OR REPLACE FUNCTION public.get_poll_game(p_game_id uuid, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games;
  out jsonb;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;
  if g.share_key_poll <> p_key then raise exception 'forbidden'; end if;

  if g.type = 'poll_points' then
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status),
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'ord', q.ord,
            'text', q.text,
            'answers', coalesce((
              select jsonb_agg(jsonb_build_object('id', a.id, 'ord', a.ord, 'text', a.text) order by a.ord)
              from public.answers a
              where a.question_id = q.id
            ), '[]'::jsonb)
          )
          order by q.ord
        )
        from public.questions q
        where q.game_id = g.id
      ), '[]'::jsonb)
    ) into out;
  else
    -- poll_text: zwracamy same pytania (odpowiedzi są tekstowe i idą do poll_text_entries)
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status),
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', q.id, 'ord', q.ord, 'text', q.text)
          order by q.ord
        )
        from public.questions q
        where q.game_id = g.id
      ), '[]'::jsonb)
    ) into out;
  end if;

  return out;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_public_snapshot_v2(p_game_id uuid, p_kind device_kind, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games%rowtype;
  rt public.game_runtime%rowtype;
  dv public.game_devices%rowtype;
  ok boolean := false;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;

  if p_kind = 'display' and p_key = g.share_key_display then ok := true; end if;
  if p_kind = 'host'    and p_key = g.share_key_host    then ok := true; end if;
  if p_kind = 'buzzer'  and p_key = g.share_key_buzzer  then ok := true; end if;

  if not ok then raise exception 'forbidden'; end if;

  perform public.ensure_runtime_and_devices(p_game_id);

  select * into rt from public.game_runtime where game_id = p_game_id;
  select * into dv from public.game_devices where game_id = p_game_id;

  return jsonb_build_object(
    'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status),
    'runtime', to_jsonb(rt),
    'devices', to_jsonb(dv)
  );
end $function$
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text;
  v_username text;
begin
  v_email := lower(coalesce(new.email, ''));

  -- username z user_metadata (Ty wysyłasz data: { username: ... })
  v_username := trim(coalesce(new.raw_user_meta_data->>'username', ''));

  -- fallback: część maila przed @
  if v_username = '' then
    v_username := split_part(v_email, '@', 1);
  end if;

  -- ostateczny fallback (gdyby email też był pusty)
  if v_username = '' then
    v_username := 'user_' || replace(new.id::text, '-', '');
  end if;

  insert into public.profiles (id, email, username)
  values (new.id, v_email, v_username)
  on conflict (id) do update
    set email = excluded.email,
        username = excluded.username;

  return new;
end;
$function$
CREATE OR REPLACE FUNCTION public.is_base_owner(p_base_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1 from public.question_bases b
    where b.id = p_base_id and b.owner_id = auth.uid()
  );
$function$
CREATE OR REPLACE FUNCTION public.list_base_shares(p_base_id uuid)
 RETURNS TABLE(user_id uuid, email text, role base_share_role)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select s.user_id, p.email, s.role
  from public.question_base_shares s
  join public.profiles p on p.id = s.user_id
  where s.base_id = p_base_id
    and public.is_base_owner(p_base_id);
$function$


CREATE OR REPLACE FUNCTION public.list_shared_bases()
 RETURNS TABLE(id uuid, name text, owner_id uuid, owner_email text, owner_username text, shared_role text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    b.id,
    b.name,
    b.owner_id,
    op.email as owner_email,
    op.username as owner_username,
    s.role as shared_role,
    b.created_at,
    b.updated_at
  from public.question_base_shares s
  join public.question_bases b
    on b.id = s.base_id
  left join public.profiles op
    on op.id = b.owner_id
  where s.user_id = auth.uid()
  order by b.updated_at desc nulls last, b.created_at desc;
$function$


CREATE OR REPLACE FUNCTION public.list_shared_bases_ext()
 RETURNS TABLE(id uuid, name text, owner_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, shared_role text, owner_username text, owner_email text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select
    b.id,
    b.name,
    b.owner_id,
    b.created_at,
    b.updated_at,
    s.role as shared_role,
    p.username as owner_username,
    p.email as owner_email
  from public.question_base_shares s
  join public.question_bases b
    on b.id = s.base_id
  left join public.profiles p
    on p.id = b.owner_id
  where s.user_id = auth.uid()
  order by b.updated_at desc nulls last, b.created_at desc;
$function$


CREATE OR REPLACE FUNCTION public.poll_action(p_kind text, p_token uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_kind = 'task' then
    -- delegujemy do istniejącej logiki tasków
    perform public.poll_go_task_action(p_token, p_action);
    return jsonb_build_object('ok', true, 'kind', 'task', 'action', p_action);
  end if;

  if p_kind = 'sub' then
    -- delegujemy do nowej bramki subów (token)
    return public.polls_sub_action(p_action, p_token, null);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown kind');
end;
$function$


CREATE OR REPLACE FUNCTION public.poll_admin_can_close(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g record;
  q record;
  uniq_cnt int;
  ok boolean := true;
  reason text := '';
begin
  -- tylko właściciel
  select id, owner_id, type, status
    into g
  from public.games
  where id = p_game_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Gra nie istnieje.');
  end if;

  if auth.uid() is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'Brak uprawnień.');
  end if;

  if g.status <> 'poll_open'::game_status then
    return jsonb_build_object('ok', false, 'reason', 'Sondaż nie jest otwarty.');
  end if;

  if g.type = 'poll_text'::game_type then
    for q in
      select id, ord from public.questions where game_id = p_game_id order by ord
    loop
      select count(*) into uniq_cnt
      from (
        select distinct trim(coalesce(answer_norm,'')) as k
        from public.poll_text_entries
        where game_id = p_game_id
          and question_id = q.id
          and trim(coalesce(answer_norm,'')) <> ''
      ) s;

      if coalesce(uniq_cnt,0) < 3 then
        ok := false;
        reason := format('Pytanie %s: potrzebujesz ≥ 3 różnych odpowiedzi.', q.ord);
        exit;
      end if;
    end loop;

    return jsonb_build_object('ok', ok, 'reason', reason);
  end if;

  if g.type = 'poll_points'::game_type then
    for q in
      select id, ord from public.questions where game_id = p_game_id order by ord
    loop
      -- co najmniej 2 odpowiedzi z >=1 głosem
      select count(*) into uniq_cnt
      from (
        select answer_id
        from public.poll_votes
        where game_id = p_game_id
          and question_id = q.id
          and answer_id is not null
        group by answer_id
        having count(*) > 0
      ) s;

      if coalesce(uniq_cnt,0) < 2 then
        ok := false;
        reason := format('Pytanie %s: potrzebujesz ≥ 2 odpowiedzi z głosami > 0.', q.ord);
        exit;
      end if;
    end loop;

    return jsonb_build_object('ok', ok, 'reason', reason);
  end if;

  return jsonb_build_object('ok', false, 'reason', 'Nieznany typ gry.');
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_admin_preview(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g record;
  out jsonb;
begin
  select id, owner_id, type, status
    into g
  from public.games
  where id = p_game_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'Gra nie istnieje.');
  end if;

  if auth.uid() is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'Brak uprawnień.');
  end if;

  if g.type = 'poll_points'::game_type then
    select jsonb_build_object(
      'ok', true,
      'type', g.type,
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'ord', q.ord,
            'text', q.text,
            'answers', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', a.id,
                  'ord', a.ord,
                  'text', a.text,
                  'votes', coalesce(v.cnt,0)
                )
                order by a.ord
              )
              from public.answers a
              left join (
                select answer_id, count(*) cnt
                from public.poll_votes
                where game_id = p_game_id and question_id = q.id
                group by answer_id
              ) v on v.answer_id = a.id
              where a.question_id = q.id
            ), '[]'::jsonb)
          )
          order by q.ord
        )
        from public.questions q
        where q.game_id = p_game_id
      ), '[]'::jsonb)
    ) into out;

    return out;
  end if;

  if g.type = 'poll_text'::game_type then
    select jsonb_build_object(
      'ok', true,
      'type', g.type,
      'questions', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'ord', q.ord,
            'text', q.text,
            'top', coalesce((
              select jsonb_agg(
                jsonb_build_object('text', t.answer_norm, 'count', t.cnt)
                order by t.cnt desc
              )
              from (
                select trim(answer_norm) as answer_norm, count(*) cnt
                from public.poll_text_entries
                where game_id = p_game_id and question_id = q.id
                  and trim(coalesce(answer_norm,'')) <> ''
                group by trim(answer_norm)
                order by count(*) desc
                limit 12
              ) t
            ), '[]'::jsonb)
          )
          order by q.ord
        )
        from public.questions q
        where q.game_id = p_game_id
      ), '[]'::jsonb)
    ) into out;

    return out;
  end if;

  return jsonb_build_object('ok', false, 'reason', 'Gra preparowana nie ma podglądu.');
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_claim_email_records()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_email text;
begin
  v_email := public.poll_my_email();
  if v_email is null or v_email = '' then
    return;
  end if;

  -- poll_tasks: dopnij recipient_user_id po recipient_email
  update public.poll_tasks t
    set recipient_user_id = auth.uid(),
        recipient_email = null
  where t.recipient_user_id is null
    and t.recipient_email is not null
    and lower(trim(t.recipient_email)) = v_email
    and t.done_at is null
    and t.declined_at is null
    and t.cancelled_at is null;

  -- poll_subscriptions: dopnij subscriber_user_id po subscriber_email
  update public.poll_subscriptions s
    set subscriber_user_id = auth.uid(),
        subscriber_email = null
  where s.subscriber_user_id is null
    and s.subscriber_email is not null
    and lower(trim(s.subscriber_email)) = v_email
    and s.status in ('pending','active');
end;
$function$


CREATE OR REPLACE FUNCTION public.poll_close_and_normalize(p_game_id uuid, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games;
begin
  select * into g
  from public.games
  where id = p_game_id
    and share_key_poll = p_key
  limit 1;

  if not found then
    raise exception 'bad key or game';
  end if;

  if g.type <> 'poll_points'::public.game_type then
    raise exception 'poll_close_and_normalize works only for poll_points';
  end if;

  if g.status <> 'poll_open'::public.game_status then
    raise exception 'poll is not open';
  end if;

  if (select count(*) from public.questions where game_id = p_game_id) < 10 then
    raise exception 'Za mało pytań (min 10)';
  end if;

  /*
    Mapujemy ord->question_id i ord->answer_id, a głosy liczymy z poll_votes (ord-owo).
    Uwaga: działamy tylko na pytaniach 1..10.
  */

  with q10 as (
    select id as question_id, ord as qord
    from public.questions
    where game_id = p_game_id
      and ord between 1 and 10
  ),
  a as (
    select
      q10.question_id,
      q10.qord,
      an.id as answer_id,
      an.ord as aord
    from q10
    join public.answers an
      on an.question_id = q10.question_id
    where an.ord between 1 and 6
  ),
  c as (
    select
      a.question_id,
      a.answer_id,
      a.qord,
      a.aord,
      coalesce(count(v.id), 0)::int as cnt
    from a
    left join public.poll_votes v
      on v.game_id = p_game_id
     and v.question_ord = a.qord
     and v.answer_ord  = a.aord
    group by a.question_id, a.answer_id, a.qord, a.aord
  ),
  c_fixed as (
    select
      question_id,
      answer_id,
      qord,
      aord,
      case when cnt = 0 then 1 else cnt end as cnt1
    from c
  ),
  tot as (
    select question_id, sum(cnt1)::int as total
    from c_fixed
    group by question_id
  ),
  raw as (
    select
      cf.question_id,
      cf.answer_id,
      cf.aord,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) as raw_p,
      floor(100.0 * cf.cnt1 / nullif(t.total, 0))::int as base_floor,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) - floor(100.0 * cf.cnt1 / nullif(t.total, 0)) as frac
    from c_fixed cf
    join tot t on t.question_id = cf.question_id
  ),
  base as (
    select
      question_id,
      answer_id,
      aord,
      greatest(1, base_floor) as p0,
      frac
    from raw
  ),
  sum_base as (
    select question_id, sum(p0)::int as s0
    from base
    group by question_id
  ),
  need as (
    select
      b.question_id,
      b.answer_id,
      b.aord,
      b.p0,
      b.frac,
      (100 - sb.s0)::int as diff
    from base b
    join sum_base sb on sb.question_id = b.question_id
  ),
  ranked_plus as (
    select
      n.*,
      row_number() over (partition by question_id order by frac desc, aord asc) as rn_plus
    from need n
  ),
  ranked_minus as (
    select
      n.*,
      row_number() over (partition by question_id order by p0 desc, frac asc, aord desc) as rn_minus
    from need n
    where p0 > 1
  ),
  final as (
    select
      n.answer_id,
      case
        when n.diff > 0 then
          n.p0 + case when rp.rn_plus <= n.diff then 1 else 0 end
        when n.diff < 0 then
          n.p0 - case
            when rm.rn_minus is not null and rm.rn_minus <= abs(n.diff) then 1
            else 0
          end
        else
          n.p0
      end as p_final
    from need n
    left join ranked_plus rp
      on rp.question_id = n.question_id and rp.answer_id = n.answer_id
    left join ranked_minus rm
      on rm.question_id = n.question_id and rm.answer_id = n.answer_id
  )
  update public.answers aup
  set fixed_points = f.p_final
  from final f
  where aup.id = f.answer_id;

  -- zamknij sesje
  update public.poll_sessions
  set is_open = false,
      closed_at = now()
  where game_id = p_game_id
    and is_open = true;

  -- zamknij grę
  update public.games
  set status = 'ready'::public.game_status,
      poll_closed_at = now()
  where id = p_game_id;

end;
$function$
CREATE OR REPLACE FUNCTION public.poll_get_payload(p_game_id uuid, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g record;
  out jsonb;
begin
  select id, name, type, status
    into g
  from public.games
  where id = p_game_id
    and share_key_poll = p_key;

  if not found then
    raise exception 'poll_get_payload: bad key or game not found';
  end if;

  if g.type = 'prepared'::game_type then
    raise exception 'poll_get_payload: prepared has no poll';
  end if;

  if g.status <> 'poll_open'::game_status then
    -- uczestnik ma widzieć tylko aktywny sondaż
    raise exception 'poll_get_payload: poll is not open';
  end if;

  -- pytania
  -- dla poll_points zwracamy też odpowiedzi
  if g.type = 'poll_points'::game_type then
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status),
      'questions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', q.id,
              'ord', q.ord,
              'text', q.text,
              'answers', coalesce(
                (
                  select jsonb_agg(
                    jsonb_build_object('id', a.id, 'ord', a.ord, 'text', a.text)
                    order by a.ord
                  )
                  from public.answers a
                  where a.question_id = q.id
                ),
                '[]'::jsonb
              )
            )
            order by q.ord
          )
          from public.questions q
          where q.game_id = g.id
        ),
        '[]'::jsonb
      )
    ) into out;
  else
    -- poll_text: wystarczą pytania
    select jsonb_build_object(
      'game', jsonb_build_object('id', g.id, 'name', g.name, 'type', g.type, 'status', g.status),
      'questions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('id', q.id, 'ord', q.ord, 'text', q.text)
            order by q.ord
          )
          from public.questions q
          where q.game_id = g.id
        ),
        '[]'::jsonb
      )
    ) into out;
  end if;

  return out;
end;
$function$


CREATE OR REPLACE FUNCTION public.poll_go_resolve(p_token uuid)
 RETURNS TABLE(kind text, poll_type text, game_id uuid, status text, token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- 1) task?
  return query
  select
    'task'::text as kind,
    t.poll_type,
    t.game_id,
    case
      when t.done_at is not null then 'done'
      when t.declined_at is not null then 'declined'
      when t.cancelled_at is not null then 'cancelled'
      else 'pending'
    end as status,
    t.token
  from public.poll_tasks t
  where t.token = p_token
  limit 1;

  if found then
    return;
  end if;

  -- 2) subscription?
  return query
  select
    'sub'::text as kind,
    null::text as poll_type,
    null::uuid as game_id,
    s.status,
    s.token
  from public.poll_subscriptions s
  where s.token = p_token
  limit 1;

  if found then
    return;
  end if;

  -- 3) none
  return query
  select 'none'::text, null::text, null::uuid, 'none'::text, p_token;
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_go_sub_decline(p_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.poll_subscriptions s
     set status = 'declined',
         opened_at = coalesce(s.opened_at, now()),
         declined_at = now()
   where s.token = p_token
     and s.status = 'pending'
     and s.cancelled_at is null
     and s.declined_at is null;

  return found;
end;
$function$


CREATE OR REPLACE FUNCTION public.poll_go_subscribe_email(p_token uuid, p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email,'')));

  if v_email = '' or position('@' in v_email) = 0 then
    return false;
  end if;

  update public.poll_subscriptions s
     set subscriber_email = v_email,
         status = 'active',
         opened_at = coalesce(s.opened_at, now()),
         accepted_at = now()
   where s.token = p_token
     and s.subscriber_user_id is null
     and s.status = 'pending'
     and s.cancelled_at is null
     and s.declined_at is null;

  return found;
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_go_task_action(p_token uuid, p_action text, p_email text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_action text;
  v_email text;
begin
  v_action := lower(trim(coalesce(p_action,'')));
  v_email := lower(trim(coalesce(p_email,'')));

  if v_action not in ('open','decline') then
    return false;
  end if;

  if v_action = 'open' then
    update public.poll_tasks t
       set opened_at = coalesce(t.opened_at, now()),
           recipient_email = case
             when t.recipient_user_id is null and (t.recipient_email is null or t.recipient_email = '') and v_email <> '' then v_email
             else t.recipient_email
           end
     where t.token = p_token
       and t.done_at is null
       and t.declined_at is null
       and t.cancelled_at is null;

    return found;
  end if;

  if v_action = 'decline' then
    update public.poll_tasks t
       set declined_at = now(),
           opened_at = coalesce(t.opened_at, now())
     where t.token = p_token
       and t.done_at is null
       and t.declined_at is null
       and t.cancelled_at is null;

    return found;
  end if;

  return false;
end;
$function$


CREATE OR REPLACE FUNCTION public.poll_my_email()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select lower(trim(p.email))
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$function$
CREATE OR REPLACE FUNCTION public.poll_on_login()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- jeśli masz tę funkcję, to ona robi claim rekordów email->user_id
  perform public.poll_claim_email_records();

  return jsonb_build_object('ok', true);
exception
  when undefined_function then
    -- jeśli ktoś kiedyś usunie poll_claim_email_records, nie wywalaj logowania
    return jsonb_build_object('ok', false, 'error', 'missing poll_claim_email_records');
end;
$function$


CREATE OR REPLACE FUNCTION public.poll_open(p_game_id uuid, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type public.game_type;
begin
  -- weryfikacja klucza + pobranie typu gry
  select g.type into v_type
  from public.games g
  where g.id = p_game_id
    and g.share_key_poll = p_key;

  if not found then
    raise exception 'Bad poll key or game not found';
  end if;

  if v_type = 'prepared' then
    raise exception 'Prepared game has no poll';
  end if;

  -- status = poll_open (UWAGA: nie dotykamy games.type!)
  update public.games
  set status = 'poll_open',
      poll_opened_at = now(),
      poll_closed_at = null,
      updated_at = now()
  where id = p_game_id;

  -- restart sesji: usuń stare dane ankietowe
  delete from public.poll_votes where game_id = p_game_id;
  delete from public.poll_text_entries where game_id = p_game_id;
  delete from public.poll_sessions where game_id = p_game_id;

  -- utwórz sesję per pytanie
  insert into public.poll_sessions (game_id, question_id, question_ord, is_open, created_at, closed_at)
  select q.game_id, q.id, q.ord, true, now(), null
  from public.questions q
  where q.game_id = p_game_id;

end $function$


CREATE OR REPLACE FUNCTION public.poll_points_close_and_normalize(p_game_id uuid, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g record;
begin
  select id, share_key_poll, type, status
    into g
  from public.games
  where id = p_game_id and share_key_poll = p_key;

  if not found then raise exception 'bad key or game'; end if;
  if g.type <> 'poll_points' then raise exception 'wrong type'; end if;
  if g.status <> 'poll_open' then raise exception 'poll is not open'; end if;

  -- policz głosy z ostatniej sesji per pytanie i ustaw fixed_points w answers
  with last_sess as (
    select distinct on (ps.question_id)
      ps.question_id, ps.id as poll_session_id
    from public.poll_sessions ps
    where ps.game_id = p_game_id
    order by ps.question_id, ps.created_at desc
  ),
  a as (
    select q.id as question_id, an.id as answer_id, an.ord as aord
    from public.questions q
    join public.answers an on an.question_id = q.id
    where q.game_id = p_game_id
  ),
  c as (
    select
      a.question_id,
      a.answer_id,
      a.aord,
      coalesce(count(v.id), 0)::int as cnt
    from a
    left join last_sess ls on ls.question_id = a.question_id
    left join public.poll_votes v
      on v.poll_session_id = ls.poll_session_id
     and v.answer_id = a.answer_id
    group by a.question_id, a.answer_id, a.aord
  ),
  c_fixed as (
    select question_id, answer_id, aord,
      case when cnt = 0 then 1 else cnt end as cnt1
    from c
  ),
  tot as (
    select question_id, sum(cnt1)::int as total
    from c_fixed
    group by question_id
  ),
  raw as (
    select
      cf.question_id,
      cf.answer_id,
      cf.aord,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) as raw_p,
      floor(100.0 * cf.cnt1 / nullif(t.total, 0))::int as base_floor,
      (100.0 * cf.cnt1 / nullif(t.total, 0)) - floor(100.0 * cf.cnt1 / nullif(t.total, 0)) as frac
    from c_fixed cf
    join tot t on t.question_id = cf.question_id
  ),
  base as (
    select question_id, answer_id, aord,
      greatest(1, base_floor) as p0,
      frac
    from raw
  ),
  sum_base as (
    select question_id, sum(p0)::int as s0
    from base
    group by question_id
  ),
  need as (
    select b.*, (100 - sb.s0)::int as diff
    from base b
    join sum_base sb on sb.question_id = b.question_id
  ),
  ranked_plus as (
    select n.*,
      row_number() over (partition by question_id order by frac desc, aord asc) as rn_plus
    from need n
  ),
  ranked_minus as (
    select n.*,
      row_number() over (partition by question_id order by p0 desc, frac asc, aord desc) as rn_minus
    from need n
    where p0 > 1
  ),
  final as (
    select
      n.question_id,
      n.answer_id,
      case
        when n.diff > 0 then n.p0 + case when rp.rn_plus <= n.diff then 1 else 0 end
        when n.diff < 0 then n.p0 - case when rm.rn_minus is not null and rm.rn_minus <= abs(n.diff) then 1 else 0 end
        else n.p0
      end as p_final
    from need n
    left join ranked_plus rp on rp.question_id = n.question_id and rp.answer_id = n.answer_id
    left join ranked_minus rm on rm.question_id = n.question_id and rm.answer_id = n.answer_id
  )
  update public.answers aup
  set fixed_points = f.p_final
  from final f
  where aup.id = f.answer_id;

  update public.poll_sessions
  set is_open = false, closed_at = now()
  where game_id = p_game_id and is_open = true;

  update public.games
  set status = 'ready', poll_closed_at = now()
  where id = p_game_id;
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_points_vote(p_game_id uuid, p_key text, p_question_id uuid, p_answer_id uuid, p_voter_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g public.games%rowtype;
  s_id uuid;
begin
  select * into g
  from public.games
  where id = p_game_id;

  if not found then
    raise exception 'Game not found';
  end if;

  if g.share_key_poll <> p_key then
    raise exception 'Invalid poll key';
  end if;

  if g.type <> 'poll_points'::game_type then
    raise exception 'Wrong game type';
  end if;

  if g.status <> 'poll_open'::game_status then
    raise exception 'Poll is not open';
  end if;

  select ps.id into s_id
  from public.poll_sessions ps
  where ps.game_id = p_game_id
    and ps.question_id = p_question_id
    and ps.is_open = true
  order by ps.created_at desc
  limit 1;

  if s_id is null then
    raise exception 'No open session';
  end if;

  insert into public.poll_votes (game_id, poll_session_id, question_id, answer_id, voter_token, question_ord, answer_ord)
  select
    p_game_id,
    s_id,
    q.id,
    a.id,
    p_voter_token,
    q.ord,
    a.ord
  from public.questions q
  join public.answers a on a.question_id = q.id
  where q.id = p_question_id
    and q.game_id = p_game_id
    and a.id = p_answer_id;

  if not found then
    raise exception 'Invalid question/answer';
  end if;
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_points_vote_batch(p_game_id uuid, p_key text, p_voter_token text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  it jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for it in
    select * from jsonb_array_elements(p_items)
  loop
    perform public.poll_points_vote(
      p_game_id      => p_game_id,
      p_key          => p_key,
      p_question_id  => (it->>'question_id')::uuid,
      p_answer_id    => (it->>'answer_id')::uuid,
      p_voter_token  => p_voter_token
    );
  end loop;
end;
$function$


CREATE OR REPLACE FUNCTION public.poll_points_vote_batch_owner(p_game_id uuid, p_items jsonb, p_voter_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from games
  where id = p_game_id;

  if v_owner is null then
    raise exception 'Game not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_owner then
    raise exception 'Not owner';
  end if;

  insert into poll_votes (
    game_id,
    poll_session_id,
    question_id,
    answer_id,
    voter_token,
    question_ord,
    answer_ord
  )
  select
    p_game_id,
    (x->>'poll_session_id')::uuid,
    (x->>'question_id')::uuid,
    (x->>'answer_id')::uuid,
    p_voter_token,
    coalesce((x->>'question_ord')::int, 1),
    coalesce((x->>'answer_ord')::int, 1)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;

  return true;
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_results(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  gid uuid;
  out jsonb;
begin
  select g.id into gid
  from public.games g
  where g.share_key_control = p_key
     or g.share_key_host = p_key
  limit 1;

  if gid is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_key');
  end if;

  select jsonb_build_object(
    'ok', true,
    'game_id', gid,
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'question_ord', pv.question_ord,
          'answers', (
            select jsonb_agg(
              jsonb_build_object(
                'answer_ord', x.answer_ord,
                'count', x.cnt
              ) order by x.cnt desc, x.answer_ord asc
            )
            from (
              select answer_ord, count(*) cnt
              from public.poll_votes
              where game_id = gid and question_ord = pv.question_ord
              group by answer_ord
            ) x
          )
        ) order by pv.question_ord
      )
      from (select distinct question_ord from public.poll_votes where game_id = gid) pv
    ), '[]'::jsonb)
  ) into out;

  return out;
end $function$
CREATE OR REPLACE FUNCTION public.poll_task_decline(p_token uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  select status into v_status
  from public.poll_tasks
  where token = p_token
  limit 1;

  if v_status is null then
    return 'not_found';
  end if;

  if v_status in ('done','declined','cancelled') then
    return 'already_used';
  end if;

  update public.poll_tasks
  set status='declined',
      declined_at=now()
  where token=p_token and status in ('pending','opened');

  return 'ok';
end $function$
CREATE OR REPLACE FUNCTION public.poll_task_done(p_token uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  select status into v_status
  from public.poll_tasks
  where token = p_token
  limit 1;

  if v_status is null then
    return 'not_found';
  end if;

  if v_status in ('done','declined','cancelled') then
    return 'already_used';
  end if;

  update public.poll_tasks
  set status='done',
      done_at=now()
  where token=p_token and status in ('pending','opened');

  return 'ok';
end $function$
CREATE OR REPLACE FUNCTION public.poll_task_opened(p_token uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  select status into v_status
  from public.poll_tasks
  where token = p_token
  limit 1;

  if v_status is null then
    return 'not_found';
  end if;

  if v_status <> 'pending' then
    return 'already_used_or_not_pending';
  end if;

  update public.poll_tasks
  set status='opened',
      opened_at=now()
  where token=p_token and status='pending';

  return 'ok';
end $function$
CREATE OR REPLACE FUNCTION public.poll_task_send(p_game_id uuid, p_poll_type text, p_recipients text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_key text;
  v_skipped int := 0;

  r text;
  v_rec text;
  v_user_id uuid;
  v_email text;
  v_username text;
  v_token uuid;

  j_email jsonb := '[]'::jsonb;
  j_onsite jsonb := '[]'::jsonb;
begin
  -- key z gry
  select g.share_key_poll into v_key
  from public.games g
  where g.id = p_game_id
  limit 1;

  if v_key is null then
    return jsonb_build_object('ok', false, 'error', 'game not found');
  end if;

  if p_poll_type not in ('poll_text','poll_points') then
    return jsonb_build_object('ok', false, 'error', 'bad poll_type');
  end if;

  foreach r in array coalesce(p_recipients, array[]::text[]) loop
    v_rec := lower(trim(coalesce(r,'')));
    if v_rec = '' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_user_id := null;
    v_email := null;
    v_username := null;

    -- username
    select id, email, username into v_user_id, v_email, v_username
    from public.profiles
    where lower(username) = v_rec
    limit 1;

    -- email
    if v_user_id is null then
      select id, email, username into v_user_id, v_email, v_username
      from public.profiles
      where lower(email) = v_rec
      limit 1;
    end if;

    if v_email is null then
      v_email := v_rec;
    end if;

    -- dedupe: już istnieje task do tej gry/poll_type dla user/email w statusach aktywnych
    if exists (
      select 1
      from public.poll_tasks t
      where t.game_id = p_game_id
        and t.poll_type = p_poll_type
        and t.owner_id = auth.uid()
        and (
          (v_user_id is not null and t.recipient_user_id = v_user_id)
          or (t.recipient_email is not null and lower(t.recipient_email) = v_email)
        )
        and t.status in ('pending','opened','done')
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.poll_tasks(
      owner_id, recipient_user_id, recipient_email,
      game_id, poll_type, share_key_poll, status
    )
    values(
      auth.uid(), v_user_id, v_email,
      p_game_id, p_poll_type, v_key, 'pending'
    )
    returning token into v_token;

    if v_user_id is not null then
      j_onsite := j_onsite || jsonb_build_array(
        jsonb_build_object(
          'user_id', v_user_id,
          'email', v_email,
          'username', v_username,
          'token', v_token
        )
      );
    else
      j_email := j_email || jsonb_build_array(
        jsonb_build_object(
          'email', v_email,
          'token', v_token
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'email', j_email,
    'onsite', j_onsite,
    'skipped', v_skipped
  );
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_text_close_apply(p_game_id uuid, p_key text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g record;
  q record;
  item jsonb;
  ans jsonb;
  i int;
  atext text;
  apts int;
begin
  select id, share_key_poll, type, status
    into g
  from public.games
  where id = p_game_id and share_key_poll = p_key;

  if not found then raise exception 'bad key or game'; end if;
  if g.type <> 'poll_text' then raise exception 'wrong type'; end if;
  if g.status <> 'poll_open' then raise exception 'poll is not open'; end if;

  -- payload format:
  -- { items: [ { question_id: ..., answers: [ { text:..., points: 12 }, ... ] } ] }

  for item in
    select jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb))
  loop
    -- wyciągamy question_id
    for q in
      select q2.*
      from public.questions q2
      where q2.id = (item->>'question_id')::uuid
        and q2.game_id = p_game_id
    loop
      -- czyścimy stare answers (jeśli były)
      delete from public.answers where question_id = q.id;

      i := 0;
      for ans in
        select jsonb_array_elements(coalesce(item->'answers','[]'::jsonb))
      loop
        i := i + 1;
        exit when i > 6;

        atext := coalesce(ans->>'text','');
        atext := regexp_replace(atext, '^\s+|\s+$', '', 'g');
        if char_length(atext) < 1 then
          atext := ('ODP '||i::text);
        end if;
        if char_length(atext) > 17 then
          atext := left(atext,17);
        end if;

        apts := coalesce((ans->>'points')::int, 0);
        if apts < 0 then apts := 0; end if;
        if apts > 100 then apts := 100; end if;

        insert into public.answers(question_id, ord, text, fixed_points)
        values (q.id, i, atext, apts);
      end loop;
    end loop;
  end loop;

  update public.poll_sessions
  set is_open = false, closed_at = now()
  where game_id = p_game_id and is_open = true;

  update public.games
  set status = 'ready', poll_closed_at = now()
  where id = p_game_id;
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_text_submit(p_game_id uuid, p_key text, p_question_id uuid, p_voter_token text, p_answer_raw text, p_answer_norm text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g public.games%rowtype;
  s_id uuid;
begin
  select * into g
  from public.games
  where id = p_game_id;

  if not found then
    raise exception 'Game not found';
  end if;

  if g.share_key_poll <> p_key then
    raise exception 'Invalid poll key';
  end if;

  if g.type <> 'poll_text'::game_type then
    raise exception 'Wrong game type';
  end if;

  if g.status <> 'poll_open'::game_status then
    raise exception 'Poll is not open';
  end if;

  select ps.id into s_id
  from public.poll_sessions ps
  where ps.game_id = p_game_id
    and ps.question_id = p_question_id
    and ps.is_open = true
  order by ps.created_at desc
  limit 1;

  if s_id is null then
    raise exception 'No open session';
  end if;

  insert into public.poll_text_entries (game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
  values (p_game_id, s_id, p_question_id, p_voter_token, p_answer_raw, p_answer_norm);
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_text_submit_batch(p_game_id uuid, p_key text, p_voter_token text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  it jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for it in
    select * from jsonb_array_elements(p_items)
  loop
    perform public.poll_text_submit(
      p_game_id      => p_game_id,
      p_key          => p_key,
      p_question_id  => (it->>'question_id')::uuid,
      p_voter_token  => p_voter_token,
      p_answer_raw   => it->>'answer_raw',
      p_answer_norm  => it->>'answer_norm'
    );
  end loop;
end;
$function$


CREATE OR REPLACE FUNCTION public.poll_text_submit_batch_owner(p_game_id uuid, p_items jsonb, p_voter_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from games
  where id = p_game_id;

  if v_owner is null then
    raise exception 'Game not found';
  end if;

  if auth.uid() is null or auth.uid() <> v_owner then
    raise exception 'Not owner';
  end if;

  -- opcjonalnie: wymagaj poll_open
  -- if (select status from games where id=p_game_id) <> 'poll_open' then
  --   raise exception 'Game not open';
  -- end if;

  insert into poll_text_entries (
    game_id,
    poll_session_id,
    question_id,
    voter_token,
    answer_raw,
    answer_norm
  )
  select
    p_game_id,
    (x->>'poll_session_id')::uuid,
    (x->>'question_id')::uuid,
    p_voter_token,
    coalesce(x->>'answer_raw',''),
    coalesce(x->>'answer_norm','')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x;

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.poll_text_submit_simple_legacy(p_game_id uuid, p_key text, p_question_id uuid, p_voter_token text, p_answer_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g record;
  sid uuid;
  raw text;
  norm text;
begin
  select id, share_key_poll, type, status
    into g
  from public.games
  where id = p_game_id;

  if not found then raise exception 'game not found'; end if;
  if g.share_key_poll is distinct from p_key then raise exception 'bad key'; end if;
  if g.type <> 'poll_text' then raise exception 'wrong type'; end if;
  if g.status <> 'poll_open' then raise exception 'poll closed'; end if;

  raw := coalesce(p_answer_text, '');
  raw := regexp_replace(raw, '^\s+|\s+$', '', 'g'); -- trim
  if char_length(raw) < 1 then raise exception 'empty'; end if;

  norm := lower(raw); -- ignorujemy wielkość liter
  -- spacje w środku zostają (Twoja zasada)

  select id into sid
  from public.poll_sessions
  where game_id = p_game_id and question_id = p_question_id and is_open = true
  order by created_at desc
  limit 1;

  if sid is null then raise exception 'poll closed'; end if;

  insert into public.poll_text_entries(game_id, poll_session_id, question_id, voter_token, answer_raw, answer_norm)
  values (p_game_id, sid, p_question_id, p_voter_token, raw, norm)
  on conflict (poll_session_id, question_id, voter_token)
  do update set
    answer_raw = excluded.answer_raw,
    answer_norm = excluded.answer_norm,
    created_at = now();
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_vote(p_key text, p_question_ord integer, p_answer_ord integer, p_voter_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  gid uuid;
  gtype public.game_type;
  gst public.game_status;
begin
  select g.id, g.type, g.status
  into gid, gtype, gst
  from public.games g
  where g.share_key_poll = p_key
  limit 1;

  if gid is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_key');
  end if;

  if gtype = 'prepared' then
    return jsonb_build_object('ok', false, 'reason', 'no_poll');
  end if;

  if gst <> 'poll_open' then
    return jsonb_build_object('ok', false, 'reason', 'poll_closed');
  end if;

  insert into public.poll_votes(game_id, question_ord, answer_ord, voter_token)
  values (gid, p_question_ord, p_answer_ord, p_voter_token)
  on conflict (game_id, question_ord, voter_token)
  do update set
    answer_ord = excluded.answer_ord,
    created_at = now();

  return jsonb_build_object('ok', true);
end $function$
CREATE OR REPLACE FUNCTION public.poll_vote_by_ids_legacy(p_game_id uuid, p_key text, p_question_id uuid, p_answer_id uuid, p_voter_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g record;
  sid uuid;
begin
  select id, share_key_poll, kind, status
    into g
  from public.games
  where id = p_game_id;

  if not found then raise exception 'game not found'; end if;
  if g.share_key_poll is distinct from p_key then raise exception 'bad key'; end if;
  if g.kind <> 'poll' then raise exception 'not a poll game'; end if;
  if g.status <> 'poll_open' then raise exception 'poll closed'; end if;

  -- znajdź otwartą sesję dla pytania
  select id into sid
  from public.poll_sessions
  where game_id = p_game_id and question_id = p_question_id and is_open = true
  order by created_at desc
  limit 1;

  if sid is null then
    raise exception 'poll closed';
  end if;

  -- blokada: jeden głos per pytanie per token w tej sesji
  if exists (
    select 1 from public.poll_votes
    where poll_session_id = sid and voter_token = p_voter_token
  ) then
    return; -- już głosował, nic nie rób (UX: przejdzie dalej)
  end if;

  insert into public.poll_votes(game_id, question_id, answer_id, voter_token, poll_session_id)
  values (p_game_id, p_question_id, p_answer_id, p_voter_token, sid);
end;
$function$
CREATE OR REPLACE FUNCTION public.poll_vote_game(p_game_id uuid, p_key text, p_question_id uuid, p_answer_id uuid, p_voter_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g public.games;
  sess public.poll_sessions;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'not found'; end if;
  if g.share_key_poll <> p_key then raise exception 'forbidden'; end if;
  if g.status <> 'poll_open' then raise exception 'poll closed'; end if;

  -- aktywna sesja per pytanie (poll_sessions już masz)
  select * into sess
  from public.poll_sessions
  where game_id = p_game_id and question_id = p_question_id and is_open = true
  order by created_at desc
  limit 1;

  if not found then
    insert into public.poll_sessions(game_id, question_id, is_open)
    values (p_game_id, p_question_id, true)
    returning * into sess;
  end if;

  insert into public.poll_votes(poll_session_id, voter_token, answer_id)
  values (sess.id, p_voter_token, p_answer_id)
  on conflict (poll_session_id, voter_token)
  do update set answer_id = excluded.answer_id;
end $function$
CREATE OR REPLACE FUNCTION public.poll_vote_points(p_game_id uuid, p_key text, p_question_id uuid, p_answer_id uuid, p_voter_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  g record;
  sid uuid;
begin
  select id, share_key_poll, type, status
    into g
  from public.games
  where id = p_game_id;

  if not found then raise exception 'game not found'; end if;
  if g.share_key_poll is distinct from p_key then raise exception 'bad key'; end if;
  if g.type <> 'poll_points' then raise exception 'wrong type'; end if;
  if g.status <> 'poll_open' then raise exception 'poll closed'; end if;

  select id into sid
  from public.poll_sessions
  where game_id = p_game_id and question_id = p_question_id and is_open = true
  order by created_at desc
  limit 1;

  if sid is null then raise exception 'poll closed'; end if;

  insert into public.poll_votes(game_id, poll_session_id, question_id, answer_id, voter_token)
  values (p_game_id, sid, p_question_id, p_answer_id, p_voter_token)
  on conflict (poll_session_id, question_id, voter_token)
  do update set
    answer_id = excluded.answer_id,
    created_at = now();
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_badge_get()
 RETURNS TABLE(has_new boolean, tasks_pending integer, subs_pending integer, polls_open integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ov as (
    select public.polls_hub_overview() as j
  )
  select
    (
      coalesce((j->>'tasks_todo')::int, 0) > 0
      or coalesce((j->>'subs_mine_pending')::int, 0) > 0
      or coalesce((j->>'subs_their_pending')::int, 0) > 0
    ) as has_new,
    coalesce((j->>'tasks_todo')::int, 0) as tasks_pending,
    (coalesce((j->>'subs_mine_pending')::int, 0) + coalesce((j->>'subs_their_pending')::int, 0)) as subs_pending,
    coalesce((j->>'polls_open')::int, 0) as polls_open
  from ov;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_gc(p_days integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
with
  del_subs as (
    delete from poll_subscriptions
    where owner_id = auth.uid()
      and status in ('pending','declined','cancelled')
      and created_at < now() - (p_days || ' days')::interval
    returning 1
  ),
  del_tasks as (
    delete from poll_tasks
    where (owner_id = auth.uid() or recipient_user_id = auth.uid())
      and status in ('done','declined','cancelled')
      and coalesce(done_at, declined_at, cancelled_at, created_at) < now() - (p_days || ' days')::interval
    returning 1
  )
select jsonb_build_object(
  'ok', true,
  'subs_deleted', (select count(*) from del_subs),
  'tasks_deleted', (select count(*) from del_tasks)
);
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_list_my_subscribers()
 RETURNS TABLE(sub_id uuid, subscriber_user_id uuid, subscriber_email text, subscriber_label text, status text, created_at timestamp with time zone, token uuid, email_sent_at timestamp with time zone, email_send_count integer, is_expired boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select
    s.id,
    s.subscriber_user_id,
    s.subscriber_email,
    case
      when s.subscriber_user_id is not null then coalesce(p.username, p.email, '—')
      else coalesce(s.subscriber_email, '—')
    end as subscriber_label,
    s.status,
    s.created_at,
    s.token,
    s.email_sent_at,
    s.email_send_count,
    (s.status in ('pending','declined','cancelled') and s.created_at < now() - interval '5 days') as is_expired
  from public.poll_subscriptions s
  left join public.profiles p on p.id = s.subscriber_user_id
  where s.owner_id = auth.uid()
  order by s.created_at desc;
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_list_my_subscriptions()
 RETURNS TABLE(sub_id uuid, owner_id uuid, owner_label text, status text, created_at timestamp with time zone, token uuid, go_url text, is_expired boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.poll_claim_email_records();

  return query
  select
    s.id,
    s.owner_id,
    coalesce(p.username, p.email, '—') as owner_label,
    s.status,
    s.created_at,
    s.token,
    ('poll_go.html?s=' || s.token::text)::text as go_url,
    (s.status = 'pending' and s.created_at < now() - interval '5 days') as is_expired
  from public.poll_subscriptions s
  left join public.profiles p on p.id = s.owner_id
  where s.subscriber_user_id = auth.uid()
  order by s.created_at desc;
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_list_open_polls()
 RETURNS TABLE(game_id uuid, game_name text, poll_type text, status text, updated_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select null::uuid, null::text, null::text, null::text, null::timestamptz where false
$function$


CREATE OR REPLACE FUNCTION public.polls_hub_list_polls()
 RETURNS TABLE(game_id uuid, name text, poll_type game_type, created_at timestamp with time zone, poll_state text, sessions_total integer, open_questions integer, closed_questions integer, tasks_active integer, tasks_done integer, recipients_preview text[], share_key_poll text, share_kind text, anon_votes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  with my_polls as (
    select g.id, g.name, g.type, g.created_at, g.share_key_poll, g.status
    from public.games g
    where g.owner_id = auth.uid()
      and g.type in ('poll_text'::public.game_type, 'poll_points'::public.game_type)
  ),
  sess as (
    select
      ps.game_id,
      count(ps.id)::int as sessions_total,
      count(ps.id) filter (where ps.is_open = true and ps.closed_at is null)::int as open_questions,
      count(ps.id) filter (where ps.closed_at is not null)::int as closed_questions
    from public.poll_sessions ps
    group by ps.game_id
  ),
  tasks as (
    select
      pt.game_id,
      count(*) filter (where pt.status in ('pending','opened'))::int as tasks_active,
      count(*) filter (where pt.status = 'done')::int as tasks_done
    from public.poll_tasks pt
    where pt.owner_id = auth.uid()
    group by pt.game_id
  ),
  recipients as (
    select
      pt.game_id,
      (
        array_agg(
          coalesce(p.username, pt.recipient_email, '—')
          order by pt.created_at desc
        )
        filter (where pt.status in ('pending','opened'))
      )[1:6] as recipients_preview
    from public.poll_tasks pt
    left join public.profiles p on p.id = pt.recipient_user_id
    where pt.owner_id = auth.uid()
    group by pt.game_id
  )
  select
    mp.id as game_id,
    mp.name,
    mp.type as poll_type,
    mp.created_at,
    case
      when mp.status = 'poll_open' then 'open'
      when coalesce(s.sessions_total, 0) > 0 then 'closed'
      else 'draft'
    end as poll_state,
    coalesce(s.sessions_total, 0) as sessions_total,
    coalesce(s.open_questions, 0) as open_questions,
    coalesce(s.closed_questions, 0) as closed_questions,
    coalesce(t.tasks_active, 0) as tasks_active,
    coalesce(t.tasks_done, 0) as tasks_done,
    coalesce(r.recipients_preview, array[]::text[]) as recipients_preview,
    mp.share_key_poll,
    case
      when mp.status = 'poll_open' and coalesce(t.tasks_active,0) > 0 then 'mixed'
      when coalesce(t.tasks_active,0) > 0 then 'subs'
      else 'anon'
    end as share_kind,
    case
      when mp.type = 'poll_points'::public.game_type then (
        select count(*)::int
        from public.poll_votes v
        where v.game_id = mp.id and v.voter_user_id is null
      )
      else (
        select count(*)::int
        from public.poll_text_entries e
        where e.game_id = mp.id and e.voter_user_id is null
      )
    end as anon_votes
  from my_polls mp
  left join sess s on s.game_id = mp.id
  left join tasks t on t.game_id = mp.id
  left join recipients r on r.game_id = mp.id
  order by mp.created_at desc;
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_list_tasks()
 RETURNS TABLE(task_id uuid, game_id uuid, game_name text, poll_type text, status text, created_at timestamp with time zone, done_at timestamp with time zone, declined_at timestamp with time zone, cancelled_at timestamp with time zone, is_archived boolean, go_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.poll_claim_email_records();

  return query
  select
    t.id,
    t.game_id,
    coalesce(g.name, ('Sondaż ' || left(t.game_id::text, 8))::text) as game_name,
    t.poll_type,
    case
      when t.done_at is not null then 'done'
      when t.declined_at is not null then 'declined'
      when t.cancelled_at is not null then 'cancelled'
      else 'pending'
    end as status,
    t.created_at,
    t.done_at,
    t.declined_at,
    t.cancelled_at,
    (coalesce(t.done_at, t.declined_at, t.cancelled_at) < now() - interval '5 days') as is_archived,
    ('poll_go.html?t=' || t.token::text)::text
  from public.poll_tasks t
  left join public.games g on g.id = t.game_id
  where t.recipient_user_id = auth.uid()
  order by t.created_at desc;
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_overview()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_tasks_todo int;
  v_subs_mine_pending int;
  v_subs_their_pending int;
begin
  perform public.poll_claim_email_records();

  select count(*) into v_tasks_todo
  from public.poll_tasks t
  where t.recipient_user_id = auth.uid()
    and t.done_at is null
    and t.declined_at is null
    and t.cancelled_at is null;

  select count(*) into v_subs_mine_pending
  from public.poll_subscriptions s
  where s.subscriber_user_id = auth.uid()
    and s.status = 'pending'
    and s.cancelled_at is null
    and s.declined_at is null;

  select count(*) into v_subs_their_pending
  from public.poll_subscriptions s
  where s.owner_id = auth.uid()
    and s.status = 'pending'
    and s.cancelled_at is null
    and s.declined_at is null;

  return json_build_object(
    'polls_open', 0,
    'tasks_todo', coalesce(v_tasks_todo,0),
    'subs_mine_pending', coalesce(v_subs_mine_pending,0),
    'subs_their_pending', coalesce(v_subs_their_pending,0)
  );
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_share_poll(p_game_id uuid, p_sub_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_poll_type text;
  v_share_key text;
  v_created int := 0;
  v_cancelled int := 0;
  v_kept int := 0;
  v_mail jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  -- tylko właściciel gry
  select g.type::text, g.share_key_poll
    into v_poll_type, v_share_key
  from public.games g
  where g.id = p_game_id and g.owner_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'game not found');
  end if;

  if v_poll_type not in ('poll_text','poll_points') then
    return jsonb_build_object('ok', false, 'error', 'not a poll game');
  end if;

  -- 1) anuluj aktywne zadania dla osób, których nie ma już w wyborze
  update public.poll_tasks t
  set status = 'cancelled',
      cancelled_at = now()
  where t.owner_id = v_uid
    and t.game_id = p_game_id
    and t.status in ('pending','opened')
    and (
      (t.recipient_user_id is not null and not exists (
        select 1
        from public.poll_subscriptions s
        where s.id = any(coalesce(p_sub_ids, array[]::uuid[]))
          and s.owner_id = v_uid
          and s.status = 'active'
          and s.subscriber_user_id = t.recipient_user_id
      ))
      or
      (t.recipient_user_id is null and t.recipient_email is not null and not exists (
        select 1
        from public.poll_subscriptions s
        where s.id = any(coalesce(p_sub_ids, array[]::uuid[]))
          and s.owner_id = v_uid
          and s.status = 'active'
          and s.subscriber_email is not null
          and lower(s.subscriber_email) = lower(t.recipient_email)
      ))
    );

  get diagnostics v_cancelled = row_count;

  -- 2) utwórz brakujące zadania dla wybranych subów
  with sel as (
    select
      s.id as sub_id,
      s.subscriber_user_id,
      lower(s.subscriber_email) as subscriber_email
    from public.poll_subscriptions s
    where s.owner_id = v_uid
      and s.status = 'active'
      and s.id = any(coalesce(p_sub_ids, array[]::uuid[]))
  ),
  existing as (
    select
      sel.sub_id,
      t.id as task_id
    from sel
    left join public.poll_tasks t
      on t.owner_id = v_uid
     and t.game_id = p_game_id
     and t.status in ('pending','opened','done')
     and (
        (sel.subscriber_user_id is not null and t.recipient_user_id = sel.subscriber_user_id)
        or
        (sel.subscriber_user_id is null and sel.subscriber_email is not null and lower(t.recipient_email) = sel.subscriber_email)
     )
  ),
  ins as (
    insert into public.poll_tasks(
      owner_id, recipient_user_id, recipient_email,
      game_id, poll_type, share_key_poll, token, status, created_at
    )
    select
      v_uid,
      e.subscriber_user_id,
      e.subscriber_email,
      p_game_id,
      v_poll_type,
      v_share_key,
      gen_random_uuid(),
      'pending',
      now()
    from (
      select sel.*
      from sel
      join existing ex on ex.sub_id = sel.sub_id
      where ex.task_id is null
    ) e
    returning id, recipient_email, token
  )
  select
    (select count(*) from ins)::int,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'task_id', id,
          'to', recipient_email,
          'token', token,
          'link', ('poll_go.html?t=' || token::text)
        )
      ) filter (where recipient_email is not null),
      '[]'::jsonb
    )
  into v_created, v_mail
  from ins;

  v_kept := greatest(coalesce(array_length(p_sub_ids,1),0) - v_created, 0);

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'cancelled', v_cancelled,
    'kept', v_kept,
    'mail', v_mail
  );
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_share_poll_recipients_legacy(p_game_id uuid, p_recipients text[], p_allow_duplicates boolean DEFAULT false)
 RETURNS TABLE(ok boolean, created integer, skipped integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_poll_type text;
  v_share_key text;
  v_created int := 0;
  v_skipped int := 0;
  r text;
  v_email text;
  v_user_id uuid;
  v_exists boolean;
begin
  v_owner := auth.uid();
  if v_owner is null then
    return query select false, 0, 0, 'not_authenticated';
    return;
  end if;

  select g.type, g.share_key_poll
    into v_poll_type, v_share_key
  from public.games g
  where g.id = p_game_id and g.owner_id = v_owner;

  if v_poll_type is null then
    return query select false, 0, 0, 'game_not_found_or_not_owner';
    return;
  end if;

  if v_poll_type not in ('poll_text','poll_points') then
    return query select false, 0, 0, 'not_a_poll_game';
    return;
  end if;

  if v_share_key is null or length(v_share_key) < 6 then
    return query select false, 0, 0, 'missing_share_key_poll_on_game';
    return;
  end if;

  if p_recipients is null or array_length(p_recipients,1) is null then
    return query select false, 0, 0, 'no_recipients';
    return;
  end if;

  foreach r in array p_recipients loop
    r := btrim(r);
    if r is null or r = '' then continue; end if;

    v_email := null;
    v_user_id := null;

    if position('@' in r) > 1 then
      v_email := lower(r);
    else
      select p.id, p.email
        into v_user_id, v_email
      from public.profiles p
      where lower(p.username) = lower(r)
      limit 1;

      if v_user_id is null and (v_email is null or v_email = '') then
        v_skipped := v_skipped + 1;
        continue;
      end if;
    end if;

    if not p_allow_duplicates then
      select exists (
        select 1
        from public.poll_tasks pt
        where pt.owner_id = v_owner
          and pt.game_id = p_game_id
          and pt.status in ('pending','opened')
          and (
            (v_user_id is not null and pt.recipient_user_id = v_user_id)
            or (v_user_id is null and pt.recipient_user_id is null and pt.recipient_email = v_email)
          )
      ) into v_exists;

      if v_exists then
        v_skipped := v_skipped + 1;
        continue;
      end if;
    end if;

    insert into public.poll_tasks (
      owner_id,
      recipient_user_id,
      recipient_email,
      game_id,
      poll_type,
      share_key_poll,
      token,
      status,
      created_at
    ) values (
      v_owner,
      v_user_id,
      v_email,
      p_game_id,
      v_poll_type,
      v_share_key,
      gen_random_uuid(),
      'pending',
      now()
    );

    v_created := v_created + 1;
  end loop;

  return query select true, v_created, v_skipped, 'ok';
end $function$
CREATE OR REPLACE FUNCTION public.polls_hub_subscriber_remove(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_row public.poll_subscriptions%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  select * into v_row
  from public.poll_subscriptions
  where id = p_id
    and owner_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found');
  end if;

  update public.poll_subscriptions
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'action', 'cancelled', 'id', p_id);
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_subscriber_resend(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sub public.poll_subscriptions%rowtype;
  v_to text;
  v_link text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  select * into v_sub
  from public.poll_subscriptions
  where id = p_id
    and owner_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found');
  end if;

  if v_sub.subscriber_email is null then
    return jsonb_build_object('ok', false, 'error', 'no email for this subscriber');
  end if;

  if v_sub.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'only pending can be resent');
  end if;

  v_to := lower(v_sub.subscriber_email);
  v_link := ('poll_go.html?s=' || v_sub.token::text)::text;

  update public.poll_subscriptions
  set email_sent_at = now(),
      email_send_count = email_send_count + 1
  where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'to', v_to,
    'kind', 'sub_invite',
    'link', v_link,
    'token', v_sub.token
  );
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_subscription_accept(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth required'); end if;

  update public.poll_subscriptions
  set status = 'active',
      accepted_at = now()
  where id = p_id
    and subscriber_user_id = v_uid
    and status = 'pending';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found or not pending');
  end if;

  return jsonb_build_object('ok', true, 'action', 'accepted', 'id', p_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.polls_hub_subscription_cancel(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth required'); end if;

  update public.poll_subscriptions
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_id
    and subscriber_user_id = v_uid
    and status in ('active','pending');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found or not active/pending');
  end if;

  return jsonb_build_object('ok', true, 'action', 'cancelled', 'id', p_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.polls_hub_subscription_invite(p_recipient text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rec text := lower(trim(coalesce(p_recipient,'')));
  v_user_id uuid;
  v_email text;
  v_token uuid;
  v_id uuid;
begin
  if v_rec = '' then
    return jsonb_build_object('ok', false, 'error', 'empty recipient');
  end if;

  -- 1) spróbuj po username
  select id, email into v_user_id, v_email
  from public.profiles
  where lower(username) = v_rec
  limit 1;

  -- 2) jeśli nie znaleziono po username, spróbuj po email
  if v_user_id is null then
    select id, email into v_user_id, v_email
    from public.profiles
    where lower(email) = v_rec
    limit 1;
  end if;

  -- docelowy email do rekordu (z profilu albo wpisany)
  if v_email is null then
    v_email := v_rec;
  end if;

  -- jeśli już istnieje pending/active do tego odbiorcy (po user_id lub email), nie twórz duplikatu
  select ps.id, ps.token into v_id, v_token
  from public.poll_subscriptions ps
  where ps.owner_id = auth.uid()
    and (
      (v_user_id is not null and ps.subscriber_user_id = v_user_id)
      or (ps.subscriber_email is not null and lower(ps.subscriber_email) = v_email)
    )
    and ps.status in ('pending','active')
  limit 1;

  if v_id is not null then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'id', v_id,
      'token', v_token,
      'channel', case when v_user_id is not null then 'onsite' else 'email' end
    );
  end if;

  -- wstaw invite/subscription
  insert into public.poll_subscriptions (
    owner_id,
    subscriber_user_id,
    subscriber_email,
    status
  )
  values (
    auth.uid(),
    v_user_id,
    v_email,
    'pending'
  )
  returning id, token into v_id, v_token;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'id', v_id,
    'token', v_token,
    'channel', case when v_user_id is not null then 'onsite' else 'email' end,
    'email', v_email
  );
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_subscription_invite_a(p_handle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_h text := trim(coalesce(p_handle,''));
  v_is_email boolean := position('@' in v_h) > 1;
  v_profile public.profiles%rowtype;
  v_existing public.poll_subscriptions%rowtype;
  v_sub_id uuid;
  v_token uuid;
  v_to text;
  v_go text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  if v_h = '' then
    return jsonb_build_object('ok', false, 'error', 'empty handle');
  end if;

  -- resolve by username/email to profile (registered user)
  select * into v_profile
  from public.profiles p
  where lower(p.username) = lower(v_h)
     or lower(p.email) = lower(v_h)
  limit 1;

  -- find existing subscription row (avoid duplicates)
  if found then
    select * into v_existing
    from public.poll_subscriptions s
    where s.owner_id = v_uid
      and s.subscriber_user_id = v_profile.id
    order by s.created_at desc
    limit 1;
  else
    if not v_is_email then
      return jsonb_build_object('ok', false, 'error', 'unknown username (not registered)');
    end if;

    select * into v_existing
    from public.poll_subscriptions s
    where s.owner_id = v_uid
      and lower(s.subscriber_email) = lower(v_h)
    order by s.created_at desc
    limit 1;
  end if;

  if v_existing.id is not null and v_existing.status in ('pending','active') then
    v_token := v_existing.token;
    v_go := ('poll_go.html?s=' || v_token::text)::text;
    v_to := coalesce(v_profile.email, v_existing.subscriber_email);

    return jsonb_build_object(
      'ok', true,
      'already', true,
      'sub_id', v_existing.id,
      'status', v_existing.status,
      'token', v_token,
      'go_url', v_go,
      'to', v_to,
      'registered', (v_profile.id is not null)
    );
  end if;

  -- create new subscription invite
  v_token := gen_random_uuid();

  if v_profile.id is not null then
    insert into public.poll_subscriptions(owner_id, subscriber_user_id, subscriber_email, token, status, created_at)
    values (v_uid, v_profile.id, null, v_token, 'pending', now())
    returning id into v_sub_id;
    v_to := v_profile.email;
  else
    insert into public.poll_subscriptions(owner_id, subscriber_user_id, subscriber_email, token, status, created_at)
    values (v_uid, null, lower(v_h), v_token, 'pending', now())
    returning id into v_sub_id;
    v_to := lower(v_h);
  end if;

  v_go := ('poll_go.html?s=' || v_token::text)::text;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'sub_id', v_sub_id,
    'status', 'pending',
    'token', v_token,
    'go_url', v_go,
    'to', v_to,
    'registered', (v_profile.id is not null)
  );
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_hub_subscription_reject(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'auth required'); end if;

  update public.poll_subscriptions
  set status = 'declined',
      declined_at = now()
  where id = p_id
    and subscriber_user_id = v_uid
    and status = 'pending';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found or not pending');
  end if;

  return jsonb_build_object('ok', true, 'action', 'declined', 'id', p_id);
end;
$function$


CREATE OR REPLACE FUNCTION public.polls_hub_task_decline(p_task_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.poll_tasks t
     set declined_at = now()
   where t.id = p_task_id
     and t.recipient_user_id = auth.uid()
     and t.done_at is null
     and t.declined_at is null
     and t.cancelled_at is null;

  return found;
end;
$function$


CREATE OR REPLACE FUNCTION public.polls_hub_tasks_mark_emailed(p_task_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
declare v_n int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  update public.poll_tasks
  set email_sent_at = now(),
      email_send_count = email_send_count + 1
  where owner_id = v_uid
    and id = any(coalesce(p_task_ids, array[]::uuid[]))
    and recipient_email is not null;

  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$function$
CREATE OR REPLACE FUNCTION public.polls_sub_action(p_action text, p_token uuid DEFAULT NULL::uuid, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_action text := lower(trim(coalesce(p_action,'')));
  v_uid uuid := auth.uid();
  v_row public.poll_subscriptions%rowtype;
begin
  if v_action = '' then
    return jsonb_build_object('ok', false, 'error', 'empty action');
  end if;

  -- ========== recipient actions (token) ==========
  if v_action in ('accept','reject') then
    if p_token is null then
      return jsonb_build_object('ok', false, 'error', 'missing token');
    end if;

    select * into v_row
    from public.poll_subscriptions
    where token = p_token
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'token not found');
    end if;

    -- oznacz opened przy pierwszym wejściu
    update public.poll_subscriptions
       set opened_at = coalesce(opened_at, now())
     where id = v_row.id;

    if v_row.status <> 'pending' then
      return jsonb_build_object(
        'ok', true,
        'noop', true,
        'id', v_row.id,
        'token', v_row.token,
        'status', v_row.status
      );
    end if;

    if v_action = 'accept' then
      update public.poll_subscriptions
         set status = 'active',
             accepted_at = now(),
             declined_at = null,
             cancelled_at = null,
             subscriber_user_id = coalesce(subscriber_user_id, v_uid)
       where id = v_row.id;

      return jsonb_build_object(
        'ok', true,
        'action', 'accept',
        'id', v_row.id,
        'token', v_row.token,
        'status', 'active'
      );
    else
      update public.poll_subscriptions
         set status = 'declined',
             declined_at = now()
       where id = v_row.id;

      return jsonb_build_object(
        'ok', true,
        'action', 'reject',
        'id', v_row.id,
        'token', v_row.token,
        'status', 'declined'
      );
    end if;
  end if;

  -- ========== owner actions (id) ==========
  if v_action in ('cancel','remove') then
    if v_uid is null then
      return jsonb_build_object('ok', false, 'error', 'auth required');
    end if;

    if p_id is null then
      return jsonb_build_object('ok', false, 'error', 'missing id');
    end if;

    select * into v_row
    from public.poll_subscriptions
    where id = p_id
      and owner_id = v_uid
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'not found');
    end if;

    -- cancel/remove: soft-cancel (bez delete, mniej ryzyka)
    update public.poll_subscriptions
       set status = 'cancelled',
           cancelled_at = now()
     where id = v_row.id;

    return jsonb_build_object(
      'ok', true,
      'action', v_action,
      'id', v_row.id,
      'status', 'cancelled'
    );
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown action');
end;
$function$
CREATE OR REPLACE FUNCTION public.profile_login_to_email(p_login text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v text;
begin
  v := trim(coalesce(p_login, ''));
  if v = '' then
    return null;
  end if;

  -- jeśli to wygląda jak e-mail, zwracamy to bez DB
  if position('@' in v) > 0 then
    return lower(v);
  end if;

  -- w przeciwnym razie traktujemy jako username
  select lower(email) into v
  from public.profiles
  where lower(username) = lower(v)
  limit 1;

  return v; -- null jeśli nie znaleziono
end;
$function$
CREATE OR REPLACE FUNCTION public.profiles_username_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.username is distinct from old.username then
    raise exception 'username is immutable';
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.revoke_base_share(p_base_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_owner uuid;
begin
  select owner_id into v_owner
  from public.question_bases
  where id = p_base_id;

  if v_owner is null then
    return false;
  end if;

  if v_owner <> auth.uid() then
    return false;
  end if;

  delete from public.question_base_shares
  where base_id = p_base_id
    and user_id = p_user_id;

  return true;
exception
  when others then
    return false;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_device_state(p_game_id uuid, p_kind text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  g public.games%rowtype;
begin
  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;

  if auth.uid() is null or g.owner_id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  perform public.ensure_game_rows(p_game_id);

  if p_kind = 'display' then
    update public.game_devices
    set
      display_mode = coalesce(p_patch->>'display_mode', display_mode),
      display_scene = coalesce(p_patch->>'display_scene', display_scene),
      display_payload = coalesce(p_patch->'display_payload', display_payload)
    where game_id = p_game_id;

  elsif p_kind = 'host' then
    update public.game_devices
    set
      host_hidden = coalesce((p_patch->>'host_hidden')::boolean, host_hidden),
      host_text = coalesce(p_patch->>'host_text', host_text),
      host_hint = coalesce(p_patch->>'host_hint', host_hint)
    where game_id = p_game_id;

  elsif p_kind = 'buzzer' then
    update public.game_devices
    set
      buzzer_mode = coalesce(p_patch->>'buzzer_mode', buzzer_mode)
    where game_id = p_game_id;

  else
    raise exception 'bad kind';
  end if;

  return jsonb_build_object('ok', true);
end $function$


CREATE OR REPLACE FUNCTION public.set_owner_id_on_games_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  return new;
end
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.share_base_by_email(p_base_id uuid, p_email text, p_role base_share_role)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_owner uuid;
  v_user_id uuid;
begin
  -- baza istnieje i caller jest ownerem?
  select owner_id into v_owner
  from public.question_bases
  where id = p_base_id;

  if v_owner is null then
    return false;
  end if;

  if v_owner <> auth.uid() then
    return false;
  end if;

  -- znajdź usera po mailu (bez ujawniania wyniku na zewnątrz)
  select id into v_user_id
  from public.profiles
  where lower(email) = lower(p_email);

  if v_user_id is null then
    return false;
  end if;

  -- nie udostępniamy ownerowi
  if v_user_id = v_owner then
    return false;
  end if;

  insert into public.question_base_shares(base_id, user_id, role)
  values (p_base_id, v_user_id, p_role)
  on conflict (base_id, user_id)
  do update set role = excluded.role;

  return true;
exception
  when others then
    -- dowolny błąd = false (żadnych szczegółów)
    return false;
end;
$function$


CREATE OR REPLACE FUNCTION public.touch_game_devices_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.touch_game_runtime_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.touch_game_updated_at(p_game_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  update public.games
  set updated_at = now()
  where id = p_game_id;
$function$


CREATE OR REPLACE FUNCTION public.touch_state_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.state is distinct from old.state then
    new.state_at := now();
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.touch_user_flags_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$


CREATE OR REPLACE FUNCTION public.trg_touch_game_from_answers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_qid uuid;
  v_game_id uuid;
begin
  v_qid := coalesce(new.question_id, old.question_id);
  if v_qid is null then
    return coalesce(new, old);
  end if;

  select q.game_id into v_game_id
  from public.questions q
  where q.id = v_qid;

  if v_game_id is not null then
    perform public.touch_game_updated_at(v_game_id);
  end if;

  return coalesce(new, old);
end;
$function$


CREATE OR REPLACE FUNCTION public.trg_touch_game_from_questions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_game_id uuid;
begin
  v_game_id := coalesce(new.game_id, old.game_id);
  if v_game_id is not null then
    perform public.touch_game_updated_at(v_game_id);
  end if;
  return coalesce(new, old);
end;
$function$


CREATE OR REPLACE FUNCTION public.user_logo_clear_active()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.user_logos
  set is_active = false
  where user_id = v_uid and is_active = true;
end $function$


CREATE OR REPLACE FUNCTION public.user_logo_set_active(p_logo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- upewnij się, że logo należy do usera
  if not exists (
    select 1 from public.user_logos
    where id = p_logo_id and user_id = v_uid
  ) then
    raise exception 'Logo not found';
  end if;

  -- zdejmij aktywność ze wszystkich
  update public.user_logos
  set is_active = false
  where user_id = v_uid and is_active = true;

  -- ustaw jedno
  update public.user_logos
  set is_active = true
  where id = p_logo_id and user_id = v_uid;
end $function$
CREATE TRIGGER touch_game_from_answers AFTER INSERT OR DELETE OR UPDATE ON public.answers FOR EACH ROW EXECUTE FUNCTION trg_touch_game_from_answers();

CREATE TRIGGER trg_assert_game_answers_minmax BEFORE UPDATE OF status ON public.games FOR EACH ROW EXECUTE FUNCTION assert_game_answers_minmax();

CREATE TRIGGER trg_games_fill_share_keys BEFORE INSERT ON public.games FOR EACH ROW EXECUTE FUNCTION games_fill_share_keys();

CREATE TRIGGER trg_games_touch BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_profiles_username_immutable BEFORE UPDATE OF username ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_username_immutable();

CREATE TRIGGER trg_qb_categories_set_updated_at BEFORE UPDATE ON public.qb_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_qb_questions_set_updated_at BEFORE UPDATE ON public.qb_questions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER touch_game_from_questions AFTER INSERT OR DELETE OR UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION trg_touch_game_from_questions();

CREATE TRIGGER trg_touch_user_flags_updated_at BEFORE UPDATE ON public.user_flags FOR EACH ROW EXECUTE FUNCTION touch_user_flags_updated_at();

CREATE TRIGGER trg_user_logos_touch BEFORE UPDATE ON public.user_logos FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
