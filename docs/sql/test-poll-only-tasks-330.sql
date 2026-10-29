-- Izolowany Postgres; bez maili, rollback.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-3300-0000-0000-000000000001','a330@example.net'),('bbbbbbbb-3300-0000-0000-000000000002','b330@example.net'),('cccccccc-3300-0000-0000-000000000003','c330@example.net');
INSERT INTO public.profiles(id,email,username) VALUES ('aaaaaaaa-3300-0000-0000-000000000001','a330@example.net','fixturea330'),('bbbbbbbb-3300-0000-0000-000000000002','b330@example.net','fixtureb330'),('cccccccc-3300-0000-0000-000000000003','c330@example.net','fixturec330') ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.games(id,owner_id,name,type,status) VALUES ('a1a1a1a1-3300-0000-0000-000000000001','aaaaaaaa-3300-0000-0000-000000000001','Ankieta 330','poll_text','poll_open');
INSERT INTO public.question_bases(id,owner_id,name) VALUES ('b1b1b1b1-3300-0000-0000-000000000001','aaaaaaaa-3300-0000-0000-000000000001','Baza 330');
INSERT INTO public.poll_tasks(owner_id,recipient_user_id,game_id,poll_type,share_key_poll,status,done_at,declined_at,cancelled_at) VALUES
 ('aaaaaaaa-3300-0000-0000-000000000001','bbbbbbbb-3300-0000-0000-000000000002','a1a1a1a1-3300-0000-0000-000000000001','poll_text','330-todo','pending',NULL,NULL,NULL),
 ('aaaaaaaa-3300-0000-0000-000000000001','bbbbbbbb-3300-0000-0000-000000000002','a1a1a1a1-3300-0000-0000-000000000001','poll_points','330-points','pending',NULL,NULL,NULL),
 ('aaaaaaaa-3300-0000-0000-000000000001','bbbbbbbb-3300-0000-0000-000000000002','a1a1a1a1-3300-0000-0000-000000000001','poll_text','330-done','done',now()-interval '1 day',NULL,NULL),
 ('aaaaaaaa-3300-0000-0000-000000000001','bbbbbbbb-3300-0000-0000-000000000002','a1a1a1a1-3300-0000-0000-000000000001','poll_text','330-old','done',now()-interval '5 days',NULL,NULL),
 ('aaaaaaaa-3300-0000-0000-000000000001','bbbbbbbb-3300-0000-0000-000000000002','a1a1a1a1-3300-0000-0000-000000000001','poll_text','330-refused','declined',NULL,now(),NULL),
 ('aaaaaaaa-3300-0000-0000-000000000001','bbbbbbbb-3300-0000-0000-000000000002','a1a1a1a1-3300-0000-0000-000000000001','poll_text','330-cancel','cancelled',NULL,NULL,now());
INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,role,status) VALUES ('aaaaaaaa-3300-0000-0000-000000000001','b1b1b1b1-3300-0000-0000-000000000001','bbbbbbbb-3300-0000-0000-000000000002','editor','pending');
INSERT INTO public.shared_devices(owner_id,recipient_id,device_type,game_id,game_name) VALUES ('aaaaaaaa-3300-0000-0000-000000000001','bbbbbbbb-3300-0000-0000-000000000002','host','a1a1a1a1-3300-0000-0000-000000000001','Urządzenie 330');
INSERT INTO public.friendships(requester_id,addressee_id,status) VALUES ('aaaaaaaa-3300-0000-0000-000000000001','bbbbbbbb-3300-0000-0000-000000000002','pending');
DO $$ BEGIN
 PERFORM set_config('request.jwt.claim.sub','',true);
 IF EXISTS(SELECT 1 FROM public.tasks_list()) OR public.badges_get()->>'tasks_pending' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'anon tasks'; END IF;
 PERFORM set_config('request.jwt.claim.sub','bbbbbbbb-3300-0000-0000-000000000002',true);
 IF (SELECT count(*) FROM public.tasks_list())<>3 OR EXISTS(SELECT 1 FROM public.tasks_list() WHERE kind<>'poll') THEN RAISE EXCEPTION 'nonpoll or invalid history'; END IF;
 IF (SELECT count(*) FROM public.tasks_list('poll') WHERE state='todo')<>2 OR (SELECT count(*) FROM public.tasks_list('poll') WHERE state='done')<>1 THEN RAISE EXCEPTION 'todo/done boundary'; END IF;
 IF EXISTS(SELECT 1 FROM public.tasks_list('base')) OR EXISTS(SELECT 1 FROM public.tasks_list('device')) OR EXISTS(SELECT 1 FROM public.tasks_list('invalid')) THEN RAISE EXCEPTION 'nonpoll filter'; END IF;
 IF public.badges_get()->>'tasks_pending' IS DISTINCT FROM '2' OR public.badges_get()->>'friends_pending' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'badge duplication'; END IF;
 IF public.bases_count_incoming_share_invites()<>1 THEN RAISE EXCEPTION 'base own badge lost'; END IF;
 UPDATE public.poll_tasks SET declined_at=now(),status='declined' WHERE share_key_poll='330-todo';
 IF public.badges_get()->>'tasks_pending' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'declined count'; END IF;
 PERFORM set_config('request.jwt.claim.sub','cccccccc-3300-0000-0000-000000000003',true);
 IF EXISTS(SELECT 1 FROM public.tasks_list()) OR public.badges_get()->>'tasks_pending' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'foreign tasks'; END IF;
 RAISE NOTICE '330 OK: poll-only list/filters/todo/done/5-day history/decline/foreign/anon/independent badges';
END $$;
ROLLBACK;
