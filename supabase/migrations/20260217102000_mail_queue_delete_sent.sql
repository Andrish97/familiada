-- Remove successfully sent emails from mail_queue to avoid table bloat.

begin;

create or replace function public.mail_queue_mark(p_id uuid, p_ok boolean, p_provider text, p_error text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_ok then
    -- sukcesy nie muszą zalegać w kolejce
    delete from public.mail_queue
    where id = p_id;
  else
    update public.mail_queue
    set status = 'failed',
        provider_used = p_provider,
        last_error = left(coalesce(p_error,''), 2000)
    where id = p_id;
  end if;
end;
$function$;

commit;
