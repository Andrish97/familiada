-- Regresja dat: dokładny korespondent, oba kierunki, kosz, stare wysyłki,
-- brak historii oraz polskie dni na granicy zmiany czasu. Wszystko rollback.
BEGIN;
INSERT INTO public.marketing_verified_contacts (id,email,url,added_at,last_sent_at) VALUES
 ('49700000-0000-4000-8000-000000000001','Anna_100%@example.test','https://example.test','2026-10-24 22:30Z','2026-10-20 10:00Z'),
 ('49700000-0000-4000-8000-000000000002','old@example.test','https://example.test','2026-10-01 10:00Z','2026-10-10 10:00Z'),
 ('49700000-0000-4000-8000-000000000003','none@example.test','https://example.test','2026-10-01 10:00Z',NULL),
 ('49700000-0000-4000-8000-000000000004','sent@example.test','https://example.test','2026-10-01 10:00Z',NULL);
INSERT INTO public.messages (direction,from_email,to_email,created_at,deleted_at) VALUES
 ('outbound','kontakt@familiada.online','anna_100%@EXAMPLE.TEST','2026-10-25 09:00Z',NULL),
 ('inbound','ANNA_100%@example.test','kontakt@familiada.online','2026-10-25 23:30Z',NULL),
 ('inbound','anna_100%@example.test','kontakt@familiada.online','2026-10-28 10:00Z','2026-10-28 11:00Z'),
 ('outbound','kontakt@familiada.online','another@example.test','2026-10-29 10:00Z',NULL),
 ('inbound','annaX100extra@example.test','kontakt@familiada.online','2026-10-30 10:00Z',NULL),
 ('outbound','kontakt@familiada.online','sent@example.test','2026-10-23 09:00Z',NULL);
DO $$
DECLARE r record;
BEGIN
 SELECT * INTO STRICT r FROM public.marketing_contacts_view WHERE id='49700000-0000-4000-8000-000000000001';
 IF r.last_message_at IS DISTINCT FROM '2026-10-25 23:30Z'::timestamptz
    OR r.added_date IS DISTINCT FROM '2026-10-25'::date
    OR r.last_message_date IS DISTINCT FROM '2026-10-26'::date THEN RAISE EXCEPTION 'kontakt/dokładny adres/oba kierunki/kosz/daty DST'; END IF;
 IF (SELECT last_message_at FROM public.marketing_contacts_view WHERE id='49700000-0000-4000-8000-000000000002') IS DISTINCT FROM '2026-10-10 10:00Z'::timestamptz THEN RAISE EXCEPTION 'data starej wysyłki'; END IF;
 IF (SELECT last_message_at FROM public.marketing_contacts_view WHERE id='49700000-0000-4000-8000-000000000003') IS NOT NULL THEN RAISE EXCEPTION 'brak historii'; END IF;
 IF (SELECT last_message_at FROM public.marketing_contacts_view WHERE id='49700000-0000-4000-8000-000000000004') IS DISTINCT FROM '2026-10-23 09:00Z'::timestamptz THEN RAISE EXCEPTION 'ostatnia wychodząca bez przychodzących'; END IF;
 IF (SELECT count(*) FROM public.marketing_contacts_view WHERE id::text LIKE '49700000%' AND added_date >= '2026-10-25' AND added_date <= '2026-10-25') <> 1 THEN RAISE EXCEPTION 'domknięty zakres dnia'; END IF;
 IF (SELECT id FROM public.marketing_contacts_view WHERE id::text LIKE '49700000%' ORDER BY last_message_at DESC NULLS LAST, id LIMIT 1) <> '49700000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'kolejność malejąca'; END IF;
 IF (SELECT id FROM public.marketing_contacts_view WHERE id::text LIKE '49700000%' ORDER BY last_message_at ASC NULLS LAST, id LIMIT 1) <> '49700000-0000-4000-8000-000000000002'::uuid THEN RAISE EXCEPTION 'kolejność rosnąca'; END IF;
 IF has_table_privilege('anon','public.marketing_contacts_view','SELECT') OR has_table_privilege('authenticated','public.marketing_contacts_view','SELECT') THEN RAISE EXCEPTION 'widok dostępny poza service_role'; END IF;
 IF NOT has_table_privilege('service_role','public.marketing_contacts_view','SELECT') THEN RAISE EXCEPTION 'brak dostępu service_role'; END IF;
END $$;
ROLLBACK;
