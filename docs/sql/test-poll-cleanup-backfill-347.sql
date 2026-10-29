\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT count(*) FROM public.poll_text_entries WHERE game_id='dddddddd-3471-0000-0000-000000000004')<>2 OR (SELECT count(*) FROM public.poll_votes WHERE game_id='dddddddd-3471-0000-0000-000000000005')<>2 THEN RAISE EXCEPTION 'cleanup lost completed aggregate or retained known partial'; END IF;
 IF EXISTS(SELECT 1 FROM public.poll_text_entries v JOIN public.poll_tasks t ON v.voter_token=public.poll_task_voter_token(t.id) WHERE t.owner_id='aaaaaaaa-3471-0000-0000-000000000001') OR EXISTS(SELECT 1 FROM public.poll_votes v JOIN public.poll_tasks t ON v.voter_token=public.poll_task_voter_token(t.id) WHERE t.owner_id='aaaaaaaa-3471-0000-0000-000000000001') THEN RAISE EXCEPTION 'historical closed task votes remain'; END IF;
 RAISE NOTICE '347 backfill OK: known cancelled partials removed; completed orphan aggregates retained';
END $$;
DELETE FROM auth.users WHERE id='aaaaaaaa-3471-0000-0000-000000000001';
