-- Actual production DB verification, transactional test-account writes only.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion: %',message; END IF; END$$;
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.site_activity_ping(uuid,text,uuid,boolean)','EXECUTE'),'anonymous cannot write activity');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.get_maintenance_activity()','EXECUTE'),'ordinary user cannot read activity');
SELECT pg_temp.assert_true(has_function_privilege('service_role','public.get_maintenance_activity()','EXECUTE'),'admin Worker can read snapshot');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','site_activity_hours','SELECT'),'history remains private');
DO $$
DECLARE uid uuid; tab uuid:=gen_random_uuid(); snapshot jsonb; excluded boolean;
BEGIN
 SELECT id INTO uid FROM public.profiles WHERE lower(email)='test1@familiada.online';
 IF uid IS NULL THEN RAISE EXCEPTION 'Test account not found'; END IF;
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM public.site_activity_ping(tab,'games');
 PERFORM public.site_activity_ping(tab,'games');
 IF NOT EXISTS(SELECT 1 FROM public.site_activity WHERE user_id=uid AND tab_id=tab) THEN RAISE EXCEPTION 'Production ping not saved'; END IF;
 IF (SELECT count(*) FROM public.site_activity_hours WHERE user_id=uid AND bucket=date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')<>1 THEN RAISE EXCEPTION 'Hourly deduplication failed'; END IF;
 snapshot:=public.get_maintenance_activity();
 SELECT EXISTS(SELECT 1 FROM public.stats_exclusions_effective WHERE user_id=uid) INTO excluded;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'pages') x WHERE x->>'tab_id'=tab::text)=excluded THEN RAISE EXCEPTION 'Shared exclusion not respected'; END IF;
 IF NOT(snapshot ? 'history' AND snapshot ? 'games' AND snapshot ? 'locks') THEN RAISE EXCEPTION 'Incomplete snapshot'; END IF;
END $$;
ROLLBACK;
\echo 'Production activity write, deduplication, exclusions and access checks passed; test writes rolled back'
