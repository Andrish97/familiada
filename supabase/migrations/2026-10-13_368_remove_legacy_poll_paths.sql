-- E14: remove confirmed legacy poll-hub RPC paths and direct guest Storage cleanup.
-- The current friends/subscribers/tasks/share RPCs and storage_cleanup_queue
-- replace these paths. Keep this migration forward-only and fail on dependencies.
BEGIN;

-- Drop compatibility wrappers before their implementation.
DROP FUNCTION IF EXISTS public.polls_hub_subscription_accept(uuid);
DROP FUNCTION IF EXISTS public.polls_hub_subscription_reject(uuid);
DROP FUNCTION IF EXISTS public.polls_hub_subscription_cancel(uuid);
DROP FUNCTION IF EXISTS public.polls_hub_subscription_invite(text);
DROP FUNCTION IF EXISTS public.polls_hub_subscription_invite_a(text);
DROP FUNCTION IF EXISTS public.poll_sub_accept(uuid);
DROP FUNCTION IF EXISTS public.polls_hub_share_poll(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.polls_hub_list_my_subscriptions();
DROP FUNCTION IF EXISTS public.polls_hub_list_tasks();
DROP FUNCTION IF EXISTS public.polls_badge_get();
DROP FUNCTION IF EXISTS public.polls_hub_overview();

-- Storage cleanup is now queued by profile/game/logo deletion triggers. The
-- shared storage-cleanup worker owns retries; these routines only delete rows.
CREATE OR REPLACE FUNCTION public.guest_cleanup_expired(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 500), 5000));
  v_deleted int := 0;
  v_id uuid;
begin
  for v_id in
    select p.id
      from public.profiles p
     where p.is_guest = true
       and p.guest_expires_at is not null
       and p.guest_expires_at < now()
     order by p.guest_expires_at asc
     limit v_limit
  loop
    perform public.delete_user_everything(v_id);
    v_deleted := v_deleted + 1;
  end loop;

  if v_deleted < v_limit then
    for v_id in
      select u.id
        from auth.users u
        left join public.profiles p on p.id = u.id
       where (p.username IS NULL OR p.id IS NULL)
         and u.last_sign_in_at IS NULL
         and u.created_at < (now() - interval '5 days')
         and coalesce(p.is_guest, false) = false
       limit (v_limit - v_deleted)
    loop
      perform public.delete_user_everything(v_id);
      v_deleted := v_deleted + 1;
    end loop;
  end if;

  return v_deleted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guest_discard_current()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_guest boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select coalesce(is_guest, false)
    into v_is_guest
    from public.profiles
   where id = v_uid;

  if not v_is_guest then
    return jsonb_build_object('ok', false, 'error', 'not_guest');
  end if;

  perform public.delete_user_everything(v_uid);
  return jsonb_build_object('ok', true);
end;
$function$;

COMMIT;
