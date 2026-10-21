-- Migracja 451: niedomyślne ustawienia wg nowych domyślnych (finał, ekran kwoty).
-- Lokalna baza wg docs/sql/local-db.md.
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-000000000451','o451@x.pl');
INSERT INTO public.games(id, owner_id, name, type, status, settings) VALUES
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000451','a','prepared','ready','{"game":{"hasFinal":true,"advanced":{"roundMultipliers":[1,1,1,2,3],"finalMinPoints":300,"finalTarget":200,"endScreenMode":"money","finalPrizeMultiplier":3,"mainPrizeAmount":25000}}}'),
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000451','b','prepared','ready','{"game":{"hasFinal":false}}'),
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000451','c','prepared','ready','{"game":{"advanced":{"roundMultipliers":[1,1,1,2,3],"finalMinPoints":300,"finalTarget":200,"endScreenMode":"logo","finalPrizeMultiplier":3,"mainPrizeAmount":25000}}}'),
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000451','d','prepared','ready','{}');
DO $$ BEGIN
  -- a (nowe domyślne) i d (puste) — domyślne; b (bez finału) i c (logo) — niedomyślne
  IF (public.get_admin_stats()->'custom_settings'->>'total')::int <> 2 THEN RAISE EXCEPTION 'custom_settings total'; END IF;
  IF jsonb_array_length(public.get_stats_detail('custom_settings')) <> 2 THEN RAISE EXCEPTION 'custom_settings detail'; END IF;
  RAISE NOTICE 'ok 451';
END $$;
ROLLBACK;
