-- E19: pending/declined proposals have a source; accepted friendships are independent.
-- Unknown historical provenance remains NULL. Withdrawal preserves mail/refusal budgets.
BEGIN;
DO $$ BEGIN
 FOR attempt IN 1..100 LOOP
  BEGIN
   LOCK auth.users IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.profiles IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   LOCK public.friendships IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.poll_subscriptions IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.poll_tasks IN ACCESS EXCLUSIVE MODE NOWAIT;
   LOCK public.mail_cooldowns IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=100 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.1);
 END LOOP;
END $$;
ALTER TABLE public.friendships ADD COLUMN source_subscription_id uuid REFERENCES public.poll_subscriptions(id) ON DELETE SET NULL;
CREATE INDEX friendships_source_subscription_idx ON public.friendships(source_subscription_id);
CREATE OR REPLACE FUNCTION public.friend_invites_from_subscriptions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_email   text;
  v_created integer := 0;
  r         record;
  v_cd_ok   boolean;
  v_n       integer;
  source_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  v_email := public.poll_my_email();

  PERFORM public._poll_identity_email_refs(ARRAY[v_email],ARRAY[v_uid] || ARRAY(SELECT DISTINCT s.owner_id
    FROM public.poll_subscriptions s
    WHERE s.status IN ('pending', 'active')
      AND s.owner_id <> v_uid
      AND (s.registered_user_id = v_uid OR s.subscriber_user_id = v_uid
        OR (s.registered_user_id IS NULL AND s.identity_tracking_enabled AND v_email IS NOT NULL AND v_email <> ''
            AND lower(trim(s.subscriber_email)) = v_email))
    ORDER BY s.owner_id));

  FOR r IN
    SELECT DISTINCT s.owner_id
    FROM public.poll_subscriptions s
    WHERE s.status IN ('pending', 'active')
      AND s.owner_id <> v_uid
      AND (s.registered_user_id = v_uid OR s.subscriber_user_id = v_uid
        OR (s.registered_user_id IS NULL AND s.identity_tracking_enabled AND v_email IS NOT NULL AND v_email <> ''
            AND lower(trim(s.subscriber_email)) = v_email))
    ORDER BY s.owner_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(r.owner_id,v_uid)::text||':'||GREATEST(r.owner_id,v_uid)::text,329));
    PERFORM public._subscriber_pair_lock(r.owner_id,v_email);
    IF public._subscriber_refusal_until(r.owner_id,v_email) IS NOT NULL THEN CONTINUE; END IF;
    SELECT s.id INTO source_id FROM public.poll_subscriptions s
    WHERE s.owner_id=r.owner_id AND s.status IN ('pending','active')
      AND s.cancelled_at IS NULL AND s.declined_at IS NULL
      AND (s.registered_user_id=v_uid OR s.subscriber_user_id=v_uid
        OR (s.registered_user_id IS NULL AND s.identity_tracking_enabled
          AND public._norm_email(s.subscriber_email)=v_email))
    ORDER BY s.created_at,s.id LIMIT 1 FOR SHARE;
    IF source_id IS NULL THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(r.owner_id, v_uid)
        AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(r.owner_id, v_uid)
    ) THEN
      CONTINUE;
    END IF;

    SELECT c.ok INTO v_cd_ok
    FROM public.mail_cooldown_check('friend:invite_after_reject', 'pair:' || r.owner_id::text || ':' || v_uid::text) c;
    IF NOT v_cd_ok THEN
      CONTINUE;
    END IF;

    INSERT INTO public.friendships (requester_id, addressee_id, status, source_subscription_id)
    VALUES (r.owner_id, v_uid, 'pending', source_id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_created := v_created + v_n;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$function$;
CREATE OR REPLACE FUNCTION public._friend_locked(p_id uuid)
RETURNS public.friendships LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE f public.friendships%rowtype; uid uuid:=auth.uid(); source_email text;
BEGIN
 IF uid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO f FROM public.friendships WHERE id=p_id AND uid IN(requester_id,addressee_id);
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF f.source_subscription_id IS NOT NULL THEN
  SELECT subscriber_email INTO source_email FROM public.poll_subscriptions WHERE id=f.source_subscription_id;
 END IF;
 PERFORM public._poll_identity_email_refs(ARRAY[source_email],ARRAY[f.requester_id,f.addressee_id]);
 PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(f.requester_id,f.addressee_id)::text||':'||GREATEST(f.requester_id,f.addressee_id)::text,329));
 IF f.source_subscription_id IS NOT NULL THEN
  PERFORM public._subscriber_pair_lock(f.requester_id,source_email);
  PERFORM 1 FROM public.poll_subscriptions WHERE id=f.source_subscription_id
   AND status IN('pending','active') AND cancelled_at IS NULL AND declined_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 SELECT * INTO f FROM public.friendships WHERE id=p_id AND uid IN(requester_id,addressee_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN f;
END $$;
CREATE OR REPLACE FUNCTION public._friend_source_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE public.friendships SET cancelled_at=coalesce(cancelled_at,now()) WHERE source_subscription_id=OLD.id AND status IN('pending','declined');
 ELSIF NEW.status NOT IN('pending','active') OR NEW.cancelled_at IS NOT NULL OR NEW.declined_at IS NOT NULL THEN
  UPDATE public.friendships SET cancelled_at=coalesce(cancelled_at,now()) WHERE source_subscription_id=NEW.id AND status IN('pending','declined');
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._friend_source_closed() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER friend_source_delete BEFORE DELETE ON public.poll_subscriptions
FOR EACH ROW EXECUTE FUNCTION public._friend_source_closed();
CREATE TRIGGER friend_source_closed AFTER UPDATE OF status,cancelled_at,declined_at ON public.poll_subscriptions
FOR EACH ROW EXECUTE FUNCTION public._friend_source_closed();
COMMIT;
