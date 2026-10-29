-- 067: messages — add is_read field for tracking read status

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamp with time zone;

-- Index for faster unread queries
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages (direction, is_read, report_id) 
  WHERE deleted_at IS NULL;

-- Update list_messages to include is_read
CREATE OR REPLACE FUNCTION public.list_messages(
  p_filter text DEFAULT 'inbox'::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  source text,
  direction text,
  from_email text,
  to_email text,
  subject text,
  body_preview text,
  report_id uuid,
  ticket_number text,
  report_status text,
  queue_id uuid,
  is_read boolean,
  created_at timestamp with time zone,
  deleted_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Inbox: inbound messages not in trash
  IF p_filter = 'inbox' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        left(m.body, 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.contact_reports r ON r.id = m.report_id
      WHERE m.direction = 'inbound'
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;
  
  -- Sent: outbound messages not in trash
  ELSIF p_filter = 'sent' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        left(m.body, 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.contact_reports r ON r.id = m.report_id
      WHERE m.direction = 'outbound'
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;
  
  -- Trash: all deleted messages
  ELSIF p_filter = 'trash' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        left(m.body, 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.contact_reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NOT NULL
      ORDER BY m.deleted_at DESC
      LIMIT p_limit OFFSET p_offset;
  
  -- Reports: grouped by ticket
  ELSIF p_filter = 'reports' THEN
    RETURN QUERY
      SELECT
        r.id, 'form'::text AS source, 'inbound'::text AS direction,
        r.email AS from_email, NULL::text AS to_email, r.subject,
        left(r.message, 120) AS body_preview,
        r.id AS report_id, r.ticket_number, r.status AS report_status,
        NULL::uuid AS queue_id,
        false AS is_read, r.created_at, NULL::timestamp with time zone AS deleted_at
      FROM public.contact_reports r
      ORDER BY r.created_at DESC
      LIMIT p_limit OFFSET p_offset;
  
  -- All messages (for thread loading)
  ELSE
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        left(m.body, 120) AS body_preview,
        m.report_id, r.ticket_number, r.status AS report_status, m.queue_id,
        m.is_read, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.contact_reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

-- Function to mark message as read
CREATE OR REPLACE FUNCTION public.mark_message_read(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.messages
  SET is_read = true, read_at = now()
  WHERE id = p_message_id;
  
  RETURN FOUND;
END;
$$;
