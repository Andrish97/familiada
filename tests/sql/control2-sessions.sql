-- Isolated PostgreSQL fixture. Never run against the application database.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
  $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
CREATE TABLE public.games(id uuid PRIMARY KEY, owner_id uuid, name text);
CREATE TABLE public.profiles(id uuid PRIMARY KEY, username text);
CREATE TABLE public.stats_excluded_users(user_id uuid);
CREATE TABLE public.game_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),game_id uuid REFERENCES games(id),
  started_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,status text NOT NULL DEFAULT 'started',rounds_played integer NOT NULL DEFAULT 0,
  error_message text,client_meta jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
  winner_team text,team_a_score integer,team_b_score integer,rounds_score_a integer,rounds_score_b integer,final_points integer
);
CREATE VIEW public.game_sessions_effective AS SELECT s.*,s.status AS effective_status FROM game_sessions s;
CREATE TABLE public.game_state(game_id uuid PRIMARY KEY REFERENCES games(id),rev bigint,step text,phase text,control_team text,detail jsonb);
INSERT INTO games VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Statystyki');
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000002',false);
INSERT INTO game_sessions(game_id,status,team_a_score) VALUES
 ('00000000-0000-0000-0000-000000000001','legacy',37),
 ('00000000-0000-0000-0000-000000000001','final',100);
\ir ../../supabase/migrations/2026-10-06_300_control2_sessions.sql

CREATE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion: %',message; END IF; END $$;
SELECT pg_temp.assert_true((SELECT count(*)=2 AND min(control_version)=1 FROM game_sessions),'old rows preserved');
SELECT pg_temp.assert_true((SELECT team_a_score=37 FROM game_sessions WHERE status='legacy'),'archive result preserved');

INSERT INTO game_state VALUES('00000000-0000-0000-0000-000000000001',1,'r_intro',NULL,NULL,
 '{"locks":{"gameStarted":true},"teams":{"teamA":"Alfa","teamB":"Beta"},"rounds":{"roundNo":1,"totals":{"A":0,"B":0}},"settings":{"roundMultipliers":[1,2],"finalMinPoints":300,"finalTarget":200,"endScreenMode":"money","finalPrizeMultiplier":3,"mainPrizeAmount":25000},"final":{"questions":[]}}');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM game_sessions WHERE control_version=2),'ready screen not counted');
UPDATE game_state SET rev=2,step='r_roundStart';
UPDATE game_state SET rev=3,detail=detail; -- Reload / metadata write.
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM game_sessions WHERE control_version=2),'reload does not duplicate');
UPDATE game_state SET rev=4,step='r_play',phase='PLAY',control_team='A',
 detail=detail || '{"rounds":{"roundNo":1,"bankPts":40,"totals":{"A":0,"B":0},"question":{"text":"Pytanie"},"steal":{"used":false}}}';
UPDATE game_state SET rev=5,phase='REVEAL',detail=jsonb_set(jsonb_set(detail,'{rounds,bankPts}','0'),'{rounds,totals,A}','40');
UPDATE game_state SET rev=6,detail=detail;
SELECT pg_temp.assert_true((SELECT rounds_played=1 AND rounds_score_a=40 AND stats_detail#>>'{rounds,1,awarded_a}'='40' FROM game_sessions WHERE control_version=2),'round settlement once');
UPDATE game_state SET rev=7,step='r_roundStart',phase='READY',control_team=NULL,detail=jsonb_set(detail,'{rounds,roundNo}','2');
UPDATE game_state SET rev=8,step='r_play',phase='PLAY',control_team='B';
UPDATE game_state SET rev=9,step='r_gameEnd',phase=NULL,control_team=NULL,detail=jsonb_set(detail,'{rounds,roundNo}','3');
SELECT pg_temp.assert_true((SELECT rounds_played=2 FROM game_sessions WHERE control_version=2),'zero-point round counted');
UPDATE game_state SET rev=10,detail=jsonb_set(detail,'{locks,gameEnded}','true');
SELECT pg_temp.assert_true((SELECT status='final' AND ended_at IS NOT NULL AND stats_detail->>'end_reason'='questions_exhausted' FROM game_sessions WHERE control_version=2),'no-final completion');
SELECT pg_temp.assert_true((SELECT jsonb_array_length(get_stats_detail('gameplay'))=3),'admin old and new history');

UPDATE game_state SET rev=11,step='devices_display',detail=jsonb_set(detail,'{locks}','{"gameStarted":false}');
UPDATE game_state SET rev=12,step='r_roundStart',detail=jsonb_set(detail,'{locks}','{"gameStarted":true}');
SELECT control2_session_ping('00000000-0000-0000-0000-000000000001','{"kind":"disconnect","devices":["display"]}');
SELECT control2_session_ping('00000000-0000-0000-0000-000000000001','{"kind":"error","message":"Test"}');
UPDATE game_state SET rev=13,step='devices_display',detail=jsonb_set(detail,'{locks}','{"gameStarted":false}');
SELECT pg_temp.assert_true((SELECT status='abandoned' AND stats_detail->>'end_reason'='restart' AND jsonb_array_length(stats_detail->'events')=2 FROM game_sessions WHERE control_version=2 AND start_rev=12),'restart and local events');

UPDATE game_state SET rev=14,step='r_roundStart',detail=jsonb_set(detail,'{locks}','{"gameStarted":true}');
UPDATE game_state SET rev=15,step='f_p1_map_q3',detail=detail ||
 '{"rounds":{"roundNo":3,"totals":{"A":300,"B":40}},"final":{"winnerTeam":"A","questions":[{}],"runtime":{"sum":120,"reached200":false,"p1":[],"p2":[],"map1":[],"map2":[]}}}';
SELECT pg_temp.assert_true((SELECT client_meta->>'final_step'='p1_q3' FROM game_sessions WHERE start_rev=14),'final question progress');
UPDATE game_state SET rev=16,step='f_end',detail=jsonb_set(jsonb_set(detail,'{final,runtime,sum}','210'),'{final,runtime,reached200}','true');
UPDATE game_state SET rev=17,detail=jsonb_set(jsonb_set(detail,'{rounds,totals,A}','510'),'{locks,gameEnded}','true');
SELECT pg_temp.assert_true((SELECT rounds_score_a=300 AND team_a_score=510 AND final_points=210 AND stats_detail->>'prize'='26530' AND stats_detail->>'end_reason'='final_target' FROM game_sessions WHERE start_rev=14),'split final scores and prize');
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000003',false);
DO $$ BEGIN
  BEGIN PERFORM control2_session_ping('00000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'unauthorized ping accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'forbidden' THEN RAISE; END IF; END;
END $$;
SELECT pg_temp.assert_true(NOT has_table_privilege('anon','game_session_active','SELECT'),'pointer private');
ROLLBACK;
\echo 'Control2 statistics SQL checks passed'
