-- E14: subscriptions are email-addressed; registered account identity lives
-- in registered_user_id and account relationships live in friendships.
-- The E14 production audit (39113771174, 39113860983) found four remaining
-- subscriber_user_id rows: two self-invites, one pending invite already
-- represented by a friendship with the same token, and one declined invite.
-- None has dependent poll_tasks. Guard the deletion against data added since
-- the audit so source_subscription_id cascades can never discard tasks.
BEGIN;

-- Keep the audited subscription/task relationship stable until the column is
-- dropped. The lock is held only for this short schema migration.
LOCK TABLE public.poll_subscriptions IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.poll_tasks IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  fn record;
  rewritten text;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.poll_subscriptions s
      JOIN public.poll_tasks t ON t.source_subscription_id=s.id
     WHERE s.subscriber_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'E14 blocked: legacy subscriber rows still own poll_tasks';
  END IF;

  -- These obsolete APIs were replaced by control_device_share_create,
  -- control_device_share_revoke and device_shares_list_mine.
  DROP FUNCTION IF EXISTS public.share_device(uuid, text);
  DROP FUNCTION IF EXISTS public.share_device(uuid, text, uuid, text, timestamptz);
  DROP FUNCTION IF EXISTS public.unshare_device(uuid, text);
  DROP FUNCTION IF EXISTS public.list_my_device_shares();

  -- This legacy list RPC has an OUT column with the old name, so remove the
  -- dead API instead of retaining a misleading compatibility contract.
  DROP FUNCTION IF EXISTS public.polls_hub_list_my_subscribers();

  -- Rebuild every remaining public function from its current deployed
  -- definition, replacing the retired column identifier. This preserves the
  -- latest deployed bodies, grants, signatures and security settings while
  -- removing stale references across the accumulated RPC/trigger surface.
  FOR fn IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.prokind='f'
       AND p.prosrc ~ '\msubscriber_user_id\M'
     ORDER BY p.oid
  LOOP
    rewritten := regexp_replace(fn.definition,
      '\msubscriber_user_id\M', 'registered_user_id', 'g');
    EXECUTE rewritten;
  END LOOP;

  -- Preserve the intended direct-read policy for a registered recipient.
  DROP POLICY IF EXISTS poll_subs_select_owner_or_subscriber
    ON public.poll_subscriptions;
  CREATE POLICY poll_subs_select_owner_or_subscriber
    ON public.poll_subscriptions FOR SELECT
    USING (auth.uid()=owner_id OR auth.uid()=registered_user_id);

  DELETE FROM public.poll_subscriptions
   WHERE subscriber_user_id IS NOT NULL;

  ALTER TABLE public.poll_subscriptions
    DROP CONSTRAINT IF EXISTS poll_subscriptions_subscriber_user_id_fkey,
    DROP CONSTRAINT IF EXISTS poll_subscriptions_one_subscriber_chk;
  DROP INDEX IF EXISTS public.poll_subscriptions_sub_user_idx;
  ALTER TABLE public.poll_subscriptions DROP COLUMN subscriber_user_id;
  ALTER TABLE public.poll_subscriptions ALTER COLUMN subscriber_email SET NOT NULL;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND p.prosrc ~ '\msubscriber_user_id\M'
  ) THEN
    RAISE EXCEPTION 'E14 incomplete: public function still references subscriber_user_id';
  END IF;
END;
$migration$;

COMMIT;
