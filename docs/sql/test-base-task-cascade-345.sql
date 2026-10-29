-- Izolowany Postgres lub kontrola produkcyjna w jednej rollbackowej transakcji.
-- Bez wysyłki maili i dotykania rzeczywistych kont.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-3450-0000-0000-000000000001','owner345@example.invalid'),
 ('bbbbbbbb-3450-0000-0000-000000000002','recipient345@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES
 ('aaaaaaaa-3450-0000-0000-000000000001','owner345@example.invalid','owner345'),
 ('bbbbbbbb-3450-0000-0000-000000000002','recipient345@example.invalid','recipient345')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.question_bases(id,owner_id,name) VALUES
 ('cccccccc-3450-0000-0000-000000000003','aaaaaaaa-3450-0000-0000-000000000001','Cascade345'),
 ('cccccccc-3450-0000-0000-000000000004','aaaaaaaa-3450-0000-0000-000000000001','Other345');
INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email,status,declined_at,cancelled_at)
SELECT 'aaaaaaaa-3450-0000-0000-000000000001','cccccccc-3450-0000-0000-000000000003',
 'bbbbbbbb-3450-0000-0000-000000000002','recipient345@example.invalid',status,
 CASE WHEN status='declined' THEN now() END,CASE WHEN status='cancelled' THEN now() END
FROM unnest(ARRAY['pending','opened','accepted','declined','cancelled']) AS status;
INSERT INTO public.base_share_tasks(owner_id,base_id,recipient_user_id,recipient_email)
VALUES('aaaaaaaa-3450-0000-0000-000000000001','cccccccc-3450-0000-0000-000000000004','bbbbbbbb-3450-0000-0000-000000000002','recipient345@example.invalid');
INSERT INTO public.question_base_shares(base_id,user_id,role)
VALUES('cccccccc-3450-0000-0000-000000000003','bbbbbbbb-3450-0000-0000-000000000002','viewer');
DO $$
DECLARE t record; o uuid:='aaaaaaaa-3450-0000-0000-000000000001';
 u uuid:='bbbbbbbb-3450-0000-0000-000000000002'; b uuid:='cccccccc-3450-0000-0000-000000000003';
 tasks jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='base_share_tasks_base_id_fkey'
  AND conrelid='public.base_share_tasks'::regclass AND confrelid='public.question_bases'::regclass AND confdeltype='c' AND convalidated) THEN RAISE EXCEPTION 'missing validated cascade'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'token',token)) INTO tasks FROM public.base_share_tasks WHERE base_id=b;
 DELETE FROM public.question_bases WHERE id=b;
 IF EXISTS(SELECT 1 FROM public.base_share_tasks WHERE base_id=b) OR
 EXISTS(SELECT 1 FROM public.question_base_shares WHERE base_id=b) THEN RAISE EXCEPTION 'orphan task/grant after base delete'; END IF;
 IF (SELECT count(*) FROM public.base_share_tasks WHERE base_id='cccccccc-3450-0000-0000-000000000004')<>1 THEN RAISE EXCEPTION 'other base affected'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 FOR t IN SELECT (value->>'id')::uuid AS id,value->>'token' AS token FROM jsonb_array_elements(tasks) LOOP
  IF public.base_share_accept(t.id) OR public.base_share_decline(t.id) OR
  public.base_share_undo_decline(t.id)->>'ok'='true' OR
  EXISTS(SELECT 1 FROM public.base_share_token_info(t.token)) THEN RAISE EXCEPTION 'deleted task/token usable %',t; END IF;
 END LOOP;
 IF jsonb_array_length(public.base_declines_list_mine())<>0 THEN RAISE EXCEPTION 'orphan own refusals'; END IF;
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 DELETE FROM auth.users WHERE id=o;
 IF EXISTS(SELECT 1 FROM public.question_bases WHERE owner_id=o) OR
 EXISTS(SELECT 1 FROM public.base_share_tasks WHERE owner_id=o) THEN RAISE EXCEPTION 'account cascade stops before task'; END IF;
END $$;
ROLLBACK;
