--366: account deletion remains the parent of pending and accepted copies.
-- No public Send endpoint is enabled by this repair.
BEGIN;
CREATE OR REPLACE FUNCTION public.delete_user_everything(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emails text[];
  v_email text;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- 312: e-maile konta (małymi literami) -- po nich czyścimy dane bez user_id
  select coalesce(array_agg(distinct e), array[]::text[]) into v_emails
  from (
    select lower(trim(u.email)) as e from auth.users u where u.id = p_user_id
    union
    select lower(trim(p.email)) from public.profiles p where p.id = p_user_id
  ) x
  where e is not null and e <> '';

  -- Serialize against snapshot/write jobs before inspecting the inbox.
  perform 1 from auth.users where id = p_user_id for update;

  --366: remove only this recipient inbox before pending resource guards.
  -- Sent copies already belong to their recipients and remain independent.
  delete from public.resource_copy_offers where recipient_id = p_user_id;

  -- 312: usunięcie konta jest nadrzędne -- nie sprawdza blokad (edit_locks);
  -- blokady trzymane przez to konto i na jego zasobach znikają.
  delete from public.edit_locks where holder_user_id = p_user_id;
  delete from public.edit_locks
   where (resource_type = 'game' and resource_id in (select id from public.games where owner_id = p_user_id))
      or (resource_type = 'base' and resource_id in (select id from public.question_bases where owner_id = p_user_id))
      or (resource_type = 'logo' and resource_id in (select id from public.user_logos where user_id = p_user_id));

  -- 312: głosy w cudzych ankietach zostają anonimowe (bez powiązania z kontem);
  -- głosy w własnych grach znikają razem z grami niżej.
  update public.poll_text_entries set voter_user_id = null where voter_user_id = p_user_id;
  update public.poll_votes set voter_user_id = null where voter_user_id = p_user_id;

  delete from public.friendships where requester_id=p_user_id OR addressee_id=p_user_id;
  delete from public.shared_devices where recipient_id=p_user_id;

  delete from public.poll_subscriptions where subscriber_user_id = p_user_id;
  delete from public.poll_subscriptions where owner_id = p_user_id;

  delete from public.poll_tasks where recipient_user_id = p_user_id;
  delete from public.poll_tasks where owner_id = p_user_id;

  -- 312: zaproszenia do baz (po user_id i po e-mailu)
  delete from public.base_share_tasks where recipient_user_id = p_user_id;
  delete from public.base_share_tasks where owner_id = p_user_id;

  delete from public.question_base_shares where user_id = p_user_id;
  delete from public.question_bases where owner_id = p_user_id;

  -- 312: gry (maile ankietowe właściciela znikają niżej przez created_by)
  delete from public.shared_devices where game_id in (select id from public.games where owner_id = p_user_id);
  delete from public.games where owner_id = p_user_id;

  delete from public.user_flags where user_id = p_user_id;
  delete from public.user_logos where user_id = p_user_id;

  -- 312: wszystko powiązane z e-mailem konta
  delete from public.mail_queue where created_by = p_user_id;
  delete from public.mail_function_logs where actor_user_id = p_user_id;
  delete from public.email_intents where user_id = p_user_id;
  delete from public.contact_reports where user_id = p_user_id;
  delete from public.mail_cooldowns
   where position(p_user_id::text in target_key) > 0;

  foreach v_email in array v_emails loop
    delete from public.shared_devices where lower(trim(recipient_email))=v_email;
    delete from public.poll_subscriptions where lower(subscriber_email) = v_email;
    delete from public.poll_tasks where lower(recipient_email) = v_email;
    delete from public.base_share_tasks where lower(recipient_email) = v_email;
    delete from public.mail_queue where lower(trim(to_email)) = v_email;
    delete from public.mail_function_logs where lower(recipient_email) = v_email;
    delete from public.email_unsub_tokens where lower(email) = v_email;
    delete from public.email_intents where lower(email) = v_email;
    delete from public.email_cooldowns where email_hash = md5(v_email);
    delete from public.mail_cooldowns where position(md5(v_email) in target_key) > 0;
    delete from public.contact_reports where lower(email) = v_email;
  end loop;

  -- profile first (also cascades by FK from auth.users if still present)
  delete from public.profiles where id = p_user_id;

  -- final auth user hard delete
  delete from auth.users where id = p_user_id;
end;
$function$

;
COMMIT;
