-- Rebranding: wewnętrzne nazwy familiada → familijna (plan rebrandingu, etap C).
-- 1) Zadania pg_cron: zmiana nazwy w miejscu (ta sama komenda i harmonogram).
-- 2) mail_cron_set: domyślna nazwa zadania familijna_mail_worker.
-- 3) Metadane zmiany e-maila w auth.users: familiada_email_change_* → familijna_email_change_*
--    (kod strony, send-email i Worker czytają już tylko nowe klucze — wdrożyć razem).
-- 4) email_get_status czyta familijna_email_change_intent.


do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    update cron.job set jobname = 'familijna_mail_worker' where jobname = 'familiada_mail_worker';
    update cron.job set jobname = 'familijna_market_cleanup' where jobname = 'familiada_market_cleanup';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."mail_cron_set"("p_schedule" "text", "p_active" boolean DEFAULT true, "p_limit" integer DEFAULT 25, "p_job_name" "text" DEFAULT 'familijna_mail_worker'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_has_cron boolean := false;
  v_schedule text := trim(coalesce(p_schedule, ''));
  v_job_name text := trim(coalesce(p_job_name, ''));
  v_job_id bigint;
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 200));
  v_command text;
begin
  if v_schedule = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_schedule');
  end if;

  if v_job_name = '' then
    v_job_name := 'familijna_mail_worker';
  end if;

  select exists(select 1 from pg_namespace where nspname = 'cron') into v_has_cron;
  if not v_has_cron then
    return jsonb_build_object('ok', false, 'error', 'cron_not_available');
  end if;

  v_command := format('select public.invoke_mail_worker(%s);', v_limit);

  begin
    execute format(
      'select jobid from cron.job where jobname = %L or command ilike %L order by active desc, jobid desc limit 1',
      v_job_name,
      '%invoke_mail_worker%'
    )
    into v_job_id;
  exception when undefined_column then
    execute format(
      'select jobid from cron.job where command ilike %L order by active desc, jobid desc limit 1',
      '%invoke_mail_worker%'
    )
    into v_job_id;
  end;

  if v_job_id is null then
    begin
      execute 'select cron.schedule($1,$2,$3)' into v_job_id using v_job_name, v_schedule, v_command;
    exception when undefined_function then
      execute 'select cron.schedule($1,$2)' into v_job_id using v_schedule, v_command;
      begin
        execute format('update cron.job set jobname = %L where jobid = %s', v_job_name, v_job_id);
      exception when undefined_column then
        null;
      end;
    end;
  else
    begin
      execute format(
        'update cron.job set schedule = %L, active = %s, command = %L, jobname = %L where jobid = %s',
        v_schedule,
        case when p_active then 'true' else 'false' end,
        v_command,
        v_job_name,
        v_job_id
      );
    exception when undefined_column then
      execute format(
        'update cron.job set schedule = %L, active = %s, command = %L where jobid = %s',
        v_schedule,
        case when p_active then 'true' else 'false' end,
        v_command,
        v_job_id
      );
    end;
  end if;

  if not p_active then
    execute format('update cron.job set active = false where jobid = %s', v_job_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'cron', public.mail_cron_status()
  );
exception when others then
  return jsonb_build_object(
    'ok', false,
    'error', coalesce(sqlerrm, 'mail_cron_set_failed')
  );
end;
$_$;

update auth.users
set raw_user_meta_data = (raw_user_meta_data - 'familiada_email_change_pending' - 'familiada_email_change_intent')
  || jsonb_strip_nulls(jsonb_build_object(
       'familijna_email_change_pending', raw_user_meta_data->'familiada_email_change_pending',
       'familijna_email_change_intent', raw_user_meta_data->'familiada_email_change_intent'))
where raw_user_meta_data ?| array['familiada_email_change_pending', 'familiada_email_change_intent'];

CREATE OR REPLACE FUNCTION "public"."email_get_status"("p_email" "text") RETURNS TABLE("status" "text", "intent" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user record;
  v_intent record;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return query select 'none'::text, 'signup'::text;
    return;
  end if;

  select
    u.id,
    u.email_confirmed_at,
    coalesce(u.raw_user_meta_data->>'familijna_email_change_intent', '') as meta_intent
  into v_user
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if found then
    if v_user.email_confirmed_at is not null then
      return query select 'confirmed'::text, 'signup'::text;
    else
      return query
      select
        'pending'::text,
        case when lower(v_user.meta_intent) = 'guest_migrate' then 'guest_migrate' else 'signup' end::text;
    end if;
    return;
  end if;

  select
    ei.status,
    ei.intent,
    ei.cooldown_until
  into v_intent
  from public.email_intents ei
  where ei.email = v_email
  limit 1;

  if found then
    if v_intent.status = 'confirmed' then
      return query select 'confirmed'::text, 'signup'::text;
      return;
    end if;
    if v_intent.status = 'pending' then
      return query
      select
        'pending'::text,
        case when v_intent.intent = 'guest_migrate' then 'guest_migrate' else 'signup' end::text;
      return;
    end if;
  end if;

  return query select 'none'::text, 'signup'::text;
end;
$$;
