DO $$ BEGIN
 IF current_database() NOT IN ('fam','fam354draft') THEN RAISE EXCEPTION 'isolated database only'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id='aaaaaaaa-3542-0000-0000-000000000001'
 AND is_guest AND guest_last_active_at IS NOT NULL
 AND guest_expires_at BETWEEN now()+interval '4 days 23 hours' AND now()+interval '5 days 1 hour')
 THEN RAISE EXCEPTION 'bad guest history not repaired'; END IF;
 IF (SELECT count(*) FROM public.profiles WHERE id IN
 ('aaaaaaaa-3542-0000-0000-000000000002','aaaaaaaa-3542-0000-0000-000000000003')
 AND NOT is_guest AND guest_expires_at IS NULL AND guest_last_active_at IS NULL) <> 2
 THEN RAISE EXCEPTION 'conversion or regular registration changed'; END IF;
 RAISE NOTICE '354 history: corrupted anonymous profile repaired; converted and regular identities preserved';
END $$;
DELETE FROM auth.users WHERE id::text LIKE 'aaaaaaaa-3542-%';
