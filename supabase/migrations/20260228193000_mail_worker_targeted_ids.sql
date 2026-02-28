-- Mail worker: targeted queue run by selected ids

create or replace function public.mail_queue_pick_selected(
  p_ids uuid[],
  p_limit integer default 25
)
returns setof public.mail_queue
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;

  return query
  with ids as (
    select distinct unnest(p_ids) as id
  ),
  cte as (
    select q.id
      from public.mail_queue q
      join ids on ids.id = q.id
     where q.status = 'pending'
     order by array_position(p_ids, q.id), q.created_at
     limit greatest(1, least(coalesce(p_limit, 25), 200))
     for update of q skip locked
  )
  update public.mail_queue q
     set status = 'sending',
         attempts = q.attempts + 1,
         picked_at = now(),
         last_attempt_at = now()
    from cte
   where q.id = cte.id
  returning q.*;
end;
$function$;

create or replace function public.invoke_mail_worker_ids(
  p_ids uuid[],
  p_limit integer default 25
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_url text :=
    (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
    || '/functions/v1/mail-worker?limit=' || greatest(1, least(coalesce(p_limit, 25), 200))::text;
  v_ids text := '';
  v_anon text := (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'mail_worker_secret');
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    perform public.invoke_mail_worker(p_limit);
    return;
  end if;

  select string_agg(id::text, ',') into v_ids
    from unnest(p_ids) as id;

  if coalesce(v_ids, '') = '' then
    perform public.invoke_mail_worker(p_limit);
    return;
  end if;

  v_url := v_url || '&ids=' || v_ids;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-mail-worker-secret', v_secret
    ),
    body := '{}'::jsonb
  );
end;
$function$;
