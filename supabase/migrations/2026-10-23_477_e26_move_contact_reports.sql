-- E26 B4 (decyzja użytkownika 2026-10-23): zgłoszenia starego formularza
-- (contact_reports + contact_report_messages, marzec) przeniesione do nowego
-- modelu panelu (reports + messages), potem stare funkcje i tabele znikają.
--
-- Mapowanie (jak zapisuje nowy formularz, submit_report / admin compose):
--  * zgłoszenie -> reports: to samo id, ten sam numer (wątki maili po numerze
--    w temacie dalej trafiają), status closed -> closed, reszta -> open;
--    przy kolizji numeru nowy numer z generate_ticket_number();
--  * treść zgłoszenia -> messages: source 'form', inbound, od e-maila autora;
--  * reply_message -> messages: source 'compose', outbound, do autora;
--  * contact_report_messages -> messages: inbound 'email' / outbound
--    'compose', przypięte do zgłoszenia (moved_from_report_id pomijane).
-- Wszystko oznaczone jako przeczytane (stare sprawy).
-- Najwyżej 3 s czekania na blokadę tabel używanych przez graczy: inaczej
-- migracja wycofuje się w całości (bez zmian) i jest ponawiana później.
SET LOCAL lock_timeout = '3s';
DO $$
DECLARE r record; v_ticket text; n_reports integer := 0; n_messages integer := 0; c integer;
BEGIN
  FOR r IN SELECT * FROM public.contact_reports ORDER BY created_at LOOP
    v_ticket := r.ticket_number;
    IF EXISTS (SELECT 1 FROM public.reports WHERE ticket_number = v_ticket) THEN
      v_ticket := public.generate_ticket_number();
    END IF;
    INSERT INTO public.reports (id, ticket_number, status, subject, lang, created_at)
    VALUES (r.id, v_ticket, CASE WHEN r.status = 'closed' THEN 'closed' ELSE 'open' END,
            r.subject, r.lang, r.created_at);
    n_reports := n_reports + 1;

    INSERT INTO public.messages (source, direction, from_email, to_email, subject, body, report_id,
                                 created_at, is_read, read_at)
    VALUES ('form', 'inbound', lower(trim(r.email)), NULL, r.subject, r.message, r.id,
            r.created_at, true, r.created_at);
    n_messages := n_messages + 1;

    IF coalesce(r.reply_message, '') <> '' THEN
      INSERT INTO public.messages (source, direction, from_email, to_email, subject, body, report_id,
                                   created_at, is_read, read_at)
      VALUES ('compose', 'outbound', NULL, lower(trim(r.email)), 'Re: ' || r.subject, r.reply_message, r.id,
              coalesce(r.replied_at, r.updated_at), true, coalesce(r.replied_at, r.updated_at));
      n_messages := n_messages + 1;
    END IF;
  END LOOP;

  INSERT INTO public.messages (source, direction, from_email, to_email, subject, body, report_id,
                               created_at, is_read, read_at)
  SELECT CASE WHEN m.direction = 'inbound' THEN 'email' ELSE 'compose' END, m.direction,
         CASE WHEN m.direction = 'inbound' THEN lower(trim(coalesce(m.from_email, cr.email))) ELSE m.from_email END,
         CASE WHEN m.direction = 'outbound' THEN lower(trim(cr.email)) END,
         CASE WHEN m.direction = 'outbound' THEN 'Re: ' ELSE '' END || cr.subject,
         m.body, m.report_id, m.created_at, true, m.created_at
  FROM public.contact_report_messages m
  JOIN public.contact_reports cr ON cr.id = m.report_id;
  GET DIAGNOSTICS c = ROW_COUNT;
  n_messages := n_messages + c;

  RAISE NOTICE 'E26 B4: przeniesiono zgłoszeń %, wiadomości %', n_reports, n_messages;
END $$;

CREATE OR REPLACE FUNCTION "public"."list_messages"("p_filter" "text" DEFAULT 'inbox'::"text", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "source" "text", "direction" "text", "from_email" "text", "to_email" "text", "subject" "text", "body" "text", "body_html" "text", "body_preview" "text", "report_id" "uuid", "ticket_number" "text", "report_status" "text", "queue_id" "uuid", "is_read" boolean, "is_marketing" boolean, "created_at" timestamp with time zone, "deleted_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Inbox: przychodzące, nie w koszu
  IF p_filter = 'inbox' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'inbound' AND m.deleted_at IS NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Sent: wychodzące (w tym marketingowe), nie w koszu
  ELSIF p_filter = 'sent' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'outbound' AND m.deleted_at IS NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Marketing: wszystkie oznaczone jako marketing (przychodzące i wychodzące)
  ELSIF p_filter = 'marketing' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.is_marketing = true AND m.deleted_at IS NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Trash: usunięte
  ELSIF p_filter = 'trash' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NOT NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.deleted_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- All: wszystko (dla wątków)
  ELSE
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(regexp_replace(COALESCE(m.body_html, m.body), E'<!--[\\s\\S]*?-->', '', 'g'), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NULL
        AND NOT public.is_test_email(CASE WHEN m.direction = 'inbound' THEN m.from_email ELSE m.to_email END)
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

DROP FUNCTION public.submit_contact_report("text", "text", "text", "text", "uuid");
DROP FUNCTION public.submit_contact_report("text", "text", "text", "text", "uuid", "text");

DROP FUNCTION public.find_report_and_append_message("text", "text", "text", "text");

DROP FUNCTION public.admin_move_message("uuid", "text");

DROP FUNCTION public.admin_update_contact_report("uuid", "text", "text");

DROP TABLE public.contact_report_messages;
DROP TABLE public.contact_reports;

DROP FUNCTION public.contact_reports_set_updated_at();
