-- 061: contact_reports — rate limiting (1 zgłoszenie / email i / IP na 24h)

-- Dodaj kolumnę ip_address do przechowywania IP zgłaszającego
ALTER TABLE public.contact_reports
  ADD COLUMN IF NOT EXISTS ip_address text;

-- Zaktualizuj RPC submit_contact_report o sprawdzenie rate limit
CREATE OR REPLACE FUNCTION public.submit_contact_report(
  p_email      text,
  p_subject    text,
  p_message    text,
  p_lang       text DEFAULT 'pl',
  p_user_id    uuid DEFAULT null,
  p_ip_address text DEFAULT null
)
RETURNS TABLE(ok boolean, err text, ticket_number text, id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_ticket text;
  v_id     uuid;
  v_email  text;
begin
  v_email := lower(trim(p_email));

  -- validate email
  if v_email = '' or v_email not like '%@%' then
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

  -- rate limit: 1 zgłoszenie per email na 24h
  if exists (
    select 1 from public.contact_reports
    where email = v_email
      and created_at > now() - interval '24 hours'
  ) then
    return query select false, 'rate_limited_email'::text, null::text, null::uuid;
    return;
  end if;

  -- rate limit: 1 zgłoszenie per IP na 24h (jeśli IP podane)
  if p_ip_address is not null and trim(p_ip_address) <> '' and exists (
    select 1 from public.contact_reports
    where ip_address = trim(p_ip_address)
      and created_at > now() - interval '24 hours'
  ) then
    return query select false, 'rate_limited_ip'::text, null::text, null::uuid;
    return;
  end if;

  v_ticket := public.gen_contact_ticket_number();

  insert into public.contact_reports (ticket_number, email, subject, message, lang, status, user_id, ip_address)
  values (v_ticket, v_email, trim(p_subject), trim(p_message), p_lang, 'open', p_user_id,
          nullif(trim(coalesce(p_ip_address, '')), ''))
  returning contact_reports.id into v_id;

  return query select true, null::text, v_ticket, v_id;
end;
$$;
