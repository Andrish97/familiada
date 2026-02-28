-- Mail admin panel: settings, queue retry, cron controls, function logs

alter table public.mail_settings
  add column if not exists worker_limit integer not null default 25;

create table if not exists public.mail_function_logs (
  id bigint generated always as identity primary key,
  created_at timestamp with time zone not null default now(),
  function_name text not null,
  level text not null default 'info',
  event text not null,
  request_id uuid,
  queue_id uuid,
  actor_user_id uuid,
  recipient_email text,
  provider text,
  status text,
  error text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists mail_function_logs_created_at_idx
  on public.mail_function_logs (created_at desc);

create index if not exists mail_function_logs_fn_created_idx
  on public.mail_function_logs (function_name, created_at desc);

create index if not exists mail_function_logs_level_created_idx
  on public.mail_function_logs (level, created_at desc);

create index if not exists mail_function_logs_request_idx
  on public.mail_function_logs (request_id);

create index if not exists mail_function_logs_queue_idx
  on public.mail_function_logs (queue_id);

alter table public.mail_function_logs enable row level security;

drop policy if exists mail_function_logs_read_none on public.mail_function_logs;
create policy mail_function_logs_read_none
  on public.mail_function_logs
  for select
  to authenticated
  using (false);

drop policy if exists mail_function_logs_write_none on public.mail_function_logs;
create policy mail_function_logs_write_none
  on public.mail_function_logs
  to authenticated
  using (false)
  with check (false);

create or replace function public.mail_queue_requeue(
  p_ids uuid[] default null,
  p_only_failed boolean default true
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_count integer := 0;
begin
  update public.mail_queue q
     set status = 'pending',
         not_before = now(),
         picked_at = null,
         last_error = null,
         provider_used = null
   where (p_ids is null or q.id = any (p_ids))
     and (
       case
         when p_only_failed then q.status = 'failed'
         else q.status in ('failed', 'pending', 'sending')
       end
     );

  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$function$;

create or replace function public.mail_cron_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_has_cron boolean := false;
  v_job_id bigint;
  v_job_name text;
  v_schedule text;
  v_active boolean;
  v_command text;
  v_limit integer := 25;
begin
  select exists(select 1 from pg_namespace where nspname = 'cron') into v_has_cron;
  if not v_has_cron then
    return jsonb_build_object(
      'supported', false,
      'configured', false,
      'error', 'cron_not_available'
    );
  end if;

  begin
    execute $sql$
      select jobid, coalesce(jobname, ''), schedule, active, command
        from cron.job
       where command ilike '%invoke_mail_worker%'
       order by active desc, jobid desc
       limit 1
    $sql$
    into v_job_id, v_job_name, v_schedule, v_active, v_command;
  exception when undefined_column then
    execute $sql$
      select jobid, ''::text, schedule, active, command
        from cron.job
       where command ilike '%invoke_mail_worker%'
       order by active desc, jobid desc
       limit 1
    $sql$
    into v_job_id, v_job_name, v_schedule, v_active, v_command;
  end;

  if v_job_id is null then
    return jsonb_build_object(
      'supported', true,
      'configured', false
    );
  end if;

  begin
    v_limit := coalesce(
      nullif(substring(v_command from 'invoke_mail_worker\(([0-9]+)\)'), '')::integer,
      25
    );
  exception when others then
    v_limit := 25;
  end;

  return jsonb_build_object(
    'supported', true,
    'configured', true,
    'job_id', v_job_id,
    'job_name', nullif(v_job_name, ''),
    'schedule', v_schedule,
    'active', v_active,
    'limit', v_limit,
    'command', v_command
  );
end;
$function$;

create or replace function public.mail_cron_set(
  p_schedule text,
  p_active boolean default true,
  p_limit integer default 25,
  p_job_name text default 'familiada_mail_worker'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
    v_job_name := 'familiada_mail_worker';
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
$function$;
