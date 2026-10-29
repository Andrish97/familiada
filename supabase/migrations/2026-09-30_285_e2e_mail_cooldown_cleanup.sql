-- Retry testów mailowych nie może dziedziczyć produkcyjnych cooldownów.
-- Funkcja nadal działa wyłącznie pomiędzy istniejącymi kontami testN.
create or replace function public.e2e_poll_subscriptions_cleanup(p_other_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_email text;
  v_other_email text;
  v_subscriptions_deleted integer := 0;
  v_tasks_deleted integer := 0;
  v_cooldowns_deleted integer := 0;
begin
  select lower(email) into v_caller_email from auth.users where id = v_uid;
  select lower(email) into v_other_email from auth.users where id = p_other_user_id;

  if v_uid is null
     or v_caller_email !~ '^test([1-9]|1[0-3])@familiada[.]online$'
     or v_other_email !~ '^test([1-9]|1[0-3])@familiada[.]online$' then
    return jsonb_build_object('ok', false, 'error', 'test accounts required');
  end if;

  delete from public.poll_tasks
  where (owner_id = v_uid and recipient_user_id = p_other_user_id)
     or (owner_id = p_other_user_id and recipient_user_id = v_uid);
  get diagnostics v_tasks_deleted = row_count;

  delete from public.poll_subscriptions
  where (owner_id = v_uid and subscriber_user_id = p_other_user_id)
     or (owner_id = p_other_user_id and subscriber_user_id = v_uid);
  get diagnostics v_subscriptions_deleted = row_count;

  delete from public.email_cooldowns
  where email_hash in (md5(v_caller_email), md5(v_other_email));
  get diagnostics v_cooldowns_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'subscriptions_deleted', v_subscriptions_deleted,
    'tasks_deleted', v_tasks_deleted,
    'cooldowns_deleted', v_cooldowns_deleted
  );
end;
$$;

revoke all on function public.e2e_poll_subscriptions_cleanup(uuid) from public;
grant execute on function public.e2e_poll_subscriptions_cleanup(uuid) to authenticated;

