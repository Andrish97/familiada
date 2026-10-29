-- E19 krok 3: przełączenie list na znajomych i subskrybentów e-mail.
-- Wdrażać razem z frontem; stare RPC/kolumny usuwa dopiero E14.
BEGIN;

ALTER TABLE public.shared_devices ADD COLUMN IF NOT EXISTS recipient_email text;

INSERT INTO public.friendships
  (requester_id, addressee_id, status, token, created_at, accepted_at, email_sent_at, email_send_count)
SELECT s.owner_id, s.subscriber_user_id, s.status, s.token, s.created_at,
       CASE WHEN s.status = 'active' THEN coalesce(s.accepted_at, s.created_at) END,
       s.email_sent_at, s.email_send_count
FROM public.poll_subscriptions s
JOIN public.profiles po ON po.id = s.owner_id
JOIN public.profiles ps ON ps.id = s.subscriber_user_id
WHERE s.subscriber_user_id IS NOT NULL
  AND s.owner_id <> s.subscriber_user_id
  AND s.status IN ('active', 'pending')
ORDER BY (s.status = 'active') DESC, s.created_at
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.subscribers_invite(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_email text := public._norm_email(p_email);
  v_id uuid; v_token uuid; v_ok boolean; v_until timestamptz; v_target text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'err','auth required'); END IF;
  IF v_email IS NULL OR v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' THEN
    RETURN jsonb_build_object('ok',false,'err','invalid_email');
  END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE lower(trim(email))=v_email AND NOT is_guest) THEN
    RETURN jsonb_build_object('ok',false,'err','has_account');
  END IF;
  SELECT id,token INTO v_id,v_token FROM public.poll_subscriptions
    WHERE owner_id=v_uid AND subscriber_user_id IS NULL AND lower(trim(subscriber_email))=v_email AND status IN ('pending','active') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'already',true,'id',v_id,'token',v_token); END IF;
  v_target := 'pair:'||v_uid::text||':email:'||md5(v_email);
  SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite_after_reject',v_target);
  IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
  v_until := public._poll_sub_mail_limit_until(v_uid,NULL,v_email);
  IF v_until IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
  SELECT ok,next_allowed_at INTO v_ok,v_until FROM public.mail_cooldown_check('poll:invite',v_target);
  IF NOT v_ok THEN RETURN jsonb_build_object('ok',false,'err','cooldown','cooldown_until',v_until); END IF;
  INSERT INTO public.poll_subscriptions(owner_id,subscriber_email,status) VALUES(v_uid,v_email,'pending') RETURNING id,token INTO v_id,v_token;
  PERFORM public.mail_cooldown_reserve('poll:invite',v_target);
  RETURN jsonb_build_object('ok',true,'already',false,'id',v_id,'token',v_token);
END; $$;

CREATE OR REPLACE FUNCTION public.subscribers_list()
RETURNS TABLE(id uuid,email text,status text,created_at timestamptz,token uuid,email_sent_at timestamptz,email_send_count integer,friend_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT s.id,s.subscriber_email,s.status,s.created_at,s.token,s.email_sent_at,s.email_send_count,
    (SELECT p.id FROM public.profiles p WHERE lower(trim(p.email))=lower(trim(s.subscriber_email)) AND NOT p.is_guest LIMIT 1)
  FROM public.poll_subscriptions s
  WHERE s.owner_id=auth.uid() AND s.subscriber_user_id IS NULL AND s.status IN ('pending','active')
  ORDER BY s.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.poll_claim_email_records() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_email text := public.poll_my_email();
BEGIN
  IF auth.uid() IS NULL OR v_email IS NULL OR v_email='' THEN RETURN; END IF;
  UPDATE public.poll_tasks SET recipient_user_id=auth.uid(),recipient_email=NULL
  WHERE recipient_user_id IS NULL AND lower(trim(recipient_email))=v_email
    AND done_at IS NULL AND declined_at IS NULL AND cancelled_at IS NULL;
  PERFORM public.friend_invites_from_subscriptions();
END; $$;

CREATE OR REPLACE FUNCTION public._friend_accept_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status='active' THEN
    DELETE FROM public.poll_subscriptions s USING public.profiles p
    WHERE (s.owner_id=NEW.requester_id AND p.id=NEW.addressee_id
      OR s.owner_id=NEW.addressee_id AND p.id=NEW.requester_id)
      AND (s.subscriber_user_id=p.id OR lower(trim(s.subscriber_email))=lower(trim(p.email)));
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public._friend_accept_cleanup() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE TRIGGER friendships_accept_cleanup AFTER INSERT OR UPDATE OF status ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public._friend_accept_cleanup();

CREATE OR REPLACE FUNCTION "public"."poll_go_resolve"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  s record;
  t record;
  u record;
  f record;
BEGIN
  -- Znajomość przed subskrypcją: stare tokeny z maili kont skopiowano w 320.
  SELECT fs.id,fs.status,fs.requester_id,fs.addressee_id,p.username AS owner_label
  INTO f FROM public.friendships fs JOIN public.profiles p ON p.id=fs.requester_id
  WHERE fs.token=p_token LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'kind','friend','id',f.id,'status',f.status,
      'owner_label',f.owner_label,'recipient_matches_me',auth.uid()=f.addressee_id);
  END IF;
  -- 1) subscription token?
  SELECT
    ps.id, ps.status, ps.owner_id,
    p.username AS owner_label,
    ps.subscriber_user_id, ps.subscriber_email, ps.opened_at
  INTO s
  FROM public.poll_subscriptions ps
  LEFT JOIN public.profiles p ON p.id = ps.owner_id
  WHERE ps.token = p_token LIMIT 1;

  IF found THEN
    IF s.opened_at IS NULL THEN
      UPDATE public.poll_subscriptions SET opened_at = now() WHERE id = s.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'sub',
      'sub_id', s.id, 'status', s.status,
      'owner_id', s.owner_id, 'owner_label', s.owner_label,
      'subscriber_user_id', s.subscriber_user_id,
      'subscriber_email', s.subscriber_email
    );
  END IF;

  -- 2) task token?
  SELECT
    pt.id, pt.status, pt.owner_id,
    p.username AS owner_label,
    pt.recipient_user_id, pt.recipient_email,
    pt.game_id, g.name AS game_name,
    pt.poll_type, pt.share_key_poll, pt.opened_at,
    g.status::text AS game_status, g.share_key_poll AS game_key -- E11b
  INTO t
  FROM public.poll_tasks pt
  LEFT JOIN public.games g ON g.id = pt.game_id
  LEFT JOIN public.profiles p ON p.id = pt.owner_id
  WHERE pt.token = p_token LIMIT 1;

  IF found THEN
    -- E11b: zaproszenie ważne tylko przy bieżącym kluczu gry i otwartej ankiecie
    IF t.status IN ('pending', 'opened') THEN
      IF t.game_key IS NULL OR t.game_key <> t.share_key_poll
         OR t.game_status NOT IN ('poll_open', 'poll_stopped', 'ready') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'expired');
      ELSIF t.game_status = 'poll_stopped' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_stopped');
      ELSIF t.game_status = 'ready' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'poll_closed');
      END IF;
    END IF;
    -- E11b: tylko znacznik czasu, bez stanu pośredniego 'opened'
    IF t.opened_at IS NULL THEN
      UPDATE public.poll_tasks SET opened_at = now() WHERE id = t.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'task',
      'task_id', t.id, 'status', t.status,
      'owner_id', t.owner_id, 'owner_label', t.owner_label,
      'recipient_user_id', t.recipient_user_id,
      'recipient_email', t.recipient_email,
      'game_id', t.game_id, 'game_name', t.game_name,
      'poll_type', t.poll_type, 'share_key_poll', t.share_key_poll
    );
  END IF;

  -- 3) global unsub token?
  SELECT email, suppressed_at INTO u
  FROM public.email_unsub_tokens
  WHERE token = p_token LIMIT 1;

  IF found THEN
    RETURN jsonb_build_object(
      'ok', true, 'kind', 'unsub',
      'already_suppressed', (u.suppressed_at IS NOT NULL)
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
END;
$$;

CREATE OR REPLACE FUNCTION "public"."delete_user_everything"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_emails text[];
  v_email text;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- 312: e-maile konta (małymi literami) -- po nich czyścimy dane bez user_id
  select coalesce(array_agg(distinct e), array[]::text[]) into v_emails
  from (
    select lower(trim(u.email)) as e from auth.users u where u.id = p_user_id
    union
    select lower(trim(p.email)) from public.profiles p where p.id = p_user_id
  ) x
  where e is not null and e <> '';

  -- 312: usunięcie konta jest nadrzędne -- nie sprawdza blokad (edit_locks);
  -- blokady trzymane przez to konto i na jego zasobach znikają.
  delete from public.edit_locks where holder_user_id = p_user_id;
  delete from public.edit_locks
   where (resource_type = 'game' and resource_id in (select id from public.games where owner_id = p_user_id))
      or (resource_type = 'base' and resource_id in (select id from public.question_bases where owner_id = p_user_id))
      or (resource_type = 'logo' and resource_id in (select id from public.user_logos where user_id = p_user_id));

  -- 312: głosy w cudzych ankietach zostają anonimowe (bez powiązania z kontem);
  -- głosy w własnych grach znikają razem z grami niżej.
  update public.poll_text_entries set voter_user_id = null where voter_user_id = p_user_id;
  update public.poll_votes set voter_user_id = null where voter_user_id = p_user_id;

  delete from public.friendships where requester_id=p_user_id OR addressee_id=p_user_id;
  delete from public.shared_devices where recipient_id=p_user_id;

  delete from public.poll_subscriptions where subscriber_user_id = p_user_id;
  delete from public.poll_subscriptions where owner_id = p_user_id;

  delete from public.poll_tasks where recipient_user_id = p_user_id;
  delete from public.poll_tasks where owner_id = p_user_id;

  -- 312: zaproszenia do baz (po user_id i po e-mailu)
  delete from public.base_share_tasks where recipient_user_id = p_user_id;
  delete from public.base_share_tasks where owner_id = p_user_id;

  delete from public.question_base_shares where user_id = p_user_id;
  delete from public.question_bases where owner_id = p_user_id;

  -- 312: gry (maile ankietowe właściciela znikają niżej przez created_by)
  delete from public.shared_devices where game_id in (select id from public.games where owner_id = p_user_id);
  delete from public.games where owner_id = p_user_id;

  delete from public.user_flags where user_id = p_user_id;
  delete from public.user_logos where user_id = p_user_id;

  -- 312: wszystko powiązane z e-mailem konta
  delete from public.mail_queue where created_by = p_user_id;
  delete from public.mail_function_logs where actor_user_id = p_user_id;
  delete from public.email_intents where user_id = p_user_id;
  delete from public.contact_reports where user_id = p_user_id;
  delete from public.mail_cooldowns
   where position(p_user_id::text in target_key) > 0;

  foreach v_email in array v_emails loop
    delete from public.shared_devices where lower(trim(recipient_email))=v_email;
    delete from public.poll_subscriptions where lower(subscriber_email) = v_email;
    delete from public.poll_tasks where lower(recipient_email) = v_email;
    delete from public.base_share_tasks where lower(recipient_email) = v_email;
    delete from public.mail_queue where lower(trim(to_email)) = v_email;
    delete from public.mail_function_logs where lower(recipient_email) = v_email;
    delete from public.email_unsub_tokens where lower(email) = v_email;
    delete from public.email_intents where lower(email) = v_email;
    delete from public.email_cooldowns where email_hash = md5(v_email);
    delete from public.mail_cooldowns where position(md5(v_email) in target_key) > 0;
    delete from public.contact_reports where lower(email) = v_email;
  end loop;

  -- profile first (also cascades by FK from auth.users if still present)
  delete from public.profiles where id = p_user_id;

  -- final auth user hard delete
  delete from auth.users where id = p_user_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.poll_share_send(p_game_id uuid,p_friend_ids uuid[],p_subscriber_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_game public.games%rowtype; r record;
  v_target text; v_ok boolean; v_until timestamptz; v_id uuid; v_token uuid;
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
      WHERE p.id=ANY(coalesce(p_friend_ids,'{}'::uuid[])) AND public.are_friends(v_uid,p.id)
    UNION
    SELECT NULL::uuid,lower(trim(s.subscriber_email)) FROM public.poll_subscriptions s
      WHERE s.id=ANY(coalesce(p_subscriber_ids,'{}'::uuid[])) AND s.owner_id=v_uid
        AND s.subscriber_user_id IS NULL AND s.status='active'
        AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE lower(trim(p.email))=lower(trim(s.subscriber_email)) AND public.are_friends(v_uid,p.id))
  LOOP
    IF EXISTS(SELECT 1 FROM public.poll_tasks t WHERE t.owner_id=v_uid AND t.game_id=p_game_id
      AND t.share_key_poll=v_game.share_key_poll AND (t.recipient_user_id=r.user_id OR lower(trim(t.recipient_email))=r.email)) THEN
      v_kept:=v_kept+1; CONTINUE;
    END IF;
    v_target:='pair:'||v_uid::text||':'||coalesce(r.user_id::text,'email:'||md5(r.email))||':game:'||p_game_id::text;
    v_until:=public._poll_daily_cap_until(v_uid,r.email);
    SELECT ok INTO v_ok FROM public.mail_cooldown_check('poll:share',v_target);
    IF NOT v_ok OR v_until IS NOT NULL THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    SELECT ok INTO v_ok FROM public.mail_cooldown_reserve('poll:share',v_target);
    IF NOT v_ok THEN v_blocked:=v_blocked+1; CONTINUE; END IF;
    INSERT INTO public.poll_tasks(owner_id,recipient_user_id,recipient_email,game_id,poll_type,share_key_poll,token,status)
      VALUES(v_uid,r.user_id,CASE WHEN r.user_id IS NULL THEN r.email END,p_game_id,v_game.type::text,v_game.share_key_poll,gen_random_uuid(),'pending')
      RETURNING id,token INTO v_id,v_token;
    v_created:=v_created+1;
    v_mail:=v_mail||jsonb_build_array(jsonb_build_object('task_id',v_id,'to',r.email,'token',v_token,'link','go?t='||v_token::text));
  END LOOP;
  RETURN jsonb_build_object('ok',true,'created',v_created,'kept',v_kept,'blocked',v_blocked,'mail',v_mail);
END; $$;
REVOKE ALL ON FUNCTION public.subscribers_invite(text),public.subscribers_list(),public.poll_share_send(uuid,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.subscribers_invite(text),public.subscribers_list(),public.poll_share_send(uuid,uuid[],uuid[]) TO authenticated;

-- Sprzątanie testowej skrzynki bez konta, wyłącznie przez konta puli e2e.
CREATE OR REPLACE FUNCTION public.e2e_subscriber_email_cleanup(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_caller text; v_email text:=lower(trim(p_email));
BEGIN
  SELECT lower(email) INTO v_caller FROM auth.users WHERE id=v_uid;
  IF v_caller IS NULL OR v_caller !~ '^test[1-8]@familiada[.]online$'
    OR v_email <> 'test14@familiada.online' THEN
    RETURN jsonb_build_object('ok',false,'err','test accounts required');
  END IF;
  DELETE FROM public.poll_tasks WHERE owner_id=v_uid AND lower(recipient_email)=v_email;
  DELETE FROM public.poll_subscriptions WHERE owner_id=v_uid AND lower(subscriber_email)=v_email;
  DELETE FROM public.mail_cooldowns WHERE action_key LIKE 'poll:%'
    AND target_key LIKE 'pair:'||v_uid::text||':email:'||md5(v_email)||'%';
  DELETE FROM public.email_cooldowns WHERE email_hash=md5(v_email);
  RETURN jsonb_build_object('ok',true);
END; $$;
REVOKE ALL ON FUNCTION public.e2e_subscriber_email_cleanup(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.e2e_subscriber_email_cleanup(text) TO authenticated;

COMMIT;
