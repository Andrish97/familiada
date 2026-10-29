-- 455: diagnostyka poczty dla roli agent_reader (414) -- same liczby, bez
-- adresów i treści. Powód: awaria funkcji send-mail 2026-10-21 22:37–22:51 UTC
-- (paczka P2) -- ile powiadomień w oknie dostało przydział (RPC), a ile
-- trafiło do kolejki i wyszło. Okno najwyżej 1 doba.
CREATE OR REPLACE FUNCTION public.agent_mail_window_counts(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(przydzialy bigint, przydzialy_zuzyte bigint, przydzialy_niezuzyte bigint,
  przydzialy_niezuzyte_bez_testowych bigint, kolejka_powiadomien bigint, kolejka_wyslane bigint,
  kolejka_bledy bigint, kolejka_oczekujace bigint, kolejka_inne bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH w AS (
    SELECT p_from AS f, least(p_to, p_from + interval '1 day') AS t
  ), a AS (
    SELECT al.* FROM public.mail_notification_allocations al, w WHERE al.created_at >= w.f AND al.created_at < w.t
  ), q AS (
    SELECT mq.* FROM public.mail_queue mq, w WHERE mq.created_at >= w.f AND mq.created_at < w.t
  )
  SELECT
    (SELECT count(*) FROM a),
    (SELECT count(*) FROM a WHERE consumed_at IS NOT NULL),
    (SELECT count(*) FROM a WHERE consumed_at IS NULL),
    (SELECT count(*) FROM a WHERE consumed_at IS NULL
       AND owner_id NOT IN (SELECT user_id FROM public.stats_exclusions_effective)),
    (SELECT count(*) FROM q WHERE created_by IS NOT NULL),
    (SELECT count(*) FROM q WHERE created_by IS NOT NULL AND status = 'sent'),
    (SELECT count(*) FROM q WHERE created_by IS NOT NULL AND status = 'failed'),
    (SELECT count(*) FROM q WHERE created_by IS NOT NULL AND status IN ('pending', 'sending')),
    (SELECT count(*) FROM q WHERE created_by IS NULL);
$$;
REVOKE EXECUTE ON FUNCTION public.agent_mail_window_counts(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_mail_window_counts(timestamptz, timestamptz) TO agent_reader, service_role;
