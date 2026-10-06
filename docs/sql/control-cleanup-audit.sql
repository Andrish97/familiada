-- Read-only production inventory. No migration and no destructive statements.
BEGIN TRANSACTION READ ONLY;

-- Legacy candidates, their exact signatures, permissions and definitions.
SELECT p.oid::regprocedure AS signature, p.proacl AS privileges,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('device_state_get','device_state_set_public','device_state_set_admin',
  'ensure_device_state','game_session_start','game_session_update','game_session_end');

-- Also inspect textual references: PL/pgSQL bodies may not have catalogue dependencies.
SELECT p.oid::regprocedure AS signature, p.prosrc AS body
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind IN ('f','p') AND
 p.prosrc ~ '\m(device_state|device_kind|ensure_device_state|game_session_start|game_session_update|game_session_end)\M';

SELECT pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent,
       pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) AS referenced,
       d.deptype
FROM pg_depend d
WHERE (d.refclassid='pg_class'::regclass AND d.refobjid=to_regclass('public.device_state'))
   OR (d.refclassid='pg_type'::regclass AND d.refobjid=to_regtype('public.device_kind'))
   OR (d.refclassid='pg_proc'::regclass AND d.refobjid IN (
     SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('device_state_get','device_state_set_public','device_state_set_admin',
        'ensure_device_state','game_session_start','game_session_update','game_session_end')
   ));

SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='device_state';
SELECT * FROM pg_publication_tables WHERE schemaname='public' AND tablename='device_state';
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid=to_regclass('public.device_state') AND NOT tgisinternal;

-- Snapshot age helps inventory; it does NOT prove that every old tab is closed.
SELECT count(*) AS rows, min(updated_at) AS oldest, max(updated_at) AS newest
FROM public.device_state;
SELECT control_version,status,count(*) AS sessions,
       count(*) FILTER (WHERE ended_at IS NULL) AS without_end,
       max(last_seen_at) AS last_contact
FROM public.game_sessions GROUP BY control_version,status ORDER BY control_version,status;

-- Current operational rows and retained, version-independent chart history.
SELECT page,count(*) AS tabs,max(last_seen_at) AS last_contact
FROM public.site_activity GROUP BY page ORDER BY page;
SELECT count(*) AS user_hours,min(bucket) AS oldest,max(bucket) AS newest
FROM public.site_activity_hours;

ROLLBACK;
