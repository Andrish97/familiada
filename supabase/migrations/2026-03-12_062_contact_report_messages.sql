-- 062: contact_report_messages — wątek rozmowy w zgłoszeniu

-- ============================================================
-- TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contact_report_messages (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id   uuid        NOT NULL REFERENCES public.contact_reports(id) ON DELETE CASCADE,
  direction   text        NOT NULL CHECK (direction IN ('inbound','outbound')),
  body        text        NOT NULL,
  from_email  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_report_id_idx
  ON public.contact_report_messages(report_id, created_at);

ALTER TABLE public.contact_report_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MIGRATE EXISTING DATA (one-time)
-- ============================================================

-- Initial messages from existing tickets
INSERT INTO public.contact_report_messages (report_id, direction, body, from_email, created_at)
SELECT id, 'inbound', message, email, created_at
FROM public.contact_reports
WHERE NOT EXISTS (
  SELECT 1 FROM public.contact_report_messages m WHERE m.report_id = contact_reports.id
);

-- Existing reply_message fields
INSERT INTO public.contact_report_messages (report_id, direction, body, from_email, created_at)
SELECT id, 'outbound', reply_message, 'kontakt@familiada.online', coalesce(replied_at, updated_at)
FROM public.contact_reports
WHERE reply_message IS NOT NULL;

-- ============================================================
-- RPC: submit_contact_report — also inserts initial message
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_contact_report(
  p_email      text,
  p_subject    text,
  p_message    text,
  p_lang       text    DEFAULT 'pl',
  p_user_id    uuid    DEFAULT null,
  p_ip_address text    DEFAULT null
)
RETURNS TABLE(ok boolean, err text, ticket_number text, id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_ticket text;
  v_id     uuid;
  v_count  int;
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

  -- rate limit: same email within 24h
  if p_ip_address is null then
    select count(*) into v_count
    from public.contact_reports
    where lower(trim(email)) = lower(trim(p_email))
      and created_at > now() - interval '24 hours';
    if v_count > 0 then
      return query select false, 'rate_limited_email'::text, null::text, null::uuid;
      return;
    end if;
  else
    select count(*) into v_count
    from public.contact_reports
    where lower(trim(email)) = lower(trim(p_email))
      and created_at > now() - interval '24 hours';
    if v_count > 0 then
      return query select false, 'rate_limited_email'::text, null::text, null::uuid;
      return;
    end if;

    select count(*) into v_count
    from public.contact_reports
    where ip_address = p_ip_address
      and created_at > now() - interval '24 hours';
    if v_count > 0 then
      return query select false, 'rate_limited_ip'::text, null::text, null::uuid;
      return;
    end if;
  end if;

  v_ticket := public.gen_contact_ticket_number();

  insert into public.contact_reports (ticket_number, email, subject, message, lang, status, user_id, ip_address)
  values (v_ticket, lower(trim(p_email)), trim(p_subject), trim(p_message), p_lang, 'open', p_user_id, p_ip_address)
  returning contact_reports.id into v_id;

  -- insert initial message into thread
  insert into public.contact_report_messages (report_id, direction, body, from_email)
  values (v_id, 'inbound', trim(p_message), lower(trim(p_email)));

  return query select true, null::text, v_ticket, v_id;
end;
$$;

-- ============================================================
-- RPC: admin_update_contact_report — also logs outbound message
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

  -- log outbound message to thread
  if p_reply_message is not null then
    insert into public.contact_report_messages (report_id, direction, body, from_email)
    values (p_id, 'outbound', p_reply_message, 'kontakt@familiada.online');
  end if;

  return query select true, null::text;
end;
$$;

-- ============================================================
-- RPC: find_report_and_append_message — for email inbound handler
-- ============================================================

CREATE OR REPLACE FUNCTION public.find_report_and_append_message(
  p_ticket_number text,
  p_direction     text,
  p_body          text,
  p_from_email    text DEFAULT null
)
RETURNS TABLE(found boolean, report_id uuid, report_email text, report_lang text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_report public.contact_reports%ROWTYPE;
begin
  select * into v_report
  from public.contact_reports
  where ticket_number = p_ticket_number
  limit 1;

  if not FOUND then
    return query select false, null::uuid, null::text, null::text;
    return;
  end if;

  insert into public.contact_report_messages (report_id, direction, body, from_email)
  values (v_report.id, p_direction, p_body, p_from_email);

  -- if user replied to a replied ticket, reopen it
  if p_direction = 'inbound' and v_report.status = 'replied' then
    update public.contact_reports
    set status = 'open', updated_at = now()
    where id = v_report.id;
  end if;

  return query select true, v_report.id, v_report.email, v_report.lang;
end;
$$;

-- ============================================================
-- RPC: get_report_messages — fetch thread for admin panel
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_report_messages(p_report_id uuid)
RETURNS TABLE(
  id         uuid,
  direction  text,
  body       text,
  from_email text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  return query
  select m.id, m.direction, m.body, m.from_email, m.created_at
  from public.contact_report_messages m
  where m.report_id = p_report_id
  order by m.created_at asc;
end;
$$;
