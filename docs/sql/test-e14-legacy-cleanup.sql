-- Read-only post-migration contract check for E14 / migration 368.
DO $test$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'polls_hub_subscription_accept', 'polls_hub_subscription_reject',
    'polls_hub_subscription_cancel', 'polls_hub_subscription_invite',
    'polls_hub_subscription_invite_a', 'poll_sub_accept',
    'polls_hub_share_poll', 'polls_hub_list_my_subscriptions',
    'polls_hub_list_tasks', 'polls_badge_get', 'polls_hub_overview'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=v_name
    ) THEN
      RAISE EXCEPTION 'E14 legacy RPC still exists: %', v_name;
    END IF;
  END LOOP;

  IF to_regprocedure('public.friends_list()') IS NULL
     OR to_regprocedure('public.subscribers_list()') IS NULL
     OR to_regprocedure('public.tasks_list(text)') IS NULL
     OR to_regprocedure('public.poll_share_send(uuid,uuid[],uuid[])') IS NULL
     OR to_regprocedure('public.storage_cleanup_claim(integer)') IS NULL THEN
    RAISE EXCEPTION 'E14 replacement RPC or cleanup worker is missing';
  END IF;

  IF position('cleanup-guest-storage' in pg_get_functiondef('public.guest_cleanup_expired(integer)'::regprocedure)) > 0
     OR position('cleanup-guest-storage' in pg_get_functiondef('public.guest_discard_current()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'E14 guest cleanup still calls the retired Edge Function';
  END IF;
END;
$test$;
