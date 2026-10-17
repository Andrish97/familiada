BEGIN;

CREATE OR REPLACE FUNCTION public._registered_sharing_rows_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,pg_temp AS $$
DECLARE owner_id uuid; recipient_id uuid; other_id uuid; identity jsonb;
BEGIN
  -- Zaufane operacje serwerowe i migracje mogą porządkować starsze dane.
  IF auth.uid() IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP='DELETE' THEN
    IF TG_TABLE_NAME='friendships' THEN owner_id:=OLD.requester_id; other_id:=OLD.addressee_id;
    ELSIF TG_TABLE_NAME='poll_subscriptions' THEN owner_id:=OLD.owner_id; recipient_id:=coalesce(OLD.registered_user_id,OLD.subscriber_user_id);
    ELSIF TG_TABLE_NAME='poll_tasks' THEN owner_id:=OLD.owner_id; recipient_id:=OLD.recipient_user_id;
    ELSIF TG_TABLE_NAME='base_share_tasks' THEN owner_id:=OLD.owner_id; recipient_id:=OLD.recipient_user_id;
    ELSIF TG_TABLE_NAME='control_device_shares' THEN owner_id:=OLD.owner_id; recipient_id:=OLD.recipient_id;
    END IF;
  ELSE
    IF TG_TABLE_NAME='friendships' THEN owner_id:=NEW.requester_id; other_id:=NEW.addressee_id;
    ELSIF TG_TABLE_NAME='poll_subscriptions' THEN owner_id:=NEW.owner_id; recipient_id:=coalesce(NEW.registered_user_id,NEW.subscriber_user_id);
    ELSIF TG_TABLE_NAME='poll_tasks' THEN owner_id:=NEW.owner_id; recipient_id:=NEW.recipient_user_id;
    ELSIF TG_TABLE_NAME='base_share_tasks' THEN owner_id:=NEW.owner_id; recipient_id:=NEW.recipient_user_id;
    ELSIF TG_TABLE_NAME='control_device_shares' THEN owner_id:=NEW.owner_id; recipient_id:=NEW.recipient_id;
    ELSIF TG_TABLE_NAME='market_games' THEN
      owner_id:=NEW.author_user_id;
      IF owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'registered_account_required'; END IF;
    END IF;
  END IF;

  -- FK cascades run after the auth.users row disappears. Allow deletion of
  -- affected sharing rows when the current authenticated user is that account.
  IF TG_OP='DELETE'
     AND auth.uid() IN (owner_id,recipient_id,other_id)
     AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=auth.uid()) THEN
    RETURN OLD;
  END IF;

  IF owner_id IS NOT NULL THEN
    SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=owner_id;
    IF NOT public._account_is_registered(owner_id,identity) THEN
      RAISE EXCEPTION 'registered_account_required' USING ERRCODE='42501';
    END IF;
  END IF;
  FOREACH recipient_id IN ARRAY ARRAY[recipient_id,other_id] LOOP
    IF recipient_id IS NOT NULL THEN
      SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=recipient_id;
      IF NOT public._account_is_registered(recipient_id,identity) THEN
        RAISE EXCEPTION 'registered_account_required' USING ERRCODE='42501';
      END IF;
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

COMMIT;
