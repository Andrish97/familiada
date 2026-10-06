-- Disposable database only: fixture for additive migration 303.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE profiles(id uuid PRIMARY KEY,username text,email text);
CREATE TABLE games(id uuid PRIMARY KEY,owner_id uuid,name text);
CREATE TABLE stats_excluded_users(user_id uuid PRIMARY KEY);
CREATE TABLE edit_locks(resource_type text,resource_id uuid,holder_tab_id text,holder_user_id uuid,acquired_at timestamptz,heartbeat_at timestamptz,holder_context text);
CREATE TABLE device_presence(game_id uuid,device_type text,last_seen_at timestamptz);
CREATE TABLE game_sessions(id uuid,game_id uuid,started_at timestamptz,last_seen_at timestamptz,status text,ended_at timestamptz,control_version integer);
CREATE TABLE game_state(game_id uuid,step text,phase text);
\ir ../../supabase/migrations/2026-10-06_303_maintenance_activity.sql
CREATE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion: %',message; END IF; END$$;
INSERT INTO profiles VALUES('00000000-0000-0000-0000-000000000001','test','test@example.invalid'),('00000000-0000-0000-0000-000000000002','other','other@example.invalid');
INSERT INTO games VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','Other game');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT site_activity_ping('00000000-0000-0000-0000-000000000004','control','00000000-0000-0000-0000-000000000003');
SELECT site_activity_ping('00000000-0000-0000-0000-000000000004','games');
SELECT site_activity_ping('00000000-0000-0000-0000-000000000005','editor');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM site_activity),'one record per tab');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM site_activity_hours),'one user per hour despite repeated pings and tabs');
SELECT pg_temp.assert_true((SELECT bool_and(game_id IS NULL) FROM site_activity),'other owner game is not tracked');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.site_activity_ping(uuid,text,uuid,boolean)','EXECUTE'),'anonymous cannot ping');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.get_maintenance_activity()','EXECUTE'),'snapshot admin-only');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','site_activity','SELECT'),'presence table private');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','site_activity_hours','SELECT'),'history private');
SELECT pg_temp.assert_true(jsonb_array_length(get_maintenance_activity()->'pages')=2,'live rows present');
SELECT pg_temp.assert_true((get_maintenance_activity()#>>'{history,day,0,users}')::int=1,'daily deduplicated count');
INSERT INTO stats_excluded_users VALUES('00000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_true(jsonb_array_length(get_maintenance_activity()->'pages')=0,'shared exclusion removes live user');
SELECT pg_temp.assert_true(jsonb_array_length(get_maintenance_activity()#>'{history,day}')=0,'shared exclusion removes history');
DELETE FROM stats_excluded_users;
UPDATE site_activity SET last_seen_at=now()-interval '2 minutes';
SELECT pg_temp.assert_true(jsonb_array_length(get_maintenance_activity()->'pages')=0,'expired tab does not appear online');
INSERT INTO device_presence VALUES('00000000-0000-0000-0000-000000000003','display',now());
INSERT INTO game_sessions VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000003',now(),now(),'playing',NULL,1);
SELECT pg_temp.assert_true((get_maintenance_activity()#>>'{games,0,control_version}')::int=1,'old control visible without fresh browser code');
INSERT INTO game_state VALUES('00000000-0000-0000-0000-000000000003','f_p1_entry','PLAY');
UPDATE game_sessions SET control_version=2;
SELECT pg_temp.assert_true(get_maintenance_activity()#>>'{games,0,step}'='f_p1_entry','new control live step exposed');
INSERT INTO stats_excluded_users VALUES('00000000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_true(jsonb_array_length(get_maintenance_activity()->'games')=0,'shared exclusion removes games and devices');
\echo 'Maintenance activity SQL checks passed'

-- Shared automatic exclusions and reserved usernames.
ALTER TABLE profiles ADD COLUMN created_at timestamptz DEFAULT now();
ALTER TABLE stats_excluded_users ADD COLUMN added_at timestamptz DEFAULT now();
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb DEFAULT '{}');
INSERT INTO auth.users VALUES
 ('00000000-0000-0000-0000-000000000001','ordinary@example.invalid','{}'),
 ('00000000-0000-0000-0000-000000000002','other@example.invalid','{}'),
 ('00000000-0000-0000-0000-000000000006','test26@familiada.online','{}'),
 ('00000000-0000-0000-0000-000000000007',NULL,'{"is_test_guest":true}'),
 ('00000000-0000-0000-0000-000000000008',NULL,'{}');
INSERT INTO profiles(id,username,email) VALUES
 ('00000000-0000-0000-0000-000000000006','test26','test26@familiada.online'),
 ('00000000-0000-0000-0000-000000000007','guest_test',NULL),
 ('00000000-0000-0000-0000-000000000008','guest_ordinary',NULL);
DELETE FROM stats_excluded_users;
\ir ../../supabase/migrations/2026-10-06_304_automatic_test_exclusions.sql
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM stats_exclusions_effective),'test account and test guest automatically excluded');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM stats_exclusions_effective WHERE user_id='00000000-0000-0000-0000-000000000008'),'ordinary guest remains included');
DO $$ BEGIN
 BEGIN UPDATE profiles SET username='TeSt26' WHERE id='00000000-0000-0000-0000-000000000001';
 RAISE EXCEPTION 'Reserved username accepted';
 EXCEPTION WHEN unique_violation THEN IF SQLERRM<>'username unavailable' THEN RAISE; END IF; END;
END $$;
UPDATE profiles SET username='test26' WHERE id='00000000-0000-0000-0000-000000000006';
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['familiada','familiada_team','ADMIN','admin123','administrator','moderator','support','pomoc','kontakt','contact','system','official','security','billing','noreply','tester'] LOOP
  BEGIN UPDATE profiles SET username=name WHERE id='00000000-0000-0000-0000-000000000001';
   RAISE EXCEPTION 'Reserved system name accepted';
  EXCEPTION WHEN unique_violation THEN IF SQLERRM<>'username unavailable' THEN RAISE; END IF; END;
 END LOOP;
END $$;
INSERT INTO reserved_username_accounts VALUES('00000000-0000-0000-0000-000000000001','support');
UPDATE profiles SET username='support' WHERE id='00000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','reserved_username_accounts','INSERT'),'ordinary users cannot grant reserved names');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM jsonb_array_elements(stats_excluded_list()) x WHERE (x->>'automatic')::boolean),'automatic labels exposed');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
SELECT site_activity_ping(gen_random_uuid(),'games');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(get_maintenance_activity()->'pages') x WHERE x->>'user_id'='00000000-0000-0000-0000-000000000006'),'activity follows automatic exclusions');
\echo 'Automatic test exclusions and username reservation checks passed'
