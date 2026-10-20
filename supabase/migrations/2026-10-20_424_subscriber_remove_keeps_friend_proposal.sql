-- 424: usunięcie subskrybenta nie kasuje propozycji znajomości (decyzja
-- użytkownika 2026-10-20, docs/e19-znajomi-plan.md „Decyzje”).
--
-- Dotąd anulowanie subskrypcji przez właściciela anulowało też oczekującą
-- propozycję znajomości utworzoną z tej subskrypcji (wyzwalacz
-- _friend_source_closed), a _friend_locked blokował jej przyjęcie, bo źródło
-- nie było już aktywne. Teraz przed anulowaniem odpinamy oczekujące
-- propozycje od subskrypcji (source_subscription_id = NULL) — zostają jak
-- zwykłe zaproszenia do znajomych. Usunięcie nadal kasuje wszystkie czekające
-- zadania tej osoby od właściciela (z subskrypcji i zaproszeń do gier).
-- Przyjęcie znajomości bez zmian: _friend_accept_cleanup usuwa subskrypcję.

CREATE OR REPLACE FUNCTION public.polls_hub_subscriber_remove(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_sub public.poll_subscriptions%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth required');
  end if;

  select * into v_sub
  from public.poll_subscriptions
  where id = p_id
    and owner_id = v_uid
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not found');
  end if;

  PERFORM public._poll_identity_email_refs(ARRAY[v_sub.subscriber_email],ARRAY[v_uid,v_sub.registered_user_id,v_sub.registered_user_id]);
  PERFORM public._subscriber_pair_lock(v_uid,v_sub.subscriber_email);
  SELECT * INTO v_sub FROM public.poll_subscriptions WHERE id=p_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not found'); END IF;

  -- 424: oczekująca propozycja znajomości z tej subskrypcji zostaje
  update public.friendships
  set source_subscription_id = null
  where source_subscription_id = v_sub.id
    and status = 'pending'
    and cancelled_at is null;

  update public.poll_subscriptions
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_id;

  -- E11b: usunięcie subskrybenta wycofuje jego czekające zaproszenia do ankiet tego właściciela
  delete from public.poll_tasks pt
  where pt.owner_id = v_uid
    and pt.status in ('pending', 'opened')
    and (pt.source_subscription_id=v_sub.id OR (pt.source_kind='game' AND ((v_sub.registered_user_id is not null and pt.recipient_user_id=v_sub.registered_user_id) OR (v_sub.subscriber_email is not null and public._norm_email(pt.recipient_email)=public._norm_email(v_sub.subscriber_email)))));

  return jsonb_build_object('ok', true);
end;
$function$;
