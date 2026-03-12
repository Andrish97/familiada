-- 060: contact_reports — formularz kontaktowy / zgłoszenia użytkowników

-- ============================================================
-- SEQUENCE
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.contact_report_seq START 1;

-- ============================================================
-- TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contact_reports (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_number  text        NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  email          text        NOT NULL CHECK (email LIKE '%@%'),
  subject        text        NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  message        text        NOT NULL CHECK (char_length(message) BETWEEN 5 AND 5000),
  lang           text        NOT NULL DEFAULT 'pl' CHECK (lang IN ('pl','en','uk')),
  status         text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','replied','closed')),
  user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reply_message  text,
  replied_at     timestamptz
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.contact_reports_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;

DROP TRIGGER IF EXISTS contact_reports_updated_at ON public.contact_reports;
CREATE TRIGGER contact_reports_updated_at
  BEFORE UPDATE ON public.contact_reports
  FOR EACH ROW EXECUTE FUNCTION public.contact_reports_set_updated_at();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.contact_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cr_select_own ON public.contact_reports;
CREATE POLICY cr_select_own ON public.contact_reports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- HELPER: generate ticket number
-- ============================================================

CREATE OR REPLACE FUNCTION public.gen_contact_ticket_number()
RETURNS text
LANGUAGE plpgsql
AS $$
declare
  v_year text;
  v_seq  bigint;
begin
  v_year := to_char(now(), 'YYYY');
  v_seq  := nextval('public.contact_report_seq');
  return v_year || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- ============================================================
-- RPC: submit_contact_report
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_contact_report(
  p_email    text,
  p_subject  text,
  p_message  text,
  p_lang     text    DEFAULT 'pl',
  p_user_id  uuid    DEFAULT null
)
RETURNS TABLE(ok boolean, err text, ticket_number text, id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_ticket text;
  v_id     uuid;
begin
  -- validate email
  if p_email is null or p_email not like '%@%' then
    return query select false, 'invalid_email'::text, null::text, null::uuid;
    return;
  end if;

  -- validate subject
  if p_subject is null or char_length(trim(p_subject)) < 1 or char_length(p_subject) > 200 then
    return query select false, 'invalid_subject'::text, null::text, null::uuid;
    return;
  end if;

  -- validate message
  if p_message is null or char_length(trim(p_message)) < 5 or char_length(p_message) > 5000 then
    return query select false, 'invalid_message'::text, null::text, null::uuid;
    return;
  end if;

  -- validate lang
  if p_lang not in ('pl','en','uk') then
    return query select false, 'invalid_lang'::text, null::text, null::uuid;
    return;
  end if;

  v_ticket := public.gen_contact_ticket_number();

  insert into public.contact_reports (ticket_number, email, subject, message, lang, status, user_id)
  values (v_ticket, lower(trim(p_email)), trim(p_subject), trim(p_message), p_lang, 'open', p_user_id)
  returning contact_reports.id into v_id;

  return query select true, null::text, v_ticket, v_id;
end;
$$;

-- ============================================================
-- RPC: admin_update_contact_report
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_contact_report(
  p_id            uuid,
  p_status        text DEFAULT null,
  p_reply_message text DEFAULT null
)
RETURNS TABLE(ok boolean, err text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_exists boolean;
begin
  select exists(select 1 from public.contact_reports where id = p_id) into v_exists;
  if not v_exists then
    return query select false, 'not_found'::text;
    return;
  end if;

  if p_status is not null and p_status not in ('open','replied','closed') then
    return query select false, 'invalid_status'::text;
    return;
  end if;

  update public.contact_reports
  set
    status        = coalesce(p_status, status),
    reply_message = coalesce(p_reply_message, reply_message),
    replied_at    = case
                      when p_status = 'replied' then now()
                      else replied_at
                    end
  where id = p_id;

  return query select true, null::text;
end;
$$;
