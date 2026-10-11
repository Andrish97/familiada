-- Graf pkt7: zadanie ankiety i jego niepełne głosy.
BEGIN;
CREATE OR REPLACE FUNCTION public._poll_task_cleanup_partial_votes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status IN ('pending','opened') AND OLD.done_at IS NULL
 AND (TG_OP='DELETE' OR NEW.status='cancelled') THEN
  DELETE FROM public.poll_votes WHERE game_id=OLD.game_id AND voter_token=public.poll_task_voter_token(OLD.id);
  DELETE FROM public.poll_text_entries WHERE game_id=OLD.game_id AND voter_token=public.poll_task_voter_token(OLD.id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._poll_task_cleanup_partial_votes() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER poll_tasks_cleanup_partial_votes
BEFORE DELETE OR UPDATE OF status ON public.poll_tasks
FOR EACH ROW EXECUTE FUNCTION public._poll_task_cleanup_partial_votes();

CREATE OR REPLACE FUNCTION public._poll_share_contact_locks(p_owner uuid,p_friend_ids uuid[],p_subscriber_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recipient uuid; recipient_email text;
BEGIN
 -- Contacts precede the game. Ordered pairs match the friends RPCs.
 FOR recipient IN SELECT p.id FROM public.profiles p
 WHERE p.id=ANY(coalesce(p_friend_ids,'{}'::uuid[])) AND p.id<>p_owner ORDER BY p.id LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_owner,recipient)::text||':'||GREATEST(p_owner,recipient)::text,329));
 END LOOP;
 FOR recipient_email IN SELECT DISTINCT public._norm_email(s.subscriber_email)
 FROM public.poll_subscriptions s WHERE s.id=ANY(coalesce(p_subscriber_ids,'{}'::uuid[]))
 AND s.owner_id=p_owner AND public._norm_email(s.subscriber_email) IS NOT NULL
 ORDER BY public._norm_email(s.subscriber_email) LOOP
  PERFORM public._subscriber_pair_lock(p_owner,recipient_email);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._poll_share_contact_locks(uuid,uuid[],uuid[]) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION "public"."poll_share_send"("p_game_id" "uuid", "p_friend_ids" "uuid"[], "p_subscriber_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_game public.games%rowtype; r record;
  v_target text; v_ok boolean; v_until timestamptz; v_id uuid; v_token uuid;
  v_mail_enabled boolean;
  v_created int:=0; v_kept int:=0; v_blocked int:=0; v_mail jsonb:='[]';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  PERFORM public._poll_share_contact_locks(v_uid,p_friend_ids,p_subscriber_ids);
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id AND owner_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','game not found'); END IF;
  IF v_game.type::text NOT IN ('poll_text','poll_points') OR v_game.status::text<>'poll_open' THEN
    RETURN jsonb_build_object('ok',false,'err','poll not open');
  END IF;
  FOR r IN
    SELECT p.id AS user_id,lower(trim(p.email)) AS email FROM public.profiles p
      WHERE p.id=ANY(coalesce(p_friend_ids,'{}'::uuid[])) AND NOT p.is_guest AND public.are_friends(v_uid,p.id)
    UNION
    SELECT NULL::uuid,lower(trim(s.subscriber_email)) FROM public.poll_subscriptions s
      WHERE s.id=ANY(coalesce(p_subscriber_ids,'{}'::uuid[])) AND s.owner_id=v_uid
        AND s.subscriber_user_id IS NULL AND s.status='active'
        AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE lower(trim(p.email))=lower(trim(s.subscriber_email)) AND NOT p.is_guest)
  LOOP
    IF EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.owner_id=v_uid AND t.game_id=p_game_id
      AND t.share_key_poll=v_game.share_key_poll AND (t.status<>'cancelled' OR t.declined_at IS NOT NULL) AND (t.recipient_user_id=r.user_id OR lower(trim(t.recipient_email))=r.email)) THEN
      v_kept:=v_kept+1; CONTINUE;
    END IF;
    v_target:='pair:'||v_uid::text||':'||coalesce(r.user_id::text,'email:'||md5(r.email))||':game:'||p_game_id::text;
    v_mail_enabled:=public._contact_mail_enabled(r.email);
    IF v_mail_enabled THEN
    v_until:=public._poll_daily_cap_until(v_uid,r.email);
    SELECT ok INTO v_ok FROM public.mail_cooldown_check('poll:share',v_target);
    IF NOT v_ok OR v_until IS NOT NULL THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    SELECT ok INTO v_ok FROM public.mail_cooldown_reserve('poll:share',v_target);
    IF NOT v_ok THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    END IF;
    INSERT INTO public.poll_tasks(owner_id,recipient_user_id,recipient_email,game_id,poll_type,share_key_poll,token,status)
      VALUES(v_uid,r.user_id,CASE WHEN r.user_id IS NULL THEN r.email END,p_game_id,v_game.type::text,v_game.share_key_poll,gen_random_uuid(),'pending')
      RETURNING id,token INTO v_id,v_token;
    v_created:=v_created+1;
    IF v_mail_enabled THEN
    v_mail:=v_mail||jsonb_build_array(jsonb_build_object('task_id',v_id,'to',r.email,'token',v_token,'link','/go/?t='||v_token::text));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'created',v_created,'kept',v_kept,'blocked',v_blocked,'mail',v_mail);
END; $$;
CREATE OR REPLACE FUNCTION "public"."friend_invites_from_subscriptions"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_email   text;
  v_created integer := 0;
  r         record;
  v_cd_ok   boolean;
  v_n       integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'auth required');
  END IF;
  v_email := public.poll_my_email();

  FOR r IN
    SELECT DISTINCT s.owner_id
    FROM public.poll_subscriptions s
    WHERE s.status IN ('pending', 'active')
      AND s.owner_id <> v_uid
      AND (s.subscriber_user_id = v_uid
        OR (v_email IS NOT NULL AND v_email <> ''
            AND lower(trim(s.subscriber_email)) = v_email))
    ORDER BY s.owner_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(r.owner_id,v_uid)::text||':'||GREATEST(r.owner_id,v_uid)::text,329));
    PERFORM public._subscriber_pair_lock(r.owner_id,v_email);
    IF public._subscriber_refusal_until(r.owner_id,v_email) IS NOT NULL THEN CONTINUE; END IF;
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

    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (r.owner_id, v_uid, 'pending')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_created := v_created + v_n;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END;
$$;

-- Rows explicitly declined/cancelled and never completed are known partials.
-- Do not guess the state of orphaned historical task tokens: account deletion
-- intentionally preserves completed aggregate votes without a task record.
DELETE FROM public.poll_votes v USING public.poll_tasks t
WHERE t.game_id=v.game_id AND v.voter_token=public.poll_task_voter_token(t.id)
AND t.status IN ('declined','cancelled') AND t.done_at IS NULL;
DELETE FROM public.poll_text_entries v USING public.poll_tasks t
WHERE t.game_id=v.game_id AND v.voter_token=public.poll_task_voter_token(t.id)
AND t.status IN ('declined','cancelled') AND t.done_at IS NULL;
COMMIT;
NOTIFY pgrst,'reload schema';
