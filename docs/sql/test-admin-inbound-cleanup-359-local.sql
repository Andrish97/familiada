-- ISOLATED DATABASE ONLY: cleanup fixture, repeatable migration, source and attachment boundaries.
INSERT INTO public.messages (id,source,direction,from_email,body) VALUES
 ('35900000-0000-0000-0000-000000000001','email','inbound','bounce+fixture@bounce-zem.familiada.online','fixture'),
 ('35900000-0000-0000-0000-000000000002','email','inbound','person@example.com','fixture'),
 ('35900000-0000-0000-0000-000000000003','compose','outbound','bounce+fixture@bounce-zem.familiada.online','fixture'),
 ('35900000-0000-0000-0000-000000000004','email','inbound','bounce+attached@bounce-zem.familiada.online','fixture'),
 ('35900000-0000-0000-0000-000000000005','form','inbound','bounce+fixture@bounce-zem.familiada.online','fixture');
INSERT INTO public.message_attachments(message_id,filename,storage_path) VALUES
 ('35900000-0000-0000-0000-000000000004','fixture.txt','fixture359.txt');
\ir ../../supabase/migrations/2026-10-12_359_admin_mail_loop.sql
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.messages WHERE id='35900000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'technical copy retained'; END IF;
 IF (SELECT count(*) FROM public.messages WHERE id IN ('35900000-0000-0000-0000-000000000002','35900000-0000-0000-0000-000000000003','35900000-0000-0000-0000-000000000005') AND deleted_at IS NULL)<>3 THEN RAISE EXCEPTION 'ordinary/source/direction damaged'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.messages WHERE id='35900000-0000-0000-0000-000000000004' AND deleted_at IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.message_attachments WHERE storage_path='fixture359.txt') THEN RAISE EXCEPTION 'attachment cleanup lifecycle damaged'; END IF;
 END $$;
\ir ../../supabase/migrations/2026-10-12_359_admin_mail_loop.sql
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.messages WHERE id='35900000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'technical copy retained'; END IF;
 IF (SELECT count(*) FROM public.messages WHERE id IN ('35900000-0000-0000-0000-000000000002','35900000-0000-0000-0000-000000000003','35900000-0000-0000-0000-000000000005') AND deleted_at IS NULL)<>3 THEN RAISE EXCEPTION 'ordinary/source/direction damaged'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.messages WHERE id='35900000-0000-0000-0000-000000000004' AND deleted_at IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.message_attachments WHERE storage_path='fixture359.txt') THEN RAISE EXCEPTION 'attachment cleanup lifecycle damaged'; END IF;
 END $$;
\ir test-admin-inbound-359.sql
