-- Wyłącznie izolowana stara baza, PRZED345. Celowo odtwarza dawny orphan.
\set ON_ERROR_STOP on
INSERT INTO auth.users(id,email) VALUES('aaaaaaaa-3451-0000-0000-000000000001','orphan345@example.invalid');
INSERT INTO public.profiles(id,email,username) VALUES('aaaaaaaa-3451-0000-0000-000000000001','orphan345@example.invalid','orphan345')
ON CONFLICT(id) DO UPDATE SET email=excluded.email,username=excluded.username;
INSERT INTO public.question_bases(id,owner_id,name) VALUES('cccccccc-3451-0000-0000-000000000003','aaaaaaaa-3451-0000-0000-000000000001','Legacy orphan345');
INSERT INTO public.base_share_tasks(id,owner_id,base_id,recipient_email) VALUES('dddddddd-3451-0000-0000-000000000004','aaaaaaaa-3451-0000-0000-000000000001','cccccccc-3451-0000-0000-000000000003','recipient345@example.invalid');
DELETE FROM public.question_bases WHERE id='cccccccc-3451-0000-0000-000000000003';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.base_share_tasks WHERE id='dddddddd-3451-0000-0000-000000000004') THEN RAISE EXCEPTION 'legacy orphan not reproduced'; END IF;
END $$;
