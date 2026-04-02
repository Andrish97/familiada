-- 076: Add is_marketing to get_message RPC

-- Drop and recreate get_message with is_marketing column
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
    LEFT JOIN public.contact_reports r ON r.id = m.report_id
    WHERE m.id = p_id;
END;
$$;
