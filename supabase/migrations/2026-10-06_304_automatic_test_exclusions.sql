BEGIN;
-- Trusted identity: neither a username nor user-editable metadata can mark
-- an ordinary account as a test. Normal guests remain included.
CREATE VIEW public.stats_exclusions_effective AS
 SELECT DISTINCT ON(user_id) user_id,added_at,reason FROM (
 SELECT user_id,added_at,'manual'::text AS reason,2 AS priority FROM public.stats_excluded_users
 UNION ALL
 SELECT p.id,p.created_at,
 CASE WHEN coalesce(u.raw_app_meta_data->>'is_test_guest','false')='true' THEN 'test_guest' ELSE 'test_account' END,1
 FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE lower(u.email) ~ '^test[0-9]+@familiada[.]online$'
 OR coalesce(u.raw_app_meta_data->>'is_test_guest','false')='true'
 ) x ORDER BY user_id,priority;
REVOKE ALL ON public.stats_exclusions_effective FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.stats_exclusions_effective TO service_role;

-- Switch read-only statistics consumers and activity to the same rule.
-- Keep the manual exclusion table and its write functions unchanged.
DO $$ DECLARE fn record; BEGIN
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('get_admin_stats','get_admin_stats_deep','get_admin_stats_funnel','get_admin_stats_v2','get_retention_stats','get_stats_detail','get_admin_poll_stats','get_admin_poll_details','get_maintenance_activity')
 AND p.prosrc LIKE '%public.stats_excluded_users%'
 LOOP EXECUTE replace(pg_get_functiondef(fn.oid),'public.stats_excluded_users','public.stats_exclusions_effective'); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.stats_excluded_list() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',e.user_id,'username',p.username,'email',p.email,
 'added_at',e.added_at,'reason',e.reason,'automatic',e.reason<>'manual') ORDER BY e.added_at),'[]'::jsonb)
 FROM public.stats_exclusions_effective e JOIN public.profiles p ON p.id=e.user_id;
$$;

CREATE TABLE public.reserved_username_accounts (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 username text NOT NULL CHECK(username=lower(btrim(username))),
 PRIMARY KEY(user_id,username)
);
ALTER TABLE public.reserved_username_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reserved_username_accounts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.reserved_username_accounts TO service_role;

CREATE TABLE public.reserved_username_prefixes (
 prefix text PRIMARY KEY CHECK(prefix=lower(btrim(prefix)) AND length(prefix)>0),
 kind text NOT NULL CHECK(kind IN ('test','system'))
);
ALTER TABLE public.reserved_username_prefixes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reserved_username_prefixes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.reserved_username_prefixes TO service_role;
INSERT INTO public.reserved_username_prefixes(prefix,kind) VALUES
 ('test','test'),('familiada','system'),('admin','system'),('administrator','system'),
 ('moderator','system'),('support','system'),('pomoc','system'),('kontakt','system'),
 ('contact','system'),('system','system'),('official','system'),('security','system'),
 ('billing','system'),('noreply','system');

CREATE FUNCTION public.reserved_username_reason(p_username text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT kind FROM public.reserved_username_prefixes
 WHERE starts_with(lower(btrim(p_username)),prefix) ORDER BY length(prefix) DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.reserved_username_reason(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.reserved_username_prefixes_list() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('prefix',prefix,'kind',kind) ORDER BY prefix),'[]'::jsonb)
 FROM public.reserved_username_prefixes;
$$;
REVOKE ALL ON FUNCTION public.reserved_username_prefixes_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserved_username_prefixes_list() TO anon,authenticated;

CREATE FUNCTION public.profiles_reserve_test_username() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reason text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN RETURN NEW; END IF;
 reason:=public.reserved_username_reason(NEW.username);
 IF reason IS NULL THEN RETURN NEW; END IF;
 IF reason='test' AND btrim(NEW.username) ~* '^test[0-9]+$' AND EXISTS (
 SELECT 1 FROM auth.users u WHERE u.id=NEW.id
 AND lower(u.email)=lower(btrim(NEW.username))||'@familiada.online'
 ) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.reserved_username_accounts a WHERE a.user_id=NEW.id AND a.username=lower(btrim(NEW.username))) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'username unavailable' USING ERRCODE='23505';
 RETURN NEW;
END $$;
CREATE TRIGGER profiles_reserve_test_username BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_reserve_test_username();
REVOKE ALL ON FUNCTION public.profiles_reserve_test_username() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
