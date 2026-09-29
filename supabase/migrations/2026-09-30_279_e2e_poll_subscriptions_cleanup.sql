-- Powtarzalne E2E /subscriptions potrzebuje usunąć relację (także cancelled /
-- declined z 5-dniowym cooldownem) przed retry. Funkcja jest dostępna wyłącznie
-- pomiędzy dwoma stałymi kontami testN@familiada.online; zwykły użytkownik nie
-- może nią usunąć żadnej relacji.
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
  v_deleted integer := 0;
begin
  select lower(email) into v_caller_email from auth.users where id = v_uid;
  select lower(email) into v_other_email from auth.users where id = p_other_user_id;

  if v_uid is null
     or v_caller_email !~ '^test[0-9]+@familiada[.]online$'
     or v_other_email !~ '^test[0-9]+@familiada[.]online$' then
    return jsonb_build_object('ok', false, 'error', 'test accounts required');
  end if;

  delete from public.poll_subscriptions
  where (owner_id = v_uid and subscriber_user_id = p_other_user_id)
     or (owner_id = p_other_user_id and subscriber_user_id = v_uid);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

revoke all on function public.e2e_poll_subscriptions_cleanup(uuid) from public;
grant execute on function public.e2e_poll_subscriptions_cleanup(uuid) to authenticated;
