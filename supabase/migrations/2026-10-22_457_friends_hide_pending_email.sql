-- 457 (P2, decyzja właściciela 2026-10-22): Znajomi -- przy zaproszeniach
-- (oczekujących i odrzuconych, w obie strony) bez adresu e-mail drugiej
-- strony; adres widoczny dopiero po przyjęciu znajomości. Wyjątek: zapraszający
-- widzi adres, który SAM wpisał (zaproszenie na e-mail albo z jego listy
-- subskrybentów). Nowa kolumna friendships.requested_email (adres wpisany
-- przez zapraszającego; tylko do jego wglądu).

ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS requested_email text;

CREATE OR REPLACE FUNCTION public.friends_invite(p_handle text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE result jsonb;
BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
 result:=public._mail_original361_friends_invite(p_handle);
 IF result->>'ok'='true' AND result->>'mail_allowed'='true' AND result->>'id' IS NOT NULL THEN PERFORM public._mail_allocate_notification('friend',(result->>'id')::uuid,'friend:invite'); END IF;
 IF result->>'ok'='true' AND result->>'id' IS NOT NULL AND position('@' in trim(coalesce(p_handle,'')))>1 THEN
  UPDATE public.friendships SET requested_email=lower(trim(p_handle))
   WHERE id=(result->>'id')::uuid AND requester_id=auth.uid();
 END IF;
 RETURN result - 'to';
  EXCEPTION WHEN lock_not_available THEN
   IF attempt=1000 THEN RAISE; END IF;
  END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.friends_list()
RETURNS TABLE(id uuid, user_id uuid, label text, email text, status text, direction text, created_at timestamp with time zone, accepted_at timestamp with time zone, email_sent_at timestamp with time zone, email_send_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE uid uuid:=auth.uid(); identity jsonb;
BEGIN
 SELECT to_jsonb(u) INTO identity FROM auth.users u WHERE u.id=uid;
 IF NOT public._account_is_registered(uid,identity) THEN RETURN; END IF;
 RETURN QUERY
 SELECT x.id,x.user_id,coalesce(nullif(x.username,''),x.shown_email),x.shown_email,x.status,x.direction,
   x.created_at,x.accepted_at,x.email_sent_at,x.email_send_count
 FROM (
  SELECT f.id,p.id AS user_id,p.username,f.status,
   CASE WHEN f.status='active' THEN 'friend' WHEN f.decision_user_id=uid THEN 'incoming' ELSE 'outgoing' END AS direction,
   f.created_at,f.accepted_at,f.email_sent_at,f.email_send_count,
   CASE WHEN f.status='active' THEN public._norm_email(u.email)
     WHEN f.requester_id=uid THEN coalesce(public._norm_email(f.requested_email),
       (SELECT public._norm_email(s.subscriber_email) FROM public.poll_subscriptions s
         WHERE s.id=f.source_subscription_id AND s.owner_id=uid))
   END AS shown_email
  FROM public.friendships f JOIN public.profiles p ON p.id=CASE WHEN f.requester_id=uid THEN f.addressee_id ELSE f.requester_id END
  JOIN auth.users u ON u.id=p.id
  WHERE f.cancelled_at IS NULL AND (f.requester_id=uid OR f.addressee_id=uid)
    AND (f.status<>'declined' OR (f.declined_at>now()-interval '30 days'
      AND (f.decision_user_id=uid OR f.declined_at>now()-interval '5 days')))
 ) x
 ORDER BY x.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION "public"."contacts_list"("p_kind" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_uid uuid:=auth.uid(); v_row jsonb; v_rows jsonb; v_result jsonb:='[]';
  v_target text; v_until timestamptz; v_enabled boolean; v_declined_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  IF p_kind='friends' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]') INTO v_rows FROM public.friends_list() f;
  ELSIF p_kind='subscribers' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO v_rows FROM public.subscribers_list() s;
  ELSE RETURN jsonb_build_object('ok',false,'err','invalid_kind'); END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    v_until:=NULL; v_declined_at:=NULL;
    IF p_kind='friends' THEN
      SELECT declined_at INTO v_declined_at FROM public.friendships WHERE id=(v_row->>'id')::uuid;
    ELSE
      SELECT declined_at INTO v_declined_at FROM public.poll_subscriptions WHERE id=(v_row->>'id')::uuid;
    END IF;
    -- Znajomi: adres drugiej strony bywa ukryty (friends_list) -- flaga
    -- powiadomień liczona z prawdziwego adresu konta.
    v_enabled:=public._contact_mail_enabled(CASE WHEN p_kind='friends'
      THEN (SELECT public._norm_email(u.email) FROM auth.users u WHERE u.id=(v_row->>'user_id')::uuid) ELSE v_row->>'email' END)
      AND (p_kind<>'subscribers' OR v_row->>'friend_user_id' IS NULL);
    IF v_row->>'status'='pending' AND (p_kind='subscribers' OR v_row->>'direction'='outgoing') THEN
      IF p_kind='friends' THEN
        v_target:='pair:'||v_uid::text||':'||(v_row->>'user_id');
        SELECT greatest(max(next_allowed_at),public._friend_mail_limit_until(v_uid,(v_row->>'user_id')::uuid),
            (v_row->>'email_sent_at')::timestamptz+interval '5 days')
          INTO v_until FROM public.mail_cooldowns
          WHERE target_key IN (v_target,'pair:'||(v_row->>'user_id')||':'||v_uid) AND action_key IN ('friend:invite','friend:resend');
      ELSE
        v_target:='pair:'||v_uid::text||':email:'||md5(lower(trim(v_row->>'email')));
        SELECT greatest(max(next_allowed_at),public._poll_sub_mail_limit_until(v_uid,NULL,v_row->>'email'))
          INTO v_until FROM public.mail_cooldowns
          WHERE target_key=v_target AND action_key IN ('poll:invite','poll:resend');
      END IF;
      IF v_until<=now() THEN v_until:=NULL; END IF;
    END IF;
    v_result:=v_result||jsonb_build_array(v_row||jsonb_build_object(
      'email_enabled',v_enabled,'resend_available_at',v_until,
      'declined_at',v_declined_at,'decline_expires_at',v_declined_at+interval '30 days'));
  END LOOP;
  RETURN v_result;
END; $$;

