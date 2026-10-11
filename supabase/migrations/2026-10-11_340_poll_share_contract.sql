BEGIN;
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

CREATE OR REPLACE FUNCTION "public"."poll_share_remind"("p_game_id" "uuid", "p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  g record;
  t record;
  v_to text;
  v_target text;
  v_ok boolean;
  v_until timestamptz;
BEGIN
  PERFORM public._poll_assert_owner(p_game_id);

  SELECT id, name, status::text AS status, share_key_poll INTO g
  FROM public.games WHERE id = p_game_id FOR UPDATE;

  IF g.status <> 'poll_open' THEN
    RETURN jsonb_build_object('ok', false, 'err', 'poll not open');
  END IF;

  SELECT * INTO t FROM public.poll_tasks WHERE id = p_task_id AND game_id = p_game_id AND owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_not_found';
  END IF;
  IF t.status NOT IN ('pending', 'opened') THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task not pending');
  END IF;
  IF t.share_key_poll IS DISTINCT FROM g.share_key_poll THEN
    RETURN jsonb_build_object('ok', false, 'err', 'task expired');
  END IF;

  v_to := lower(coalesce(t.recipient_email, (SELECT p.email FROM public.profiles p WHERE p.id = t.recipient_user_id)));
  IF public._norm_email(v_to) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'no email for this recipient');
  END IF;

  IF NOT public._contact_mail_enabled(v_to) THEN
    RETURN jsonb_build_object('ok',true,'mail_allowed',false,'mail','[]'::jsonb);
  END IF;
  IF t.reminder_count >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'err', 'reminder limit');
  END IF;

  v_target := 'pair:' || v_uid::text || ':' ||
    coalesce(t.recipient_user_id::text, 'email:' || md5(lower(coalesce(t.recipient_email, '')))) ||
    ':game:' || p_game_id::text;

  SELECT c.ok, c.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_check('poll:share', v_target) c;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  v_until := public._poll_daily_cap_until(v_uid, v_to);
  IF v_until IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until, 'reason', 'daily_cap');
  END IF;

  SELECT r.ok, r.next_allowed_at INTO v_ok, v_until FROM public.mail_cooldown_reserve('poll:share', v_target) r;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'err', 'cooldown', 'cooldown_until', v_until);
  END IF;

  UPDATE public.poll_tasks SET reminder_count = reminder_count + 1 WHERE id = t.id;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', t.id, 'to', v_to, 'token', t.token, 'link', '/go/?t=' || t.token::text,
    'game_name', g.name, 'poll_type', t.poll_type,
    'reminder_count', t.reminder_count + 1,
    'mail', jsonb_build_array(jsonb_build_object(
      'task_id', t.id, 'to', v_to, 'token', t.token, 'link', '/go/?t=' || t.token::text))
  );
END $$;
CREATE OR REPLACE FUNCTION public.poll_share_remove(p_game_id uuid,p_task_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.poll_tasks%rowtype; g public.games%rowtype; uid uuid:=auth.uid(); voter text;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id AND owner_id=uid FOR UPDATE;
 IF uid IS NULL OR NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT * INTO t FROM public.poll_tasks WHERE id=p_task_id AND game_id=p_game_id AND owner_id=uid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'err','task_not_found'); END IF;
 voter:=public.poll_task_voter_token(t.id);
 DELETE FROM public.poll_votes WHERE game_id=p_game_id AND voter_token=voter;
 DELETE FROM public.poll_text_entries WHERE game_id=p_game_id AND voter_token=voter;
 -- Keep refusal history for this run, even after sender removes its visible row.
 UPDATE public.poll_tasks SET status='cancelled',cancelled_at=coalesce(cancelled_at,now()) WHERE id=t.id;
 RETURN jsonb_build_object('ok',true);
END; $$;

CREATE OR REPLACE FUNCTION public.polls_hub_share_poll(p_game_id uuid,p_sub_ids uuid[])
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.poll_share_send(p_game_id,'{}'::uuid[],p_sub_ids)
  || jsonb_build_object('cancelled',0,'blocked_sub_ids','[]'::jsonb)
$$;
CREATE OR REPLACE FUNCTION public._poll_mail_cooldown_until(p_owner uuid,p_user uuid,p_email text,p_game uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT greatest(
  (SELECT max(next_allowed_at) FROM public.mail_cooldowns WHERE action_key='poll:share'
   AND target_key='pair:'||p_owner||':'||coalesce(p_user::text,'email:'||md5(public._norm_email(p_email)))||':game:'||p_game
   AND next_allowed_at>now()), public._poll_daily_cap_until(p_owner,p_email))
 WHERE public._contact_mail_enabled(p_email)
$$;
REVOKE ALL ON FUNCTION public._poll_mail_cooldown_until(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.poll_share_panel(p_game_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=auth.uid(); g public.games%rowtype; fs jsonb; ss jsonb; ts jsonb;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id AND owner_id=uid;
 IF uid IS NULL OR NOT FOUND OR g.type::text NOT IN ('poll_text','poll_points') THEN
  RETURN jsonb_build_object('ok',false,'err','not_owner'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'label',f.label,'email',f.email,
  'email_enabled',public._contact_mail_enabled(f.email),
  'cooldown_until',public._poll_mail_cooldown_until(uid,f.user_id,f.email,p_game_id)) ORDER BY f.label),'[]'::jsonb)
 INTO fs FROM public.friends_list() f WHERE f.status='active' AND f.direction='friend';
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'email',s.subscriber_email,
  'email_enabled',public._contact_mail_enabled(s.subscriber_email),
  'cooldown_until',public._poll_mail_cooldown_until(uid,NULL,s.subscriber_email,p_game_id)) ORDER BY s.subscriber_email),'[]'::jsonb)
 INTO ss FROM public.poll_subscriptions s WHERE s.owner_id=uid AND s.status='active' AND s.subscriber_user_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE NOT p.is_guest
   AND public._norm_email(p.email)=public._norm_email(s.subscriber_email));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'recipient_user_id',t.recipient_user_id,'recipient_email',t.recipient_email,
  'label',coalesce(nullif(p.username,''),p.email,t.recipient_email),'status',t.status,'share_key_poll',t.share_key_poll,
  'reminder_count',t.reminder_count,'declined_at',t.declined_at,'cancelled_at',t.cancelled_at,
  'hidden',t.status='cancelled' OR (t.status='declined' AND t.declined_at<=now()-interval '5 days'),
  'email_enabled',public._contact_mail_enabled(coalesce(p.email,t.recipient_email)),
  'cooldown_until',public._poll_mail_cooldown_until(uid,t.recipient_user_id,coalesce(p.email,t.recipient_email),p_game_id))
 ORDER BY t.created_at DESC),'[]'::jsonb) INTO ts
 FROM public.poll_tasks t LEFT JOIN public.profiles p ON p.id=t.recipient_user_id
 WHERE t.game_id=p_game_id AND t.owner_id=uid AND t.share_key_poll=g.share_key_poll
  AND (t.status<>'cancelled' OR t.declined_at IS NOT NULL);
 RETURN jsonb_build_object('ok',true,'friends',fs,'subscribers',ss,'tasks',ts);
END; $$;
REVOKE ALL ON FUNCTION public.poll_share_panel(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.poll_share_panel(uuid) TO authenticated;

COMMIT;
