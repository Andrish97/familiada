-- Wyłącznie odizolowana baza po local-stubs + schema.sql + migracji 322.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.check_result(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'PASS: %',label;
END; $$;
INSERT INTO public.mail_cooldown_policies(action_key,scope,cooldown_seconds,enforce)
VALUES ('base:share','pair',86400,true) ON CONFLICT(action_key) DO NOTHING;
INSERT INTO auth.users(id,email) VALUES
('aaaaaaaa-3220-0000-0000-000000000001','owner322@example.com'),
('bbbbbbbb-3220-0000-0000-000000000002','recipient322@example.com');
INSERT INTO public.profiles(id,email,username) VALUES
('aaaaaaaa-3220-0000-0000-000000000001','owner322@example.com','owner322'),
('bbbbbbbb-3220-0000-0000-000000000002','recipient322@example.com','recipient322')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.question_bases(id,owner_id,name) VALUES
('baba3220-0000-0000-0000-000000000001','aaaaaaaa-3220-0000-0000-000000000001','Base322');
CREATE TEMP TABLE result(k text,v jsonb);
GRANT ALL ON result TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-3220-0000-0000-000000000001',true);
INSERT INTO result SELECT 'invite',to_jsonb(x) FROM public.base_share_by_user(
  'baba3220-0000-0000-0000-000000000001','recipient322','viewer'
) x;
SELECT pg_temp.check_result((SELECT (v->>'ok')::boolean AND v->>'mail_link' LIKE '/go/?b=%' FROM result WHERE k='invite'),'account invite uses /go/?b=');
RESET ROLE;
INSERT INTO result SELECT 'token',jsonb_build_object('token',token) FROM public.base_share_tasks LIMIT 1;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-3220-0000-0000-000000000003',true);
INSERT INTO result SELECT 'outsider',public.poll_go_resolve((SELECT (v->>'token')::uuid FROM result WHERE k='token'));
SELECT pg_temp.check_result((SELECT v->>'kind'='base' AND v->>'recipient_matches_me'='false' FROM result WHERE k='outsider'),'base token resolves and rejects wrong account');
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-3220-0000-0000-000000000002',true);
INSERT INTO result SELECT 'recipient',public.poll_go_resolve((SELECT (v->>'token')::uuid FROM result WHERE k='token'));
SELECT pg_temp.check_result((SELECT v->>'kind'='base' AND v->>'recipient_matches_me'='true' FROM result WHERE k='recipient'),'base token matches intended account');
SELECT pg_temp.check_result((SELECT count(*)=1 AND min(kind)='base' FROM public.tasks_list(NULL)),'invitation appears in Tasks');
SELECT pg_temp.check_result(public.base_share_accept((SELECT (v->>'task_id')::uuid FROM result WHERE k='recipient')),'recipient accepts invitation from Tasks');
RESET ROLE;
SELECT pg_temp.check_result(EXISTS(SELECT 1 FROM public.question_base_shares WHERE base_id='baba3220-0000-0000-0000-000000000001' AND user_id='bbbbbbbb-3220-0000-0000-000000000002'),'acceptance grants base access');
ROLLBACK;
