-- 507: adresy testowe e2e w domenie familijna.app (rebranding, przełączenie
-- domeny 2026-10-29). Reguła Email Routing e2e@familijna.app (+ Subaddressing)
-- prowadzi do Workera familijna. Konta testowe, tożsamości i skrzynka testowa
-- przechodzą z e2e+<rola><NN>@familiada.online na e2e+<rola><NN>@familijna.app.
-- is_test_email rozpoznaje obie domeny: stare wiersze testowe w innych
-- tabelach (subskrypcje, logi poczty) dalej nie liczą się do statystyk.

BEGIN;

ALTER TABLE public.e2e_identities DROP CONSTRAINT IF EXISTS e2e_identities_email_check;
ALTER TABLE public.e2e_emails DROP CONSTRAINT IF EXISTS e2e_emails_recipient_check;

-- Skrzynka testowa: stare wiadomości nie są już potrzebne (każdy test czyści swoją).
DELETE FROM public.e2e_emails WHERE recipient ~ '@familiada\.online$';

-- Najpierw tożsamości: wyzwalacze kont sprawdzają adres e2e+ w e2e_identities.
UPDATE public.e2e_identities
   SET email = regexp_replace(email, '@familiada\.online$', '@familijna.app')
 WHERE email ~ '@familiada\.online$';

UPDATE auth.users
   SET email = regexp_replace(email, '@familiada\.online$', '@familijna.app', 'i')
 WHERE lower(email) ~ '^e2e\+[a-z]+[0-9]{2}(\.new)?@familiada\.online$';

UPDATE auth.users
   SET email_change = regexp_replace(email_change, '@familiada\.online$', '@familijna.app', 'i')
 WHERE lower(coalesce(email_change, '')) ~ '^e2e\+[a-z]+[0-9]{2}(\.new)?@familiada\.online$';

-- auth.identities.email jest kolumną generowaną z identity_data.
UPDATE auth.identities
   SET identity_data = jsonb_set(identity_data, '{email}',
         to_jsonb(regexp_replace(identity_data->>'email', '@familiada\.online$', '@familijna.app', 'i')))
 WHERE lower(coalesce(identity_data->>'email', '')) ~ '^e2e\+[a-z]+[0-9]{2}(\.new)?@familiada\.online$';

UPDATE public.profiles
   SET email = regexp_replace(email, '@familiada\.online$', '@familijna.app', 'i')
 WHERE lower(coalesce(email, '')) ~ '^e2e\+[a-z]+[0-9]{2}(\.new)?@familiada\.online$';

ALTER TABLE public.e2e_identities ADD CONSTRAINT e2e_identities_email_check
  CHECK (email IS NULL OR email ~ '^e2e\+[a-z]+[0-9]{2}@familijna\.app$');
ALTER TABLE public.e2e_emails ADD CONSTRAINT e2e_emails_recipient_check
  CHECK (recipient ~ '^e2e\+[a-z]+[0-9]{2}(\.new)?@familijna\.app$');

CREATE OR REPLACE FUNCTION public.is_test_email(p_email text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
  SELECT coalesce(
    lower(btrim(p_email)) ~ '^e2e\+[a-z0-9.]+@(familijna\.app|familiada\.online)$'
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE lower(p.email) = lower(btrim(p_email)) AND public.is_test_user(p.id)),
    false);
$_$;

COMMIT;
