-- Isolated PostgreSQL fixture for migration 371. This is CI-only and does
-- not connect to the application database.
\set ON_ERROR_STOP on

DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_admin; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
CREATE TABLE public.games(id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES auth.users(id));
CREATE TABLE public.control_runtime_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  ended_at timestamptz, end_reason text
);
CREATE TABLE public.control_device_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.control_runtime_sessions(id),
  game_id uuid NOT NULL REFERENCES public.games(id), device_type text NOT NULL, token uuid NOT NULL UNIQUE
);
CREATE TABLE public.control_device_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.control_runtime_sessions(id),
  game_id uuid NOT NULL REFERENCES public.games(id), device_type text NOT NULL, token uuid NOT NULL UNIQUE, revoked_at timestamptz
);
CREATE FUNCTION public.control_device_key_valid(p_game_id uuid,p_device_type text,p_key text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.control_device_link_tokens t
    JOIN public.control_runtime_sessions s ON s.id=t.session_id
    WHERE t.game_id=p_game_id AND t.device_type=p_device_type AND t.token::text=p_key
      AND s.ended_at IS NULL AND s.expires_at>now())
  OR EXISTS(SELECT 1 FROM public.control_device_shares sh
    JOIN public.control_runtime_sessions s ON s.id=sh.session_id
    WHERE sh.game_id=p_game_id AND sh.device_type=p_device_type AND sh.token::text=p_key
      AND sh.revoked_at IS NULL AND s.ended_at IS NULL AND s.expires_at>now())
$$;
CREATE FUNCTION public.control_runtime_session_touch(p_game_id uuid,p_session_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s public.control_runtime_sessions;
BEGIN
  SELECT * INTO s FROM public.control_runtime_sessions WHERE game_id=p_game_id AND ended_at IS NULL AND expires_at>now();
  IF NOT FOUND THEN
    INSERT INTO public.control_runtime_sessions(game_id,owner_id) VALUES(p_game_id,auth.uid()) RETURNING * INTO s;
  END IF;
  RETURN jsonb_build_object('ok',true,'session_id',s.id,'expires_at',s.expires_at,'expired',false);
END $$;

\ir ../../supabase/migrations/2026-10-15_371_control2_device_leases.sql

INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.games VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001');
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id,device_protocol) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',2),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',1);
INSERT INTO public.control_device_link_tokens(session_id,game_id,device_type,token) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','display','30000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','buzzer','30000000-0000-0000-0000-000000000002'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','display','30000000-0000-0000-0000-000000000003');
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000001',false);

CREATE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion: %',message; END IF; END $$;

SELECT pg_temp.assert_true(
  (control_device_instance_register('10000000-0000-0000-0000-000000000002','display','30000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001')->>'mode')='legacy',
  'legacy session remains legacy');
SELECT pg_temp.assert_true(
  (control_runtime_session_touch_v2('10000000-0000-0000-0000-000000000002',NULL)->>'device_protocol')='1',
  'touch does not convert an existing legacy session');
SELECT pg_temp.assert_true(
  (control_runtime_session_touch_v2('10000000-0000-0000-0000-000000000003',NULL)->>'device_protocol')='2',
  'new v2 client creates a lease-protocol session');

SELECT pg_temp.assert_true(
  (control_device_instance_register('10000000-0000-0000-0000-000000000001','display','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001')->>'state')='primary',
  'first instance becomes primary');
SELECT pg_temp.assert_true(
  (control_device_instance_register('10000000-0000-0000-0000-000000000001','display','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002')->>'state')='waiting',
  'second instance waits');
SELECT pg_temp.assert_true(
  (control_device_instance_register('10000000-0000-0000-0000-000000000001','display','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002')->>'queue_position')='1',
  'registration retry is idempotent');
SELECT pg_temp.assert_true(
  (control_device_instance_register('10000000-0000-0000-0000-000000000001','buzzer','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003')->>'state')='primary',
  'device types have independent slots');

SELECT pg_temp.assert_true(
  (control_device_instance_release('10000000-0000-0000-0000-000000000001','display','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1)->>'primary_connection_id')='40000000-0000-0000-0000-000000000002',
  'releasing primary promotes waiting instance');
SELECT pg_temp.assert_true(
  (control_device_instance_heartbeat('10000000-0000-0000-0000-000000000001','display','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1)->>'ok')='false',
  'released instance cannot reclaim primary');

SELECT pg_temp.assert_true(NOT has_table_privilege('anon','public.control_device_connections','SELECT'),
  'anonymous clients cannot read connection records');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.control_device_slots','SELECT'),
  'authenticated clients cannot read slot records directly');

INSERT INTO public.games(id,owner_id)
SELECT ('50000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001'
FROM generate_series(1,20) AS i;
INSERT INTO public.control_runtime_sessions(id,game_id,owner_id,device_protocol)
SELECT ('60000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
       ('50000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
       '00000000-0000-0000-0000-000000000001',2 FROM generate_series(1,20) AS i;
INSERT INTO public.control_device_link_tokens(session_id,game_id,device_type,token)
SELECT ('60000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
       ('50000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'display',
       ('70000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,20) AS i;
\echo 'Control2 device lease SQL checks passed'
