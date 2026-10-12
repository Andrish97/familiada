-- Isolated CI only: restore the pre353 shape to exercise the real migration.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('fam','fam353reset') THEN RAISE EXCEPTION 'isolated database only'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='poll_tasks' AND column_name='source_kind') THEN
  DROP TRIGGER IF EXISTS subscriber_identity_account_delete ON auth.users;
  DROP TRIGGER IF EXISTS poll_identity_auth_insert ON auth.users;
  DROP TRIGGER IF EXISTS poll_identity_auth_change ON auth.users;
  DROP TRIGGER IF EXISTS poll_identity_profile ON public.profiles;
  DROP TRIGGER IF EXISTS poll_identity_task_insert ON public.poll_tasks;
  DROP TRIGGER IF EXISTS subscriber_identity_insert ON public.poll_subscriptions;
  DROP TRIGGER IF EXISTS subscriber_identity_refusal ON public.poll_subscriptions;
  DROP FUNCTION IF EXISTS public._poll_task_source_active(public.poll_tasks);
  ALTER TABLE public.poll_tasks DROP COLUMN source_subscription_id CASCADE;
  ALTER TABLE public.poll_tasks DROP COLUMN source_friendship_id CASCADE;
  ALTER TABLE public.poll_tasks DROP COLUMN source_kind CASCADE;
  ALTER TABLE public.poll_subscriptions DROP COLUMN registered_user_id CASCADE;
  ALTER TABLE public.poll_subscriptions DROP COLUMN identity_tracking_enabled;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public._friend_accept_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status='active' THEN
    DELETE FROM public.poll_subscriptions s USING public.profiles p
    WHERE (s.owner_id=NEW.requester_id AND p.id=NEW.addressee_id
      OR s.owner_id=NEW.addressee_id AND p.id=NEW.requester_id)
      AND (s.subscriber_user_id=p.id OR lower(trim(s.subscriber_email))=lower(trim(p.email)));
  END IF;
  RETURN NEW;
END; $function$;
CREATE OR REPLACE FUNCTION public._friend_drop_pair_tasks(p_a uuid, p_b uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.poll_tasks pt
  WHERE pt.status IN ('pending', 'opened')
    AND ((pt.owner_id = p_a AND pt.recipient_user_id = p_b)
      OR (pt.owner_id = p_b AND pt.recipient_user_id = p_a));

  DELETE FROM public.base_share_tasks bt
  WHERE bt.status IN ('pending', 'opened')
    AND ((bt.owner_id = p_a AND bt.recipient_user_id = p_b)
      OR (bt.owner_id = p_b AND bt.recipient_user_id = p_a));
END;
$function$;
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

  -- ✅ zamiast DELETE: oznacz jako cancelled i ustaw timestamp
  update public.poll_subscriptions
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_id;

  -- E11b: usunięcie subskrybenta wycofuje jego czekające zaproszenia do ankiet tego właściciela
  delete from public.poll_tasks pt
  where pt.owner_id = v_uid
    and pt.status in ('pending', 'opened')
    and ((v_sub.subscriber_user_id is not null and pt.recipient_user_id = v_sub.subscriber_user_id)
      or (v_sub.subscriber_email is not null and lower(pt.recipient_email) = lower(v_sub.subscriber_email)));

  return jsonb_build_object('ok', true);
end;
$function$;
CREATE OR REPLACE FUNCTION public._poll_bind_identity(p_uid uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r record;
BEGIN
 IF public._norm_email(p_email) IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id<>p_uid AND public._norm_email(email)=public._norm_email(p_email)) THEN RETURN; END IF;
 FOR r IN SELECT id FROM public.poll_tasks WHERE recipient_user_id IS NULL
  AND public._norm_email(recipient_email)=public._norm_email(p_email) ORDER BY game_id,id FOR UPDATE LOOP
  UPDATE public.poll_tasks SET recipient_user_id=p_uid,recipient_email=NULL WHERE id=r.id AND recipient_user_id IS NULL;
 END LOOP;
END $function$;
COMMIT;
