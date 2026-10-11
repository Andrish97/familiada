-- Uruchamiać na odtworzonym schemacie po migracji 326; wszystko w rollbacku.
BEGIN;
DO $$
DECLARE n integer; privilege text;
BEGIN
  FOR n IN 1..14 LOOP
    INSERT INTO public.e2e_emails(recipient,subject) VALUES ('test'||n||'@familiada.online','fixture 326');
  END LOOP;
  FOR n IN 0..15 LOOP
    IF n BETWEEN 1 AND 14 THEN CONTINUE; END IF;
    BEGIN
      INSERT INTO public.e2e_emails(recipient) VALUES ('test'||n||'@familiada.online');
      RAISE EXCEPTION 'invalid recipient accepted: %',n;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  BEGIN
    INSERT INTO public.e2e_emails(recipient) VALUES ('real@example.com');
    RAISE EXCEPTION 'non-test email accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','DELETE'] LOOP
    IF has_table_privilege('anon','public.e2e_emails',privilege)
       OR has_table_privilege('authenticated','public.e2e_emails',privilege) THEN
      RAISE EXCEPTION 'public mailbox privilege: %',privilege;
    END IF;
    IF NOT has_table_privilege('service_role','public.e2e_emails',privilege) THEN
      RAISE EXCEPTION 'missing worker privilege: %',privilege;
    END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.e2e_emails'::regclass) THEN
    RAISE EXCEPTION 'missing RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.e2e_emails WHERE subject='fixture 326'
             AND expires_at-received_at <> interval '24 hours') THEN
    RAISE EXCEPTION 'invalid TTL';
  END IF;
  RAISE NOTICE '326: allowed 1..14; rejected 0,15,non-test; RLS/permissions/TTL OK';
END $$;
ROLLBACK;
