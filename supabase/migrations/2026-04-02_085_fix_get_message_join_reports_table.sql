-- 085: Fix get_message to JOIN on reports table (not contact_reports)
-- messages.report_id is a FK to reports.id, not contact_reports.id

DROP FUNCTION IF EXISTS public.get_message(uuid);

CREATE FUNCTION public.get_message(p_id uuid)
RETURNS TABLE (
  id uuid,
  source text,
  direction text,
  from_email text,
  to_email text,
  subject text,
  body text,
  body_html text,
  report_id uuid,
  ticket_number text,
  report_status text,
  report_subject text,
  queue_id uuid,
  is_marketing boolean,
  created_at timestamp with time zone,
  deleted_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    SELECT
      m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
      m.body, m.body_html,
      m.report_id, r.ticket_number, r.status AS report_status, r.subject AS report_subject,
      m.queue_id, m.is_marketing,
      m.created_at, m.deleted_at
    FROM public.messages m
    LEFT JOIN public.reports r ON r.id = m.report_id
    WHERE m.id = p_id;
END;
$$;
