-- Zaproszenia do zarejestrowanego użytkownika mają recipient_user_id i
-- recipient_email = null. Po przyjęciu paczki przez send-mail oba warianty
-- muszą otrzymać znacznik wysłania oraz ten sam cooldown antyspamowy.
create or replace function public.polls_hub_tasks_mark_emailed(p_task_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  update public.poll_tasks
  set email_sent_at = now(),
      email_send_count = email_send_count + 1
  where owner_id = v_uid
    and id = any(coalesce(p_task_ids, array[]::uuid[]))
    and (recipient_email is not null or recipient_user_id is not null);

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$$;

revoke all on function public.polls_hub_tasks_mark_emailed(uuid[]) from public;
grant execute on function public.polls_hub_tasks_mark_emailed(uuid[]) to authenticated;

