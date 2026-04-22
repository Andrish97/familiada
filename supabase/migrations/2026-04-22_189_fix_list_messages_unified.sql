-- 2026-04-22_175_fix_list_messages_unified.sql
-- Kompleksowa poprawka funkcji list_messages: obsługa folderu marketingowego na poziomie serwera

CREATE OR REPLACE FUNCTION public.list_messages(p_filter text DEFAULT 'inbox'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, source text, direction text, from_email text, to_email text, subject text, body text, body_html text, body_preview text, report_id uuid, ticket_number text, report_status text, queue_id uuid, is_read boolean, is_marketing boolean, created_at timestamp with time zone, deleted_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Inbox: przychodzące, nie w koszu
  IF p_filter = 'inbox' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(COALESCE(m.body_html, m.body), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'inbound' AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Sent: wychodzące (w tym marketingowe), nie w koszu
  ELSIF p_filter = 'sent' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(COALESCE(m.body_html, m.body), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'outbound' AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Marketing: wszystkie oznaczone jako marketing (przychodzące i wychodzące)
  ELSIF p_filter = 'marketing' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(COALESCE(m.body_html, m.body), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.is_marketing = true AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Trash: usunięte
  ELSIF p_filter = 'trash' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(COALESCE(m.body_html, m.body), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NOT NULL
      ORDER BY m.deleted_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- Reports: zgłoszenia z formularza
  ELSIF p_filter = 'reports' THEN
    RETURN QUERY
      SELECT
        r.id, 'form'::text AS source, 'inbound'::text AS direction,
        r.email AS from_email, NULL::text AS to_email, r.subject,
        NULL::text AS body, NULL::text AS body_html,
        left(r.message, 120) AS body_preview,
        r.id AS report_id, r.ticket_number, r.status AS report_status,
        NULL::uuid AS queue_id, false AS is_read, false AS is_marketing, r.created_at, NULL::timestamp AS deleted_at
      FROM public.contact_reports r
      ORDER BY r.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  -- All: wszystko (dla wątków)
  ELSE
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        m.body, m.body_html,
        left(regexp_replace(COALESCE(m.body_html, m.body), E'<style[^>]*>[\\s\\S]*?</style>', '', 'gi'), 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.is_marketing, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$function$;
