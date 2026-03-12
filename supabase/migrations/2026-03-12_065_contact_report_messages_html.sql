-- 065: contact_report_messages — add body_html for storing HTML part of inbound emails

ALTER TABLE public.contact_report_messages ADD COLUMN IF NOT EXISTS body_html text;

-- Update get_report_messages to include body_html and moved_from_report_id
CREATE OR REPLACE FUNCTION public.get_report_messages(p_report_id uuid)
RETURNS TABLE(
  id                   uuid,
  direction            text,
  body                 text,
  body_html            text,
  from_email           text,
  created_at           timestamptz,
  moved_from_report_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  return query
  select m.id, m.direction, m.body, m.body_html, m.from_email, m.created_at, m.moved_from_report_id
  from public.contact_report_messages m
  where m.report_id = p_report_id
  order by m.created_at asc;
end;
$$;

-- Update find_report_and_append_message to accept optional body_html
CREATE OR REPLACE FUNCTION public.find_report_and_append_message(
  p_ticket_number text,
  p_direction     text,
  p_body          text,
  p_from_email    text DEFAULT NULL,
  p_body_html     text DEFAULT NULL
)
RETURNS TABLE(found boolean, report_id uuid, report_lang text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_report record;
BEGIN
  SELECT id, lang, status INTO v_report
    FROM contact_reports
   WHERE ticket_number = p_ticket_number
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  INSERT INTO contact_report_messages(report_id, direction, body, body_html, from_email)
  VALUES (v_report.id, p_direction, p_body, p_body_html, p_from_email);

  -- Reopen ticket on new inbound message if it was replied
  IF p_direction = 'inbound' AND v_report.status = 'replied' THEN
    UPDATE contact_reports SET status = 'open', replied_at = NULL WHERE id = v_report.id;
  END IF;

  RETURN QUERY SELECT true, v_report.id, v_report.lang;
END;
$$;

-- Update submit_contact_report to accept optional body_html
CREATE OR REPLACE FUNCTION public.submit_contact_report(
  p_email      text,
  p_subject    text,
  p_message    text,
  p_lang       text    DEFAULT 'pl',
  p_user_id    uuid    DEFAULT NULL,
  p_ip_address text    DEFAULT NULL,
  p_body_html  text    DEFAULT NULL
)
RETURNS TABLE(ok boolean, err text, ticket_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_ticket    text;
  v_last      timestamptz;
BEGIN
  -- Rate limit: same email within 24h
  SELECT created_at INTO v_last
    FROM contact_reports
   WHERE email = lower(trim(p_email))
     AND created_at > now() - interval '24 hours'
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT false, 'rate_limited_email'::text, NULL::text;
    RETURN;
  END IF;

  -- Rate limit: same IP within 24h (if IP provided)
  IF p_ip_address IS NOT NULL THEN
    SELECT created_at INTO v_last
      FROM contact_reports
     WHERE ip_address = p_ip_address
       AND created_at > now() - interval '24 hours'
     ORDER BY created_at DESC
     LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT false, 'rate_limited_ip'::text, NULL::text;
      RETURN;
    END IF;
  END IF;

  -- Generate ticket number YYYY-NNNN
  SELECT 'TICKET-' || to_char(now(), 'YYYY') || '-' ||
         lpad(((SELECT count(*) FROM contact_reports
                 WHERE date_trunc('year', created_at) = date_trunc('year', now()))::int + 1)::text, 4, '0')
    INTO v_ticket;

  INSERT INTO contact_reports(email, subject, lang, status, user_id, ip_address, ticket_number)
  VALUES (lower(trim(p_email)), left(trim(p_subject), 200), p_lang, 'open', p_user_id, p_ip_address, v_ticket)
  RETURNING id INTO v_report_id;

  INSERT INTO contact_report_messages(report_id, direction, body, body_html, from_email)
  VALUES (v_report_id, 'inbound', p_message, p_body_html, lower(trim(p_email)));

  RETURN QUERY SELECT true, NULL::text, v_ticket;
END;
$$;
