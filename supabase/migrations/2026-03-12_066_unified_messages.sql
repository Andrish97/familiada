-- ============================================================
-- 066 — Unified messages system
-- reports: ticket grouping, messages: all inbound/outbound/form
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLES
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text        UNIQUE NOT NULL,
  status        text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  subject       text        NOT NULL DEFAULT '',
  lang          text        NOT NULL DEFAULT 'pl',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text        NOT NULL DEFAULT 'email' CHECK (source IN ('email','form','compose')),
  direction   text        NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_email  text,
  to_email    text,
  subject     text        NOT NULL DEFAULT '',
  body        text        NOT NULL DEFAULT '',
  body_html   text,
  report_id   uuid        REFERENCES public.reports(id) ON DELETE SET NULL,
  queue_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- ────────────────────────────────────────────────────────────
-- INDEXES
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS messages_created_at_idx  ON public.messages (created_at DESC);
CREATE INDEX IF NOT EXISTS messages_report_id_idx   ON public.messages (report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_deleted_at_idx  ON public.messages (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_direction_idx   ON public.messages (direction);
CREATE INDEX IF NOT EXISTS reports_status_idx       ON public.reports (status);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'No public access'
  ) THEN
    CREATE POLICY "No public access" ON public.reports FOR ALL USING (false);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'No public access'
  ) THEN
    CREATE POLICY "No public access" ON public.messages FOR ALL USING (false);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- RPC: generate_ticket_number
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year  int;
  v_seq   int;
  v_num   text;
BEGIN
  v_year := EXTRACT(year FROM now())::int;
  SELECT COUNT(*) + 1
    INTO v_seq
    FROM public.reports
   WHERE EXTRACT(year FROM created_at)::int = v_year;
  v_num := 'TICKET-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');
  -- handle collision
  WHILE EXISTS (SELECT 1 FROM public.reports WHERE ticket_number = v_num) LOOP
    v_seq := v_seq + 1;
    v_num := 'TICKET-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');
  END LOOP;
  RETURN v_num;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: create_report
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_report(
  p_subject text,
  p_lang    text DEFAULT 'pl'
)
RETURNS TABLE(id uuid, ticket_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket text;
  v_id     uuid;
BEGIN
  v_ticket := public.generate_ticket_number();
  INSERT INTO public.reports (ticket_number, status, subject, lang)
  VALUES (v_ticket, 'open', COALESCE(p_subject,''), COALESCE(p_lang,'pl'))
  RETURNING reports.id INTO v_id;
  RETURN QUERY SELECT v_id, v_ticket;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: save_inbound_message
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_inbound_message(
  p_from_email    text,
  p_subject       text,
  p_body          text,
  p_body_html     text    DEFAULT NULL,
  p_ticket_number text    DEFAULT NULL
)
RETURNS TABLE(id uuid, report_id uuid, ticket_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id  uuid;
  v_ticket     text;
  v_msg_id     uuid;
  v_clean_ticket text;
BEGIN
  -- normalise ticket: strip TICKET- prefix if present, keep YYYY-NNNN part
  IF p_ticket_number IS NOT NULL AND p_ticket_number <> '' THEN
    v_clean_ticket := regexp_replace(p_ticket_number, '^TICKET-', '');
    -- try full match first
    SELECT r.id, r.ticket_number INTO v_report_id, v_ticket
      FROM public.reports r
     WHERE r.ticket_number = p_ticket_number
        OR r.ticket_number = 'TICKET-' || v_clean_ticket
     LIMIT 1;
  END IF;

  INSERT INTO public.messages (source, direction, from_email, subject, body, body_html, report_id)
  VALUES ('email', 'inbound', p_from_email, COALESCE(p_subject,''), COALESCE(p_body,''), p_body_html, v_report_id)
  RETURNING messages.id INTO v_msg_id;

  RETURN QUERY SELECT v_msg_id, v_report_id, v_ticket;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: save_form_message
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_form_message(
  p_email   text,
  p_subject text,
  p_body    text,
  p_lang    text DEFAULT 'pl'
)
RETURNS TABLE(ok boolean, err text, message_id uuid, ticket_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id  uuid;
  v_ticket     text;
  v_msg_id     uuid;
  v_last_ts    timestamptz;
BEGIN
  -- rate limit: 1 form message per email per 24h
  SELECT MAX(m.created_at) INTO v_last_ts
    FROM public.messages m
   WHERE m.source = 'form'
     AND m.from_email = lower(trim(p_email))
     AND m.created_at > now() - interval '24 hours';

  IF v_last_ts IS NOT NULL THEN
    RETURN QUERY SELECT false, 'rate_limited_email'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  -- create report
  v_ticket := public.generate_ticket_number();
  INSERT INTO public.reports (ticket_number, status, subject, lang)
  VALUES (v_ticket, 'open', COALESCE(p_subject,''), COALESCE(p_lang,'pl'))
  RETURNING id INTO v_report_id;

  -- create message
  INSERT INTO public.messages (source, direction, from_email, subject, body, report_id)
  VALUES ('form', 'inbound', lower(trim(p_email)), COALESCE(p_subject,''), COALESCE(p_body,''), v_report_id)
  RETURNING id INTO v_msg_id;

  RETURN QUERY SELECT true, NULL::text, v_msg_id, v_ticket;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: save_outbound_message
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_outbound_message(
  p_to_email   text,
  p_subject    text,
  p_body       text,
  p_body_html  text    DEFAULT NULL,
  p_report_id  uuid    DEFAULT NULL,
  p_queue_id   uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg_id uuid;
BEGIN
  INSERT INTO public.messages (source, direction, to_email, subject, body, body_html, report_id, queue_id)
  VALUES ('compose', 'outbound', p_to_email, COALESCE(p_subject,''), COALESCE(p_body,''), p_body_html, p_report_id, p_queue_id)
  RETURNING id INTO v_msg_id;
  RETURN v_msg_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: list_messages
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_messages(
  p_filter text    DEFAULT 'inbox',
  p_limit  int     DEFAULT 50,
  p_offset int     DEFAULT 0
)
RETURNS TABLE(
  id           uuid,
  source       text,
  direction    text,
  from_email   text,
  to_email     text,
  subject      text,
  body_preview text,
  report_id    uuid,
  ticket_number text,
  report_status text,
  queue_id     uuid,
  created_at   timestamptz,
  deleted_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  -- check if filter is a UUID (report view)
  BEGIN
    v_report_id := p_filter::uuid;
  EXCEPTION WHEN others THEN
    v_report_id := NULL;
  END;

  IF v_report_id IS NOT NULL THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        left(m.body, 120) AS body_preview,
        m.report_id,
        r.ticket_number,
        r.status AS report_status,
        m.queue_id, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.report_id = v_report_id
        AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC
      LIMIT p_limit OFFSET p_offset;

  ELSIF p_filter = 'inbox' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        left(m.body, 120),
        m.report_id, r.ticket_number, r.status,
        m.queue_id, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'inbound'
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  ELSIF p_filter = 'sent' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        left(m.body, 120),
        m.report_id, r.ticket_number, r.status,
        m.queue_id, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.direction = 'outbound'
        AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT p_limit OFFSET p_offset;

  ELSIF p_filter = 'trash' THEN
    RETURN QUERY
      SELECT
        m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
        left(m.body, 120),
        m.report_id, r.ticket_number, r.status,
        m.queue_id, m.created_at, m.deleted_at
      FROM public.messages m
      LEFT JOIN public.reports r ON r.id = m.report_id
      WHERE m.deleted_at IS NOT NULL
      ORDER BY m.deleted_at DESC
      LIMIT p_limit OFFSET p_offset;

  ELSE
    -- unknown filter → empty
    RETURN;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: get_message
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_message(p_id uuid)
RETURNS TABLE(
  id            uuid,
  source        text,
  direction     text,
  from_email    text,
  to_email      text,
  subject       text,
  body          text,
  body_html     text,
  report_id     uuid,
  ticket_number text,
  report_status text,
  report_subject text,
  queue_id      uuid,
  created_at    timestamptz,
  deleted_at    timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      m.id, m.source, m.direction, m.from_email, m.to_email, m.subject,
      m.body, m.body_html,
      m.report_id,
      r.ticket_number,
      r.status       AS report_status,
      r.subject      AS report_subject,
      m.queue_id, m.created_at, m.deleted_at
    FROM public.messages m
    LEFT JOIN public.reports r ON r.id = m.report_id
    WHERE m.id = p_id
    LIMIT 1;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: assign_message_to_report
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_message_to_report(
  p_message_id uuid,
  p_report_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages SET report_id = p_report_id WHERE id = p_message_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: unassign_message_report
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unassign_message_report(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages SET report_id = NULL WHERE id = p_message_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: trash_message
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trash_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages SET deleted_at = now() WHERE id = p_message_id AND deleted_at IS NULL;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: restore_message
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.restore_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages SET deleted_at = NULL WHERE id = p_message_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: delete_message (hard, only from trash)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages WHERE id = p_message_id AND deleted_at IS NOT NULL;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: cleanup_trash
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_trash()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM public.messages
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - interval '30 days'
     RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: list_reports
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_reports(
  p_status text DEFAULT 'all',
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0
)
RETURNS TABLE(
  id              uuid,
  ticket_number   text,
  status          text,
  subject         text,
  lang            text,
  created_at      timestamptz,
  message_count   bigint,
  last_message_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      r.id,
      r.ticket_number,
      r.status,
      r.subject,
      r.lang,
      r.created_at,
      COUNT(m.id)        AS message_count,
      MAX(m.created_at)  AS last_message_at
    FROM public.reports r
    LEFT JOIN public.messages m ON m.report_id = r.id AND m.deleted_at IS NULL
    WHERE p_status = 'all' OR r.status = p_status
    GROUP BY r.id
    ORDER BY COALESCE(MAX(m.created_at), r.created_at) DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- RPC: set_report_status
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_report_status(
  p_report_id uuid,
  p_status    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('open','closed') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;
  UPDATE public.reports SET status = p_status WHERE id = p_report_id;
END;
$$;
