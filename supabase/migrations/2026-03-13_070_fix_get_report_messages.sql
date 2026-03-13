-- 070: fix get_report_messages — read from unified messages table instead of legacy contact_report_messages

CREATE OR REPLACE FUNCTION public.get_report_messages(p_report_id uuid)
RETURNS TABLE(
  id          uuid,
  source      text,
  direction   text,
  from_email  text,
  to_email    text,
  subject     text,
  body        text,
  body_html   text,
  created_at  timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      m.id,
      m.source,
      m.direction,
      m.from_email,
      m.to_email,
      m.subject,
      m.body,
      m.body_html,
      m.created_at
    FROM public.messages m
    WHERE m.report_id = p_report_id
      AND m.deleted_at IS NULL
    ORDER BY m.created_at ASC;
END;
$$;
